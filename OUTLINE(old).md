# Kabooks — Offline File Converter · Project Outline
### Windows · macOS (Apple Silicon & Intel) · Linux — one codebase

> **Working name:** *Kabooks* (from "spinning kabooks": a wheel that spins open when you drop a file). The name appears only in `package.json`, the window title and the installer config, so you can rename it later.
>
> **Companion document:** `PLAN.md` turns this outline into step-by-step build tasks for the implementing agent.

---

## 1. Pitch

Kabooks is a desktop app for **Windows, macOS and Linux**. It converts and edits **images, video, audio, PDFs, ebooks, plain text and subtitles entirely on your computer**.

The whole flow is one gesture:
1. Drag a file and press **Shift** (or drop it on the app).
2. A wheel of choices spins open.
3. Pick a slice.
4. The result is saved next to the original.

Inspiration: [Tangerine for Mac](https://tangerineformac.com), which is macOS-only. Kabooks brings the same idea to all three desktop platforms. §5 explains how close the Mac version can get to Tangerine.

---

## 2. Goals and non-goals

### Goals
| # | Goal | Measurable target |
|---|------|-------------------|
| G1 | **Fully offline** | Zero network requests at runtime. All engines, fonts, icons and OCR data are bundled. |
| G2 | **Any-to-any within the matrix** (§7) | Every pair in §7 passes the automated self-test **on every OS**. |
| G3 | **One-gesture UI** | Conversions with defaults need one drop and one click. Tools need at most one options card. |
| G4 | **Safe by default** | Originals are never modified or overwritten. Partial outputs never appear under final names. |
| G5 | **Fast** | Native engines (FFmpeg, libvips), plus hardware video encoding where available. The wheel appears ≤150 ms after a drop. |
| G6 | **Simple and elegant** | Soft neumorphic wheel, one orange accent, light/dark themes, calm motion, and each OS's native window chrome. |
| G7 | **Cross-platform parity** | The same features on Windows 10/11 x64, macOS 12+ (arm64 + x64) and Linux x64/arm64 (Ubuntu 22.04+, Fedora 38+, Debian 12+). Differences are limited to the native-integration rows in §4. |

### Non-goals (v1)
- Archives (ZIP/TAR/GZIP/RAR): **excluded, as you asked.**
- Cloud, accounts, telemetry, auto-update.
- Full editors (video timelines, PDF annotation).
- Office documents as *inputs* (DOCX→PDF is an optional extra, §15).
- Mobile apps. Windows on ARM (it can be added later the same way as Linux arm64).

---

## 3. Key decisions (with reasons)

| Area | Decision | Why |
|------|----------|-----|
| Platforms | **Windows, macOS, Linux from one TypeScript codebase.** OS-specific code lives in `src/main/integrations/` and one tiny Swift helper on macOS. | One app to maintain; the 27B agent only works in TypeScript, except for one small, fully-specified Swift file. |
| App shell | **Electron + TypeScript + React + Vite (electron-vite)** | Electron is mature on all three OSes. Chromium gives canvas, PDF printing, media playback and drag-and-drop everywhere, and it renders through **Metal on macOS**, DirectX on Windows and OpenGL/Vulkan on Linux. Tauri would mean three different webviews (WebKit/WebView2/WebKitGTK) with different PDF/printing and media capabilities, plus Rust. |
| Video & audio engine | **FFmpeg + FFprobe** static builds per OS:<br>• Windows: [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) essentials<br>• macOS & Linux: [Martin Riedl's signed builds](https://ffmpeg.martin-riedl.de/) (arm64 + x64) | Same FFmpeg major version and the same encoders (x264, x265, libvpx, opus, lame, vorbis…) on every OS, so every argument builder behaves identically. |
| Image engine | **sharp (libvips)**, `heic-decode` (HEIC input), FFmpeg (BMP), `imagetracerjs` (SVG tracing) | sharp ships prebuilt binaries for win32-x64, darwin-arm64/x64 and linux-x64/arm64. |
| HEIC output | macOS: built-in **`sips`**. Windows: optional `heif-enc.exe`. Linux: system `heif-enc` (`apt install libheif-examples`). | sharp's prebuilt libvips cannot encode HEVC (patents). Apple's own encoder is on every Mac. |
| PDF | **pdf.js** (read/render, in a hidden window) + **pdf-lib** (write/edit) | Pure JS, identical on every OS. |
| Word / EPUB | `docx`, own EPUB writer (JSZip), Chromium `printToPDF` | Pure JS / Chromium, identical on every OS. |
| OCR | **tesseract.js** + bundled `eng`/`vie` data | WASM, identical on every OS. |
| Global "drag + Shift" wheel | **macOS:** tiny Swift helper that watches the drag pasteboard + modifier keys. **Windows / Linux-X11:** `uiohook-napi`. **Wayland:** not possible (OS restriction); other entry points remain. | On macOS this shows the **real dragged file** (thumbnail + valid formats) *before* you drop, like Tangerine, and needs no Accessibility permission. Windows/Linux only reveal the file type until the drop. |
| Hardware video | macOS **VideoToolbox** (Apple media engine), Windows **NVENC / Quick Sync / AMF**, Linux **NVENC**. Auto-detected, with automatic CPU fallback. | Big speed-ups on Apple Silicon; always optional and verified with a 1-frame test encode. |
| Packaging | electron-builder:<br>• Windows NSIS + portable<br>• macOS DMG + ZIP (arm64 and x64, signed and notarized when an Apple Developer ID is available)<br>• Linux AppImage + .deb | Each OS is built on its own OS (GitHub Actions matrix provided). |

---

## 4. Platform parity

| Feature | Windows 10/11 | macOS 12+ | Linux |
|---|---|---|---|
| Drop on window, Browse…, all conversions & tools | ✓ | ✓ | ✓ |
| HEIC output | optional `heif-enc.exe` download | ✓ built-in (`sips`) | ✓ if `heif-enc` is installed |
| Global drag wheel | Shift / Shift+Alt — wheel shows formats by file type | **⇧ / ⇧⌥ — wheel shows the real file's thumbnail & formats while dragging** | X11: like Windows. Wayland: not available. |
| File-manager entry | **Send to** + right-click "Convert with Kabooks" | Finder **Open With**, drop on **Dock icon** | **Open With** (.desktop), Nautilus script, Dolphin service menu |
| Lives in the background | system tray | **menu bar** (Dock icon optional) | tray (where the desktop supports it) |
| Start at login | ✓ | ✓ | ✓ (`~/.config/autostart`) |
| Hardware video encoding | NVENC / QSV / AMF | VideoToolbox | NVENC |
| Native window chrome | hidden title bar + caption buttons overlay | inset traffic lights, optional vibrancy (frosted panels), template menu-bar icon | native frame |
| Notifications | ✓ | ✓ | ✓ (libnotify) |
| Installer | NSIS (per-user) + portable .exe | DMG + ZIP per architecture | AppImage + .deb |

Labels adapt per OS:
- "Alt" becomes "Option ⌥" on macOS.
- "Show in folder" becomes "Show in Explorer", "Show in Finder" or "Show in folder".
- Keycaps match the OS (⇧ shift + ⌥ option on Mac, as in your `clean UI.png`).

---

## 5. On macOS: can Kabooks be as elegant as Tangerine?

**Short answer: yes for the gesture and the look; not quite for footprint and a few native details.**

### What will feel the same
- **The gesture.** Drag a file in Finder and press **⇧** (convert) or **⇧⌥** (tools). The wheel appears under the cursor **with the dragged file's thumbnail and its valid formats before you drop**, exactly like `shortcut-open-choose-crop.png`. Drop on a slice and it's done.
  - This is done by a ~150-line Swift helper (`kabooks-drag-helper`). It polls the macOS drag pasteboard, the modifier keys and the mouse button.
  - It uses public AppKit APIs. **No Accessibility or Input Monitoring permission** is needed (a key-logging hook would need one).
- **The look.** The same wheel, Mac-style keycaps (⇧ shift, ⌥ option), inset traffic lights, a template menu-bar icon, and optional native frosted (vibrancy) panels.
- **It lives in the menu bar** and can hide its Dock icon. Finder "Open With" and dropping onto the Dock icon also open the wheel.
- **Native engines where Apple has them:**
  - HEIC encoding through Apple's own `sips`.
  - H.264/HEVC encoding through **VideoToolbox**, the Apple Silicon media engine. That is the real hardware path for video; "Metal" is the GPU drawing API, and Chromium already draws Kabooks' UI with it.
  - libvips and FFmpeg run natively on arm64 (no Rosetta).

### Where a native Swift app like Tangerine is still ahead
| Aspect | Tangerine (native) | Kabooks (Electron) |
|---|---|---|
| App size | small (tens of MB) | ~300 MB installed (Chromium + FFmpeg + libvips) |
| Idle memory | low | ~150–250 MB while resident |
| First launch | instant | 1–2 s (afterwards it stays in the menu bar, so the wheel itself appears instantly) |
| Window behaviour | true `NSPanel` floating panels | Electron windows tuned to behave like panels; full-screen Spaces and Stage Manager need extra testing |
| Distribution | signed & notarized App Store app | signing + notarization needs an **Apple Developer ID ($99/year)**; without it, users right-click → Open the first time |

### Risk to watch
Apple announced (2025) that macOS will alert users when apps programmatically read the **general** pasteboard. It is not documented whether the **drag** pasteboard is included.
- If a future macOS starts prompting, the helper degrades gracefully: the wheel says "Drop to choose" and shows the formats right after the drop.
- The plan includes a manual test of this on the target macOS version.

### Verdict
For the experience in your screenshots, Kabooks on macOS can match Tangerine closely. The remaining gap is size and memory, the price of one cross-platform codebase that a 27B agent can build. If you later want a fully native Mac shell, the engines and UI design can stay. Only the Electron shell would be replaced, which is a separate project.

> **Practical note:** you develop on Windows. To *see* the Mac (and Linux) experience you need a Mac/Linux machine or a tester. The provided GitHub Actions workflow builds and self-tests all three automatically, but it cannot judge the feel of the drag gesture.

---

## 6. Interaction model

### 6.1 Entry points
| Entry | Windows | macOS | Linux |
|---|---|---|---|
| Drop on the main window / Browse… | ✓ | ✓ | ✓ |
| Global drag + modifier (opt-in) | ✓ | ✓ (best: real file preview while dragging) | X11 only |
| File manager | Send to → Kabooks; right-click → Convert with Kabooks (Win 11: "Show more options") | Finder → Open With → Kabooks; drop on Dock icon | Open With → Kabooks; Nautilus *Scripts → Convert with Kabooks*; Dolphin *Convert with Kabooks* |
| Command line | `Kabooks.exe file…` | `open -a Kabooks file…` | `kabooks file…` |

### 6.2 Two rings, chosen by modifier keys (like Tangerine)
| Gesture | Ring | Example |
|---|---|---|
| **Shift** while dragging, or a plain drop on the window | **Convert formats** | MP4 · MKV · WEBM · AVI · WMV · GIF · MP3 |
| **Shift + Alt** (macOS: **⇧ + ⌥ Option**) while dragging, or Alt/Option + drop on the window | **Advanced tools** | Compress · Trim · Crop · Speed · Mute · Snapshot · Split · Redact · Metadata |
| `Tab` inside the wheel | switch rings | |

### 6.3 Steps (matching your reference screenshots)
```
STEP 1 — Wheel                        STEP 2 — Options / tool card         STEP 3 — Progress        STEP 4 — Done
(shortcut-open-choose-crop.png)       (crop-options.png)

        ╭─────────╮                   ╭──────────────────────────────╮    ╭──────────────────╮   ╭──────────────────╮
   ╭────┤COMPRESS ├────╮              │ ‹      Crop Video         ×  │    │    ◜‾‾‾‾‾◝       │   │      ( ✓ )       │
 ╭─┤SPLIT╰─────────╯META├─╮           ├──────────────────────────────┤    │   (  42%  )      │   │  Saved geese.mp4 │
 │SNAP│  ╭───────╮  │MUTE│            │      ┌──────────────┐        │    │    ◟_____◞       │   │  −62% smaller    │
 ╰─┬──╯  │ CROP  │  ╰──┬─╯            │      │   preview    │ ⤢      │    │ Converting to MP4│   │ [Show in Finder] │
 │SPEED│ ╰───────╯ │TRIM│             │      └──────────────┘        │    │ geese.mov · 2/5  │   │      [Open]      │
   ╰────╮ ▓CROP▓ ╭────╯               │ Aspect ratio   [Freeform ⌄]  │    │     [Cancel]     │   ╰──────────────────╯
        ╰───────╯                     │ Reset             960×1152px │    ╰──────────────────╯
      Crop · geese.mp4                │ Width  ━━━━━━━━━━━━━●  100%  │
                                      │ Height ━━━━━━━━━━━━━●  100%  │
                                      │ ◁|  ●──────────────   |▷     │
                                      │ 0:00.00          0:05.41     │
                                      ├──────────────────────────────┤
                                      │                    [ Apply ] │
                                      ╰──────────────────────────────╯
```
- **Step 1, Wheel.**
  - Hovering a slice turns it orange.
  - The hub shows the file thumbnail and the hovered label, with a caption below.
  - Click or drop on a slice to choose.
- **Step 2, Card.** Only shown when a choice needs options:
  - every tool;
  - the conversions Image→SVG, Video→GIF, PDF→DOCX/EPUB, EPUB→PDF and TXT→PDF/JPG/PNG/SRT/VTT.
  - Defaults are pre-selected, so `Enter` applies straight away. `‹`/`Esc` goes back, `×` closes.
- **Step 3, Progress.** The card turns into a progress ring with Cancel.
- **Step 4, Done.** Offers Show in Finder/Explorer/folder and Open. It auto-dismisses after 6 s, and a system notification is sent if the overlay was dismissed earlier.

### 6.4 Keyboard
| Key | In wheel | In card |
|---|---|---|
| `←` `→` / `↑` `↓` | move highlight | — |
| `1`–`9` | pick slice N | — |
| `Enter` | apply | Apply |
| `Shift+Enter` / right-click slice | open options for "instant" formats too | — |
| `Tab` | Convert ⇄ Tools | focus order |
| `Esc` | close | back to wheel |
| macOS extras | `⌘,` Settings · `⌘W` close window · `⌘Q` quit | standard Edit shortcuts (⌘C/⌘V) in fields |

### 6.5 Multiple files
- The convert ring shows a format only if *every* file can become it. For example, video + audio → **MP3**. Files already in the target format are skipped, with a note.
- The tools ring needs one category. Multi-input tools (Join, Merge, Collage, Make PDF) appear with 2 or more files.
- Folders are expanded one level, up to 500 files.

### 6.6 Output rules
- **Destination:** the same folder as the source by default, or one fixed folder (Settings).
- **Naming:**
  - `photo.heic → photo.jpg`
  - `clip.mp4 → clip-trimmed.mp4`
  - name clash → `photo (1).jpg`
  - multi-file output → `report-pages/report-001.jpg`
- Engines write into a private temp folder first. Only successful jobs are moved into place.
- **Path comparisons follow each OS's rules:**
  - case-insensitive on Windows and default macOS volumes;
  - case-sensitive on Linux.

---

## 7. Format matrix (archives removed)

`→` = instant with defaults · `⚙` = Step-2 card with defaults pre-selected.

| Category | Inputs | Outputs | Engine | Notes |
|---|---|---|---|---|
| **Images** | JPG, PNG, WebP, HEIC, TIFF, SVG, AVIF, BMP | JPG, PNG, WebP, HEIC¹, TIFF, SVG ⚙, AVIF, BMP, **PDF**, **DOCX** | sharp · heic-decode · FFmpeg (BMP) · imagetracerjs · sips/heif-enc · pdf-lib · docx | Auto-rotates from EXIF. Alpha is flattened to white for JPG/BMP. |
| **Audio** | MP3, M4A, WAV, FLAC, OGG, Opus, AIFF, WMA | all 8 | FFmpeg | MP3 VBR q2, AAC 192k, Vorbis q5, Opus 128k, WMA 192k, PCM 16-bit |
| **Video** | MP4, MOV, MKV, WebM, AVI, WMV, GIF | MP4, MOV, MKV, WebM, AVI, WMV, GIF ⚙, **MP3** | FFmpeg (+ hardware H.264/HEVC when enabled) | **Smart remux:** streams that already fit are copied (instant, lossless). |
| **PDF** | PDF | DOCX ⚙, JPG, PNG, EPUB ⚙, TXT | pdf.js · pdf-lib · docx · EPUB writer · tesseract.js | All pages; images at 300 DPI. Scanned PDFs → OCR offered. |
| **EPUB** | EPUB ↔ PDF | PDF ⚙ / EPUB ⚙ | Chromium printToPDF · JSZip | "Adjustable text" (reflow) **or** "Preserved pages" (fixed layout) |
| **Text** | TXT (.md/.log/.csv as text) | PDF ⚙, JPG ⚙, PNG ⚙, SRT ⚙, VTT ⚙ | Chromium printToPDF · pdf.js | UTF-8 (UTF-16 BOM detected). Cross-platform font stacks. |
| **Subtitles** | SRT, VTT | SRT, VTT, TXT | pure TypeScript | Keeps `<i>`/`<b>`/`<u>` in SRT |

¹ **HEIC output:**
- **macOS:** always available, using Apple's built-in `sips`.
- **Windows:** needs the optional `heif-enc.exe`.
- **Linux:** uses `heif-enc` if it is installed (`sudo apt install libheif-examples` / `dnf install libheif-tools`).
- When no encoder exists, the HEIC slice is hidden. HEIC *input* works everywhere.

Aliases accepted as inputs: `jpeg/jfif → JPG`, `tif → TIFF`, `heif → HEIC`, `aif → AIFF`, `m4v → MP4`, `aac → audio`.

---

## 8. Advanced tools (Shift + Alt / ⇧⌥ ring)

★ = from your `features.md` · ☆ = suggested addition (lower priority)

### 8.1 Video
| Tool | What it does | Step-2 options | FFmpeg core |
|---|---|---|---|
| ★ Compress | Smaller file | Quality, Max resolution, Codec (H.264/H.265), optional Target size (MB), "Use hardware encoder" | `libx264 -crf` / VideoToolbox / NVENC…; two-pass for target size |
| ★ Join | Concatenate ≥2 clips | Reorder | concat demuxer copy, or normalize → concat |
| ★ Trim | Keep one range | Timeline handles; Fast (keyframe) / Precise | `-ss/-t` |
| ★ Split | Cut into parts | At times / N parts / Every X s | multiple trims |
| ★ Crop | Crop the frame | Drag box, aspect presets, W/H sliders, scrubber (like `crop-options.png`) | `crop=w:h:x:y` |
| ★ Speed | 0.25×–4× | Keep audio (pitch kept) / mute | `setpts` + `atempo` |
| ★ Mute | Remove audio | — (instant) | `-an -c:v copy` |
| ★ Snapshot | Save frame(s) | Scrub; PNG/JPG; every N s | `-frames:v 1` / `fps=1/N` |
| ★ Redact | Hide areas | Boxes: Blur / Pixelate / Black, optional time ranges | `gblur` / `scale` / `drawbox` + `overlay` |
| ★ Metadata | View / edit / remove | Title, Comment, Date…; Remove all | `-map_metadata`, `-metadata` |

### 8.2 Audio
| Tool | What it does | Options | FFmpeg core |
|---|---|---|---|
| ★ Compress | Lower bitrate | 64–256 kbps, format, mono | `-b:a` |
| ★ Normalize | Even loudness | −14 / −16 / −23 LUFS | two-pass `loudnorm` |
| ★ Trim | Keep a range | Waveform, fades | `-ss/-t`, `afade` |
| ★ Channels | Mono/stereo/L/R/swap | — | `-ac`, `pan` |
| ★ Visualize | Waveform PNG, spectrogram, waveform video | size, colours | `showwavespic`, `showspectrumpic`, `showwaves` |
| ★ Bleep | Censor ranges | Beep 1 kHz / silence | `volume=enable` + `sine` + `amix` |
| ★ Metadata | Tags + cover art | Title, Artist, Album… | `-metadata`, `attached_pic` |
| ☆ Join | Concatenate | Reorder | `concat` filter |

### 8.3 Images
| Tool | What it does | Options | Engine |
|---|---|---|---|
| ★ Compress | Smaller file | Quality with **live size estimate**, max side, format, strip metadata | sharp |
| ☆ Resize | Dimensions | % or px, lock aspect | sharp |
| ★ Crop | Crop / rotate / flip | Same crop UI as video + ⟲ ⟳ ⇋ ⇵ | sharp |
| ★ Edit | Exposure, contrast, brightness, saturation, warmth, hue, sharpen, blur, B&W/Sepia/Vintage/Vignette/Invert | live preview = same pipeline on a proxy; hold to compare | sharp |
| ★ Backdrop | Put the image on a background | Solid / Gradient / Blur, padding, corners, shadow, canvas aspect | sharp + SVG |
| ★ Redact | Hide parts permanently | Blur / Pixelate / Black; strips metadata | sharp |
| ★ Metadata | View EXIF, remove all, remove GPS, edit | — | exifr, lossless JPEG/PNG strip, piexifjs |
| ★ Collage | ≥2 images | Grid/Row/Column/Featured, gap, radius, width, fit, reorder | sharp |
| ★ Make PDF | Images → PDF | reorder, page size, margins, combine | pdf-lib |

### 8.4 PDF / documents
| Tool | What it does | Options | Engine |
|---|---|---|---|
| ★ Compress | Smaller PDF | Light/Balanced/Strong (re-encode JPEG images) / Max (pages → images) | pdf-lib + sharp (+ pdf.js) |
| ★ Merge | Combine | Reorder | pdf-lib |
| ★ Split | Split pages | Every page / every N / ranges / extract | pdf-lib |
| ★ Organize | Reorder / rotate / delete | Thumbnail grid (big overlay) | pdf.js + pdf-lib |
| ★ Pages → Images | Pages as images | PNG/JPG, 72–600 DPI, range | pdf.js |
| ★ OCR | Text from scans | languages, TXT or searchable PDF, range | tesseract.js |
| ★ Export to Word | PDF → DOCX | Editable / Exact look / OCR auto | pdf.js + docx |
| ★ Metadata | Title, Author… / remove all | — | pdf-lib |
| ★ Convert text file | — | covered by the Text row of the Convert ring | — |

### 8.5 Subtitles
| ☆ Shift timing | Move all cues ±N ms | offset | pure TS |

---

## 9. UI design system

### 9.1 Look & feel
Taken from your references:
- the soft, raised, light-grey wheel (`clean UI.png`);
- an orange active slice;
- rounded "petal" slices separated by hairline gaps;
- a calm, typographic formats page (`supported formats.png`).

### 9.2 Tokens
| Token | Light | Dark |
|---|---|---|
| `--bg` / `--surface` / `--surface-2` | `#F3F3F2` / `#FFFFFF` / `#F7F7F6` | `#161617` / `#1F1F21` / `#262628` |
| `--border` | `#E6E6E4` | `#313134` |
| `--text` / `--text-2` / `--text-3` | `#1F1F1F` / `#6B6B6B` / `#9A9A9A` | `#EDEDED` / `#A3A3A3` / `#6E6E6E` |
| `--accent` (+hover/press) | `#FF5A1F` (`#F04E12` / `#D9440C`) | same |
| `--wheel-base` / `--slice-top` / `--slice-bottom` | `#ECECEB` / `#FBFBFA` / `#EFEFED` | `#1C1C1E` / `#2E2E31` / `#262629` |
| Radii | 8 / 14 / 22 / 28 px | |

- **Typography:** Inter Variable, bundled locally, so it looks identical on every OS.
- **Icons:** lucide-react, bundled.

### 9.3 The wheel
- SVG, outer radius 160, hub 62, 6 px gaps.
- Rounded slices via the "shrink + round-joined stroke" trick.
- 2–12 slices; slice 0 at 12 o'clock.
- Hit-testing by angle (shared by mouse, drag-over and keyboard).
- 260 ms "spin-open" animation; respects reduced motion.

### 9.4 Cards
- Radius 28 with a large soft shadow.
- 56 px header (‹ title ×).
- Rows with a label on the left and the control on the right; orange sliders.
- Footer: Reset on the left, orange Apply on the right.
- **macOS option:** native vibrancy behind cards (frosted glass, as in `crop-options.png`).

### 9.5 Main window
```
┌─────────────────────────────────────────────────────────────── ─ □ × ┐   (macOS: ● ● ● on the left)
│  ◐ Kabooks            [ Convert ]  Formats   Settings                  │
│            Drop a file. Pick a slice.                                 │
│   Convert and edit images, video, audio, PDFs, ebooks and subtitles — │
│   offline, on this computer. Nothing is uploaded.                     │
│  ╭───────────────────────────────────────────────────────────────╮   │
│  ┆                ⬇  Drop files here  ·  [ Browse files… ]       ┆   │
│  ╰───────────────────────────────────────────────────────────────╯   │
│      ┌─────┐                         ┌─────┐   ┌─────┐               │
│      │ ⇧   │  Convert formats        │ ⇧   │ + │ ⌥ / │  Advanced tools│
│      │shift│                         │shift│   │ alt │               │
│      └─────┘                         └─────┘   └─────┘               │
│  Recent                                                               │
└───────────────────────────────────────────────────────────────────────┘
```
- **Window chrome per OS:**
  - Windows: hidden title bar with the native caption-button overlay.
  - macOS: hidden-inset title bar with traffic lights.
  - Linux: the native window frame.
- **Formats tab:** generated in the style of `supported formats.png` (always in sync with the engine).
- **Settings tab:** Output, Quality, Hardware video, OCR, Integrations (OS-specific rows), Appearance, About.

### 9.6 Accessibility
- Full keyboard path; `role="menu"` wheel; visible focus rings; reduced motion.
- A high-contrast accent (`#C2410C`) is available.

---

## 10. Architecture

```
┌──────────────────────────── MAIN PROCESS (Node + Electron) ───────────────────────────┐
│ lifecycle · single instance · tray/menu bar · app menu (macOS) · settings · capabilities│
│ IPC router ── JobQueue → Converter registry / Tool registry                            │
│ Engines: ffmpeg/ffprobe (per-OS static binaries) · sharp · pdf-lib · docx · JSZip      │
│          tesseract.js · imagetracerjs · heic-decode · sips | heif-enc                  │
│ Protocols: app:// (built UI)   kfile:// (allow-listed local files, HTTP Range)         │
│ Integrations (src/main/integrations/):                                                 │
│   all: argv/open-file · login item · tray · notifications                              │
│   win32: Send To · registry verb · uiohook drag   darwin: Swift drag helper · Dock ·   │
│   Open With · menu bar · vibrancy                 linux: .desktop · Nautilus · Dolphin │
│                                                   · autostart · uiohook (X11)          │
└───────┬───────────────────────────┬──────────────────────────────┬────────────────────┘
        │ IPC                       │ IPC                          │ IPC                ┌─────────────────────┐
  Main window (React)        Overlay window (React,           Engine window (hidden)    │ kabooks-drag-helper │
  Home/Formats/Settings      transparent, always-on-top):     pdf.js render/text         │ (macOS, Swift CLI,  │
                             Wheel → Card → Progress → Done   + temp print windows       │ JSON lines → main)  │
                                                                                         └─────────────────────┘
```
- **Registries make features additive:**
  - `shared/formats.ts` holds the matrix and the encoders each format needs;
  - `main/converters/*` implement each category;
  - `shared/tools.ts` holds tool metadata, `main/tools/*` the runners and `renderer/panels/*` the option cards;
  - the wheel, the Formats page and the self-test are generated from these.
- **Platform rule:**
  - only `src/main/integrations/*`, `paths.ts`, `capabilities.ts` and the window factories may branch on `process.platform`;
  - the renderer only adapts labels and CSS via `data-platform`.
- **Binaries live in `resources/bin/<platform>-<arch>/`:** `win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`.

### Folder layout (summary; full tree in PLAN.md §3)
```
kabooks (project root = this folder)
├─ OUTLINE.md, PLAN.md, PROGRESS.md
├─ resources/bin/<platform>-<arch>/   ffmpeg, ffprobe (+ heif-enc on win32, kabooks-drag-helper on darwin)
├─ resources/tessdata/                eng, vie
├─ native/mac/DragHelper.swift        the only non-TypeScript source
├─ scripts/                           fetch-binaries · build-mac-helper · copy-pdfjs-assets · make-icons · check-binaries
├─ build/                             icons, entitlements.mac.plist, installer.nsh
├─ .github/workflows/build.yml        Windows + macOS (arm64, x64) + Linux matrix
└─ src/{shared, main, preload, renderer}
```

---

## 11. Safety, privacy, offline guarantees
- Every `http(s)`/`ws(s)` request is cancelled (except the dev server during development).
- Strict CSP; popups and external navigation are blocked.
- No `shell: true`, ever. Binaries get argument arrays, so spaces, quotes and Unicode in paths are safe on every OS.
- Inputs are read-only. Outputs go to temp first and are then moved. Comparisons use OS-correct path casing.
- `dropEffect` is always `'copy'`, so Explorer/Finder/Nautilus never "move" (delete) the original.
- `kfile://` serves only allow-listed files. EPUB/HTML is rendered with JavaScript disabled and the network blocked.
- `contextIsolation`, `sandbox` and no `nodeIntegration` everywhere.
- The macOS helper only reads modifier/mouse state and the drag pasteboard. It records no keystrokes and needs no Accessibility permission.

## 12. Performance notes
- Two-phase inspection (instant wheel, then thumbnails and durations).
- Smart remux.
- Cached 480p proxies for unplayable media.
- 2 parallel jobs.
- Hardware encoders when verified (Apple media engine, NVENC/QSV/AMF).
- pdf.js renders one page at a time with a 120 MP cap.
- Native arm64 builds on Apple Silicon and Linux arm64.

## 13. Packaging & distribution
| OS | Artifacts | Approx. size | Notes |
|---|---|---|---|
| Windows x64 | NSIS installer (per-user) + portable .exe | ~130 MB download / ~350 MB installed | Unsigned → SmartScreen warning (code signing optional) |
| macOS arm64 / x64 | DMG + ZIP for each architecture | ~140 MB / ~330 MB | Ad-hoc signed by default (runs after right-click → Open). **Developer ID signing + notarization** recommended for a Tangerine-grade first launch. |
| Linux x64 / arm64 | AppImage + .deb | ~140 MB / ~330 MB | `.deb` installs the sandbox helper correctly. AppImage on Ubuntu 24.04+ may need an AppArmor profile or `--no-sandbox` (documented). |

- Each OS is built on its own OS. `.github/workflows/build.yml` runs typecheck, unit tests, the full self-test (Linux via `xvfb`) and packaging on `windows-latest`, `macos-14` (arm64), `macos-13` (x64) and `ubuntu-22.04`.
- **Licences:** the FFmpeg builds used are GPL (x264/x265). That is fine personally. Before public distribution, ship the notices + source offer or switch to LGPL builds. See PLAN.md Task 13.3.

---

## 14. Review of your notes and references
| Your note | Verdict | What we do |
|---|---|---|
| "Images – maybe use ffmpeg?" | **Partly.** | sharp/libvips for images on all OSes (faster, colour-managed, EXIF-aware). FFmpeg for BMP and everything video/audio. |
| [`wasm-image-converter`](https://github.com/kopytjuk/wasm-image-converter) | C++/Boost.GIL → WASM demo, **PNG↔JPG only**. | Same "local only" idea, but we use native libvips (much faster, more formats) on each OS. |
| "Video – maybe use ffmpeg?" | **Yes.** | FFmpeg on all three OSes, plus hardware encoders where available. |
| Audio list | **Yes.** | All via FFmpeg; two-pass loudnorm; bleep mixes a 1 kHz tone. |
| [`open-pdf-studio`](https://github.com/OpenAEC-Foundation/open-pdf-studio) | Tauri 2 + SolidJS + PDFium + PDF.js + pdf-lib (LGPL). | We borrow the "pdf.js reads, pdf-lib writes" split and the page-organizer idea, and skip PDFium (per-OS native builds). |
| "Export to Word" | Feasible with expectations set. | Editable (reflow) / Exact look (page images); OCR for scans. |
| "Add a background" | Ambiguous. | A backdrop/frame tool (solid/gradient/blur + padding, corners, shadow). AI removal is a later idea. |
| Cross-platform with Mac | **Yes.** | §4 parity table and §5 Tangerine comparison. |

## 15. Suggested additions (after v1)
- ☆ Image Resize, ☆ Audio Join and ☆ Subtitle Shift are already in the plan.
- DOCX → PDF via `mammoth` + `printToPDF`.
- Presets: "Instagram 1080×1350", "WhatsApp video < 16 MB"…
- Watch folder; burn subtitles into video; AI background removal (ONNX).
- **macOS:** Finder Quick Action ("Convert with Kabooks" in Finder's right-click → Quick Actions) and a Share-menu extension. These need small native bundles; they are deferred.
- **Linux:** Nemo/Thunar actions; Flatpak packaging.
- Windows on ARM build.

## 16. Risks & mitigations
| Risk | Mitigation |
|---|---|
| PDF→DOCX/EPUB reflow quality varies | Two modes, honest labels, OCR; heuristics are unit-tested pure functions |
| HEIC encoding availability differs per OS | Capability detection; macOS always works; clear hint elsewhere |
| macOS pasteboard-privacy changes may affect drag-content reading | The helper degrades to "Drop to choose"; manual test on the target macOS |
| Wayland blocks global input hooks | Global wheel disabled with an explanation; window drop + file-manager entries remain |
| Linux transparent windows need a compositor | `enable-transparent-visuals` switch; documented fallback |
| Linux sandbox (AppArmor on Ubuntu 24.04+) | `.deb` target; AppImage note + troubleshooting |
| Gatekeeper on macOS without Developer ID | Ad-hoc signing + "right-click → Open" note; notarization steps documented |
| Small model drifts from plan | Strict per-task file lists, typed contracts, unit tests, `npm run selftest` on every OS in CI |
| You can't test Mac/Linux locally | CI matrix builds + self-tests; manual checklist for a Mac/Linux tester |
| GPL FFmpeg obligations | Notices file + LGPL option before public release |

## 17. Milestones
| Milestone | Result |
|---|---|
| **M0** Scaffold | Empty window opens on your OS; tests run |
| **M1** First spin | Drop → wheel → convert → Done (on your OS) |
| **M2** Full matrix | Every format pair; `npm run selftest` green |
| **M3** Video & audio tools | All ★ tools in §8.1–8.2 |
| **M4** Image tools | All ★ tools in §8.3 |
| **M5** PDF tools | All ★ tools in §8.4 |
| **M6** Desktop integration | Windows (Send to, right-click, tray), macOS (drag helper, Dock/Open With, menu bar), Linux (Open With, Nautilus/Dolphin, autostart), global wheel |
| **M7** Ship on 3 OSes | CI builds + self-tests green on Windows, macOS arm64/x64, Linux; installers tested offline |

## 18. Open questions (defaults already chosen)
1. **App name:** "Kabooks"? (default yes)
2. **Accent:** `#FF5A1F`? (default yes)
3. **Global drag wheel:** off by default (opt-in)? (default yes)
4. **OCR languages:** English + Vietnamese? (default yes)
5. **Apple Developer ID** for signing and notarization? (default: not yet; ad-hoc builds)
6. **Linux targets:** Ubuntu/Debian (.deb) + AppImage? Add Fedora .rpm or Flatpak? (default: .deb + AppImage)
7. **macOS Dock icon:** show by default, or menu-bar-only like many utilities? (default: show; toggle in Settings)
