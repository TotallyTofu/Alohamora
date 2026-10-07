# Alohamora rewrite: Electron → Rust + Tauri 2 · Outline

> **Status:** revision 2 · written 2026-10-07 against `master` @ `2a23791`, revised the same day after `rewrite/PLAN.md`
> was written and its code compiled and run. **Where this outline and `rewrite/PLAN.md` disagree, PLAN.md wins**; the
> "Revision 2" section below lists every decision that changed.
> **Audience:** the owner, and the agent that implements `rewrite/PLAN.md`.
> **Companion documents (still valid):**
> - `OUTLINE.md` is the product spec: interaction, format matrix, tools and UI design (§6–§9). This rewrite does not change it.
> - `PLAN.md`: Appendix A (FFmpeg cookbook), Appendix B (EPUB templates) and Appendix C (error catalogue) still apply.
> - `PROGRESS.md` records what was verified on which OS.
>
> **Legend used below:**
> - ✅ verified on 2026-10-07 against source code or a package registry.
> - 🔬 needs a spike before it is relied on (see §13.0).
> - ⚠️ known gap against the Electron build, with a documented fallback.

## Revision 2 — decisions made while writing and validating PLAN.md

The owner added two requirements after this outline was written, and building the code for `rewrite/PLAN.md` settled most
spikes. The rest of this document is kept for its reasoning; read it with this table in mind.

**New owner decisions**

| # | Decision | Consequences |
|---|---|---|
| D8 | **EPUB → PDF is removed.** PDF → EPUB stays. | EPUB is an output-only format of the PDF category, like DOCX (`FORMATS.epub = { category: 'pdf', input: false }`; the `'epub'` category is gone). No EPUB reader, no print windows, no `epubprint://` scheme, no EPUB thumbnails, no EPUB file association. The self-test has **121** cases (the two `convert.epub.*-pdf` cases are gone). Spike S1 shrinks to "Typst for TXT → PDF", which is done. |
| D9 | **Fully offline, enforced.** | Nothing at run time may open a network connection. Enforced by: no HTTP/TLS client crate among the runtime dependencies on any desktop target, no socket APIs in our code, no network APIs or remote URLs in the UI, a strict CSP — all checked by `scripts/check-offline.mjs` — plus WebView2 switches that turn off SmartScreen, component updates and pings (`WEBVIEW2_ARGS`), Typst without its `packages` feature, OCR data only from the bundled `tessdata/`, the WebView2 **offline installer** in the NSIS setup, and the self-test run with networking removed (`unshare -rn`) in CI. Downloads happen only at build time (PLAN.md §3). |

**Design changes against this outline** (all compiled and tested; see PLAN.md for the code)

| Topic | This outline said | Final design | Sections superseded |
|---|---|---|---|
| Engine concurrency | tokio runtime, `async` commands, `CancellationToken`, `tokio::process` | The engine is **synchronous**: one plain thread per running job, a shared `CancelToken` flag, `std::process` with kill on cancel. Tauri commands wrap blocking work in `spawn_blocking`. No tokio in the engine. | §5.4, §4.3 (`child_process` row) |
| PDFium | one actor thread with channels and timeouts | One global `Pdfium` (`OnceLock`); the `thread_safe` feature serialises every call behind a mutex, so any job thread can use it. | §5.4, §7.15 |
| PDF page operations | lopdf merge/split/organize, PDFium import as fallback | **PDFium page import** (`copy_pages_from_document`) for merge, split, organize and "remove all metadata"; **lopdf** for creating PDFs, the Info dictionary and image recompression. | §7.16 |
| HEIC / AVIF input | `libheif-rs` (dynamic), AVIF via FFmpeg or dav1d | **Both decoded by the bundled FFmpeg** (PNG through a pipe). Requires **FFmpeg 7.1+** (tiled iPhone HEIC); `check-binaries` enforces it. No libheif in the app. | §7.14, §4.3, Q3, Q4 |
| HEIC output | `sips` / `heif-enc` | Unchanged, but `heif-enc` counts only if `--list-encoders` shows an HEVC encoder. | §7.3 |
| Image crates | `fast_image_resize`, `smartcrop2`, `quantette`, `moxcms`, `little_exif` | `image` 0.25 resize; collage cover = **centre crop**; PNG palette = `color_quant` (NeuQuant); EXIF = `kamadak-exif` + `img-parts` with our own IFD rebuild; **no colour-management transform** (ICC profiles are carried over to JPEG/PNG/WebP). | §7.14, §4.3, Q5 |
| Text → PDF | Typst for TXT; native webview print for EPUB | **Typst only** (`typst-as-lib` 0.16 without `packages`, `typst-pdf` 0.15), bundled Noto fonts + system fonts. No `Printer` trait, no print window. | §7.17, §5.1, §5.3, Q2 |
| OCR searchable PDF | Tesseract's PDF renderer | **Our own text layer**: Tesseract TSV word boxes → invisible text (render mode 3, Tesseract's glyphless font, ToUnicode map) over the page JPEG. `tesseract-rs` builds Leptonica without zlib and Tesseract's PDF renderer crashes. | §7.18 |
| OCR "no data" message | `No OCR language data found. Run "npm run fetch-binaries".` | `No OCR language data found. Reinstall Alohamora.` (installed apps have no npm). | §7.18, Appendix D |
| DOCX | try `docx-rs` first | **Our own small writer** (zip + XML; Heading1–3 styles, numbering, sections). | §7.19, Q6 |
| EPUB | reader + writer | **Writer only** (reflowable and fixed layout). | §7.20 |
| TS ↔ Rust types | `ts-rs` generates TypeScript from Rust | No code generation for types: `core/src/types.rs` mirrors `types.ts` by hand (camelCase serde). The **data tables stay in TypeScript** and `scripts/gen-registry.mjs` writes `src/shared/registry/*.json` from them (Node 22.18+ type stripping); Rust embeds the JSON; CI runs `gen:registry --check`. | §5.5, Q7 |
| Licence/offline tooling | `cargo-deny` | `scripts/check-licenses.mjs` (writes `THIRD_PARTY_CRATES.md`; MPL allowed, GPL/LGPL/AGPL rejected) and `scripts/check-offline.mjs`. | §9, §12.7 |
| Offline proof in CI | `strace -e connect` | The self-test runs under `unshare -rn` (no network namespace) on Linux CI. | §9 |
| WebView2 | `IsReputationCheckingRequired = false` | Browser arguments on every window: `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-networking --disable-component-update --no-pings --disable-domain-reliability`; installer embeds the **offline** WebView2 runtime. | §9, §12.4 |
| macOS PDFium | resource | Shipped as a **framework** (`Contents/Frameworks/libpdfium.dylib`) so it is signed and notarized with the app; entitlement `disable-library-validation` only. | §12.3–12.5 |
| Build prerequisites | — | **CMake 3.20+ and NASM 2.15+** (Tesseract/Leptonica, mozjpeg, rav1e); Rust pinned to **1.97.0**; debug builds optimise dependencies (`[profile.dev.package."*"] opt-level = 2`). | §12.1 |
| Phases | P1–P10 | PLAN.md uses its own phases 0–10: UI first (Phase 1), then core, engine, self-test, app, packaging. | §13.1 |

**Spike outcomes** (S1–S9 in §13.0)

| Spike | Outcome |
|---|---|
| S1 | Done for TXT → PDF with Typst (the self-test text includes Vietnamese). The EPUB part is void (D8). |
| S2 | Implemented (`SW_SHOWNOACTIVATE`, `orderFrontRegardless` at the pop-up level on all Spaces); **still to verify by hand** on Windows and macOS, including mixed-DPI monitors (PLAN.md Appendix F). |
| S3 | `kfile` protocol with Range support and proxies for unplayable codecs implemented (Range parsing unit-tested). Playback and seeking in each web view are **still to verify by hand** (PLAN.md Task 8.9, Appendix G). |
| S4 | Passed in the self-test: page sizes, rendering at DPI, `doc.pdf` → TXT/DOCX/EPUB through the reflow, merge/split/organize via PDFium import, lopdf metadata and recompression. A side-by-side review against the Electron output on real-world PDFs is still open. |
| S5 | Passed: every image self-test case. CMYK/wide-gamut colour conversion is not done (see the table above). |
| S6 | Passed on Linux with the static `tesseract-rs` build; searchable PDF via our own text layer. |
| S7 | Implemented with pointer events; verify on Windows by hand. |
| S8 | Implemented (60 Hz poller, Windows + X11); verify by hand. |
| S9 | Not measured yet (Phase 10). The Linux release `.deb` is 178 MB, most of it FFmpeg. |

**Validation status.** On Linux x86-64: all Rust unit tests and Clippy clean; the self-test 119 passed / 0 failed /
2 skipped (machine-dependent) through the debug app, the release `.deb` layout and with networking removed; the UI
type-checks, its 122 tests pass and it builds; the app opened its windows under X11 (Xvfb) and converted a file through the wheel. Windows-
and macOS-only modules were type-checked in isolation; everything else on those OSes is a manual check (PLAN.md Phase 10).

---

## 0. How to use this document

1. **Behaviour is not redesigned.** Only the technology underneath changes. Where this outline is silent, the current TypeScript code is the specification. Appendix A names the TypeScript file that each Rust module replaces.
2. **Deliberate changes are labelled** "Deliberate change" in the text. Any other behaviour difference is a bug in the port.
3. **The plan agent should:**
   1. Turn §13 into numbered tasks, each with a file list, acceptance checks and the self-test groups it must turn green.
   2. Schedule the spikes in §13.0 first.
   3. Write each spike's outcome back into §15, the decision table.
4. **Safety rules (Appendix C) are never relaxed.** This includes never moving or overwriting an original, never using a shell, and keeping the app offline.
5. **Exact strings matter.** The self-test matches user-facing messages with regexes (Appendix D), so messages are ported byte for byte.

---

## 1. Summary

**Rewritten in Rust**
- The Electron main process: Node, about 4,600 lines in `src/main`.
- The roughly 1,400 lines of `src/shared` logic that the main process uses.

**Kept**
- The React UI in `src/renderer`: about 4,200 lines of TS/TSX plus 450 lines of CSS.
- A small shim reimplements `window.alohamora` on top of Tauri commands and events.
- A short, complete list of UI edits (§6.3) covers the places where Electron behaviour leaked into the UI: file-drop paths, title-bar dragging, Windows caption buttons and internal drag-to-reorder.

**Removed**

| Removed | Replaced by |
|---|---|
| Chromium + Node runtime | System webviews |
| Hidden pdf.js "engine" window | pdfium |
| Temporary print windows | Typst (TXT → PDF); EPUB → PDF is removed (D8) |
| sharp/libvips | Rust image codecs |
| tesseract.js WASM | Native Tesseract |
| uiohook-napi | A small input-state poller |

**Kept unchanged**
- FFmpeg/FFprobe sidecars, using the same builds.
- The macOS Swift drag helper.
- HEIC output via `sips` or `heif-enc`.
- Every format, tool and OS integration.
- The self-test, under the same case names: 121 cases (123 minus the two removed EPUB → PDF cases).

**Expected result**
- **Size:** the installed app drops from about 537 MB to an estimated 170–220 MB. FFmpeg then makes up 60–70% of the app; slimming it is a later lever (§10.3).
- **Memory:** there is no Node/Chromium main process and no hidden engine window. The target is at most half of today's idle footprint, measured by §10.4.

---

## 2. Decisions already made

| # | Decision | Notes |
|---|---|---|
| D1 | **Rust + Tauri 2** (2.12.x, wry 0.57) | Go + Wails was considered; see Appendix E. |
| D2 | **Keep the React/TypeScript UI** | Only the edits in §6.3. |
| D3 | **Full feature parity, with gaps documented** | Every ⚠️ gap names a fallback and an acceptance bar (§14). |
| D4 | **Signing and notarization are in scope** | macOS Developer ID + notarization, and Windows Authenticode (§12.5). |
| D5 | **Out of scope** | Mac App Store, Windows on ARM, a custom slim FFmpeg build, auto-update. |
| D6 | **Location of the docs** | `rewrite/OUTLINE.md`, plus the future `rewrite/PLAN.md` and `rewrite/PROGRESS.md`. The root `OUTLINE.md` stays as the Electron design. |
| D7 | **Port in place** | Work happens in the same repo. The Electron build keeps working until cutover (§13, P10), so both shells can run the same UI side by side. *(Revision 2: PLAN.md removes the Electron code in its Phase 1 and tags the last Electron commit `electron-last`.)* |
| D8 | **EPUB → PDF is removed** (added in revision 2) | See "Revision 2". PDF → EPUB stays. |
| D9 | **Fully offline, enforced** (added in revision 2) | See "Revision 2" and PLAN.md §3. |

---

## 3. Goals, non-goals, budgets

### 3.1 Goals

| # | Goal |
|---|---|
| R1 | Smaller download and smaller installed size. |
| R2 | Lower memory when idle in the tray and while working. |
| R3 | **Parity on every platform.** Every row of `OUTLINE.md` §4, §7 and §8 works on Windows 10/11 x64, macOS 12+ (arm64 and x64) and Linux x64. Linux arm64 is included where CI allows: `fetch-binaries` already supports it, but no CI job exists for it today. |
| R4 | **Offline guarantee unchanged.** The app makes no network requests at runtime (§9). |
| R5 | Safety rules unchanged (Appendix C). |
| R6 | The wheel appears within 150 ms of a drop, with the overlay pre-warmed. |
| R7 | Pure logic lives in a Tauri-free Rust crate with unit tests and cross-language golden tests (§11). |

### 3.2 Non-goals

- New features or a UI redesign.
- Archive support.
- Mobile apps.
- Mac App Store distribution.
- Auto-update.
- Windows on ARM.
- A custom or slimmed FFmpeg build.

### 3.3 Budgets

These are checked at the final milestone using the measurement harness in §10.4.

| Metric | Electron baseline | Target for the Tauri build |
|---|---|---|
| Installed size, macOS arm64 | **537 MB.** Reported by an earlier session: Electron 286 + FFmpeg/FFprobe 126 + tesseract core 44 + libvips 18 + rest. Re-measure in S9. | **≤ 220 MB** |
| Installed size, Windows x64 | Measure in S9. The NSIS installer download was about 192 MB. | **≤ 220 MB** |
| Installed size, Linux .deb (excluding system WebKitGTK) | Measure in S9 | **≤ 210 MB** |
| Download (DMG / NSIS installer) | DMG about 229 MB; NSIS about 192 MB | **≤ 110 MB** |
| Idle RAM: whole process tree, in the tray, no window visible, overlay pre-warmed | Measure in S9 | **≤ 50% of baseline** |
| RAM with the main window open and idle | Measure in S9 | **≤ 60% of baseline** |
| Peak RAM: 12 MP JPG → WebP, and a 100-page PDF → PNG at 300 DPI | Measure in S9 | ≤ baseline |
| Cold start to tray | Measure in S9 | ≤ baseline |
| Wheel visible after a drop (warm) | About 2–3 ms for `openOverlay` (PROGRESS 12.x) | ≤ 150 ms end to end |
| Self-test | macOS: 122 pass / 0 fail / 1 skip. Windows: 121 / 0 / 2. | **The same pass count per OS** |

---

## 4. The current app in numbers

### 4.1 Code (tracked files)

| Area | Lines | What happens to it |
|---|---|---|
| `src/main`, excluding tests and the self-test | 4,589 | Rewritten in Rust (Appendix A). |
| `src/main/selftest` | 958 | Rewritten in Rust, keeping the same case names, groups and report format. |
| `src/shared`, excluding tests | 1,399 | The logic the backend needs is ported to Rust. Everything the UI needs stays in TypeScript, with a single source of truth for data (§5.5). |
| `src/preload` | about 60 | Replaced by the shim (§6.1). |
| `src/renderer`, TS/TSX | 4,219 | **Kept.** The `engine/` folder (about 140 lines, pdf.js) is deleted. |
| `src/renderer`, CSS | 453 | Kept. Only the title-bar rules change. |
| Tests | 1,621 lines in 23 files (about 190 tests) | The `src/main` tests move to Rust. The `src/shared` tests stay in vitest and also feed golden vectors to Rust. The 2 renderer tests stay. |
| `native/mac/DragHelper.swift` | 60 | **Unchanged.** |
| `scripts/*.mjs` | 6 files | `fetch-binaries`, `check-binaries`, `build-mac-helper` and `make-icons` are adapted. `copy-pdfjs-assets` and `asar-unpack-list` are dropped. |

### 4.2 Process model today

**Electron main process (Node)**
- sharp/libvips
- pdf-lib
- tesseract.js worker threads
- jobs, IPC, protocols and integrations

**Chromium processes**
- the GPU process
- **3 renderers:** the main window, the transparent overlay, and a hidden "engine" window running pdf.js
- one temporary hidden `BrowserWindow` for every `printToPDF` call

**Child processes**
- `ffmpeg` / `ffprobe`, one per job step
- `alohamora-drag-helper` on macOS, while the global drag wheel is on
- `sips` / `heif-enc` for HEIC output

### 4.3 Runtime dependencies and their replacements

*(Revision 2: see the "Revision 2" table for what changed. The final crates and versions are in PLAN.md §2 and
`rewrite/Cargo.lock`.)*

| Today | Role | Rust replacement (version checked on crates.io, 2026-10-07) | Status |
|---|---|---|---|
| `electron` 44 | Shell | `tauri` 2.12.1, `wry` 0.57.0 | ✅ |
| `sharp` / libvips | Image decode, encode and operations | `image` 0.25.10, `fast_image_resize` 6.1, `mozjpeg` 0.10, `webp` 0.3 (libwebp), `ravif` 0.13, `resvg` 0.48, `moxcms` 0.9 (ICC), `quantette` 0.6 (PNG palette). The libvips crate 2.3 is the fallback. | 🔬 S5 |
| `heic-decode` | HEIC input | `libheif-rs` 3.0 (feature `embedded-libheif`; dynamic linking for LGPL). `sips` is an option on macOS. | 🔬 S5 |
| `imagetracerjs` | Raster → SVG trace | `vtracer` 0.6.5 | ⚠️ A different algorithm, so outputs differ visually. Accepted. |
| `exifr` | EXIF read | `kamadak-exif` 0.6 (BSD-2) | ✅ |
| `piexifjs` | JPEG EXIF write | `little_exif` 0.6, or `img-parts` 0.4 plus our own IFD writer | 🔬 S5 |
| `pdfjs-dist` (engine window) | Render, text extraction, thumbnails | `pdfium-render` 0.9.4 with a bundled pdfium (bblanchon/pdfium-binaries) | ✅ crate. 🔬 text-item parity (S4). |
| `pdf-lib` | Merge, split, organize, metadata, create, image recompression | `lopdf` 0.45. `pdf-writer` 0.15 / `krilla` 0.8 are optional helpers for creating PDFs. | 🔬 S4 (merge robustness) |
| `docx` | DOCX writer | `docx-rs` 0.4.22, or our own minimal writer using `zip` + XML templates | 🔬 §7.19 |
| `jszip`, `fast-xml-parser` | EPUB read and write | `zip` 8.6, `quick-xml` 0.42 | ✅ |
| Chromium `printToPDF` | HTML/text → PDF | `typst` 0.15.1 for TXT. Native webview print per OS for EPUB, with Typst as the fallback. | 🔬 **S1, the highest risk** |
| `tesseract.js` 7 (WASM) | OCR | `tesseract-rs` 0.4 (features `build-tesseract`: static Tesseract 5.5 + Leptonica) | 🔬 S6 |
| `uiohook-napi` | Global "drag + Shift" on Windows and X11 | A 60 Hz input-state poller using Win32 `GetAsyncKeyState`/`GetCursorPos` and X11 `QueryPointer` via `x11rb` 0.14. This is the same design as the Swift helper. | 🔬 S8 |
| Node `child_process` | Sidecars | `tokio::process` | ✅ |
| Electron `Tray`, `Menu`, `Notification`, `dialog`, `shell`, single instance, login item | OS integration | Tauri's built-in tray and menu, plus the plugins: `notification` 2.5, `dialog` 2.8, `opener` 2.7, `single-instance` 2.5, `autostart` 2.7, `log` 2.10 | ✅ |
| React, zustand, lucide-react, Inter | UI | Unchanged | — |

---

## 5. Target architecture

### 5.1 Process model

```
┌──────────────────────── alohamora (one Rust process) ─────────────────────────┐
│ Tauri app: lifecycle · single instance · tray / app menu · windows · settings  │
│ commands + events (IPC) · kfile:// protocol (allow-list, HTTP Range)           │
│ engine: JobQueue → converters / tools                                          │
│   images (Rust codecs) · PDF (pdfium actor thread + lopdf) · OCR (Tesseract)   │
│   DOCX · EPUB · text → PDF (Typst) · FFmpeg runner                             │
│ integrations: Send To · registry verb · Linux menus · autostart · migration    │
│   global-drag poller (Win/X11) · Swift helper bridge (macOS)                   │
└────┬───────────────┬───────────────────────────────────────┬───────────────────┘
     │ webview       │ webview                               │ child processes
 main window     overlay window                          ffmpeg / ffprobe (per step)
 React UI        React UI,                               alohamora-drag-helper (macOS)
 (lazy)          transparent,                            sips / heif-enc (HEIC output)
                 pre-warmed
```

*(Revision 2: the hidden print window is gone with EPUB → PDF (D8), and PDFium is called directly from job threads
instead of an actor thread.)*

**The webview runtime differs per OS:**

| OS | Webview | Notes |
|---|---|---|
| Windows | WebView2 | Chromium-based, evergreen, already installed on Windows 10/11. |
| macOS | WKWebView | — |
| Linux | WebKitGTK 4.1 | The version depends on the distribution. Media playback depends on the GStreamer plugins installed. |

### 5.2 Repository layout (target)

```
/
├─ OUTLINE.md, PLAN.md, PROGRESS.md      Electron-era docs (moved to docs/electron/ at cutover)
├─ rewrite/OUTLINE.md                    this file
├─ rewrite/PLAN.md, rewrite/PROGRESS.md  produced by the next agent
├─ vite.config.ts                        plain Vite for the renderer (replaces electron.vite.config.ts)
├─ src/renderer/                         UI (kept)
├─ src/shared/                           TS used by the UI
│  ├─ registry/*.json                    single source of truth for data tables (§5.5)
│  └─ generated/*.ts                     types generated from Rust by ts-rs (§5.5)
├─ src-tauri/
│  ├─ Cargo.toml                         workspace + app crate
│  ├─ build.rs
│  ├─ tauri.conf.json                    plus tauri.windows/macos/linux.conf.json overrides
│  ├─ capabilities/default.json          Tauri permissions (ACL)
│  ├─ binaries/                          sidecars named <name>-<target-triple>[.exe] (git-ignored, fetched)
│  ├─ resources/                         tessdata/, pdfium/, fonts/, THIRD_PARTY_NOTICES.md (fetched or generated)
│  ├─ icons/                             generated by `tauri icon` from build/icon.png
│  ├─ crates/core/                       pure logic: no I/O, no Tauri
│  ├─ crates/engine/                     I/O: sidecars, codecs, pdfium, OCR, jobs, self-test cases
│  └─ src/                               app crate: main.rs, commands, windows, protocols, integrations
├─ native/mac/DragHelper.swift           unchanged
└─ scripts/                              fetch-binaries, check-binaries, build-mac-helper, make-icons (adapted)
```

Node remains a **build-time** dependency (Vite, vitest, TypeScript, Tauri CLI). It is not shipped.

### 5.3 Crates and modules

| Crate | Depends on | Contents |
|---|---|---|
| `core` | serde, regex, encoding_rs | `types`; `registry` (formats, tools and defaults loaded from JSON); `naming`; `geometry`; `time`; `page_ranges`; `pdf_split`; `split`; `subtitles`; `text`; `pdf_reflow`; `edit_pipeline`; `collage_layout`; `ffmpeg_args::{common, video, audio}`; `ffmpeg_parse`; `image_meta` (lossless JPEG/PNG strip); `error` (AppError and the user-facing messages); `js` (JS-compatible number formatting, §7.8) |
| `engine` | core, tokio, codecs, pdfium-render, lopdf, tesseract-rs, typst | `paths` (a struct the app injects); `process`; `ffmpeg`; `capabilities`; `hw_video`; `settings`; `inspect`; `thumbnails`; `preview::{media, image}`; `metadata`; `image::{load, save, heic, svg, edit, background, collage, exif}`; `pdf::{actor, edit, compress, create}`; `ocr`; `docx`; `epub::{reader, writer, templates}`; `html_pdf::{typst, Printer trait}`; `jobs::{context, execute, queue}`; `convert::*`; `tools::*`; `selftest::{cases, fixtures, assert}` |
| `app` (the Tauri binary) | engine, tauri, plugins | `main`; `lifecycle`; `state`; `commands`; `events`; `protocol::{kfile, epubprint}`; `windows::{main, overlay, print}` (the print window implements `engine::html_pdf::Printer`); `integrations::{argv, menu, tray, dock, autostart, notify, migrate, global_drag::{macos, windows, x11}, windows_shell::{send_to, context_menu}, linux::{file_managers, autostart}}`; `housekeeping`; `logging`; `selftest` entry point |

*(Revision 2: the final module list is in PLAN.md §5 and Phases 3–8. There is no `html_pdf`, `epub::reader`,
`epubprint` protocol or print window, and the engine does not use tokio.)*

**Platform rule** (this replaces the Electron rule "only integrations branch on `process.platform`"): `cfg(target_os = …)` may appear only in:
- `app::integrations`
- `app::windows`
- `engine::paths`
- `engine::capabilities`
- `engine::hw_video`
- the native printers

### 5.4 Concurrency model

*(Revision 2: superseded. The engine is synchronous — one thread per job, a `CancelToken` flag, one global thread-safe
`Pdfium` — and only the Tauri commands use async, to move blocking work off the main thread.)*

- **Runtime:** Tauri's tokio multi-thread runtime. Commands are `async fn`.
- **CPU-heavy work** (decode, encode, resize, quantize, OCR, Typst compile, PDF rendering) runs in `spawn_blocking` or in a bounded rayon pool. It never runs on the main/UI thread.
- **pdfium:** one dedicated **PDF actor thread** owns the `Pdfium` instance.
  - Requests arrive over an mpsc channel and are answered with oneshot replies. This mirrors `callEngine`, including its 180 s default timeout and 600 s for thumbnails and text.
  - Documents open **from a path**. Today the whole file is copied into the renderer.
- **Tesseract:** one `TessBaseAPI` per OCR job, on a blocking thread. It is dropped when the job ends.
- **Cancellation:** one `tokio_util::sync::CancellationToken` per job replaces `AbortSignal`.
  - Child processes are killed (`kill_on_drop` plus an explicit `kill()`).
  - Loops call `ensure_not_cancelled()` wherever the TypeScript calls `throwIfAborted`.
- **Job concurrency:** `settings.maxConcurrentJobs` is read each time the queue pumps, as today.
- **Main-thread work** (window creation, native print operations, tray changes) goes through `AppHandle::run_on_main_thread`.

### 5.5 TS ↔ Rust contracts (one source of truth)

*(Revision 2: point 1 is kept with one change — the TypeScript files stay the source and `scripts/gen-registry.mjs`
writes the JSON. Point 2 is replaced: no `ts-rs`; `core/src/types.rs` mirrors `types.ts` by hand.)*

**The problem:** formats, tools, defaults and types are used by both the UI (TypeScript) and the backend (now Rust). Duplicating them would let the two sides drift.

1. **Data tables move to JSON** in `src/shared/registry/`:

   | File | Contents |
   |---|---|
   | `formats.json` | `FORMATS`, `CATEGORY_ORDER`, `CATEGORY_LABEL`, `CATEGORY_NOTE`, `CONVERT_TARGETS`, `REQUIRED_ENCODERS`, `OPTION_PAIRS` |
   | `tools.json` | `TOOLS` |
   | `defaults.json` | `DEFAULT_SETTINGS`, `DEFAULT_CONVERT_OPTIONS`, `TOOL_DEFAULTS`, `DEFAULT_EDIT` |

   - `formats.ts`, `tools.ts` and `toolOptions.ts` keep **the same exports**, now built from the JSON (`resolveJsonModule` is already on). **No UI import changes.**
   - Rust embeds the JSON with `include_str!` and parses it once with serde.
2. **Types are defined once, in Rust,** with `#[serde(rename_all = "camelCase")]`.
   - `ts-rs` 12 exports them to `src/shared/generated/`.
   - `types.ts`, `toolOptions.ts` and `ipc.ts` re-export them under the existing names.
   - String unions become Rust enums with exact serde names, for example `ToolId::VideoCompress` ↔ `"video.compress"` and `Fmt::Jpg` ↔ `"jpg"`.
   - `tauri-specta` is still a release candidate (2.0.0-rc.25), so it is **not** used. The hand-written `AlohamoraApi` interface stays the contract for the UI.
3. **Where functions live:**

   | Location | Modules |
   |---|---|
   | TypeScript only (UI) | `wheelItems` (`buildWheel`, `targetAvailable`, `needsOptions`), `geometry.dragRect`, sound and wheel geometry |
   | Rust only | `naming`, `pdfReflow` (the renderer imports only its types), `subtitles`, `text`, `editPipeline`, `collageLayout` |
   | Both | `geometry` (clamp, `toPixelRect`, `isFullRect`), `time`, `pageRanges`, `pdfSplit`, `split` |

   The modules that exist in both languages are kept in sync by golden vectors (§11.2).
4. **`withDefaults`:**
   - Rust shallow-merges `defaults.json[toolId] ← options` (a JSON object merge), then deserializes into the typed option struct.
   - It is **lenient per field**: an unknown key is ignored, and a wrongly typed key falls back to its default. This matches the spirit of the settings sanitizer.
   - Use `serde_json` with the `preserve_order` feature so that tag maps keep the user's order (§7.8).

---

## 6. The bridge: keeping the UI unchanged

### 6.1 The shim

**Today:** `src/renderer/src/lib/api.ts` is `export const api = window.alohamora` (set up by the preload).

**New:** `api` is built from `@tauri-apps/api`:
- `invoke` for requests.
- `getCurrentWebviewWindow().listen` for events. Using the per-window listener avoids ambiguity about which events reach which target.

During the transition the shim picks its backend at runtime: `'__TAURI_INTERNALS__' in window` means Tauri; otherwise it uses `window.alohamora` (Electron). The same UI then runs in both shells, which enables the differential tests in §11.4.

```ts
// sketch: src/renderer/src/lib/api.ts
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
const win = getCurrentWebviewWindow();
const on = <T,>(ev: string) => (cb: (p: T) => void) => { const p = win.listen<T>(ev, (e) => cb(e.payload)); return () => { void p.then((un) => un()); }; };
export const api: AlohamoraApi = {
  getCapabilities: () => invoke('get_capabilities'),
  inspectFiles: (paths, deep) => invoke('inspect_files', { paths, deep }),
  // … one line per method, see §6.2
  onJobUpdate: on<JobUpdate>('ev:job-update'),
};
```

**Calling conventions:**
- Tauri converts JavaScript camelCase argument keys to Rust snake_case parameters.
- Command errors return as a rejected promise carrying `{ message }`. Job errors keep travelling inside `JobUpdate`, as today.

### 6.2 Command and event map

| `AlohamoraApi` member | Tauri command or event | Replaces | Notes |
|---|---|---|---|
| `getCapabilities()` | `get_capabilities` | `ipc.ts` | — |
| `getSettings()` / `setSettings(patch)` | `get_settings` / `set_settings` | `settings.ts` | `set_settings` sanitizes, saves atomically, applies integrations and emits `ev:settings` to all windows. |
| `pickFiles()` / `pickFolder()` | `pick_files` / `pick_folder` | `dialog` | `tauri-plugin-dialog`, called from Rust and parented to the calling window. |
| `inspectFiles(paths, deep)` | `inspect_files` | `inspect.ts` | Validate that `paths` is an array of strings. |
| `startJob(req)` / `cancelJob(id)` / `listJobs()` | `start_job` / `cancel_job` / `list_jobs` | `jobs/queue.ts` | The request is a serde enum tagged by `kind`. |
| `reveal(path)` / `openPath(path)` / `openNotices()` | `reveal` / `open_path` / `open_notices` | `shell` | `tauri-plugin-opener`, called from Rust. The path must exist. |
| `openOverlay(paths, mode)` / `closeOverlay()` / `resizeOverlay(size)` | `open_overlay` / `close_overlay` / `resize_overlay` | `overlayWindow.ts` | §8.2 |
| `overlayDropped(paths)` | `overlay_dropped` | `overlayWindow.ts` | Returns deeply inspected `FileInfo[]` and focuses the overlay. |
| `previewMedia(path)` | `preview_media` | `previews.ts` | Returns `{url, isProxy}`. The URL form is OS-specific (§7.10); the UI never builds URLs itself. |
| `previewFrame` / `previewWaveform` / `previewImage` / `pdfThumbnails` | same names in snake_case | `previews.ts`, `imagePreview.ts`, `ipc.ts` | Results are data URLs, as today. A later optimization could serve previews over a protocol instead. |
| `readMetadata(path)` | `read_metadata` | `metadata.ts` | — |
| `onJobUpdate` | event `ev:job-update`, sent to all windows | `broadcast` | Throttled to 100 ms per job, except state changes (§7.11). |
| `onOverlayInit` / `onOverlayFiles` / `onOverlayDrag` | events `ev:overlay-init` / `ev:overlay-files` / `ev:overlay-drag`, sent to `overlay` only | `overlayWindow.ts` | Use `emit_to("overlay", …)`. |
| `onSettings` | event `ev:settings`, sent to all windows | `index.ts` | — |
| `onNavigate` | event `ev:navigate`, sent to `main` | `appMenu.ts` | macOS ⌘, opens Settings. |
| `getPathForFile(file)` | **removed** | `webUtils` | A webview `File` object has no path. Native drop events replace it (§8.3). |
| *(new)* | event `ev:drop` per window: `{phase: 'enter'\|'over'\|'drop'\|'leave', paths?, x, y, alt, shift}` | — | §8.3. `x`/`y` are in CSS pixels. Modifier keys are sampled natively. |
| *(new)* | command `ui_ready` | `ready-to-show` | The main window shows itself after the first React render, which avoids a white flash. |
| *(new, optional)* | command `set_media_support(map)` | — | The renderer reports `canPlayType` results once, and §7.9 uses them. |

### 6.3 Required UI changes (complete list)

1. **`lib/api.ts`** becomes the shim in §6.1. `preload/index.d.ts` is deleted after cutover.
2. **`main.tsx`** chooses the view from the window label (`getCurrentWebviewWindow().label`, either `"main"` or `"overlay"`) instead of `?view=`. Keep the global `dragover`/`drop` `preventDefault`.
3. **File drops** (`lib/dnd.ts`, `components/DropZone.tsx`, `views/HomeView.tsx`, `OverlayApp.tsx`, `components/Wheel/Wheel.tsx`, `overlay/stages/WheelStage.tsx`):
   - Replace the `DataTransfer` handlers with a `useNativeDrop()` hook fed by `ev:drop`.
   - Hit-testing reuses `Wheel`'s `hit(clientX, clientY)`, together with `document.elementFromPoint` to find the drop zone.
   - The drag-over highlight comes from `over` events.
   - "Alt + drop opens the Tools ring" reads `alt` from the event.
   - `fmtsFromDragTypes` becomes unnecessary, because `enter` already carries real paths. **Deliberate improvement:** on Windows and Linux the wheel now shows the real file's formats before the drop, just as it does on macOS today.
4. **`components/ReorderList.tsx` and `panels/pdf/OrganizePanel.tsx`** must be rewritten with pointer events (`pointerdown`/`pointermove`/`pointerup` plus `elementFromPoint`).
   - The reason: with Tauri's native file-drop handler enabled, HTML5 drag-and-drop **does not work on Windows** (✅ a documented Tauri behaviour). That includes internal drags like these.
   - The visuals stay the same.
5. **Title bar** (`views/views.css` `.titlebar` and the App header):
   - `-webkit-app-region: drag` becomes the `data-tauri-drag-region` attribute.
   - **Windows:** Electron drew the native caption buttons with `titleBarOverlay`, and Tauri has no equivalent. Add a `CaptionButtons.tsx` (minimize, maximize/restore, close) rendered only on `win32`, in the space the 150 px right padding reserves today. The alternative is native decorations (§15).
   - **macOS:** traffic lights stay, using `TitleBarStyle::Overlay` + `hidden_title` + `traffic_light_position` (✅ these APIs exist in 2.12.1).
   - **Linux:** the native frame is unchanged.
6. **Delete:**
   - `src/renderer/engine.html`
   - `src/renderer/src/engine/*`
   - `scripts/copy-pdfjs-assets.mjs`
   - the `pdfjs-dist` dependency
   - `src/renderer/public/pdfjs/`
7. **`lib/sound.ts`:**
   - WebKit can leave an `AudioContext` suspended until the user interacts.
   - Call `ctx.resume()` on the first `pointerdown`/`keydown` in each window. 🔬 Verify on macOS and Linux.
8. **No change needed:**
   - `lib/platform.ts`: user-agent sniffing works in all three webviews. WebView2's user agent contains "Windows", WKWebView's contains "Macintosh", and WebKitGTK's contains "Linux".
   - `MediaPreview.tsx`, `lib/useAudio.ts`: the URLs come from `preview_media`.
   - All panels, stages and views apart from those listed above.

**Expected UI diff:** about 300–500 lines, mostly items 3–5.

---

## 7. Backend port, area by area

Each subsection covers four things in turn:
- what the code does today
- the Rust design
- behaviours that must survive the port
- the tests that cover it

### 7.1 Startup and lifecycle (`index.ts`)

**Keep this order:**

1. Register the single-instance plugin. Skip it with `--selftest`.
2. Buffer macOS `RunEvent::Opened { urls }` events (✅ present in 2.12.1) until startup finishes.
3. Install the app menu (macOS only, §8.5).
4. Register the `kfile` protocol. (`epubprint` was dropped with EPUB → PDF, D8.)
5. Apply security hardening (§9).
6. Run the Electron → Tauri migration (§8.10).
7. Load settings and apply the theme.
8. Detect capabilities, and wait for it.
9. Create the job queue (emit plus notify).
10. Commands are registered with the builder.
11. Start the PDF actor.
12. **With `--selftest`:** run the self-test, then `app.exit(code)`.
13. Create the main window. Show it unless the app was launched with files or with `--hidden`.
14. Create the overlay, hidden and pre-warmed.
15. Create the tray.
16. Apply integrations.
17. Subscribe to settings changes.
18. Mark startup as finished.
19. In the background: hardware-video detection and housekeeping.
20. Open any queued files.

**Lifecycle details:**
- **Keep running with no windows:** in `RunEvent::ExitRequested`, call `api.prevent_exit()` unless the quitting flag is set. Quit from the tray or the menu sets the flag, then calls `app.exit(0)`.
- **macOS Dock click:** `RunEvent::Reopen` (✅) shows the main window.
- **Theme:** apply the window theme for the system / light / dark setting. The UI applies its own CSS theme from settings; the native theme only affects window chrome and `prefers-color-scheme`. 🔬 Confirm the app-level `set_theme` API.
- **Command-line flags:** `--hidden`, `--selftest`, `--only=<group|prefix>`. Accept `--no-sandbox` and ignore it, for CI compatibility.

### 7.2 Settings (`settings.ts`)

- **File:** `settings.json` in `app_config_dir`.

  | OS | Path |
  |---|---|
  | macOS | `~/Library/Application Support/com.alohamora.app/` |
  | Windows | `%APPDATA%\com.alohamora.app\` |
  | Linux | `~/.config/com.alohamora.app/` |

  The keys (camelCase) and the defaults (`defaults.json`) stay the same.
- **Sanitize each key separately:**
  - keep only known keys whose JSON type matches the default's type
  - a `null` default allows null or a string
  - an array default requires an array

  Implement this over a `serde_json::Map`. One bad key must never reset the whole file, which is what a plain `#[derive(Deserialize)]` would do.
- **`update(patch)`:**
  1. Sanitize the patch.
  2. Merge it into the current settings.
  3. Write `settings.json.tmp`, then rename it over the original (atomic).
  4. Call the listeners with `(new, prev)`: apply integrations and emit `ev:settings`.
  5. Return the new settings.
- **State:** a `Mutex<Settings>` in app state; jobs get a snapshot clone.

### 7.3 Capabilities and hardware video (`capabilities.ts`, `engines/hwVideo.ts`)

The `Capabilities` fields stay the same.

**FFmpeg**
- `ffmpeg -hide_banner -encoders` → `parse_encoder_list`.
- `-version` → keep the first line.
- `ffmpeg = encoders non-empty`.

**HEIC tool**

| OS | Tool | Location |
|---|---|---|
| macOS | `sips` | `/usr/bin/sips` |
| Windows | `heif-enc.exe` | `resource_dir/heif/`, then `app_data_dir/heif/` (new) |
| Linux | `heif-enc` | on `PATH` |

**Deliberate change:** users who install `heif-enc` on Windows now copy it to `%APPDATA%\com.alohamora.app\heif\`, which reinstalls don't wipe. The README changes to match.

**Global drag (`globalDrag`)**

| OS | Value |
|---|---|
| macOS | `'mac-helper'` if the helper sidecar exists |
| Linux on Wayland (`XDG_SESSION_TYPE=wayland` or `WAYLAND_DISPLAY` set) | `'unavailable'` |
| Linux on X11 | `'hook'` |
| Windows | `'hook'` |

**OCR languages:** the `*.traineddata` files present in the tessdata resource directory.

**Hardware video (`hwVideo`)**
- Runs in the background after startup.
- Test-encodes one black frame per candidate, using the same ffmpeg arguments as today.

| OS | Candidates |
|---|---|
| macOS | `h264_videotoolbox` |
| Windows | `h264_nvenc`, `h264_qsv`, `h264_amf` |
| Linux | `h264_nvenc` |

- The first encoder that works is stored. The self-test awaits detection.

### 7.4 Paths, resources and sidecars (`paths.ts`)

| Electron | Tauri |
|---|---|
| `resourcesRoot()` | `app.path().resource_dir()` |
| `binDir()`/`ffmpeg`, `ffprobe` | Sidecars (`bundle.externalBin`). Packaged builds place them next to the main executable with the target triple removed; resolve from `std::env::current_exe()?.parent()`. In development, use `src-tauri/binaries/<name>-<triple>[.exe]`. |
| `macDragHelperPath()` | Sidecar `alohamora-drag-helper` (macOS-only config). |
| `tessdataDir()` | `resource_dir/tessdata` |
| (new) pdfium | `resource_dir/pdfium/{libpdfium.dylib \| pdfium.dll \| libpdfium.so}`, loaded with `Pdfium::bind_to_library` |
| (new) fonts | `resource_dir/fonts` (Typst, §7.17) |
| `trayIconPath()` | Icons compiled into the binary (`include_bytes!`) |
| `noticesPath()` | `resource_dir/THIRD_PARTY_NOTICES.md` |
| `userDir()` (settings) | `app_config_dir` |
| `cacheDir()` (proxies) | `app_cache_dir` |
| logs | `app_log_dir` |
| `jobsTempRoot()` | `std::env::temp_dir()/alohamora-jobs` (unchanged) |
| `heifEncPath()` | §7.3 |
| `findOnPath(name)` | Own loop with an executable check, same semantics. |
| `preloadPath()` / `rendererUrl()` | Not needed: Tauri `frontendDist` and `devUrl`. |

### 7.5 Logging (`log.ts`)

- Use `tauri-plugin-log`, writing to the log directory (`main.log`) and stdout.
- Line format: `[ISO time] LEVEL message`.
- Keep the existing messages: `Alohamora ready`, `Capabilities …`, `Job failed: <label>`, `Hardware video encoder OK/unavailable`, `Housekeeping removed …`, `Global drag wheel started/stopped`.

### 7.6 Errors (`errors.ts`)

```rust
pub enum AppError {
    User { message: String, details: Option<String> },
    Tool { message: String, details: String },
    Canceled,
    Io(std::io::Error),
    Other(anyhow::Error),
}
```

`to_user_message` keeps the same mapping:
- **User and Tool errors** pass through unchanged.
- **OS errors map by their raw code:**

  | Unix | Windows | Message |
  |---|---|---|
  | `EPERM` (1), `EACCES` (13), `EBUSY` (16), `EROFS` (30) | `ERROR_ACCESS_DENIED` (5), `ERROR_SHARING_VIOLATION` (32), `ERROR_LOCK_VIOLATION` (33), `ERROR_WRITE_PROTECT` (19) | "Alohamora can't read or write this file. Close it in other apps and try again." |
  | `ENOSPC` (28) | `ERROR_DISK_FULL` (112), `ERROR_HANDLE_DISK_FULL` (39) | "The disk is full." |

- **Anything else:** "Something went wrong while processing this file.", with the debug text in `details`.

Port `errors.test.ts`. All message strings are listed in Appendix D.

### 7.7 Process runner and FFmpeg (`engines/process.ts`, `ffmpeg.ts`, `ffmpegParse.ts`)

**`run_process(exe, args, cancel, name)`**
- Returns stdout bytes plus a stderr tail (the last 20,000 characters).
- A non-zero exit returns `Tool("<name> failed (exit code N)", <last 20 stderr lines>)`.
- **Never a shell.** On Windows, set `CREATE_NO_WINDOW` (`0x08000000`).
- Cancellation kills the child and returns `Canceled`.

**`run_ffmpeg(args, duration, cancel, on_progress)`**
- Prepends `-hide_banner -nostdin -y -loglevel error -progress pipe:1 -nostats`.
- Reads stdout lines of the form `key=value`:
  - `out_time_us` or `out_time_ms` (both microseconds) → progress fraction `min(0.999, t / duration)`
  - `progress=end` → 1
- Keeps a stderr tail of 12,000 characters.
- On failure returns `Tool(friendly_ffmpeg_error(stderr), "ffmpeg <args>\n\n<last 15 lines>")`.

**Other entry points**
- `run_ffmpeg_to_buffer`: prepends `-hide_banner -nostdin -loglevel error` and returns stdout.
- `run_ffmpeg_capture`: runs at `-loglevel info` and returns stderr. Loudnorm needs this: the JSON appears at the end of stderr.
- `probe(path)`:
  - Runs `ffprobe -v error -print_format json -show_format -show_streams`.
  - Results are cached by `path|size|mtime`, with at most 300 entries (clear the cache when full).
  - Tool errors are re-mapped through the friendly message.

**Pure parsing moves to `core`:** `parse_probe_json`, `parse_encoder_list`, `parse_rate` and `friendly_ffmpeg_error`, with `ffmpegParse.test.ts` ported.

**Do not use `tauri-plugin-shell`** to run sidecars: it exists for commands the frontend invokes, and it adds ACL surface. Resolve sidecar paths directly (§7.4). The `ffmpeg-sidecar` crate is not needed.

### 7.8 FFmpeg argument builders (pure)

Port `ffmpegArgs.ts`, `videoArgs.ts` and `audioArgs.ts` **verbatim** into `core::ffmpeg_args`. Their three test files become golden expectations (§11).

**JavaScript number-formatting traps.** Wherever a number becomes a string, use the helpers in `core::js`.

| JavaScript | Rust default | Helper |
|---|---|---|
| `${n}` / `String(n)`: shortest round-trip form, exponent notation at 1e21 | `{}` matches for normal values (`2.0` → `"2"`), but never uses exponent notation | `js_num(f64)` |
| `n.toFixed(k)`: ties round **up**, on the exact binary value | `{:.k}`: ties round to even | `js_to_fixed(f64, k)` |
| `Math.round(x)`: halves round toward +∞ (−2.5 → −2) | `f64::round`: halves round away from zero (−2.5 → −3) | `js_round(x) = (x + 0.5).floor()` |

**Places where these matter:**
- the hue in `buildEditSpec`
- `Math.round(o.parts)`
- `toFixed(3)` timestamps
- `toFixed(4)` in `atempo` and `setpts`
- `${o.factor}x` file-name suffixes such as `0.5x`
- `frame-${t.toFixed(2).replace('.', '_')}s`

**Key order:** `Object.entries(tags)` keeps insertion order. Use `serde_json` with `preserve_order` (IndexMap) so `-metadata k=v` arguments come out in the same order.

### 7.9 Inspection, thumbnails, previews, metadata reading

**`expand_paths`**
- A folder expands to its direct files, sorted by name. TypeScript used `localeCompare`; use a case-insensitive comparison and note the small difference.
- Dedupe by resolved path; stop at 500 files.

**Inspection**
- `inspect_basic` is unchanged.
- `inspect_deep` runs with concurrency 4 and **keeps input order** (`buffered(4)`).

**Deep inspection by kind**

| Kind | How |
|---|---|
| Audio/video | Probe → duration, codecs, display size after rotation, fps, sample rate, channels, cover |
| Images | Header dimensions, swapped when the EXIF orientation is ≥ 5. HEIC needs a decode; BMP is a cheap header read now. |
| PDF | The pdfium actor → page count, first page size in points, and a page-1 thumbnail 256 px wide |

**Thumbnails**
- JPEG data URLs at quality 70, longest side ≤ 256 px.
- Video: one frame at `min(1 s, 10% of duration)`, piped through ffmpeg as MJPEG.
- Audio: the cover, via `-map 0:v:0`.
- EPUB: the cover image read from the zip.
- Cached for 200 entries, keyed by `path|mtime`.

**`preview_media`** (**deliberate change: the playable test now depends on the webview**)
- Today the "can the webview play this?" lists are Chromium's.
- New rule: play the file directly only if both its container and codecs are known to play in **this** webview. Otherwise make a proxy.
- Use the `set_media_support` results from the renderer's `canPlayType` (§6.2). If none have been reported, use these defaults:

| Webview | Plays directly by default |
|---|---|
| WebView2 | Today's list |
| WKWebView | MP4/MOV with H.264/HEVC and AAC/MP3/ALAC/FLAC. **Never MKV.** |
| WebKitGTK | Proxy everything except MP4 (H.264/AAC) and WebM (VP8/VP9 with Opus/Vorbis). 🔬 S3 |

- **The proxy:**
  - Video: 480p H.264 (`ultrafast`, CRF 28, `-g 15`), AAC 128k, `+faststart`. Audio: WAV.
  - Stored in `app_cache_dir/proxies/` and keyed by the first 16 hex characters of `sha1(path|size|mtime)`.
  - Written as `.part` first, then renamed.
  - In-flight requests are de-duplicated with a map from key to a shared future.

**`preview_frame`, `preview_waveform`, `preview_image`**
- Same FFmpeg arguments as today.
- The waveform cache is capped at 100 entries (new cap).
- `preview_image`:
  - A 6-entry cache of decoded RGBA proxies.
  - Operations `none`, `compress`, `crop`, `edit`, `background` and `collage`.
  - **Uses the same functions as the tools,** so the preview matches the output.
  - `compress` returns the real full-resolution byte size.

**`read_metadata`**

| Kind | Fields |
|---|---|
| Media | Editable keys per kind; read-only keys; cover as a data URL; `hasGps` if any tag contains `location` |
| Image (EXIF) | Make, Model, LensModel; `DateTimeOriginal` → `YYYY-MM-DDTHH:MM`; exposure as `1/N s`; aperture `f/x`; ISO; focal length `x mm`; Software; Artist; Copyright; ImageDescription; GPS in decimal degrees to 5 places |
| PDF (Info dict) | Title, Author, Subject, Keywords (editable); Creator, Producer, created, modified, page count (read-only) |

`toLocaleString()` dates become chrono local formatting. This is a minor visual difference.

### 7.10 The `kfile://` protocol (`protocol.ts`)

**Registration and URL form**
- Register with `Builder::register_asynchronous_uri_scheme_protocol("kfile", …)`.
- `kfile_url(path)` builds the URL in Rust:

  | OS | URL |
  |---|---|
  | macOS, Linux | `kfile://localhost/<urlencoded absolute path>` |
  | Windows (WebView2) | `http://kfile.localhost/<urlencoded absolute path>` |

**Access control**
- An allow-list: `Mutex<HashSet<PathKey>>`. Only `preview_media` adds entries (the source file or its proxy).
- Requests for files not on the list get 403. Missing files get 404.

**Responses**
- Ranges: `bytes=a-b`, `bytes=a-` and `bytes=-n` → 206 with `Content-Range`, `Accept-Ranges` and `Content-Length`.
- An unsatisfiable range → 416 with `bytes */size`.
- No range → 200.
- CORS headers and the OPTIONS 204 reply are the same as today. The MIME map is the same as today.
- **Stream from disk.** Cap each response at about 1 MB, as Tauri's own asset protocol does (✅ `MAX_LEN = 1000 * 1024`), so memory stays flat; the media element asks for the next range.

**Why not Tauri's asset protocol:** it also supports Range (✅), but it needs scope configuration, while our allow-list is narrower. Revisit only if S3 finds problems with WebKitGTK.

**Fallback if S3 fails on Linux:** a loopback-only HTTP server (127.0.0.1, random port and token, with the CSP widened for that origin only). Use it only for media previews.

**`app://`** goes away; Tauri serves the frontend itself (`frontendDist`).

### 7.11 Jobs (`jobs/context.ts`, `execute.ts`, `queue.ts`)

**`JobContext`**

| Member | Behaviour |
|---|---|
| `id` | — |
| cancel token | — |
| `temp_dir` | `alohamora-jobs/<uuid>` |
| settings, caps | snapshots |
| `progress(f, detail)` | Reports `(sub.index + f) / sub.total` |
| `set_subtask(i, n, detail)` | — |
| `new_output(spec)` | Returns the temp path `out-<n>.<ext>` |
| `drop_output(path)` | — |
| `temp_path(name)` | `tmp-<k>-<name>` |
| `note(text)` | — |

**`finalize(inputs)`**
1. Each output that wasn't dropped must exist. If one is missing, fail with "Expected output was not created (…)".
2. The output folder is the custom folder when that setting is on, otherwise the source file's folder.
3. **Group outputs** (pages, frames, parts) go into a folder named `<base>-<group>`, collision-resolved once per source and group. File names are `<base>-<NNN>.<ext>`, padded to `max(3, digits(total))`.
4. **Single outputs** are named `nameOverride` or `<base>[-suffix].<ext>`.
5. Names are sanitized: Windows-forbidden characters become `_`, trailing dots and spaces are trimmed, the length is limited to 180, and an empty name becomes `output`.
6. **Collisions** become `name (n).ext`, up to 9999. They are checked against a **process-wide** reserved set and the file system.
7. **Refuse to write over an input** (compared with `path_key`).
8. Move with `rename`. A cross-device rename (`ErrorKind::CrossesDevices`) falls back to copy-new plus delete. **Never overwrite.**
9. Release the reservations in all cases.

**`cleanup`:** delete the temp folder, retrying 3 times with a 200 ms delay.

**`execute_request`**
1. Deep-inspect the inputs. If there are none: "No files to process."
2. **Convert:** one subtask per file.
   - Skip files already in the target format, with the note "N file(s) was/were already X".
   - Unsupported files raise an error.
3. **Tool:**
   - Check the minimum number of inputs.
   - Run `perFile` tools once per file, others once.

**The queue**
- FIFO by `createdAt`, running at most `max(1, settings.maxConcurrentJobs)` jobs at a time.
- States: `queued → running → done | error | canceled`.
- Progress updates are throttled to one per 100 ms; state changes are always sent.
- **Done:** `outputBytes` is the sum of the output sizes, and the notes are joined with `" · "`.
- **Error:** `to_user_message`, plus a log line.
- **Cancel:** a queued job is canceled immediately; a running job has its token canceled.
- At most 50 finished jobs are kept.
- `on_finished` triggers notifications (§7.22).

**`path_key`:** lower-case on Windows and macOS, exact on Linux (unchanged).

### 7.12 Converters (`converters/*.ts`)

| From | Behaviour to keep |
|---|---|
| Audio/video | **Inputs and quality**<br>• Probe the facts first.<br>• A missing track fails with "<name> has no audio track." or "… has no video track."<br>• The output gets the canonical extension.<br>• Quality is `{crf: settings.videoCrf, audioKbps: settings.audioBitrateKbps}`; GIF uses width 480 and 12 fps by default.<br><br>**How each kind runs**<br>• Audio uses `audioConvertArgs` and keeps the cover for mp3, m4a and flac.<br>• Video uses `runWithHwFallback`. If the hardware encoder fails, it retries once on the CPU and adds the note "Hardware encoder failed — used CPU".<br>• A remux adds the note "Copied streams without re-encoding". |
| Image | • Quality is `opts.quality ?? settings.imageQuality`.<br>• jpg, png, webp, avif, tiff: raster save.<br>• bmp: the `image` crate (§7.14).<br>• svg: trace (default 16 colours) or embed.<br>• heic: needs an encoder.<br>• pdf: page size "fit", no margin.<br>• docx: a single image. |
| PDF | **Images**<br>• jpg/png at `settings.pdfDpi`, quality 0.9.<br>• One page gives a single file; more pages give the group `pages`, with index = page + 1 and total = page count.<br><br>**Text outputs (txt, docx, epub)**<br>• Extract the text; if `isScanned`, run OCR, or fail when OCR is off.<br>• docx "pages" mode: JPEG at 200 DPI, quality 0.85, one section per page.<br>• epub "pages" mode: JPEG at 150 DPI, quality 0.85, size in px = pt × 150 / 72.<br>• epub reflow: `guessLang`, `splitChapters` and `blocksToXhtml`. |
| EPUB | §7.17 |
| Text | **Subtitles**<br>• srt/vtt via `textToCues`.<br>• SRT starts with a BOM.<br><br>**Documents and images**<br>• pdf via text → PDF.<br>• jpg/png via text → PDF → render at `imageDpi` (default 150), quality 0.9. |
| Subtitle | Parse, then write srt (with a BOM), vtt or txt. |

### 7.13 Tools (`tools/**`): rules that must be kept

**Video**

| Tool | Output | Rules |
|---|---|---|
| `video.compress` | mp4 (webm if the input is webm), suffix `compressed` | **Target size**<br>• A target below 150 kbps of video fails with "<n> MB is too small for a <duration> video. Try at least <m> MB."<br>• `targetSizeMb > 0` runs a CPU two-pass encode, with the pass log in temp.<br><br>**Encoders**<br>• Hardware encoding only in quality mode, and only for H.264.<br>• H.265 adds `+4` CRF and `-tag:v hvc1`.<br><br>**Result**<br>• If the result isn't smaller (and there's no target), drop it with the note "Already well compressed — no smaller file was made."<br>• Otherwise note "A → B (−x%)". |
| `video.metadata` | Same container, suffix `clean` or `meta` | On failure, retry with `-map 0:v? -map 0:a? -map 0:s?` instead of `-map 0`. |
| `video.mute` | Same container, suffix `muted` | **Instant** (no options card). No audio fails with "<name> has no audio to remove." Stream copy plus `-an`. |
| `video.trim` | Suffix `trimmed` | **Range**<br>• An end of 0 means the end of the file.<br>• Less than 0.1 s fails with "The selection is too short."<br><br>**Modes**<br>• Fast: stream copy plus `-avoid_negative_ts make_zero`.<br>• Precise: re-encode with tool quality (CRF ≤ 20) and hardware fallback. |
| `video.crop` | Suffix `cropped` | A full-frame selection fails with "Move the crop handles first — the whole frame is selected." The pixel rectangle is rounded to even numbers. Audio is copied. Note: "W × H px". |
| `video.speed` | Suffix `<factor>x` | Outside 0.25–4 fails with "Speed must be between 0.25× and 4×." Uses an `atempo` chain. Progress duration = duration ÷ factor. |
| `video.snapshot` | Single: suffix `frame-<t>s`. Every N s: group `frames`. | Single frames at `min(t, duration − 0.05)`. JPEG uses `-q:v 2`. |
| `video.split` | Group `parts` | `splitSegments`. Fewer than 2 segments fails with "Add at least one cut point inside the video." Fast or precise, like trim. |
| `video.redact` | Suffix `redacted` | At least one box, else "Draw at least one box over the area to hide." Styles: blur (σ = max(8, min(w,h)/6)), pixelate (1/12 then neighbour scaling), or black, with an optional time window. Strips metadata; note "Metadata removed". |
| `video.join` | Suffix `joined` | **Matching clips**<br>• If every clip has the same codec, size, fps and audio layout: concat demuxer with stream copy, keeping the container.<br><br>**Differing clips**<br>• Normalize each clip to the first clip's size and fps (≤ 60): libx264 veryfast CRF 20, AAC 192k, 48 kHz stereo, adding silent audio where a clip has none.<br>• Then concat to mp4, with the note "Clips were re-encoded to match". |

**Audio**

| Tool | Rules |
|---|---|
| `audio.compress` | The "keep" format turns lossless inputs into mp3. If the result isn't smaller, drop it with the note "Already small — no smaller file was made". |
| `audio.normalize` | Two-pass `loudnorm`; pass 2 puts `-ar <source rate>` before the codec arguments. A silent file fails with "This file is silent." Progress details: "Measuring loudness", "Normalizing". Note: "X LUFS → T LUFS". |
| `audio.trim` | Fades re-encode the audio; without fades it is a stream copy. |
| `audio.channels` | Modes: mono, stereo, left, right, swap. The channel arguments come **after** the codec arguments. Left/right/swap on a mono file fails with "This file is mono." Suffixes: mono, stereo, left, right, swapped. |
| `audio.visualize` | waveform-png, spectrogram-png, or waveform-mp4. |
| `audio.bleep` | Ranges are clipped to the duration and must last ≥ 0.01 s. A beep is a 1 kHz tone at gain 0.35; the alternative is silence. Note: "N part(s) bleeped/silenced". |
| `audio.metadata` | **Cover art**<br>• Only for mp3, m4a and flac (otherwise a note).<br>• The image is resized to ≤ 1000 px and saved as JPEG quality 90.<br><br>**Tags**<br>• MP3 writes ID3v2.3 plus ID3v1. |
| `audio.join` | Concat filter, resampling to 48 kHz stereo. |

**Image**

| Tool | Rules |
|---|---|
| `image.compress` | **Format**<br>• "keep" keeps jpg, png, webp or avif; anything else becomes jpg.<br><br>**Options**<br>• `maxSide` limits the longest side.<br>• Strip metadata unless asked to keep it.<br>• PNG output uses a palette.<br><br>**Result**<br>• If the result isn't smaller: "<name> is already small".<br>• Otherwise note "A → B (−x%)". |
| `image.resize` | Percent or pixels, with keep-aspect. Errors: "Choose a size above 0 %." and "Enter a width or a height." Note: "W×H → w×h". |
| `image.crop` | Rotate and flip, **then** crop in the rotated coordinates. The format follows `sameImageFmt` (HEIC → HEIC if an encoder exists, otherwise JPG; SVG → PNG). Quality is max(setting, 92). |
| `image.edit` | `buildEditSpec` + `applyEdit`. Same format as the input. |
| `image.background` | Output is jpg if the input is jpg, otherwise png. Quality is max(setting, 92). Metadata is not kept. |
| `image.redact` | **Effects**<br>• Blur: σ = max(12, min(w,h)/6).<br>• Pixelate: 16 px blocks.<br>• Black fill.<br><br>**Output**<br>• Strips metadata; note "Metadata removed".<br>• Quality 92. |
| `image.metadata` | **Remove all**<br>• JPEG: lossless strip, **unless** the EXIF orientation isn't 1; then re-encode at quality 95.<br>• PNG: lossless chunk strip.<br>• Other formats: re-encode at quality 95.<br><br>**Remove GPS**<br>• JPEG: empty the GPS IFD.<br>• Other formats: re-encode, carrying over only the IFD0 text fields.<br><br>**Edit**<br>• JPEG: set Artist, Copyright, ImageDescription and DateTimeOriginal. The date comes from `datetime-local` and is written as `YYYY:MM:DD HH:MM:SS`.<br>• Other formats: re-encode with IFD0 fields.<br><br>**Suffixes:** `clean`, `nogps`, `meta`. |
| `image.collage` | **Layout and tiles**<br>• `collageCells` places the tiles.<br>• Tiles are `cover` (attention crop, ⚠️ §7.14) or `contain`.<br>• The corner radius is a % of each tile's shorter side.<br><br>**Output**<br>• Flattened onto the background as JPEG quality 90.<br>• Note: "N images". |
| `image.pdf` | **Page size**<br>• "fit": 96 DPI, capped near A3.<br>• a4 or letter: landscape when the image is wider.<br><br>**Margins:** 0, 18 or 36 pt.<br><br>**Output:** one combined PDF or one PDF per image. |

**PDF**

| Tool | Rules |
|---|---|
| `pdf.compress` | **light / balanced / strong**<br>• Recompress DCT images to longest side 3000, 2000 or 1400 at quality 82, 70 or 55.<br>• Skip CMYK images and images with a `/Decode` array.<br>• Keep a recompressed image only if it is under 90% of the original.<br>• Drop the output if the result is ≥ 98% of the input.<br><br>**max**<br>• Rasterize every page at 110 DPI, quality 0.6.<br>• Note: "Pages were converted to images (text is no longer selectable)". |
| `pdf.merge` | Keeps the user's order. Note: "N pages". |
| `pdf.split` | Modes each / every / ranges / extract via `splitGroups`. More than one group → group `part`; a single result gets the suffix `part` or `extract`. |
| `pdf.organize` | Pages are `{src, rotate}`. Rotation adds to the existing rotation, mod 360. Validates indexes. Note: "k of n pages kept". |
| `pdf.images` | Page ranges, format, DPI, quality ÷ 100. |
| `pdf.ocr` | Languages are the requested ones that are available, falling back to `eng`. Output is txt (`--- Page N ---` headers) or a searchable PDF (suffix `searchable`). |
| `pdf.word` | Delegates to PDF → DOCX with `{docMode, ocr}`. |
| `pdf.metadata` | **Remove all:** a clean copy, with the note "Bookmarks and form fields are not kept when removing all metadata."<br><br>**Edit:** set the fields; keywords are split on commas; ModDate is set to now. |

**Subtitles**

| Tool | Rules |
|---|---|
| `subtitle.shift` | Shift by an offset in ms. The format is kept (srt or vtt). Cues ending at ≤ 0 are dropped. Note: "N subtitles shifted by X ms". |

### 7.14 Image engine (replacing sharp / libvips) 🔬 S5

**How each sharp operation is replaced**

| sharp operation (where it's used) | Rust | Notes |
|---|---|---|
| Decode JPG/PNG/WebP/TIFF/GIF (first frame) with `failOn:'none'` | `image` with zune-jpeg | Tolerant decoding: a truncated file decodes what it can. |
| Decode AVIF | FFmpeg fallback (`-f image2pipe -c:v png`), or `image`'s `avif-native` feature (dav1d) | Choose in S5. |
| Decode HEIC (`heic-decode` today) | `libheif-rs` (`embedded-libheif`, **dynamically linked** for LGPL compliance) | On macOS, `sips` can decode as a fallback. 🔬 Check that libde265 is included. |
| Decode BMP (via FFmpeg today) | `image` BMP decoder | **Deliberate change:** BMP no longer needs FFmpeg. Drop `bmp` from `REQUIRED_ENCODERS` in the JSON registry, and the UI follows automatically. |
| SVG input at `density` | `resvg`/`usvg` at scale = density ÷ 72 (sharp's semantics), using fontdb system fonts | Density 300 when loading, 72 for thumbnails, 144 for proxies. The self-test expects an 800×600 SVG at density 72 to give 800×600. |
| `.rotate()` auto-orient | Read the EXIF orientation (`kamadak-exif`), then `DynamicImage::apply_orientation` | The orientation tag is dropped on output. |
| `metadata()` (width, height, orientation, colour space, format) | Header readers plus EXIF; the JPEG colour space comes from the SOF/ICC | Used by inspect, `embeddableImage` and the metadata tool. |
| `resize` with fit inside / cover / contain / fill, `withoutEnlargement`, Lanczos3 by default, `nearest` for pixelate | `fast_image_resize` (Lanczos3) plus our own fit maths | — |
| `position: attention` (smart crop, collage cover) | `smartcrop2` 0.4 (MIT) or a centre crop | ⚠️ A small visual difference. Default: smartcrop2. |
| `flatten`, `ensureAlpha`, raw buffers, solid canvas, `extract`, rotate 90/180/270, `flip`/`flop`, `stats().isOpaque` | `image` + `imageops` | — |
| `jpeg({quality, mozjpeg:true})` | `mozjpeg` crate (trellis quantization, optimized scans) | Calibrate quality so file sizes land within ±15% of the Electron output. |
| `png({compressionLevel:9, adaptiveFiltering:true})` | `png` with best compression and adaptive filtering | `oxipng` is optional. |
| `png({palette:true, quality})` (image compress) | `quantette` 0.6 (MIT), then an indexed PNG | **Don't use `imagequant` 4: it is GPL-3.0** (✅ checked). |
| `webp({quality, effort})` | `webp` crate (libwebp), lossy, method = effort | The `image` crate's WebP encoder is lossless only. |
| `avif({quality×0.65, effort 4})` | `ravif` (rav1e) | Calibrate the quality/speed mapping. |
| `tiff({compression:'lzw'})` | `tiff` encoder with LZW | — |
| `withMetadata()` (keep EXIF/ICC) / `withExif({IFD0})` | Re-insert the EXIF (with orientation reset to 1) and the ICC profile using `img-parts` (JPEG/PNG/WebP); write IFD0 with `little_exif` | 🔬 |
| Colour management (sharp converts to sRGB, including CMYK JPEGs) | `moxcms` 0.9 (or `lcms2`) | ⚠️ Verify CMYK and wide-gamut inputs in S5. |
| `linear(a,b)`, `modulate({saturation, hue})`, `recomb(3×3)`, `grayscale`, `negate({alpha:false})`, `sharpen({sigma})`, `blur(sigma)` | Our own per-pixel operations. Do saturation/hue in **LCh**, as libvips does (`palette` crate). Use a separable Gaussian for blur, and unsharp masking on luminance for sharpen. | Port the pure `buildEditSpec` unchanged. The preview and the export share code, so what you see is what you get. Small numeric differences from libvips are accepted. |
| `composite` with blend modes `over`, `multiply` (vignette) and `dest-in` (rounded masks), plus SVG overlays (gradients, shadows) | Rasterize the overlay SVGs with resvg, then blend with our own `over`, `multiply` and `dest-in` | Shadow blur σ = max(6, 3% of the shorter side). |
| Lossless JPEG/PNG metadata strip (`imageMeta.ts`) | Port the byte-level code **verbatim**, with its tests | — |
| `piexif` GPS removal and field edits | `little_exif`, or our own IFD rewrite | Drop the thumbnail, IFD1 and MakerNote, as `dumpSafe` does. |

**If S5 fails** (output parity or effort too high): bind libvips through the `libvips` crate 2.3 and bundle the per-OS libvips build (about +18 MB; sharp's own prebuilt libvips binaries are a candidate). This is a contained switch, because all image work sits behind `engine::image`.

### 7.15 PDF engine: read, render, text (replacing the pdf.js engine window) 🔬 S4

**Setup**
- `pdfium-render` 0.9.4 with the `thread_safe` feature, plus the `pdfium_<build>` feature that matches the pinned bblanchon/pdfium-binaries release.
- One actor thread (§5.4).
- Open documents from a path. A password-protected file fails with "This PDF is password-protected. Remove the password first, then try again."; any other failure with "This PDF could not be opened. It may be damaged.".

**Page sizes** in points must match pdf.js `getViewport({scale:1})`, which uses the CropBox and the page rotation. 🔬 The self-test checks that a 612 pt page at 300 DPI renders 2550 px wide.

**Rendering**
- White background; annotations and form appearances rendered.
- Scale = dpi ÷ 72, capped at 120 megapixels. Lower the cap if pdfium's bitmap limits require it.
- Encode PNG, or JPEG at quality = q × 100.
- Thumbnails: `maxWidth`, JPEG quality 75 data URLs, up to `maxPages` (default 500).

**Text extraction → `TextPage { width, height, items[] }`**
- pdf.js returns text runs. Rebuild similar runs from pdfium characters: group consecutive characters that share font, size and baseline, and break at large gaps.
- Item fields:
  - `x`
  - `y` measured **from the top**, as the baseline origin (`page_height − origin_y`)
  - `w` = advance
  - `h` = font size
  - `fontSize`
  - `bold`: the regex `/bold|black|heavy|semibold|demi/i` on the font name, **or** a weight ≥ 600
  - `italic`: `/italic|oblique/i`, or the italic flag
- `pdfReflow` (pure, ported with its tests) consumes this unchanged.
- **Acceptance (S4):**
  - The `doc.pdf` fixture reflows into exactly the same blocks as the Electron build.
  - 3–5 real-world PDFs, reviewed side by side.

**Bundling:** the pdfium shared library per target, pinned to one release, with a checksum. Licence: BSD-3 / Apache-2.0 (plus pdfium's third-party notices).

### 7.16 PDF editing and creation (replacing pdf-lib) — `lopdf` 0.45

| Operation | Design | Notes |
|---|---|---|
| Load | `Document::load`. An encrypted document gives the password message. | Never write metadata on load (pdf-lib's `updateMetadata: false`). |
| Extract pages / split | Copy the selected pages into a new document. | — |
| Merge | Renumber object IDs, combine page trees, copy resources. | Outlines and forms are lost, the same as pdf-lib's `copyPages`. **Fallback:** pdfium's page import (`FPDF_ImportPages`) if lopdf struggles on real files (S4). |
| Organize | Reorder pages and set `/Rotate = (old + r) % 360`. | — |
| Metadata read/write | The Info dictionary: Title, Author, Subject, Keywords, ModDate. "Remove all" deletes the Info dictionary, the XMP `/Metadata`, `/Outlines` and `/AcroForm`. | Keep the existing note text. |
| Recompress images (`pdfCompress.ts`) | Walk the image XObjects whose filter is `DCTDecode` (a single filter). Skip `DeviceCMYK`, `/Decode` arrays and CMYK JPEGs. Re-encode with mozjpeg and replace Width, Height, ColorSpace (DeviceGray or DeviceRGB), BitsPerComponent 8, Filter and Length. Drop `DecodeParms`. | Port the logic one-to-one. |
| Images → PDF | **JPEG:** pass the original bytes through as `DCTDecode` when the orientation is 1 and the colour space is sRGB or grey. Otherwise re-encode: JPEG at quality 92 if opaque, PNG if transparent.<br>**PNG:** `FlateDecode` RGB plus an `SMask` for alpha.<br>Page and margin maths as in `pdfOps.ts`. | — |
| Page images → PDF (compress "max", fixed EPUB) | One JPEG per page at the page size in points. | — |
| Save | Use object streams if lopdf supports them. 🔬 This only affects size. | — |

`pdfOps.test.ts` pinned a pdf-lib pooled-Buffer bug that cannot happen in Rust. Replace it with a test that a JPEG under 4 KB embeds correctly.

### 7.17 Text → PDF (replacing Chromium `printToPDF`) — resolved in revision 2

**Where `printToPDF` was used:** TXT → PDF (and TXT → JPG/PNG through that PDF), EPUB → PDF, and the self-test fixture
`scan.pdf`. EPUB → PDF is **removed** (D8), so only text remains and no HTML engine is needed in the back end.

**Design (implemented in PLAN.md Task 5.3):**
- **Typst**, embedded through `typst-as-lib` 0.16 (feature `typst-kit-fonts`, **without** `packages`, so it can never
  download anything) and `typst-pdf` 0.15.
- One fixed template: page A4/Letter/A5 from the options, margins 16 mm left/right and 18 mm top/bottom, font family
  (sans / serif / mono) and size in points (`TEXT_SIZE_PT`), every line kept as written (`white-space: pre-wrap`).
  Very long words get invisible break points every 40 characters.
- Fonts: the bundled Noto Sans / Serif / Sans Mono (OFL, fetched at build time into `resources/fonts`) first, then
  system fonts for other scripts.
- TXT → JPG/PNG renders every page of that PDF with PDFium (one picture per page).

**The `scan.pdf` self-test fixture** is built with Typst (large text) → PDFium render → an image-only PDF.

**Acceptance:** every `convert.text.*` self-test case; the self-test text includes Vietnamese.

### 7.18 OCR (replacing tesseract.js) 🔬 S6

**Engine**
- `tesseract-rs` 0.4 with `build-tesseract`, which links Tesseract 5.5 and Leptonica statically. It needs CMake and a C++ compiler on CI; cache the build.
- Don't use `embed-tessdata`: the language list comes from the files on disk (§7.3).

**Language data**
- `tessdata_fast` `eng` and `vie`, the same files as today, in `resources/tessdata`.
- (Tesseract's `pdf.ttf` glyphless font is compiled into the engine instead; see below.)

**Recognition**
- Languages are joined as `eng+vie`.
- Set `user_defined_dpi=300`.
- Pages are rendered as 300 DPI PNGs by pdfium.
- The text is the UTF-8 result.
- **One API instance per job, dropped afterwards** (it's memory-heavy).

**Searchable PDF** *(revision 2: resolved)*
- Tesseract's own PDF renderer **cannot be used**: `tesseract-rs` builds Leptonica without zlib and the renderer crashes.
- Each page is built by us: the page JPEG plus invisible text (render mode 3) positioned from the TSV word boxes, using
  Tesseract's glyphless font (`pdf.ttf`, embedded in the engine) with Identity-H encoding and a ToUnicode map.

**Kept behaviour**
- Progress detail "Reading page X of N".
- The message about missing language data, reworded in revision 2 to 'No OCR language data found. Reinstall Alohamora.'
- The fallback to `eng`.
- The `--- Page N ---` text format.

### 7.19 DOCX writer (replacing `docx`)

Three writers must produce Word-compatible files.

| Writer | Requirements |
|---|---|
| `images_to_docx` | Centred image paragraphs; images scaled to fit 624 × 864 px at 96 DPI (EMU = px × 9525); page breaks between images. |
| `blocks_to_docx` | Paragraph styles with the IDs **`Heading1`/`Heading2`/`Heading3`**: the self-test checks that `document.xml` contains `Heading1`, and the style definitions must exist in `styles.xml`. Bulleted list items need a numbering definition. Paragraph spacing after = 160 twips; bold and italic runs; page breaks. |
| `page_images_to_docx` | One section per page, with the page size in twips (pt × 20) and zero margins; the image at 98% of page width and height (pt × 96 ÷ 72). |

- **Metadata:** `creator = "Alohamora"`, plus the title.
- **Choice** *(revision 2: our own writer was chosen and implemented)*: try `docx-rs` 0.4.22 first.
  - If it lacks per-section page sizes or numbering, write our own minimal DOCX: `[Content_Types].xml`, `_rels`, `document.xml`, `styles.xml`, `numbering.xml` and media, using `zip` and templates.
  - The DOCX output covers few features, so our own writer is a small, contained task.

### 7.20 EPUB writer (`epubWriter.ts`, `epubTemplates.ts`)

**Reader:** removed with EPUB → PDF (D8). EPUB files are no longer accepted as input.

**Writer**
- The `mimetype` entry comes **first**, STORED, with **no extra field**. The self-test checks for `mimetype` at byte offset 30.
- Everything else is DEFLATE level 6.
- The templates are **verbatim** (PLAN.md Appendix B).
- `dcterms:modified` has no milliseconds.
- The ID is `urn:uuid:…`.

### 7.21 Text and subtitles (`subtitles.ts`, `text.ts`)

**Pure ports**, with their tests:
- `decodeText`:
  - a UTF-8 BOM, or a UTF-16 LE/BE BOM, is detected with `encoding_rs`
  - invalid UTF-8 is replaced with U+FFFD, like `TextDecoder`
- `parseSubtitles`, `toSrt`, `toVtt`, `toPlainText`, `shiftCues`, `textToCues` (reading speed 15 cps, 42 characters per line, 0.1 s gap)
- `stripTags`, `guessLang`, `readerCss`, `fontStack`, `textToHtml` (`textToHtml` is still needed for the webview fallback)

**Regexes:** the `regex` crate covers every pattern used, including `\p{L}` and `\p{Ll}`. None of the existing patterns use look-around (✅ checked).

### 7.22 Notifications (`notify.ts`)

**Rules (unchanged)**
1. `revealWhenDone` reveals the first output.
2. Notify only if `notifyWhenDone` is on and the platform supports notifications.
3. Only for `done` or `error`.
4. Skip if the overlay is visible or the main window has focus.
5. **Title:** "<label> — done" or "<label> failed".
6. **Body:**
   - one output → its file name
   - several outputs → "N files saved"
   - then " · note" if there is a note
   - for errors: the error message
7. Silent.

**Click to reveal:** ⚠️ `tauri-plugin-notification` offers no click callback on desktop (🔬 confirm). The default is to accept the loss, since the Done card already has "Show in folder". The option is a platform crate (`notify-rust` on Linux supports actions; Windows toast activation needs a COM activator).

### 7.23 Housekeeping (`housekeeping.ts`)

At startup, in the background:
- remove preview proxies older than 7 days
- remove job temp folders older than 1 day
- log what was removed

---

## 8. Windows and OS integration

### 8.1 Main window (`windows/mainWindow.ts`)

**Window**
- Label `main`; 1000 × 720, minimum 760 × 560; title "Alohamora".
- Created **hidden** with a background colour from the theme (`#161617` dark, `#F3F3F2` light). It is shown on `ui_ready`.

**Chrome per OS**

| OS | Chrome |
|---|---|
| macOS | `TitleBarStyle::Overlay`, `hidden_title(true)`, `traffic_light_position(16, 15)` |
| Windows | `decorations(false)` plus the React `CaptionButtons` (§6.3, item 5) |
| Linux | Native frame |

**Close behaviour**
- If quitting: close.
- macOS: hide.
- If `closeToTray` is on and the tray is active: hide.
- Otherwise: quit.

**Memory option** (decided after S9; §15): destroy the main webview after it has been hidden for 10 minutes, and recreate it on show.

**DevTools:** F12 in debug builds only.

### 8.2 Overlay window (`windows/overlayWindow.ts`)

**Window**
- Label `overlay`; 440 × 500 logical pixels.
- Transparent, no decorations, not resizable; hidden from the taskbar; always on top; no shadow.
- Created hidden at startup and **kept loaded** (this is what keeps the wheel within 150 ms).

**macOS specifics**
- Set `macOSPrivateApi: true`. Transparent windows need it (✅ config key exists); the App Store is out of scope (D5).
- To match Electron's `setAlwaysOnTop(true, 'pop-up-menu')` plus visible-on-full-screen, go through `ns_window()` and objc2:
  - set the window level to `NSPopUpMenuWindowLevel`
  - set the collection behaviour to `canJoinAllSpaces | fullScreenAuxiliary`
- Alternatively, `tauri-nspanel` 2.1 turns the window into a non-activating `NSPanel`. 🔬 S2 decides.

**Placement** (port of `place()`)
1. The anchor is the cursor, or a given point.
2. The wheel anchor sits at offset (220, 210), or the window is centred.
3. Clamp to the **work area of the monitor that contains the anchor**.
   - Tauri reports the cursor and work area in **physical** pixels (✅ `cursor_position`, `monitor_from_point`, `Monitor::work_area`, `scale_factor`).
   - Electron used DIPs, so convert using that monitor's scale factor.
   - 🔬 Test mixed-DPI setups.
4. Set the size and position together. On Windows, use a single `SetWindowPos` through `hwnd()` to avoid flicker.

**Flows**
- **`open_overlay`:**
  1. Basic inspection.
  2. Place the window.
  3. Emit `ev:overlay-init {files, mode, caps, source}`.
  4. Show and focus.
  5. Deep inspection.
  6. Emit `ev:overlay-files`.
- **Global-drag mode, showing without taking focus** (Electron's `showInactive`):

  | OS | How |
  |---|---|
  | Windows | `ShowWindow(SW_SHOWNOACTIVATE)` |
  | macOS | `orderFrontRegardless` without activating the app (or the NSPanel) |
  | Linux | `focusable(false)` or `set_focus_on_map(false)` |

  On drop, focus the window, as Electron's `win.focus()` did.
- **Drag end:** if no drop arrives within 600 ms, hide the overlay.
- **Close on blur** (in the renderer) is unchanged. 🔬 Check that each webview's `window.blur` fires when another app becomes active.
- **Linux transparency** needs a compositor; without one the overlay draws as a black rectangle. Document it, as with today's Electron limitation.

### 8.3 Drag-and-drop (replacing `webUtils.getPathForFile` and HTML5 file drops)

Tauri's native drag-drop handler stays **on** for both webviews (the default).

**Events**
- Rust receives `WindowEvent::DragDrop`, which can be:
  - `Enter { paths, position }`
  - `Over { position }`
  - `Drop { paths, position }`
  - `Leave`

  (✅ this shape was checked in `tauri-runtime` 2.12.1.)
- **Paths arrive on `Enter` and `Drop`, not on `Over`.** Keep the paths from `Enter`.

**Modifier keys at `Enter`/`Drop`:** sample them natively, because the webview may not have focus during an external drag.

| OS | How |
|---|---|
| Windows | `GetAsyncKeyState(VK_MENU / VK_SHIFT)` |
| macOS | `NSEvent.modifierFlags` |
| X11 | `QueryKeymap` |
| Wayland | Unknown, so `false` |

**Emitting:** `ev:drop` goes to that window, with the position converted to CSS pixels (physical ÷ scale factor).

**Safety:** wry already reports the drop effect as **copy** on Windows (`DROPEFFECT_COPY` ✅) and macOS (`NSDragOperation::Copy` ✅). The rule "never move the original" therefore still holds. Keep a manual test for it on each OS.

**Main window:** a drop on the home page or the drop zone opens the overlay with those paths. The mode is "tools" if Alt is held, otherwise "convert".

**Overlay in drag mode:**
1. On `Enter`, inspect the dragged files.
2. Emit them through `ev:overlay-drag`, now on **every** OS.
3. On `Drop`:
   - hit-test the slice
   - check that the slice still means the same thing for the real files (the existing logic in `WheelStage.onDropFiles`)
   - run it

### 8.4 Global drag wheel (`integrations/globalDrag.ts`, `macDragHelper.ts`)

**macOS:** keep the Swift helper unchanged, as an `externalBin`. It writes JSON lines to stdout and exits when stdin closes. Port the event handling (`drag`, `mods`, `files`, `up`) into Rust.

**Windows and Linux X11**
- Replace uiohook with a **60 Hz poller thread**, running only while the setting is on.
- Logic:
  - mouse button 1 down and moved > 12 px → dragging
  - Shift held → show the overlay at the cursor; Alt selects the Tools ring
  - button released → drag end
- Sources:

  | OS | Calls |
  |---|---|
  | Win32 | `GetAsyncKeyState(VK_LBUTTON / VK_SHIFT / VK_MENU)`, `GetCursorPos` |
  | X11 | `x11rb` `QueryPointer` mask (Button1, Shift, Mod1) |

  `device_query` 4.0.1 is an off-the-shelf alternative.
- **Why polling:**
  - no low-level hook, so no hook timeouts and no antivirus heuristics
  - the same design as the macOS helper
- 🔬 S8 must check:
  - whether polling works over elevated windows; if it does, this lifts the current "not over admin apps" limit
  - false triggers from window drags and text selection; uiohook had the same limitation

**Wayland:** unavailable, unchanged.

### 8.5 Tray, menu bar, Dock and app menu (`tray.ts`, `appMenu.ts`)

**Tray**
- `TrayIconBuilder` with an icon, a tooltip and a menu: Open Alohamora · Quit Alohamora.
- On macOS, `icon_as_template(true)` with `trayTemplate@2x.png` (✅ API exists).
- A left click shows the main window on Windows.
- ⚠️ **Linux:** tray click events are not emitted (✅ documented in Tauri's tray code), so Linux gets the menu only.
- Mark the tray as active in app state.

**macOS app menu**
- **App menu:** About, *Settings… ⌘,*, Services, Hide, Hide Others, Show All, Quit. *Settings… ⌘,* shows the main window and emits `ev:navigate 'settings'`.
- **Edit and Window menus:** predefined items.

**Windows and Linux:** no menu bar.

**Dock** (`showInDock`): `set_dock_visibility` or `set_activation_policy` (✅ both exist in 2.12.1).

### 8.6 Single instance, command-line files, Open With (`integrations/argv.ts`)

**Second instance**
- `tauri-plugin-single-instance` passes `(argv, cwd)` to our callback.
- `files_from_argv` ignores:
  - flags
  - `-psn_…`
  - the executable itself
  - the development project folder
- It keeps paths that exist.
- **Deliberate fix:** relative paths are resolved against the **second** instance's `cwd`.
- `queue_files` batches arrivals for 350 ms and de-duplicates them. The batch opens the overlay with source `'argv'`; with no files, the main window shows instead.

**macOS:** `RunEvent::Opened { urls }` file URLs are turned into paths and fed into the same queue, buffered until startup finishes.

**File associations**

| OS | How |
|---|---|
| macOS | `bundle.fileAssociations` with `role: Viewer` and `rank: Alternate` (✅ both fields exist) for the same four groups as `electron-builder.yml` |
| Linux | The `.desktop` `MimeType=` list (the same 27 types) |
| Windows | None (Send To and the right-click verb instead), as today |

### 8.7 Windows: Send To, right-click verb, installer cleanup (`sendTo.ts`, `contextMenu.ts`, `build/installer.nsh`)

**Send To:** `%APPDATA%\Microsoft\Windows\SendTo\Alohamora.lnk`, created with `IShellLinkW` (the `windows` crate):
- target: the executable
- description: "Convert with Alohamora"
- icon: the executable

**Right-click verb:** created with the `windows-registry` crate, **without** spawning `reg.exe`. Under `HKCU\Software\Classes\*\shell\Alohamora`:
- the default value "Convert with Alohamora"
- `Icon`
- `MultiSelectModel=Player`
- `command` = `"<exe>" "%1"`

**Uninstall:** NSIS installer hooks (Tauri `bundle.windows.nsis.installerHooks`, the `NSIS_HOOK_POSTUNINSTALL` macro) delete:
- the verb key
- the `.lnk`
- the Run value

### 8.8 Linux: file-manager menus and autostart (`linuxFileManagers.ts`, `loginItem.ts`)

**File-manager menus:** written verbatim, both executable (`0o755`):
- the Nautilus script `~/.local/share/nautilus/scripts/Convert with Alohamora`
- the Dolphin service menu `~/.local/share/kio/servicemenus/alohamora.desktop`

**Self command:** `$APPIMAGE` if set, otherwise `current_exe()`.

**Autostart:** `~/.config/autostart/alohamora.desktop` with `--hidden`. Implement it ourselves (≈20 lines), so that the AppImage path is handled correctly.

### 8.9 Launch at login

| OS | How |
|---|---|
| Windows, macOS | `tauri-plugin-autostart` with `args: ["--hidden"]`; on macOS use `MacosLauncher::LaunchAgent`. On Windows, our own `HKCU\…\Run` value is an option, for full control over the value name. |
| Linux | §8.8 |

### 8.10 Migration from the Electron build (replaces `integrations/legacy.ts`)

On first start, if the new settings file is missing:

1. **Copy settings** from Electron's `userData` folder:

   | OS | Path |
   |---|---|
   | Windows | `%APPDATA%\Alohamora` |
   | macOS | `~/Library/Application Support/Alohamora` |
   | Linux | `~/.config/Alohamora` |

   The current Kabooks names are also checked.
2. **Re-apply integrations whose stored command includes the executable path.** The executable path changes between builds:
   - the right-click verb
   - the Send To target
   - the login item
3. **Remove Electron's login item:**
   - Windows: find `HKCU\…\Run` values that point at the old install path.
   - macOS: the old login item. 🔬 Find out which mechanism Electron 44 used.
4. **Windows side-by-side installs:**
   - electron-builder installed per user to `%LOCALAPPDATA%\Programs\alohamora`; Tauri NSIS installs elsewhere.
   - The new installer's hook **offers** to run the old uninstaller, found through its `HKCU\…\Uninstall` key. 🔬
5. **Other platforms:**
   - **macOS:** the same bundle ID (`com.alohamora.app`) replaces the app in place.
   - **Linux .deb:** the same package name (`alohamora`) upgrades in place.
   - **AppImage:** a new file.
6. **Kabooks migration:** decide whether to keep it (§15). The default is to fold it into the step above and drop the Kabooks-specific cleanup after one release.

---

## 9. Security and the offline guarantee

**Tauri ACL** (`capabilities/default.json`, windows `main` and `overlay`)
- Allowed:
  - `core:default` and `core:event:default`
  - window `start-dragging`, `minimize`, `toggle-maximize` and `close` (title bar and caption buttons)
  - the app's own commands
- **No `fs`, `shell` or `http` permissions** are exposed to JavaScript.
- `dialog` and `opener` are called only from Rust commands.

**Command input validation** (ported from `ipc.ts`)
- String arrays are checked.
- Paths for `reveal`, `open_path`, `pdf_thumbnails` and `read_metadata` must exist.
- Job requests are typed serde enums.
- **The UI never chooses output paths.** `JobRun` derives every output path (§7.11).

**CSP** (`app.security.csp`; Tauri adds its IPC hashes automatically)

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: kfile: http://kfile.localhost;
media-src 'self' blob: kfile: http://kfile.localhost;
font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; worker-src 'self' blob:
```

The development CSP also allows the Vite dev server.

**Navigation:** allow only the app's own origin (`tauri://localhost` or `http://tauri.localhost`, plus `devUrl` in development); deny new windows. 🔬 Find the exact deny-new-window hook in 2.12.

**Network** *(revision 2: final mechanisms, PLAN.md §3)*
- Electron cancelled **every** http(s)/ws(s) request at the session level. Tauri has no equivalent, so the guarantee
  rests on these, all in place:
  1. **No remote content:** the app never loads or links anything from the internet.
  2. **CSP:** only `'self'`, `data:`, `blob:`, `ipc:` and `kfile:` (plus their Windows `*.localhost` forms).
  3. **No network code at run time:** no HTTP/TLS/WebSocket client crate among the runtime dependencies on any desktop
     target, no socket APIs in our code, no `fetch`/`XMLHttpRequest`/`WebSocket`/remote URLs in the UI. Checked by
     `npm run check:offline` in CI. (Build-only dependencies may download: `tesseract-rs` fetches sources while compiling.)
  4. **WebView2:** browser arguments turn off SmartScreen, background networking, component updates, pings and domain
     reliability on every window (`WEBVIEW2_ARGS`). Its runtime updates are managed by Windows, not by the app.
  5. **Libraries:** Typst without its `packages` feature; Tesseract data only from the bundled `tessdata/`.
  6. **Installer:** the NSIS setup embeds the WebView2 offline installer.
- **Verified:** the whole self-test runs under `unshare -rn` (no network) on Linux CI. macOS and Windows: a manual check
  with a network monitor (PLAN.md Appendix G).

**Sidecars**
- Argument arrays, never a shell. Rust's `std::process` quotes Windows command lines safely.
- We never spawn `.bat`/`.cmd` files, so the BatBadBut class of bugs (CVE-2024-24576) does not apply.

**macOS hardened runtime:** Electron needed `allow-jit`, `allow-unsigned-executable-memory` and `disable-library-validation`. Tauri should need **none of them**. 🔬 Confirm during the notarization dry run (§12.5).

**The Swift helper** still needs no Accessibility permission.

---

## 10. Performance, size and memory

### 10.1 Memory levers

**Process model**
- No Node main process.
- No pdf.js engine window.
- PDFs are opened from a path; there's no full copy of the file into a renderer.
- The overlay is the one webview kept warm, for latency.
- The main window is created lazily and can optionally be destroyed while hidden (§8.1).

**Bounded caches**

| Cache | Limit |
|---|---|
| Probe results | 300 |
| Thumbnails | 200 |
| Waveforms | 100 (new cap) |
| Image proxies | 6 |
| Media proxies | On disk |

**Streaming and decoding**
- `kfile` streams from disk.
- Decode JPEGs at a reduced size for thumbnails and previews where the decoder allows it (IDCT scaling).
- Drop each Tesseract instance and each pdfium document when its job ends.

### 10.2 Size levers

**Release profile:** `lto = "fat"`, `codegen-units = 1`, `strip = true`.
- Keep `panic = "unwind"`, so that a panic inside one job can be caught and reported as an error instead of killing the app.

**Features and assets**
- Turn off default features (`image` with only the needed codecs, and so on).
- Measure with `cargo bloat` after each phase.
- Ship pdfium and the tessdata as resources, not inside the binary.

**Expected total, macOS arm64, installed**

| Component | Size |
|---|---|
| FFmpeg + FFprobe | 126 MB |
| Main binary | 30–60 MB (Typst, Tesseract and the codecs are the big parts; S1/S6 measure them) |
| pdfium | ~6–10 MB |
| tessdata | ~4.5 MB |
| Fonts | ~2–5 MB |
| Drag helper | < 1 MB |
| **Total** | **≈ 170–205 MB** |

### 10.3 Future lever (out of scope, D5)

Slimming FFmpeg would cut the largest remaining piece. Today's static builds embed the full libav* libraries **twice**, once in ffmpeg and once in ffprobe. The options:
- a shared-library build: one copy of the libraries
- a custom configure with only the codecs and filters the app uses

Either is likely to roughly halve the 126 MB. Switching to an LGPL build would also change the x264/x265 story.

### 10.4 Measurement harness (part of the plan)

**Scripts:** one per OS, `scripts/measure.mjs` or a small Rust tool.

**What they measure**

| Metric | How |
|---|---|
| Installed size | `du` of the app bundle or install folder |
| Download size | The size of the installer files |
| Idle RSS | The sum over the **whole process tree** after 60 s |
| Peak RSS during scenarios | 12 MP JPG → WebP; 1080p 60 s video compress; 100-page PDF → PNG at 300 DPI; 20-page OCR |
| Cold start to tray | From a log timestamp |
| Wheel latency | From a log timestamp |

**Process trees to include**

| OS | Processes |
|---|---|
| Windows | `msedgewebview2.exe` children |
| macOS | WebContent, Networking and GPU processes |
| Linux | `WebKitWebProcess` and `WebKitNetworkProcess` |

**Procedure:** run the same scenarios on the Electron build and the Tauri build on the same machine. Record the results in `rewrite/PROGRESS.md` against the budgets in §3.3.

---

## 11. Testing strategy

### 11.1 Where each unit test goes

| Test file | Destination |
|---|---|
| `src/main/engines/{audioArgs,ffmpegArgs,videoArgs,ffmpegParse,imageMeta}.test.ts` | Rust unit tests in `core`, with the same cases and expected argument arrays. |
| `src/main/engines/pdfOps.test.ts` | Replaced by a Rust test that a JPEG under 4 KB embeds (§7.16). |
| `src/main/errors.test.ts`, `src/main/util.test.ts` | Rust (`core::error`, `core::util`). |
| `src/shared/*.test.ts` (13 files) | **Stay in vitest**, because the UI still uses that code. They also feed golden vectors to Rust (§11.2). |
| `src/renderer/**/wheelGeometry.test.ts`, `soundSynth.test.ts` | Stay in vitest. |

### 11.2 Golden vectors across languages

A vitest script (`npm run golden`) writes `src/shared/__golden__/*.json`: pairs of inputs and outputs from the TypeScript implementation.

**Covered functions**
- `naming` (splitName, outputFileName, groupFileName, withCounter, sanitizeFileName, resolveCollision)
- `pageRanges` (including error messages)
- `pdfSplit`
- `split.splitSegments`
- `subtitles` (parse, toSrt, toVtt, shift, textToCues)
- `time` (all formatters and parseTimecode)
- `text` (decodeText, guessLang, readerCss)
- `pdfReflow` (fixtures of positioned text pages → blocks, text, XHTML and chapters)
- `editPipeline`
- `collageLayout`
- `geometry` (clamp, toPixelRect, isFullRect)
- the FFmpeg argument builders
- the registry-derived values

**Use:** Rust tests load the JSON and assert equality. CI regenerates the vectors and **fails if they drift**: a change on one side without the other.

### 11.3 Self-test harness (`src/main/selftest/*` → `engine::selftest` + `app --selftest`)

**Cases:** the same case names (**121**: the two EPUB → PDF cases are gone, D8) in the same groups (`av`, `image`, `text`, `pdf`, `tools.video`, `tools.audio`, `tools.image`, `tools.pdf`, `tools.subtitle`, `errors`), with the same requests and checks. `--only=<group|prefix>` behaves the same way.

**Runtime**
- The self-test runs **inside the app binary** (`--selftest`), headless, before any window is created. The engine also has a stand-alone runner (`cargo run -p alohamora-engine --example selftest`) used during development.
- `report.json` keeps the format `{summary, results[{name, status, ms, info}]}` and the same locations:
  - development: `.selftest/`
  - packaged: `<temp>/alohamora-selftest`
- The exit code is 1 on any failure or when zero cases ran.

**Fixtures rebuilt with Rust tools** (cached under `fixtures/` exactly as today)

| Today | Rust |
|---|---|
| ffmpeg lavfi commands | The same ffmpeg commands |
| sharp | `image`/`resvg` |
| pdf-lib with StandardFonts Helvetica | lopdf with the standard Type 1 Helvetica |
| piexif (`gps.jpg`, orientation 6) | The Rust EXIF writer |
| `printToPDF` (`scan.pdf`) | Typst |

**Assertion helpers**

| Helper | Rust |
|---|---|
| `expectStreams` | ffprobe |
| `expectImage` | Format detection by magic bytes |
| `expectPdfPages` | lopdf or pdfium |
| `expectZipEntries` | `zip` |
| `expectMagic` / `expectTextIncludes` | Same |

sharp reported AVIF as `heif`, so the AVIF case asserts the `ftypavif` brand instead.

### 11.4 Differential testing against the Electron build (during the port)

**On CI, for each OS:**
1. Run the Electron self-test and the Tauri self-test on the same fixtures.
2. Collect facts for each case: output count, dimensions, duration, codecs, page count and byte size.
3. Diff the facts.

**Review triggers:**
- any mismatch in count, dimensions, codecs or pages
- a size difference greater than ±25%, which usually points at image-quality calibration (§7.14)

### 11.5 Manual checklists per OS

These come from the "needs a human" items in `PROGRESS.md`, plus new ones:
- the real global drag gesture
- dropping from Finder, Explorer and Nautilus, and checking the original is never moved
- Open With and Dock drop
- tray and menu bar
- notifications
- sounds
- video preview playback and **seeking** (WebKitGTK in particular)
- visual review of TXT → PDF
- a keyboard-only walkthrough
- reduced motion
- the overlay over full-screen apps and macOS Spaces
- multiple monitors with mixed DPI
- Linux X11 and Wayland sessions
- Windows: dragging over an elevated app
- first launch of a downloaded, signed, notarized build

---

## 12. Build, packaging, signing, CI

### 12.1 Toolchain and development workflow

**Toolchain**
- Rust stable, pinned in `rust-toolchain.toml`. `tesseract-rs` needs Rust ≥ 1.88.
- Node 22 for the UI, with `@tauri-apps/cli` 2.x and `@tauri-apps/api` 2.x.

**Scripts**

| Script | Becomes |
|---|---|
| `dev` | `tauri dev` |
| `build` | `tauri build` |
| `test` | vitest + `cargo test --workspace` |
| `typecheck` | renderer + shared only |
| `selftest` | `cargo run -p alohamora --release -- --selftest` |
| `golden` | Writes the golden vectors |
| `measure` | §10.4 |
| `fetch-binaries`, `check-binaries` | Adapted |

**Vite:** a plain `vite.config.ts` with root `src/renderer`, the aliases `@shared` and `@renderer`, one HTML entry (`index.html`), and a fixed dev port for `devUrl`.

**Linux build dependencies:** `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `build-essential`, `cmake`, `clang` (Tesseract), `xvfb` (CI), and GStreamer development and runtime packages for media.

### 12.2 Fetching binaries (`scripts/fetch-binaries.mjs`, adapted)

**Sidecars** go to `src-tauri/binaries/` with a target-triple suffix:
- `ffmpeg-<triple>[.exe]`
- `ffprobe-<triple>[.exe]`
- `alohamora-drag-helper-<triple>`, built by `build-mac-helper.mjs`

The triples are `x86_64-pc-windows-msvc`, `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu` and `aarch64-unknown-linux-gnu`. The FFmpeg sources are unchanged: gyan.dev on Windows and Martin Riedl's builds on macOS and Linux.

**Resources** go to `src-tauri/resources/`:
- pdfium from bblanchon/pdfium-binaries (pinned tag)
- `tessdata/{eng,vie}.traineddata` (tessdata_fast) plus `pdf.ttf`
- the Noto font subsets for Typst

**New: pin SHA-256 checksums** for every download. Today's script only trusts its sources.

**`check-binaries.mjs`:** the same encoder checks, plus checks for pdfium, `pdf.ttf` and the fonts.

### 12.3 `tauri.conf.json` essentials (sketch)

```jsonc
{
  "productName": "Alohamora", "version": "0.2.0", "identifier": "com.alohamora.app",
  "build": { "frontendDist": "../dist/renderer", "devUrl": "http://localhost:5173",
             "beforeDevCommand": "npm run dev:ui", "beforeBuildCommand": "npm run build:ui" },
  "app": {
    "windows": [],                                   // both windows are created in Rust (§8.1, §8.2)
    "macOSPrivateApi": true,                         // transparent overlay
    "security": { "csp": "…§9…", "devCsp": "…" }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "dmg", "app", "appimage", "deb"],   // narrowed per OS by the platform configs
    "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"], // macOS config adds binaries/alohamora-drag-helper
    "resources": { "resources/tessdata": "tessdata", "resources/pdfium": "pdfium",
                   "resources/fonts": "fonts", "../THIRD_PARTY_NOTICES.md": "THIRD_PARTY_NOTICES.md" },
    "fileAssociations": [ /* 4 groups, role Viewer, rank Alternate (macOS); mimeType per type (Linux) */ ],
    "macOS": { "minimumSystemVersion": "12.0", "signingIdentity": "-", "entitlements": null, "hardenedRuntime": true },
    "windows": { "webviewInstallMode": { "type": "embedBootstrapper", "silent": true },
                 "nsis": { "installMode": "currentUser", "installerHooks": "./windows/hooks.nsh" } },
    "linux": { "appimage": { "bundleMediaFramework": true },
               "deb": { "depends": ["libwebkit2gtk-4.1-0", "libayatana-appindicator3-1"] } }
  }
}
```

### 12.4 Packaging per OS

| OS | Artifacts | Notes |
|---|---|---|
| Windows x64 | NSIS installer (per user) | **WebView2**<br>• Windows 10/11 normally already have the evergreen runtime.<br>• `embedBootstrapper` (+1.8 MB) installs it if missing, but **needs internet**.<br>• Offer a second, "offline" installer built with `offlineInstaller` (+127 MB to the download only).<br><br>**Portable build**<br>• ⚠️ Tauri has no portable `.exe` target.<br>• Ship a **portable `.zip`** instead: the exe, sidecars and resources. It needs WebView2 on the machine. |
| macOS arm64, x64 | `.app` + `.dmg` per architecture, plus a `.zip` of the `.app` (made with `ditto`, matching today's zip) | A universal build would double FFmpeg's size, so builds stay per architecture. Minimum macOS 12. |
| Linux x64 (arm64 optional) | AppImage + `.deb` | **AppImage**<br>• `bundleMediaFramework: true` bundles GStreamer so video previews work.<br>• 🔬 Measure the size cost; it may push AppImage over budget. In that case drop it and rely on the 480p proxy (§7.9).<br><br>**.deb**<br>• Depends on WebKitGTK 4.1 and the appindicator library.<br>• *Recommends* `gstreamer1.0-plugins-good`, `-bad` and `gstreamer1.0-libav`. |

### 12.5 Signing and notarization (in scope, D4)

**macOS**

1. **Certificate:** a Developer ID Application certificate. On CI, import it from a base64-encoded `.p12` secret into a temporary keychain.
2. **Signing:**
   - `bundle.macOS.signingIdentity` names the certificate.
   - The hardened runtime is on.
   - Entitlements are minimal; none are expected (§9).
3. **Every Mach-O must be signed by us:**
   - the main binary
   - ffmpeg and ffprobe (Riedl signs them with their own ID; re-sign with `--force`)
   - `alohamora-drag-helper`
   - `libpdfium.dylib`
   - 🔬 Check which of these the Tauri bundler signs automatically, and sign the rest in a `beforeBundleCommand` step.
4. **Notarize:**
   - Preferred: an App Store Connect API key (`APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`).
   - Otherwise: `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.
   - Staple the ticket to the `.app` and the `.dmg`.
5. **Verify:**
   - `codesign --verify --deep --strict --verbose=2`
   - `spctl -a -vv`
   - first launch of a *quarantined* download on a clean Mac
6. **Without an identity:** keep ad-hoc signing (`signingIdentity: "-"`). The README trap still applies: an *invalid* signature shows as "damaged". Keep the iCloud-folder warning too.

**Windows**

1. **Signing:** Authenticode with an RFC 3161 timestamp.
   - Since 2023, private keys for code signing must live in hardware.
   - **Recommended:** Azure Trusted Signing (Artifact Signing) through the bundler's custom sign command (`bundle.windows.signCommand`, ✅ present in 2.12.1). A cloud HSM such as DigiCert KeyLocker or SSL.com eSigner also works.
2. **Sign:** `alohamora.exe`, `ffmpeg.exe`, `ffprobe.exe`, the installer and the uninstaller.
3. **SmartScreen:** reputation builds up over time; even EV certificates no longer get it immediately.

**Linux:** optionally a GPG detached signature for the AppImage and `.deb`, and a `SHA256SUMS` file.

**Secrets inventory** (GitHub Actions; on the release workflow only):
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`
- `APPLE_API_ISSUER`, `APPLE_API_KEY`, and the `.p8` content
- the Azure Trusted Signing client ID, secret and tenant, plus the account and profile names
- the GPG key (optional)

**Release checklist:** extend `PLAN.md` Task 13.4 with:
- signature checks per OS
- notarization stapling
- `SHA256SUMS`
- the network-silence check (§9)

### 12.6 CI

**PR workflow** (no secrets; ad-hoc or unsigned builds), as a matrix:
- `windows-latest`
- `macos-15` (arm64)
- `macos-15-intel` (x64; GitHub supports it until August 2027)
- `ubuntu-22.04` (x64)
- `ubuntu-22.04-arm` (optional, arm64)

**Steps**
1. Check out the code.
2. Set up Node 22 and Rust (`dtolnay/rust-toolchain`).
3. Restore the caches: `Swatinem/rust-cache`, the `tesseract-rs` build cache folder, and the npm cache.
4. Install the Linux packages.
5. `npm ci`.
6. `fetch-binaries` (this also builds the Swift helper on macOS), then `check-binaries`.
7. `npm run typecheck`.
8. `npm test`, which includes the golden-drift check.
9. `cargo clippy -D warnings`.
10. `cargo test --workspace`.
11. `cargo deny check` (licences and banned crates).
12. Self-test. Linux runs under `xvfb-run`.
13. `strace` network-silence check (Linux).
14. `tauri build`.
15. Measure the size.
16. Upload the artifacts, `report.json` and the size report.

**Release workflow** (on a tag): the same steps, plus signing, notarization, checksums and a GitHub Release draft.

**During the port:** a **differential job** builds the Electron app too and diffs the self-test facts (§11.4). It is removed at cutover.

### 12.7 Licences and notices

**Rewrite `THIRD_PARTY_NOTICES.md`.**

| Remove | Add |
|---|---|
| Electron/Chromium, sharp/libvips, pdf.js, pdf-lib, docx, JSZip, fast-xml-parser, exifr, piexifjs, imagetracerjs, tesseract.js, uiohook-napi | Tauri and wry (MIT/Apache-2.0)<br>pdfium (BSD-3/Apache-2.0 plus third-party)<br>Tesseract (Apache-2.0)<br>Leptonica (BSD-2)<br>libheif and libde265 (**LGPL-3.0, dynamically linked**)<br>Typst (Apache-2.0)<br>Noto fonts (OFL-1.1)<br>resvg (Apache/MIT)<br>vtracer (MIT/Apache)<br>`image` and codec crates<br>mozjpeg (IJG/BSD)<br>libwebp (BSD-3)<br>rav1e (BSD-2)<br>lopdf (MIT)<br>docx-rs (MIT)<br>zip and quick-xml (MIT)<br>… |

- The FFmpeg GPL section stays unchanged.
- **Generation:** produce the Rust crate list with `cargo-about`.
- **Enforcement:** `cargo-deny` keeps an allow-list of licences and bans these known GPL/AGPL crates, all found during this research:

  | Crate | Licence |
  |---|---|
  | `imagequant` 4.x | GPL-3.0-or-later |
  | `uiohook-rs` | GPL-3.0 |
  | `heic` | AGPL-3.0 or commercial |

- **WebView2** is a system component; no notice is needed unless the fixed runtime is bundled.

---

## 13. Phases and milestones

### 13.0 Spikes (do these first; record the outcomes in §15)

| # | Question | Approach | Exit criteria | If it fails |
|---|---|---|---|---|
| **S1** | Can each OS webview print EPUB chapters to PDF headlessly with explicit page sizes? Can Typst produce TXT → PDF that matches today? | A Tauri test app with a hidden webview and `with_webview` print code for WebView2, WKWebView and WebKitGTK; Typst rendering of `text.txt` with bundled fonts. | `book.epub` and `fixed.epub` produce correct page counts and orientation on all 3 OSes; TXT with Vietnamese text renders correctly; record the binary-size delta for Typst. | XHTML → Typst for reflow; the image fast path for fixed layout; ⚠️ document lower fidelity. |
| **S2** | Does the overlay behave? | The transparent window over full-screen apps and Spaces (macOS); showing without activation during an external drag; `Enter` paths arriving when the window appears under an ongoing drag; focus hand-off on drop; blur → close; mixed DPI. | Matches today's behaviour on Windows and macOS; on Linux X11, same as today. | `tauri-nspanel` on macOS; direct Win32 calls; document any Linux limits. |
| **S3** | Media previews through `kfile://` | Playback and seeking for MP4 (H.264/AAC), WebM and a large file; proxy playback; on each webview. | Seeking works without loading from the start (the known asset-protocol problem); `canPlayType`-driven proxying works. | Loopback HTTP for media on Linux (§7.10). |
| **S4** | Can pdfium replace pdf.js, and lopdf replace pdf-lib? | Page sizes (CropBox and rotation), rendering at DPI, text items → `reflowPages` on `doc.pdf` plus real PDFs; lopdf merge, organize, metadata and recompress on real-world files. | `doc.pdf` gives the same blocks; 2550 px at 300 DPI; merges open in Acrobat, Preview and pdf.js. | Merge via pdfium page import; tune the run grouping. |
| **S5** | Image stack parity | Run every image self-test fixture through the Rust pipeline; also CMYK JPEG, ICC P3, 16-bit PNG, HEIC (iPhone), animated GIF/WebP (first frame), large 50 MP JPEG (memory). | All image self-test cases pass; sizes within ±15–25% of Electron; HEIC decodes on all OSes; memory ≤ baseline. | Bind libvips (+18 MB) for the operations that fail. |
| **S6** | Native OCR | `tesseract-rs` static build on all 4 to 5 targets; eng+vie on `scan.pdf`; searchable PDF output. | `convert.pdf.scan-txt-ocr` and the OCR tool cases pass; build time is cached under 2 minutes on a cache hit. | Tesseract CLI as a sidecar (larger, needs per-OS builds); our own text layer for PDF output. |
| **S7** | Internal drag-reorder | Pointer-event `ReorderList`/`OrganizePanel` prototype on Windows with the native drop handler on. | Reordering works on all OSes; file drops still deliver paths. | — |
| **S8** | Global drag without hooks | 60 Hz poller on Windows and X11; elevated target app; false-trigger review. | Parity with the uiohook behaviour; CPU < 0.5% while idle. | `device_query`; a maintained fork of `rdev` (check its licence). |
| **S9** | Baselines | Measure the Electron build per OS with the §10.4 harness. | Numbers recorded in §3.3. | — |

### 13.1 Phases

| Phase | Deliverables | Exit criteria |
|---|---|---|
| **P1 — Scaffold** | **Structure**<br>• `src-tauri` workspace (core / engine / app).<br>• Plain Vite config for the renderer.<br>• The `api` shim, with Electron fallback.<br><br>**App basics**<br>• Both windows; CSP; ACL.<br>• Logging, settings, capabilities.<br>• `ui_ready`.<br><br>**Tooling and CI**<br>• `fetch-binaries` producing sidecars.<br>• CI skeleton. | `tauri dev` shows the Home, Formats and Settings views on all OSes; settings persist; caps show FFmpeg; CI builds on the matrix. |
| **P2 — Core port** | All pure modules in `core` (§5.3); registry JSON plus ts-rs types (§5.5); golden vectors; ported unit tests. | `cargo test` is green; golden-drift check is green; the UI still type-checks against the generated types. |
| **P3 — Engine foundation + AV** | Process runner, FFmpeg runner, probe, jobs (context, execute, queue), error mapping, hardware video, AV converter, self-test harness and fixtures (AV subset). | Self-test groups `av` and the AV half of `errors` are green on all OSes. |
| **P4 — First spin (M1 parity)** | Native drop (§8.3), overlay placement and flows, the `kfile` protocol and media previews, thumbnails, `inspect`, pointer-event reorder, caption buttons. | Drop → wheel → convert → Done works on every OS; previews play; the ≤ 150 ms wheel budget holds. |
| **P5 — Images** | §7.14 engine; image converters and the 9 image tools; image preview operations; EXIF read and write. | `image` and `tools.image` groups green; S5 parity report reviewed. |
| **P6 — PDF, DOCX, EPUB writer, OCR** | pdfium actor, lopdf operations, the 8 PDF tools, PDF → images/TXT/DOCX/EPUB, the DOCX writers, the EPUB writer, OCR. | `pdf` (except EPUB → PDF), `tools.pdf` and `tools.subtitle` green. |
| **P7 — Text → PDF** | Typst TXT path. *(Revision 2: EPUB → PDF and the per-OS printers are dropped, D8.)* | `text` group green; visual checklist signed off. |
| **P8 — Desktop integration** | Tray, menus, Dock; single instance and argv; Open With; Send To; verb; Linux menus; autostart; global drag (helper and poller); notifications; Electron → Tauri migration; housekeeping. | The manual checklist (§11.5) passes per OS; full self-test is green with the same pass counts as Electron. |
| **P9 — Packaging, signing, budgets** | Platform configs; NSIS hooks; WebView2 modes; portable zip; AppImage/.deb; signing and notarization pipeline; rewritten notices and `cargo-deny`; measurement harness run. | Signed and notarized artifacts install and launch on clean machines; **§3.3 budgets met** (or exceptions recorded and accepted). |
| **P10 — Cutover** | Remove Electron (`src/main`, `src/preload`, `electron*` configs and dependencies, `asar` scripts); move the Electron docs to `docs/electron/`; update the README, notices and CI; rename `rewrite/` docs as wanted. | One shell remains; CI is green; release candidate tagged. |

---

## 14. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| *(void since D8)* EPUB → PDF fidelity drops without Chromium's `printToPDF` | — | — | S1 first; per-OS native print; Typst fallback; image fast path for fixed layout; acceptance by self-test plus visual checklist. ⚠️ |
| WebKitGTK media (codecs and GStreamer) and custom-scheme seeking | Medium | Medium | `canPlayType`-driven proxies; GStreamer in the AppImage; loopback fallback (S3). ⚠️ |
| Image-output differences from libvips (colour, sharpness, file sizes) | Medium | Medium | Calibration in S5; differential testing; libvips bindings as a contained fallback. |
| pdfium text runs differ from pdf.js, changing the reflow output | Medium | Medium | S4; tune the run grouping; golden reflow fixtures. |
| Overlay focus and level behaviour (macOS Spaces, Windows non-activating show) | Medium | High (it is the signature gesture) | S2; `tauri-nspanel`; direct native calls. |
| HTML5 drag-and-drop disabled on Windows when native drop is on | Certain | Low | Pointer-event reorder (S7). |
| Native build complexity (Tesseract, libheif, pdfium, libwebp, mozjpeg) on 5 targets | Medium | Medium | Cached builds; pin versions; prebuilt pdfium; dynamic libheif; CI matrix from P1. |
| Licence contamination (GPL/AGPL crates; static LGPL) | Low | High | `cargo-deny` allow-list; dynamic libheif; notices generated. |
| The offline guarantee is weaker without session-level request blocking | Low | High | CSP; no remote content; no HTTP client crates; WebView2 reputation checks off; `strace` CI check. |
| WebView2 missing on offline Windows machines | Low | Medium | `embedBootstrapper` plus an offline-installer variant; clear error at startup. |
| Notification click-to-reveal lost | Certain | Low | Accept; the Done card has Show in folder; platform crates later. ⚠️ |
| Two installs side by side on Windows after upgrading | Medium | Low | Uninstall hook offers to remove the Electron version (§8.10). |
| Agent drift on a large port | Medium | High | Golden vectors; differential tests; the same self-test names; per-task file lists in PLAN.md. |
| Budget miss on size (Typst or codecs larger than estimated) | Low | Medium | Measure in S1/S5; feature-gate; fall back to a lighter TXT renderer (`krilla` plus our own line layout). |

---

## 15. Open decisions (defaults chosen; resolved in revision 2)

| # | Decision | Default | Revisit after | Resolution (revision 2) |
|---|---|---|---|---|
| Q1 | Windows title bar | Custom React caption buttons (`decorations: false`). The alternative is native decorations, which add a second bar. `tauri-plugin-decorum` was last released in 2024, so not that. | P4 review | Custom caption buttons, as proposed. |
| Q2 | EPUB → PDF engine | Native webview print per OS, with Typst as the fallback | S1 | Void: EPUB → PDF removed (D8). |
| Q3 | Image stack | Pure-Rust codecs, plus libheif (dynamic) and libwebp | S5 | Pure-Rust codecs + libwebp; **no libheif** (HEIC decoded by FFmpeg). |
| Q4 | AVIF decode | FFmpeg fallback (no dav1d build) | S5 | FFmpeg. |
| Q5 | Collage "attention" crop | `smartcrop2` | S5 | Centre crop (smartcrop2 not used). |
| Q6 | DOCX writer | `docx-rs`; our own writer if sections or numbering are missing | P6 | Our own writer. |
| Q7 | Type generation | `ts-rs` (stable); not `tauri-specta` (RC) | P2 | No type generation; hand-written `types.rs`, registry JSON generated from TypeScript. |
| Q8 | Destroy the main webview while hidden in the tray | Off; on if S9 shows a large win | S9 / P9 | Off (not implemented); revisit after measuring. |
| Q9 | Notification click-to-reveal | Accept the loss | P8 | Loss accepted. |
| Q10 | Kabooks-era migration code | Fold into the Electron → Tauri migration; delete one release later | P8 | Folded in (`integrations/legacy.rs`). |
| Q11 | Linux arm64 in CI | Optional job (`ubuntu-22.04-arm`) | P1 | Not added; the CI matrix has Windows x64, macOS arm64 + x64, Linux x64. |
| Q12 | Portable Windows build | Portable `.zip` | P9 | No portable build (Tauri has no portable target); see PLAN.md Appendix F. |
| Q13 | macOS overlay: plain NSWindow with level tweaks, or `tauri-nspanel` | Plain plus objc2 calls | S2 | Plain NSWindow + objc2 calls. |
| Q14 | Global drag on Windows/X11 | Our own poller | S8 | Own poller. |
| Q15 | Login item on Windows | `tauri-plugin-autostart` | P8 | `tauri-plugin-autostart`. |

---

## Appendix A. File-by-file port map

| Current file | Target | Notes |
|---|---|---|
| `src/main/index.ts` | `app/src/main.rs`, `app/src/lifecycle.rs` | §7.1 |
| `src/main/ipc.ts` | `app/src/commands/*.rs` | §6.2 validators |
| `src/main/appState.ts` | `app/src/state.rs` | quitting and tray flags in managed state |
| `src/main/capabilities.ts` | `engine/src/capabilities.rs` | §7.3 |
| `src/main/errors.ts` (+ test) | `core/src/error.rs` | §7.6 |
| `src/main/housekeeping.ts` | `app/src/housekeeping.rs` | §7.23 |
| `src/main/imagePreview.ts` | `engine/src/preview/image.rs` | §7.9 |
| `src/main/inspect.ts` | `engine/src/inspect.rs` | §7.9 |
| `src/main/log.ts` | `tauri-plugin-log` setup in `app/src/logging.rs` | §7.5 |
| `src/main/metadata.ts` | `engine/src/metadata.rs` | §7.9 |
| `src/main/notify.ts` | `app/src/integrations/notify.rs` | §7.22 |
| `src/main/paths.ts` | `engine/src/paths.rs` (struct) + `app` resolver | §7.4 |
| `src/main/previews.ts` | `engine/src/preview/media.rs` | §7.9 |
| `src/main/protocol.ts` | `app/src/protocol/kfile.rs` | §7.10 |
| `src/main/security.ts` | `tauri.conf.json` CSP + `app/src/security.rs` | §9 |
| `src/main/settings.ts` | `engine/src/settings.rs` | §7.2 |
| `src/main/thumbnails.ts` | `engine/src/thumbnails.rs` | §7.9 |
| `src/main/util.ts` (+ test) | `core/src/util.rs` (`path_key`), `engine/src/fsutil.rs` (`move_file`, `remove_older_than`) | `mapLimit` → `futures::stream::buffered` |
| `src/main/converters/{av,image,pdf,epub,text,subtitle,index}.ts` | `engine/src/convert/*.rs` | §7.12 |
| `src/main/engines/ffmpegArgs.ts`, `videoArgs.ts`, `audioArgs.ts` (+ tests) | `core/src/ffmpeg_args/{common,video,audio}.rs` | §7.8 |
| `src/main/engines/ffmpegParse.ts` (+ test) | `core/src/ffmpeg_parse.rs` | §7.7 |
| `src/main/engines/ffmpeg.ts`, `process.ts` | `engine/src/{ffmpeg,process}.rs` | §7.7 |
| `src/main/engines/hwVideo.ts` | `engine/src/hw_video.rs` | §7.3 |
| `src/main/engines/image.ts`, `heif.ts`, `svg.ts` | `engine/src/image/{load,save,heic,svg}.rs` | §7.14 |
| `src/main/engines/imageEdit.ts`, `imageBackground.ts`, `imageCollage.ts` | `engine/src/image/{edit,background,collage}.rs` | §7.14 |
| `src/main/engines/imageMeta.ts` (+ test) | `core/src/image_meta.rs` | Verbatim byte logic |
| `src/main/engines/imageMetaEdit.ts` | `engine/src/image/exif.rs` | §7.14 |
| `src/main/engines/pdfEngine.ts` + `windows/engineWindow.ts` + `renderer/src/engine/*` + `preload/engine.ts` + `renderer/engine.html` | `engine/src/pdf/actor.rs` | §7.15. The engine window is removed. |
| `src/main/engines/pdfOps.ts` (+ test), `pdfCompress.ts` | `engine/src/pdf/{edit,create,compress}.rs` | §7.16 |
| `src/main/engines/print.ts` | `engine/src/text_pdf.rs` (Typst; no print windows since D8) | §7.17 |
| `src/main/engines/ocr.ts` | `engine/src/ocr.rs` | §7.18 |
| `src/main/engines/docxWriter.ts` | `engine/src/docx.rs` | §7.19 |
| `src/main/engines/epubReader.ts`, `epubWriter.ts`, `epubTemplates.ts` | `engine/src/epub.rs` (writer only; the reader is dropped, D8) | §7.20 |
| `src/main/engines/bytes.ts` | — (dropped) | pdf-lib workaround |
| `src/main/jobs/{context,execute,queue}.ts` | `engine/src/jobs/{context,execute,queue}.rs` | §7.11 |
| `src/main/tools/**` (36 runners + `common.ts` files) | `engine/src/tools/{video,audio,image,pdf,subtitle}/*.rs` | §7.13 |
| `src/main/integrations/appMenu.ts` | `app/src/integrations/menu.rs` | §8.5 |
| `src/main/integrations/argv.ts` | `app/src/integrations/argv.rs` | §8.6 |
| `src/main/integrations/contextMenu.ts`, `sendTo.ts` | `app/src/integrations/windows_shell/{context_menu,send_to}.rs` | §8.7 |
| `src/main/integrations/globalDrag.ts` | `app/src/integrations/global_drag/{windows,x11}.rs` | §8.4 |
| `src/main/integrations/macDragHelper.ts` | `app/src/integrations/global_drag/macos.rs` | §8.4 |
| `src/main/integrations/index.ts` | `app/src/integrations/mod.rs` (`apply_integrations(s, prev)`) | Same "changed" semantics |
| `src/main/integrations/legacy.ts` | `app/src/integrations/migrate.rs` | §8.10 |
| `src/main/integrations/linuxFileManagers.ts`, `loginItem.ts` | `app/src/integrations/linux/{file_managers,autostart}.rs` + `autostart.rs` | §8.8, §8.9 |
| `src/main/integrations/tray.ts` | `app/src/integrations/tray.rs` + `dock.rs` | §8.5 |
| `src/main/windows/mainWindow.ts`, `overlayWindow.ts` | `app/src/windows/{main,overlay}.rs` | §8.1, §8.2 |
| `src/main/selftest/**` | `engine/src/selftest/{cases/*,fixtures,assert}.rs` + `app/src/selftest.rs` (entry point) | §11.3 |
| `src/main/types/shims.d.ts` | — (dropped) | — |
| `src/preload/index.ts`, `index.d.ts` | `src/renderer/src/lib/api.ts` (shim) | §6.1 |
| `src/shared/*.ts` | Stay (TS) + Rust ports in `core` + registry JSON + generated types | §5.5 |
| `native/mac/DragHelper.swift` | Unchanged; output named `alohamora-drag-helper-<triple>` | §8.4 |
| `scripts/fetch-binaries.mjs`, `check-binaries.mjs`, `build-mac-helper.mjs` | Adapted | §12.2 |
| `scripts/make-icons.mjs` | Keep (it uses sharp only at build time), then `tauri icon build/icon.png` | — |
| `scripts/copy-pdfjs-assets.mjs`, `asar-unpack-list.mjs` | Dropped | — |
| `electron-builder.yml` | `src-tauri/tauri.conf.json` + platform configs | §12.3 |
| `electron.vite.config.ts` | `vite.config.ts` | §12.1 |
| `build/entitlements.mac.plist` | Minimal or none | §9 |
| `build/installer.nsh` | `src-tauri/windows/hooks.nsh` (NSIS installer hooks) | §8.7 |
| `.github/workflows/build.yml` | Rewritten (PR + release) | §12.6 |

---

## Appendix B. Crate shortlist (versions from crates.io on 2026-10-07)

*(Revision 2: not used in the end — `libheif-rs`, `ts-rs`, `fast_image_resize`, `smartcrop2`, `quantette`, `moxcms`,
`little_exif`, `docx-rs`, `quick-xml`, `cargo-deny`/`cargo-about`. Added: `color_quant`, `png`, `typst-pdf`. The final list
is PLAN.md §2.)*

| Crate | Version | Licence | Use |
|---|---|---|---|
| tauri / wry | 2.12.1 / 0.57.0 | MIT/Apache-2.0 | Shell |
| tauri-plugin-single-instance | 2.5.2 | MIT/Apache-2.0 | §8.6 |
| tauri-plugin-dialog | 2.8.1 | MIT/Apache-2.0 | Pickers |
| tauri-plugin-opener | 2.7.0 | MIT/Apache-2.0 | Reveal and open |
| tauri-plugin-notification | 2.5.1 | MIT/Apache-2.0 | §7.22 |
| tauri-plugin-autostart | 2.7.0 | MIT/Apache-2.0 | §8.9 |
| tauri-plugin-log | 2.10.0 | MIT/Apache-2.0 | §7.5 |
| tokio / tokio-util | 1.53.2 / 0.7.19 | MIT | Async, cancellation |
| serde_json (`preserve_order`) | 1.0.151 | MIT/Apache-2.0 | IPC, registry |
| ts-rs | 12.0.1 | MIT | TS types |
| thiserror / anyhow | 2.0.21 / — | MIT/Apache-2.0 | Errors |
| regex, encoding_rs | — | MIT/Apache-2.0 | Text |
| image | 0.25.10 | MIT/Apache-2.0 | Codecs |
| fast_image_resize | 6.1.0 | MIT/Apache-2.0 | Resampling |
| mozjpeg | 0.10.13 | IJG | JPEG encode |
| webp | 0.3.1 | MIT/Apache-2.0 (libwebp BSD-3) | Lossy WebP |
| ravif | 0.13.0 | BSD-3 | AVIF encode |
| resvg / usvg / tiny-skia | 0.48.1 / 0.48.1 / 0.12.0 | Apache-2.0/MIT, BSD-3 | SVG, overlays |
| moxcms | 0.9.1 | BSD-3/Apache-2.0 | ICC |
| palette | 0.7.7 | MIT/Apache-2.0 | LCh modulate |
| quantette | 0.6.0 | MIT/Apache-2.0 | PNG palette (**not** imagequant 4, which is GPL-3) |
| smartcrop2 | 0.4.0 | MIT | Attention crop |
| libheif-rs | 3.0.0 | MIT (libheif LGPL-3) | HEIC decode |
| kamadak-exif | 0.6.1 | BSD-2 | EXIF read |
| little_exif / img-parts | 0.6.23 / 0.4.0 | MIT/Apache-2.0 | EXIF write, segments |
| vtracer | 0.6.5 | MIT/Apache-2.0 | Raster → SVG |
| pdfium-render | 0.9.4 | MIT/Apache-2.0 | PDF read and render |
| lopdf | 0.45.0 | MIT | PDF edit |
| pdf-writer / krilla | 0.15.0 / 0.8.2 | MIT/Apache-2.0 | Optional PDF creation |
| typst / typst-as-lib | 0.15.1 / 0.16.0 | Apache-2.0 / MIT | TXT → PDF, EPUB fallback |
| tesseract-rs | 0.4.0 | MIT (Tesseract Apache-2.0, Leptonica BSD-2) | OCR |
| docx-rs | 0.4.22 | MIT | DOCX |
| zip / quick-xml | 8.6.0 / 0.42.0 | MIT | EPUB, DOCX |
| windows / windows-registry | 0.62.2 / 0.100.0 | MIT/Apache-2.0 | Win32, registry, IShellLink |
| objc2 / objc2-app-kit | 0.6.5 / 0.3.2 | MIT | macOS window level, modifiers, print |
| webkit2gtk | 2.0.2 | MIT | Linux print |
| x11rb | 0.14.0 | MIT/Apache-2.0 | X11 poller |
| device_query | 4.0.1 | MIT | Alternative poller |
| tauri-nspanel | 2.1.0 | MIT/Apache-2.0 | Option for the macOS overlay |
| cargo-deny / cargo-about | 0.20.2 / 0.9.2 | MIT/Apache-2.0 | Licence policy and notices |

**Banned:**

| Crate | Licence |
|---|---|
| `imagequant` 4 | GPL-3.0-or-later |
| `uiohook-rs` 0.2.6 | GPL-3.0 |
| `heic` 0.1.6 | AGPL-3.0 |
| any HTTP client crate | — (runtime) |

**Stale or not used:**

| Crate | Last release | Note |
|---|---|---|
| `rdev` | 2023-06 | — |
| `leptess` | — | Replaced by `tesseract-rs` |
| `tauri-plugin-decorum` | 2024-09 | — |
| `tauri-specta` | 2.0.0-rc.25 | Still a release candidate |

---

## Appendix C. Behaviours that must survive the port (checklist)

**Never modify an original**
- [ ] Drops are always *copy*, never *move* (wry ✅; manual test per OS).
- [ ] Originals are never modified or overwritten.
- [ ] Outputs are written to temp first, then moved.
- [ ] An output is never placed over an input.
- [ ] Collisions get ` (n)`.

**No shell, no network**
- [ ] Sidecars always get argument arrays; never a shell.
- [ ] No network at runtime (§9).

**Output naming**
- [ ] Output naming rules exactly as in `naming.ts` and `JobRun.finalize`, including group folders and zero padding.
- [ ] Paths are compared case-insensitively on Windows and macOS, case-sensitively on Linux.

**Startup and inputs**
- [ ] Command-line files are batched for 350 ms and de-duplicated.
- [ ] macOS Open With before `ready` is buffered.
- [ ] Folders expand one level, at most 500 files.

**Overlay**
- [ ] The wheel is pre-warmed; the overlay is placed at the cursor and clamped to the work area.
- [ ] Re-placement isn't triggered by deep-inspection updates (UI logic; keep the `resize_overlay` semantics).
- [ ] Drag end hides the overlay after 600 ms if no drop arrived.
- [ ] macOS helper: contents are read only after Shift; no Accessibility permission.

**Job progress**
- [ ] Progress is throttled to 100 ms; state changes are always sent.
- [ ] Concurrency comes from settings; at most 50 finished jobs are kept.

**Quality and safety rules in the tools**
- [ ] Hardware encoder failure → one CPU retry, with the note "Hardware encoder failed — used CPU".
- [ ] Smart remux: a stream copy when the codecs fit the target container, with the note "Copied streams without re-encoding"; HEVC to MP4/MOV gets `-tag:v hvc1`.
- [ ] Tools re-encode video at CRF ≤ 20 and audio at ≥ 192 kbps.
- [ ] Loudnorm: `-ar` goes **before** the codec arguments; channel arguments go **after** the codec arguments.
- [ ] Compress tools drop a result that isn't smaller, with the matching note.

**Image specifics**
- [ ] Image tools keep the input format (`sameImageFmt`); JPEG and BMP alpha is flattened onto white.
- [ ] The lossless JPEG metadata strip is skipped when the orientation isn't 1, so photos don't turn sideways.
- [ ] Redact (image and video) removes metadata.
- [ ] Collage corner radius is a % of each tile.

**Document specifics**
- [ ] SRT output starts with a BOM; VTT starts with `WEBVTT`.
- [ ] EPUB: `mimetype` first, STORED, at byte offset 30 for the name.
- [ ] DOCX headings use the `Heading1–3` style IDs.

**Settings**
- [ ] Settings: one bad key never resets the file; writes are atomic.

**Platform labels**
- [ ] Platform labels in the UI (Option/Alt, Show in Finder/Explorer/folder) stay unchanged.

---

## Appendix D. User-facing message catalogue (keep byte for byte)

*(Revision 2: the catalogue of the Rust build is PLAN.md Appendix C. Changes against the list below: the four EPUB input
messages are gone with EPUB → PDF (D8); the OCR "no data" message says "Reinstall Alohamora."; "This OCR engine version
cannot write PDFs" no longer exists because the searchable PDF is built by the app.)*

**Errors** (raised as `UserError` or `ToolError`)

```
Alohamora couldn't read this image. It may be damaged.
This image could not be converted. It may be damaged or too large.
HEIC output is not available on this computer (see the Formats page).
HEIC output is not available on this computer.
This PDF is password-protected. Remove the password first, then try again.
This PDF could not be opened. It may be damaged.
This PDF has no text layer (it looks scanned). Turn on OCR to extract the text.
No OCR language data found. Run "npm run fetch-binaries".
This OCR engine version cannot write PDFs
This EPUB is missing its package file.
This file is not a valid EPUB.
This EPUB has no readable chapters.
EPUB can only be converted to PDF.
This text file is empty.
No subtitles were found in ${name}.
${name} is not a supported file type.
${name} has no audio track.
${name} has no video track.
${name} has no audio to remove.
${label} is not available yet.
${label} needs at least ${n} files.
Converting ${FMT} files is not available yet.
Converting images|PDF|text to ${FMT} is not available yet.
No files to process.
Nothing changed
A page in the list does not exist.
Add at least one cut point inside the video.
Add at least one part to bleep.
Choose a size above 0 %.
Enter a width or a height.
Draw at least one box over the area to hide.
Move the crop handles first — the whole frame is selected.
Speed must be between 0.25× and 4×.
The selection is too short.
This file is mono.
This file is silent.
Could not measure loudness
${n} MB is too small for a ${duration} video. Try at least ${m} MB.
${name} failed (exit code ${code})
```

**Internal guards** (plain `Error`s today: the user sees the generic fallback message below, and these texts appear only in Details)

```
Expected output was not created (${file})
Refusing to overwrite an input file
Too many files with the same name
```

**Page-range errors** (from `pageRanges.ts`, shown as-is)

```
"${part}" is not a page range. Use something like 1-3, 5, 8-
Page numbers start at 1
Page ${p} doesn't exist (this PDF has ${total} pages)
"${part}" goes backwards
No pages selected
Enter the pages to use, for example 1-3, 5
```

**FFmpeg messages** (`friendlyFfmpegError`)

```
This file looks damaged, or it is not really the format its name says.
This file has no usable audio or video for this action.
Alohamora can't read or write this file. Close it in other apps and try again.
The disk is full.
This FFmpeg build is missing an encoder needed for this format.
The encoder needs an even width and height.
FFmpeg could not process this file.
```

**Fallback**

```
Something went wrong while processing this file.
```

The Done-card notes (for example "Already well compressed — no smaller file was made.", "Metadata removed" and "Clips were re-encoded to match") are listed beside each tool in §7.13. Keep them unchanged.

---

## Appendix E. Why not Go + Wails

| Aspect | Rust + Tauri 2 | Go + Wails |
|---|---|---|
| Stable multi-window API (the main window plus a transparent overlay is required) | ✅ Tauri 2.12.1 (stable) | **Wails v2.16.0 (stable) is single-window by design.** Multi-window exists only in **v3, still in beta** (v3.0.0-beta.28, 2026-10-05; checked via the Go module proxy). |
| Webview model | System webviews (WebView2 / WKWebView / WebKitGTK) | The same system webviews |
| Native file drop with paths and position | ✅ `DragDropEvent` with paths on Enter and Drop | Available (paths plus coordinates) |
| PDF | pdfium-render (mature) + lopdf | **pdfcpu v0.16.1** (pure Go; strong at merge, split, optimize and metadata) + go-pdfium v1.21.1 (pdfium via cgo or WASM) |
| Images | A wide pure-Rust ecosystem (image, resvg, vtracer, ravif, fast_image_resize) | Mixed. The standard library plus x/image cover the basics. WebP, AVIF and HEIC encoders come through WASM (gen2brain/webp v0.6.4, gen2brain/heic v0.7.2 via wazero) or cgo. Colour SVG rendering and colour tracing are weaker. |
| OCR | tesseract-rs (static build, active in 2026) | gosseract v2.4.1 (cgo; **last release 2023-09**) |
| Global input | Our own poller (same design in either language) | gohook v0.50.0 (cgo, libuiohook) |
| Memory and size | No GC; small binaries; fine-grained control | A GC'd runtime; similar binary size |
| Agent and maintainer ergonomics | Steeper learning curve; strong typing helps a large port | Simpler language; faster to write |

**Verdict:** Go would be fine for the job logic, but:
- it needs a **beta** UI framework to get the second window;
- it relies more on cgo or WASM for codecs and OCR;
- its OCR binding is stale.

Tauri 2 gives the same webview model with a stable multi-window API and a stronger library set for this app's formats.

---

## Appendix F. Sources (checked 2026-10-07)

**Tauri source code** at tag `tauri-v2.12.1` (raw GitHub):
- `crates/tauri/src/webview/webview_window.rs`: `focused`, `focusable`, `transparent`, `visible_on_all_workspaces`, `drag_and_drop`, `title_bar_style`, `traffic_light_position`, `with_webview`, `print` ("only supported on macOS")
- `crates/tauri-runtime/src/window.rs`: `DragDropEvent`
- `crates/tauri/src/app.rs`: `RunEvent::Opened`, `Reopen`, `set_dock_visibility`, `set_activation_policy`, `cursor_position`, `monitor_from_point`
- `crates/tauri/src/window/mod.rs`: `Monitor::work_area`
- `crates/tauri/src/tray/mod.rs`: Linux click events unsupported; `icon_as_template`
- `crates/tauri-utils/src/config.rs`: `macOSPrivateApi`, `FileAssociation.role` / `rank` / `mime_type`, `bundleMediaFramework`, `WebviewInstallMode`
- `crates/tauri/src/protocol/asset.rs`: Range support, 1 MB per-range cap

**wry source** at tag `wry-v0.57.0`:
- `src/wkwebview/drag_drop.rs`: `NSDragOperation::Copy`
- `src/webview2/drag_drop.rs`: `DROPEFFECT_COPY`

**Registries**
- crates.io API: versions, dates and licences in Appendix B.
- Go module proxy (`proxy.golang.org`): Wails v2.16.0, v3.0.0-beta.28, pdfcpu, go-pdfium, gosseract, gohook, gen2brain modules.

**Tauri drag-and-drop behaviour on Windows**
- [Tauri issue #9823](https://github.com/tauri-apps/tauri/issues/9823)
- [react-dropzone Tauri guide](https://react-dropzone.js.org/guide/tauri/)
- [DEV: transparent drag-and-drop shelf with Tauri](https://dev.to/devrayat000/building-a-transparent-drag-and-drop-shelf-for-windows-with-tauri-the-engineering-war-stories-3c8c)

**Webview printing**
- [Tauri asset protocol streaming issue](https://github.com/mauritzn/tauri-asset-bug) and [tauri#4133](https://github.com/tauri-apps/tauri/issues/4133)
- WebView2 `PrintToPdf`: [ICoreWebView2_7 reference](https://learn.microsoft.com/fr-fr/microsoft-edge/webview2/reference/win32/icorewebview2_7), [Printing to PDF from WebView2](https://learn.microsoft.com/en-us/answers/questions/1272126/printing-to-pdf-from-webview2)
- WKWebView printing to PDF: [Apple Developer Forums 705138](https://developer.apple.com/forums/thread/705138), [803249](https://developer.apple.com/forums/thread/803249)
- WebKitGTK print-to-file: [WebKit bug 212814](https://bugs.webkit.org/show_bug.cgi?id=212814)

**Crates and frameworks**
- [tesseract-rs README](https://github.com/cafercangundogdu/tesseract-rs) (features `build-tesseract`, `embed-tessdata`, `use-system-tesseract`)
- [Wails v3 "What's new"](https://v3.wails.io/ko/whats-new) and the [Wails v2 blog](https://wails.io/blog) (single-window runtime API)
- [Tauri file associations / `RunEvent::Opened`](https://v2.tauri.app/learn/mobile-file-associations/)
- [Tauri plugins overview](https://v2.tauri.app/plugin/)
- [pdfium `FPDFText_GetLooseCharBox`](https://pdfium.googlesource.com/pdfium/+/0f4ac587a4%5E%21)

**Size baseline:** the 537 MB installed-size breakdown comes from the earlier session's measurements of the macOS arm64 build (included with the task). Re-measure it in S9.
