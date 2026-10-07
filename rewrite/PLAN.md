# PLAN.md — Rewrite Alohamora in Rust + Tauri 2, step by step

This is the build plan for moving Alohamora from Electron + TypeScript to a **Rust back end inside Tauri 2**, with the existing
React user interface kept almost unchanged. The design and the reasons behind it are in `rewrite/OUTLINE.md`. This file tells
you **exactly what to do, in which order, with the complete code**.

> **Status of the code in this plan.** Every Rust, TypeScript, JSON and shell block below was compiled and run before this plan
> was written (Linux x86-64, Rust 1.97.0, Node 22.22, FFmpeg 8, PDFium 8086). Results at that point:
> - all Rust unit tests passed and `cargo clippy` reported no warnings;
> - the self-test passed 119 of its 121 cases, with no network at all (`unshare -n`), both through the debug app and
>   through the packaged release build (`.deb` layout); the 2 skips depend on the machine (no hardware video encoder; a
>   HEIC encoder present);
> - Tasks 0.1–8.7 were also replayed mechanically on a fresh copy of the repository (every File, Edit, Delete, Run and
>   Verify block) and all passed, including the self-test in Task 7.4 with freshly downloaded binaries; the app then
>   built in Task 8.8. The rest was not replayed;
> - the UI type-checked, its 122 tests passed and it built;
> - the app opened its windows under X11 (Xvfb), showed the wheel for a file passed on the command line, and a click on a
>   wheel slice converted it; real drag-and-drop with a mouse was not tested;
> - the Windows-only and macOS-only Rust modules type-checked (in isolation) for `x86_64-pc-windows-msvc` and
>   `aarch64-apple-darwin`.
>
> Things that could **not** be run here are marked **(manual)**. They must be checked on a real Windows PC and a real Mac
> (Phase 10).

**Scope decisions (from the owner):**
- Full feature parity with the Electron build, **except EPUB → PDF, which is removed**. PDF → EPUB stays.
- The app must be **fully offline**: no network access at run time, ever (§3).
- Signing and notarization are in scope (Task 9.3).

## Table of contents

- §0 How to use this plan (read first)
- §1 Conventions
- §2 Toolchain and pinned dependencies
- §3 The offline guarantee
- §4 What changes compared with the Electron build
- §5 Final folder tree
- Phase 0 — Preparation (Tasks 0.1–0.2)
- Phase 1 — Convert the user interface to Tauri (Tasks 1.1–1.9)
- Phase 2 — Build scripts: binaries and resources (Tasks 2.1–2.2)
- Phase 3 — Rust workspace and the `core` crate (Tasks 3.1–3.13)
- Phase 4 — Engine foundation (Tasks 4.1–4.4)
- Phase 5 — Images, PDFs and documents (Tasks 5.1–5.4)
- Phase 6 — Inspection, previews, metadata, job context, OCR (Tasks 6.1–6.4)
- Phase 7 — Converters, tools, the job queue and the self-test (Tasks 7.1–7.4)
- Phase 8 — The Tauri app (Tasks 8.1–8.9)
- Phase 9 — Packaging, signing, CI, notices (Tasks 9.1–9.5)
- Phase 10 — Verification on every OS and cut-over (Tasks 10.1–10.3)
- Appendix A — Command and event contract
- Appendix B — Self-test cases (121)
- Appendix C — User-facing messages
- Appendix D — Troubleshooting
- Appendix E — `rewrite/PROGRESS.md` template
- Appendix F — Deliberate changes, known gaps and open questions
- Appendix G — Manual test checklists


## §0 How to use this plan (read first)

You are a coding agent. Follow these rules exactly.

**Which plan?** This file is `rewrite/PLAN.md`. The `PLAN.md`, `OUTLINE.md` and `PROGRESS.md` at the **repository root**
belong to the old Electron build ("Kabooks"): never follow them. Your progress log is `rewrite/PROGRESS.md`.

**Finding your place.** This plan is long because it contains all the code. Read §0–§5 once. Then work one task at a
time: search for the heading `## Task 3.4` (for example) and read from there to the next `## Task` heading. You never need
to hold the whole plan in mind.

1. **Work in order.** Do the tasks in the order they appear: Phase 0, then 1, 2, … Never skip a task and never reorder
   tasks. Later tasks depend on earlier ones.
2. **One task at a time.** For each task:
   1. read the whole task;
   2. do every step in the order written;
   3. run every **Run** and **Verify** block;
   4. when Verify passes, commit (rule 6) and update `rewrite/PROGRESS.md` (rule 7).
3. **Copy code exactly.** A block that starts with **File `path`** is the *complete* content of that file. Create the file
   (and its folders) or replace it entirely with exactly that content. Do not "improve", reformat, reorder or shorten it. The
   code was compiled as written.
4. **Edits.** A block that starts with **Edit `path`** has two code blocks: *Find* and *Replace with*. The Find text occurs
   exactly once in the file. Replace it, and change nothing else in that file. An empty *Replace with* block means: delete
   the Find text (the whole line).
5. **Deletes.** **Delete `path`** means delete that file or folder (`git rm -r path` for tracked files).
6. **Commands.** **Run** and **Verify** blocks are bash commands, run from the **repository root**. On Windows use **Git
   Bash** (installed with Git for Windows). Blocks marked **(manual)** need a person or a graphical session; do them when you
   can and write the result into `rewrite/PROGRESS.md`. A Verify block passes when every command exits with status 0 and the
   output matches what the task says under **Done when**.
7. **Commit after each task**: `git add -A && git commit -m "Task 3.4: util, naming, time, page ranges"` (use the task number
   and title).
8. **Progress log.** Keep `rewrite/PROGRESS.md` (created in Task 0.2) up to date: tick the task, note anything unusual.
9. **When something fails:**
   1. compare your file with the block in this plan, character by character (most failures are copy mistakes);
   2. check Appendix D (Troubleshooting);
   3. if it still fails after three careful attempts, write the exact error into `rewrite/PROGRESS.md` under "Blocked" and
      stop. Ask the owner. Do not invent workarounds.
10. **Never add or upgrade dependencies** (Rust crates or npm packages) beyond what this plan lists, and never change a pinned
    version. `rewrite/Cargo.lock` and `rewrite/package-lock.json` hold the exact versions that were tested.
11. **Offline rule.** Never add code that opens a network connection, and never reference a remote URL from the app or the UI.
    The only network access allowed is **at build time**: `npm ci`, `cargo` fetching crates, `scripts/fetch-binaries.mjs`,
    and the tesseract-rs build script (§3).
12. **Never change the user's files.** Every converter and tool writes **new** files through `ctx.new_output(...)`. Nothing
    ever writes over, moves or deletes an input file.

## §1 Conventions

**Layout.** The Rust code lives in `src-tauri/`, which is a Cargo workspace with three crates:

| Crate | Folder | What it contains | May use |
|---|---|---|---|
| `alohamora-core` | `src-tauri/crates/core` | Pure logic, no I/O: types, the format/tool registry, option structs, FFmpeg argument builders, text/subtitle/PDF-reflow algorithms. | serde, regex |
| `alohamora-engine` | `src-tauri/crates/engine` | Everything that touches files and programs: FFmpeg, images, PDFs, OCR, converters, tools, the job queue, the self-test. **No Tauri.** | core + codec crates |
| `alohamora` (app) | `src-tauri/src` | The Tauri app: windows, commands, events, the `kfile` protocol, tray, OS integrations. | core + engine + Tauri |

**Single source of truth.** `src/shared/formats.ts`, `tools.ts`, `toolOptions.ts` and `types.ts` (`DEFAULT_SETTINGS`) stay the
source of truth for formats, tools and defaults. `scripts/gen-registry.mjs` turns them into `src/shared/registry/*.json`. The UI
imports the `.ts` files; the Rust core embeds the JSON with `include_str!`. After changing any of those `.ts` files, run
`npm run gen:registry` and commit the JSON. CI fails when the JSON is stale.

**Threads.** The engine is **synchronous** on purpose: long work runs on ordinary threads (one per job), and cancellation is a
shared flag (`CancelToken`) that the code checks between steps and that kills FFmpeg. There is no async in the engine. Tauri
commands that do blocking work wrap it in `blocking(...)` (Task 8.5), which runs it on Tauri's blocking thread pool.

**Errors.** `AppError` (in `core/src/error.rs`) has the variants `User`, `Tool`, `Canceled`, `Io` and `Other`:
- `AppError::user("…")` — a message for the user. The English text is part of the product: copy it exactly (Appendix C).
- `AppError::tool("…", details)` — an external program or library failed; `details` keeps the technical output.
- I/O errors become friendly messages through `to_user_message` (for example "disk full", "can't access").

**JavaScript-compatible numbers.** Where the Electron build printed numbers into FFmpeg arguments or notes, the Rust code uses
`js_num`, `js_round` and `js_to_fixed` from `core/src/js.rs`, so the output is identical (for example `1.5` and not `1.50`).

**Naming.** Rust: `snake_case` functions and files, `CamelCase` types. JSON sent to the UI uses camelCase
(`#[serde(rename_all = "camelCase")]`). Tauri converts the camelCase argument names that the UI passes to the snake_case
parameter names of the Rust commands.

**Formatting.** Formatting is not enforced. Do not run `cargo fmt` or Prettier over files from this plan: keep them byte for
byte as written, so that you can compare them with the plan.

**Tests.** Pure logic has unit tests next to the code (`#[cfg(test)] mod tests`). Everything that touches real files is
covered by the **self-test** (121 cases, Appendix B), which runs real files through every conversion and tool.

## §2 Toolchain and pinned dependencies

| Tool | Version | Why |
|---|---|---|
| Rust | **1.97.0** (pinned in `rust-toolchain.toml`; `rustup` installs it automatically) | Version the code was tested with |
| Node.js | **22.18 or newer** (22.x LTS) | Runs `.ts` files directly (type stripping) for `gen-registry.mjs`; Vite 7 |
| CMake | 3.20+ | tesseract-rs builds Leptonica and Tesseract from source |
| NASM | 2.15+ | mozjpeg (`nasm_simd`) and rav1e (`asm`) assembly |
| C/C++ compiler | MSVC 2022 (Windows), Xcode CLT (macOS), GCC/Clang (Linux) | C parts of mozjpeg, libwebp, Tesseract |
| FFmpeg | **7.1 or newer** (the fetched builds are 8.x) | Sidecar; 7.1+ decodes tiled HEIC photos in one piece |
| PDFium | `chromium/8086` from bblanchon/pdfium-binaries | Loaded at run time by pdfium-render |

**Rust crates** (exact versions are in `rewrite/Cargo.lock`, copied in Task 3.1):

| Crate | Version | Used for |
|---|---|---|
| tauri | 2.12 | App runtime (features `macos-private-api`, `tray-icon`, `image-png`) |
| tauri-plugin-single-instance / dialog / opener / notification / autostart / log | 2.5 / 2.8 / 2.7 / 2.5 / 2.7 / 2.10 | Second launch, file dialogs, reveal/open, notifications, launch at login, logging |
| image | 0.25 | Decoding JPEG/PNG/WebP/TIFF/GIF/BMP, resizing, BMP/PNG encoding |
| mozjpeg | 0.10 | JPEG encoding (same encoder family as sharp's `mozjpeg: true`) |
| webp | 0.3 | WebP encoding (libwebp) |
| ravif | 0.13 | AVIF encoding (rav1e) |
| png, tiff, color_quant | 0.18, 0.11, 1.1 | Palette PNG, LZW TIFF, colour quantisation |
| resvg | 0.48 | SVG rendering (input, gradients, masks) |
| vtracer | 0.6 | Raster → SVG tracing |
| kamadak-exif, img-parts | 0.6, 0.4 | Reading/writing EXIF, moving EXIF/ICC blocks between files |
| pdfium-render | 0.9 (features `image_latest`, `thread_safe`, `pdfium_latest`) | Open, render, extract text, copy pages |
| lopdf | 0.45 | Writing PDFs (pictures → PDF, metadata, image recompression) |
| typst-as-lib, typst, typst-pdf | 0.16, 0.15, 0.15 | Text → PDF |
| tesseract-rs | 0.4 (feature `build-tesseract`) | OCR, compiled from source and linked statically |
| zip | 8 | DOCX and EPUB packaging |
| x11rb (Linux), windows / windows-sys / windows-registry (Windows), objc2-app-kit (macOS) | 0.13; 0.61 / 0.60 / 0.5; 0.3 | OS calls for drag-and-drop modifiers, the global drag wheel, Send To, the right-click verb |

**npm packages** (exact versions in `rewrite/package-lock.json`): react 19, react-dom 19, zustand 5, lucide-react,
@fontsource-variable/inter, **@tauri-apps/api 2.12**, **@tauri-apps/cli 2.12**, vite 7, @vitejs/plugin-react 5, vitest 5,
typescript 7, extract-zip.

## §3 The offline guarantee

The app must never touch the network at run time. This is how the plan guarantees it:

| Risk | Rule | Checked by |
|---|---|---|
| A Rust crate that can make HTTP/TLS connections | None in the app's runtime dependencies (build-only dependencies are allowed) | `npm run check:offline` (`cargo tree -e normal` for every desktop target) |
| Our code opening sockets | No `std::net`, `TcpStream`, `UdpSocket` in our crates | `npm run check:offline` |
| The UI loading or posting anything remote | No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or `http(s)://` URLs in `src/` | `npm run check:offline` |
| The web view loading remote resources | Content-Security-Policy allows only `'self'`, `data:`, `blob:`, `ipc:` and `kfile:` | `npm run check:offline` (parses `tauri.conf.json`) |
| WebView2 background traffic (Windows) | Browser arguments disable SmartScreen, component updates, pings and domain reliability (`windows::WEBVIEW2_ARGS`, Task 8.4) | Code review |
| Typst downloading packages | `typst-as-lib` is used **without** its `packages` feature; fonts come only from the bundled `fonts/` folder and the system | Code (Task 5.3) |
| Tesseract downloading language data | Language data is read only from `<resources>/tessdata` | Code (Task 6.4) |
| Installer needs internet (Windows) | WebView2 **offline installer** is embedded in the NSIS installer | `tauri.conf.json` (Task 8.1) |
| Anything else | The whole self-test runs with networking switched off (`unshare -rn` on Linux CI) | CI (Task 9.2) |

**Build time is different.** Downloads happen only while building: `npm ci`, `cargo` fetching crates,
`npm run fetch-binaries` (FFmpeg, PDFium, OCR data, fonts) and the `tesseract-rs` build script (it downloads the Leptonica and
Tesseract sources once into `~/.tesseract-rs`; see Appendix D if that is blocked).

## §4 What changes compared with the Electron build

**Removed: EPUB → PDF.** EPUB is now an **output-only** format of the PDF category, like DOCX:
- `Category` no longer contains `'epub'`; `FORMATS.epub` is `{ category: 'pdf', input: false }`.
- EPUB files are no longer accepted as input (they are "not supported" like any unknown file).
- Gone: the EPUB reader, the EPUB → PDF card (`EpubToPdfCard.tsx`), the print windows, the two self-test cases
  `convert.epub.book-pdf` and `convert.epub.fixed-pdf` (the self-test has **121** cases instead of 123), EPUB thumbnails, and
  EPUB in the file associations.
- PDF → EPUB (reflowable or fixed-layout) is unchanged.

**Replaced engines** (same behaviour, different implementation):

| Electron | Rust/Tauri | Notes |
|---|---|---|
| sharp / libvips | `image` + mozjpeg + libwebp + rav1e + resvg | Same quality settings. Collage "cover" crops to the centre (sharp used "attention"). |
| heic-decode | FFmpeg (bundled, ≥ 7.1) | No extra library. |
| imagetracerjs | vtracer | Different but similar SVG paths. |
| piexifjs, exifr | kamadak-exif + img-parts | |
| pdf.js (hidden window) | PDFium | No hidden window any more. |
| pdf-lib | PDFium page import (merge/split/organize/strip) + lopdf (create, metadata, recompress) | |
| Chromium `printToPDF` | Typst | Text → PDF uses bundled Noto fonts. |
| tesseract.js | Tesseract (native) | Searchable PDFs are built from Tesseract's word boxes (Task 6.4). |
| docx (npm) | Our own small DOCX writer | Same structure: Heading1–3 styles, bullets, page images. |
| uiohook-napi | 60 Hz pointer polling (Windows, X11) | No global hooks. |
| `webUtils.getPathForFile` + HTML5 drops | Tauri native drag-and-drop (`ev:drop`) | Paths are known on enter, on every OS. |

**Deliberate improvements:** HEIC output is offered only when `heif-enc` really has an HEVC encoder; second-instance file
paths are resolved against the second instance's working folder; the Windows right-click verb is written with the registry API
instead of `reg.exe`; the main window appears only after the UI has rendered (no white flash).

**Known gaps** (also in Appendix F): clicking a "done" notification no longer reveals the file (the notification plugin has no
click events on desktop); Linux tray icons have a menu but no click action; on Linux, video previews need GStreamer plugins.

## §5 Final folder tree

```
.
├── rust-toolchain.toml            Rust 1.97.0
├── package.json, package-lock.json, vite.config.ts, vitest.config.ts, tsconfig*.json
├── scripts/
│   ├── gen-registry.mjs           src/shared/*.ts → src/shared/registry/*.json
│   ├── fetch-binaries.mjs         FFmpeg sidecars, PDFium, tessdata, fonts (build time only)
│   ├── check-binaries.mjs         verifies the above
│   ├── build-mac-helper.mjs       macOS: builds the Swift drag helper sidecar
│   ├── check-offline.mjs          the offline guarantee (static part)
│   └── check-licenses.mjs         licence policy + THIRD_PARTY_CRATES.md
├── native/mac/DragHelper.swift    unchanged
├── build/icon.png, icon.svg       source of the app icons
├── src/
│   ├── shared/                    unchanged except EPUB removal; registry/*.json is generated
│   └── renderer/                  React UI; lib/api.ts is now the Tauri bridge
├── docs/electron/                 the old Electron plan documents (moved there in Task 10.3)
├── src-tauri/
│   ├── Cargo.toml, Cargo.lock, build.rs
│   ├── tauri.conf.json, tauri.{macos,windows,linux}.conf.json
│   ├── capabilities/default.json
│   ├── icons/                     generated by `tauri icon`, plus tray.png / trayTemplate@2x.png
│   ├── linux/alohamora.desktop    desktop entry template (MIME types)
│   ├── windows/hooks.nsh          NSIS uninstall clean-up
│   ├── macos/entitlements.plist
│   ├── binaries/                  ffmpeg-<triple>, ffprobe-<triple> (fetched, not committed)
│   ├── resources/                 pdfium/, tessdata/, fonts/ (fetched, not committed)
│   ├── src/                       the Tauri app (lib.rs, commands.rs, protocol.rs, windows/, platform/, integrations/ …)
│   └── crates/
│       ├── core/src/              pure logic
│       └── engine/
│           ├── assets/glyphless.ttf
│           ├── examples/selftest.rs
│           └── src/               image/, pdf/, convert/, tools/, jobs/, selftest/ …
├── rewrite/                       OUTLINE.md, PLAN.md (this file), PROGRESS.md, Cargo.lock, package-lock.json
├── README.md, THIRD_PARTY_NOTICES.md, THIRD_PARTY_CRATES.md
└── .github/workflows/build.yml
```


# Phase 0 — Preparation

## Task 0.1 — Install the build tools

**Goal.** Your machine can build Rust, Tauri and the C/C++ parts of the codec crates.

Install the tools for your OS. This is a one-time setup; it is not committed.

**Windows 10/11 (x64)**
1. Visual Studio 2022 Build Tools with the workload "Desktop development with C++" (MSVC, Windows SDK).
2. Rust: install `rustup` from https://rustup.rs (choose the default MSVC toolchain).
3. Node.js 22 LTS (22.18 or newer) from https://nodejs.org.
4. Git for Windows (gives you **Git Bash**; run every command of this plan in Git Bash).
5. CMake 3.20+ (`winget install Kitware.CMake`) and NASM (`winget install NASM.NASM`, then add
   `C:\Program Files\NASM` to `PATH`).
6. WebView2 is already part of Windows 10/11.

**macOS 11+ (Apple Silicon or Intel)**
1. Xcode Command Line Tools: `xcode-select --install`.
2. Homebrew, then `brew install node@22 cmake nasm`.
3. Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`.

**Linux (Ubuntu 22.04 / Debian 12 or newer, x64)**

**Run (manual)**
```bash
sudo apt-get update
sudo apt-get install -y build-essential file pkg-config cmake nasm curl git \
  libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf \
  libheif-examples libheif-plugin-x265 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-libav
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
# Node 22: use nvm, fnm or the NodeSource packages (the Ubuntu package is too old).
```

`libheif-examples` + `libheif-plugin-x265` provide `heif-enc` (HEIC output on Linux, optional). The GStreamer plugins let
the Linux web view play video previews (optional, only for previews).

**Verify**
```bash
node --version      # v22.18.0 or newer
npm --version
rustup --version
cargo --version
cmake --version     # 3.20 or newer
nasm -v             # 2.15 or newer
git --version
```

**Done when:** every command prints a version and Node is 22.18 or newer. (Rust 1.97.0 itself is installed automatically
by `rustup` in Task 3.1, when `rust-toolchain.toml` appears.)

## Task 0.2 — Tag the Electron build and start the progress log

**Goal.** The last Electron version can always be found again, and you have a progress log.

**Important:** the files `PLAN.md`, `OUTLINE.md` and `PROGRESS.md` at the **repository root** describe the *old* Electron
build ("Kabooks"). **Do not follow them.** Your plan is `rewrite/PLAN.md` (this file) and your log is
`rewrite/PROGRESS.md`. Task 10.3 moves the old files into `docs/electron/`.

1. Make sure the working tree is clean and you are on the branch you will work on.

**Run**
```bash
git status --short
git tag -f electron-last
```

2. Create the progress log:

**File `rewrite/PROGRESS.md`**

```markdown
# Rust + Tauri rewrite — progress log

Plan: `rewrite/PLAN.md`. Tick a task only when its **Verify** block passed. One line of notes per task is enough.
Legend: [x] done · [~] done with notes · [ ] todo · [!] blocked

Machine: <OS, CPU, Node version, Rust version>

## Blocked
(nothing)

## Phase 0 — Preparation
- [ ] 0.1 Install the build tools
- [ ] 0.2 Tag the Electron build and start the progress log

## Phase 1 — Convert the user interface to Tauri
- [ ] 1.1 Remove Electron; Vite + Tauri packages
- [ ] 1.2 Remove EPUB as an input format
- [ ] 1.3 Generate the registry JSON for Rust
- [ ] 1.4 The Tauri bridge (ipc.ts, api.ts, nativeDrop.ts)
- [ ] 1.5 Native drag-and-drop in the drop zone, home view and wheel
- [ ] 1.6 Pointer-based reordering
- [ ] 1.7 Window chrome and start-up
- [ ] 1.8 Sound, panels and the formats page
- [ ] 1.9 Check the whole UI

## Phase 2 — Build scripts
- [ ] 2.1 Fetch and check scripts
- [ ] 2.2 Fetch the binaries

## Phase 3 — Rust workspace and the core crate
- [ ] 3.1 Workspace skeleton
- [ ] 3.2 core: js
- [ ] 3.3 core: error
- [ ] 3.4 core: util, naming, time, page_ranges
- [ ] 3.5 core: geometry
- [ ] 3.6 core: types, registry, options
- [ ] 3.7 core: split, pdf_split
- [ ] 3.8 core: text, subtitles
- [ ] 3.9 core: collage_layout, edit_pipeline
- [ ] 3.10 core: pdf_reflow
- [ ] 3.11 core: ffmpeg_parse
- [ ] 3.12 core: ffmpeg_args
- [ ] 3.13 core: image_meta

## Phase 4 — Engine foundation
- [ ] 4.1 engine: cancel, paths, process, fsutil, par
- [ ] 4.2 engine: ffmpeg
- [ ] 4.3 engine: settings
- [ ] 4.4 engine: capabilities, hw_video

## Phase 5 — Images, PDFs and documents
- [ ] 5.1 engine: image
- [ ] 5.2 engine: pdf
- [ ] 5.3 engine: text_pdf
- [ ] 5.4 engine: docx, epub

## Phase 6 — Inspection, previews, metadata, job context, OCR
- [ ] 6.1 engine: thumbnails, inspect
- [ ] 6.2 engine: previews, image_preview, metadata
- [ ] 6.3 engine: job context
- [ ] 6.4 engine: ocr

## Phase 7 — Converters, tools, job queue, self-test
- [ ] 7.1 engine: converters and tools
- [ ] 7.2 engine: job execution and queue
- [ ] 7.3 engine: self-test
- [ ] 7.4 Run the self-test

## Phase 8 — The Tauri app
- [ ] 8.1 Tauri configuration and icons
- [ ] 8.2 app: state and platform helpers
- [ ] 8.3 app: kfile protocol
- [ ] 8.4 app: windows
- [ ] 8.5 app: commands
- [ ] 8.6 app: argv, tray, notifications
- [ ] 8.7 app: OS integrations
- [ ] 8.8 app: lib.rs, build and self-test through the app
- [ ] 8.9 Run the app (manual)

## Phase 9 — Packaging, signing, CI, notices
- [ ] 9.1 Notices, README, offline and licence checks
- [ ] 9.2 Continuous integration
- [ ] 9.3 Signing and notarization (manual)
- [ ] 9.4 Lint and full test run
- [ ] 9.5 Release build

## Phase 10 — Verification on every OS and cut-over
- [ ] 10.1 Windows checks (manual)
- [ ] 10.2 macOS checks (manual)
- [ ] 10.3 Linux checks and cut-over

## Notes and deviations
(none yet)
```

**Verify**
```bash
git tag --list electron-last
test -f rewrite/PROGRESS.md
```

**Done when:** `electron-last` is listed and `rewrite/PROGRESS.md` exists. Fill in the "Machine" line, tick 0.1 and 0.2,
and commit.

# Phase 1 — Convert the user interface to Tauri

The React UI stays. This phase removes Electron, switches the build to plain Vite, replaces the Electron bridge
(`window.api` from the preload script) with Tauri's `invoke`/`listen`, and replaces HTML5 file drops (which do not carry
file paths in Tauri) with Tauri's native drag-and-drop events. EPUB stops being an input format.

After this phase the UI builds, but it has no back end until Phase 8. That is expected.

## Task 1.1 — Remove Electron; Vite + Tauri packages

**Goal.** No Electron code is left. `npm ci` installs the Tauri packages and Vite.

1. Delete the Electron main process, preload scripts, the hidden "engine" window and the Electron build files:

**Delete `src/main`**

**Delete `src/preload`**

**Delete `src/renderer/engine.html`**

**Delete `src/renderer/src/engine`**

**Delete `electron.vite.config.ts`**

**Delete `electron-builder.yml`**

**Delete `scripts/asar-unpack-list.mjs`**

**Delete `scripts/copy-pdfjs-assets.mjs`**

**Delete `scripts/make-icons.mjs`**

2. Replace `package.json`. New: `"type": "module"`, the Tauri packages, plain Vite, and scripts for the Rust side. Some of
   these scripts point at files created in later tasks; that is fine.

**File `package.json`**

```json
{
  "name": "alohamora",
  "productName": "Alohamora",
  "version": "0.2.0",
  "description": "Offline file converter with a spinning wheel UI",
  "author": "Alohamora contributors",
  "license": "UNLICENSED",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "dev:ui": "vite",
    "build:ui": "vite build",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "gen:registry": "node scripts/gen-registry.mjs",
    "fetch-binaries": "node scripts/fetch-binaries.mjs",
    "check-binaries": "node scripts/check-binaries.mjs",
    "selftest": "cargo run --manifest-path src-tauri/Cargo.toml -- --selftest",
    "icons": "tauri icon build/icon.png",
    "build:mac-helper": "node scripts/build-mac-helper.mjs",
    "postfetch-binaries": "node scripts/build-mac-helper.mjs",
    "check:offline": "node scripts/check-offline.mjs",
    "check:licenses": "node scripts/check-licenses.mjs"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.3.0",
    "@tauri-apps/api": "^2.12.1",
    "lucide-react": "^1.52.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.12.1",
    "@types/node": "^22.20.5",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^5.2.0",
    "extract-zip": "^2.0.1",
    "typescript": "^7.0.2",
    "vite": "^7.3.7",
    "vitest": "^5.0.3"
  }
}
```

3. Create the Vite configuration (it replaces `electron.vite.config.ts`). Tauri loads the built UI from `dist/renderer` and,
   during development, from `http://localhost:5173`.

**File `vite.config.ts`**

```ts
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The UI is a plain Vite + React app; Tauri loads dist/renderer (see src-tauri/tauri.conf.json).
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer/src') } },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { outDir: resolve('dist/renderer'), emptyOutDir: true, target: ['es2022', 'safari16'] }
});
```

4. Replace the two TypeScript project files (the `src/main` and `src/preload` entries are gone):

**File `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": [
      "node"
    ],
    "paths": {
      "@shared/*": [
        "./src/shared/*"
      ]
    }
  },
  "include": [
    "vite.config.ts",
    "vitest.config.ts",
    "src/shared/**/*",
    "src/renderer/**/*.test.ts"
  ]
}
```

**File `tsconfig.web.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "types": [
      "vite/client"
    ],
    "paths": {
      "@shared/*": [
        "./src/shared/*"
      ],
      "@renderer/*": [
        "./src/renderer/src/*"
      ]
    }
  },
  "include": [
    "src/renderer/**/*",
    "src/shared/**/*"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}
```

5. Replace `.gitignore` (Rust build output and the fetched binaries are never committed):

**File `.gitignore`**

```
node_modules/
dist/
.cache/
.selftest/
*.log
.DS_Store
# Rust / Tauri build output
src-tauri/target/
src-tauri/gen/
# Fetched by `npm run fetch-binaries` (large, per-OS)
src-tauri/binaries/
src-tauri/resources/pdfium/
src-tauri/resources/tessdata/
src-tauri/resources/fonts/
src-tauri/resources/LICENSE-ffmpeg.txt
```

6. Install the exact package versions that were tested. `rewrite/package-lock.json` is the lock file of the new
   `package.json`; never run `npm install` without arguments here.

**Run**
```bash
cp rewrite/package-lock.json package-lock.json
npm ci
```

**Verify**
```bash
test ! -e src/main && test ! -e src/preload && test ! -e electron-builder.yml
npm ls @tauri-apps/api @tauri-apps/cli vite --depth=0
```

**Done when:** `npm ci` succeeded and `npm ls` prints `@tauri-apps/api@2.12.x`, `@tauri-apps/cli@2.12.x` and `vite@7.x`
without errors. (Type checking fails until Task 1.9; do not try to fix that now.)

## Task 1.2 — Remove EPUB as an input format

**Goal.** EPUB is output-only (like DOCX). The `'epub'` category is gone.

1. In `src/shared/types.ts`, remove `'epub'` from `Category`:

**Edit `src/shared/types.ts`**

Find:
```ts
export type Category = 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'text' | 'subtitle';
```

Replace with:
```ts
export type Category = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'subtitle';
```

2. Replace `src/shared/formats.ts`. Changes: `epub` is `{ category: 'pdf', input: false }`; the `epub` entries of
   `CATEGORY_ORDER`, `CATEGORY_LABEL`, `CATEGORY_NOTE` and `CONVERT_TARGETS` are gone; `OPTION_PAIRS` loses
   `['epub', 'pdf']` and is now **exported** (the registry generator in Task 1.3 needs it).

**File `src/shared/formats.ts`**

```ts
import type { Capabilities, Category, Fmt } from './types';

export interface FormatInfo {
  fmt: Fmt;
  label: string;
  category: Category;
  exts: string[];          // first = canonical output extension
  mimes: string[];
  input: boolean;          // false = output-only (DOCX, EPUB)
}

export const FORMATS: Record<Fmt, FormatInfo> = {
  jpg: { fmt: 'jpg', label: 'JPG', category: 'image', exts: ['jpg', 'jpeg', 'jfif'], mimes: ['image/jpeg'], input: true },
  png: { fmt: 'png', label: 'PNG', category: 'image', exts: ['png'], mimes: ['image/png'], input: true },
  webp: { fmt: 'webp', label: 'WebP', category: 'image', exts: ['webp'], mimes: ['image/webp'], input: true },
  heic: { fmt: 'heic', label: 'HEIC', category: 'image', exts: ['heic', 'heif'], mimes: ['image/heic', 'image/heif'], input: true },
  tiff: { fmt: 'tiff', label: 'TIFF', category: 'image', exts: ['tiff', 'tif'], mimes: ['image/tiff'], input: true },
  svg: { fmt: 'svg', label: 'SVG', category: 'image', exts: ['svg'], mimes: ['image/svg+xml'], input: true },
  avif: { fmt: 'avif', label: 'AVIF', category: 'image', exts: ['avif'], mimes: ['image/avif'], input: true },
  bmp: { fmt: 'bmp', label: 'BMP', category: 'image', exts: ['bmp'], mimes: ['image/bmp', 'image/x-ms-bmp'], input: true },
  mp3: { fmt: 'mp3', label: 'MP3', category: 'audio', exts: ['mp3'], mimes: ['audio/mpeg', 'audio/mp3'], input: true },
  m4a: { fmt: 'm4a', label: 'M4A', category: 'audio', exts: ['m4a', 'aac'], mimes: ['audio/mp4', 'audio/x-m4a', 'audio/aac'], input: true },
  wav: { fmt: 'wav', label: 'WAV', category: 'audio', exts: ['wav'], mimes: ['audio/wav', 'audio/x-wav', 'audio/wave'], input: true },
  flac: { fmt: 'flac', label: 'FLAC', category: 'audio', exts: ['flac'], mimes: ['audio/flac', 'audio/x-flac'], input: true },
  ogg: { fmt: 'ogg', label: 'OGG', category: 'audio', exts: ['ogg', 'oga'], mimes: ['audio/ogg'], input: true },
  opus: { fmt: 'opus', label: 'Opus', category: 'audio', exts: ['opus'], mimes: ['audio/opus'], input: true },
  aiff: { fmt: 'aiff', label: 'AIFF', category: 'audio', exts: ['aiff', 'aif'], mimes: ['audio/aiff', 'audio/x-aiff'], input: true },
  wma: { fmt: 'wma', label: 'WMA', category: 'audio', exts: ['wma'], mimes: ['audio/x-ms-wma'], input: true },
  mp4: { fmt: 'mp4', label: 'MP4', category: 'video', exts: ['mp4', 'm4v'], mimes: ['video/mp4', 'video/x-m4v'], input: true },
  mov: { fmt: 'mov', label: 'MOV', category: 'video', exts: ['mov'], mimes: ['video/quicktime'], input: true },
  mkv: { fmt: 'mkv', label: 'MKV', category: 'video', exts: ['mkv'], mimes: ['video/x-matroska', 'video/matroska'], input: true },
  webm: { fmt: 'webm', label: 'WebM', category: 'video', exts: ['webm'], mimes: ['video/webm'], input: true },
  avi: { fmt: 'avi', label: 'AVI', category: 'video', exts: ['avi'], mimes: ['video/x-msvideo', 'video/avi', 'video/msvideo'], input: true },
  wmv: { fmt: 'wmv', label: 'WMV', category: 'video', exts: ['wmv'], mimes: ['video/x-ms-wmv'], input: true },
  gif: { fmt: 'gif', label: 'GIF', category: 'video', exts: ['gif'], mimes: ['image/gif'], input: true },
  pdf: { fmt: 'pdf', label: 'PDF', category: 'pdf', exts: ['pdf'], mimes: ['application/pdf'], input: true },
  docx: {
    fmt: 'docx', label: 'DOCX', category: 'pdf', exts: ['docx'],
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], input: false
  },
  epub: { fmt: 'epub', label: 'EPUB', category: 'pdf', exts: ['epub'], mimes: ['application/epub+zip'], input: false },
  txt: { fmt: 'txt', label: 'TXT', category: 'text', exts: ['txt', 'text', 'md', 'markdown', 'log', 'csv'], mimes: ['text/plain', 'text/markdown', 'text/csv'], input: true },
  srt: { fmt: 'srt', label: 'SRT', category: 'subtitle', exts: ['srt'], mimes: ['application/x-subrip', 'text/srt'], input: true },
  vtt: { fmt: 'vtt', label: 'VTT', category: 'subtitle', exts: ['vtt'], mimes: ['text/vtt'], input: true }
};

const EXT_INDEX = new Map<string, Fmt>();
const MIME_INDEX = new Map<string, Fmt>();
for (const info of Object.values(FORMATS)) {
  if (!info.input) continue;
  for (const e of info.exts) EXT_INDEX.set(e, info.fmt);
  for (const m of info.mimes) MIME_INDEX.set(m, info.fmt);
}

/** "C:\\a\\b.JPEG" → "jpeg" (lower-case, no dot). Works with / and \. */
export function extOf(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function fmtFromExt(ext: string): Fmt | null {
  return EXT_INDEX.get(ext.toLowerCase()) ?? null;
}

export function fmtFromPath(filePath: string): Fmt | null {
  return fmtFromExt(extOf(filePath));
}

export function fmtFromMime(mime: string): Fmt | null {
  return MIME_INDEX.get(mime.toLowerCase()) ?? null;
}

export function categoryOf(fmt: Fmt): Category {
  return FORMATS[fmt].category;
}

/** Canonical extension to write for a format, e.g. jpg → "jpg", tiff → "tiff". */
export function outputExt(fmt: Fmt): string {
  return FORMATS[fmt].exts[0];
}

export const CATEGORY_ORDER: Category[] = ['image', 'audio', 'video', 'pdf', 'text', 'subtitle'];

export const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Images', audio: 'Audio', video: 'Video', pdf: 'PDF', text: 'Text', subtitle: 'Subtitles'
};

export const CATEGORY_NOTE: Record<Category, string> = {
  image: 'PDF & DOCX export',
  audio: '',
  video: 'MP3 audio export',
  pdf: 'All pages · images at 300 DPI',
  text: 'UTF-8 text',
  subtitle: ''
};

/** What each input category can become (wheel order, clockwise from 12 o'clock). */
export const CONVERT_TARGETS: Record<Category, Fmt[]> = {
  image: ['jpg', 'png', 'webp', 'heic', 'tiff', 'svg', 'avif', 'bmp', 'pdf', 'docx'],
  audio: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'wma'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'gif', 'mp3'],
  pdf: ['docx', 'jpg', 'png', 'epub', 'txt'],
  text: ['pdf', 'jpg', 'png', 'srt', 'vtt'],
  subtitle: ['srt', 'vtt', 'txt']
};

/** FFmpeg encoders required to produce each target from audio/video sources (and BMP from images). */
export const REQUIRED_ENCODERS: Partial<Record<Fmt, string[]>> = {
  mp4: ['libx264', 'aac'],
  mov: ['libx264', 'aac'],
  mkv: ['libx264', 'aac'],
  webm: ['libvpx-vp9', 'libopus'],
  avi: ['mpeg4', 'libmp3lame'],
  wmv: ['wmv2', 'wmav2'],
  gif: ['gif'],
  mp3: ['libmp3lame'],
  m4a: ['aac'],
  wav: ['pcm_s16le'],
  flac: ['flac'],
  ogg: ['libvorbis'],
  opus: ['libopus'],
  aiff: ['pcm_s16be'],
  wma: ['wmav2'],
  bmp: ['bmp']
};

/** Conversions that show a Step-2 options card by default. */
export const OPTION_PAIRS: Array<[Category, Fmt]> = [
  ['image', 'svg'], ['video', 'gif'], ['pdf', 'docx'], ['pdf', 'epub'],
  ['text', 'pdf'], ['text', 'jpg'], ['text', 'png'], ['text', 'srt'], ['text', 'vtt']
];

export function needsOptions(from: Category, to: Fmt): boolean {
  return OPTION_PAIRS.some(([c, f]) => c === from && f === to);
}

/** True when the engine that produces `target` from `from` is available. */
export function targetAvailable(target: Fmt, from: Category, caps: Capabilities): boolean {
  if (from === 'image' && target === 'heic') return caps.heifEnc;
  const usesFfmpeg = from === 'audio' || from === 'video' || (from === 'image' && target === 'bmp');
  if (!usesFfmpeg) return true;
  if (!caps.ffmpeg) return false;
  return (REQUIRED_ENCODERS[target] ?? []).every((e) => caps.encoders.includes(e));
}
```

3. Update the three test files that used EPUB as an input:

**File `src/shared/formats.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER, CONVERT_TARGETS, extOf, fmtFromExt, fmtFromMime, fmtFromPath, FORMATS, needsOptions, outputExt,
  targetAvailable
} from './formats';
import { makeCaps } from './testCaps';

describe('extOf / fmtFrom*', () => {
  it('extOf handles case, missing and leading dots', () => {
    expect(extOf('C:\\x\\Photo.JPEG')).toBe('jpeg');
    expect(extOf('noext')).toBe('');
    expect(extOf('.bashrc')).toBe('');
    expect(extOf('/a/b.c/file.tar.gz')).toBe('gz');
  });

  it('fmtFromPath resolves aliases and rejects non-inputs', () => {
    expect(fmtFromPath('a.jpeg')).toBe('jpg');
    expect(fmtFromPath('a.jfif')).toBe('jpg');
    expect(fmtFromPath('a.tif')).toBe('tiff');
    expect(fmtFromPath('a.heif')).toBe('heic');
    expect(fmtFromPath('a.aif')).toBe('aiff');
    expect(fmtFromPath('a.m4v')).toBe('mp4');
    expect(fmtFromPath('a.aac')).toBe('m4a');
    expect(fmtFromPath('a.md')).toBe('txt');
    expect(fmtFromPath('a.docx')).toBeNull();
    expect(fmtFromPath('a.zip')).toBeNull();
  });

  it('fmtFromExt / fmtFromMime / outputExt', () => {
    expect(fmtFromExt('PNG')).toBe('png');
    expect(fmtFromMime('video/quicktime')).toBe('mov');
    expect(fmtFromMime('image/jpeg')).toBe('jpg');
    expect(fmtFromMime('application/zip')).toBeNull();
    expect(outputExt('jpg')).toBe('jpg');
    expect(outputExt('tiff')).toBe('tiff');
  });
});

describe('targetAvailable', () => {
  it('hides HEIC without an encoder and shows it with one', () => {
    expect(targetAvailable('heic', 'image', makeCaps({ heifEnc: false }))).toBe(false);
    expect(targetAvailable('heic', 'image', makeCaps({ heifEnc: true, heicTool: 'sips' }))).toBe(true);
  });

  it('checks FFmpeg encoders for video/audio targets', () => {
    expect(targetAvailable('webm', 'video', makeCaps({ encoders: ['libvpx-vp9', 'libopus'] }))).toBe(true);
    expect(targetAvailable('webm', 'video', makeCaps({ encoders: [] }))).toBe(false);
    expect(targetAvailable('mp3', 'audio', makeCaps({ ffmpeg: false }))).toBe(false);
  });

  it('sharp-based conversions do not need FFmpeg', () => {
    expect(targetAvailable('png', 'image', makeCaps({ ffmpeg: false }))).toBe(true);
    expect(targetAvailable('bmp', 'image', makeCaps({ ffmpeg: false }))).toBe(false);
  });
});

describe('needsOptions', () => {
  it('flags the card conversions only', () => {
    expect(needsOptions('video', 'gif')).toBe(true);
    expect(needsOptions('video', 'mp4')).toBe(false);
    expect(needsOptions('image', 'svg')).toBe(true);
    expect(needsOptions('pdf', 'docx')).toBe(true);
    expect(needsOptions('pdf', 'epub')).toBe(true);
    expect(needsOptions('text', 'srt')).toBe(true);
    expect(needsOptions('image', 'png')).toBe(false);
  });
});

describe('CONVERT_TARGETS', () => {
  it('never offers a category its own non-convertible formats', () => {
    expect(CONVERT_TARGETS.pdf).toContain('epub');
    expect(CONVERT_TARGETS.image).toContain('docx');
  });
});

describe('EPUB', () => {
  it('is an output of PDF only (EPUB → PDF was removed)', () => {
    expect(FORMATS.epub.input).toBe(false);
    expect(FORMATS.epub.category).toBe('pdf');
    expect(fmtFromPath('book.epub')).toBeNull();
    expect(CATEGORY_ORDER).not.toContain('epub' as never);
  });
});
```

**File `src/shared/tools.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { TOOLS, toolMeta, toolsFor } from './tools';
import { TOOL_DEFAULTS, withDefaults } from './toolOptions';
import type { ToolId } from './types';

describe('toolsFor', () => {
  it('video with one file: 9 tools, compress first, no join', () => {
    const t = toolsFor('video', 1);
    expect(t).toHaveLength(9);
    expect(t[0].id).toBe('video.compress');
    expect(t.map((x) => x.id)).not.toContain('video.join');
  });

  it('video with two files: join in, trim out', () => {
    const ids = toolsFor('video', 2).map((x) => x.id);
    expect(ids).toContain('video.join');
    expect(ids).not.toContain('video.trim');
  });

  it('subtitles have only the shift tool', () => {
    expect(toolsFor('subtitle', 1).map((t) => t.id)).toEqual(['subtitle.shift']);
  });
});

describe('registry consistency', () => {
  it('every TOOL_DEFAULTS key is a registered tool and vice versa', () => {
    const defaultKeys = Object.keys(TOOL_DEFAULTS).sort();
    const toolIds = TOOLS.map((t) => t.id as string).sort();
    expect(defaultKeys).toEqual(toolIds);
  });

  it('toolMeta throws for unknown ids and returns known ones', () => {
    expect(toolMeta('video.mute').instant).toBe(true);
    expect(() => toolMeta('nope' as ToolId)).toThrow();
  });

  it('withDefaults merges shallowly over defaults', () => {
    const o = withDefaults<{ preset: string; codec: string }>('video.compress', { preset: 'small' });
    expect(o.preset).toBe('small');
    expect(o.codec).toBe('h264');
  });
});
```

**File `src/shared/wheelItems.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { FORMATS } from './formats';
import { makeCaps } from './testCaps';
import type { Category, FileInfo, Fmt } from './types';
import { buildWheel } from './wheelItems';

function fi(path: string, fmt: Fmt | null, category: Category | null): FileInfo {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return { path, name, base: dot > 0 ? name.slice(0, dot) : name, ext: dot > 0 ? name.slice(dot + 1) : '', fmt, category, size: 1000 };
}

const png = fi('/a/pic.png', 'png', 'image');
const mp4 = fi('/a/clip.mp4', 'mp4', 'video');
const mp3 = fi('/a/song.mp3', 'mp3', 'audio');
const pdf = fi('/a/doc.pdf', 'pdf', 'pdf');

describe('buildWheel (convert)', () => {
  it('a PNG offers 8 targets without png and heic', () => {
    const w = buildWheel([png], 'convert', makeCaps());
    const targets = w.items.map((i) => i.target);
    expect(targets).not.toContain('png');
    expect(targets).not.toContain('heic');
    expect(targets).toContain('pdf');
    expect(targets).toContain('docx');
    expect(w.items).toHaveLength(8);
  });

  it('HEIC is offered on macOS with sips', () => {
    const w = buildWheel([png], 'convert', makeCaps({ platform: 'darwin', heifEnc: true, heicTool: 'sips' }));
    expect(w.items.map((i) => i.target)).toContain('heic');
  });

  it('MP4 + MP3 share only mp3', () => {
    const w = buildWheel([mp4, mp3], 'convert', makeCaps());
    expect(w.items.map((i) => i.target)).toEqual(['mp3']);
    expect(w.mixed).toBe(true);
  });

  it('marks card conversions', () => {
    const w = buildWheel([png], 'convert', makeCaps());
    expect(w.items.find((i) => i.target === 'svg')?.needsOptions).toBe(true);
    expect(w.items.find((i) => i.target === 'jpg')?.needsOptions).toBe(false);
  });

  it('labels come from FORMATS', () => {
    const w = buildWheel([mp4], 'convert', makeCaps());
    expect(w.items.find((i) => i.target === 'webm')?.label).toBe(FORMATS.webm.label);
  });

  it('unsupported files give an empty wheel with a reason', () => {
    const w = buildWheel([fi('/a/x.zip', null, null)], 'convert', makeCaps());
    expect(w.items).toEqual([]);
    expect(w.emptyReason).toContain("isn't supported");
  });

  it('files already in the only target format are skipped', () => {
    const srt = fi('/a/b.srt', 'srt', 'subtitle');
    expect(buildWheel([srt], 'convert', makeCaps()).items.map((i) => i.target)).toEqual(['vtt', 'txt']);
    expect(buildWheel([pdf], 'convert', makeCaps()).items.map((i) => i.target)).not.toContain('pdf');
  });
});

describe('buildWheel (tools)', () => {
  it('mixed kinds → no tools, reason mentions Mixed', () => {
    const w = buildWheel([mp4, mp3], 'tools', makeCaps());
    expect(w.items).toEqual([]);
    expect(w.emptyReason).toContain('Mixed');
  });

  it('PDF merge needs two files', () => {
    const two = buildWheel([pdf, fi('/a/b.pdf', 'pdf', 'pdf')], 'tools', makeCaps());
    expect(two.items.map((i) => i.toolId)).toContain('pdf.merge');
    const one = buildWheel([pdf], 'tools', makeCaps());
    expect(one.items.map((i) => i.toolId)).not.toContain('pdf.merge');
  });

  it('video.mute is instant', () => {
    const w = buildWheel([mp4], 'tools', makeCaps());
    expect(w.items.find((i) => i.toolId === 'video.mute')?.needsOptions).toBe(false);
    expect(w.items.find((i) => i.toolId === 'video.trim')?.needsOptions).toBe(true);
  });
});
```

**Verify**
```bash
npx vitest run src/shared
```

**Done when:** all tests in `src/shared` pass.

## Task 1.3 — Generate the registry JSON for Rust

**Goal.** The Rust code reads the same formats, tools and defaults as the UI.

`scripts/gen-registry.mjs` imports the TypeScript registries (Node 22.18+ runs `.ts` files directly) and writes three JSON
files into `src/shared/registry/`. The Rust core embeds them at compile time (Task 3.6). With `--check` it only compares and
fails when the files are stale (used by CI).

**File `scripts/gen-registry.mjs`**

```js
// Writes src/shared/registry/*.json from the TypeScript registries, which stay the single source of truth:
// the UI imports the .ts files, the Rust core embeds these JSON files (include_str!).
// Run after changing formats.ts, tools.ts, toolOptions.ts or DEFAULT_SETTINGS. `--check` fails if they are stale (CI).
// Node 22.18+ runs .ts files directly (type stripping); the shared files only use `import type`, so this works.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from '../src/shared/formats.ts';
import * as T from '../src/shared/tools.ts';
import * as O from '../src/shared/toolOptions.ts';
import * as Ty from '../src/shared/types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src', 'shared', 'registry');
const files = {
  'formats.json': {
    formats: F.FORMATS, categoryOrder: F.CATEGORY_ORDER, categoryLabel: F.CATEGORY_LABEL, categoryNote: F.CATEGORY_NOTE,
    convertTargets: F.CONVERT_TARGETS, requiredEncoders: F.REQUIRED_ENCODERS, optionPairs: F.OPTION_PAIRS
  },
  'tools.json': { tools: T.TOOLS },
  'defaults.json': { settings: Ty.DEFAULT_SETTINGS, convert: O.DEFAULT_CONVERT_OPTIONS, edit: O.DEFAULT_EDIT, tools: O.TOOL_DEFAULTS }
};

const check = process.argv.includes('--check');
let stale = 0;
fs.mkdirSync(outDir, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  const file = path.join(outDir, name);
  const text = JSON.stringify(data, null, 2) + '\n';
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (old === text) continue;
  if (check) { console.error(`stale: ${path.relative(root, file)} — run npm run gen:registry`); stale++; continue; }
  fs.writeFileSync(file, text);
  console.log(`wrote ${path.relative(root, file)}`);
}
if (stale) process.exit(1);
console.log(`registry ok: ${Object.keys(F.FORMATS).length} formats, ${T.TOOLS.length} tools`);
```

**Run**
```bash
npm run gen:registry
```

**Verify**
```bash
npm run gen:registry -- --check
ls src/shared/registry/formats.json src/shared/registry/tools.json src/shared/registry/defaults.json
node -e "const f=JSON.parse(require('fs').readFileSync('src/shared/registry/formats.json','utf8')); if(f.formats.epub.input!==false||f.categoryOrder.includes('epub')) process.exit(1)"
```

**Done when:** the check prints `registry ok: … formats, … tools`, the three files exist and EPUB is output-only in
`formats.json`. Commit the three JSON files.

## Task 1.4 — The Tauri bridge

**Goal.** Every call the UI made through Electron's `window.api` now goes through Tauri.

1. `src/shared/ipc.ts` defines the API the UI uses (unchanged names, so the rest of the UI does not change), the event
   names (`EVENTS`) and the new native drop event (`DropEvent`). `getPathForFile` is gone (Tauri drops carry paths);
   `uiReady` and `onDrop` are new.

**File `src/shared/ipc.ts`**

```ts
import type { OverlaySize } from './overlay';
import type {
  Capabilities, DragState, FileInfo, ImagePreviewRequest, ImagePreviewResult, JobRequest, JobUpdate,
  MetadataInfo, OverlayInit, Settings, WheelMode
} from './types';

/** Event names emitted by the Rust side (src-tauri). */
export const EVENTS = {
  jobUpdate: 'ev:job-update',
  overlayInit: 'ev:overlay-init',
  overlayFiles: 'ev:overlay-files',
  overlayDrag: 'ev:overlay-drag',
  settings: 'ev:settings',
  navigate: 'ev:navigate',
  drop: 'ev:drop'
} as const;

/** A native file drag over / drop on THIS window. x/y are CSS pixels (same as clientX/clientY). */
export interface DropEvent {
  phase: 'enter' | 'over' | 'drop' | 'leave';
  /** Present on 'enter' and 'drop' only. */
  paths?: string[];
  x: number;
  y: number;
  /** Modifier keys sampled by the OS when the event happened. */
  alt: boolean;
  shift: boolean;
}

export interface AlohamoraApi {
  getCapabilities(): Promise<Capabilities>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  pickFiles(): Promise<string[]>;
  pickFolder(): Promise<string | null>;
  inspectFiles(paths: string[], deep: boolean): Promise<FileInfo[]>;
  startJob(req: JobRequest): Promise<string>;
  cancelJob(id: string): Promise<void>;
  listJobs(): Promise<JobUpdate[]>;
  reveal(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  openNotices(): Promise<void>;
  openOverlay(paths: string[], mode: WheelMode): Promise<void>;
  closeOverlay(): Promise<void>;
  resizeOverlay(size: OverlaySize): Promise<void>;
  overlayDropped(paths: string[]): Promise<FileInfo[]>;
  previewMedia(path: string): Promise<{ url: string; isProxy: boolean }>;
  previewFrame(path: string, timeSec: number, maxWidth: number): Promise<string>;
  previewWaveform(path: string, width: number, height: number): Promise<string>;
  previewImage(req: ImagePreviewRequest): Promise<ImagePreviewResult>;
  pdfThumbnails(path: string, maxWidth: number): Promise<string[]>;
  readMetadata(path: string): Promise<MetadataInfo>;
  /** Tell the backend this window has rendered (the main window is shown then; overlay events start flowing). */
  uiReady(): Promise<void>;
  onJobUpdate(cb: (u: JobUpdate) => void): () => void;
  onOverlayInit(cb: (p: OverlayInit) => void): () => void;
  onOverlayFiles(cb: (files: FileInfo[]) => void): () => void;
  onOverlayDrag(cb: (s: DragState) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;
  onNavigate(cb: (tab: 'convert' | 'formats' | 'settings') => void): () => void;
  onDrop(cb: (e: DropEvent) => void): () => void;
}
```

2. `src/renderer/src/lib/api.ts` implements that API with `invoke` (commands) and the current window's `listen` (events).
   Rust command errors arrive as `{ message }`; `call()` turns them into normal `Error` objects so existing
   `catch (e) { e.message }` code keeps working. `uiReady()` first waits until every `listen()` is registered, so no event
   sent right after start-up is lost.

**File `src/renderer/src/lib/api.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { EVENTS, type AlohamoraApi } from '@shared/ipc';

const win = getCurrentWebviewWindow();
/** listen() registers asynchronously; uiReady() waits for these so no early event is lost. */
const registering: Array<Promise<unknown>> = [];

/** Subscribe to an event sent to this window; returns an unsubscribe function (listen() is async). */
function on<T>(event: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const unlisten = win.listen<T>(event, (e) => cb(e.payload));
    registering.push(unlisten);
    return () => { void unlisten.then((off) => off()); };
  };
}

/**
 * Commands reject with `{ message }` (Rust `CmdError`). Re-throw as a real Error so callers can use `e.message`
 * exactly as with Electron's ipcRenderer.invoke.
 */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    throw new Error(message);
  }
}

/** Every backend call the UI makes. Argument names are camelCase here; Tauri maps them to snake_case in Rust. */
export const api: AlohamoraApi = {
  getCapabilities: () => call('get_capabilities'),
  getSettings: () => call('get_settings'),
  setSettings: (patch) => call('set_settings', { patch }),
  pickFiles: () => call('pick_files'),
  pickFolder: () => call('pick_folder'),
  inspectFiles: (paths, deep) => call('inspect_files', { paths, deep }),
  startJob: (req) => call('start_job', { req }),
  cancelJob: (id) => call('cancel_job', { id }),
  listJobs: () => call('list_jobs'),
  reveal: (path) => call('reveal', { path }),
  openPath: (path) => call('open_path', { path }),
  openNotices: () => call('open_notices'),
  openOverlay: (paths, mode) => call('open_overlay', { paths, mode }),
  closeOverlay: () => call('close_overlay'),
  resizeOverlay: (size) => call('resize_overlay', { size }),
  overlayDropped: (paths) => call('overlay_dropped', { paths }),
  previewMedia: (path) => call('preview_media', { path }),
  previewFrame: (path, timeSec, maxWidth) => call('preview_frame', { path, timeSec, maxWidth }),
  previewWaveform: (path, width, height) => call('preview_waveform', { path, width, height }),
  previewImage: (req) => call('preview_image', { req }),
  pdfThumbnails: (path, maxWidth) => call('pdf_thumbnails', { path, maxWidth }),
  readMetadata: (path) => call('read_metadata', { path }),
  uiReady: async () => { await Promise.all(registering); await call('ui_ready'); },
  onJobUpdate: on(EVENTS.jobUpdate),
  onOverlayInit: on(EVENTS.overlayInit),
  onOverlayFiles: on(EVENTS.overlayFiles),
  onOverlayDrag: on(EVENTS.overlayDrag),
  onSettings: on(EVENTS.settings),
  onNavigate: on(EVENTS.navigate),
  onDrop: on(EVENTS.drop)
};

/** "main" or "overlay": which view this window shows. */
export const windowLabel = (): string => win.label;
```

3. `src/renderer/src/lib/nativeDrop.ts` is a small React hook around the `ev:drop` event plus a hit-test helper:

**File `src/renderer/src/lib/nativeDrop.ts`**

```ts
import { useEffect, useRef } from 'react';
import type { DropEvent } from '@shared/ipc';
import { api } from './api';

/**
 * Native file drag-and-drop on this window (Tauri's drag-drop handler; HTML5 file drops do not exist).
 * The handler gets every phase; `paths` is remembered from 'enter' because 'over' carries none.
 */
export function useNativeDrop(handler: (e: DropEvent, paths: string[]) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    let paths: string[] = [];
    return api.onDrop((e) => {
      if (e.paths) paths = e.paths;
      latest.current(e, paths);
      if (e.phase === 'drop' || e.phase === 'leave') paths = [];
    });
  }, []);
}

/** True when the point (CSS pixels, like clientX/clientY) is over an element matching `selector`. */
export function isOver(x: number, y: number, selector: string): boolean {
  return document.elementFromPoint(x, y)?.closest(selector) != null;
}
```

**Verify**
```bash
grep -q "export const EVENTS" src/shared/ipc.ts
grep -q "invoke" src/renderer/src/lib/api.ts
test -f src/renderer/src/lib/nativeDrop.ts
```

**Done when:** the three files exist with the content above (type checking happens in Task 1.9).

## Task 1.5 — Native drag-and-drop in the drop zone, home view and wheel

**Goal.** Dropping files works through Tauri's native events instead of HTML5 `onDrop`.

How it works: the Rust side (Task 8.4) forwards the OS drag-and-drop events of a window to that window only, as
`ev:drop` with `phase` (`enter`, `over`, `drop`, `leave`), `paths` (on `enter` and `drop`), the pointer position in CSS
pixels and the Alt/Shift keys. The UI decides what was hit with `document.elementFromPoint`.

1. Delete the old HTML5 helper:

**Delete `src/renderer/src/lib/dnd.ts`**

2. The drop zone only shows the highlight now; the drop itself is handled by the home view:

**File `src/renderer/src/components/DropZone.tsx`**

```tsx
import { useState } from 'react';
import { api } from '../lib/api';
import { isOver, useNativeDrop } from '../lib/nativeDrop';
import { Button } from './Button';
import { Icon } from './Icon';

/** The big drop target on the Convert page. The drop itself is handled by HomeView (anywhere on the page). */
export function DropZone() {
  const [over, setOver] = useState(false);
  useNativeDrop((e) => setOver((e.phase === 'enter' || e.phase === 'over') && isOver(e.x, e.y, '.dropzone')));
  const open = (paths: string[]): void => { if (paths.length) void api.openOverlay(paths, 'convert'); };
  return (
    <div className={`dropzone${over ? ' is-over' : ''}`}>
      <Icon name="drop" size={30} />
      <p className="dropzone__title">Drop files here</p>
      <p className="dropzone__sub">
        or <Button variant="soft" onClick={() => void api.pickFiles().then(open)}>Browse files…</Button>
      </p>
    </div>
  );
}
```

3. The home view opens the wheel for a drop anywhere on the page (Alt/Option held = Tools ring). The subtitle no longer
   mentions ebooks.

**File `src/renderer/src/views/HomeView.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { FORMATS } from '@shared/formats';
import { toolsFor } from '@shared/tools';
import type { Capabilities, Fmt } from '@shared/types';
import type { WheelItem } from '@shared/wheelItems';
import { DropZone } from '../components/DropZone';
import { Keycap } from '../components/Keycap';
import { Wheel } from '../components/Wheel/Wheel';
import { api } from '../lib/api';
import { useNativeDrop } from '../lib/nativeDrop';
import { altKeyName, altKeycap } from '../lib/platform';
import { ActivityList } from './ActivityList';

const DEMO_FORMATS: Fmt[] = ['mp4', 'mkv', 'webm', 'avi', 'wmv', 'gif', 'mp3'];

/** Cycles 0..n-1 forever; the demo wheels use it to highlight one slice at a time. */
function useCycle(n: number, ms: number, start: number): number {
  const [i, setI] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms]);
  return i;
}

function DemoWheel({ items, active, label }: { items: WheelItem[]; active: number; label: string }) {
  return (
    <div className="hint-wheel" aria-hidden="true">
      <Wheel demo items={items} active={active} hubLabel={label} />
    </div>
  );
}

export function HomeView() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => { void api.getCapabilities().then(setCaps); }, []);

  const formatItems = useMemo<WheelItem[]>(() => DEMO_FORMATS.map((t) => ({
    key: `to-${t}`, label: FORMATS[t].label, kind: 'format', target: t, needsOptions: false
  })), []);
  const toolItems = useMemo<WheelItem[]>(() => toolsFor('video', 1).map((t) => ({
    key: t.id, label: t.label, icon: t.icon, kind: 'tool', toolId: t.id, needsOptions: !t.instant
  })), []);

  const fi = useCycle(formatItems.length, 1200, 4);
  const ti = useCycle(toolItems.length, 1200, 0);
  const alt = altKeycap();

  // A drop anywhere on this page opens the wheel; Alt (Option) held = the Tools ring.
  useNativeDrop((e, paths) => {
    if (e.phase === 'drop' && paths.length) void api.openOverlay(paths, e.alt ? 'tools' : 'convert');
  });

  return (
    <div className="home">
      <h1 className="home__title">Drop a file. Pick a slice.</h1>
      <p className="home__sub">
        Convert and edit images, video, audio, PDFs and subtitles — offline, on this computer. Nothing is uploaded.
      </p>
      {caps && !caps.ffmpeg && (
        <div className="banner" role="alert">
          FFmpeg was not found — video and audio are disabled. Run <code>npm run fetch-binaries</code>.
        </div>
      )}
      <DropZone />
      <section className="hints" aria-label="How it works">
        <div className="hint-card">
          <div className="hint-card__keys"><Keycap glyph="⇧" label="shift" /></div>
          <p className="hint-card__title">Convert formats</p>
          <DemoWheel items={formatItems} active={fi} label={formatItems[fi].label} />
          <p className="hint-card__caption">Convert to {formatItems[fi].label}</p>
        </div>
        <div className="hint-card">
          <div className="hint-card__keys">
            <Keycap glyph="⇧" label="shift" />
            <span className="hint-card__plus">+</span>
            <Keycap glyph={alt.glyph} label={alt.label} />
          </div>
          <p className="hint-card__title">Advanced tools</p>
          <DemoWheel items={toolItems} active={ti} label={toolItems[ti].label} />
          <p className="hint-card__caption">{toolItems[ti].label}</p>
        </div>
      </section>
      <p className="home__tip">
        In this window: drop = convert · <kbd>{altKeyName()}</kbd> + drop = tools · <kbd>Tab</kbd> switches inside the wheel
      </p>
      <ActivityList />
    </div>
  );
}
```

4. The overlay window: tells the back end it is ready **after** its listeners exist, and treats a drop outside the wheel
   like a drop on the hub.

**File `src/renderer/src/OverlayApp.tsx`**

```tsx
import { useEffect } from 'react';
import { api } from './lib/api';
import { isOver, useNativeDrop } from './lib/nativeDrop';
import { sizeForStage } from './overlay/sizes';
import { useOverlay, type Stage } from './overlay/store';
import { DoneStage } from './overlay/stages/DoneStage';
import { ErrorStage } from './overlay/stages/ErrorStage';
import { OptionsStage } from './overlay/stages/OptionsStage';
import { PanelStage } from './overlay/stages/PanelStage';
import { RunningStage } from './overlay/stages/RunningStage';
import { WheelStage } from './overlay/stages/WheelStage';
import './overlay/overlay.css';

const AUTO_CLOSE_ON_BLUR: Stage['name'][] = ['wheel', 'running', 'done', 'error'];

function StageView({ stage }: { stage: Stage }) {
  switch (stage.name) {
    case 'empty': return null;
    case 'wheel': return <WheelStage />;
    case 'options': return <div className="overlay__center"><OptionsStage target={stage.target} /></div>;
    case 'panel': return <div className="overlay__center"><PanelStage toolId={stage.toolId} /></div>;
    case 'running': return <div className="overlay__center"><RunningStage jobId={stage.jobId} /></div>;
    case 'done': return <div className="overlay__center"><DoneStage job={stage.job} /></div>;
    case 'error': return <div className="overlay__center"><ErrorStage message={stage.message} details={stage.details} /></div>;
  }
}

/** A drop on the empty part of the overlay behaves like a drop on the hub. Drops on the wheel are handled by the wheel. */
function dropOutsideWheel(paths: string[]): void {
  if (paths.length === 0) return;
  void api.overlayDropped(paths).then((files) => useOverlay.getState().dropFinished(files));
}

export function OverlayApp() {
  const stage = useOverlay((s) => s.stage);
  const files = useOverlay((s) => s.files);

  useEffect(() => {
    const offs = [
      api.onOverlayInit((p) => useOverlay.getState().init(p)),
      api.onOverlayFiles((files) => useOverlay.getState().mergeFiles(files)),
      api.onOverlayDrag((s) => {
        const st = useOverlay.getState();
        if (!s.active) { st.endDrag(); return; }
        if (!st.caps) void api.getCapabilities().then((caps) => useOverlay.setState({ caps }));
        if (st.dragging) st.setMode(s.mode); else st.startDrag(s.mode);
        if (s.files) st.setDragFiles(s.files);
      })
    ];
    const onBlur = (): void => {
      const s = useOverlay.getState();
      if (!s.dragging && AUTO_CLOSE_ON_BLUR.includes(s.stage.name)) void api.closeOverlay();
    };
    window.addEventListener('blur', onBlur);
    void api.uiReady();             // listeners exist: the backend may now send overlay events
    return () => { offs.forEach((o) => o()); window.removeEventListener('blur', onBlur); };
  }, []);

  useNativeDrop((e, paths) => {
    if (e.phase === 'drop' && !isOver(e.x, e.y, '.wheel')) dropOutsideWheel(paths);
  });

  const catKey = files.map((f) => f.category).join(",");   // deep-inspection updates must not re-place the window
  useEffect(() => { void api.resizeOverlay(sizeForStage(stage, useOverlay.getState().files)); }, [stage, catKey]);

  return (
    <div className="overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget && stage.name === 'wheel' && !useOverlay.getState().dragging) void api.closeOverlay(); }}>
      <StageView stage={stage} />
    </div>
  );
}
```

5. The wheel: a drop on a slice runs that slice; dragging *out* of the wheel hands the paths to the overlay.

**File `src/renderer/src/components/Wheel/Wheel.tsx`**

```tsx
import type { WheelItem } from '@shared/wheelItems';
import { useRef } from 'react';
import { useNativeDrop } from '../../lib/nativeDrop';
import { Icon } from '../Icon';
import { KeyLock } from './KeyLock';
import { DEFAULT_GEOMETRY as G, hitTest, labelPoint, sliceOffset, slicePath } from './wheelGeometry';
import './wheel.css';

export interface WheelProps {
  items: WheelItem[];
  active: number | null;
  onActiveChange?: (i: number | null) => void;
  onPick?: (i: number, withOptions: boolean) => void;
  hubLabel?: string;
  thumbnail?: string;
  /** Bump this number each time a choice is made: the key in the centre gives a twist. */
  pickToken?: number;
  demo?: boolean;                                                     // non-interactive (home page)
  onDropFiles?: (paths: string[], hit: number | 'center' | null) => void;   // files dropped on the wheel
  onDragPaths?: (paths: string[]) => void;                                  // files entered the window (before the drop)
}

export function Wheel(p: WheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const n = p.items.length;
  const hubSize = (G.rInner - 6) * 2;

  const hit = (clientX: number, clientY: number): number | 'center' | null => {
    const el = ref.current;
    if (!el || n === 0) return null;
    const r = el.getBoundingClientRect();
    const s = r.width / G.size;                     // supports CSS scaling
    return hitTest((clientX - r.left) / s, (clientY - r.top) / s, n, G);
  };
  const setActive = (h: number | 'center' | null): void => p.onActiveChange?.(typeof h === 'number' ? h : null);

  // Native drag-and-drop (only when the parent wants drops): highlight the slice under the cursor, drop on it.
  // The OS reports a copy, never a move, so the original file always stays where it is.
  useNativeDrop((e, paths) => {
    if (!p.onDropFiles || p.demo) return;
    if (e.phase === 'enter') p.onDragPaths?.(paths);
    if (e.phase === 'enter' || e.phase === 'over') setActive(hit(e.x, e.y));
    if (e.phase === 'leave') p.onActiveChange?.(null);
    if (e.phase === 'drop' && ref.current?.contains(document.elementFromPoint(e.x, e.y))) p.onDropFiles(paths, hit(e.x, e.y));
  });

  return (
    <div
      ref={ref}
      className={`wheel${p.demo ? ' wheel--demo' : ''}`}
      style={{ width: G.size, height: G.size }}
      role="menu"
      aria-activedescendant={p.active !== null ? `wheel-item-${p.active}` : undefined}
      onPointerMove={(e) => { if (!p.demo) setActive(hit(e.clientX, e.clientY)); }}
      onPointerLeave={() => { if (!p.demo) p.onActiveChange?.(null); }}
      onClick={(e) => { const h = hit(e.clientX, e.clientY); if (!p.demo && typeof h === 'number') p.onPick?.(h, false); }}
      onContextMenu={(e) => { e.preventDefault(); const h = hit(e.clientX, e.clientY); if (!p.demo && typeof h === 'number') p.onPick?.(h, true); }}
    >
      <svg className="wheel__svg" width={G.size} height={G.size} viewBox={`0 0 ${G.size} ${G.size}`} aria-hidden="true">
        <defs>
          <linearGradient id="kbSliceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--slice-top)' }} />
            <stop offset="1" style={{ stopColor: 'var(--slice-bottom)' }} />
          </linearGradient>
          <filter id="kbSliceShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.16" />
          </filter>
        </defs>
        <circle className="wheel__base" cx={G.cx} cy={G.cy} r={G.rOuter + 8} />
        {p.items.map((item, i) => {
          const off = sliceOffset(i, n, 3);
          return (
            <path key={item.key} d={slicePath(i, n, G)} className={`wheel__slice${i === p.active ? ' is-active' : ''}`}
              strokeWidth={G.corner * 2} strokeLinejoin="round" filter="url(#kbSliceShadow)"
              style={{ ['--tx' as string]: `${off.x}px`, ['--ty' as string]: `${off.y}px` }} />
          );
        })}
      </svg>
      {p.items.map((item, i) => {
        const pt = labelPoint(i, n, G);
        const off = sliceOffset(i, n, 3);
        return (
          <div key={item.key} id={`wheel-item-${i}`} role="menuitem" aria-label={item.label}
            className={`wheel__label${i === p.active ? ' is-active' : ''}`}
            style={{ left: pt.x, top: pt.y, ['--tx' as string]: `${off.x}px`, ['--ty' as string]: `${off.y}px` }}>
            {item.icon && <Icon name={item.icon} size={18} />}
            <span>{item.label}</span>
          </div>
        );
      })}
      <div className="wheel__hub" style={{ width: hubSize, height: hubSize }}>
        {p.thumbnail && <img className="wheel__thumb" src={p.thumbnail} alt="" />}
        <KeyLock angle={p.active !== null && n > 0 ? (p.active * 360) / n : null} turnToken={p.pickToken ?? 0} size={hubSize} />
        {p.hubLabel && <span className="sr-only">{p.hubLabel}</span>}
      </div>
    </div>
  );
}
```

**File `src/renderer/src/overlay/stages/WheelStage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { categoryOf, fmtFromPath } from '@shared/formats';
import type { FileInfo } from '@shared/types';
import { buildWheel, type WheelItem, type WheelModel } from '@shared/wheelItems';
import { Wheel } from '../../components/Wheel/Wheel';
import { api } from '../../lib/api';
import { playClick, playTurn } from '../../lib/sound';
import { useOverlay } from '../store';

const EMPTY: WheelModel = { items: [], category: null, mixed: false };
/** After a choice, let the key finish its twist and the click be heard before the next card appears. */
const FEEDBACK_MS = 130;

export function WheelStage() {
  const { files, mode, caps, active, dragging, dragFmts, setActive, setMode, go, setDragFmts, dropFinished } = useOverlay();

  const [turn, setTurn] = useState(0);

  // The key turns (with its sound) whenever the highlight lands on a different choice.
  useEffect(() => { if (active !== null) playTurn(); }, [active]);

  const model = useMemo<WheelModel>(() => {
    if (!caps) return EMPTY;
    if (dragging && files.length === 0) {
      // Global drag: the formats come from the dragged paths until the real files are inspected.
      if (dragFmts.length === 0 || dragFmts.some((f) => f === null)) return { ...EMPTY, emptyReason: 'Drop to choose' };
      const pseudo: FileInfo[] = dragFmts.map((fmt) => ({
        path: '', name: '', base: '', ext: '', fmt, category: fmt ? categoryOf(fmt) : null, size: 0
      }));
      return buildWheel(pseudo, mode, caps);
    }
    return buildWheel(files, mode, caps);
  }, [files, mode, caps, dragging, dragFmts]);

  /** Start the job / open the card for `item` using `inputs` (explicit so a drop can use the freshly resolved files). */
  const run = async (inputs: FileInfo[], item: WheelItem, withOptions: boolean): Promise<void> => {
    setTurn((t) => t + 1);          // the key twists …
    playClick();                    // … and the lock clicks
    const settle = new Promise<void>((resolve) => { setTimeout(resolve, FEEDBACK_MS); });
    const paths = inputs.map((f) => f.path);
    if (item.kind === 'tool' && item.toolId) {
      if (!item.needsOptions && !withOptions) {
        const [jobId] = await Promise.all([api.startJob({ kind: 'tool', inputs: paths, toolId: item.toolId, options: {} }), settle]);
        go({ name: 'running', jobId });
      } else {
        await settle;
        go({ name: 'panel', toolId: item.toolId });
      }
      return;
    }
    if (!item.target) return;
    if (item.needsOptions || withOptions) { await settle; go({ name: 'options', target: item.target }); return; }
    const [jobId] = await Promise.all([api.startJob({ kind: 'convert', inputs: paths, target: item.target }), settle]);
    go({ name: 'running', jobId });
  };
  const pick = async (i: number, withOptions: boolean): Promise<void> => {
    const item = model.items[i];
    if (item && !dragging) await run(files, item, withOptions);
  };

  const onDropFiles = async (paths: string[], hit: number | 'center' | null): Promise<void> => {
    if (paths.length === 0) return;
    const before = model;
    const real = await api.overlayDropped(paths);
    dropFinished(real);
    if (!caps) return;
    const after = buildWheel(real, mode, caps);
    // Only act when the slice under the cursor means the same thing now that the real files are known.
    if (typeof hit === 'number' && after.items[hit] && after.items[hit].key === before.items[hit]?.key) {
      await run(real, after.items[hit], false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const n = model.items.length;
      if (e.key === 'Escape') { void api.closeOverlay(); return; }
      if (e.key === 'Tab') { e.preventDefault(); setMode(mode === 'convert' ? 'tools' : 'convert'); return; }
      if (n === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActive(active === null ? 0 : (active + 1) % n); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActive(active === null ? n - 1 : (active - 1 + n) % n); }
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) void pick(Number(e.key) - 1, false);
      else if (e.key === 'Enter' && active !== null) void pick(active, e.shiftKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hovered = active !== null ? model.items[active] : undefined;
  const first = files[0];
  const caption = hovered
    ? hovered.kind === 'format' ? `Convert to ${hovered.label}` : hovered.label
    : model.emptyReason ?? (mode === 'convert' ? 'Convert formats' : 'Advanced tools');
  const hubLabel = hovered?.label ?? (dragging && files.length === 0 && model.items.length === 0
    ? 'Drop to choose'
    : files.length > 1 ? `${files.length} files` : first?.fmt?.toUpperCase() ?? '');
  const subtitle = dragging && files.length === 0
    ? `Drop on a slice · ${dragFmts.length} item${dragFmts.length === 1 ? '' : 's'}`
    : files.length === 1 ? first?.name : `${files.length} files`;

  return (
    <div className="stage-wheel">
      <Wheel items={model.items} active={active} pickToken={turn} onActiveChange={setActive} onPick={(i, o) => void pick(i, o)}
        hubLabel={hubLabel} thumbnail={first?.thumbnail}
        onDragPaths={(paths) => setDragFmts(paths.map((path) => fmtFromPath(path)))}
        onDropFiles={(paths, hit) => { void onDropFiles(paths, hit); }} />
      <p className="stage-wheel__caption">{caption}</p>
      <p className="stage-wheel__sub">{subtitle} · <kbd>Tab</kbd> {mode === 'convert' ? 'Tools' : 'Formats'}</p>
    </div>
  );
}
```

**Verify**
```bash
test ! -e src/renderer/src/lib/dnd.ts
! grep -rn "pathsFromDataTransfer\|getPathForFile" src/renderer/src
```

**Done when:** nothing in `src/renderer/src` refers to `dnd.ts`, `pathsFromDataTransfer` or `getPathForFile`.

## Task 1.6 — Pointer-based reordering

**Goal.** Reordering rows (merge list, collage order) and PDF pages works without HTML5 drag-and-drop.

When a window has native file drop enabled, WebView2 on Windows does not deliver HTML5 drag events inside the page. The
two reorder components therefore use pointer events (`pointerdown` + `setPointerCapture`, the row under the pointer is
found through `data-index`).

**File `src/renderer/src/components/ReorderList.tsx`**

```tsx
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from './Icon';

export interface ReorderItem { id: string; title: string; subtitle?: string; thumbnail?: string }

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag to reorder (pointer events — HTML5 drag & drop is unavailable while Tauri's native file-drop handler
 * is on, which it must be) or Alt+↑/↓ on a focused row.
 */
export function ReorderList({ items, onChange, icon = 'file' }: {
  items: ReorderItem[]; onChange: (ids: string[]) => void; icon?: string;
}) {
  const dragging = useRef<number | null>(null);

  /** While the button is held, the row under the pointer takes the dragged row's place. */
  const onPointerMove = (e: PointerEvent): void => {
    const from = dragging.current;
    if (from === null) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.reorder__row');
    const to = row ? Number(row.dataset.index) : -1;
    if (to >= 0 && to !== from) { apply(from, to); dragging.current = to; }
  };

  const apply = (from: number, to: number): void => {
    const next = move(items, from, to);
    if (next !== items) onChange(next.map((i) => i.id));
  };
  const onKey = (i: number) => (e: KeyboardEvent): void => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const to = i + (e.key === 'ArrowUp' ? -1 : 1);
    apply(i, to);
    // keep keyboard focus on the moved row
    requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.reorder__row')[Math.min(Math.max(to, 0), items.length - 1)]?.focus());
  };

  return (
    <ul className="reorder" aria-label="Order of files">
      {items.map((it, i) => (
        <li key={it.id} className="reorder__row" tabIndex={0} data-index={i} onKeyDown={onKey(i)}
          aria-label={`${it.title}. Use Alt and arrow keys to move.`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            dragging.current = i;
            e.currentTarget.setPointerCapture(e.pointerId);    // keep receiving moves outside the row
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragging.current = null; }}
          onPointerCancel={() => { dragging.current = null; }}>
          <Icon name="grip" size={16} className="reorder__grip" />
          <span className="reorder__thumb">{it.thumbnail ? <img src={it.thumbnail} alt="" draggable={false} /> : <Icon name={icon} size={18} />}</span>
          <span className="reorder__text">
            <span className="reorder__title">{it.title}</span>
            {it.subtitle && <span className="reorder__sub">{it.subtitle}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

**File `src/renderer/src/panels/pdf/OrganizePanel.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { PdfOrganizeOptions } from '@shared/toolOptions';
import { Button, IconButton } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { api } from '../../lib/api';
import { modClick } from '../../lib/platform';
import type { ToolPanelProps } from '..';

type Rotation = 0 | 90 | 180 | 270;
interface PageItem { src: number; rotate: Rotation }

const turn = (r: Rotation, d: 90 | -90): Rotation => ((r + d + 360) % 360) as Rotation;

export function OrganizePanel({ files, onApply, onBack, onClose }: ToolPanelProps) {
  const file = files[0];
  const initial = useMemo<PageItem[]>(() => Array.from({ length: file.pages ?? 0 }, (_, i) => ({ src: i, rotate: 0 })), [file.pages]);
  const [pages, setPages] = useState<PageItem[]>(initial);
  const [thumbs, setThumbs] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchor = useRef<number | null>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void api.pdfThumbnails(file.path, 160).then((t) => { if (alive) setThumbs(t); }).catch(() => { if (alive) setThumbs([]); });
    return () => { alive = false; };
  }, [file.path]);

  const changed = pages.length !== initial.length || pages.some((p, i) => p.src !== i || p.rotate !== 0);
  const click = (e: MouseEvent, index: number): void => {
    const src = pages[index].src;
    setSelected((cur) => {
      if (e.shiftKey && anchor.current !== null) {
        const [a, b] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
        return new Set(pages.slice(a, b + 1).map((p) => p.src));
      }
      if (modClick(e)) { const n = new Set(cur); if (n.has(src)) n.delete(src); else n.add(src); return n; }
      return new Set([src]);
    });
    if (!e.shiftKey) anchor.current = index;
  };
  const rotateSelected = (d: 90 | -90): void => setPages((cur) => cur.map((p) => (selected.has(p.src) ? { ...p, rotate: turn(p.rotate, d) } : p)));
  const canDelete = selected.size > 0 && pages.some((p) => !selected.has(p.src));
  const deleteSelected = (): void => { setPages((cur) => cur.filter((p) => !selected.has(p.src))); setSelected(new Set()); };
  const reorder = (to: number): void => {
    const from = dragging.current;
    if (from === null || from === to) return;
    setPages((cur) => { const next = [...cur]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; });
    dragging.current = to;
  };
  /** Pointer-based drag (HTML5 drag & drop is unavailable with Tauri's native file-drop handler). */
  const onPointerMove = (e: PointerEvent): void => {
    if (dragging.current === null) return;
    const card = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.pagecard');
    if (card) reorder(Number(card.dataset.index));
  };

  return (
    <Panel title="Organize pages" onBack={onBack} onClose={onClose} applyLabel="Save PDF" applyDisabled={!changed || pages.length === 0}
      onReset={() => { setPages(initial); setSelected(new Set()); }}
      onApply={() => onApply({ pages: pages.map((p) => ({ src: p.src, rotate: p.rotate })) } satisfies PdfOrganizeOptions)}>
      <div className="panel__line" role="toolbar" aria-label="Page actions">
        <IconButton label="Rotate left" icon="rotateLeft" disabled={selected.size === 0} onClick={() => rotateSelected(-90)} />
        <IconButton label="Rotate right" icon="rotateRight" disabled={selected.size === 0} onClick={() => rotateSelected(90)} />
        <IconButton label="Delete" icon="trash" disabled={!canDelete} onClick={deleteSelected} />
        <Button variant="soft" onClick={() => setSelected(new Set(pages.map((p) => p.src)))}>Select all</Button>
        <span className="panel__readout">{pages.length} of {initial.length} pages{selected.size ? ` · ${selected.size} selected` : ''}</span>
      </div>
      {thumbs === null && <p className="card-note">Loading pages…</p>}
      <div className="pagegrid" role="listbox" aria-label="Pages" aria-multiselectable="true">
        {pages.map((p, i) => (
          <div key={p.src} role="option" aria-selected={selected.has(p.src)} tabIndex={0} data-index={i}
            className={`pagecard${selected.has(p.src) ? ' is-selected' : ''}`}
            onClick={(e) => click(e, i)}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelected(new Set([p.src])); } }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              dragging.current = i;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => { dragging.current = null; }}
            onPointerCancel={() => { dragging.current = null; }}>
            <div className="pagecard__thumb">
              {thumbs?.[p.src] && (
                <img src={thumbs[p.src]} alt={`Page ${p.src + 1}`} draggable={false}
                  style={{ transform: `rotate(${p.rotate}deg)${p.rotate % 180 ? ' scale(0.72)' : ''}` }} />
              )}
            </div>
            <span className="pagecard__num">{p.src + 1}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

Stop touch scrolling and text selection while dragging a row:

**Edit `src/renderer/src/components/editors.css`**

Find:
```css
.reorder__row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: var(--radius-m); background: var(--surface-2); cursor: grab; }
```

Replace with:
```css
.reorder__row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: var(--radius-m); background: var(--surface-2); cursor: grab; touch-action: none; user-select: none; }
```

**Verify**
```bash
grep -q "setPointerCapture" src/renderer/src/components/ReorderList.tsx
grep -q "setPointerCapture" src/renderer/src/panels/pdf/OrganizePanel.tsx
grep -q "touch-action: none" src/renderer/src/components/editors.css
```

**Done when:** all three greps succeed.

## Task 1.7 — Window chrome and start-up

**Goal.** The title bar works in Tauri on every OS, and each window knows which view it shows.

- macOS: the window uses an overlay title bar; the traffic lights stay, the page leaves 84 px for them.
- Windows: the window has no native frame, so the page draws its own minimize/maximize/close buttons (`CaptionButtons`).
- Linux: the normal system title bar.
- Moving the window: elements with `data-tauri-drag-region` drag the window (replaces `-webkit-app-region: drag`).
- Start-up: `App` calls `api.uiReady()` after the first render; the back end shows the main window only then (no white
  flash).
- `main.tsx` picks the view from the **window label** (`main` or `overlay`) instead of `?view=` in the URL.

**File `src/renderer/src/components/CaptionButtons.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const win = getCurrentWindow();

/** Minimise / maximise / close for Windows, where the main window has no native title bar (decorations off). */
export function CaptionButtons() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const refresh = (): void => { void win.isMaximized().then(setMaximized); };
    refresh();
    const off = win.onResized(refresh);
    return () => { void off.then((un) => un()); };
  }, []);
  return (
    <div className="caption-buttons">
      <button type="button" aria-label="Minimize" onClick={() => void win.minimize()}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg>
      </button>
      <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={() => void win.toggleMaximize()}>
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized
            ? <path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" />
            : <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />}
        </svg>
      </button>
      <button type="button" className="is-close" aria-label="Close" onClick={() => void win.close()}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
      </button>
    </div>
  );
}
```

**File `src/renderer/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { CaptionButtons } from './components/CaptionButtons';
import { Logo } from './components/Logo';
import { api } from './lib/api';
import { getPlatform } from './lib/platform';
import { FormatsView } from './views/FormatsView';
import { HomeView } from './views/HomeView';
import { SettingsView } from './views/SettingsView';
import './views/views.css';

type Tab = 'convert' | 'formats' | 'settings';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'convert', label: 'Convert' }, { id: 'formats', label: 'Formats' }, { id: 'settings', label: 'Settings' }
];

export function App() {
  const [tab, setTab] = useState<Tab>('convert');
  useEffect(() => api.onNavigate(setTab), []);    // macOS ⌘, → Settings
  useEffect(() => { void api.uiReady(); }, []);   // first render done: the backend shows the window now (no white flash)
  return (
    <div className="app">
      {/* data-tauri-drag-region: dragging the empty title bar moves the window; double-click maximizes. */}
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region><Logo size={26} />Alohamora</div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {getPlatform() === 'win32' && <CaptionButtons />}
      </header>
      <main className="app__content">
        {tab === 'convert' ? <HomeView /> : tab === 'formats' ? <FormatsView /> : <SettingsView />}
      </main>
    </div>
  );
}
```

**File `src/renderer/src/main.tsx`**

```tsx
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/global.css';
import './components/components.css';
import './components/editors.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { OverlayApp } from './OverlayApp';
import { windowLabel } from './lib/api';
import { getPlatform } from './lib/platform';
import { initSound } from './lib/sound';
import { initTheme } from './lib/theme';

// Both windows load index.html; the window label decides the view ("main" or "overlay").
const view = windowLabel() === 'overlay' ? 'overlay' : 'main';
document.documentElement.dataset.view = view;
document.documentElement.dataset.platform = getPlatform();   // CSS: html[data-platform='darwin'] …
// Files are dropped through Tauri's native handler; never let the webview open a dropped file itself.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
void initTheme();
void initSound();
createRoot(document.getElementById('root') as HTMLElement).render(view === 'overlay' ? <OverlayApp /> : <App />);
```

**File `src/renderer/src/views/views.css`**

```css
/* ---------- app shell ---------- */
.app { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
.titlebar { height: 44px; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; position: relative; }
html[data-platform='win32'] .titlebar { padding-right: 150px; }   /* room for CaptionButtons (3 × 46 px) */
html[data-platform='darwin'] .titlebar { padding-left: 84px; }    /* room for the traffic lights */
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.tabs { position: absolute; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-2); }
.tab { border: 0; background: transparent; padding: 5px 16px; border-radius: 999px; font-size: 13px; font-weight: 500; color: var(--text-2); cursor: pointer; }
.tab:hover { color: var(--text); }
.tab.is-on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-1); }
.app__content { flex: 1; overflow: auto; padding: 32px 40px; }

/* ---------- home ---------- */
.home { max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
.home__title { font-size: 40px; font-weight: 500; letter-spacing: -0.02em; text-align: center; }
.home__sub { text-align: center; color: var(--text-2); font-size: 15px; line-height: 1.5; max-width: 640px; margin: -8px auto 4px; }
.home__tip { text-align: center; color: var(--text-2); font-size: 13px; }
.banner { padding: 10px 14px; border-radius: var(--radius-m); background: color-mix(in srgb, var(--danger) 10%, var(--surface)); color: var(--text); font-size: 13px; border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); }
.banner code { font: 12px Consolas, monospace; background: var(--surface-2); padding: 1px 5px; border-radius: 5px; }

.dropzone { height: 220px; border: 2px dashed var(--border); border-radius: var(--radius-l); background: var(--surface);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-2);
  transition: border-color 140ms var(--ease-out), background 140ms var(--ease-out), transform 140ms var(--ease-out); }
.dropzone.is-over { border-color: var(--accent); background: var(--accent-soft); color: var(--text); transform: scale(1.005); }
.dropzone__title { font-size: 20px; font-weight: 600; color: var(--text); }
.dropzone__sub { display: flex; align-items: center; gap: 8px; font-size: 14px; }

.hints { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-1); padding: 24px 0 20px; }
.hint-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 0 16px; }
.hint-card + .hint-card { border-left: 1px solid var(--border); }
.hint-card__keys { display: flex; align-items: center; gap: 12px; }
.hint-card__keys .keycap { width: 64px; height: 64px; }
.hint-card__plus { color: var(--text-3); }
.hint-card__title { font-size: 13px; color: var(--text-2); }
.hint-card__caption { font-size: 13px; color: var(--text-2); min-height: 18px; }
.hint-wheel { position: relative; width: 211px; height: 211px; margin: 4px auto; }
.hint-wheel > .wheel { position: absolute; left: 50%; top: 0; transform-origin: top center; transform: translateX(-50%) scale(.62); }

@media (max-width: 760px) {
  .hints { grid-template-columns: 1fr; gap: 24px; }
  .hint-card + .hint-card { border-left: 0; }
}

/* ---------- activity ---------- */
.activity { margin-top: 8px; }
.activity__heading { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-3); margin-bottom: 8px; }
.activity__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.activity__row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--surface); border-radius: var(--radius-m); box-shadow: var(--shadow-1); }
.activity__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.activity__title { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.activity__file { color: var(--text-2); }
.activity__note { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activity__note--err { color: var(--danger); }
.activity__bar { height: 4px; border-radius: 999px; background: var(--track); overflow: hidden; }
.activity__bar span { display: block; height: 100%; background: var(--accent); transition: width 160ms linear; }
.activity__icon { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--text-3); }
.activity__icon--ok { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
.activity__icon--err { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
.activity__icon--spin { border: 3px solid var(--track); border-top-color: var(--accent); animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---------- placeholder views (Formats / Settings fill in later) ---------- */
.view-placeholder { max-width: 880px; margin: 0 auto; color: var(--text-2); }

/* ---------- formats (supported formats.png) ---------- */
.formats { max-width: 880px; margin: 0 auto; }
.formats__title { font-size: 34px; font-weight: 500; letter-spacing: -0.02em; margin-bottom: 18px; }
.formats__title--sub { margin-top: 44px; }
.formats__row { display: grid; grid-template-columns: 180px 1fr auto; gap: 16px; align-items: baseline; padding: 22px 0; border-top: 1px solid var(--border); }
.formats__cat { font-size: 15px; font-weight: 500; }
.formats__chips { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--text-2); }
.formats__note { font-size: 12px; color: var(--text-3); text-align: right; }
.fmt-chip { white-space: nowrap; }
.fmt-chip--lead { color: var(--text-3); }
.fmt-chip.is-off { text-decoration: line-through; opacity: .6; cursor: help; }
.fmt-tag { margin-left: 5px; padding: 1px 6px; border-radius: 999px; background: var(--surface-2); color: var(--text-3); font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.formats__footer { margin-top: 36px; padding-top: 18px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-2); }
@media (max-width: 760px) {
  .formats__row { grid-template-columns: 1fr; gap: 6px; }
  .formats__note { text-align: left; }
}

/* ---------- settings ---------- */
.settings { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; padding-bottom: 32px; }
.settings__title { font-size: 34px; font-weight: 500; letter-spacing: -0.02em; }
.settings__heading { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); margin: 0 0 8px 4px; }
.settings__card { background: var(--surface); border-radius: var(--radius-l); box-shadow: var(--shadow-1); padding: 10px 20px; display: flex; flex-direction: column; gap: 6px; }
.settings__card .row { padding: 8px 0; border-bottom: 1px solid var(--border); align-items: center; }
.settings__card .row:last-child { border-bottom: 0; }
.settings__card .row__label { max-width: 380px; }
.settings__card .row__hint { line-height: 1.4; }
.settings__path { font-size: 12px; color: var(--text-3); word-break: break-all; margin: -4px 0 6px; }
.settings__card .slider { padding: 8px 0; }
.settings__card .card-note { padding: 6px 0 4px; }
.toggle:disabled { opacity: .45; cursor: default; }

/* activity: header with Clear + day groups */
.activity__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.activity__head .activity__heading { margin-bottom: 0; }
.activity__group { font-size: 12px; color: var(--text-3); margin: 10px 0 6px 2px; font-weight: 600; }

/* Windows caption buttons (the window has no native title bar there). */
.caption-buttons { position: absolute; top: 0; right: 0; height: 44px; display: flex; }
.caption-buttons button { width: 46px; height: 44px; border: 0; background: transparent; color: var(--text); display: grid; place-items: center; cursor: default; }
.caption-buttons button:hover { background: var(--surface-2); }
.caption-buttons button.is-close:hover { background: #c42b1c; color: #fff; }
.caption-buttons svg { width: 10px; height: 10px; }
```

**Verify**
```bash
grep -q "data-tauri-drag-region" src/renderer/src/App.tsx
! grep -n "app-region" src/renderer/src/views/views.css
```

**Done when:** both checks succeed.

## Task 1.8 — Sound, panels and the formats page

**Goal.** Small fixes for the web views Tauri uses, and the EPUB → PDF card is gone.

1. WebKit (macOS, Linux) starts audio only after a user gesture. `sound.ts` now creates the audio context on the first
   click or key press:

**File `src/renderer/src/lib/sound.ts`**

```ts
import { api } from './api';
import { buildOutput, scheduleClick, scheduleTurn } from './soundSynth';

let enabled = true;
let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
let lastTurn = 0;

/** Created on first use (never at start-up), and resumed if the system suspended it. */
function engine(): { ctx: AudioContext; out: AudioNode } {
  if (!ctx || !out) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    out = buildOutput(ctx);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out };
}

export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}

/** The key turns: played when the highlight moves to a different choice. Rate-limited so a fast sweep stays pleasant. */
export function playTurn(): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastTurn < 60) return;
  lastTurn = now;
  try {
    const e = engine();
    scheduleTurn(e.ctx, e.out, e.ctx.currentTime + 0.003, 0.94 + Math.random() * 0.12);
  } catch { /* no audio device: stay silent */ }
}

/** The lock clicks: played when a choice is made. */
export function playClick(): void {
  if (!enabled) return;
  try {
    const e = engine();
    scheduleClick(e.ctx, e.out, e.ctx.currentTime + 0.003);
  } catch { /* no audio device: stay silent */ }
}

/** WebKit (macOS, Linux) starts audio only after a user gesture: create/resume the context on the first click or key. */
function unlockOnFirstGesture(): void {
  const unlock = (): void => { try { engine(); } catch { /* no audio device: stay silent */ } };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

/** Follow the "Sound effects" setting (both windows call this once at start-up). */
export async function initSound(): Promise<void> {
  unlockOnFirstGesture();
  setSoundsEnabled((await api.getSettings()).sounds);
  api.onSettings((s) => setSoundsEnabled(s.sounds));
}
```

2. Delete the EPUB → PDF options card and its registration:

**Delete `src/renderer/src/panels/convert/EpubToPdfCard.tsx`**

**Edit `src/renderer/src/panels/index.ts`**

Find:
```ts
import { EpubToPdfCard } from './convert/EpubToPdfCard';
```

Replace with (empty: the line is deleted):
```ts
```

**Edit `src/renderer/src/panels/index.ts`**

Find:
```ts
CONVERT_CARDS['epub->pdf'] = { component: EpubToPdfCard, width: 440, height: 520 };
```

Replace with (empty: the line is deleted):
```ts
```

3. The formats page: no EPUB chip, and the engine list names the new engines.

**Edit `src/renderer/src/views/FormatsView.tsx`**

Find:
```tsx
  if (cat === 'epub') return <span className="fmt-chip">EPUB ↔ PDF</span>;
```

Replace with (empty: the line is deleted):
```tsx
```

**Edit `src/renderer/src/views/FormatsView.tsx`**

Find:
```tsx
        Everything runs on this computer. Engines: FFmpeg {version(caps)}, libvips (sharp), pdf.js, pdf-lib, Tesseract
```

Replace with:
```tsx
        Everything runs on this computer. Engines: FFmpeg {version(caps)}, PDFium, Tesseract, Typst
```

**Verify**
```bash
grep -q "PDFium, Tesseract, Typst" src/renderer/src/views/FormatsView.tsx
! grep -rn "EpubToPdf\|epub->pdf" src/renderer/src
```

**Done when:** no reference to the EPUB → PDF card is left.

## Task 1.9 — Check the whole UI

**Goal.** The UI type-checks, its tests pass and it builds.

**Verify**
```bash
npm run typecheck
npm test
npm run build:ui
test -f dist/renderer/index.html
```

**Done when:** type checking reports no errors, all tests pass (122 tests in 15 files when this plan was written) and
`dist/renderer/index.html` exists. If type checking fails, the error names a file: compare that file with its block in
Tasks 1.1–1.8.

# Phase 2 — Build scripts: binaries and resources

The app bundles four things it does not compile itself. They are downloaded **once, at build time**, by
`scripts/fetch-binaries.mjs`, and are never committed:

| What | Where | Used by |
|---|---|---|
| `ffmpeg` and `ffprobe` (7.1 or newer) | `src-tauri/binaries/ffmpeg-<target-triple>[.exe]`, `ffprobe-<target-triple>[.exe]` | Audio/video, HEIC/AVIF decoding, previews. Tauri "sidecars" must carry the target triple in their file name. |
| PDFium (`chromium/8086`) | `src-tauri/resources/pdfium/` (`pdfium.dll`, `libpdfium.dylib` or `libpdfium.so`) | Every PDF read, render and page copy |
| Tesseract language data (`eng`, `vie`, "fast" models) | `src-tauri/resources/tessdata/` | OCR |
| Noto Sans / Serif / Sans Mono fonts | `src-tauri/resources/fonts/` | Text → PDF and SVG text |

## Task 2.1 — Fetch and check scripts

**Goal.** Scripts that download the binaries and verify them.

1. `scripts/fetch-binaries.mjs` downloads everything for the current OS and CPU into the places above. If the FFmpeg
   download is blocked on your network, put an `ffmpeg` and `ffprobe` (7.1 or newer) into a folder and pass
   `--ffmpeg-dir=<folder>` or set `ALOHAMORA_FFMPEG_DIR` (Appendix D).

**File `scripts/fetch-binaries.mjs`**

```js
// Downloads everything the app bundles, ONCE, at build time (the app itself never downloads anything):
//   src-tauri/binaries/ffmpeg-<triple>, ffprobe-<triple>   (Tauri sidecars: the name must end with the target triple)
//   src-tauri/resources/pdfium/                          (PDFium shared library, bblanchon/pdfium-binaries)
//   src-tauri/resources/tessdata/                        (OCR languages: eng, vie)
//   src-tauri/resources/fonts/                           (Noto Sans / Serif / Sans Mono for text → PDF)
// Options: --target=<platform-arch> (e.g. darwin-x64), --ffmpeg-dir=<folder with ffmpeg + ffprobe> (offline/mirror).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import extract from 'extract-zip';

const root = path.resolve(import.meta.dirname, '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const target = arg('target') ?? `${process.platform}-${process.arch}`;          // e.g. darwin-arm64
const [platform] = target.split('-');
const exe = (name) => (platform === 'win32' ? `${name}.exe` : name);
const TRIPLE = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu'
}[target];
if (!TRIPLE) { console.error(`Unsupported target ${target}`); process.exit(1); }

const tauriDir = path.join(root, 'src-tauri');
const binDir = path.join(tauriDir, 'binaries');
const resDir = path.join(tauriDir, 'resources');
const tmp = path.join(root, '.cache', 'downloads', target);

const RIEDL = (os, a, file) => `https://ffmpeg.martin-riedl.de/redirect/latest/${os}/${a}/release/${file}`;
const FFMPEG = {
  'win32-x64': [{ url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', zip: 'ffmpeg-win.zip', files: ['ffmpeg.exe', 'ffprobe.exe'] }],
  'darwin-arm64': [{ url: RIEDL('macos', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'darwin-x64': [{ url: RIEDL('macos', 'amd64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'amd64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-x64': [{ url: RIEDL('linux', 'amd64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'amd64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-arm64': [{ url: RIEDL('linux', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }]
}[target];

// PDFium build tested with pdfium-render 0.9.4. Change both together.
const PDFIUM_TAG = 'chromium%2F8086';
const PDFIUM = {
  'win32-x64': { asset: 'pdfium-win-x64.tgz', lib: 'bin/pdfium.dll' },
  'darwin-arm64': { asset: 'pdfium-mac-arm64.tgz', lib: 'lib/libpdfium.dylib' },
  'darwin-x64': { asset: 'pdfium-mac-x64.tgz', lib: 'lib/libpdfium.dylib' },
  'linux-x64': { asset: 'pdfium-linux-x64.tgz', lib: 'lib/libpdfium.so' },
  'linux-arm64': { asset: 'pdfium-linux-arm64.tgz', lib: 'lib/libpdfium.so' }
}[target];

const TESS = {
  eng: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata',
  vie: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/vie.traineddata'
};

const NOTO = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts';
const FONTS = [
  'NotoSans/hinted/ttf/NotoSans-Regular.ttf', 'NotoSans/hinted/ttf/NotoSans-Bold.ttf',
  'NotoSans/hinted/ttf/NotoSans-Italic.ttf', 'NotoSans/hinted/ttf/NotoSans-BoldItalic.ttf',
  'NotoSerif/hinted/ttf/NotoSerif-Regular.ttf', 'NotoSerif/hinted/ttf/NotoSerif-Bold.ttf',
  'NotoSerif/hinted/ttf/NotoSerif-Italic.ttf', 'NotoSerif/hinted/ttf/NotoSerif-BoldItalic.ttf',
  'NotoSansMono/hinted/ttf/NotoSansMono-Regular.ttf', 'NotoSansMono/hinted/ttf/NotoSansMono-Bold.ttf'
];

async function download(url, dest) {
  if (fs.existsSync(dest)) { console.log('cached  ', path.basename(dest)); return; }
  console.log('download', url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + '.part'));
  await fs.promises.rename(dest + '.part', dest);
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findFile(p, name); if (r) return r; }
    else if (e.name.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

/** macOS/Linux: make executable. macOS: drop quarantine and keep a valid signature (ad-hoc sign if needed). */
function prepareBinary(file) {
  if (platform === 'win32') return;
  fs.chmodSync(file, 0o755);
  if (platform !== 'darwin' || process.platform !== 'darwin') return;   // can only sign on a Mac
  try { execFileSync('xattr', ['-d', 'com.apple.quarantine', file], { stdio: 'ignore' }); } catch { /* not quarantined */ }
  try { execFileSync('codesign', ['--verify', file], { stdio: 'ignore' }); }
  catch { execFileSync('codesign', ['--force', '--sign', '-', file]); console.log('ad-hoc signed', path.basename(file)); }
}

/** Sidecar file name Tauri expects: ffmpeg-x86_64-pc-windows-msvc.exe */
const sidecar = (name) => path.join(binDir, platform === 'win32' ? `${name}-${TRIPLE}.exe` : `${name}-${TRIPLE}`);

async function fetchFfmpeg() {
  if (fs.existsSync(sidecar('ffmpeg')) && fs.existsSync(sidecar('ffprobe'))) { console.log('ffmpeg already present for', target); return; }
  fs.mkdirSync(binDir, { recursive: true });
  const local = arg('ffmpeg-dir') ?? process.env.ALOHAMORA_FFMPEG_DIR;
  if (local) {
    for (const name of ['ffmpeg', 'ffprobe']) {
      fs.copyFileSync(path.join(local, exe(name)), sidecar(name));
      prepareBinary(sidecar(name));
    }
    const lic = ['LICENSE', 'LICENSE.txt', 'COPYING.GPLv3'].map((n) => path.join(local, n)).find((f) => fs.existsSync(f));
    if (lic) fs.copyFileSync(lic, path.join(resDir, 'LICENSE-ffmpeg.txt'));
    return;
  }
  for (const s of FFMPEG) {
    const zip = path.join(tmp, s.zip);
    await download(s.url, zip);
    const out = path.join(tmp, `${s.zip}-extract`);
    fs.rmSync(out, { recursive: true, force: true });
    await extract(zip, { dir: out });
    for (const name of s.files) {
      const src = findFile(out, name);
      if (!src) throw new Error(`${name} not found inside ${s.zip}`);
      const dest = sidecar(name.replace(/\.exe$/, ''));
      fs.copyFileSync(src, dest);
      prepareBinary(dest);
    }
    const lic = findFile(out, 'LICENSE') ?? findFile(out, 'LICENSE.txt') ?? findFile(out, 'COPYING.GPLv3');
    if (lic) fs.copyFileSync(lic, path.join(resDir, 'LICENSE-ffmpeg.txt'));
  }
}

async function fetchPdfium() {
  const dir = path.join(resDir, 'pdfium');
  const libName = path.basename(PDFIUM.lib);
  if (fs.existsSync(path.join(dir, libName))) { console.log('pdfium already present'); return; }
  const tgz = path.join(tmp, PDFIUM.asset);
  await download(`https://github.com/bblanchon/pdfium-binaries/releases/download/${PDFIUM_TAG}/${PDFIUM.asset}`, tgz);
  const out = path.join(tmp, 'pdfium-extract');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  execFileSync('tar', ['-xzf', tgz, '-C', out]);       // tar ships with Windows 10+, macOS and Linux
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(out, PDFIUM.lib), path.join(dir, libName));
  fs.copyFileSync(path.join(out, 'LICENSE'), path.join(dir, 'LICENSE-pdfium.txt'));
}

async function main() {
  fs.mkdirSync(resDir, { recursive: true });
  await fetchFfmpeg();
  // The bundler requires this file; builds without a licence file in the archive get a pointer to the GPL text.
  const ffLicense = path.join(resDir, 'LICENSE-ffmpeg.txt');
  if (!fs.existsSync(ffLicense)) fs.writeFileSync(ffLicense, 'FFmpeg is free software licensed under the GNU General Public License (GPL).\nLicence and source code: https://ffmpeg.org/legal.html\n');
  await fetchPdfium();
  for (const [lang, url] of Object.entries(TESS)) await download(url, path.join(resDir, 'tessdata', `${lang}.traineddata`));
  for (const f of FONTS) await download(`${NOTO}/${f}`, path.join(resDir, 'fonts', path.basename(f)));
  console.log('Done. Sidecars in', binDir, '· resources in', resDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

2. `scripts/check-binaries.mjs` checks the FFmpeg version (≥ 7.1) and encoders, PDFium, the OCR data and the fonts:

**File `scripts/check-binaries.mjs`**

```js
// Verifies that everything fetch-binaries.mjs provides is present and usable on THIS machine.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const TRIPLE = {
  'win32-x64': 'x86_64-pc-windows-msvc', 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu', 'linux-arm64': 'aarch64-unknown-linux-gnu'
}[`${process.platform}-${process.arch}`];
const res = path.join(root, 'src-tauri', 'resources');
const bin = (n) => path.join(root, 'src-tauri', 'binaries', process.platform === 'win32' ? `${n}-${TRIPLE}.exe` : `${n}-${TRIPLE}`);
const NEED = ['libx264', 'aac', 'libvpx-vp9', 'libopus', 'mpeg4', 'libmp3lame', 'wmv2', 'wmav2', 'gif', 'flac', 'libvorbis', 'pcm_s16le', 'pcm_s16be', 'bmp'];
let ok = true;
const fail = (msg) => { ok = false; console.log(`✗ ${msg}`); };

for (const n of ['ffmpeg', 'ffprobe']) {
  try {
    const v = execFileSync(bin(n), ['-version']).toString().split('\n')[0];
    console.log(`✓ ${v}`);
    const m = /version n?(\d+)\.(\d+)/.exec(v);
    // HEIC photos from phones are tiled ("grid") images: FFmpeg decodes them whole only from 7.1 on.
    if (n === 'ffmpeg' && m && (Number(m[1]) < 7 || (Number(m[1]) === 7 && Number(m[2]) < 1))) fail('FFmpeg 7.1 or newer is required (HEIC input)');
  } catch (e) { fail(`${n} does not run: ${e.message}`); }
}
try {
  const enc = execFileSync(bin('ffmpeg'), ['-hide_banner', '-encoders']).toString();
  for (const e of NEED) { if (new RegExp(`\\s${e.replace(/-/g, '\\-')}\\s`).test(enc)) console.log(`✓ encoder ${e}`); else fail(`encoder ${e}`); }
} catch { fail('ffmpeg -encoders'); }
const lib = { win32: 'pdfium.dll', darwin: 'libpdfium.dylib', linux: 'libpdfium.so' }[process.platform];
if (fs.existsSync(path.join(res, 'pdfium', lib))) console.log(`✓ pdfium ${lib}`); else fail(`pdfium ${lib}`);
for (const lang of ['eng', 'vie']) {
  const f = path.join(res, 'tessdata', `${lang}.traineddata`);
  if (fs.existsSync(f) && fs.statSync(f).size > 100_000) console.log(`✓ tessdata ${lang}`); else fail(`tessdata ${lang}`);
}
for (const font of ['NotoSans-Regular.ttf', 'NotoSerif-Regular.ttf', 'NotoSansMono-Regular.ttf']) {
  if (fs.existsSync(path.join(res, 'fonts', font))) console.log(`✓ font ${font}`); else fail(`font ${font}`);
}
console.log(ok ? '\nAll required binaries OK' : '\nSome required binaries are missing — run npm run fetch-binaries');
process.exit(ok ? 0 : 1);
```

3. `scripts/build-mac-helper.mjs` (macOS only, runs automatically after `npm run fetch-binaries`) compiles
   `native/mac/DragHelper.swift` into the sidecar `src-tauri/binaries/alohamora-drag-helper-<triple>` for both Mac CPUs.
   On Windows and Linux it prints "skipped".

**File `scripts/build-mac-helper.mjs`**

```js
// macOS only: builds the global-drag helper (native/mac/DragHelper.swift) as a Tauri sidecar for both Mac targets.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (process.platform !== 'darwin') { console.log('build-mac-helper: not macOS, skipped'); process.exit(0); }
const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'native', 'mac', 'DragHelper.swift');
const outDir = path.join(root, 'src-tauri', 'binaries');
fs.mkdirSync(outDir, { recursive: true });
for (const [swiftTarget, triple] of [['arm64-apple-macos12', 'aarch64-apple-darwin'], ['x86_64-apple-macos12', 'x86_64-apple-darwin']]) {
  const out = path.join(outDir, `alohamora-drag-helper-${triple}`);
  execFileSync('swiftc', ['-O', '-swift-version', '5', '-target', swiftTarget, '-o', out, src], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--sign', '-', out]);   // ad-hoc; tauri build re-signs with your Developer ID
  console.log('built', out);
}
```

**Verify**
```bash
node --check scripts/fetch-binaries.mjs
node --check scripts/check-binaries.mjs
node --check scripts/build-mac-helper.mjs
```

**Done when:** the three syntax checks pass.

## Task 2.2 — Fetch the binaries

**Goal.** The binaries and resources are on disk and usable.

**Run**
```bash
npm run fetch-binaries
```

This downloads about 150 MB the first time (into `.cache/downloads/`), then copies the files into `src-tauri/`. Running it
again skips what is already there.

**Verify**
```bash
npm run check-binaries
```

**Done when:** the last line is `All required binaries OK`. Every line above it starts with `✓`.

# Phase 3 — Rust workspace and the `core` crate

`alohamora-core` holds the pure logic: no files, no processes, no Tauri. Most modules are line-by-line ports of
`src/shared/*.ts` and of the pure parts of the old `src/main` (their header comments name the TypeScript file). Every
module has unit tests.

**How the skeleton works.** Task 3.1 creates the whole workspace at once: all `Cargo.toml` files in their final form, the
final `lib.rs` of `core` and `engine`, and an **empty file for every module**. An empty module compiles, so after each task
you can build and test the modules written so far. The following tasks fill the empty files one group at a time, in an
order where a module only uses modules that are already filled.

All `cargo` commands use `--locked`: Cargo must use `src-tauri/Cargo.lock` exactly as copied from
`rewrite/Cargo.lock`. If Cargo says the lock file "needs to be updated", one of your `Cargo.toml` files differs from the
plan; fix the `Cargo.toml`, never the lock file.

## Task 3.1 — Workspace skeleton

**Goal.** The Cargo workspace exists, with all three crates, and the (still empty) `core` crate compiles.

1. Pin the Rust version for the whole repository:

**File `rust-toolchain.toml`**

```toml
# The Rust version this code was compiled and tested with (see rewrite/PLAN.md §2). rustup installs it automatically.
[toolchain]
channel = "1.97.0"
components = ["clippy", "rustfmt"]
```

2. The workspace and the Tauri app crate. The app's library is called `alohamora_app` because a library and a binary
   with the same name collide on Windows. `[profile.dev.package."*"]` optimises dependencies in debug builds; without it
   the image codecs are too slow for the self-test.

**File `src-tauri/Cargo.toml`**

```toml
[workspace]
members = ["crates/core", "crates/engine"]
resolver = "2"

[workspace.package]
version = "0.2.0"
edition = "2021"
rust-version = "1.88"
license = "UNLICENSED"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
regex = "1"
thiserror = "2"
uuid = { version = "1", features = ["v4"] }
log = "0.4"

[package]
name = "alohamora"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
default-run = "alohamora"

[lib]
# Different from the binary name (a lib and bin with the same name collide on Windows).
name = "alohamora_app"

[build-dependencies]
tauri-build = { version = "2.5", features = [] }

[dependencies]
alohamora-core = { path = "crates/core" }
alohamora-engine = { path = "crates/engine" }
tauri = { version = "2.12", features = ["macos-private-api", "tray-icon", "image-png"] }
tauri-plugin-single-instance = "2.5"
tauri-plugin-dialog = "2.8"
tauri-plugin-opener = "2.7"
tauri-plugin-notification = "2.5"
tauri-plugin-autostart = "2.7"
tauri-plugin-log = "2.10"
serde.workspace = true
serde_json.workspace = true
log.workspace = true
percent-encoding = "2"

[target.'cfg(target_os = "linux")'.dependencies]
x11rb = "0.13"

[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.60", features = ["Win32_Foundation", "Win32_UI_Input_KeyboardAndMouse", "Win32_UI_WindowsAndMessaging"] }
windows = { version = "0.61", features = ["Win32_System_Com", "Win32_UI_Shell"] }
windows-registry = "0.5"
windows-result = "0.3"

[target.'cfg(target_os = "macos")'.dependencies]
objc2-app-kit = { version = "0.3", features = ["NSEvent", "NSWindow", "NSResponder"] }

[profile.release]
lto = "fat"
codegen-units = 1
strip = true
opt-level = 3

# Dependencies are optimised even in debug builds: image codecs (rav1e, mozjpeg) and pdfium/tesseract glue
# are 10–50× slower unoptimised, which makes the self-test unusable. Our own crates stay fast to compile.
[profile.dev.package."*"]
opt-level = 2
debug = false
```

**File `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build();
}
```

**File `src-tauri/src/main.rs`**

```rust
// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    alohamora_app::run();
}
```

3. A placeholder for the app library (Task 8.8 replaces it):

**File `src-tauri/src/lib.rs`**

```rust
//! Placeholder. Task 8.8 replaces this file with the real Tauri app.
pub fn run() {}
```

4. The `core` crate:

**File `src-tauri/crates/core/Cargo.toml`**

```toml
[package]
name = "alohamora-core"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
serde.workspace = true
serde_json.workspace = true
regex.workspace = true
thiserror.workspace = true
encoding_rs = "0.8"
```

**File `src-tauri/crates/core/src/lib.rs`**

```rust
//! Pure logic shared by the engine and the app: no file I/O, no processes, no Tauri.
//! Every module here is a port of a TypeScript file named in its header comment.

pub mod collage_layout;
pub mod edit_pipeline;
pub mod error;
pub mod ffmpeg_args;
pub mod ffmpeg_parse;
pub mod geometry;
pub mod image_meta;
pub mod js;
pub mod naming;
pub mod options;
pub mod page_ranges;
pub mod pdf_reflow;
pub mod pdf_split;
pub mod registry;
pub mod split;
pub mod subtitles;
pub mod text;
pub mod time;
pub mod types;
pub mod util;
```

5. The `engine` crate. `build.rs` records the target triple so the engine can find `ffmpeg-<triple>` in
   `src-tauri/binaries` during development.

**File `src-tauri/crates/engine/Cargo.toml`**

```toml
[package]
name = "alohamora-engine"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
alohamora-core = { path = "../core" }
serde.workspace = true
serde_json.workspace = true
log.workspace = true
uuid.workspace = true
regex.workspace = true
base64 = "0.22"
sha1 = "0.10"

image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp", "tiff", "gif", "bmp"] }
mozjpeg = "0.10"
webp = "0.3"
ravif = "0.13"
resvg = "0.48"
kamadak-exif = "0.6"
img-parts = "0.4"
color_quant = "1.1"
png = "0.18"
tiff = { version = "0.11", default-features = false, features = ["lzw"] }
vtracer = "0.6"
pdfium-render = { version = "0.9", default-features = false, features = ["image_latest", "thread_safe", "pdfium_latest"] }
lopdf = "0.45"
zip = { version = "8", default-features = false, features = ["deflate"] }
typst-as-lib = { version = "0.16", features = ["typst-kit-fonts"] }
typst = "0.15"
typst-pdf = "0.15"
tesseract-rs = { version = "0.4", features = ["build-tesseract"] }
```

**File `src-tauri/crates/engine/build.rs`**

```rust
// Records the target triple so `paths::sidecar` can find `ffmpeg-<triple>` in src-tauri/binaries (dev runs).
fn main() {
    println!("cargo:rustc-env=ALOHAMORA_TARGET_TRIPLE={}", std::env::var("TARGET").expect("cargo sets TARGET"));
}
```

**File `src-tauri/crates/engine/src/lib.rs`**

```rust
//! Everything that touches files, processes and libraries. No Tauri here: the app crate calls into this.
//! The engine is synchronous on purpose: long work runs on plain threads, cancellation uses `CancelToken`.

pub mod cancel;
pub mod capabilities;
pub mod convert;
pub mod docx;
pub mod epub;
pub mod ffmpeg;
pub mod fsutil;
pub mod hw_video;
pub mod image;
pub mod image_preview;
pub mod inspect;
pub mod jobs;
pub mod metadata;
pub mod ocr;
pub mod par;
pub mod pdf;
pub mod previews;
pub mod paths;
pub mod process;
pub mod selftest;
pub mod settings;
pub mod text_pdf;
pub mod thumbnails;
pub mod tools;

pub use alohamora_core as core;
pub use alohamora_core::error::{AppError, Result};
```

6. Create every module as an empty file, copy the lock file and install Rust 1.97.0:

**Run**
```bash
CORE=src-tauri/crates/core/src
ENGINE=src-tauri/crates/engine/src
mkdir -p $CORE/ffmpeg_args $ENGINE/convert $ENGINE/image $ENGINE/jobs $ENGINE/pdf $ENGINE/selftest $ENGINE/tools
for m in collage_layout edit_pipeline error ffmpeg_parse geometry image_meta js naming options page_ranges pdf_reflow \
         pdf_split registry split subtitles text time types util ffmpeg_args/mod; do
  [ -e $CORE/$m.rs ] || : > $CORE/$m.rs
done
for m in cancel capabilities docx epub ffmpeg fsutil hw_video image_preview inspect metadata ocr par previews paths \
         process settings text_pdf thumbnails convert/mod image/mod jobs/mod pdf/mod selftest/mod tools/mod; do
  [ -e $ENGINE/$m.rs ] || : > $ENGINE/$m.rs
done
cp rewrite/Cargo.lock src-tauri/Cargo.lock
rustup toolchain install 1.97.0 --profile minimal -c clippy -c rustfmt
```

**Verify**
```bash
rustc --version
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `rustc --version` prints `rustc 1.97.0` (inside the repository) and `cargo check` finishes without errors.
The first run downloads the crates; that needs the internet (build time only).

## Task 3.2 — core: `js` (JavaScript-compatible numbers)

**Goal.** Numbers are printed exactly like JavaScript does, so FFmpeg arguments and notes match the Electron build.

- `js_num(1.5)` → `"1.5"`, `js_num(2.0)` → `"2"` (like `String(n)`);
- `js_to_fixed(n, digits)` is `Number.prototype.toFixed`;
- `js_round(x)` is `Math.round` (halves round up, also for negative numbers).

**File `src-tauri/crates/core/src/js.rs`**

```rust
//! JavaScript-compatible number formatting.
//! FFmpeg arguments, file names and notes must be byte-for-byte the same as the Electron build,
//! so every place where TypeScript turned a number into a string uses one of these helpers.

/// Like JavaScript `String(n)` / `${n}` for the numbers this app uses (no exponent forms).
/// `2.0` → `"2"`, `0.5` → `"0.5"`, `-0.0` → `"0"`.
pub fn js_num(n: f64) -> String {
    if n.is_nan() {
        return "NaN".to_string();
    }
    if n.is_infinite() {
        return if n > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }
    if n == 0.0 {
        return "0".to_string();
    }
    format!("{}", n)
}

/// Like JavaScript `n.toFixed(digits)`: rounds the exact binary value, ties go away from zero
/// (`0.125.toFixed(2)` is `"0.13"`, while Rust's `{:.2}` would give `"0.12"`).
pub fn js_to_fixed(n: f64, digits: usize) -> String {
    if !n.is_finite() {
        return js_num(n);
    }
    let negative = n < 0.0;
    // 30 extra digits of the exact decimal expansion are enough to see whether we are above, below or on a tie.
    let long = format!("{:.*}", digits + 30, n.abs());
    let (int_part, frac_part) = match long.split_once('.') {
        Some((i, f)) => (i.to_string(), f.to_string()),
        None => (long.clone(), String::new()),
    };
    let keep: Vec<u8> = int_part.bytes().chain(frac_part.bytes().take(digits)).collect();
    let next = frac_part.as_bytes().get(digits).copied().unwrap_or(b'0');
    let mut digits_vec: Vec<u8> = keep.iter().map(|b| b - b'0').collect();
    if next >= b'5' {
        // round half up on the magnitude
        let mut i = digits_vec.len();
        loop {
            if i == 0 {
                digits_vec.insert(0, 1);
                break;
            }
            i -= 1;
            if digits_vec[i] == 9 {
                digits_vec[i] = 0;
            } else {
                digits_vec[i] += 1;
                break;
            }
        }
    }
    let int_len = digits_vec.len() - digits;
    let mut out = String::new();
    for d in &digits_vec[..int_len] {
        out.push((b'0' + d) as char);
    }
    if digits > 0 {
        out.push('.');
        for d in &digits_vec[int_len..] {
            out.push((b'0' + d) as char);
        }
    }
    let is_zero = digits_vec.iter().all(|d| *d == 0);
    if negative && !is_zero {
        format!("-{}", out)
    } else {
        out
    }
}

/// Like JavaScript `Math.round(x)`: halves round towards +infinity (`-2.5` → `-2`, `2.5` → `3`).
pub fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 { f + 1.0 } else { f }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn num() {
        assert_eq!(js_num(2.0), "2");
        assert_eq!(js_num(0.5), "0.5");
        assert_eq!(js_num(-0.0), "0");
        assert_eq!(js_num(1000.0), "1000");
        assert_eq!(js_num(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(js_num(-1.5), "-1.5");
    }

    #[test]
    fn to_fixed() {
        assert_eq!(js_to_fixed(0.125, 2), "0.13");
        assert_eq!(js_to_fixed(1.005, 2), "1.00");
        assert_eq!(js_to_fixed(2.0, 3), "2.000");
        assert_eq!(js_to_fixed(1.0 / 3.0, 4), "0.3333");
        assert_eq!(js_to_fixed(9.9999, 2), "10.00");
        assert_eq!(js_to_fixed(-0.125, 2), "-0.13");
        assert_eq!(js_to_fixed(-0.001, 2), "0.00");
        assert_eq!(js_to_fixed(5.41, 2), "5.41");
        assert_eq!(js_to_fixed(1.5, 0), "2");
    }

    #[test]
    fn round() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(-2.6), -3.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert_eq!(js_round(90.4), 90.0);
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** the unit-test summary reads `test result: ok. 3 passed; 0 failed`.

## Task 3.3 — core: `error`

**Goal.** One error type for the whole back end.

`AppError` has five variants (§1). `to_user_message` turns any error into the sentence the user sees; I/O errors become
"can't access" or "disk full". Copy the English sentences exactly.

**File `src-tauri/crates/core/src/error.rs`**

```rust
//! Port of src/main/errors.ts. One error type for the whole backend.

use std::fmt;

/// Every fallible backend function returns `Result<T>`.
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    /// Expected problem, shown to the user as-is (TypeScript `UserError`).
    User { message: String, details: Option<String> },
    /// An engine failed (FFmpeg, pdfium, Tesseract…). `message` is user-friendly, `details` is technical (`ToolError`).
    Tool { message: String, details: String },
    /// The job was cancelled (`CanceledError`).
    Canceled,
    /// File-system and other OS errors.
    Io(std::io::Error),
    /// Anything else (library errors). Shown as the generic message; the text goes into Details.
    Other(String),
}

impl AppError {
    pub fn user(message: impl Into<String>) -> Self {
        AppError::User { message: message.into(), details: None }
    }
    pub fn user_with(message: impl Into<String>, details: impl Into<String>) -> Self {
        AppError::User { message: message.into(), details: Some(details.into()) }
    }
    pub fn tool(message: impl Into<String>, details: impl Into<String>) -> Self {
        AppError::Tool { message: message.into(), details: details.into() }
    }
    pub fn other(text: impl fmt::Display) -> Self {
        AppError::Other(text.to_string())
    }
    pub fn is_canceled(&self) -> bool {
        matches!(self, AppError::Canceled)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::User { message, .. } => write!(f, "{message}"),
            AppError::Tool { message, .. } => write!(f, "{message}"),
            AppError::Canceled => write!(f, "Canceled"),
            AppError::Io(e) => write!(f, "{e}"),
            AppError::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Other(format!("JSON: {e}"))
    }
}

/// What the UI shows: a title and optional technical details.
#[derive(Debug, Clone, PartialEq)]
pub struct UserMessage {
    pub message: String,
    pub details: Option<String>,
}

pub const MSG_CANT_ACCESS: &str = "Alohamora can't read or write this file. Close it in other apps and try again.";
pub const MSG_DISK_FULL: &str = "The disk is full.";
pub const MSG_GENERIC: &str = "Something went wrong while processing this file.";

/// Friendly text for operating-system error codes (locked, read-only or full disk).
fn friendly_os_error(e: &std::io::Error) -> Option<&'static str> {
    let code = e.raw_os_error()?;
    #[cfg(windows)]
    {
        // ACCESS_DENIED, WRITE_PROTECT, SHARING_VIOLATION, LOCK_VIOLATION / HANDLE_DISK_FULL, DISK_FULL
        match code {
            5 | 19 | 32 | 33 => Some(MSG_CANT_ACCESS),
            39 | 112 => Some(MSG_DISK_FULL),
            _ => None,
        }
    }
    #[cfg(not(windows))]
    {
        // EPERM, EACCES, EBUSY, EROFS / ENOSPC (same numbers on Linux and macOS)
        match code {
            1 | 13 | 16 | 30 => Some(MSG_CANT_ACCESS),
            28 => Some(MSG_DISK_FULL),
            _ => None,
        }
    }
}

/// Port of `toUserMessage`.
pub fn to_user_message(err: &AppError) -> UserMessage {
    match err {
        AppError::User { message, details } => UserMessage { message: message.clone(), details: details.clone() },
        AppError::Tool { message, details } => UserMessage { message: message.clone(), details: Some(details.clone()) },
        AppError::Canceled => UserMessage { message: "Canceled".to_string(), details: None },
        AppError::Io(e) => match friendly_os_error(e) {
            Some(m) => UserMessage { message: m.to_string(), details: Some(format!("{e:?}")) },
            None => UserMessage { message: MSG_GENERIC.to_string(), details: Some(format!("{e:?}")) },
        },
        AppError::Other(s) => UserMessage { message: MSG_GENERIC.to_string(), details: Some(s.clone()) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_and_tool_pass_through() {
        let m = to_user_message(&AppError::user("Nope"));
        assert_eq!(m.message, "Nope");
        let t = to_user_message(&AppError::tool("Tool broke", "stderr"));
        assert_eq!(t.message, "Tool broke");
        assert_eq!(t.details.as_deref(), Some("stderr"));
    }

    #[test]
    fn os_errors_are_friendly() {
        #[cfg(not(windows))]
        let (denied, full) = (13, 28);
        #[cfg(windows)]
        let (denied, full) = (5, 112);
        let m = to_user_message(&AppError::Io(std::io::Error::from_raw_os_error(denied)));
        assert_eq!(m.message, MSG_CANT_ACCESS);
        let f = to_user_message(&AppError::Io(std::io::Error::from_raw_os_error(full)));
        assert_eq!(f.message, MSG_DISK_FULL);
    }

    #[test]
    fn anything_else_is_generic() {
        let m = to_user_message(&AppError::other("boom"));
        assert_eq!(m.message, MSG_GENERIC);
        assert_eq!(m.details.as_deref(), Some("boom"));
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 6 passed; 0 failed`.

## Task 3.4 — core: `util`, `naming`, `time`, `page_ranges`

**Goal.** Small helpers used everywhere.

- `util`: `path_key` (the only correct way to compare paths: case-insensitive on Windows and macOS, case-sensitive on
  Linux), the current time in ms, the base name of a path.
- `naming`: output file names (`photo.jpg` → `photo.png`, `photo (2).png` on collisions), folder names for groups of
  outputs (`doc pages/`), and file-name sanitising.
- `time`: time codes (`1:02:03.5`), SRT/VTT times, durations, byte sizes, and UTC date helpers (no `chrono` needed).
- `page_ranges`: parses `1-3, 5` into page groups; the errors are the sentences shown to the user.

**File `src-tauri/crates/core/src/util.rs`**

```rust
//! Port of the pure parts of src/main/util.ts.

use std::path::{Path, PathBuf};

/// Key for comparing paths: Windows and default macOS volumes are case-insensitive, Linux is case-sensitive.
/// Never call `.to_lowercase()` on a path anywhere else; use this.
pub fn path_key(p: &Path) -> String {
    let abs: PathBuf = std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf());
    let s = abs.to_string_lossy().to_string();
    if cfg!(target_os = "linux") { s } else { s.to_lowercase() }
}

/// Milliseconds since 1970 (JavaScript `Date.now()`).
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// "geese.mp4" from "/a/b/geese.mp4" (works with both separators).
pub fn base_name(p: &str) -> String {
    p.rsplit(['/', '\\']).next().unwrap_or(p).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys() {
        let a = path_key(Path::new("/tmp/Abc.txt"));
        if cfg!(target_os = "linux") {
            assert!(a.ends_with("Abc.txt"));
        } else {
            assert!(a.ends_with("abc.txt"));
        }
        assert_eq!(base_name("C:\\x\\y.mp4"), "y.mp4");
        assert_eq!(base_name("/x/y.mp4"), "y.mp4");
    }
}
```

**File `src-tauri/crates/core/src/naming.rs`**

```rust
//! Port of src/shared/naming.ts (output names).

/// "a.b.mp4" → ("a.b", "mp4"); ".bashrc" → (".bashrc", "")
pub fn split_name(file_name: &str) -> (String, String) {
    match file_name.rfind('.') {
        Some(dot) if dot > 0 => (file_name[..dot].to_string(), file_name[dot + 1..].to_string()),
        _ => (file_name.to_string(), String::new()),
    }
}

/// ("clip", "mp4", "trimmed") → "clip-trimmed.mp4"; an empty suffix adds nothing.
pub fn output_file_name(base: &str, ext: &str, suffix: &str) -> String {
    if suffix.is_empty() { format!("{base}.{ext}") } else { format!("{base}-{suffix}.{ext}") }
}

pub fn group_folder_name(base: &str, group: &str) -> String {
    format!("{base}-{group}")
}

/// ("report", 3, 120, "jpg") → "report-003.jpg" (padding grows with total).
pub fn group_file_name(base: &str, index: usize, total: usize, ext: &str) -> String {
    let pad = std::cmp::max(3, total.to_string().len());
    format!("{base}-{index:0pad$}.{ext}")
}

/// ("a.jpg", 2) → "a (2).jpg"; ("folder", 1) → "folder (1)"
pub fn with_counter(name: &str, n: usize) -> String {
    let (base, ext) = split_name(name);
    if ext.is_empty() { format!("{name} ({n})") } else { format!("{base} ({n}).{ext}") }
}

/// First free path: name, name (1), name (2)… `exists` and `join` are passed in so this stays pure.
pub fn resolve_collision(
    dir: &str,
    name: &str,
    exists: &dyn Fn(&str) -> bool,
    join: &dyn Fn(&str, &str) -> String,
) -> Result<String, String> {
    let mut candidate = join(dir, name);
    let mut n = 1;
    while exists(&candidate) {
        if n > 9999 {
            return Err("Too many files with the same name".to_string());
        }
        candidate = join(dir, &with_counter(name, n));
        n += 1;
    }
    Ok(candidate)
}

/// Remove characters Windows forbids; trim trailing dots/spaces; limit the length to 180 characters.
pub fn sanitize_file_name(name: &str) -> String {
    let replaced: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || (c as u32) < 0x20 { '_' } else { c })
        .collect();
    let mut s = replaced.trim_end_matches(['.', ' ']).trim().to_string();
    if s.is_empty() {
        s = "output".to_string();
    }
    if s.chars().count() > 180 {
        let (base, ext) = split_name(&s);
        let short: String = base.chars().take(170).collect();
        s = if ext.is_empty() { short } else { format!("{short}.{ext}") };
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn names() {
        assert_eq!(split_name("a.b.mp4"), ("a.b".into(), "mp4".into()));
        assert_eq!(split_name(".bashrc"), (".bashrc".into(), "".into()));
        assert_eq!(split_name("README"), ("README".into(), "".into()));
        assert_eq!(output_file_name("clip", "mp4", "trimmed"), "clip-trimmed.mp4");
        assert_eq!(output_file_name("photo", "jpg", ""), "photo.jpg");
        assert_eq!(group_folder_name("report", "pages"), "report-pages");
        assert_eq!(group_file_name("report", 3, 120, "jpg"), "report-003.jpg");
        assert_eq!(group_file_name("report", 7, 12345, "jpg"), "report-00007.jpg");
        assert_eq!(with_counter("a.jpg", 2), "a (2).jpg");
        assert_eq!(with_counter("folder", 1), "folder (1)");
    }

    #[test]
    fn collisions() {
        let join = |a: &str, b: &str| format!("{a}\\{b}");
        let taken: HashSet<String> = ["C:\\out\\a.jpg".to_string(), "C:\\out\\a (1).jpg".to_string()].into();
        let exists = |p: &str| taken.contains(p);
        assert_eq!(resolve_collision("C:\\out", "a.jpg", &exists, &join).unwrap(), "C:\\out\\a (2).jpg");
        assert_eq!(resolve_collision("C:\\out", "b.jpg", &exists, &join).unwrap(), "C:\\out\\b.jpg");
        assert!(resolve_collision("/o", "a.jpg", &|_| true, &join).is_err());
    }

    #[test]
    fn sanitize() {
        assert_eq!(sanitize_file_name("a<b>:c\"d/e\\f|g?h*i"), "a_b__c_d_e_f_g_h_i");
        assert_eq!(sanitize_file_name("name. "), "name");
        assert_eq!(sanitize_file_name("   "), "output");
        let long = sanitize_file_name(&format!("{}.png", "x".repeat(300)));
        assert!(long.chars().count() <= 180);
        assert!(long.ends_with(".png"));
    }
}
```

**File `src-tauri/crates/core/src/time.rs`**

```rust
//! Port of src/shared/time.ts.

use crate::js::js_to_fixed;

pub fn clamp(v: f64, min: f64, max: f64) -> f64 {
    v.max(min).min(max)
}

/// "1:02:03.5" | "02:03" | "75" | "00:00:01,500" → seconds (None if invalid).
pub fn parse_timecode(input: &str) -> Option<f64> {
    let s = input.trim().replacen(',', ".", 1);
    let re = regex::Regex::new(r"^\d+(:\d{1,2}){0,2}(\.\d+)?$").expect("valid regex");
    if !re.is_match(&s) {
        return None;
    }
    let mut sec = 0.0;
    for p in s.split(':') {
        sec = sec * 60.0 + p.parse::<f64>().ok()?;
    }
    if sec.is_finite() { Some(sec) } else { None }
}

fn pad(n: f64, w: usize) -> String {
    format!("{:0w$}", n.floor() as u64)
}

/// 5.41 → "0:05.41"; 3725.5 → "1:02:05.50".
pub fn format_timecode(sec: f64) -> String {
    let s = sec.max(0.0);
    let h = (s / 3600.0).floor();
    let m = ((s % 3600.0) / 60.0).floor();
    let rest = s % 60.0;
    let cs = ((rest - rest.floor()) * 100.0).floor();
    let core = format!("{}.{}", pad(rest, 2), pad(cs, 2));
    if h > 0.0 { format!("{}:{}:{}", h, pad(m, 2), core) } else { format!("{}:{}", m, core) }
}

fn hms(sec: f64, sep: char) -> String {
    let ms = (sec.max(0.0) * 1000.0).round() as u64;
    let h = ms / 3_600_000;
    let m = (ms % 3_600_000) / 60_000;
    let s = (ms % 60_000) / 1000;
    format!("{:02}:{:02}:{:02}{}{:03}", h, m, s, sep, ms % 1000)
}

pub fn format_srt_time(sec: f64) -> String {
    hms(sec, ',')
}

pub fn format_vtt_time(sec: f64) -> String {
    hms(sec, '.')
}

/// 65 → "1:05"; 3725 → "1:02:05"
pub fn format_duration(sec: f64) -> String {
    let s = crate::js::js_round(sec.max(0.0)) as u64;
    let h = s / 3600;
    let m = (s % 3600) / 60;
    if h > 0 { format!("{}:{:02}:{:02}", h, m, s % 60) } else { format!("{}:{:02}", m, s % 60) }
}

/// Explorer-style sizes (1024 based): "12.3 MB".
pub fn format_bytes(n: u64) -> String {
    if n < 1024 {
        return format!("{n} B");
    }
    let units = ["KB", "MB", "GB", "TB"];
    let mut v = n as f64 / 1024.0;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    let num = if v >= 100.0 { js_to_fixed(v, 0) } else { js_to_fixed(v, 1) };
    format!("{} {}", num, units[i])
}

/// UTC calendar parts (year, month, day, hour, minute, second) of a Unix time in seconds.
/// Days-to-civil algorithm by Howard Hinnant; exact for every date after 1970.
pub fn utc_from_unix(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d, (rem / 3600) as u32, (rem % 3600 / 60) as u32, (rem % 60) as u32)
}

/// "2024-05-01T14:30:00Z" for a Unix time in seconds.
pub fn iso_utc(secs: i64) -> String {
    let (y, mo, d, h, mi, s) = utc_from_unix(secs);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// Current Unix time in seconds.
pub fn unix_now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timecodes() {
        assert_eq!(clamp(5.0, 0.0, 3.0), 3.0);
        assert_eq!(parse_timecode("1:02:03.5"), Some(3723.5));
        assert_eq!(parse_timecode("00:00:01,500"), Some(1.5));
        assert_eq!(parse_timecode("02:03"), Some(123.0));
        assert_eq!(parse_timecode("75"), Some(75.0));
        assert_eq!(parse_timecode("abc"), None);
        assert_eq!(parse_timecode(""), None);
        assert_eq!(format_timecode(5.41), "0:05.41");
        assert_eq!(format_timecode(3725.5), "1:02:05.50");
        assert_eq!(format_duration(65.0), "1:05");
        assert_eq!(format_duration(3725.0), "1:02:05");
        assert_eq!(format_srt_time(3723.5), "01:02:03,500");
        assert_eq!(format_vtt_time(3723.5), "01:02:03.500");
        assert_eq!(format_srt_time(-4.0), "00:00:00,000");
    }

    #[test]
    fn bytes() {
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(1536), "1.5 KB");
        assert_eq!(format_bytes(5 * 1024 * 1024), "5.0 MB");
        assert_eq!(format_bytes(150 * 1024 * 1024), "150 MB");
    }

    #[test]
    fn utc_parts() {
        assert_eq!(utc_from_unix(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(iso_utc(1_714_573_800), "2024-05-01T14:30:00Z");
        assert_eq!(utc_from_unix(951_782_400), (2000, 2, 29, 0, 0, 0));
    }
}
```

**File `src-tauri/crates/core/src/page_ranges.rs`**

```rust
//! Port of src/shared/pageRanges.ts. Errors are the user-facing sentences (TypeScript RangeError messages).

/// Parse "1-3, 5, 8-" (1-based, inclusive) into groups of 0-based page indexes. "" → one group with all pages.
pub fn parse_page_ranges(input: &str, total: usize) -> Result<Vec<Vec<usize>>, String> {
    let text = input.trim();
    if text.is_empty() {
        return Ok(vec![(0..total).collect()]);
    }
    let range_re = regex::Regex::new(r"^(\d*)\s*-\s*(\d*)$").expect("valid regex");
    let num_re = regex::Regex::new(r"^\d+$").expect("valid regex");
    let mut groups = Vec::new();
    for raw in text.split(',') {
        let part = raw.trim();
        if part.is_empty() {
            continue;
        }
        let (from, to): (usize, usize) = if let Some(c) = range_re.captures(part) {
            let a = c.get(1).map(|m| m.as_str()).unwrap_or("");
            let b = c.get(2).map(|m| m.as_str()).unwrap_or("");
            let from = if a.is_empty() { 1 } else { a.parse().unwrap_or(usize::MAX) };
            let to = if b.is_empty() { total } else { b.parse().unwrap_or(usize::MAX) };
            (from, to)
        } else if num_re.is_match(part) {
            let n = part.parse().unwrap_or(usize::MAX);
            (n, n)
        } else {
            return Err(format!("\"{part}\" is not a page range. Use something like 1-3, 5, 8-"));
        };
        if from < 1 || to < 1 {
            return Err("Page numbers start at 1".to_string());
        }
        if from > total || to > total {
            return Err(format!("Page {} doesn't exist (this PDF has {} pages)", from.max(to), total));
        }
        if from > to {
            return Err(format!("\"{part}\" goes backwards"));
        }
        groups.push((from - 1..to).collect());
    }
    if groups.is_empty() {
        return Err("No pages selected".to_string());
    }
    Ok(groups)
}

/// Unique page indexes in first-seen order.
pub fn flatten_ranges(groups: &[Vec<usize>]) -> Vec<usize> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for g in groups {
        for p in g {
            if seen.insert(*p) {
                out.push(*p);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses() {
        assert_eq!(parse_page_ranges("", 3).unwrap(), vec![vec![0, 1, 2]]);
        assert_eq!(parse_page_ranges("   ", 2).unwrap(), vec![vec![0, 1]]);
        assert_eq!(parse_page_ranges("1-2, 3", 3).unwrap(), vec![vec![0, 1], vec![2]]);
        assert_eq!(parse_page_ranges("2-", 4).unwrap(), vec![vec![1, 2, 3]]);
        assert_eq!(parse_page_ranges("-2", 4).unwrap(), vec![vec![0, 1]]);
    }

    #[test]
    fn friendly_errors() {
        assert!(parse_page_ranges("5", 3).unwrap_err().contains("doesn't exist"));
        assert!(parse_page_ranges("x", 3).unwrap_err().contains("not a page range"));
        assert!(parse_page_ranges("3-1", 5).unwrap_err().contains("backwards"));
        assert!(parse_page_ranges("0", 5).unwrap_err().contains("start at 1"));
        assert!(parse_page_ranges(",", 5).unwrap_err().contains("No pages"));
        assert_eq!(flatten_ranges(&[vec![0, 1], vec![1, 2], vec![0]]), vec![0, 1, 2]);
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 15 passed; 0 failed`.

## Task 3.5 — core: `geometry`

**Goal.** Normalised rectangles (0–1, used by crop and redact) and their conversion to pixels.

**File `src-tauri/crates/core/src/geometry.rs`**

```rust
//! Port of the parts of src/shared/geometry.ts that the backend needs.
//! (dragRect and the aspect list stay in TypeScript: only the UI uses them.)

use serde::{Deserialize, Serialize};

use crate::js::js_round;

/// 0..1, relative to the DISPLAYED frame (after EXIF / video rotation).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct NormRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PixelRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

pub const MIN_NORM: f64 = 0.02;
pub const FULL_RECT: NormRect = NormRect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };

pub fn clamp_norm_rect(r: NormRect) -> NormRect {
    let w = r.w.clamp(MIN_NORM, 1.0);
    let h = r.h.clamp(MIN_NORM, 1.0);
    let x = r.x.clamp(0.0, 1.0 - w);
    let y = r.y.clamp(0.0, 1.0 - h);
    NormRect { x, y, w, h }
}

/// Normalized → integer pixels inside the frame. `even` rounds down to even numbers (required by H.264).
pub fn to_pixel_rect(r: NormRect, width: u32, height: u32, even: bool) -> PixelRect {
    let (wf, hf) = (width as f64, height as f64);
    let mut x = js_round(r.x * wf) as i64;
    let mut y = js_round(r.y * hf) as i64;
    let mut w = js_round(r.w * wf) as i64;
    let mut h = js_round(r.h * hf) as i64;
    w = w.min(width as i64 - x).max(2);
    h = h.min(height as i64 - y).max(2);
    if even {
        x -= x % 2;
        y -= y % 2;
        w -= w % 2;
        h -= h % 2;
    }
    PixelRect { x: x.max(0) as u32, y: y.max(0) as u32, w: w.max(0) as u32, h: h.max(0) as u32 }
}

pub fn is_full_rect(r: NormRect) -> bool {
    r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixel_rects() {
        let p = to_pixel_rect(NormRect { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 1001, 501, true);
        for v in [p.x, p.y, p.w, p.h] {
            assert_eq!(v % 2, 0);
        }
        assert!(p.x + p.w <= 1001 && p.y + p.h <= 501);
        let small = to_pixel_rect(NormRect { x: 0.999, y: 0.999, w: 0.0001, h: 0.0001 }, 100, 100, false);
        assert!(small.w >= 2 && small.h >= 2);
        let c = to_pixel_rect(NormRect { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 640, 360, true);
        assert_eq!((c.x, c.y, c.w, c.h), (160, 90, 320, 180));
    }

    #[test]
    fn clamp_and_full() {
        let r = clamp_norm_rect(NormRect { x: -1.0, y: 2.0, w: 5.0, h: 0.0 });
        assert_eq!(r.w, 1.0);
        assert!((r.h - 0.02).abs() < 1e-9);
        assert_eq!(r.x, 0.0);
        assert!(is_full_rect(FULL_RECT));
        assert!(!is_full_rect(NormRect { x: 0.1, y: 0.0, w: 0.9, h: 1.0 }));
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 17 passed; 0 failed`.

## Task 3.6 — core: `types`, `registry`, `options`

**Goal.** The data contract with the UI, the format/tool registry and every tool's options.

These three files use each other, so they come together.

- `types`: every struct the UI sends or receives (`FileInfo`, `JobRequest`, `JobUpdate`, `Settings`, `Capabilities`, …).
  `#[serde(rename_all = "camelCase")]` keeps the JSON names identical to the TypeScript types.
- `registry`: embeds `src/shared/registry/*.json` (generated in Task 1.3) with `include_str!` and answers questions like
  "which format has the extension `.jpeg`?", "which targets does a PDF have?", "which tool ids exist?". If you change a
  TypeScript registry later, run `npm run gen:registry` and rebuild.
- `options`: one struct per tool. `with_defaults(tool, json)` merges the options the UI sent over the defaults from
  `defaults.json`, exactly like `{ ...DEFAULTS, ...options }` in TypeScript.

**File `src-tauri/crates/core/src/types.rs`**

```rust
//! Port of src/shared/types.ts. These structs are the IPC contract with the UI:
//! field names are camelCase on the wire, exactly like the TypeScript types.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::options::ConvertOptions;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Image,
    Video,
    Audio,
    Pdf,
    Text,
    Subtitle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Fmt {
    Jpg, Png, Webp, Heic, Tiff, Svg, Avif, Bmp,
    Mp3, M4a, Wav, Flac, Ogg, Opus, Aiff, Wma,
    Mp4, Mov, Mkv, Webm, Avi, Wmv, Gif,
    Pdf, Docx, Epub, Txt, Srt, Vtt,
}

impl Fmt {
    pub const ALL: [Fmt; 29] = [
        Fmt::Jpg, Fmt::Png, Fmt::Webp, Fmt::Heic, Fmt::Tiff, Fmt::Svg, Fmt::Avif, Fmt::Bmp,
        Fmt::Mp3, Fmt::M4a, Fmt::Wav, Fmt::Flac, Fmt::Ogg, Fmt::Opus, Fmt::Aiff, Fmt::Wma,
        Fmt::Mp4, Fmt::Mov, Fmt::Mkv, Fmt::Webm, Fmt::Avi, Fmt::Wmv, Fmt::Gif,
        Fmt::Pdf, Fmt::Docx, Fmt::Epub, Fmt::Txt, Fmt::Srt, Fmt::Vtt,
    ];

    /// The id used in JSON and in the registry, e.g. `Fmt::M4a` → `"m4a"`.
    pub fn as_str(self) -> &'static str {
        match self {
            Fmt::Jpg => "jpg", Fmt::Png => "png", Fmt::Webp => "webp", Fmt::Heic => "heic", Fmt::Tiff => "tiff",
            Fmt::Svg => "svg", Fmt::Avif => "avif", Fmt::Bmp => "bmp", Fmt::Mp3 => "mp3", Fmt::M4a => "m4a",
            Fmt::Wav => "wav", Fmt::Flac => "flac", Fmt::Ogg => "ogg", Fmt::Opus => "opus", Fmt::Aiff => "aiff",
            Fmt::Wma => "wma", Fmt::Mp4 => "mp4", Fmt::Mov => "mov", Fmt::Mkv => "mkv", Fmt::Webm => "webm",
            Fmt::Avi => "avi", Fmt::Wmv => "wmv", Fmt::Gif => "gif", Fmt::Pdf => "pdf", Fmt::Docx => "docx",
            Fmt::Epub => "epub", Fmt::Txt => "txt", Fmt::Srt => "srt", Fmt::Vtt => "vtt",
        }
    }

    pub fn parse(s: &str) -> Option<Fmt> {
        Fmt::ALL.iter().copied().find(|f| f.as_str() == s)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WheelMode {
    Convert,
    Tools,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolId {
    #[serde(rename = "video.compress")] VideoCompress,
    #[serde(rename = "video.metadata")] VideoMetadata,
    #[serde(rename = "video.mute")] VideoMute,
    #[serde(rename = "video.trim")] VideoTrim,
    #[serde(rename = "video.crop")] VideoCrop,
    #[serde(rename = "video.speed")] VideoSpeed,
    #[serde(rename = "video.snapshot")] VideoSnapshot,
    #[serde(rename = "video.split")] VideoSplit,
    #[serde(rename = "video.redact")] VideoRedact,
    #[serde(rename = "video.join")] VideoJoin,
    #[serde(rename = "audio.compress")] AudioCompress,
    #[serde(rename = "audio.normalize")] AudioNormalize,
    #[serde(rename = "audio.trim")] AudioTrim,
    #[serde(rename = "audio.channels")] AudioChannels,
    #[serde(rename = "audio.visualize")] AudioVisualize,
    #[serde(rename = "audio.bleep")] AudioBleep,
    #[serde(rename = "audio.metadata")] AudioMetadata,
    #[serde(rename = "audio.join")] AudioJoin,
    #[serde(rename = "image.compress")] ImageCompress,
    #[serde(rename = "image.resize")] ImageResize,
    #[serde(rename = "image.crop")] ImageCrop,
    #[serde(rename = "image.edit")] ImageEdit,
    #[serde(rename = "image.background")] ImageBackground,
    #[serde(rename = "image.redact")] ImageRedact,
    #[serde(rename = "image.metadata")] ImageMetadata,
    #[serde(rename = "image.collage")] ImageCollage,
    #[serde(rename = "image.pdf")] ImagePdf,
    #[serde(rename = "pdf.compress")] PdfCompress,
    #[serde(rename = "pdf.merge")] PdfMerge,
    #[serde(rename = "pdf.split")] PdfSplit,
    #[serde(rename = "pdf.organize")] PdfOrganize,
    #[serde(rename = "pdf.images")] PdfImages,
    #[serde(rename = "pdf.ocr")] PdfOcr,
    #[serde(rename = "pdf.word")] PdfWord,
    #[serde(rename = "pdf.metadata")] PdfMetadata,
    #[serde(rename = "subtitle.shift")] SubtitleShift,
}

impl ToolId {
    /// The id used in JSON and in the registry, e.g. `"video.compress"`.
    pub fn as_str(self) -> String {
        match serde_json::to_value(self) {
            Ok(Value::String(s)) => s,
            _ => unreachable!("ToolId always serializes to a string"),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub base: String,
    pub ext: String,
    pub fmt: Option<Fmt>,
    pub category: Option<Category>,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deep: Option<bool>,
    /// DISPLAY width (after rotation / EXIF orientation).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pages: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_video: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_audio: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_cover: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_codec: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_codec: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channels: Option<u32>,
    /// data: URL, longest side <= 256 px.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// "win32" | "darwin" | "linux" (the same strings as Node's process.platform).
    pub platform: String,
    /// "x64" | "arm64".
    pub arch: String,
    pub app_version: String,
    pub ffmpeg: bool,
    pub ffmpeg_version: String,
    pub encoders: Vec<String>,
    /// true = HEIC OUTPUT is possible (via heic_tool).
    pub heif_enc: bool,
    /// "sips" | "heif-enc" | null.
    pub heic_tool: Option<String>,
    /// A verified hardware H.264 encoder, e.g. "h264_videotoolbox".
    pub hw_video: Option<String>,
    /// "mac-helper" | "hook" | "unavailable".
    pub global_drag: String,
    pub ocr_languages: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// "same-folder" | "custom-folder".
    pub output_mode: String,
    pub custom_output_dir: Option<String>,
    /// "system" | "light" | "dark".
    pub theme: String,
    pub high_contrast_accent: bool,
    pub image_quality: f64,
    pub video_crf: f64,
    pub audio_bitrate_kbps: f64,
    pub pdf_dpi: f64,
    pub ocr_languages: Vec<String>,
    pub max_concurrent_jobs: f64,
    pub hardware_video: bool,
    pub notify_when_done: bool,
    pub reveal_when_done: bool,
    pub global_drag_wheel: bool,
    pub send_to_menu: bool,
    pub context_menu: bool,
    pub launch_at_login: bool,
    pub close_to_tray: bool,
    pub show_in_dock: bool,
    pub sounds: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Done,
    Error,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum JobRequest {
    Convert {
        inputs: Vec<String>,
        target: Fmt,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        options: Option<ConvertOptions>,
    },
    Tool {
        inputs: Vec<String>,
        #[serde(rename = "toolId")]
        tool_id: ToolId,
        #[serde(default)]
        options: Value,
    },
}

impl JobRequest {
    pub fn inputs(&self) -> &[String] {
        match self {
            JobRequest::Convert { inputs, .. } => inputs,
            JobRequest::Tool { inputs, .. } => inputs,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobUpdate {
    pub id: String,
    /// "Convert to MP4" / "Compress".
    pub label: String,
    pub request: JobRequest,
    pub status: JobStatus,
    /// 0..1 overall.
    pub progress: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub outputs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_details: Option<String>,
    /// Milliseconds since 1970 (JavaScript Date.now()).
    pub created_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInit {
    pub files: Vec<FileInfo>,
    pub mode: WheelMode,
    pub caps: Capabilities,
    /// "window" | "argv" | "drag".
    pub source: String,
}

/// Global drag. `files` is filled once the dragged files are known.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DragState {
    pub active: bool,
    pub mode: WheelMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<FileInfo>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataField {
    pub key: String,
    pub label: String,
    pub value: String,
    pub editable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataInfo {
    /// "media" | "image" | "pdf".
    pub kind: String,
    pub fields: Vec<MetadataField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_gps: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_cover: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_data_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreviewRequest {
    /// "none" | "edit" | "background" | "compress" | "collage" | "crop".
    pub op: String,
    pub path: String,
    #[serde(default)]
    pub paths: Option<Vec<String>>,
    pub max_side: f64,
    #[serde(default)]
    pub options: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreviewResult {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// Port of src/shared/overlay.ts `OverlaySize`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverlaySize {
    pub width: f64,
    pub height: f64,
    /// "wheel" | "center".
    pub anchor: String,
}

/// src/shared/overlay.ts `WHEEL_STAGE`: the wheel centre (anchor_x, anchor_y) is placed at the cursor.
pub const WHEEL_STAGE_WIDTH: f64 = 440.0;
pub const WHEEL_STAGE_HEIGHT: f64 = 500.0;
pub const WHEEL_STAGE_ANCHOR_X: f64 = 220.0;
pub const WHEEL_STAGE_ANCHOR_Y: f64 = 210.0;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn job_request_round_trips_the_ui_shape() {
        let convert: JobRequest = serde_json::from_value(json!({ "kind": "convert", "inputs": ["/a.png"], "target": "jpg" })).unwrap();
        assert!(matches!(convert, JobRequest::Convert { target: Fmt::Jpg, .. }));
        let tool: JobRequest = serde_json::from_value(json!({
            "kind": "tool", "inputs": ["/a.mp4"], "toolId": "video.trim", "options": { "startSec": 1 }
        })).unwrap();
        assert_eq!(serde_json::to_value(&tool).unwrap()["toolId"], "video.trim");
        assert_eq!(ToolId::SubtitleShift.as_str(), "subtitle.shift");
    }

    #[test]
    fn file_info_skips_missing_fields_and_keeps_null_fmt() {
        let f = FileInfo { path: "/x.zip".into(), name: "x.zip".into(), base: "x".into(), ext: "zip".into(), ..Default::default() };
        let v = serde_json::to_value(&f).unwrap();
        assert_eq!(v["fmt"], Value::Null);
        assert!(v.get("width").is_none());
        assert_eq!(Fmt::parse("m4a"), Some(Fmt::M4a));
        assert_eq!(serde_json::to_value(Fmt::M4a).unwrap(), "m4a");
    }
}
```

**File `src-tauri/crates/core/src/registry.rs`**

```rust
//! The data tables shared with the UI. Source of truth: src/shared/registry/*.json
//! (the TypeScript files formats.ts, tools.ts, toolOptions.ts and types.ts read the same JSON).

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::Value;

use crate::types::{Category, Fmt, Settings, ToolId};

const FORMATS_JSON: &str = include_str!("../../../../src/shared/registry/formats.json");
const TOOLS_JSON: &str = include_str!("../../../../src/shared/registry/tools.json");
const DEFAULTS_JSON: &str = include_str!("../../../../src/shared/registry/defaults.json");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatInfo {
    pub fmt: Fmt,
    pub label: String,
    pub category: Category,
    /// First = canonical output extension.
    pub exts: Vec<String>,
    pub mimes: Vec<String>,
    /// false = output-only (DOCX, EPUB).
    pub input: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolMeta {
    pub id: ToolId,
    pub category: Category,
    pub label: String,
    pub icon: String,
    pub description: String,
    pub min_inputs: usize,
    pub max_inputs: usize,
    /// true = run once per input file.
    pub per_file: bool,
    /// Output name suffix ("" = none).
    pub suffix: String,
    #[serde(default)]
    pub instant: bool,
    #[serde(default)]
    pub extra: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormatsFile {
    formats: HashMap<Fmt, FormatInfo>,
    convert_targets: HashMap<Category, Vec<Fmt>>,
}

#[derive(Debug, Deserialize)]
struct ToolsFile {
    tools: Vec<ToolMeta>,
}

pub struct Registry {
    pub formats: HashMap<Fmt, FormatInfo>,
    pub convert_targets: HashMap<Category, Vec<Fmt>>,
    pub tools: Vec<ToolMeta>,
    /// The whole defaults.json: keys "settings", "convert", "edit", "tools".
    pub defaults: Value,
    ext_index: HashMap<String, Fmt>,
}

static REGISTRY: OnceLock<Registry> = OnceLock::new();

/// The registry, parsed once. Panics only if the JSON files are broken (a unit test catches that).
pub fn get() -> &'static Registry {
    REGISTRY.get_or_init(|| {
        let f: FormatsFile = serde_json::from_str(FORMATS_JSON).expect("formats.json");
        let t: ToolsFile = serde_json::from_str(TOOLS_JSON).expect("tools.json");
        let defaults: Value = serde_json::from_str(DEFAULTS_JSON).expect("defaults.json");
        let mut ext_index = HashMap::new();
        for info in f.formats.values() {
            if !info.input {
                continue;
            }
            for e in &info.exts {
                ext_index.insert(e.clone(), info.fmt);
            }
        }
        Registry { formats: f.formats, convert_targets: f.convert_targets, tools: t.tools, defaults, ext_index }
    })
}

/// "C:\\a\\b.JPEG" → "jpeg" (lower-case, no dot). Works with / and \.
pub fn ext_of(file_path: &str) -> String {
    let name = file_path.rsplit(['/', '\\']).next().unwrap_or("");
    match name.rfind('.') {
        Some(dot) if dot > 0 => name[dot + 1..].to_lowercase(),
        _ => String::new(),
    }
}

/// Input formats only (DOCX and EPUB are output-only).
pub fn fmt_from_ext(ext: &str) -> Option<Fmt> {
    get().ext_index.get(&ext.to_lowercase()).copied()
}

pub fn fmt_from_path(file_path: &str) -> Option<Fmt> {
    fmt_from_ext(&ext_of(file_path))
}

pub fn format(fmt: Fmt) -> &'static FormatInfo {
    &get().formats[&fmt]
}

pub fn category_of(fmt: Fmt) -> Category {
    format(fmt).category
}

pub fn label(fmt: Fmt) -> &'static str {
    &format(fmt).label
}

/// Canonical extension to write for a format, e.g. jpg → "jpg", tiff → "tiff".
pub fn output_ext(fmt: Fmt) -> &'static str {
    &format(fmt).exts[0]
}

pub fn convert_targets(category: Category) -> &'static [Fmt] {
    get().convert_targets.get(&category).map(|v| v.as_slice()).unwrap_or(&[])
}

pub fn tool_meta(id: ToolId) -> &'static ToolMeta {
    get().tools.iter().find(|t| t.id == id).expect("every ToolId is in tools.json")
}

/// defaults.json → tools → `<id>` (an object; `{}` for tools without options).
pub fn tool_defaults(id: ToolId) -> &'static Value {
    &get().defaults["tools"][id.as_str().as_str()]
}

pub fn default_settings() -> Settings {
    serde_json::from_value(get().defaults["settings"].clone()).expect("defaults.json settings")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_parses_and_is_consistent() {
        let r = get();
        assert_eq!(r.formats.len(), Fmt::ALL.len());
        assert_eq!(r.tools.len(), 36);
        for t in &r.tools {
            assert!(tool_defaults(t.id).is_object(), "defaults for {}", t.id.as_str());
        }
        let _ = default_settings();
    }

    #[test]
    fn extensions() {
        assert_eq!(ext_of("C:\\x\\Photo.JPEG"), "jpeg");
        assert_eq!(ext_of("noext"), "");
        assert_eq!(ext_of(".bashrc"), "");
        assert_eq!(ext_of("/a/b.c/file.tar.gz"), "gz");
        assert_eq!(fmt_from_path("a.jpeg"), Some(Fmt::Jpg));
        assert_eq!(fmt_from_path("a.jfif"), Some(Fmt::Jpg));
        assert_eq!(fmt_from_path("a.tif"), Some(Fmt::Tiff));
        assert_eq!(fmt_from_path("a.heif"), Some(Fmt::Heic));
        assert_eq!(fmt_from_path("a.m4v"), Some(Fmt::Mp4));
        assert_eq!(fmt_from_path("a.aac"), Some(Fmt::M4a));
        assert_eq!(fmt_from_path("a.md"), Some(Fmt::Txt));
        assert_eq!(fmt_from_path("a.docx"), None);
        assert_eq!(fmt_from_path("a.epub"), None, "EPUB is output-only since EPUB to PDF was removed");
        assert_eq!(output_ext(Fmt::Tiff), "tiff");
        assert_eq!(label(Fmt::Webm), "WebM");
        assert_eq!(category_of(Fmt::Epub), Category::Pdf);
    }

    #[test]
    fn tools() {
        assert!(tool_meta(ToolId::VideoMute).instant);
        assert_eq!(tool_meta(ToolId::PdfMerge).min_inputs, 2);
        assert!(convert_targets(Category::Audio).contains(&Fmt::Mp3));
    }
}
```

**File `src-tauri/crates/core/src/options.rs`**

```rust
//! Port of src/shared/toolOptions.ts. Defaults live in src/shared/registry/defaults.json (see `registry`).
//! Every number is f64 because the UI sends JavaScript numbers.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::geometry::NormRect;
use crate::registry;
use crate::types::ToolId;

// ---------- Convert options (Step-2 cards for conversions) ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SvgMode { Trace, Embed }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DocMode { Reflow, Pages }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrMode { Auto, Off }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextSize { Small, Medium, Large, Xlarge }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextFont { Original, Serif, Sans, Mono }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageSize { A4, Letter, A5 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CueTiming { Reading, Fixed }

/// All fields optional: a missing field means "use DEFAULT_CONVERT_OPTIONS" (defaults.json → "convert").
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")] pub quality: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub svg_mode: Option<SvgMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub svg_colors: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub gif_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub gif_fps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub doc_mode: Option<DocMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub ocr: Option<OcrMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub text_size: Option<TextSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub font: Option<TextFont>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub page_size: Option<PageSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub image_dpi: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub cue_timing: Option<CueTiming>,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub seconds_per_cue: Option<f64>,
}

/// DEFAULT_CONVERT_OPTIONS with every field present.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertDefaults {
    pub quality: f64,
    pub svg_mode: SvgMode,
    pub svg_colors: f64,
    pub gif_width: f64,
    pub gif_fps: f64,
    pub doc_mode: DocMode,
    pub ocr: OcrMode,
    pub text_size: TextSize,
    pub font: TextFont,
    pub page_size: PageSize,
    pub image_dpi: f64,
    pub cue_timing: CueTiming,
    pub seconds_per_cue: f64,
}

// ---------- Tool options ----------

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRangeSec { pub start_sec: f64, pub end_sec: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressPreset { High, Balanced, Small }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec { H264, H265 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoCompressOptions { pub preset: CompressPreset, pub max_height: f64, pub codec: VideoCodec, pub target_size_mb: f64 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoTrimOptions { pub start_sec: f64, pub end_sec: f64, pub precise: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitMode { At, Parts, Every }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSplitOptions { pub mode: SplitMode, pub times: Vec<f64>, pub parts: f64, pub every_sec: f64, pub precise: bool }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoCropOptions { pub rect: NormRect }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSpeedOptions { pub factor: f64, pub keep_audio: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotMode { Single, Every }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StillFormat { Png, Jpg }

impl StillFormat {
    pub fn ext(self) -> &'static str {
        match self { StillFormat::Png => "png", StillFormat::Jpg => "jpg" }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSnapshotOptions { pub mode: SnapshotMode, pub time_sec: f64, pub every_sec: f64, pub format: StillFormat }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedactStyle { Blur, Pixelate, Black }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactRegion {
    pub rect: NormRect,
    pub style: RedactStyle,
    #[serde(default)] pub start_sec: Option<f64>,
    #[serde(default)] pub end_sec: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoRedactOptions { pub regions: Vec<RedactRegion> }

/// `tags` keeps the UI's key order (serde_json "preserve_order" feature).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadataOptions {
    pub remove_all: bool,
    pub tags: serde_json::Map<String, Value>,
    pub cover_path: Option<String>,
    pub remove_cover: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinOptions { pub order: Vec<String> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioCompressFormat { Keep, Mp3, M4a, Opus }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCompressOptions { pub bitrate_kbps: f64, pub format: AudioCompressFormat, pub mono: bool }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioNormalizeOptions { pub target: f64, pub true_peak: f64 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrimOptions { pub start_sec: f64, pub end_sec: f64, pub fade_in_sec: f64, pub fade_out_sec: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelMode { Mono, Stereo, Left, Right, Swap }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioChannelsOptions { pub mode: ChannelMode }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VisualizeKind {
    #[serde(rename = "waveform-png")] WaveformPng,
    #[serde(rename = "spectrogram-png")] SpectrogramPng,
    #[serde(rename = "waveform-mp4")] WaveformMp4,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioVisualizeOptions { pub kind: VisualizeKind, pub width: f64, pub height: f64, pub color: String, pub background: String }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BleepSound { Beep, Silence }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioBleepOptions { pub ranges: Vec<TimeRangeSec>, pub sound: BleepSound, pub frequency: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageCompressFormat { Keep, Jpg, Webp, Avif }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCompressOptions { pub quality: f64, pub max_side: f64, pub format: ImageCompressFormat, pub strip_metadata: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResizeMode { Percent, Pixels }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResizeOptions { pub mode: ResizeMode, pub percent: f64, pub width: f64, pub height: f64, pub keep_aspect: bool }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCropOptions { pub rect: NormRect, pub rotate: f64, pub flip_h: bool, pub flip_v: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EditEffect { None, Bw, Sepia, Vintage, Invert }

/// `EditParams` in TypeScript.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditParams {
    pub exposure: f64,
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    pub warmth: f64,
    pub hue: f64,
    pub detail: f64,
    pub blur: f64,
    pub vignette: f64,
    pub effect: EditEffect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackgroundKind { Solid, Gradient, Blur }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageBackgroundOptions {
    pub kind: BackgroundKind,
    pub color: String,
    pub gradient: (String, String),
    pub angle: f64,
    pub padding_pct: f64,
    pub radius_pct: f64,
    pub shadow: bool,
    /// "auto" | "1:1" | "4:5" | "16:9" | "9:16".
    pub aspect: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRedactRegion { pub rect: NormRect, pub style: RedactStyle }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRedactOptions { pub regions: Vec<ImageRedactRegion> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImageMetadataAction {
    #[serde(rename = "remove-all")] RemoveAll,
    #[serde(rename = "remove-gps")] RemoveGps,
    #[serde(rename = "edit")] Edit,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataFields {
    #[serde(default)] pub artist: Option<String>,
    #[serde(default)] pub copyright: Option<String>,
    #[serde(default)] pub description: Option<String>,
    #[serde(default)] pub date_taken: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataOptions { pub action: ImageMetadataAction, pub fields: ImageMetadataFields }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CollageLayoutKind { Grid, Row, Column, Featured }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CollageFit { Cover, Contain }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollageOptions {
    pub layout: CollageLayoutKind,
    pub order: Vec<String>,
    pub gap: f64,
    pub background: String,
    pub radius: f64,
    pub width: f64,
    pub fit: CollageFit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfPageSize { Fit, A4, Letter }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfMargin { None, Small, Large }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePdfOptions { pub order: Vec<String>, pub page_size: PdfPageSize, pub margin: PdfMargin, pub combine: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfCompressLevel { Light, Balanced, Strong, Max }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfCompressOptions { pub level: PdfCompressLevel }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMergeOptions { pub order: Vec<String> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PdfSplitMode { Each, Every, Ranges, Extract }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSplitOptions { pub mode: PdfSplitMode, pub every: f64, pub ranges: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOrganizePage { pub src: f64, pub rotate: f64 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOrganizeOptions { pub pages: Vec<PdfOrganizePage> }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfImagesOptions { pub format: StillFormat, pub dpi: f64, pub ranges: String, pub quality: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrOutput { Txt, Pdf }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrOptions { pub languages: Vec<String>, pub output: OcrOutput, pub ranges: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfWordOptions { pub mode: DocMode, pub ocr: OcrMode }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMetadataOptions { pub remove_all: bool, pub title: String, pub author: String, pub subject: String, pub keywords: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleShiftOptions { pub offset_ms: f64 }

/// Port of `withDefaults`: shallow merge of the UI's options over defaults.json["tools"][toolId].
/// Lenient per key: a key with the wrong type is ignored (the default is kept) instead of failing the job.
pub fn with_defaults<T: DeserializeOwned>(tool: ToolId, options: &Value) -> T {
    let mut merged = registry::tool_defaults(tool).clone();
    if let (Value::Object(target), Value::Object(user)) = (&mut merged, options) {
        for (key, value) in user {
            let mut trial = target.clone();
            trial.insert(key.clone(), value.clone());
            if serde_json::from_value::<T>(Value::Object(trial)).is_ok() {
                target.insert(key.clone(), value.clone());
            }
        }
    }
    serde_json::from_value(merged)
        .unwrap_or_else(|e| panic!("defaults.json does not match the options of {}: {e}", tool.as_str()))
}

/// Defaults for `image.edit` (DEFAULT_EDIT).
pub fn default_edit() -> EditParams {
    serde_json::from_value(registry::get().defaults["edit"].clone()).expect("defaults.json edit")
}

/// DEFAULT_CONVERT_OPTIONS.
pub fn convert_defaults() -> ConvertDefaults {
    serde_json::from_value(registry::get().defaults["convert"].clone()).expect("defaults.json convert")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merges_over_defaults() {
        let o: VideoCompressOptions = with_defaults(ToolId::VideoCompress, &json!({ "preset": "small" }));
        assert_eq!(o.preset, CompressPreset::Small);
        assert_eq!(o.codec, VideoCodec::H264);
    }

    #[test]
    fn wrong_types_fall_back_to_the_default() {
        let o: VideoTrimOptions = with_defaults(ToolId::VideoTrim, &json!({ "startSec": "oops", "endSec": 3, "unknown": 1 }));
        assert_eq!(o.start_sec, 0.0);
        assert_eq!(o.end_sec, 3.0);
    }

    #[test]
    fn every_tool_has_parseable_defaults() {
        use crate::types::ToolId::*;
        let empty = json!({});
        let _: VideoCompressOptions = with_defaults(VideoCompress, &empty);
        let _: MediaMetadataOptions = with_defaults(VideoMetadata, &empty);
        let _: VideoTrimOptions = with_defaults(VideoTrim, &empty);
        let _: VideoCropOptions = with_defaults(VideoCrop, &empty);
        let _: VideoSpeedOptions = with_defaults(VideoSpeed, &empty);
        let _: VideoSnapshotOptions = with_defaults(VideoSnapshot, &empty);
        let _: VideoSplitOptions = with_defaults(VideoSplit, &empty);
        let _: VideoRedactOptions = with_defaults(VideoRedact, &empty);
        let _: JoinOptions = with_defaults(VideoJoin, &empty);
        let _: AudioCompressOptions = with_defaults(AudioCompress, &empty);
        let _: AudioNormalizeOptions = with_defaults(AudioNormalize, &empty);
        let _: AudioTrimOptions = with_defaults(AudioTrim, &empty);
        let _: AudioChannelsOptions = with_defaults(AudioChannels, &empty);
        let _: AudioVisualizeOptions = with_defaults(AudioVisualize, &empty);
        let _: AudioBleepOptions = with_defaults(AudioBleep, &empty);
        let _: MediaMetadataOptions = with_defaults(AudioMetadata, &empty);
        let _: JoinOptions = with_defaults(AudioJoin, &empty);
        let _: ImageCompressOptions = with_defaults(ImageCompress, &empty);
        let _: ImageResizeOptions = with_defaults(ImageResize, &empty);
        let _: ImageCropOptions = with_defaults(ImageCrop, &empty);
        let _: EditParams = with_defaults(ImageEdit, &empty);
        let _: ImageBackgroundOptions = with_defaults(ImageBackground, &empty);
        let _: ImageRedactOptions = with_defaults(ImageRedact, &empty);
        let _: ImageMetadataOptions = with_defaults(ImageMetadata, &empty);
        let _: CollageOptions = with_defaults(ImageCollage, &empty);
        let _: CreatePdfOptions = with_defaults(ImagePdf, &empty);
        let _: PdfCompressOptions = with_defaults(PdfCompress, &empty);
        let _: PdfMergeOptions = with_defaults(PdfMerge, &empty);
        let _: PdfSplitOptions = with_defaults(PdfSplit, &empty);
        let _: PdfOrganizeOptions = with_defaults(PdfOrganize, &empty);
        let _: PdfImagesOptions = with_defaults(PdfImages, &empty);
        let _: PdfOcrOptions = with_defaults(PdfOcr, &empty);
        let _: PdfWordOptions = with_defaults(PdfWord, &empty);
        let _: PdfMetadataOptions = with_defaults(PdfMetadata, &empty);
        let _: SubtitleShiftOptions = with_defaults(SubtitleShift, &empty);
        let _ = default_edit();
        let _ = convert_defaults();
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 25 passed; 0 failed`. A failing `registry` test usually means the JSON files are missing
or stale: run `npm run gen:registry`.

## Task 3.7 — core: `split`, `pdf_split`

**Goal.** Where to cut a video (by count, length or explicit times) and how to group PDF pages for splitting.

**File `src-tauri/crates/core/src/split.rs`**

```rust
//! Port of src/shared/split.ts (video split points).

use crate::js::js_round;
use crate::options::{SplitMode, VideoSplitOptions};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
}

pub fn split_segments(duration: f64, o: &VideoSplitOptions) -> Vec<Segment> {
    let cuts: Vec<f64> = match o.mode {
        SplitMode::Parts => {
            let n = js_round(o.parts).clamp(2.0, 100.0) as usize;
            (0..n - 1).map(|i| duration * (i as f64 + 1.0) / n as f64).collect()
        }
        SplitMode::Every => {
            let s = o.every_sec.max(1.0);
            let mut v = Vec::new();
            let mut t = s;
            while t < duration - 0.05 {
                v.push(t);
                t += s;
            }
            v
        }
        SplitMode::At => o.times.clone(),
    };
    let mut clean: Vec<f64> = cuts
        .into_iter()
        .filter(|t| *t > 0.05 && *t < duration - 0.05)
        .map(|t| js_round(t * 1000.0) / 1000.0)
        .collect();
    clean.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    clean.dedup();
    let mut pts = vec![0.0];
    pts.extend(clean);
    pts.push(duration);
    pts.windows(2).map(|w| Segment { start: w[0], end: w[1] }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn o(mode: SplitMode, times: Vec<f64>, parts: f64, every: f64) -> VideoSplitOptions {
        VideoSplitOptions { mode, times, parts, every_sec: every, precise: false }
    }

    #[test]
    fn segments() {
        let s = split_segments(10.0, &o(SplitMode::Parts, vec![], 2.0, 60.0));
        assert_eq!(s, vec![Segment { start: 0.0, end: 5.0 }, Segment { start: 5.0, end: 10.0 }]);
        let e = split_segments(10.0, &o(SplitMode::Every, vec![], 2.0, 4.0));
        assert_eq!(e.len(), 3);
        let a = split_segments(10.0, &o(SplitMode::At, vec![7.0, 3.0, 3.0, 0.01], 2.0, 60.0));
        assert_eq!(a.len(), 3);
        assert_eq!(a[1], Segment { start: 3.0, end: 7.0 });
        assert_eq!(split_segments(4.0, &o(SplitMode::At, vec![], 2.0, 60.0)).len(), 1);
    }
}
```

**File `src-tauri/crates/core/src/pdf_split.rs`**

```rust
//! Port of src/shared/pdfSplit.ts.

use crate::js::js_round;
use crate::options::{PdfSplitMode, PdfSplitOptions};
use crate::page_ranges::{flatten_ranges, parse_page_ranges};

/// Page groups (0-based) for a split request. Errors are user-facing sentences.
pub fn split_groups(o: &PdfSplitOptions, total: usize) -> Result<Vec<Vec<usize>>, String> {
    match o.mode {
        PdfSplitMode::Each => Ok((0..total).map(|i| vec![i]).collect()),
        PdfSplitMode::Every => {
            let n = js_round(o.every).max(1.0) as usize;
            let mut groups = Vec::new();
            let mut i = 0;
            while i < total {
                groups.push((i..(i + n).min(total)).collect());
                i += n;
            }
            Ok(groups)
        }
        PdfSplitMode::Ranges | PdfSplitMode::Extract => {
            if o.ranges.trim().is_empty() {
                return Err("Enter the pages to use, for example 1-3, 5".to_string());
            }
            let parsed = parse_page_ranges(&o.ranges, total)?;
            if o.mode == PdfSplitMode::Ranges { Ok(parsed) } else { Ok(vec![flatten_ranges(&parsed)]) }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(mode: PdfSplitMode, every: f64, ranges: &str) -> PdfSplitOptions {
        PdfSplitOptions { mode, every, ranges: ranges.to_string() }
    }

    #[test]
    fn groups() {
        assert_eq!(split_groups(&opts(PdfSplitMode::Each, 1.0, ""), 3).unwrap(), vec![vec![0], vec![1], vec![2]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Every, 2.0, ""), 5).unwrap(), vec![vec![0, 1], vec![2, 3], vec![4]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Every, 0.0, ""), 2).unwrap(), vec![vec![0], vec![1]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Ranges, 1.0, "1-2,3"), 3).unwrap(), vec![vec![0, 1], vec![2]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Extract, 1.0, "2, 1-2"), 3).unwrap(), vec![vec![1, 0]]);
        assert!(split_groups(&opts(PdfSplitMode::Ranges, 1.0, "9"), 3).unwrap_err().contains("doesn't exist"));
        assert!(split_groups(&opts(PdfSplitMode::Extract, 1.0, "  "), 3).unwrap_err().contains("Enter the pages"));
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 27 passed; 0 failed`.

## Task 3.8 — core: `text`, `subtitles`

**Goal.** Text decoding (UTF-8 with or without BOM, UTF-16 with BOM) and everything about subtitles: parsing SRT/VTT,
writing SRT/VTT/plain text, shifting times, and turning plain text into timed cues.

**File `src-tauri/crates/core/src/text.rs`**

```rust
//! Port of src/shared/text.ts (the parts the backend uses).

/// Decode text bytes: UTF-8 (with/without BOM), UTF-16 LE/BE with BOM. Invalid UTF-8 becomes U+FFFD.
pub fn decode_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return String::from_utf8_lossy(&bytes[3..]).to_string();
    }
    if bytes.starts_with(&[0xff, 0xfe]) {
        let (s, _) = encoding_rs::UTF_16LE.decode_without_bom_handling(&bytes[2..]);
        return s.to_string();
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        let (s, _) = encoding_rs::UTF_16BE.decode_without_bom_handling(&bytes[2..]);
        return s.to_string();
    }
    String::from_utf8_lossy(bytes).to_string()
}

pub fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// Rough language guess for EPUB metadata: "vi" when Vietnamese letters appear, else "en".
pub fn guess_lang(text: &str) -> &'static str {
    const VI: &str = "ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ";
    if text.to_lowercase().chars().any(|c| VI.contains(c)) { "vi" } else { "en" }
}

/// Font size in points for each TXT → PDF size option (`TEXT_SIZE_PT`).
pub fn text_size_pt(size: crate::options::TextSize) -> f64 {
    use crate::options::TextSize::*;
    match size {
        Small => 9.5,
        Medium => 11.0,
        Large => 13.0,
        Xlarge => 16.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoding() {
        assert_eq!(decode_text(&[0xef, 0xbb, 0xbf, 0x48, 0x69]), "Hi");
        assert_eq!(decode_text(&[0xff, 0xfe, 0x41, 0x00]), "A");
        assert_eq!(decode_text(&[0xfe, 0xff, 0x00, 0x42]), "B");
        assert_eq!(decode_text("Tiếng Việt".as_bytes()), "Tiếng Việt");
    }

    #[test]
    fn xml_and_lang() {
        assert_eq!(escape_xml("<a & \"b\">"), "&lt;a &amp; &quot;b&quot;&gt;");
        assert_eq!(escape_xml("it's"), "it&apos;s");
        assert_eq!(guess_lang("Xin chào thế giới"), "vi");
        assert_eq!(guess_lang("Hello world"), "en");
    }
}
```

**File `src-tauri/crates/core/src/subtitles.rs`**

```rust
//! Port of src/shared/subtitles.ts.

use regex::Regex;

use crate::time::{format_srt_time, format_vtt_time, parse_timecode};

#[derive(Debug, Clone, PartialEq)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

fn normalize(input: &str) -> String {
    input.trim_start_matches('\u{FEFF}').replace("\r\n", "\n").replace('\r', "\n")
}

/// Works for both SRT and VTT (headers, NOTE, STYLE and cue settings are skipped).
pub fn parse_subtitles(input: &str) -> Vec<Cue> {
    let time_line = Regex::new(r"^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})")
        .expect("valid regex");
    let blank = Regex::new(r"\n{2,}").expect("valid regex");
    let mut cues = Vec::new();
    for block in blank.split(&normalize(input)) {
        let lines: Vec<&str> = block.split('\n').collect();
        let Some(idx) = lines.iter().position(|l| time_line.is_match(l)) else { continue };
        let Some(m) = time_line.captures(lines[idx]) else { continue };
        let (Some(start), Some(end)) = (parse_timecode(&m[1]), parse_timecode(&m[2])) else { continue };
        let text = lines[idx + 1..].join("\n").trim().to_string();
        if text.is_empty() {
            continue;
        }
        cues.push(Cue { start, end: end.max(start), text });
    }
    cues
}

/// keep_basic=true keeps <i> <b> <u> (valid in SRT).
pub fn strip_tags(text: &str, keep_basic: bool) -> String {
    let tag = Regex::new(r"(?i)</?([a-z0-9.]+)[^>]*>").expect("valid regex");
    let attrs = Regex::new(r"\s.*?>").expect("valid regex");
    let no_tags = tag.replace_all(text, |c: &regex::Captures| {
        let name = c[1].to_lowercase();
        if keep_basic && ["i", "b", "u"].contains(&name.as_str()) {
            attrs.replacen(&c[0], 1, ">").to_string()
        } else {
            String::new()
        }
    });
    if keep_basic {
        return no_tags.to_string();
    }
    let entity = Regex::new(r"&(amp|lt|gt|nbsp|quot);").expect("valid regex");
    entity
        .replace_all(&no_tags, |c: &regex::Captures| match &c[1] {
            "amp" => "&",
            "lt" => "<",
            "gt" => ">",
            "nbsp" => " ",
            _ => "\"",
        })
        .to_string()
}

pub fn to_srt(cues: &[Cue]) -> String {
    cues.iter()
        .enumerate()
        .map(|(i, c)| format!("{}\n{} --> {}\n{}\n", i + 1, format_srt_time(c.start), format_srt_time(c.end), strip_tags(&c.text, true)))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn to_vtt(cues: &[Cue]) -> String {
    let body = cues
        .iter()
        .map(|c| format!("{} --> {}\n{}\n", format_vtt_time(c.start), format_vtt_time(c.end), c.text))
        .collect::<Vec<_>>()
        .join("\n");
    format!("WEBVTT\n\n{body}")
}

pub fn to_plain_text(cues: &[Cue]) -> String {
    cues.iter().map(|c| strip_tags(&c.text, false)).collect::<Vec<_>>().join("\n") + "\n"
}

pub fn shift_cues(cues: &[Cue], offset_sec: f64) -> Vec<Cue> {
    cues.iter()
        .map(|c| Cue { start: (c.start + offset_sec).max(0.0), end: c.end + offset_sec, text: c.text.clone() })
        .filter(|c| c.end > 0.0)
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CueTimingMode {
    Reading,
    Fixed,
}

pub struct TextToCuesOptions {
    pub timing: CueTimingMode,
    pub seconds_per_cue: f64,
}

/// Split at the space closest to the middle when longer than `max` (JS string lengths count UTF-16 units; we count chars).
fn wrap_two_lines(text: &str, max: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max {
        return text.to_string();
    }
    let mid = chars.len() / 2;
    let mut best: Option<usize> = None;
    for (i, ch) in chars.iter().enumerate() {
        if *ch == ' ' {
            let better = match best {
                None => true,
                Some(b) => (i as i64 - mid as i64).abs() < (b as i64 - mid as i64).abs(),
            };
            if better {
                best = Some(i);
            }
        }
    }
    match best {
        None => text.to_string(),
        Some(b) => {
            let left: String = chars[..b].iter().collect();
            let right: String = chars[b + 1..].iter().collect();
            format!("{left}\n{right}")
        }
    }
}

fn chunk(line: &str, max_chunk: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for w in line.split_whitespace() {
        if !cur.is_empty() && cur.chars().count() + 1 + w.chars().count() > max_chunk {
            out.push(std::mem::take(&mut cur));
            cur = w.to_string();
        } else if cur.is_empty() {
            cur = w.to_string();
        } else {
            cur = format!("{cur} {w}");
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// One cue per non-empty line (long lines are split), timed by reading speed or a fixed duration.
pub fn text_to_cues(text: &str, o: &TextToCuesOptions) -> Vec<Cue> {
    let cps = 15.0;
    let max_line = 42;
    let gap = 0.1;
    let pieces: Vec<String> = normalize(text)
        .split('\n')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .flat_map(|l| chunk(l, max_line * 2))
        .collect();
    let mut cues = Vec::new();
    let mut t = 0.0;
    for p in pieces {
        let dur = match o.timing {
            CueTimingMode::Fixed => o.seconds_per_cue,
            CueTimingMode::Reading => (p.chars().count() as f64 / cps).clamp(1.2, 7.0),
        };
        cues.push(Cue { start: t, end: t + dur, text: wrap_two_lines(&p, max_line) });
        t += dur + gap;
    }
    cues
}

#[cfg(test)]
mod tests {
    use super::*;

    const SRT: &str = "\u{FEFF}1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>world</i>\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nSecond\r\nline\r\n";
    const VTT: &str = "WEBVTT\n\nNOTE this is a comment\nspanning two lines\n\n00:01.000 --> 00:02.500 align:start position:0%\nFirst cue without an id\n\nintro\n00:00:03.000 --> 00:00:04.000\nSecond cue\n";

    #[test]
    fn parses_srt_and_vtt() {
        let cues = parse_subtitles(SRT);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0], Cue { start: 1.0, end: 3.5, text: "Hello <i>world</i>".into() });
        assert_eq!(cues[1].text, "Second\nline");
        let v = parse_subtitles(VTT);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0], Cue { start: 1.0, end: 2.5, text: "First cue without an id".into() });
        assert_eq!(v[1], Cue { start: 3.0, end: 4.0, text: "Second cue".into() });
        assert_eq!(to_srt(&parse_subtitles(&to_vtt(&cues))), to_srt(&cues));
    }

    #[test]
    fn tags_and_writers() {
        assert_eq!(strip_tags("<v Bob><i>Hi</i> &amp; bye</v>", false), "Hi & bye");
        assert_eq!(strip_tags("<v Bob><i>Hi</i> &amp; bye</v>", true), "<i>Hi</i> &amp; bye");
        let cues = vec![Cue { start: 0.5, end: 2.0, text: "A <b>b</b> &amp; c".into() }];
        assert_eq!(to_srt(&cues), "1\n00:00:00,500 --> 00:00:02,000\nA <b>b</b> &amp; c\n");
        assert!(to_vtt(&cues).starts_with("WEBVTT\n\n00:00:00.500 --> 00:00:02.000\n"));
        assert_eq!(to_plain_text(&cues), "A b & c\n");
    }

    #[test]
    fn shifting() {
        let out = shift_cues(&[Cue { start: 1.0, end: 2.0, text: "a".into() }, Cue { start: 0.2, end: 0.8, text: "b".into() }], -0.5);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0], Cue { start: 0.5, end: 1.5, text: "a".into() });
        assert_eq!(out[1].start, 0.0);
        assert!((out[1].end - 0.3).abs() < 1e-6);
        assert!(shift_cues(&[Cue { start: 0.0, end: 1.0, text: "gone".into() }], -5.0).is_empty());
    }

    #[test]
    fn cues_from_text() {
        let fixed = TextToCuesOptions { timing: CueTimingMode::Fixed, seconds_per_cue: 2.0 };
        let cues = text_to_cues("a\n\nb", &fixed);
        assert_eq!(cues.len(), 2);
        assert_eq!((cues[0].start, cues[0].end), (0.0, 2.0));
        assert!((cues[1].start - 2.1).abs() < 1e-6 && (cues[1].end - 4.1).abs() < 1e-6);
        let reading = TextToCuesOptions { timing: CueTimingMode::Reading, seconds_per_cue: 3.0 };
        let long = format!("Hi\n{}", "word ".repeat(80).trim());
        let rc = text_to_cues(&long, &reading);
        assert!(rc.len() > 2);
        for c in &rc {
            let d = c.end - c.start;
            assert!((1.2 - 1e-9..=7.0 + 1e-9).contains(&d));
        }
        let wrapped = text_to_cues("this is a rather long subtitle sentence that needs two lines", &fixed);
        assert_eq!(wrapped[0].text.split('\n').count(), 2);
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 33 passed; 0 failed`.

## Task 3.9 — core: `collage_layout`, `edit_pipeline`

**Goal.** Collage cell positions for each layout, and the Edit panel's sliders turned into a colour matrix and filter
settings (`EditSpec`).

**File `src-tauri/crates/core/src/collage_layout.rs`**

```rust
//! Port of src/shared/collageLayout.ts.

use crate::js::js_round;
use crate::options::CollageLayoutKind;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Cell {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

pub struct CollageLayout {
    pub width: u32,
    pub height: u32,
    pub cells: Vec<Cell>,
}

pub fn collage_cells(n: usize, layout: CollageLayoutKind, width: f64, gap: f64) -> CollageLayout {
    let w_total = js_round(width);
    let nf = n as f64;
    match layout {
        CollageLayoutKind::Row => {
            let cw = (w_total - gap * (nf + 1.0)) / nf;
            let cells = (0..n).map(|i| Cell { x: gap + i as f64 * (cw + gap), y: gap, w: cw, h: cw }).collect();
            CollageLayout { width: w_total as u32, height: js_round(cw + 2.0 * gap) as u32, cells }
        }
        CollageLayoutKind::Column => {
            let cw = w_total - 2.0 * gap;
            let ch = cw * 0.75;
            let cells = (0..n).map(|i| Cell { x: gap, y: gap + i as f64 * (ch + gap), w: cw, h: ch }).collect();
            CollageLayout { width: w_total as u32, height: js_round(nf * ch + (nf + 1.0) * gap) as u32, cells }
        }
        CollageLayoutKind::Featured if n >= 2 => {
            let big_w = (w_total - 3.0 * gap) * (2.0 / 3.0);
            let small_w = w_total - 3.0 * gap - big_w;
            let h_total = js_round(big_w * 0.75 + 2.0 * gap);
            let rest = (n - 1) as f64;
            let sh = (h_total - (rest + 1.0) * gap) / rest;
            let mut cells = vec![Cell { x: gap, y: gap, w: big_w, h: h_total - 2.0 * gap }];
            for i in 1..n {
                cells.push(Cell { x: 2.0 * gap + big_w, y: gap + (i as f64 - 1.0) * (sh + gap), w: small_w, h: sh });
            }
            CollageLayout { width: w_total as u32, height: h_total as u32, cells }
        }
        _ => {
            let cols = (nf.sqrt()).ceil();
            let rows = (nf / cols).ceil();
            let cw = (w_total - gap * (cols + 1.0)) / cols;
            let cols_u = cols as usize;
            let cells = (0..n)
                .map(|i| Cell { x: gap + (i % cols_u) as f64 * (cw + gap), y: gap + (i / cols_u) as f64 * (cw + gap), w: cw, h: cw })
                .collect();
            CollageLayout { width: w_total as u32, height: js_round(rows * cw + (rows + 1.0) * gap) as u32, cells }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layouts() {
        let l = collage_cells(4, CollageLayoutKind::Grid, 1000.0, 0.0);
        assert_eq!((l.width, l.height), (1000, 1000));
        assert_eq!(l.cells[3], Cell { x: 500.0, y: 500.0, w: 500.0, h: 500.0 });
        let r = collage_cells(3, CollageLayoutKind::Row, 1000.0, 10.0);
        assert!(r.cells.iter().all(|c| c.y == 10.0));
        let f = collage_cells(3, CollageLayoutKind::Featured, 1200.0, 12.0);
        assert!((f.cells[0].w / f.cells[1].w - 2.0).abs() < 0.05);
        for layout in [CollageLayoutKind::Grid, CollageLayoutKind::Row, CollageLayoutKind::Column, CollageLayoutKind::Featured] {
            for n in [2, 3, 5, 7] {
                let l = collage_cells(n, layout, 1000.0, 12.0);
                for c in &l.cells {
                    assert!(c.x >= 0.0 && c.y >= 0.0);
                    assert!(c.x + c.w <= l.width as f64 + 1.0 && c.y + c.h <= l.height as f64 + 1.0);
                }
            }
        }
    }
}
```

**File `src-tauri/crates/core/src/edit_pipeline.rs`**

```rust
//! Port of src/shared/editPipeline.ts: turns the Edit panel's sliders into image operations.

use crate::js::js_round;
use crate::options::{EditEffect, EditParams};

pub type M3 = [[f64; 3]; 3];
const IDENTITY: M3 = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
const SEPIA: M3 = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];

pub fn mul(a: &M3, b: &M3) -> M3 {
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    r
}

fn mix(a: &M3, b: &M3, t: f64) -> M3 {
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] = a[i][j] * t + b[i][j] * (1.0 - t);
        }
    }
    r
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditSpec {
    /// out = a*in + b (per colour channel, 0..255 scale)
    pub linear: Option<(f64, f64)>,
    /// saturation multiplier and hue rotation in degrees
    pub modulate: Option<(f64, f64)>,
    pub recomb: Option<M3>,
    pub grayscale: bool,
    pub negate: bool,
    pub sharpen_sigma: Option<f64>,
    pub blur_sigma: Option<f64>,
    /// 0..1
    pub vignette: f64,
}

pub fn build_edit_spec(p: &EditParams) -> EditSpec {
    let m = 2f64.powf(p.exposure);
    let c = 1.0 + p.contrast / 100.0;
    let a = m * c;
    let b = 128.0 * (1.0 - c) + p.brightness * 1.28;
    let sat = 1.0 + p.saturation / 100.0;
    let mut recomb: Option<M3> = None;
    if p.warmth != 0.0 {
        let w = (p.warmth / 100.0) * 0.12;
        recomb = Some([[1.0 + w, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0 - w]]);
    }
    if p.effect == EditEffect::Sepia || p.effect == EditEffect::Vintage {
        let s = if p.effect == EditEffect::Sepia { SEPIA } else { mix(&SEPIA, &IDENTITY, 0.5) };
        recomb = Some(mul(&s, &recomb.unwrap_or(IDENTITY)));
    }
    EditSpec {
        linear: if (a - 1.0).abs() > 1e-6 || b.abs() > 1e-6 { Some((a, b)) } else { None },
        modulate: if sat != 1.0 || p.hue != 0.0 { Some((sat, js_round(p.hue))) } else { None },
        recomb,
        grayscale: p.effect == EditEffect::Bw,
        negate: p.effect == EditEffect::Invert,
        sharpen_sigma: if p.detail > 0.0 { Some(0.5 + p.detail / 40.0) } else { None },
        blur_sigma: if p.blur > 0.0 { Some(0.3 + p.blur / 5.0) } else { None },
        vignette: ((p.vignette + if p.effect == EditEffect::Vintage { 35.0 } else { 0.0 }) / 100.0).min(1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::default_edit;

    #[test]
    fn specs() {
        let d = default_edit();
        let none = build_edit_spec(&d);
        assert_eq!(none, EditSpec { linear: None, modulate: None, recomb: None, grayscale: false, negate: false, sharpen_sigma: None, blur_sigma: None, vignette: 0.0 });
        assert_eq!(build_edit_spec(&EditParams { exposure: 1.0, ..d.clone() }).linear, Some((2.0, 0.0)));
        assert_eq!(build_edit_spec(&EditParams { contrast: 50.0, ..d.clone() }).linear, Some((1.5, -64.0)));
        assert_eq!(build_edit_spec(&EditParams { saturation: -100.0, ..d.clone() }).modulate, Some((0.0, 0.0)));
        assert_eq!(build_edit_spec(&EditParams { hue: 90.4, ..d.clone() }).modulate, Some((1.0, 90.0)));
        assert!(build_edit_spec(&EditParams { effect: EditEffect::Bw, ..d.clone() }).grayscale);
        assert!((build_edit_spec(&EditParams { effect: EditEffect::Vintage, ..d.clone() }).vignette - 0.35).abs() < 1e-9);
        assert_eq!(build_edit_spec(&EditParams { vignette: 250.0, ..d.clone() }).vignette, 1.0);
        assert!((build_edit_spec(&EditParams { detail: 40.0, ..d.clone() }).sharpen_sigma.unwrap() - 1.5).abs() < 1e-9);
        assert!((build_edit_spec(&EditParams { blur: 50.0, ..d.clone() }).blur_sigma.unwrap() - 10.3).abs() < 1e-9);
        let w = build_edit_spec(&EditParams { warmth: 100.0, ..d }).recomb.unwrap();
        assert!(w[0][0] > 1.0 && w[2][2] < 1.0);
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 35 passed; 0 failed`.

## Task 3.10 — core: `pdf_reflow`

**Goal.** Turn positioned PDF text (words with x, y, size, bold) into headings, paragraphs and list items. Used for
PDF → DOCX, PDF → EPUB and PDF → TXT.

**File `src-tauri/crates/core/src/pdf_reflow.rs`**

```rust
//! Port of src/shared/pdfReflow.ts: positioned PDF text → headings, paragraphs and list items.
//! Coordinates are in PDF points with y measured FROM THE TOP of the page (like pdf.js viewport coordinates).

use std::collections::{HashMap, HashSet};

use regex::Regex;

use crate::text::escape_xml;

#[derive(Debug, Clone, PartialEq)]
pub struct TextItem {
    pub str: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub font_size: f64,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TextPage {
    pub width: f64,
    pub height: f64,
    pub items: Vec<TextItem>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Run {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockKind {
    H1,
    H2,
    H3,
    P,
    Li,
}

impl BlockKind {
    fn tag(self) -> &'static str {
        match self {
            BlockKind::H1 => "h1",
            BlockKind::H2 => "h2",
            BlockKind::H3 => "h3",
            BlockKind::P => "p",
            BlockKind::Li => "li",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Text { kind: BlockKind, runs: Vec<Run> },
    PageBreak,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub y: f64,
    pub x: f64,
    pub right: f64,
    pub font_size: f64,
    pub runs: Vec<Run>,
    pub text: String,
    pub bold: bool,
}

fn median(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        return 0.0;
    }
    let mut s = xs.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let m = s.len() / 2;
    if s.len() % 2 == 1 { s[m] } else { (s[m - 1] + s[m]) / 2.0 }
}

fn collapse_ws(s: &str) -> String {
    let re = Regex::new(r"\s+").expect("valid regex");
    re.replace_all(s, " ").to_string()
}

pub fn runs_text(runs: &[Run]) -> String {
    collapse_ws(&runs.iter().map(|r| r.text.as_str()).collect::<String>()).trim().to_string()
}

pub fn total_chars(pages: &[TextPage]) -> usize {
    pages.iter().map(|p| p.items.iter().map(|i| i.str.trim().chars().count()).sum::<usize>()).sum()
}

/// A PDF with almost no text per page is probably scanned images.
pub fn is_scanned(pages: &[TextPage]) -> bool {
    !pages.is_empty() && total_chars(pages) < 25 * pages.len()
}

pub fn group_lines(page: &TextPage) -> Vec<Line> {
    let mut items: Vec<&TextItem> = page.items.iter().filter(|i| !i.str.is_empty()).collect();
    items.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal).then(a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal)));
    let mut rows: Vec<Vec<&TextItem>> = Vec::new();
    let mut row_y = f64::NEG_INFINITY;
    for it in items {
        let same_row = !rows.is_empty() && (it.y - row_y).abs() <= (it.font_size * 0.5).max(1.5);
        if same_row {
            rows.last_mut().expect("non-empty").push(it);
        } else {
            rows.push(vec![it]);
            row_y = it.y;
        }
    }
    let mut lines = Vec::new();
    for mut row in rows {
        row.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal));
        let mut runs: Vec<Run> = Vec::new();
        let mut text = String::new();
        let mut prev_right: Option<f64> = None;
        for it in &row {
            let mut s = it.str.clone();
            if let Some(pr) = prev_right {
                if it.x - pr > it.font_size * 0.2 && !text.ends_with(' ') && !s.starts_with(' ') {
                    s = format!(" {s}");
                }
            }
            text.push_str(&s);
            prev_right = Some(it.x + it.w);
            match runs.last_mut() {
                Some(last) if last.bold == it.bold && last.italic == it.italic => last.text.push_str(&s),
                _ => runs.push(Run { text: s, bold: it.bold, italic: it.italic }),
            }
        }
        let sizes: Vec<f64> = row.iter().map(|i| i.font_size).collect();
        let line_text = collapse_ws(&text).trim().to_string();
        let bold = runs.iter().all(|r| r.bold || r.text.trim().is_empty());
        if !line_text.is_empty() {
            lines.push(Line {
                y: row[0].y,
                x: row[0].x,
                right: prev_right.unwrap_or(row[0].x),
                font_size: median(&sizes),
                runs,
                text: line_text,
                bold,
            });
        }
    }
    lines
}

const EDGE: f64 = 0.08;

/// Drop page numbers and lines repeated in the top/bottom 8% of most pages (headers/footers).
pub fn remove_repeated_edges(pages: Vec<Vec<Line>>, heights: &[f64]) -> Vec<Vec<Line>> {
    let page_no = Regex::new(r"(?i)^\s*(page\s*)?\d+(\s*(of|/)\s*\d+)?\s*$").expect("valid regex");
    let digits = Regex::new(r"\d+").expect("valid regex");
    let is_edge = |l: &Line, h: f64| l.y < h * EDGE || l.y > h * (1.0 - EDGE);
    let key = |l: &Line| digits.replace_all(&l.text, "#").to_lowercase();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for (p, lines) in pages.iter().enumerate() {
        let mut seen = HashSet::new();
        for l in lines {
            if !is_edge(l, heights[p]) {
                continue;
            }
            let k = key(l);
            if seen.insert(k.clone()) {
                *counts.entry(k).or_insert(0) += 1;
            }
        }
    }
    let threshold = std::cmp::max(2, (pages.len() as f64 * 0.5).ceil() as usize);
    pages
        .into_iter()
        .enumerate()
        .map(|(p, lines)| {
            lines
                .into_iter()
                .filter(|l| {
                    if !is_edge(l, heights[p]) {
                        return true;
                    }
                    if page_no.is_match(&l.text) {
                        return false;
                    }
                    counts.get(&key(l)).copied().unwrap_or(0) < threshold
                })
                .collect()
        })
        .collect()
}

fn body_size(lines: &[&Line]) -> f64 {
    // keep insertion order so ties resolve like the JavaScript Map iteration
    let mut order: Vec<i64> = Vec::new();
    let mut weight: HashMap<i64, usize> = HashMap::new();
    for l in lines {
        let s = crate::js::js_round(l.font_size * 2.0) as i64; // half-point buckets
        if !weight.contains_key(&s) {
            order.push(s);
        }
        *weight.entry(s).or_insert(0) += l.text.chars().count();
    }
    let mut best = 24; // 12 pt in half points
    let mut best_w: i64 = -1;
    for s in order {
        let w = weight[&s] as i64;
        if w > best_w {
            best = s;
            best_w = w;
        }
    }
    best as f64 / 2.0
}

pub fn merge_runs(runs: &[Run]) -> Vec<Run> {
    let mut out: Vec<Run> = Vec::new();
    for r in runs {
        match out.last_mut() {
            Some(last) if last.bold == r.bold && last.italic == r.italic => last.text.push_str(&r.text),
            _ => out.push(r.clone()),
        }
    }
    out.into_iter()
        .map(|r| Run { text: collapse_ws(&r.text), ..r })
        .filter(|r| !r.text.is_empty())
        .collect()
}

struct Current {
    kind: BlockKind,
    runs: Vec<Run>,
    last: Line,
}

/// Turn positioned text into headings / paragraphs / list items.
pub fn reflow_pages(pages: &[TextPage], page_breaks: bool) -> Vec<Block> {
    let bullet = Regex::new(r"(?i)^(?:[•◦▪‣∙●○■□–-]|\*|\d{1,3}[.)]|[a-z][.)])\s+").expect("valid regex");
    let ends_sentence = Regex::new(r#"[.!?:]["”')]?$"#).expect("valid regex");
    let heading_punct = Regex::new(r"[.,;:]$").expect("valid regex");
    let hyphen_end = Regex::new(r"\p{L}-$").expect("valid regex");
    let lower_start = Regex::new(r"^\p{Ll}").expect("valid regex");

    let grouped: Vec<Vec<Line>> = pages.iter().map(group_lines).collect();
    let heights: Vec<f64> = pages.iter().map(|p| p.height).collect();
    let cleaned = remove_repeated_edges(grouped, &heights);
    let all: Vec<&Line> = cleaned.iter().flatten().collect();
    if all.is_empty() {
        return Vec::new();
    }
    let body = body_size(&all);
    let mut blocks: Vec<Block> = Vec::new();
    let mut cur: Option<Current> = None;

    fn flush(cur: &mut Option<Current>, blocks: &mut Vec<Block>) {
        if let Some(c) = cur.take() {
            blocks.push(Block::Text { kind: c.kind, runs: merge_runs(&c.runs) });
        }
    }

    for (pi, lines) in cleaned.iter().enumerate() {
        if page_breaks && pi > 0 {
            flush(&mut cur, &mut blocks);
            blocks.push(Block::PageBreak);
        }
        let mut gaps = Vec::new();
        for i in 1..lines.len() {
            let g = lines[i].y - lines[i - 1].y;
            if g > 0.0 {
                gaps.push(g);
            }
        }
        let m = median(&gaps);
        let normal_gap = if m != 0.0 { m } else { body * 1.3 };
        let page_right = lines.iter().map(|l| l.right).fold(0.0_f64, f64::max);

        for (li, line) in lines.iter().enumerate() {
            let ratio = line.font_size / body;
            let short = line.text.chars().count() < 160;
            let level = if !short {
                None
            } else if ratio >= 1.8 {
                Some(BlockKind::H1)
            } else if ratio >= 1.4 {
                Some(BlockKind::H2)
            } else if ratio >= 1.15 || (line.bold && line.text.chars().count() < 90 && !heading_punct.is_match(&line.text)) {
                Some(BlockKind::H3)
            } else {
                None
            };
            if let Some(level) = level {
                flush(&mut cur, &mut blocks);
                let continues = li > 0
                    && matches!(blocks.last(), Some(Block::Text { kind, .. }) if *kind == level)
                    && line.y - lines[li - 1].y <= normal_gap * 1.6;
                if continues {
                    if let Some(Block::Text { runs, .. }) = blocks.last_mut() {
                        runs.push(Run { text: " ".into(), bold: false, italic: false });
                        runs.extend(line.runs.iter().cloned());
                    }
                } else {
                    blocks.push(Block::Text { kind: level, runs: line.runs.clone() });
                }
                continue;
            }
            let is_bullet = bullet.is_match(&line.text);
            let prev = if li > 0 { Some(&lines[li - 1]) } else { None };
            let big_gap = match (prev, &cur) {
                (Some(p), _) => line.y - p.y > normal_gap * 1.45,
                (None, Some(c)) => ends_sentence.is_match(&c.last.text),
                (None, None) => true,
            };
            let prev_ended = match &cur {
                Some(c) => ends_sentence.is_match(&c.last.text) && c.last.right < page_right * 0.85,
                None => false,
            };
            if cur.is_none() || big_gap || is_bullet || prev_ended {
                flush(&mut cur, &mut blocks);
                let runs: Vec<Run> = if is_bullet {
                    line.runs
                        .iter()
                        .enumerate()
                        .map(|(i, r)| {
                            if i == 0 {
                                Run { text: bullet.replace(r.text.trim_start(), "").to_string(), ..r.clone() }
                            } else {
                                r.clone()
                            }
                        })
                        .collect()
                } else {
                    line.runs.clone()
                };
                cur = Some(Current { kind: if is_bullet { BlockKind::Li } else { BlockKind::P }, runs, last: line.clone() });
            } else if let Some(c) = cur.as_mut() {
                let joined_hyphen = match c.runs.last_mut() {
                    Some(last) if hyphen_end.is_match(&last.text) && lower_start.is_match(&line.text) => {
                        last.text.pop();
                        true
                    }
                    _ => false,
                };
                if !joined_hyphen {
                    c.runs.push(Run { text: " ".into(), bold: false, italic: false });
                }
                c.runs.extend(line.runs.iter().cloned());
                c.last = line.clone();
            }
        }
    }
    flush(&mut cur, &mut blocks);
    blocks
}

pub fn blocks_to_text(blocks: &[Block]) -> String {
    let mut parts = Vec::new();
    for b in blocks {
        if let Block::Text { kind, runs } = b {
            let t = runs_text(runs);
            parts.push(if *kind == BlockKind::Li { format!("• {t}") } else { t });
        }
    }
    parts.join("\n\n") + "\n"
}

/// Plain text (e.g. OCR output) → paragraph blocks.
pub fn text_to_blocks(text: &str) -> Vec<Block> {
    let para = Regex::new(r"\n\s*\n").expect("valid regex");
    let inner = Regex::new(r"\s*\n\s*").expect("valid regex");
    para.split(text)
        .map(|p| inner.replace_all(p, " ").trim().to_string())
        .filter(|p| !p.is_empty())
        .map(|t| Block::Text { kind: BlockKind::P, runs: vec![Run { text: t, bold: false, italic: false }] })
        .collect()
}

pub fn blocks_to_xhtml(blocks: &[Block]) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut in_list = false;
    for b in blocks {
        let Block::Text { kind, runs } = b else { continue };
        if *kind == BlockKind::Li && !in_list {
            out.push("<ul>".into());
            in_list = true;
        }
        if *kind != BlockKind::Li && in_list {
            out.push("</ul>".into());
            in_list = false;
        }
        let inner: String = runs
            .iter()
            .map(|r| {
                let mut t = escape_xml(&r.text);
                if r.italic {
                    t = format!("<em>{t}</em>");
                }
                if r.bold {
                    t = format!("<strong>{t}</strong>");
                }
                t
            })
            .collect();
        out.push(format!("<{0}>{1}</{0}>", kind.tag(), inner));
    }
    if in_list {
        out.push("</ul>".into());
    }
    out.join("\n")
}

pub struct Chapter {
    pub title: String,
    pub blocks: Vec<Block>,
}

/// New chapter at every h1; very long chapters are cut every 300 blocks.
pub fn split_chapters(blocks: &[Block], fallback_title: &str) -> Vec<Chapter> {
    let mut chapters: Vec<Chapter> = Vec::new();
    for b in blocks {
        let is_h1 = matches!(b, Block::Text { kind: BlockKind::H1, .. });
        let need_new = match chapters.last() {
            None => true,
            Some(c) => is_h1 || c.blocks.len() >= 300,
        };
        if need_new {
            let title = match (b, chapters.last()) {
                (Block::Text { kind: BlockKind::H1, runs }, _) => runs_text(runs),
                (_, Some(c)) => format!("{} (cont.)", c.title),
                (_, None) => fallback_title.to_string(),
            };
            chapters.push(Chapter { title, blocks: Vec::new() });
        }
        chapters.last_mut().expect("just pushed").blocks.push(b.clone());
    }
    chapters
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(s: &str, x: f64, y: f64, size: f64, bold: bool) -> TextItem {
        TextItem { str: s.into(), x, y, w: s.len() as f64 * size * 0.5, h: size, font_size: size, bold, italic: false }
    }

    #[test]
    fn headings_paragraphs_lists_and_page_numbers() {
        let page = |n: usize| TextPage {
            width: 612.0,
            height: 792.0,
            items: vec![
                item("Big Title", 72.0, 90.0, 24.0, true),
                item("This is a paragraph line that wraps", 72.0, 130.0, 12.0, false),
                item("onto the next line here.", 72.0, 145.0, 12.0, false),
                item("• First item", 72.0, 180.0, 12.0, false),
                item("• Second item", 72.0, 195.0, 12.0, false),
                item(&n.to_string(), 300.0, 770.0, 10.0, false),
            ],
        };
        let blocks = reflow_pages(&[page(1), page(2), page(3)], false);
        let text = blocks_to_text(&blocks);
        assert!(text.contains("Big Title"));
        assert!(text.contains("This is a paragraph line that wraps onto the next line here."));
        assert!(text.contains("• First item"));
        assert!(!text.lines().any(|l| l.trim() == "2"), "page numbers are removed");
        assert!(matches!(&blocks[0], Block::Text { kind: BlockKind::H1, .. }));
        let xhtml = blocks_to_xhtml(&blocks);
        assert!(xhtml.contains("<ul>") && xhtml.contains("<li>First item</li>"));
        assert!(split_chapters(&blocks, "Doc").len() >= 3);
    }

    #[test]
    fn scanned_detection_and_ocr_blocks() {
        assert!(is_scanned(&[TextPage { width: 1.0, height: 1.0, items: vec![] }]));
        let b = text_to_blocks("a\nb\n\nc");
        assert_eq!(b.len(), 2);
        assert_eq!(blocks_to_text(&b), "a b\n\nc\n");
    }

    #[test]
    fn hyphenated_words_join() {
        let p = TextPage {
            width: 612.0,
            height: 792.0,
            items: vec![item("A long sentence with a hyph-", 72.0, 300.0, 12.0, false), item("enated word in it.", 72.0, 315.0, 12.0, false)],
        };
        assert!(blocks_to_text(&reflow_pages(&[p], false)).contains("hyphenated word"));
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 38 passed; 0 failed`.

## Task 3.11 — core: `ffmpeg_parse`

**Goal.** Parse `ffprobe` JSON, FFmpeg's encoder list and frame rates, and turn FFmpeg error output into a friendly
sentence.

**File `src-tauri/crates/core/src/ffmpeg_parse.rs`**

```rust
//! Port of src/main/engines/ffmpegParse.ts (pure parsing of FFmpeg/FFprobe output).

use std::collections::HashMap;

use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct ProbeVideo {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub display_width: u32,
    pub display_height: u32,
    pub fps: f64,
    pub pix_fmt: String,
    pub rotation: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProbeAudio {
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u32,
    pub bit_rate: u64,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ProbeResult {
    pub duration_sec: f64,
    pub format_name: String,
    pub bit_rate: u64,
    pub video: Option<ProbeVideo>,
    pub audio: Option<ProbeAudio>,
    pub has_cover: bool,
    /// Format-level tags with lower-case keys.
    pub tags: HashMap<String, String>,
}

/// Encoder names from `ffmpeg -hide_banner -encoders` (the second column after the "------" line).
pub fn parse_encoder_list(text: &str) -> Vec<String> {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.iter().position(|l| l.trim().starts_with("------")).map(|i| i + 1).unwrap_or(0);
    lines[start..]
        .iter()
        .filter_map(|l| {
            let parts: Vec<&str> = l.split_whitespace().collect();
            if parts.len() >= 2 { Some(parts[1].to_string()) } else { None }
        })
        .collect()
}

/// "30000/1001" → 29.97; "25/1" → 25; bad input → 0.
pub fn parse_rate(r: Option<&str>) -> f64 {
    let Some(r) = r else { return 0.0 };
    let mut it = r.split('/');
    let a: f64 = it.next().and_then(|s| s.trim().parse().ok()).unwrap_or(f64::NAN);
    match it.next() {
        None => if a.is_finite() { a } else { 0.0 },
        Some(b) => {
            let b: f64 = b.trim().parse().unwrap_or(0.0);
            if b == 0.0 || !a.is_finite() { 0.0 } else { a / b }
        }
    }
}

fn num(v: &Value) -> f64 {
    match v {
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => s.trim().parse().unwrap_or(f64::NAN),
        _ => f64::NAN,
    }
}

fn str_of(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

pub fn parse_probe_json(json: &str) -> Result<ProbeResult, serde_json::Error> {
    let data: Value = serde_json::from_str(json)?;
    let empty = Vec::new();
    let streams = data["streams"].as_array().unwrap_or(&empty);
    let is_cover = |s: &Value| s["disposition"]["attached_pic"].as_i64() == Some(1);
    let v = streams.iter().find(|s| s["codec_type"] == "video" && !is_cover(s));
    let has_cover = streams.iter().any(|s| s["codec_type"] == "video" && is_cover(s));
    let a = streams.iter().find(|s| s["codec_type"] == "audio");

    let mut video = None;
    if let Some(v) = v {
        let (w, h) = (v["width"].as_u64().unwrap_or(0) as u32, v["height"].as_u64().unwrap_or(0) as u32);
        if w > 0 && h > 0 {
            let side_rot = v["side_data_list"]
                .as_array()
                .and_then(|l| l.iter().find(|d| !d["rotation"].is_null()))
                .map(|d| num(&d["rotation"]));
            let rot = side_rot.unwrap_or_else(|| num(&v["tags"]["rotate"]));
            let rot = if rot.is_finite() { rot } else { 0.0 };
            let swap = (rot.abs() % 180.0) == 90.0;
            let mut fps = parse_rate(v["avg_frame_rate"].as_str());
            if fps == 0.0 {
                fps = parse_rate(v["r_frame_rate"].as_str());
            }
            video = Some(ProbeVideo {
                codec: str_of(&v["codec_name"]),
                width: w,
                height: h,
                display_width: if swap { h } else { w },
                display_height: if swap { w } else { h },
                fps: if fps > 0.0 && fps < 1000.0 { fps } else { 0.0 },
                pix_fmt: str_of(&v["pix_fmt"]),
                rotation: rot,
            });
        }
    }
    let audio = a.map(|a| ProbeAudio {
        codec: str_of(&a["codec_name"]),
        sample_rate: num(&a["sample_rate"]).max(0.0) as u32,
        channels: a["channels"].as_u64().unwrap_or(0) as u32,
        bit_rate: { let b = num(&a["bit_rate"]); if b.is_finite() && b > 0.0 { b as u64 } else { 0 } },
    });
    let f = &data["format"];
    let mut durations = vec![num(&f["duration"])];
    durations.extend(streams.iter().map(|s| num(&s["duration"])));
    let duration_sec = durations.into_iter().find(|d| d.is_finite() && *d > 0.0).unwrap_or(0.0);
    let mut tags = HashMap::new();
    if let Some(obj) = f["tags"].as_object() {
        for (k, val) in obj {
            let text = match val {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            tags.insert(k.to_lowercase(), text);
        }
    }
    let br = num(&f["bit_rate"]);
    Ok(ProbeResult {
        duration_sec,
        format_name: str_of(&f["format_name"]),
        bit_rate: if br.is_finite() && br > 0.0 { br as u64 } else { 0 },
        video,
        audio,
        has_cover,
        tags,
    })
}

/// Map FFmpeg stderr to a plain-English message (PLAN.md Appendix C).
pub fn friendly_ffmpeg_error(stderr: &str) -> String {
    let s = stderr.to_lowercase();
    let msg = if s.contains("invalid data found when processing input") || s.contains("moov atom not found") {
        "This file looks damaged, or it is not really the format its name says."
    } else if s.contains("matches no streams") || s.contains("does not contain any stream") {
        "This file has no usable audio or video for this action."
    } else if s.contains("permission denied") {
        crate::error::MSG_CANT_ACCESS
    } else if s.contains("no space left") {
        crate::error::MSG_DISK_FULL
    } else if s.contains("unknown encoder") || s.contains("encoder not found") {
        "This FFmpeg build is missing an encoder needed for this format."
    } else if s.contains("not divisible by 2") {
        "The encoder needs an even width and height."
    } else {
        "FFmpeg could not process this file."
    };
    msg.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn encoders() {
        let text = "Encoders:\n V..... = Video\n ------\n V....D libx264              libx264 H.264\n A....D aac                  AAC\n";
        assert_eq!(parse_encoder_list(text), vec!["libx264", "aac"]);
        assert_eq!(parse_encoder_list("Encoders:\r\n ------\r\n A....D flac FLAC\r\n"), vec!["flac"]);
    }

    #[test]
    fn rates() {
        assert!((parse_rate(Some("30000/1001")) - 29.97).abs() < 0.01);
        assert_eq!(parse_rate(Some("25/1")), 25.0);
        assert_eq!(parse_rate(Some("0/0")), 0.0);
        assert_eq!(parse_rate(None), 0.0);
        assert_eq!(parse_rate(Some("abc")), 0.0);
    }

    #[test]
    fn probe() {
        let j = json!({
            "streams": [
                { "codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "avg_frame_rate": "30/1", "side_data_list": [{ "rotation": -90 }] },
                { "codec_type": "audio", "codec_name": "aac", "sample_rate": "48000", "channels": 2, "bit_rate": "128000" }
            ],
            "format": { "duration": "12.5", "format_name": "mov,mp4", "bit_rate": "2000000", "tags": { "Title": "Clip" } }
        });
        let p = parse_probe_json(&j.to_string()).unwrap();
        let v = p.video.unwrap();
        assert_eq!((v.display_width, v.display_height, v.rotation, v.fps), (1080, 1920, -90.0, 30.0));
        assert_eq!(p.audio.unwrap(), ProbeAudio { codec: "aac".into(), sample_rate: 48000, channels: 2, bit_rate: 128000 });
        assert_eq!(p.duration_sec, 12.5);
        assert_eq!(p.tags["title"], "Clip");

        let cover = json!({ "streams": [
            { "codec_type": "audio", "codec_name": "mp3", "sample_rate": "44100", "channels": 2 },
            { "codec_type": "video", "codec_name": "mjpeg", "width": 600, "height": 600, "disposition": { "attached_pic": 1 } }
        ], "format": { "duration": "200", "format_name": "mp3" } });
        let c = parse_probe_json(&cover.to_string()).unwrap();
        assert!(c.has_cover && c.video.is_none());

        let partial = parse_probe_json(&json!({ "streams": [{ "codec_type": "audio", "duration": "3.2" }] }).to_string()).unwrap();
        assert_eq!(partial.duration_sec, 3.2);
    }

    #[test]
    fn friendly() {
        assert!(friendly_ffmpeg_error("moov atom not found").contains("damaged"));
        assert!(friendly_ffmpeg_error("Permission denied").contains("can't read or write"));
        assert_eq!(friendly_ffmpeg_error("No space left on device"), "The disk is full.");
        assert_eq!(friendly_ffmpeg_error("something odd"), "FFmpeg could not process this file.");
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 42 passed; 0 failed`.

## Task 3.12 — core: `ffmpeg_args`

**Goal.** Build the FFmpeg argument lists for every conversion (`mod.rs`), every audio tool (`audio.rs`) and every video
tool (`video.rs`). They are pure functions; the tests compare whole argument lists with the ones the Electron build used.

**File `src-tauri/crates/core/src/ffmpeg_args/mod.rs`**

```rust
//! Port of src/main/engines/ffmpegArgs.ts: pure FFmpeg argument builders for conversions.
//! Arguments never include `-y`, `-progress` or the global flags; the runner adds those.

pub mod audio;
pub mod video;

use crate::ffmpeg_parse::ProbeResult;
use crate::js::js_num;
use crate::types::Fmt;

/// Build an argument vector from string slices.
pub fn args(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| s.to_string()).collect()
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct MediaFacts {
    pub duration_sec: f64,
    pub container: String,
    pub has_video: bool,
    pub has_audio: bool,
    pub has_cover: bool,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    /// Display size (after rotation).
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Quality {
    pub crf: f64,
    pub audio_kbps: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GifOptions {
    pub width: f64,
    pub fps: f64,
}

impl Default for GifOptions {
    fn default() -> Self {
        GifOptions { width: 480.0, fps: 12.0 }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioMode {
    Encode,
    Copy,
    None,
}

pub fn to_facts(p: &ProbeResult) -> MediaFacts {
    MediaFacts {
        duration_sec: p.duration_sec,
        container: p.format_name.clone(),
        has_video: p.video.is_some(),
        has_audio: p.audio.is_some(),
        has_cover: p.has_cover,
        video_codec: p.video.as_ref().map(|v| v.codec.clone()),
        audio_codec: p.audio.as_ref().map(|a| a.codec.clone()),
        width: p.video.as_ref().map(|v| v.display_width),
        height: p.video.as_ref().map(|v| v.display_height),
        fps: p.video.as_ref().map(|v| v.fps),
        sample_rate: p.audio.as_ref().map(|a| a.sample_rate),
        channels: p.audio.as_ref().map(|a| a.channels),
    }
}

/// Codecs each container can hold as-is (names as ffprobe reports them).
fn copy_rule(target: Fmt) -> Option<(&'static [&'static str], &'static [&'static str])> {
    match target {
        Fmt::Mp4 => Some((&["h264", "hevc", "av1", "mpeg4"], &["aac", "mp3", "alac", "opus", "ac3"])),
        Fmt::Mov => Some((&["h264", "hevc", "mpeg4", "prores", "mjpeg"], &["aac", "mp3", "alac", "pcm_s16le", "pcm_s24le"])),
        Fmt::Mkv => Some((
            &["h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "mpeg2video", "theora"],
            &["aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "dts", "alac", "pcm_s16le"],
        )),
        Fmt::Webm => Some((&["vp8", "vp9", "av1"], &["opus", "vorbis"])),
        Fmt::Avi => Some((&["mpeg4", "mjpeg", "msmpeg4v3"], &["mp3", "ac3", "pcm_s16le"])),
        Fmt::Wmv => Some((&["wmv1", "wmv2", "wmv3", "vc1"], &["wmav1", "wmav2", "wmapro"])),
        _ => None,
    }
}

/// True when streams can be copied into `target` without re-encoding (instant & lossless).
pub fn can_remux(f: &MediaFacts, target: Fmt) -> bool {
    let Some((video_ok, audio_ok)) = copy_rule(target) else { return false };
    if !f.has_video {
        return false;
    }
    match &f.video_codec {
        Some(c) if video_ok.contains(&c.as_str()) => {}
        _ => return false,
    }
    if f.has_audio {
        match &f.audio_codec {
            Some(c) if audio_ok.contains(&c.as_str()) => {}
            _ => return false,
        }
    }
    true
}

pub const EVEN_SCALE: &str = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

/// The -vf value: extra filters + even-size guard, or the GIF palette chain.
pub fn video_filter(target: Fmt, filters: &[String], gif: GifOptions) -> String {
    let mut parts: Vec<String> = filters.to_vec();
    if target == Fmt::Gif {
        let scale = if gif.width > 0.0 {
            format!("scale='min({},iw)':-1:flags=lanczos", js_num(gif.width))
        } else {
            "scale=iw:ih".to_string()
        };
        parts.push(format!("fps={}", js_num(gif.fps)));
        parts.push(scale);
        parts.push("split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle".to_string());
    } else {
        parts.push(EVEN_SCALE.to_string());
    }
    parts.join(",")
}

pub fn wmv_bitrate(f: &MediaFacts) -> &'static str {
    let px = f.width.unwrap_or(1280) as u64 * f.height.unwrap_or(720) as u64;
    if px <= 640 * 480 {
        "1500k"
    } else if px <= 1280 * 720 {
        "3000k"
    } else if px <= 1920 * 1080 {
        "6000k"
    } else {
        "12000k"
    }
}

fn video_audio_codec(target: Fmt, q: Quality) -> Vec<String> {
    match target {
        Fmt::Webm => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), format!("{}k", js_num(q.audio_kbps.min(160.0)))],
        Fmt::Avi => args(&["-c:a", "libmp3lame", "-q:a", "3"]),
        Fmt::Wmv => args(&["-c:a", "wmav2", "-b:a", "192k"]),
        _ => vec!["-c:a".into(), "aac".into(), "-b:a".into(), format!("{}k", js_num(q.audio_kbps))],
    }
}

/// Codec flags for a verified hardware H.264 encoder; quality roughly matches the CRF.
pub fn hw_h264_args(encoder: &str, crf: f64) -> Vec<String> {
    let c = js_num(crf);
    match encoder {
        "h264_videotoolbox" => {
            let q = (100.0 - crf * 1.6).clamp(30.0, 80.0);
            vec!["-c:v".into(), "h264_videotoolbox".into(), "-q:v".into(), js_num(q), "-allow_sw".into(), "1".into(), "-pix_fmt".into(), "yuv420p".into()]
        }
        "h264_nvenc" => vec!["-c:v".into(), "h264_nvenc".into(), "-preset".into(), "p5".into(), "-rc".into(), "vbr".into(), "-cq".into(), c, "-b:v".into(), "0".into(), "-pix_fmt".into(), "yuv420p".into()],
        "h264_qsv" => vec!["-c:v".into(), "h264_qsv".into(), "-global_quality".into(), c, "-pix_fmt".into(), "nv12".into()],
        "h264_amf" => vec!["-c:v".into(), "h264_amf".into(), "-rc".into(), "cqp".into(), "-qp_i".into(), c.clone(), "-qp_p".into(), c, "-pix_fmt".into(), "yuv420p".into()],
        _ => vec!["-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-crf".into(), c, "-pix_fmt".into(), "yuv420p".into()],
    }
}

/// Codec flags to encode INTO `target`. No -i, -vf, -map or output path. `hw` = a verified hardware H.264 encoder.
pub fn video_encode_args(target: Fmt, q: Quality, f: &MediaFacts, audio: AudioMode, hw: Option<&str>) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    match target {
        Fmt::Mp4 | Fmt::Mov | Fmt::Mkv => match hw {
            Some(enc) => a.extend(hw_h264_args(enc, q.crf)),
            None => a.extend(vec!["-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-crf".into(), js_num(q.crf), "-pix_fmt".into(), "yuv420p".into()]),
        },
        Fmt::Webm => a.extend(vec![
            "-c:v".into(), "libvpx-vp9".into(), "-crf".into(), js_num((q.crf + 9.0).min(63.0)), "-b:v".into(), "0".into(),
            "-row-mt".into(), "1".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-pix_fmt".into(), "yuv420p".into(),
        ]),
        Fmt::Avi => a.extend(args(&["-c:v", "mpeg4", "-q:v", "4", "-vtag", "xvid"])),
        Fmt::Wmv => a.extend(vec!["-c:v".into(), "wmv2".into(), "-b:v".into(), wmv_bitrate(f).into()]),
        Fmt::Gif => {}
        other => panic!("No video encoder for {}", other.as_str()),
    }
    if target == Fmt::Gif || audio == AudioMode::None || !f.has_audio {
        a.push("-an".into());
    } else if audio == AudioMode::Copy {
        a.extend(args(&["-c:a", "copy"]));
    } else {
        a.extend(video_audio_codec(target, q));
    }
    if target == Fmt::Mp4 || target == Fmt::Mov {
        a.extend(args(&["-movflags", "+faststart"]));
    }
    a
}

/// Codec flags for an audio-only output. Errors for a non-audio target.
pub fn audio_codec_args(target: Fmt, q: Quality, f: &MediaFacts) -> Result<Vec<String>, String> {
    let k = |v: f64| format!("{}k", js_num(v));
    let mut a: Vec<String> = match target {
        Fmt::Mp3 => args(&["-c:a", "libmp3lame", "-q:a", "2"]),
        Fmt::M4a => vec!["-c:a".into(), "aac".into(), "-b:a".into(), k(q.audio_kbps)],
        Fmt::Wav => args(&["-c:a", "pcm_s16le"]),
        Fmt::Flac => args(&["-c:a", "flac", "-compression_level", "5"]),
        Fmt::Ogg => args(&["-c:a", "libvorbis", "-q:a", "5"]),
        Fmt::Opus => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), k(q.audio_kbps.min(160.0)), "-ar".into(), "48000".into()],
        Fmt::Aiff => args(&["-c:a", "pcm_s16be"]),
        Fmt::Wma => vec!["-c:a".into(), "wmav2".into(), "-b:a".into(), k(q.audio_kbps.min(192.0))],
        other => return Err(format!("No audio encoder for {}", other.as_str())),
    };
    let sr = f.sample_rate.unwrap_or(0);
    if matches!(target, Fmt::Mp3 | Fmt::Wma | Fmt::M4a) && sr > 48000 {
        a.extend(args(&["-ar", "48000"]));
    }
    if matches!(target, Fmt::Mp3 | Fmt::Wma) && f.channels.unwrap_or(2) > 2 {
        a.extend(args(&["-ac", "2"]));
    }
    if target == Fmt::Mp3 {
        a.extend(args(&["-id3v2_version", "3"]));
    }
    if target == Fmt::M4a {
        a.extend(args(&["-movflags", "+faststart"]));
    }
    Ok(a)
}

pub fn audio_convert_args(input: &str, output: &str, f: &MediaFacts, target: Fmt, q: Quality, keep_cover: bool) -> Result<Vec<String>, String> {
    let cover = keep_cover && f.has_cover && matches!(target, Fmt::Mp3 | Fmt::M4a | Fmt::Flac);
    let mut a = args(&["-i", input, "-map", "0:a:0"]);
    if cover {
        a.extend(args(&["-map", "0:v:0", "-c:v", "copy", "-disposition:v:0", "attached_pic"]));
    } else {
        a.push("-vn".into());
    }
    a.extend(args(&["-map_metadata", "0"]));
    a.extend(audio_codec_args(target, q, f)?);
    a.push(output.into());
    Ok(a)
}

pub fn video_convert_args(input: &str, output: &str, f: &MediaFacts, target: Fmt, q: Quality, gif: GifOptions, hw: Option<&str>) -> Result<Vec<String>, String> {
    if target == Fmt::Mp3 {
        return audio_convert_args(input, output, f, Fmt::Mp3, q, false);
    }
    if can_remux(f, target) {
        let mut a = args(&["-i", input, "-map", "0:v:0", "-map", "0:a?", "-c", "copy"]);
        if target == Fmt::Mp4 || target == Fmt::Mov {
            a.extend(args(&["-movflags", "+faststart"]));
            if f.video_codec.as_deref() == Some("hevc") {
                a.extend(args(&["-tag:v", "hvc1"]));
            }
        }
        a.push(output.into());
        return Ok(a);
    }
    let mut a = args(&["-i", input, "-map", "0:v:0"]);
    if target != Fmt::Gif {
        a.extend(args(&["-map", "0:a:0?"]));
    }
    a.push("-vf".into());
    a.push(video_filter(target, &[], gif));
    a.extend(video_encode_args(target, q, f, AudioMode::Encode, hw));
    a.push(output.into());
    Ok(a)
}

#[cfg(test)]
pub(crate) fn test_facts() -> MediaFacts {
    MediaFacts {
        duration_sec: 4.0,
        container: "matroska,webm".into(),
        has_video: true,
        has_audio: true,
        has_cover: false,
        video_codec: Some("h264".into()),
        audio_codec: Some("aac".into()),
        width: Some(640),
        height: Some(360),
        fps: Some(30.0),
        sample_rate: Some(48000),
        channels: Some(2),
    }
}

/// Value following `flag` (first occurrence).
#[cfg(test)]
pub(crate) fn after<'a>(a: &'a [String], flag: &str) -> Option<&'a str> {
    let i = a.iter().position(|x| x == flag)?;
    a.get(i + 1).map(|s| s.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    const Q: Quality = Quality { crf: 23.0, audio_kbps: 192.0 };
    fn has(a: &[String], s: &str) -> bool {
        a.iter().any(|x| x == s)
    }

    #[test]
    fn remux_and_encode() {
        let f = test_facts();
        let a = video_convert_args("in.mkv", "out.mp4", &f, Fmt::Mp4, Q, GifOptions::default(), None).unwrap();
        assert_eq!(after(&a, "-c"), Some("copy"));
        assert!(has(&a, "+faststart") && !has(&a, "libx264"));
        let hevc = MediaFacts { video_codec: Some("hevc".into()), ..f.clone() };
        assert_eq!(after(&video_convert_args("i", "o", &hevc, Fmt::Mp4, Q, GifOptions::default(), None).unwrap(), "-tag:v"), Some("hvc1"));
        let vp9 = MediaFacts { video_codec: Some("vp9".into()), audio_codec: Some("opus".into()), ..f.clone() };
        let e = video_convert_args("in.webm", "out.mp4", &vp9, Fmt::Mp4, Q, GifOptions::default(), None).unwrap();
        assert!(has(&e, "libx264") && after(&e, "-vf").unwrap().ends_with(EVEN_SCALE));
        let w = video_convert_args("in.mp4", "out.webm", &f, Fmt::Webm, Q, GifOptions::default(), None).unwrap();
        assert!(has(&w, "libvpx-vp9") && has(&w, "libopus"));
        let g = video_convert_args("in.mp4", "out.gif", &f, Fmt::Gif, Q, GifOptions { width: 320.0, fps: 10.0 }, None).unwrap();
        assert!(after(&g, "-vf").unwrap().contains("palettegen") && has(&g, "-an") && !has(&g, "0:a:0?"));
        let m = video_convert_args("in.mp4", "out.mp3", &f, Fmt::Mp3, Q, GifOptions::default(), None).unwrap();
        assert!(has(&m, "libmp3lame") && has(&m, "-vn"));
        let silent = MediaFacts { has_audio: false, video_codec: Some("vp9".into()), ..f.clone() };
        assert!(has(&video_convert_args("i", "o", &silent, Fmt::Mp4, Q, GifOptions::default(), None).unwrap(), "-an"));
        let qsv = video_convert_args("in.webm", "out.mp4", &vp9, Fmt::Mp4, Q, GifOptions::default(), Some("h264_qsv")).unwrap();
        assert!(has(&qsv, "h264_qsv"));
    }

    #[test]
    fn audio_conversions() {
        let wav96 = MediaFacts { has_video: false, sample_rate: Some(96000), audio_codec: Some("pcm_s24le".into()), ..test_facts() };
        assert_eq!(after(&audio_convert_args("in.wav", "out.mp3", &wav96, Fmt::Mp3, Q, false).unwrap(), "-ar"), Some("48000"));
        let wav44 = MediaFacts { has_video: false, sample_rate: Some(44100), ..test_facts() };
        assert_eq!(after(&audio_convert_args("in.wav", "out.opus", &wav44, Fmt::Opus, Q, false).unwrap(), "-ar"), Some("48000"));
        let cover = MediaFacts { has_video: false, has_cover: true, ..test_facts() };
        assert!(has(&audio_convert_args("i", "o", &cover, Fmt::M4a, Q, true).unwrap(), "attached_pic"));
        assert!(has(&audio_convert_args("i", "o", &cover, Fmt::Wav, Q, true).unwrap(), "-vn"));
        let six = MediaFacts { channels: Some(6), has_video: false, ..test_facts() };
        assert_eq!(after(&audio_convert_args("i", "o", &six, Fmt::Mp3, Q, false).unwrap(), "-ac"), Some("2"));
        assert!(audio_convert_args("a", "b", &test_facts(), Fmt::Png, Q, false).is_err());
    }

    #[test]
    fn remux_rules_and_helpers() {
        let f = test_facts();
        assert!(!can_remux(&MediaFacts { has_video: false, ..f.clone() }, Fmt::Mp4));
        assert!(!can_remux(&MediaFacts { audio_codec: Some("vorbis".into()), ..f.clone() }, Fmt::Mp4));
        assert!(can_remux(&MediaFacts { has_audio: false, audio_codec: None, ..f.clone() }, Fmt::Mp4));
        assert!(!can_remux(&f, Fmt::Gif));
        assert_eq!(video_filter(Fmt::Mp4, &["crop=100:100:0:0".into()], GifOptions::default()), format!("crop=100:100:0:0,{EVEN_SCALE}"));
        assert_eq!(wmv_bitrate(&f), "1500k");
        assert_eq!(wmv_bitrate(&MediaFacts { width: Some(3840), height: Some(2160), ..f.clone() }), "12000k");
    }

    #[test]
    fn hardware() {
        assert!(has(&hw_h264_args("h264_videotoolbox", 23.0), "-q:v"));
        assert_eq!(hw_h264_args("h264_videotoolbox", 23.0)[3], "63.199999999999996"); // JavaScript prints the same
        let nv = hw_h264_args("h264_nvenc", 23.0);
        assert_eq!(after(&nv, "-cq"), Some("23"));
        assert_eq!(after(&hw_h264_args("h264_qsv", 23.0), "-global_quality"), Some("23"));
        assert!(has(&hw_h264_args("h264_amf", 23.0), "cqp"));
        assert!(has(&hw_h264_args("something-else", 23.0), "libx264"));
        let f = test_facts();
        let a = video_encode_args(Fmt::Mp4, Q, &f, AudioMode::Encode, Some("h264_nvenc"));
        assert!(has(&a, "h264_nvenc") && !has(&a, "libx264"));
        assert!(!has(&video_encode_args(Fmt::Webm, Q, &f, AudioMode::Encode, Some("h264_nvenc")), "h264_nvenc"));
        assert!(has(&video_encode_args(Fmt::Mp4, Q, &f, AudioMode::Encode, None), "libx264"));
    }
}
```

**File `src-tauri/crates/core/src/ffmpeg_args/audio.rs`**

```rust
//! Port of src/main/engines/audioArgs.ts: argument builders for the audio tools.

use serde::Deserialize;

use super::{args, audio_codec_args, MediaFacts, Quality};
use crate::js::{js_num, js_to_fixed};
use crate::options::{AudioBleepOptions, AudioCompressFormat, AudioNormalizeOptions, AudioTrimOptions, AudioVisualizeOptions, BleepSound, ChannelMode, VisualizeKind};
use crate::types::Fmt;

fn t3(s: f64) -> String {
    js_to_fixed(s, 3)
}

/// "keep" turns lossless inputs (wav/flac/aiff) into mp3; lossy inputs keep their format.
pub fn compress_out_fmt(input: Fmt, choice: AudioCompressFormat) -> Fmt {
    match choice {
        AudioCompressFormat::Mp3 => Fmt::Mp3,
        AudioCompressFormat::M4a => Fmt::M4a,
        AudioCompressFormat::Opus => Fmt::Opus,
        AudioCompressFormat::Keep => {
            if matches!(input, Fmt::Wav | Fmt::Flac | Fmt::Aiff) { Fmt::Mp3 } else { input }
        }
    }
}

pub fn compress_audio_args(input: &str, output: &str, bitrate_kbps: f64, mono: bool, out_fmt: Fmt) -> Result<Vec<String>, String> {
    let k = format!("{}k", js_num(bitrate_kbps));
    let codec: Vec<String> = match out_fmt {
        Fmt::Mp3 => vec!["-c:a".into(), "libmp3lame".into(), "-b:a".into(), k],
        Fmt::M4a => vec!["-c:a".into(), "aac".into(), "-b:a".into(), k, "-movflags".into(), "+faststart".into()],
        Fmt::Opus => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), k, "-ar".into(), "48000".into()],
        Fmt::Ogg => vec!["-c:a".into(), "libvorbis".into(), "-b:a".into(), k],
        Fmt::Wma => vec!["-c:a".into(), "wmav2".into(), "-b:a".into(), k],
        other => return Err(format!("Cannot compress to {}", other.as_str())),
    };
    let mut a = args(&["-i", input, "-map", "0:a:0", "-vn", "-map_metadata", "0"]);
    a.extend(codec);
    if mono {
        a.extend(args(&["-ac", "1"]));
    }
    a.push(output.into());
    Ok(a)
}

pub fn loudnorm_pass1(input: &str, o: &AudioNormalizeOptions) -> Vec<String> {
    let af = format!("loudnorm=I={}:TP={}:LRA=11:print_format=json", js_num(o.target), js_num(o.true_peak));
    vec!["-i".into(), input.into(), "-map".into(), "0:a:0".into(), "-af".into(), af, "-f".into(), "null".into(), "-".into()]
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct LoudnormStats {
    pub input_i: String,
    pub input_tp: String,
    pub input_lra: String,
    pub input_thresh: String,
    pub target_offset: String,
}

/// The JSON block loudnorm prints at the end of stderr.
pub fn parse_loudnorm(stderr: &str) -> Option<LoudnormStats> {
    let start = stderr.rfind('{')?;
    let end = stderr.rfind('}')?;
    if end < start {
        return None;
    }
    serde_json::from_str(&stderr[start..=end]).ok()
}

#[allow(clippy::too_many_arguments)]
pub fn loudnorm_pass2(input: &str, output: &str, f: &MediaFacts, o: &AudioNormalizeOptions, s: &LoudnormStats, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let af = format!(
        "loudnorm=I={}:TP={}:LRA=11:measured_I={}:measured_TP={}:measured_LRA={}:measured_thresh={}:offset={}:linear=true:print_format=summary",
        js_num(o.target), js_num(o.true_peak), s.input_i, s.input_tp, s.input_lra, s.input_thresh, s.target_offset
    );
    let sr = f.sample_rate.filter(|v| *v > 0).unwrap_or(48000);
    // -ar BEFORE codec args so a codec-required rate (e.g. Opus 48 kHz) wins. loudnorm upsamples to 192 kHz otherwise.
    let mut a = vec!["-i".into(), input.into(), "-map".into(), "0:a:0".into(), "-vn".into(), "-map_metadata".into(), "0".into(), "-af".into(), af, "-ar".into(), sr.to_string()];
    a.extend(audio_codec_args(fmt, q, f)?);
    a.push(output.into());
    Ok(a)
}

pub fn trim_audio_args(input: &str, output: &str, f: &MediaFacts, o: &AudioTrimOptions, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let end = if o.end_sec > 0.0 { o.end_sec.min(f.duration_sec) } else { f.duration_sec };
    let d = (end - o.start_sec).max(0.05);
    let mut fades = Vec::new();
    if o.fade_in_sec > 0.0 {
        fades.push(format!("afade=t=in:st=0:d={}", t3(o.fade_in_sec)));
    }
    if o.fade_out_sec > 0.0 {
        fades.push(format!("afade=t=out:st={}:d={}", t3((d - o.fade_out_sec).max(0.0)), t3(o.fade_out_sec)));
    }
    let mut a = vec!["-ss".into(), t3(o.start_sec), "-i".into(), input.into(), "-t".into(), t3(d)];
    a.extend(args(&["-map", "0:a:0", "-vn", "-map_metadata", "0"]));
    if fades.is_empty() {
        a.extend(args(&["-c:a", "copy"]));
    } else {
        a.push("-af".into());
        a.push(fades.join(","));
        a.extend(audio_codec_args(fmt, q, f)?);
    }
    a.push(output.into());
    Ok(a)
}

pub fn channels_args(input: &str, output: &str, f: &MediaFacts, mode: ChannelMode, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let channel: Vec<String> = match mode {
        ChannelMode::Mono => args(&["-ac", "1"]),
        ChannelMode::Stereo => args(&["-ac", "2"]),
        ChannelMode::Left => args(&["-af", "pan=mono|c0=c0"]),
        ChannelMode::Right => args(&["-af", "pan=mono|c0=c1"]),
        ChannelMode::Swap => args(&["-af", "pan=stereo|c0=c1|c1=c0"]),
    };
    // channel args AFTER codec args so they win over the codec's automatic "-ac 2"
    let mut a = args(&["-i", input, "-map", "0:a:0", "-vn", "-map_metadata", "0"]);
    a.extend(audio_codec_args(fmt, q, f)?);
    a.extend(channel);
    a.push(output.into());
    Ok(a)
}

pub fn visualize_args(input: &str, output: &str, o: &AudioVisualizeOptions) -> Vec<String> {
    let w = (crate::js::js_round(o.width / 2.0) * 2.0) as u32;
    let h = (crate::js::js_round(o.height / 2.0) * 2.0) as u32;
    let color = o.color.replacen('#', "0x", 1);
    let bg = o.background.replacen('#', "0x", 1);
    match o.kind {
        VisualizeKind::WaveformPng => vec![
            "-i".into(), input.into(), "-filter_complex".into(),
            format!("[0:a:0]aformat=channel_layouts=mono,showwavespic=s={w}x{h}:colors={color}[fg];color=c={bg}:s={w}x{h}[bg];[bg][fg]overlay=format=auto"),
            "-frames:v".into(), "1".into(), output.into(),
        ],
        VisualizeKind::SpectrogramPng => vec!["-i".into(), input.into(), "-lavfi".into(), format!("showspectrumpic=s={w}x{h}:legend=1"), output.into()],
        VisualizeKind::WaveformMp4 => {
            let graph = format!(
                "[0:a:0]showwaves=s={w}x{h}:mode=cline:rate=30:colors={color},format=rgba[fg];color=c={bg}:s={w}x{h}:r=30[bg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[v]"
            );
            let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), graph];
            a.extend(args(&["-map", "[v]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", output]));
            a
        }
    }
}

pub fn bleep_args(input: &str, output: &str, f: &MediaFacts, o: &AudioBleepOptions, fmt: Fmt, q: Quality) -> Result<Vec<String>, String> {
    let expr = o.ranges.iter().map(|r| format!("between(t,{},{})", t3(r.start_sec), t3(r.end_sec))).collect::<Vec<_>>().join("+");
    let layout = if f.channels.unwrap_or(2) >= 2 { "stereo" } else { "mono" };
    let sr = f.sample_rate.filter(|v| *v > 0).unwrap_or(44100);
    let graph = if o.sound == BleepSound::Silence {
        format!("[0:a:0]volume=volume=0:enable='{expr}'[out]")
    } else {
        format!(
            "[0:a:0]aformat=channel_layouts={layout},volume=volume=0:enable='{expr}'[m];sine=frequency={}:sample_rate={sr},aformat=channel_layouts={layout},volume=volume=0.35,volume=volume=0:enable='not({expr})'[t];[m][t]amix=inputs=2:duration=first:normalize=0[out]",
            js_num(o.frequency)
        )
    };
    let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), graph, "-map".into(), "[out]".into(), "-map_metadata".into(), "0".into()];
    a.extend(audio_codec_args(fmt, q, f)?);
    a.push(output.into());
    Ok(a)
}

/// `tags` in the UI's order.
#[allow(clippy::too_many_arguments)]
pub fn audio_metadata_args(input: &str, output: &str, remove_all: bool, remove_cover: bool, tags: &[(String, String)], fmt: Fmt, has_cover: bool, cover_jpg: Option<&str>) -> Vec<String> {
    let cover_ok = matches!(fmt, Fmt::Mp3 | Fmt::M4a | Fmt::Flac);
    let mut a = args(&["-i", input]);
    if let (Some(c), true) = (cover_jpg, cover_ok) {
        a.extend(args(&["-i", c]));
    }
    a.extend(args(&["-map", "0:a:0"]));
    if cover_jpg.is_some() && cover_ok {
        a.extend(args(&["-map", "1:0", "-c:v", "copy", "-disposition:v:0", "attached_pic"]));
    } else if has_cover && cover_ok && !remove_cover && !remove_all {
        a.extend(args(&["-map", "0:v:0", "-c:v", "copy", "-disposition:v:0", "attached_pic"]));
    }
    a.extend(args(&["-c:a", "copy", "-map_metadata", if remove_all { "-1" } else { "0" }]));
    for (k, v) in tags {
        a.push("-metadata".into());
        a.push(format!("{k}={v}"));
    }
    if fmt == Fmt::Mp3 {
        a.extend(args(&["-id3v2_version", "3", "-write_id3v1", "1"]));
    }
    if fmt == Fmt::M4a {
        a.extend(args(&["-movflags", "+faststart"]));
    }
    a.push(output.into());
    a
}

pub fn join_audio_args(inputs: &[String], output: &str, fmt: Fmt, q: Quality, f: &MediaFacts) -> Result<Vec<String>, String> {
    let mut a: Vec<String> = Vec::new();
    for p in inputs {
        a.push("-i".into());
        a.push(p.clone());
    }
    let pre = (0..inputs.len()).map(|i| format!("[{i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]")).collect::<Vec<_>>().join(";");
    let labels: String = (0..inputs.len()).map(|i| format!("[a{i}]")).collect();
    let cat = format!("{labels}concat=n={}:v=0:a=1[out]", inputs.len());
    a.push("-filter_complex".into());
    a.push(format!("{pre};{cat}"));
    a.extend(args(&["-map", "[out]"]));
    let joined = MediaFacts { sample_rate: Some(48000), channels: Some(2), ..f.clone() };
    a.extend(audio_codec_args(fmt, q, &joined)?);
    a.push(output.into());
    Ok(a)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg_args::test_facts;
    use crate::options::TimeRangeSec;

    fn facts() -> MediaFacts {
        MediaFacts { container: "wav".into(), has_video: false, video_codec: None, audio_codec: Some("pcm_s16le".into()), sample_rate: Some(44100), width: None, height: None, fps: None, ..test_facts() }
    }
    const Q: Quality = Quality { crf: 23.0, audio_kbps: 192.0 };
    fn last_value<'a>(a: &'a [String], flag: &str) -> Option<&'a str> {
        let i = a.iter().rposition(|x| x == flag)?;
        a.get(i + 1).map(|s| s.as_str())
    }
    fn has(a: &[String], s: &str) -> bool {
        a.iter().any(|x| x == s)
    }

    #[test]
    fn compress() {
        assert_eq!(compress_out_fmt(Fmt::Wav, AudioCompressFormat::Keep), Fmt::Mp3);
        assert_eq!(compress_out_fmt(Fmt::Flac, AudioCompressFormat::Keep), Fmt::Mp3);
        assert_eq!(compress_out_fmt(Fmt::Ogg, AudioCompressFormat::Keep), Fmt::Ogg);
        assert_eq!(compress_out_fmt(Fmt::Wav, AudioCompressFormat::Opus), Fmt::Opus);
        let a = compress_audio_args("i.wav", "o.mp3", 128.0, true, Fmt::Mp3).unwrap();
        assert!(has(&a, "libmp3lame"));
        assert_eq!(last_value(&a, "-b:a"), Some("128k"));
        assert_eq!(last_value(&a, "-ac"), Some("1"));
        assert!(compress_audio_args("i", "o", 128.0, false, Fmt::Wav).is_err());
    }

    #[test]
    fn loudnorm() {
        let o = AudioNormalizeOptions { target: -16.0, true_peak: -1.5 };
        assert!(loudnorm_pass1("i.wav", &o).join(" ").contains("print_format=json"));
        let s = parse_loudnorm("junk\n{\n\"input_i\" : \"-23.0\", \"input_tp\":\"-5.0\",\"input_lra\":\"3.0\",\"input_thresh\":\"-33.0\",\"target_offset\":\"0.1\"\n}").unwrap();
        assert_eq!(s.input_i, "-23.0");
        assert!(parse_loudnorm("no json here").is_none());
        let stats = LoudnormStats { input_i: "-23".into(), input_tp: "-5".into(), input_lra: "3".into(), input_thresh: "-33".into(), target_offset: "0.1".into() };
        let a = loudnorm_pass2("i.wav", "o.opus", &facts(), &o, &stats, Fmt::Opus, Q).unwrap();
        assert_eq!(last_value(&a, "-ar"), Some("48000"));
        assert!(a.join(" ").contains("measured_I=-23"));
        assert!(a.join(" ").contains("loudnorm=I=-16:TP=-1.5"));
    }

    #[test]
    fn trim_channels_bleep_visualize_metadata_join() {
        let trim = |fade_out: f64| AudioTrimOptions { start_sec: 0.0, end_sec: 2.0, fade_in_sec: 0.0, fade_out_sec: fade_out };
        assert!(has(&trim_audio_args("i", "o", &facts(), &trim(0.0), Fmt::Wav, Q).unwrap(), "copy"));
        let faded = trim_audio_args("i", "o", &facts(), &trim(1.0), Fmt::Wav, Q).unwrap();
        assert!(faded.join(" ").contains("afade=t=out:st=1.000") && !has(&faded, "copy"));
        let six = MediaFacts { channels: Some(6), ..facts() };
        assert_eq!(last_value(&channels_args("i", "o", &six, ChannelMode::Mono, Fmt::Mp3, Q).unwrap(), "-ac"), Some("1"));
        assert!(channels_args("i", "o", &facts(), ChannelMode::Swap, Fmt::Wav, Q).unwrap().join(" ").contains("pan=stereo|c0=c1|c1=c0"));
        let bleep = AudioBleepOptions {
            ranges: vec![TimeRangeSec { start_sec: 1.0, end_sec: 2.0 }, TimeRangeSec { start_sec: 3.0, end_sec: 3.5 }],
            sound: BleepSound::Beep,
            frequency: 1000.0,
        };
        let b = bleep_args("i", "o", &facts(), &bleep, Fmt::Wav, Q).unwrap().join(" ");
        assert!(b.contains("between(t,1.000,2.000)+between(t,3.000,3.500)") && b.contains("amix"));
        let silence = AudioBleepOptions { sound: BleepSound::Silence, ..bleep };
        assert!(!bleep_args("i", "o", &facts(), &silence, Fmt::Wav, Q).unwrap().join(" ").contains("amix"));
        let v = |kind| AudioVisualizeOptions { kind, width: 1920.0, height: 480.0, color: "#FF5A1F".into(), background: "#FFFFFF".into() };
        assert!(visualize_args("i", "o.png", &v(VisualizeKind::WaveformPng)).join(" ").contains("showwavespic=s=1920x480:colors=0xFF5A1F"));
        assert!(visualize_args("i", "o.png", &v(VisualizeKind::SpectrogramPng)).join(" ").contains("showspectrumpic"));
        assert!(has(&visualize_args("i", "o.mp4", &v(VisualizeKind::WaveformMp4)), "libx264"));
        let tags = vec![("title".to_string(), "Song".to_string())];
        assert!(has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Mp3, true, None), "attached_pic"));
        assert!(!has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Wav, true, None), "attached_pic"));
        assert!(!has(&audio_metadata_args("i", "o", true, false, &tags, Fmt::Mp3, true, None), "attached_pic"));
        assert!(has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Mp3, false, Some("c.jpg")), "1:0"));
        assert!(has(&audio_metadata_args("i", "o", false, false, &tags, Fmt::Mp3, false, None), "title=Song"));
        let j = join_audio_args(&["a.wav".into(), "b.mp3".into()], "o.mp3", Fmt::Mp3, Q, &facts()).unwrap();
        assert_eq!(j.iter().filter(|x| *x == "-i").count(), 2);
        assert!(j.join(" ").contains("concat=n=2:v=0:a=1[out]"));
    }
}
```

**File `src-tauri/crates/core/src/ffmpeg_args/video.rs`**

```rust
//! Port of src/main/engines/videoArgs.ts: argument builders for the video tools.

use super::{args, hw_h264_args, video_encode_args, video_filter, AudioMode, GifOptions, MediaFacts, Quality, EVEN_SCALE};
use crate::geometry::PixelRect;
use crate::js::{js_num, js_round, js_to_fixed};
use crate::options::{CompressPreset, RedactStyle, VideoCodec, VideoCompressOptions};
use crate::types::Fmt;

fn t3(s: f64) -> String {
    js_to_fixed(s, 3)
}

fn faststart(fmt: Fmt) -> Vec<String> {
    if fmt == Fmt::Mp4 || fmt == Fmt::Mov { args(&["-movflags", "+faststart"]) } else { vec![] }
}

fn audio_map(fmt: Fmt) -> Vec<String> {
    if fmt == Fmt::Gif { vec![] } else { args(&["-map", "0:a:0?"]) }
}

/// GIF options used by the tools: original width, the source frame rate.
fn tool_gif(f: &MediaFacts) -> GifOptions {
    let fps = f.fps.filter(|v| *v > 0.0).unwrap_or(12.0);
    GifOptions { width: 0.0, fps: js_round(fps) }
}

pub fn preset_crf(p: CompressPreset) -> f64 {
    match p {
        CompressPreset::High => 20.0,
        CompressPreset::Balanced => 24.0,
        CompressPreset::Small => 28.0,
    }
}

/// New size with the SHORT side capped at max_short (even numbers); None = unchanged.
pub fn cap_size(w: u32, h: u32, max_short: f64) -> Option<(u32, u32)> {
    let short = w.min(h) as f64;
    if max_short <= 0.0 || short <= max_short {
        return None;
    }
    let k = max_short / short;
    let even = |n: u32| (js_round(n as f64 * k / 2.0) * 2.0).max(2.0) as u32;
    Some((even(w), even(h)))
}

/// kbit/s for the video stream so that the whole file is ≈ target_mb.
pub fn target_video_kbps(target_mb: f64, duration_sec: f64, audio_kbps: f64) -> f64 {
    ((target_mb * 8192.0) / duration_sec.max(1.0) - audio_kbps).floor()
}

/// One or two FFmpeg runs (two = target-size two-pass). `out_webm` = output is WebM (else MP4).
pub fn compress_plan(input: &str, output: &str, f: &MediaFacts, o: &VideoCompressOptions, out_webm: bool, pass_log: &str, hw: Option<&str>) -> Vec<Vec<String>> {
    let size = match (f.width, f.height) {
        (Some(w), Some(h)) => cap_size(w, h, o.max_height),
        _ => None,
    };
    let mut vf: Vec<String> = Vec::new();
    if let Some((w, h)) = size {
        vf.push(format!("scale={w}:{h}"));
    }
    vf.push(EVEN_SCALE.to_string());
    let base = vec!["-i".to_string(), input.into(), "-map".into(), "0:v:0".into(), "-vf".into(), vf.join(",")];
    let audio: Vec<String> = if f.has_audio {
        let mut a = args(&["-map", "0:a:0"]);
        a.extend(if out_webm { args(&["-c:a", "libopus", "-b:a", "96k"]) } else { args(&["-c:a", "aac", "-b:a", "128k"]) });
        a
    } else {
        args(&["-an"])
    };
    let tail = if out_webm { vec![] } else { args(&["-movflags", "+faststart"]) };
    if o.target_size_mb > 0.0 {
        let audio_kbps = if f.has_audio { if out_webm { 96.0 } else { 128.0 } } else { 0.0 };
        let kbps = format!("{}k", js_num(target_video_kbps(o.target_size_mb, f.duration_sec, audio_kbps)));
        let v: Vec<String> = if out_webm {
            vec!["-c:v".into(), "libvpx-vp9".into(), "-b:v".into(), kbps, "-row-mt".into(), "1".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-pix_fmt".into(), "yuv420p".into()]
        } else {
            vec!["-c:v".into(), "libx264".into(), "-preset".into(), "medium".into(), "-b:v".into(), kbps, "-pix_fmt".into(), "yuv420p".into()]
        };
        let mut pass1 = base.clone();
        pass1.extend(v.clone());
        pass1.extend(vec!["-pass".into(), "1".into(), "-passlogfile".into(), pass_log.into()]);
        pass1.extend(args(&["-an", "-f", "null", "-"]));
        let mut pass2 = base;
        pass2.extend(v);
        pass2.extend(vec!["-pass".into(), "2".into(), "-passlogfile".into(), pass_log.into()]);
        pass2.extend(audio);
        pass2.extend(tail);
        pass2.push(output.into());
        return vec![pass1, pass2];
    }
    let h265 = !out_webm && o.codec == VideoCodec::H265;
    let crf = preset_crf(o.preset);
    let v: Vec<String> = if out_webm {
        vec!["-c:v".into(), "libvpx-vp9".into(), "-crf".into(), js_num(crf + 9.0), "-b:v".into(), "0".into(), "-row-mt".into(), "1".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-pix_fmt".into(), "yuv420p".into()]
    } else if let (Some(enc), false) = (hw, h265) {
        hw_h264_args(enc, crf) // hardware only in quality mode (no classic two-pass)
    } else {
        let mut v = vec!["-c:v".into(), if h265 { "libx265" } else { "libx264" }.into(), "-preset".into(), "medium".into(), "-crf".into(), js_num(crf + if h265 { 4.0 } else { 0.0 }), "-pix_fmt".into(), "yuv420p".into()];
        if h265 {
            v.extend(args(&["-tag:v", "hvc1"]));
        }
        v
    };
    let mut one = base;
    one.extend(v);
    one.extend(audio);
    one.extend(tail);
    one.push(output.into());
    vec![one]
}

#[allow(clippy::too_many_arguments)]
pub fn trim_args(input: &str, output: &str, f: &MediaFacts, start: f64, end: f64, precise: bool, fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let dur = (end - start).max(0.05);
    if !precise && fmt != Fmt::Gif {
        let mut a = vec!["-ss".into(), t3(start), "-i".into(), input.into(), "-t".into(), t3(dur)];
        a.extend(args(&["-map", "0:v?", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero"]));
        a.extend(faststart(fmt));
        a.push(output.into());
        return a;
    }
    let mut a = vec!["-ss".into(), t3(start), "-i".into(), input.into(), "-t".into(), t3(dur), "-map".into(), "0:v:0".into()];
    a.extend(audio_map(fmt));
    a.push("-vf".into());
    a.push(video_filter(fmt, &[], tool_gif(f)));
    a.extend(video_encode_args(fmt, q, f, AudioMode::Encode, hw));
    a.push(output.into());
    a
}

pub fn crop_args(input: &str, output: &str, f: &MediaFacts, r: PixelRect, fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let mut a = args(&["-i", input, "-map", "0:v:0"]);
    a.extend(audio_map(fmt));
    a.push("-vf".into());
    a.push(video_filter(fmt, &[format!("crop={}:{}:{}:{}", r.w, r.h, r.x, r.y)], tool_gif(f)));
    a.extend(video_encode_args(fmt, q, f, AudioMode::Copy, hw));
    a.push(output.into());
    a
}

pub fn atempo_chain(factor: f64) -> String {
    let mut parts = Vec::new();
    let mut r = factor;
    while r > 2.0 {
        parts.push("atempo=2.0".to_string());
        r /= 2.0;
    }
    while r < 0.5 {
        parts.push("atempo=0.5".to_string());
        r /= 0.5;
    }
    parts.push(format!("atempo={}", js_to_fixed(r, 4)));
    parts.join(",")
}

#[allow(clippy::too_many_arguments)]
pub fn speed_args(input: &str, output: &str, f: &MediaFacts, factor: f64, keep_audio: bool, fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let vf = video_filter(fmt, &[format!("setpts=PTS/{}", js_to_fixed(factor, 4))], tool_gif(f));
    if !(keep_audio && f.has_audio && fmt != Fmt::Gif) {
        let mut a = vec!["-i".into(), input.into(), "-map".into(), "0:v:0".into(), "-vf".into(), vf];
        a.extend(video_encode_args(fmt, q, f, AudioMode::None, hw));
        a.push(output.into());
        return a;
    }
    let graph = format!("[0:v:0]{vf}[v];[0:a:0]{}[a]", atempo_chain(factor));
    let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), graph, "-map".into(), "[v]".into(), "-map".into(), "[a]".into()];
    a.extend(video_encode_args(fmt, q, f, AudioMode::Encode, hw));
    a.push(output.into());
    a
}

pub fn mute_args(input: &str, output: &str, fmt: Fmt) -> Vec<String> {
    let mut a = args(&["-i", input, "-map", "0:v", "-c", "copy", "-an"]);
    a.extend(faststart(fmt));
    a.push(output.into());
    a
}

pub fn snapshot_args(input: &str, output: &str, t: f64, jpg: bool) -> Vec<String> {
    let mut a = vec!["-ss".into(), t3(t.max(0.0)), "-i".into(), input.into(), "-frames:v".into(), "1".into()];
    if jpg {
        a.extend(args(&["-q:v", "2"]));
    }
    a.push(output.into());
    a
}

pub fn frames_every_args(input: &str, pattern: &str, every_sec: f64, jpg: bool) -> Vec<String> {
    let mut a = vec!["-i".into(), input.into(), "-vf".into(), format!("fps=1/{}", js_num(every_sec.max(0.1)))];
    if jpg {
        a.extend(args(&["-q:v", "2"]));
    }
    a.push(pattern.into());
    a
}

#[derive(Debug, Clone, PartialEq)]
pub struct PixelRegion {
    pub rect: PixelRect,
    pub style: RedactStyle,
    pub start_sec: Option<f64>,
    pub end_sec: Option<f64>,
}

/// filter_complex graph applying every region in order; returns (graph, final label).
pub fn redact_graph(regions: &[PixelRegion]) -> (String, String) {
    let mut parts: Vec<String> = Vec::new();
    let mut cur = "0:v:0".to_string();
    for (i, r) in regions.iter().enumerate() {
        let en = match (r.start_sec, r.end_sec) {
            (Some(s), Some(e)) => format!(":enable='between(t,{},{})'", t3(s), t3(e)),
            _ => String::new(),
        };
        let PixelRect { x, y, w, h } = r.rect;
        let out = format!("v{i}");
        if r.style == RedactStyle::Black {
            parts.push(format!("[{cur}]drawbox=x={x}:y={y}:w={w}:h={h}:color=black@1:t=fill{en}[{out}]"));
        } else {
            let fx = if r.style == RedactStyle::Blur {
                format!("gblur=sigma={}", js_num(js_round(w.min(h) as f64 / 6.0).max(8.0)))
            } else {
                let sw = js_round(w as f64 / 12.0).max(1.0);
                let sh = js_round(h as f64 / 12.0).max(1.0);
                format!("scale={}:{}:flags=neighbor,scale={w}:{h}:flags=neighbor", js_num(sw), js_num(sh))
            };
            parts.push(format!("[{cur}]split=2[b{i}][c{i}]"));
            parts.push(format!("[c{i}]crop={w}:{h}:{x}:{y},{fx}[r{i}]"));
            parts.push(format!("[b{i}][r{i}]overlay={x}:{y}{en}[{out}]"));
        }
        cur = out;
    }
    (parts.join(";"), cur)
}

pub fn redact_args(input: &str, output: &str, f: &MediaFacts, regions: &[PixelRegion], fmt: Fmt, q: Quality, hw: Option<&str>) -> Vec<String> {
    let (graph, out) = redact_graph(regions);
    let tail = video_filter(fmt, &[], tool_gif(f));
    let mut a = vec!["-i".into(), input.into(), "-filter_complex".into(), format!("{graph};[{out}]{tail}[vout]"), "-map".into(), "[vout]".into()];
    a.extend(audio_map(fmt));
    a.extend(video_encode_args(fmt, q, f, AudioMode::Copy, hw));
    a.extend(args(&["-map_metadata", "-1"]));
    a.push(output.into());
    a
}

/// `tags` in the UI's order. Values are written as `key=value`.
pub fn metadata_args(input: &str, output: &str, remove_all: bool, tags: &[(String, String)], fmt: Fmt) -> Vec<String> {
    let mut a = args(&["-i", input, "-map", "0", "-c", "copy", "-map_metadata", if remove_all { "-1" } else { "0" }]);
    if remove_all {
        a.extend(args(&["-map_chapters", "-1", "-fflags", "+bitexact"]));
    }
    for (k, v) in tags {
        a.push("-metadata".into());
        a.push(format!("{k}={v}"));
    }
    if fmt == Fmt::Mp4 || fmt == Fmt::Mov {
        a.push("-movflags".into());
        a.push(if tags.is_empty() { "+faststart" } else { "+faststart+use_metadata_tags" }.into());
    }
    a.push(output.into());
    a
}

/// Some containers reject data streams with `-map 0`; retry with video, audio and subtitle streams only.
pub fn narrow_maps(a: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < a.len() {
        if a[i] == "-map" && a.get(i + 1).map(|s| s.as_str()) == Some("0") {
            out.extend(args(&["-map", "0:v?", "-map", "0:a?", "-map", "0:s?"]));
            i += 2;
        } else {
            out.push(a[i].clone());
            i += 1;
        }
    }
    out
}

pub fn can_concat_copy(list: &[MediaFacts]) -> bool {
    let a = &list[0];
    list.iter().all(|f| {
        f.video_codec == a.video_codec
            && f.width == a.width
            && f.height == a.height
            && (f.fps.unwrap_or(0.0) - a.fps.unwrap_or(0.0)).abs() < 0.01
            && f.has_audio == a.has_audio
            && f.audio_codec == a.audio_codec
            && f.sample_rate == a.sample_rate
            && f.channels == a.channels
    })
}

/// Contents of an FFmpeg concat-demuxer list file.
pub fn concat_list_file(paths: &[String]) -> String {
    paths
        .iter()
        .map(|p| format!("file '{}'", p.replace('\\', "/").replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

pub fn concat_args(list_file: &str, output: &str, fmt: Fmt) -> Vec<String> {
    let mut a = args(&["-f", "concat", "-safe", "0", "-i", list_file, "-map", "0:v?", "-map", "0:a?", "-c", "copy"]);
    a.extend(faststart(fmt));
    a.push(output.into());
    a
}

/// Re-encode a clip to a common size/fps/audio layout so the concat demuxer can copy it.
pub fn normalize_clip_args(input: &str, output: &str, f: &MediaFacts, width: u32, height: u32, fps: f64) -> Vec<String> {
    let vf = format!(
        "scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={}",
        js_num(fps)
    );
    let mut a = args(&["-i", input]);
    if !f.has_audio {
        a.extend(vec!["-f".into(), "lavfi".into(), "-t".into(), t3(f.duration_sec), "-i".into(), "anullsrc=channel_layout=stereo:sample_rate=48000".into()]);
    }
    a.extend(args(&["-map", "0:v:0", "-map", if f.has_audio { "0:a:0" } else { "1:a:0" }, "-vf"]));
    a.push(vf);
    a.extend(args(&["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", output]));
    a
}

#[cfg(test)]
mod tests {
    use super::super::{after, test_facts};
    use super::*;
    use crate::options::{SplitMode, VideoSplitOptions};
    use crate::split::{split_segments, Segment};

    fn facts() -> MediaFacts {
        MediaFacts { duration_sec: 60.0, container: "mov,mp4".into(), width: Some(1920), height: Some(1080), ..test_facts() }
    }
    const Q: Quality = Quality { crf: 20.0, audio_kbps: 192.0 };
    fn compress(preset: CompressPreset, max_height: f64, codec: VideoCodec, target: f64) -> VideoCompressOptions {
        VideoCompressOptions { preset, max_height, codec, target_size_mb: target }
    }
    fn has(a: &[String], s: &str) -> bool {
        a.iter().any(|x| x == s)
    }

    #[test]
    fn caps_and_targets() {
        assert_eq!(cap_size(1920, 1080, 720.0), Some((1280, 720)));
        assert_eq!(cap_size(1080, 1920, 720.0), Some((720, 1280)));
        assert_eq!(cap_size(640, 360, 720.0), None);
        assert_eq!(cap_size(1920, 1080, 0.0), None);
        assert_eq!(target_video_kbps(10.0, 60.0, 128.0), 1237.0);
    }

    #[test]
    fn plans() {
        let one = compress_plan("in.mp4", "out.mp4", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 0.0), false, "log", None);
        assert_eq!(one.len(), 1);
        assert!(has(&one[0], "libx264"));
        assert_eq!(after(&one[0], "-crf"), Some("24"));
        let two = compress_plan("in.mp4", "out.mp4", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 10.0), false, "log", None);
        assert_eq!(two.len(), 2);
        assert_eq!(after(&two[0], "-pass"), Some("1"));
        assert_eq!(two[0].last().unwrap(), "-");
        assert_eq!(two[1].last().unwrap(), "out.mp4");
        assert!(has(&compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H265, 0.0), false, "l", None)[0], "libx265"));
        assert!(has(&compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 0.0), true, "l", None)[0], "libvpx-vp9"));
        let capped = compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 720.0, VideoCodec::H264, 0.0), false, "l", None);
        assert!(after(&capped[0], "-vf").unwrap().contains("scale=1280:720"));
        let hw = compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 0.0), false, "l", Some("h264_nvenc"));
        assert!(has(&hw[0], "h264_nvenc"));
        let hw2 = compress_plan("i", "o", &facts(), &compress(CompressPreset::Balanced, 0.0, VideoCodec::H264, 10.0), false, "l", Some("h264_nvenc"));
        assert!(has(&hw2[0], "libx264"));
    }

    #[test]
    fn split_points() {
        let o = |mode, times: Vec<f64>, parts, every| VideoSplitOptions { mode, times, parts, every_sec: every, precise: false };
        assert_eq!(
            split_segments(9.0, &o(SplitMode::Parts, vec![], 3.0, 60.0)),
            vec![Segment { start: 0.0, end: 3.0 }, Segment { start: 3.0, end: 6.0 }, Segment { start: 6.0, end: 9.0 }]
        );
        let every = split_segments(10.0, &o(SplitMode::Every, vec![], 2.0, 4.0));
        assert_eq!(every.len(), 3);
        assert_eq!(every[2].end, 10.0);
        assert_eq!(split_segments(10.0, &o(SplitMode::At, vec![5.0, 0.0, 20.0], 2.0, 60.0)), vec![Segment { start: 0.0, end: 5.0 }, Segment { start: 5.0, end: 10.0 }]);
    }

    #[test]
    fn tools() {
        assert_eq!(atempo_chain(4.0), "atempo=2.0,atempo=2.0000");
        assert_eq!(atempo_chain(0.25), "atempo=0.5,atempo=0.5000");
        assert_eq!(atempo_chain(1.5), "atempo=1.5000");
        assert!(has(&speed_args("i", "o", &facts(), 2.0, true, Fmt::Mp4, Q, None), "-filter_complex"));
        let mute = speed_args("i", "o", &facts(), 2.0, false, Fmt::Mp4, Q, None);
        assert!(has(&mute, "-vf") && has(&mute, "-an"));
        let m = mute_args("i.mp4", "o.mp4", Fmt::Mp4);
        assert!(has(&m, "-an"));
        assert_eq!(after(&m, "-c"), Some("copy"));
        assert_eq!(after(&trim_args("i", "o", &facts(), 1.0, 3.0, false, Fmt::Mp4, Q, None), "-c"), Some("copy"));
        assert!(has(&trim_args("i", "o", &facts(), 1.0, 3.0, true, Fmt::Mp4, Q, None), "libx264"));
        let c = crop_args("i", "o", &facts(), PixelRect { x: 10, y: 20, w: 100, h: 50 }, Fmt::Mp4, Q, None);
        assert!(after(&c, "-vf").unwrap().contains("crop=100:50:10:20"));
        assert_eq!(after(&metadata_args("i", "o", true, &[], Fmt::Mp4), "-map_metadata"), Some("-1"));
        assert!(has(&metadata_args("i", "o", false, &[("title".into(), "T".into())], Fmt::Mkv), "title=T"));
        assert!(has(&narrow_maps(&metadata_args("i", "o", false, &[], Fmt::Mkv)), "0:s?"));
    }

    #[test]
    fn redact_and_concat() {
        let (graph, out) = redact_graph(&[
            PixelRegion { rect: PixelRect { x: 10, y: 10, w: 200, h: 100 }, style: RedactStyle::Blur, start_sec: None, end_sec: None },
            PixelRegion { rect: PixelRect { x: 0, y: 0, w: 50, h: 50 }, style: RedactStyle::Black, start_sec: Some(1.0), end_sec: Some(2.0) },
        ]);
        assert!(graph.contains("gblur") && graph.contains("drawbox") && graph.contains("[v1]"));
        assert!(graph.contains("enable='between(t,1.000,2.000)'"));
        assert_eq!(out, "v1");
        assert_eq!(concat_list_file(&["C:\\a b\\it's.mp4".to_string()]), "file 'C:/a b/it'\\''s.mp4'\n");
        assert!(can_concat_copy(&[facts(), facts()]));
        assert!(!can_concat_copy(&[facts(), MediaFacts { width: Some(1280), ..facts() }]));
        assert!(!can_concat_copy(&[facts(), MediaFacts { has_audio: false, ..facts() }]));
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
```

**Done when:** `test result: ok. 54 passed; 0 failed`.

## Task 3.13 — core: `image_meta`

**Goal.** Remove metadata from JPEG and PNG files without re-encoding them (by dropping file segments), reset the EXIF
orientation tag, and read the size and colour components of a JPEG from its header.

**File `src-tauri/crates/core/src/image_meta.rs`**

```rust
//! Port of src/main/engines/imageMeta.ts: lossless metadata removal by rewriting file segments.

/// Lossless: drop EXIF/XMP (APP1), IPTC (APP13), comments and other APPn segments. Keeps JFIF, Adobe and (optionally) ICC.
pub fn strip_jpeg_metadata(buf: &[u8], keep_icc: bool) -> Result<Vec<u8>, String> {
    if buf.len() < 2 || buf[0] != 0xff || buf[1] != 0xd8 {
        return Err("Not a JPEG file".to_string());
    }
    let mut out: Vec<u8> = buf[..2].to_vec();
    let mut i = 2;
    while i + 4 <= buf.len() {
        if buf[i] != 0xff {
            return Err("Corrupt JPEG".to_string());
        }
        let marker = buf[i + 1];
        if marker == 0xff {
            i += 1;
            continue;
        }
        if marker == 0xda || marker == 0xd9 {
            out.extend_from_slice(&buf[i..]);
            return Ok(out);
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            out.extend_from_slice(&buf[i..i + 2]);
            i += 2;
            continue;
        }
        let len = ((buf[i + 2] as usize) << 8) | buf[i + 3] as usize;
        let end = (i + 2 + len).min(buf.len());
        let seg = &buf[i..end];
        let is_app = (0xe0..=0xef).contains(&marker);
        let is_icc = marker == 0xe2 && keep_icc && seg.len() >= 16 && &seg[4..16] == b"ICC_PROFILE\0";
        let keep = if marker == 0xfe { false } else if !is_app { true } else { marker == 0xe0 || marker == 0xee || is_icc };
        if keep {
            out.extend_from_slice(seg);
        }
        i += 2 + len;
    }
    Ok(out)
}

const PNG_SIG: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

/// Lossless: drop text/EXIF/time chunks from a PNG.
pub fn strip_png_metadata(buf: &[u8]) -> Result<Vec<u8>, String> {
    if buf.len() < 8 || buf[..8] != PNG_SIG {
        return Err("Not a PNG file".to_string());
    }
    let mut out: Vec<u8> = buf[..8].to_vec();
    let mut i = 8;
    while i + 12 <= buf.len() {
        let len = u32::from_be_bytes([buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]) as usize;
        let kind = &buf[i + 4..i + 8];
        let end = (i + 12 + len).min(buf.len());
        let drop = matches!(kind, b"tEXt" | b"zTXt" | b"iTXt" | b"eXIf" | b"tIME");
        if !drop {
            out.extend_from_slice(&buf[i..end]);
        }
        i = end;
        if kind == b"IEND" {
            break;
        }
    }
    Ok(out)
}

/// Set the EXIF Orientation tag (0x0112, in IFD0) to 1 in raw TIFF-structured EXIF data, in place.
/// Used when pixels were already rotated, so viewers must not rotate them again.
/// Returns true when the tag was found. Malformed data is left untouched.
pub fn reset_exif_orientation(tiff: &mut [u8]) -> bool {
    if tiff.len() < 8 {
        return false;
    }
    let le = match &tiff[..2] {
        b"II" => true,
        b"MM" => false,
        _ => return false,
    };
    let u16_at = |b: &[u8], i: usize| if le { u16::from_le_bytes([b[i], b[i + 1]]) } else { u16::from_be_bytes([b[i], b[i + 1]]) };
    let u32_at = |b: &[u8], i: usize| {
        let a = [b[i], b[i + 1], b[i + 2], b[i + 3]];
        if le { u32::from_le_bytes(a) } else { u32::from_be_bytes(a) }
    };
    let ifd = u32_at(tiff, 4) as usize;
    if ifd + 2 > tiff.len() {
        return false;
    }
    let count = u16_at(tiff, ifd) as usize;
    for k in 0..count {
        let e = ifd + 2 + k * 12;
        if e + 12 > tiff.len() {
            return false;
        }
        if u16_at(tiff, e) == 0x0112 && u16_at(tiff, e + 2) == 3 {
            let one = if le { 1u16.to_le_bytes() } else { 1u16.to_be_bytes() };
            tiff[e + 8] = one[0];
            tiff[e + 9] = one[1];
            return true;
        }
    }
    false
}

/// Width, height and colour component count (1 = grey, 3 = YCbCr/RGB, 4 = CMYK) from a JPEG's SOF header.
pub fn jpeg_sof_info(buf: &[u8]) -> Option<(u32, u32, u8)> {
    if buf.len() < 4 || buf[0] != 0xff || buf[1] != 0xd8 {
        return None;
    }
    let mut i = 2;
    while i + 4 <= buf.len() {
        if buf[i] != 0xff {
            return None;
        }
        let marker = buf[i + 1];
        if marker == 0xff {
            i += 1;
            continue;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            i += 2;
            continue;
        }
        if marker == 0xda || marker == 0xd9 {
            return None;
        }
        let len = u16::from_be_bytes([buf[i + 2], buf[i + 3]]) as usize;
        let is_sof = (0xc0..=0xcf).contains(&marker) && !matches!(marker, 0xc4 | 0xc8 | 0xcc);
        if is_sof && i + 10 <= buf.len() {
            let h = u16::from_be_bytes([buf[i + 5], buf[i + 6]]) as u32;
            let w = u16::from_be_bytes([buf[i + 7], buf[i + 8]]) as u32;
            return Some((w, h, buf[i + 9]));
        }
        i += 2 + len;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_marker(b: &[u8], hi: u8, lo: u8) -> bool {
        b.windows(2).any(|w| w[0] == hi && w[1] == lo)
    }

    #[test]
    fn jpeg() {
        let mut j = vec![0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
        j.extend(b"JFIF\0");
        j.extend([1, 1, 0, 0, 1, 0, 1, 0, 0]);
        j.extend([0xff, 0xe1, 0x00, 0x08]);
        j.extend(b"Exif");
        j.extend([0, 0, 0xff, 0xfe, 0x00, 0x05]);
        j.extend(b"hi!");
        j.extend([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
        let out = strip_jpeg_metadata(&j, true).unwrap();
        assert!(has_marker(&out, 0xff, 0xe0));
        assert!(!has_marker(&out, 0xff, 0xe1));
        assert!(!has_marker(&out, 0xff, 0xfe));
        assert!(out.windows(4).any(|w| w == b"JFIF"));
        assert!(!out.windows(4).any(|w| w == b"Exif"));
        assert_eq!(&out[out.len() - 2..], &[0xff, 0xd9]);
        assert!(strip_jpeg_metadata(b"PNG....", true).unwrap_err().contains("Not a JPEG"));
    }

    #[test]
    fn png() {
        let chunk = |kind: &[u8], data: &[u8]| {
            let mut c = vec![0, 0, 0, data.len() as u8];
            c.extend(kind);
            c.extend(data);
            c.extend([0, 0, 0, 0]);
            c
        };
        let mut p = PNG_SIG.to_vec();
        p.extend(chunk(b"IHDR", &[0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
        p.extend(chunk(b"tEXt", &[75, 0, 118]));
        p.extend(chunk(b"IDAT", &[1, 2, 3]));
        p.extend(chunk(b"IEND", &[]));
        let out = strip_png_metadata(&p).unwrap();
        assert!(!out.windows(4).any(|w| w == b"tEXt"));
        assert!(out.windows(4).any(|w| w == b"IDAT") && out.windows(4).any(|w| w == b"IEND"));
        assert!(out.len() < p.len());
        assert!(strip_png_metadata(&[1, 2, 3, 4, 5, 6, 7, 8]).unwrap_err().contains("Not a PNG"));
    }

    #[test]
    fn orientation_reset() {
        // Little-endian TIFF, IFD0 at 8 with one entry: Orientation SHORT 1 value 6.
        let mut t = b"II*\0".to_vec();
        t.extend(8u32.to_le_bytes());
        t.extend(1u16.to_le_bytes());
        t.extend(0x0112u16.to_le_bytes());
        t.extend(3u16.to_le_bytes());
        t.extend(1u32.to_le_bytes());
        t.extend([6, 0, 0, 0]);
        t.extend(0u32.to_le_bytes());
        assert!(reset_exif_orientation(&mut t));
        assert_eq!(t[18], 1);
        assert!(!reset_exif_orientation(&mut b"junk".to_vec()));
    }

    #[test]
    fn sof_info() {
        let mut j = vec![0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0];
        j.extend([0xff, 0xc0, 0x00, 0x11, 8, 0x01, 0x2c, 0x01, 0x90, 3]);
        assert_eq!(jpeg_sof_info(&j), Some((400, 300, 3)));
        assert_eq!(jpeg_sof_info(b"nope"), None);
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -p alohamora-core --all-targets -- -D warnings
```

**Done when:** `test result: ok. 58 passed; 0 failed` and Clippy reports no warnings. The `core` crate is complete.

# Phase 4 — Engine foundation

`alohamora-engine` does all the real work. This phase writes the basics every other engine module uses: cancellation,
paths, running programs, file helpers, FFmpeg, settings and capability detection.

**The first engine build is slow.** Task 4.1 compiles every engine dependency for the first time, including Tesseract
and Leptonica (C++, built from source by the `tesseract-rs` build script with CMake) and the image codecs. Expect
10–30 minutes. The `tesseract-rs` build script downloads the Leptonica and Tesseract sources once into
`~/.tesseract-rs` (macOS: `~/Library/Application Support/tesseract-rs`, Windows: `%APPDATA%\tesseract-rs`). Later builds
are fast. If that download is blocked, see Appendix D.

## Task 4.1 — engine: `cancel`, `paths`, `process`, `fsutil`, `par`

**Goal.** The low-level helpers.

- `cancel`: `CancelToken`, a shared "stop" flag (replaces `AbortSignal`). Long work checks `cancel.check()?` between steps.
- `paths`: where everything is. The app fills a `Paths` value once at start-up (`paths::init`); the engine reads
  `paths::get()`. It finds the FFmpeg sidecars (installed: next to the app; development: `src-tauri/binaries/` with the
  target triple in the name), PDFium, the OCR data, the fonts and `heif-enc`.
- `process`: runs a program with an argument list (never through a shell), without a console window on Windows, and kills
  it when the job is cancelled.
- `fsutil`: moving files (rename, or copy + delete across disks), clean-up of old temporary files, `data:` URLs.
- `par`: `map_limit`, which runs a function over a list on at most N threads (replaces the TypeScript `mapLimit`).

**File `src-tauri/crates/engine/src/cancel.rs`**

```rust
//! Replaces AbortSignal. Cloning shares the same flag.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::{AppError, Result};

#[derive(Clone, Default, Debug)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
    /// `throwIfAborted`: returns Err(Canceled) once cancelled. Use with `?` inside loops.
    pub fn check(&self) -> Result<()> {
        if self.is_cancelled() { Err(AppError::Canceled) } else { Ok(()) }
    }
}
```

**File `src-tauri/crates/engine/src/paths.rs`**

```rust
//! Port of src/main/paths.ts. The app fills `Paths` once at start-up (`init`); everything else reads `get()`.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Debug, Clone)]
pub struct Paths {
    /// Folder that holds the sidecars (ffmpeg, ffprobe, alohamora-drag-helper): the main executable's folder.
    pub bin_dir: PathBuf,
    /// Tauri resource folder: tessdata/, pdfium/, fonts/, THIRD_PARTY_NOTICES.md.
    pub resource_dir: PathBuf,
    /// settings.json lives here.
    pub config_dir: PathBuf,
    /// Preview proxies and other caches.
    pub cache_dir: PathBuf,
    /// User-writable data (optional heif-enc on Windows).
    pub data_dir: PathBuf,
    /// Job scratch folders: <temp>/alohamora-jobs/<id>.
    pub jobs_temp_root: PathBuf,
    pub app_version: String,
}

static PATHS: OnceLock<Paths> = OnceLock::new();

/// Call once at start-up. Later calls are ignored.
pub fn init(p: Paths) {
    let _ = PATHS.set(p);
}

pub fn get() -> &'static Paths {
    PATHS.get().expect("paths::init must be called at start-up")
}

pub fn exe_name(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

/// A bundled helper program. Installed apps have `<bin_dir>/ffmpeg`; dev runs that point `bin_dir` at
/// src-tauri/binaries find the Tauri sidecar name `ffmpeg-<target triple>` instead.
pub fn sidecar(name: &str) -> PathBuf {
    let plain = get().bin_dir.join(exe_name(name));
    if plain.exists() {
        return plain;
    }
    let with_triple = get().bin_dir.join(exe_name(&format!("{name}-{}", env!("ALOHAMORA_TARGET_TRIPLE"))));
    if with_triple.exists() { with_triple } else { plain }
}

pub fn ffmpeg() -> PathBuf {
    sidecar("ffmpeg")
}

pub fn ffprobe() -> PathBuf {
    sidecar("ffprobe")
}

pub fn mac_drag_helper() -> PathBuf {
    sidecar("alohamora-drag-helper")
}

pub fn tessdata_dir() -> PathBuf {
    get().resource_dir.join("tessdata")
}

/// OCR languages that have a `<lang>.traineddata` file, sorted (capabilities.ocrLanguages).
pub fn installed_ocr_langs() -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(tessdata_dir())
        .map(|rd| rd.filter_map(|e| e.ok()).filter_map(|e| e.file_name().to_str()?.strip_suffix(".traineddata").map(String::from)).collect())
        .unwrap_or_default();
    v.sort();
    v
}

pub fn fonts_dir() -> PathBuf {
    get().resource_dir.join("fonts")
}

/// Folder holding the PDFium library:
/// - macOS app bundle: Contents/Frameworks (the bundler signs it there, which notarization requires);
/// - Windows/Linux installs and dev runs: <resources>/pdfium;
/// - macOS dev runs (Tauri copies no frameworks in dev): the fetched copy in src-tauri/resources/pdfium.
pub fn pdfium_dir() -> PathBuf {
    let frameworks = get().bin_dir.join("../Frameworks");
    if cfg!(target_os = "macos") && frameworks.join("libpdfium.dylib").exists() {
        return frameworks;
    }
    let bundled = get().resource_dir.join("pdfium");
    if bundled.is_dir() || !cfg!(debug_assertions) {
        return bundled;
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../resources/pdfium")
}

pub fn notices() -> PathBuf {
    get().resource_dir.join("THIRD_PARTY_NOTICES.md")
}

/// Optional heif-enc on Windows: the user copies heif-enc.exe and its DLLs here.
pub fn heif_enc_candidates() -> Vec<PathBuf> {
    vec![get().data_dir.join("heif").join(exe_name("heif-enc")), get().resource_dir.join("heif").join(exe_name("heif-enc"))]
}

/// A sub-folder of the cache directory, created on demand.
pub fn cache_dir(sub: &str) -> PathBuf {
    let p = get().cache_dir.join(sub);
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn jobs_temp_root() -> PathBuf {
    let p = get().jobs_temp_root.clone();
    let _ = std::fs::create_dir_all(&p);
    p
}

/// Find an executable on PATH (Linux/macOS), or None.
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let p = dir.join(exe_name(name));
        if is_executable(&p) {
            return Some(p);
        }
    }
    None
}

fn is_executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(p).map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

/// A path as a String for FFmpeg arguments and JSON.
pub fn p2s(p: &Path) -> String {
    p.to_string_lossy().to_string()
}
```

**File `src-tauri/crates/engine/src/process.rs`**

```rust
//! Port of src/main/engines/process.ts: run a program with an argument list (never a shell).

use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

use crate::cancel::CancelToken;
use crate::{AppError, Result};

pub struct ProcessOutput {
    pub stdout: Vec<u8>,
    /// The last 20,000 characters of stderr.
    pub stderr: String,
}

/// A Command that never opens a console window on Windows.
pub fn command(exe: &Path) -> Command {
    let mut c = Command::new(exe);
    c.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

/// Keep only the last `max` characters of `s`.
pub fn keep_tail(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max { s.to_string() } else { s.chars().skip(count - max).collect() }
}

/// Last `n` lines of `s`, joined with \n.
pub fn last_lines(s: &str, n: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// Wait for the child, killing it when `cancel` fires. Returns the exit status, or Err(Canceled).
pub fn wait_or_cancel(child: &mut Child, cancel: Option<&CancelToken>) -> Result<std::process::ExitStatus> {
    loop {
        if let Some(status) = child.try_wait()? {
            if cancel.is_some_and(|c| c.is_cancelled()) {
                return Err(AppError::Canceled);
            }
            return Ok(status);
        }
        if cancel.is_some_and(|c| c.is_cancelled()) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Canceled);
        }
        thread::sleep(Duration::from_millis(20));
    }
}

/// Run `exe args…`, collect stdout and the stderr tail. Non-zero exit → Tool error "<name> failed (exit code N)".
pub fn run_process(exe: &Path, args: &[String], cancel: Option<&CancelToken>, name: &str) -> Result<ProcessOutput> {
    if let Some(c) = cancel {
        c.check()?;
    }
    let mut child = command(exe)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::tool(format!("{name} could not be started"), format!("{}: {e}", exe.display())))?;
    let mut out = child.stdout.take().expect("piped stdout");
    let mut err = child.stderr.take().expect("piped stderr");
    let out_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = out.read_to_end(&mut buf);
        buf
    });
    let err_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = err.read_to_end(&mut buf);
        keep_tail(&String::from_utf8_lossy(&buf), 20_000)
    });
    let status = wait_or_cancel(&mut child, cancel);
    let stdout = out_thread.join().unwrap_or_default();
    let stderr = err_thread.join().unwrap_or_default();
    let status = status?;
    if status.success() {
        return Ok(ProcessOutput { stdout, stderr });
    }
    let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "null".to_string());
    Err(AppError::tool(format!("{name} failed (exit code {code})"), last_lines(&stderr, 20)))
}
```

**File `src-tauri/crates/engine/src/fsutil.rs`**

```rust
//! Port of the file helpers in src/main/util.ts.

use std::path::Path;
use std::time::{Duration, SystemTime};

use crate::{AppError, Result};

/// Move a file; falls back to copy+delete across drives. Never overwrites.
pub fn move_file(src: &Path, dest: &Path) -> Result<()> {
    if dest.exists() {
        return Err(AppError::other(format!("Destination exists: {}", dest.display())));
    }
    match std::fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            // copy into a new file (fails if it appeared meanwhile), then delete the source
            let mut from = std::fs::File::open(src)?;
            let mut to = std::fs::OpenOptions::new().write(true).create_new(true).open(dest)?;
            std::io::copy(&mut from, &mut to)?;
            drop(to);
            std::fs::remove_file(src)?;
            Ok(())
        }
        Err(e) => Err(AppError::Io(e)),
    }
}

/// Remove entries in `dir` last modified more than `max_age` ago. Never touches anything outside `dir`.
pub fn remove_older_than(dir: &Path, max_age: Duration) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    let now = SystemTime::now();
    let mut removed = 0;
    for entry in entries.flatten() {
        let p = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(modified) = meta.modified() else { continue };
        if now.duration_since(modified).unwrap_or_default() <= max_age {
            continue;
        }
        let ok = if meta.is_dir() { std::fs::remove_dir_all(&p).is_ok() } else { std::fs::remove_file(&p).is_ok() };
        if ok {
            removed += 1;
        }
    }
    removed
}

/// Delete a folder, retrying a few times (Windows may still hold a handle for a moment).
pub fn remove_dir_with_retries(dir: &Path) {
    for _ in 0..4 {
        if !dir.exists() || std::fs::remove_dir_all(dir).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// Bytes → "data:<mime>;base64,…".
pub fn data_url(mime: &str, bytes: &[u8]) -> String {
    use base64::Engine;
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}
```

**File `src-tauri/crates/engine/src/par.rs`**

```rust
//! Small parallel helper (replaces `mapLimit`).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// Run `f` over `items` with at most `limit` threads. Keeps the input order.
pub fn map_limit<T: Sync, R: Send>(items: &[T], limit: usize, f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let next = AtomicUsize::new(0);
    let results: Vec<Mutex<Option<R>>> = items.iter().map(|_| Mutex::new(None)).collect();
    std::thread::scope(|s| {
        for _ in 0..limit.max(1).min(items.len().max(1)) {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::SeqCst);
                if i >= items.len() {
                    break;
                }
                let r = f(&items[i]);
                *results[i].lock().expect("result slot") = Some(r);
            });
        }
    });
    results.into_iter().map(|m| m.into_inner().expect("result slot").expect("every item ran")).collect()
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** `cargo check` finishes with no errors (this is the slow first build).

## Task 4.2 — engine: `ffmpeg`

**Goal.** Run FFmpeg with progress and cancellation, capture its output, probe files with `ffprobe`.

`run_ffmpeg` adds the global flags (`-hide_banner -nostdin -y -loglevel error -progress pipe:1 -nostats`), reads the
progress lines to report 0–1, keeps the end of the error output for messages, and turns failures into friendly sentences
(`friendly_ffmpeg_error`). `probe` caches results per file (path + size + modification time).

**File `src-tauri/crates/engine/src/ffmpeg.rs`**

```rust
//! Port of src/main/engines/ffmpeg.ts: run FFmpeg with progress, capture output, probe files.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::Stdio;
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use alohamora_core::ffmpeg_parse::{friendly_ffmpeg_error, parse_probe_json, ProbeResult};

use crate::cancel::CancelToken;
use crate::paths;
use crate::process::{command, keep_tail, last_lines, run_process};
use crate::{AppError, Result};

/// Options for `run_ffmpeg`. `duration_sec` is the expected OUTPUT duration, used for progress.
#[derive(Default)]
pub struct FfmpegRun<'a> {
    pub duration_sec: Option<f64>,
    pub cancel: Option<&'a CancelToken>,
    pub on_progress: Option<&'a dyn Fn(f64)>,
}

/// Runs ffmpeg with progress reporting. `args` must NOT include -y/-progress (added here).
pub fn run_ffmpeg(args: &[String], opts: FfmpegRun) -> Result<()> {
    if let Some(c) = opts.cancel {
        c.check()?;
    }
    let mut full: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-progress", "pipe:1", "-nostats"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    full.extend_from_slice(args);
    let exe = paths::ffmpeg();
    let mut child = command(&exe)
        .args(&full)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::tool("FFmpeg could not be started", format!("{}: {e}", exe.display())))?;
    let stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");
    let (tx, rx) = mpsc::channel::<String>();
    let out_thread = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(|l| l.ok()) {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
    let err_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        keep_tail(&String::from_utf8_lossy(&buf), 12_000)
    });

    let handle_line = |line: &str| {
        let Some((k, v)) = line.split_once('=') else { return };
        if let (Some(cb), Some(d)) = (opts.on_progress, opts.duration_sec) {
            if (k == "out_time_us" || k == "out_time_ms") && d > 0.0 {
                // both keys are microseconds in FFmpeg
                if let Ok(us) = v.trim().parse::<f64>() {
                    if us > 0.0 {
                        cb((us / 1e6 / d).min(0.999));
                    }
                }
            }
        }
        if k == "progress" && v.trim() == "end" {
            if let Some(cb) = opts.on_progress {
                cb(1.0);
            }
        }
    };

    let status = loop {
        while let Ok(line) = rx.recv_timeout(Duration::from_millis(30)) {
            handle_line(&line);
        }
        if opts.cancel.is_some_and(|c| c.is_cancelled()) {
            let _ = child.kill();
            let _ = child.wait();
            break Err(AppError::Canceled);
        }
        match child.try_wait() {
            Ok(Some(s)) => break Ok(s),
            Ok(None) => {}
            Err(e) => break Err(AppError::Io(e)),
        }
    };
    let _ = out_thread.join();
    while let Ok(line) = rx.try_recv() {
        handle_line(&line);
    }
    let stderr_text = err_thread.join().unwrap_or_default();
    let status = status?;
    if opts.cancel.is_some_and(|c| c.is_cancelled()) {
        return Err(AppError::Canceled);
    }
    if status.success() {
        return Ok(());
    }
    let tail = last_lines(&stderr_text, 15);
    Err(AppError::tool(friendly_ffmpeg_error(&stderr_text), format!("ffmpeg {}\n\n{tail}", full.join(" "))))
}

fn with_quiet(args: &[String], level: &str) -> Vec<String> {
    let mut a: Vec<String> = vec!["-hide_banner".into(), "-nostdin".into(), "-loglevel".into(), level.into()];
    a.extend_from_slice(args);
    a
}

/// Run ffmpeg and return stdout (use with `-f image2pipe … pipe:1`).
pub fn run_ffmpeg_to_buffer(args: &[String], cancel: Option<&CancelToken>) -> Result<Vec<u8>> {
    Ok(run_process(&paths::ffmpeg(), &with_quiet(args, "error"), cancel, "FFmpeg")?.stdout)
}

/// Run ffmpeg at loglevel info and return stderr (for loudnorm analysis).
pub fn run_ffmpeg_capture(args: &[String], cancel: Option<&CancelToken>) -> Result<String> {
    Ok(run_process(&paths::ffmpeg(), &with_quiet(args, "info"), cancel, "FFmpeg")?.stderr)
}

fn probe_cache() -> &'static Mutex<HashMap<String, ProbeResult>> {
    static CACHE: OnceLock<Mutex<HashMap<String, ProbeResult>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// "path|size|mtime" — changes whenever the file changes.
pub fn file_key(p: &Path) -> Result<String> {
    let m = std::fs::metadata(p)?;
    let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or(0);
    Ok(format!("{}|{}|{}", p.display(), m.len(), mtime))
}

/// ffprobe the file (cached by path, size and modification time; at most 300 entries).
pub fn probe(file: &Path) -> Result<ProbeResult> {
    let key = file_key(file)?;
    if let Some(hit) = probe_cache().lock().expect("probe cache").get(&key) {
        return Ok(hit.clone());
    }
    let args: Vec<String> = vec!["-v".into(), "error".into(), "-print_format".into(), "json".into(), "-show_format".into(), "-show_streams".into(), paths::p2s(file)];
    let out = run_process(&paths::ffprobe(), &args, None, "FFprobe").map_err(|e| match e {
        // "not really the format its name says" instead of "FFprobe failed (exit code 1)"
        AppError::Tool { details, .. } => AppError::tool(friendly_ffmpeg_error(&details), details),
        other => other,
    })?;
    let result = parse_probe_json(&String::from_utf8_lossy(&out.stdout)).map_err(|e| AppError::other(format!("ffprobe JSON: {e}")))?;
    let mut cache = probe_cache().lock().expect("probe cache");
    if cache.len() > 300 {
        cache.clear();
    }
    cache.insert(key, result.clone());
    Ok(result)
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors.

## Task 4.3 — engine: `settings`

**Goal.** `settings.json` in the app's config folder, with the same keys and defaults as the Electron build.

Every key is checked on load and on update (`sanitize`); unknown keys and wrong types are dropped and the default is used.
Writes are atomic (write a temporary file, then rename). `on_changed` lets the app react to changes (Task 8.8).

**File `src-tauri/crates/engine/src/settings.rs`**

```rust
//! Port of src/main/settings.ts: settings.json with per-key sanitizing and atomic writes.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use alohamora_core::registry;
use alohamora_core::types::Settings;
use serde_json::{Map, Value};

use crate::Result;

type Listener = Arc<dyn Fn(&Settings, &Settings) + Send + Sync>;

struct Store {
    file: PathBuf,
    current: Settings,
    listeners: Vec<Listener>,
}

static STORE: OnceLock<Mutex<Store>> = OnceLock::new();

fn store() -> &'static Mutex<Store> {
    STORE.get().expect("settings::load must be called at start-up")
}

/// JSON types must match the default's: null default → null or string; array → array; else same kind.
fn same_type(default: &Value, v: &Value) -> bool {
    match default {
        Value::Null => v.is_null() || v.is_string(),
        Value::Array(_) => v.is_array(),
        Value::Bool(_) => v.is_boolean(),
        Value::Number(_) => v.is_number(),
        Value::String(_) => v.is_string(),
        Value::Object(_) => v.is_object(),
    }
}

/// Keep only known keys whose type matches the default. One bad key never resets the others.
pub fn sanitize(raw: &Value) -> Map<String, Value> {
    let defaults = &registry::get().defaults["settings"];
    let mut out = Map::new();
    let (Some(defs), Some(raw)) = (defaults.as_object(), raw.as_object()) else { return out };
    for (k, def) in defs {
        if let Some(v) = raw.get(k) {
            if same_type(def, v) {
                out.insert(k.clone(), v.clone());
            }
        }
    }
    out
}

fn merge(base: &Settings, patch: &Map<String, Value>) -> Settings {
    let mut v = serde_json::to_value(base).expect("settings serialize");
    if let Some(obj) = v.as_object_mut() {
        for (k, val) in patch {
            obj.insert(k.clone(), val.clone());
        }
    }
    serde_json::from_value(v).unwrap_or_else(|_| base.clone())
}

/// Load settings.json from `config_dir` (missing or broken file → defaults). Call once at start-up.
pub fn load(config_dir: PathBuf) -> Settings {
    let _ = std::fs::create_dir_all(&config_dir);
    let file = config_dir.join("settings.json");
    let defaults = registry::default_settings();
    let current = std::fs::read_to_string(&file)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .map(|raw| merge(&defaults, &sanitize(&raw)))
        .unwrap_or(defaults);
    let s = current.clone();
    if STORE.set(Mutex::new(Store { file, current, listeners: Vec::new() })).is_err() {
        let mut st = store().lock().expect("settings");
        st.current = s.clone();
    }
    s
}

/// Settings without the file (self-test, unit tests).
pub fn load_defaults_in_memory() {
    let _ = STORE.set(Mutex::new(Store { file: PathBuf::new(), current: registry::default_settings(), listeners: Vec::new() }));
}

pub fn get() -> Settings {
    store().lock().expect("settings").current.clone()
}

/// Merge a (sanitized) patch, save atomically (tmp + rename), notify listeners with (new, previous).
pub fn update(patch: &Value) -> Result<Settings> {
    let (next, prev, listeners) = {
        let mut st = store().lock().expect("settings");
        let prev = st.current.clone();
        let next = merge(&prev, &sanitize(patch));
        if !st.file.as_os_str().is_empty() {
            let tmp = st.file.with_extension("json.tmp");
            std::fs::write(&tmp, serde_json::to_string_pretty(&next)?)?;
            std::fs::rename(&tmp, &st.file)?;
        }
        st.current = next.clone();
        (next, prev, st.listeners.clone())
    };
    for l in listeners {
        l(&next, &prev);
    }
    Ok(next)
}

/// Called after every change with (new, previous).
pub fn on_changed(cb: impl Fn(&Settings, &Settings) + Send + Sync + 'static) {
    store().lock().expect("settings").listeners.push(Arc::new(cb));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sanitizes_per_key() {
        let s = sanitize(&json!({ "imageQuality": 70, "theme": 5, "customOutputDir": null, "ocrLanguages": "eng", "nope": 1 }));
        assert_eq!(s.get("imageQuality"), Some(&json!(70)));
        assert!(s.get("theme").is_none());
        assert_eq!(s.get("customOutputDir"), Some(&Value::Null));
        assert!(s.get("ocrLanguages").is_none());
        assert!(s.get("nope").is_none());
        let merged = merge(&registry::default_settings(), &s);
        assert_eq!(merged.image_quality, 70.0);
        assert_eq!(merged.theme, "system");
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** `test result: ok. 1 passed; 0 failed` (the first `cargo test` links the test binary; it takes a moment).

## Task 4.4 — engine: `capabilities`, `hw_video`

**Goal.** Know what this computer can do, and find a working hardware video encoder.

- `capabilities::detect` reads FFmpeg's version and encoder list, finds a HEIC encoder (macOS: `sips`; Windows/Linux:
  `heif-enc`, but **only if** `heif-enc --list-encoders` shows an HEVC encoder), and lists the installed OCR languages.
  The UI hides targets that this computer cannot produce.
- `hw_video::detect_hardware_video` tries the hardware H.264 encoders (macOS: VideoToolbox; Windows: NVENC, Quick Sync,
  AMF; Linux: NVENC) with a one-frame test encode in the background and records the first one that works.

**File `src-tauri/crates/engine/src/capabilities.rs`**

```rust
//! Port of src/main/capabilities.ts: what this computer can do (FFmpeg encoders, HEIC output, OCR data…).

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use alohamora_core::ffmpeg_parse::parse_encoder_list;
use alohamora_core::types::Capabilities;

use crate::paths;
use crate::process::run_process;

static CAPS: OnceLock<Mutex<Capabilities>> = OnceLock::new();
static HEIC_TOOL_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn platform() -> &'static str {
    if cfg!(windows) { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" }
}

pub fn arch() -> &'static str {
    if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" }
}

fn empty() -> Capabilities {
    Capabilities {
        platform: platform().into(),
        arch: arch().into(),
        app_version: paths::get().app_version.clone(),
        ffmpeg: false,
        ffmpeg_version: String::new(),
        encoders: vec![],
        heif_enc: false,
        heic_tool: None,
        hw_video: None,
        global_drag: "unavailable".into(),
        ocr_languages: vec![],
    }
}

fn caps_lock() -> &'static Mutex<Capabilities> {
    CAPS.get_or_init(|| Mutex::new(empty()))
}

/// Where the HEIC encoder lives: ("sips" | "heif-enc", path).
pub fn heic_tool() -> Option<(String, PathBuf)> {
    let kind = get().heic_tool?;
    let path = HEIC_TOOL_PATH.get()?.lock().ok()?.clone()?;
    Some((kind, path))
}

/// heif-enc can be installed without any HEVC encoder plugin (Linux packages split them out).
/// Only count it when `--list-encoders` shows at least one HEIC encoder.
pub fn heif_enc_has_hevc(list_output: &str) -> bool {
    let mut in_heic = false;
    for line in list_output.lines() {
        if line.trim_end().ends_with("encoders:") {
            in_heic = line.trim_start().starts_with("HEIC");
        } else if in_heic && line.trim_start().starts_with('-') {
            return true;
        }
    }
    false
}

fn heif_enc_usable(p: &Path) -> bool {
    match run_process(p, &["--list-encoders".into()], None, "heif-enc") {
        Ok(out) => heif_enc_has_hevc(&String::from_utf8_lossy(&out.stdout)),
        Err(_) => false,
    }
}

fn detect_heic(next: &mut Capabilities) {
    let mut found: Option<(&str, PathBuf)> = None;
    if cfg!(target_os = "macos") && PathBuf::from("/usr/bin/sips").exists() {
        found = Some(("sips", PathBuf::from("/usr/bin/sips")));
    } else if let Some(p) = paths::heif_enc_candidates().into_iter().find(|p| p.exists() && heif_enc_usable(p)) {
        found = Some(("heif-enc", p));
    } else if cfg!(target_os = "linux") {
        if let Some(p) = paths::find_on_path("heif-enc").filter(|p| heif_enc_usable(p)) {
            found = Some(("heif-enc", p));
        }
    }
    next.heic_tool = found.as_ref().map(|(k, _)| k.to_string());
    next.heif_enc = found.is_some();
    *HEIC_TOOL_PATH.get_or_init(|| Mutex::new(None)).lock().expect("heic path") = found.map(|(_, p)| p);
}

fn detect_global_drag() -> &'static str {
    if cfg!(target_os = "macos") {
        return if paths::mac_drag_helper().exists() { "mac-helper" } else { "unavailable" };
    }
    if cfg!(target_os = "linux") {
        let wayland = std::env::var("XDG_SESSION_TYPE").map(|v| v == "wayland").unwrap_or(false) || std::env::var_os("WAYLAND_DISPLAY").is_some();
        return if wayland { "unavailable" } else { "hook" }; // global input is impossible on Wayland
    }
    "hook"
}

/// Detect everything (runs ffmpeg twice). Keeps an already-detected hardware encoder.
pub fn detect() -> Capabilities {
    let mut next = empty();
    let ffmpeg = paths::ffmpeg();
    match run_process(&ffmpeg, &["-hide_banner".into(), "-encoders".into()], None, "FFmpeg") {
        Ok(out) => {
            next.encoders = parse_encoder_list(&String::from_utf8_lossy(&out.stdout));
            if let Ok(v) = run_process(&ffmpeg, &["-version".into()], None, "FFmpeg") {
                next.ffmpeg_version = String::from_utf8_lossy(&v.stdout).lines().next().unwrap_or("").to_string();
            }
            next.ffmpeg = !next.encoders.is_empty();
        }
        Err(e) => log::error!("FFmpeg is not available: {e:?}"),
    }
    detect_heic(&mut next);
    next.global_drag = detect_global_drag().into();
    next.ocr_languages = paths::installed_ocr_langs();
    let mut caps = caps_lock().lock().expect("caps");
    next.hw_video = caps.hw_video.clone();
    *caps = next.clone();
    log::info!(
        "Capabilities {}-{} ffmpeg={} version={} encoders={} heic={:?} globalDrag={} ocr={:?}",
        next.platform, next.arch, next.ffmpeg, next.ffmpeg_version, next.encoders.len(), next.heic_tool, next.global_drag, next.ocr_languages
    );
    next
}

pub fn get() -> Capabilities {
    caps_lock().lock().expect("caps").clone()
}

pub fn set_hardware_video(encoder: Option<String>) {
    caps_lock().lock().expect("caps").hw_video = encoder;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heif_enc_list() {
        assert!(heif_enc_has_hevc("HEIC encoders:\n- x265 = x265 HEVC encoder [default]\nAVIF encoders:\n"));
        assert!(!heif_enc_has_hevc("HEIC encoders:\nAVIF encoders:\n- aom = AOM\nJPEG encoders:\n"));
    }
}
```

**File `src-tauri/crates/engine/src/hw_video.rs`**

```rust
//! Port of src/main/engines/hwVideo.ts: find a working hardware H.264 encoder with a 1-frame test encode.

use crate::capabilities;
use crate::ffmpeg::run_ffmpeg_to_buffer;

fn candidates() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["h264_videotoolbox"]
    } else if cfg!(windows) {
        &["h264_nvenc", "h264_qsv", "h264_amf"]
    } else {
        &["h264_nvenc"]
    }
}

/// Test-encode one black frame with each candidate; store the first that works. Run on a background thread.
pub fn detect_hardware_video() {
    let caps = capabilities::get();
    for enc in candidates() {
        if !caps.encoders.iter().any(|e| e == enc) {
            continue;
        }
        let args: Vec<String> = ["-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1", "-frames:v", "1", "-c:v", enc, "-f", "null", "-"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        if run_ffmpeg_to_buffer(&args, None).is_ok() {
            capabilities::set_hardware_video(Some(enc.to_string()));
            log::info!("Hardware video encoder OK: {enc}");
            return;
        }
        log::info!("Hardware video encoder unavailable: {enc}");
    }
    capabilities::set_hardware_video(None);
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** `test result: ok. 2 passed; 0 failed`.

# Phase 5 — Images, PDFs and documents

This phase replaces sharp/libvips, heic-decode, imagetracerjs, piexifjs/exifr, pdf.js, pdf-lib, Chromium printing and the
`docx` package with Rust code (see the table in §4).

## Task 5.1 — engine: `image`

**Goal.** Load any supported picture the right way up, change it, and save it in any output format, keeping or removing
metadata like the Electron build did.

The module has five files:

- `image/mod.rs` — loading. JPEG/PNG/WebP/TIFF/GIF/BMP are decoded by the `image` crate and turned upright using the
  EXIF orientation. **HEIC and AVIF are decoded by FFmpeg** (to PNG through a pipe; FFmpeg 7.1+ also joins the tiles of
  iPhone photos). SVG is rendered by resvg (at 300 dpi for conversions). Also: `display_size` (size after orientation),
  `fit_inside`, thumbnails, cover art for audio, and the image **compress** logic (`compress_to_bytes`), shared by the
  Compress tool and its live preview.
- `image/encode.rs` — encoders: JPEG = mozjpeg (progressive, like sharp's `mozjpeg: true`), PNG = `image` (or a
  colour palette with NeuQuant when compressing), WebP = libwebp, AVIF = rav1e (`ravif`, quality × 0.65, speed 6),
  TIFF = LZW, BMP = `image`. **HEIC output** uses `sips` on macOS and `heif-enc` on Windows/Linux (no permissive
  Rust HEIC encoder exists); the picture is first written as a temporary PNG.
- `image/exif.rs` — reads the source's EXIF and ICC profile and puts them into the new file (JPEG, PNG, WebP) with
  orientation reset to 1, because the pixels are already upright. GPS removal, field editing and the "keep only text
  fields" mode of the Metadata tool are here too.
- `image/svg.rs` — SVG in (resvg, with system fonts + the bundled fonts, a 100-megapixel limit) and SVG out (`trace` =
  vtracer colour tracing, `embed` = a PNG inside an `<svg>`).
- `image/ops.rs` — pixel operations: the Edit panel (`apply_edit`: brightness/saturation/hue in Oklch, colour matrix,
  grayscale, invert, sharpen, blur, vignette), backgrounds (rounded corners, shadow, gradient — drawn as SVG and
  rendered with resvg), collage, and redaction.

**File `src-tauri/crates/engine/src/image/mod.rs`**

```rust
//! Port of engines/image.ts (sharp/libvips replaced by the `image` crate and codec crates).
//! Everything works on `image::DynamicImage` that is already turned the right way up.

pub mod encode;
pub mod exif;
pub mod ops;
pub mod svg;

use std::path::Path;

use alohamora_core::registry;
use alohamora_core::options::{ImageCompressFormat, ImageCompressOptions};
use alohamora_core::types::{FileInfo, Fmt};
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageReader};

use crate::ffmpeg::run_ffmpeg_to_buffer;
use crate::paths::p2s;
use crate::{AppError, Result};

pub use encode::{same_image_fmt, save_as, save_raster, SaveFmt};

pub const MSG_UNREADABLE: &str = "Alohamora couldn't read this image. It may be damaged.";

/// SVGs are drawn at this many dots per inch when they are loaded as pictures (sharp used 300).
pub const SVG_DENSITY: f32 = 300.0;

pub fn unreadable(e: impl std::fmt::Display) -> AppError {
    AppError::user_with(MSG_UNREADABLE, e.to_string())
}

/// Load any supported image with EXIF orientation applied.
pub fn load(path: &Path, fmt: Option<Fmt>) -> Result<DynamicImage> {
    load_with_density(path, fmt, SVG_DENSITY)
}

/// Same as `load`, but SVGs are drawn at `svg_density` DPI (72 = the SVG's own pixel size).
pub fn load_with_density(path: &Path, fmt: Option<Fmt>, svg_density: f32) -> Result<DynamicImage> {
    match fmt {
        // HEIC and AVIF are decoded by the bundled FFmpeg (needs FFmpeg 7.1+ for iPhone grid images).
        Some(Fmt::Heic) | Some(Fmt::Avif) => decode_with_ffmpeg(path),
        Some(Fmt::Svg) => svg::render_file(path, svg_density / 72.0),
        _ => decode_oriented(path),
    }
}

fn decode_oriented(path: &Path) -> Result<DynamicImage> {
    let reader = ImageReader::open(path)?.with_guessed_format()?;
    let mut decoder = reader.into_decoder().map_err(unreadable)?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut img = DynamicImage::from_decoder(decoder).map_err(unreadable)?;
    img.apply_orientation(orientation);
    Ok(img)
}

fn decode_with_ffmpeg(path: &Path) -> Result<DynamicImage> {
    let args: Vec<String> = ["-i", &p2s(path), "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"]
        .iter().map(|s| s.to_string()).collect();
    let png = run_ffmpeg_to_buffer(&args, None).map_err(unreadable)?;
    image::load_from_memory_with_format(&png, image::ImageFormat::Png).map_err(unreadable)
}

fn swaps_sides(o: Orientation) -> bool {
    matches!(o, Orientation::Rotate90 | Orientation::Rotate270 | Orientation::Rotate90FlipH | Orientation::Rotate270FlipH)
}

/// Display size after orientation. Reads only the header for normal raster files.
pub fn display_size(path: &Path, fmt: Option<Fmt>) -> Result<(u32, u32)> {
    match fmt {
        Some(Fmt::Svg) => svg::size(path, SVG_DENSITY / 72.0),
        Some(Fmt::Heic) | Some(Fmt::Avif) => {
            let img = load(path, fmt)?;
            Ok((img.width(), img.height()))
        }
        _ => {
            let mut decoder = ImageReader::open(path)?.with_guessed_format()?.into_decoder().map_err(unreadable)?;
            let (w, h) = decoder.dimensions();
            let o = decoder.orientation().unwrap_or(Orientation::NoTransforms);
            Ok(if swaps_sides(o) { (h, w) } else { (w, h) })
        }
    }
}

/// Scale down (never up unless `enlarge`) so the image fits inside `max_w` × `max_h`, keeping its shape.
pub fn fit_inside(img: DynamicImage, max_w: u32, max_h: u32, enlarge: bool) -> DynamicImage {
    if !enlarge && img.width() <= max_w && img.height() <= max_h {
        return img;
    }
    img.resize(max_w, max_h, image::imageops::FilterType::Lanczos3)
}

/// 256 px JPEG thumbnail for the file list (white behind transparent pixels).
pub fn thumbnail_jpeg(path: &Path, fmt: Option<Fmt>, size: u32) -> Result<Vec<u8>> {
    let img = load_with_density(path, fmt, 72.0)?;
    encode::jpeg_bytes(&img.thumbnail(size, size), 70.0)
}

/// Audio cover art: at most 1000 px, white background, JPEG quality 90.
pub fn cover_art_jpeg(src: &Path, out: &Path) -> Result<()> {
    let img = load(src, registry::fmt_from_path(&p2s(src)))?;
    std::fs::write(out, encode::jpeg_bytes(&fit_inside(img, 1000, 1000, false), 90.0)?)?;
    Ok(())
}

/// Output format of image.compress: "keep" keeps JPG/PNG/WebP/AVIF, everything else becomes JPG.
pub fn compress_fmt(file: &FileInfo, o: &ImageCompressOptions) -> SaveFmt {
    match o.format {
        ImageCompressFormat::Jpg => SaveFmt::Jpg,
        ImageCompressFormat::Webp => SaveFmt::Webp,
        ImageCompressFormat::Avif => SaveFmt::Avif,
        ImageCompressFormat::Keep => match file.fmt {
            Some(Fmt::Png) => SaveFmt::Png,
            Some(Fmt::Webp) => SaveFmt::Webp,
            Some(Fmt::Avif) => SaveFmt::Avif,
            _ => SaveFmt::Jpg,
        },
    }
}

/// Encoded bytes for image.compress (also used by the compress preview).
pub fn compress_to_bytes(file: &FileInfo, o: &ImageCompressOptions) -> Result<(Vec<u8>, SaveFmt)> {
    let fmt = compress_fmt(file, o);
    let path = Path::new(&file.path);
    let mut img = load(path, file.fmt)?;
    if o.max_side > 0.0 {
        let m = o.max_side as u32;
        img = fit_inside(img, m, m, false);
    }
    let bytes = match fmt {
        SaveFmt::Png => encode::png_palette_bytes(&img, o.quality)?,
        other => encode::encode(&img, other, o.quality)?,
    };
    let bytes = if o.strip_metadata { bytes } else { exif::attach(bytes, fmt, &exif::read_source_meta(path))? };
    Ok((bytes, fmt))
}
```

**File `src-tauri/crates/engine/src/image/encode.rs`**

```rust
//! Encoders. JPEG = mozjpeg, PNG = image/png, WebP = libwebp, AVIF = rav1e (ravif), TIFF = LZW, BMP = image,
//! HEIC = Apple `sips` (macOS) or `heif-enc` (Windows/Linux) because no permissive Rust HEIC encoder exists.

use std::io::Cursor;
use std::path::Path;

use alohamora_core::types::Fmt;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageEncoder, RgbImage, RgbaImage};

use super::exif::{self, SourceMeta};
use crate::cancel::CancelToken;
use crate::paths::p2s;
use crate::process::run_process;
use crate::{AppError, Result};

/// Every format an image tool can write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveFmt { Jpg, Png, Webp, Avif, Tiff, Bmp, Heic }

impl SaveFmt {
    pub fn ext(self) -> &'static str {
        match self {
            SaveFmt::Jpg => "jpg",
            SaveFmt::Png => "png",
            SaveFmt::Webp => "webp",
            SaveFmt::Avif => "avif",
            SaveFmt::Tiff => "tiff",
            SaveFmt::Bmp => "bmp",
            SaveFmt::Heic => "heic",
        }
    }
}

/// Tools keep the input format when Alohamora can write it (port of `sameImageFmt`).
pub fn same_image_fmt(fmt: Option<Fmt>, heif_enc: bool) -> SaveFmt {
    match fmt {
        Some(Fmt::Jpg) => SaveFmt::Jpg,
        Some(Fmt::Png) => SaveFmt::Png,
        Some(Fmt::Webp) => SaveFmt::Webp,
        Some(Fmt::Avif) => SaveFmt::Avif,
        Some(Fmt::Tiff) => SaveFmt::Tiff,
        Some(Fmt::Bmp) => SaveFmt::Bmp,
        Some(Fmt::Heic) => if heif_enc { SaveFmt::Heic } else { SaveFmt::Jpg },
        _ => SaveFmt::Png, // svg and anything else
    }
}

fn encode_failed(e: impl std::fmt::Display) -> AppError {
    AppError::user_with("This image could not be converted. It may be damaged or too large.", e.to_string())
}

/// Paint transparent pixels onto a solid colour.
pub fn flatten(img: &DynamicImage, bg: [u8; 3]) -> RgbImage {
    if !img.color().has_alpha() {
        return img.to_rgb8();
    }
    let rgba = img.to_rgba8();
    let mut out = RgbImage::new(rgba.width(), rgba.height());
    for (o, p) in out.pixels_mut().zip(rgba.pixels()) {
        let a = p[3] as u32;
        for c in 0..3 {
            o[c] = ((p[c] as u32 * a + bg[c] as u32 * (255 - a) + 127) / 255) as u8;
        }
    }
    out
}

/// JPEG via mozjpeg (progressive, optimised like sharp's `mozjpeg: true`). White behind transparency.
pub fn jpeg_bytes(img: &DynamicImage, quality: f32) -> Result<Vec<u8>> {
    let rgb = flatten(img, [255, 255, 255]);
    let (w, h) = (rgb.width() as usize, rgb.height() as usize);
    // libjpeg reports errors by panicking; catch_unwind turns that into an error.
    std::panic::catch_unwind(move || -> std::io::Result<Vec<u8>> {
        let mut c = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
        c.set_size(w, h);
        c.set_quality(quality.clamp(1.0, 100.0));
        let mut started = c.start_compress(Vec::new())?;
        started.write_scanlines(rgb.as_raw())?;
        started.finish()
    })
    .map_err(|_| encode_failed("JPEG encoder failed"))?
    .map_err(encode_failed)
}

/// Lossless PNG, maximum compression with adaptive filtering.
pub fn png_bytes(img: &DynamicImage) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    let enc = PngEncoder::new_with_quality(&mut out, CompressionType::Best, FilterType::Adaptive);
    let img = to_8bit(img);
    enc.write_image(img.as_bytes(), img.width(), img.height(), img.color().into()).map_err(encode_failed)?;
    Ok(out)
}

/// PNG with at most 256 colours (NeuQuant keeps transparency). `quality` 1–100 picks the colour count.
pub fn png_palette_bytes(img: &DynamicImage, quality: f64) -> Result<Vec<u8>> {
    let rgba = img.to_rgba8();
    let colors = ((quality.clamp(1.0, 100.0) / 100.0) * 256.0).round().clamp(2.0, 256.0) as usize;
    let nq = color_quant::NeuQuant::new(10, colors, rgba.as_raw());
    let map = nq.color_map_rgba();
    let indexes: Vec<u8> = rgba.pixels().map(|p| nq.index_of(&p.0) as u8).collect();
    let mut palette = Vec::with_capacity(colors * 3);
    let mut trns = Vec::with_capacity(colors);
    for c in map.chunks_exact(4) {
        palette.extend_from_slice(&c[..3]);
        trns.push(c[3]);
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, rgba.width(), rgba.height());
        enc.set_color(png::ColorType::Indexed);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_palette(palette);
        if trns.iter().any(|&a| a != 255) {
            enc.set_trns(trns);
        }
        enc.set_compression(png::Compression::High);
        let mut writer = enc.write_header().map_err(encode_failed)?;
        writer.write_image_data(&indexes).map_err(encode_failed)?;
    }
    Ok(out)
}

pub fn webp_bytes(img: &DynamicImage, quality: f32) -> Result<Vec<u8>> {
    let mem = if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height()).encode(quality)
    } else {
        let rgb = img.to_rgb8();
        webp::Encoder::from_rgb(rgb.as_raw(), rgb.width(), rgb.height()).encode(quality)
    };
    Ok(mem.to_vec())
}

/// AVIF quality is scaled by 0.65 like the Electron build (sharp's AVIF scale is harsher than JPEG's).
pub fn avif_bytes(img: &DynamicImage, quality: f32) -> Result<Vec<u8>> {
    let rgba = img.to_rgba8();
    let pixels: Vec<ravif::RGBA8> = rgba.pixels().map(|p| ravif::RGBA8::new(p[0], p[1], p[2], p[3])).collect();
    let q = (quality * 0.65).round().clamp(1.0, 100.0);
    let encoded = ravif::Encoder::new()
        .with_quality(q)
        .with_alpha_quality(q)
        .with_speed(6)
        .encode_rgba(ravif::Img::new(pixels.as_slice(), rgba.width() as usize, rgba.height() as usize))
        .map_err(encode_failed)?;
    Ok(encoded.avif_file)
}

/// TIFF with LZW compression (RGBA, or RGB when the image has no alpha).
pub fn tiff_bytes(img: &DynamicImage) -> Result<Vec<u8>> {
    use tiff::encoder::{colortype, Compression, TiffEncoder};
    let mut out = Cursor::new(Vec::new());
    {
        let mut enc = TiffEncoder::new(&mut out).map_err(encode_failed)?.with_compression(Compression::Lzw);
        if img.color().has_alpha() {
            let rgba = img.to_rgba8();
            enc.write_image::<colortype::RGBA8>(rgba.width(), rgba.height(), rgba.as_raw()).map_err(encode_failed)?;
        } else {
            let rgb = img.to_rgb8();
            enc.write_image::<colortype::RGB8>(rgb.width(), rgb.height(), rgb.as_raw()).map_err(encode_failed)?;
        }
    }
    Ok(out.into_inner())
}

/// 24-bit BMP on white (same as FFmpeg's bgr24 output in the Electron build).
pub fn bmp_bytes(img: &DynamicImage) -> Result<Vec<u8>> {
    let rgb = flatten(img, [255, 255, 255]);
    let mut out = Cursor::new(Vec::new());
    rgb.write_to(&mut out, image::ImageFormat::Bmp).map_err(encode_failed)?;
    Ok(out.into_inner())
}

/// 16-bit images are written as 8-bit (PNG/WebP/JPEG encoders here are 8-bit).
fn to_8bit(img: &DynamicImage) -> DynamicImage {
    match img {
        DynamicImage::ImageLuma8(_) | DynamicImage::ImageLumaA8(_) | DynamicImage::ImageRgb8(_) | DynamicImage::ImageRgba8(_) => img.clone(),
        _ if img.color().has_alpha() => DynamicImage::ImageRgba8(img.to_rgba8()),
        _ => DynamicImage::ImageRgb8(img.to_rgb8()),
    }
}

/// Encode to any format except HEIC.
pub fn encode(img: &DynamicImage, fmt: SaveFmt, quality: f64) -> Result<Vec<u8>> {
    let q = quality as f32;
    match fmt {
        SaveFmt::Jpg => jpeg_bytes(img, q),
        SaveFmt::Png => png_bytes(img),
        SaveFmt::Webp => webp_bytes(img, q),
        SaveFmt::Avif => avif_bytes(img, q),
        SaveFmt::Tiff => tiff_bytes(img),
        SaveFmt::Bmp => bmp_bytes(img),
        SaveFmt::Heic => Err(AppError::other("HEIC is written by save_as")),
    }
}

/// Encode and write. `meta` = EXIF/ICC from the source to carry over (orientation reset to 1).
pub fn save_raster(img: &DynamicImage, fmt: SaveFmt, out: &Path, quality: f64, meta: Option<&SourceMeta>) -> Result<()> {
    let mut bytes = encode(img, fmt, quality)?;
    if let Some(m) = meta {
        bytes = exif::attach(bytes, fmt, m)?;
    }
    std::fs::write(out, bytes)?;
    Ok(())
}

/// Like `save_raster` but HEIC goes through the external encoder via a temporary PNG.
pub fn save_as(img: &DynamicImage, fmt: SaveFmt, out: &Path, quality: f64, scratch_png: &Path, cancel: &CancelToken, meta: Option<&SourceMeta>) -> Result<()> {
    if fmt == SaveFmt::Heic {
        std::fs::write(scratch_png, png_bytes(img)?)?;
        return encode_heic_file(scratch_png, out, quality, Some(cancel));
    }
    save_raster(img, fmt, out, quality, meta)
}

/// macOS: `sips -s format heic -s formatOptions <q> in.png --out out.heic`; elsewhere: `heif-enc -q <q> -o out.heic in.png`.
pub fn encode_heic_file(input_png: &Path, out: &Path, quality: f64, cancel: Option<&CancelToken>) -> Result<()> {
    let Some((kind, tool)) = crate::capabilities::heic_tool() else {
        return Err(AppError::user("HEIC output is not available on this computer."));
    };
    let q = alohamora_core::js::js_round(quality).clamp(1.0, 100.0).to_string();
    let args: Vec<String> = if kind == "sips" {
        vec!["-s".into(), "format".into(), "heic".into(), "-s".into(), "formatOptions".into(), q, p2s(input_png), "--out".into(), p2s(out)]
    } else {
        vec!["-q".into(), q, "-o".into(), p2s(out), p2s(input_png)]
    };
    run_process(&tool, &args, cancel, &kind)?;
    Ok(())
}

/// RGBA copy helper used by the compositing code.
pub fn rgba(img: &DynamicImage) -> RgbaImage {
    img.to_rgba8()
}
```

**File `src-tauri/crates/engine/src/image/exif.rs`**

```rust
//! EXIF/ICC handling (replaces sharp `withMetadata`, piexifjs and exifr).
//! img-parts moves the raw EXIF/ICC blocks between files; kamadak-exif reads and rebuilds EXIF.

use std::io::Cursor;
use std::path::Path;

use exif::{Field, In, Tag, Value};
use img_parts::{Bytes, DynImage, ImageEXIF, ImageICC};

use super::encode::SaveFmt;
use crate::{AppError, Result};

/// EXIF (raw TIFF bytes, no "Exif\0\0" prefix) and ICC profile of a source file.
#[derive(Debug, Clone, Default)]
pub struct SourceMeta {
    pub exif: Option<Vec<u8>>,
    pub icc: Option<Vec<u8>>,
}

/// Read EXIF/ICC from a JPEG, PNG or WebP. Other formats (and unreadable files) give an empty result.
pub fn read_source_meta(path: &Path) -> SourceMeta {
    let Ok(bytes) = std::fs::read(path) else { return SourceMeta::default() };
    match DynImage::from_bytes(Bytes::from(bytes)) {
        Ok(Some(img)) => SourceMeta { exif: img.exif().map(|b| b.to_vec()), icc: img.icc_profile().map(|b| b.to_vec()) },
        _ => SourceMeta::default(),
    }
}

/// Put EXIF (orientation forced to 1, because pixels are already upright) and ICC into an encoded JPEG/PNG/WebP.
/// AVIF/TIFF/BMP outputs are returned unchanged.
pub fn attach(encoded: Vec<u8>, fmt: SaveFmt, meta: &SourceMeta) -> Result<Vec<u8>> {
    if !matches!(fmt, SaveFmt::Jpg | SaveFmt::Png | SaveFmt::Webp) || (meta.exif.is_none() && meta.icc.is_none()) {
        return Ok(encoded);
    }
    let Some(mut img) = DynImage::from_bytes(Bytes::from(encoded.clone())).map_err(AppError::other)? else {
        return Ok(encoded);
    };
    if let Some(e) = &meta.exif {
        let mut e = e.clone();
        alohamora_core::image_meta::reset_exif_orientation(&mut e);
        img.set_exif(Some(Bytes::from(e)));
    }
    // Our encoders write RGB pixels (or grey PNGs). A CMYK or grey profile from the source would describe the wrong data.
    let grey_png = matches!(fmt, SaveFmt::Png) && matches!(encoded.get(25), Some(0) | Some(4)); // IHDR colour type
    if let Some(icc) = meta.icc.as_ref().filter(|p| is_rgb_profile(p) && !grey_png) {
        img.set_icc_profile(Some(Bytes::from(icc.clone())));
    }
    let mut out = Vec::new();
    img.encoder().write_to(&mut out)?;
    Ok(out)
}

/// True for an ICC profile whose data colour space (header bytes 16..20) is RGB.
fn is_rgb_profile(icc: &[u8]) -> bool {
    icc.get(16..20) == Some(b"RGB ".as_slice())
}

/// EXIF Orientation of a file (1 when missing).
pub fn orientation(path: &Path) -> u32 {
    let Ok(f) = std::fs::File::open(path) else { return 1 };
    let Ok(exif) = exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)) else { return 1 };
    exif.get_field(Tag::Orientation, In::PRIMARY).and_then(|f| f.value.get_uint(0)).unwrap_or(1)
}

/// Artist, Copyright and ImageDescription from IFD0 (empty strings when missing).
pub fn text_fields(path: &Path) -> (String, String, String) {
    let read = || -> Option<exif::Exif> {
        let f = std::fs::File::open(path).ok()?;
        exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)).ok()
    };
    let Some(exif) = read() else { return (String::new(), String::new(), String::new()) };
    let get = |tag: Tag| -> String {
        match exif.get_field(tag, In::PRIMARY).map(|f| &f.value) {
            Some(Value::Ascii(v)) => v.iter().map(|s| String::from_utf8_lossy(s).trim_end_matches('\0').to_string()).collect::<Vec<_>>().join(" "),
            _ => String::new(),
        }
    };
    (get(Tag::Artist), get(Tag::Copyright), get(Tag::ImageDescription))
}

fn ascii(tag: Tag, ifd: In, s: &str) -> Field {
    Field { tag, ifd_num: ifd, value: Value::Ascii(vec![s.as_bytes().to_vec()]) }
}

/// Rebuild EXIF from `fields`: drops GPS, the thumbnail (IFD1) and MakerNote, then applies `replace`.
fn rebuild(raw: Option<Vec<u8>>, replace: &[Field]) -> Result<Vec<u8>> {
    let parsed = raw.and_then(|r| exif::Reader::new().read_raw(r).ok());
    let little_endian = parsed.as_ref().map(|e| e.little_endian()).unwrap_or(false);
    let mut keep: Vec<Field> = Vec::new();
    if let Some(e) = &parsed {
        for f in e.fields() {
            let is_gps = f.tag.context() == exif::Context::Gps;
            let dropped = is_gps || f.ifd_num != In::PRIMARY || f.tag == Tag::MakerNote
                || replace.iter().any(|r| r.tag == f.tag && r.ifd_num == f.ifd_num);
            if !dropped {
                keep.push(f.clone());
            }
        }
    }
    keep.extend(replace.iter().cloned());
    let mut w = exif::experimental::Writer::new();
    for f in &keep {
        w.push_field(f);
    }
    let mut out = Cursor::new(Vec::new());
    w.write(&mut out, little_endian).map_err(|e| AppError::tool("Could not write the photo information", e.to_string()))?;
    Ok(out.into_inner())
}

fn with_new_exif(jpeg: &[u8], exif: Vec<u8>) -> Result<Vec<u8>> {
    let mut img = img_parts::jpeg::Jpeg::from_bytes(Bytes::from(jpeg.to_vec()))
        .map_err(|e| AppError::user_with(super::MSG_UNREADABLE, e.to_string()))?;
    img.set_exif(Some(Bytes::from(exif)));
    let mut out = Vec::new();
    img.encoder().write_to(&mut out)?;
    Ok(out)
}

fn jpeg_exif(jpeg: &[u8]) -> Option<Vec<u8>> {
    img_parts::jpeg::Jpeg::from_bytes(Bytes::from(jpeg.to_vec())).ok()?.exif().map(|b| b.to_vec())
}

/// Lossless: same JPEG without GPS (port of `jpegRemoveGps`).
pub fn jpeg_remove_gps(jpeg: &[u8]) -> Result<Vec<u8>> {
    with_new_exif(jpeg, rebuild(jpeg_exif(jpeg), &[])?)
}

/// Fields for `jpeg_edit_fields`. `None` = leave unchanged. `date_taken` is "YYYY:MM:DD HH:MM:SS".
#[derive(Debug, Clone, Default)]
pub struct EditFields {
    pub artist: Option<String>,
    pub copyright: Option<String>,
    pub description: Option<String>,
    pub date_taken: Option<String>,
}

/// Lossless: same JPEG with new text fields (port of `jpegEditFields`). GPS is dropped as in the Electron build.
pub fn jpeg_edit_fields(jpeg: &[u8], f: &EditFields) -> Result<Vec<u8>> {
    let mut replace = Vec::new();
    if let Some(v) = &f.artist { replace.push(ascii(Tag::Artist, In::PRIMARY, v)); }
    if let Some(v) = &f.copyright { replace.push(ascii(Tag::Copyright, In::PRIMARY, v)); }
    if let Some(v) = &f.description { replace.push(ascii(Tag::ImageDescription, In::PRIMARY, v)); }
    if let Some(v) = f.date_taken.as_deref().filter(|v| !v.is_empty()) { replace.push(ascii(Tag::DateTimeOriginal, In::PRIMARY, v)); }
    with_new_exif(jpeg, rebuild(jpeg_exif(jpeg), &replace)?)
}

/// A fresh EXIF block with only the given IFD0 text fields (empty strings are skipped).
pub fn text_only_exif(artist: &str, copyright: &str, description: &str) -> Result<Option<Vec<u8>>> {
    let mut fields = Vec::new();
    if !artist.is_empty() { fields.push(ascii(Tag::Artist, In::PRIMARY, artist)); }
    if !copyright.is_empty() { fields.push(ascii(Tag::Copyright, In::PRIMARY, copyright)); }
    if !description.is_empty() { fields.push(ascii(Tag::ImageDescription, In::PRIMARY, description)); }
    if fields.is_empty() {
        return Ok(None);
    }
    Ok(Some(rebuild(None, &fields)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_rgb_profiles_are_kept() {
        let mut icc = vec![0u8; 128];
        icc[16..20].copy_from_slice(b"RGB ");
        assert!(is_rgb_profile(&icc));
        icc[16..20].copy_from_slice(b"CMYK");
        assert!(!is_rgb_profile(&icc));
        assert!(!is_rgb_profile(b"short"));
    }
}
```

**File `src-tauri/crates/engine/src/image/svg.rs`**

```rust
//! SVG in (resvg) and SVG out (vtracer trace or an embedded PNG). Port of engines/svg.ts.

use std::path::Path;
use std::sync::{Arc, OnceLock};

use base64::Engine as _;
use image::{DynamicImage, RgbaImage};
use resvg::{tiny_skia, usvg};

use crate::{AppError, Result};

/// Largest picture we draw from an SVG (pixels). Bigger requests are scaled down to this.
const MAX_PIXELS: f64 = 100_000_000.0;

/// System fonts plus the bundled fonts, loaded once (SVG <text> needs them).
fn fontdb() -> Arc<usvg::fontdb::Database> {
    static DB: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = usvg::fontdb::Database::new();
        db.load_system_fonts();
        db.load_fonts_dir(crate::paths::fonts_dir());
        Arc::new(db)
    })
    .clone()
}

fn parse(data: &[u8]) -> Result<usvg::Tree> {
    let opt = usvg::Options { fontdb: fontdb(), ..Default::default() };
    usvg::Tree::from_data(data, &opt).map_err(super::unreadable)
}

fn draw(tree: &usvg::Tree, scale: f32) -> Result<RgbaImage> {
    let size = tree.size();
    let mut s = scale;
    let px = (size.width() * s) as f64 * (size.height() * s) as f64;
    if px > MAX_PIXELS {
        s *= (MAX_PIXELS / px).sqrt() as f32;
    }
    let w = ((size.width() * s).ceil() as u32).max(1);
    let h = ((size.height() * s).ceil() as u32).max(1);
    let mut pixmap = tiny_skia::Pixmap::new(w, h).ok_or_else(|| AppError::user("This SVG is too large to draw."))?;
    resvg::render(tree, tiny_skia::Transform::from_scale(s, s), &mut pixmap.as_mut());
    RgbaImage::from_raw(w, h, pixmap.take_demultiplied()).ok_or_else(|| AppError::other("SVG buffer size mismatch"))
}

/// Draw an SVG file. `scale` 1.0 = the SVG's own pixel size (sharp density 72).
pub fn render_file(path: &Path, scale: f32) -> Result<DynamicImage> {
    let tree = parse(&std::fs::read(path)?)?;
    Ok(DynamicImage::ImageRgba8(draw(&tree, scale)?))
}

/// Size the file would have when drawn at `scale`.
pub fn size(path: &Path, scale: f32) -> Result<(u32, u32)> {
    let tree = parse(&std::fs::read(path)?)?;
    let s = tree.size();
    Ok((((s.width() * scale).ceil() as u32).max(1), ((s.height() * scale).ceil() as u32).max(1)))
}

/// Draw SVG markup we generate ourselves (gradients, masks, shadows) at its own size.
pub fn render_str(svg: &str) -> Result<RgbaImage> {
    draw(&parse(svg.as_bytes())?, 1.0)
}

/// `<svg>` that only wraps the picture as a PNG data URL.
pub fn embed(img: &DynamicImage) -> Result<String> {
    let png = super::encode::png_bytes(img)?;
    let (w, h) = (img.width(), img.height());
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Ok(format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\" viewBox=\"0 0 {w} {h}\"><image width=\"{w}\" height=\"{h}\" href=\"data:image/png;base64,{b64}\"/></svg>"
    ))
}

/// Vectorise: shrink to ≤1000 px, trace colour regions into paths. `colors` (2–64) maps to vtracer's colour precision.
pub fn trace(img: &DynamicImage, colors: f64) -> Result<String> {
    let small = super::fit_inside(img.clone(), 1000, 1000, false).to_rgba8();
    let (w, h) = (small.width() as usize, small.height() as usize);
    let precision = (colors.max(2.0).log2().ceil() as i32 + 2).clamp(1, 8);
    let config = vtracer::Config { color_precision: precision, filter_speckle: 8, ..Default::default() };
    let svg = vtracer::convert(vtracer::ColorImage { pixels: small.into_raw(), width: w, height: h }, config)
        .map_err(|e| AppError::tool("Tracing the image failed", e))?
        .to_string();
    // vtracer starts with an XML declaration and a comment; the output starts at <svg like imagetracerjs.
    let start = svg.find("<svg").unwrap_or(0);
    Ok(svg[start..].to_string())
}
```

**File `src-tauri/crates/engine/src/image/ops.rs`**

```rust
//! Pixel operations: edit pipeline, backdrop, collage, redaction (ports of imageEdit.ts, imageBackground.ts,
//! imageCollage.ts and tools/image/redact.ts). Everything works on straight-alpha RGBA8.

use alohamora_core::collage_layout::collage_cells;
use alohamora_core::edit_pipeline::{EditSpec, M3};
use alohamora_core::geometry::{clamp_norm_rect, to_pixel_rect};
use alohamora_core::options::{BackgroundKind, CollageFit, CollageOptions, ImageBackgroundOptions, ImageRedactRegion, RedactStyle};
use alohamora_core::types::FileInfo;
use image::imageops::{self, FilterType};
use image::{DynamicImage, Rgba, RgbaImage};

use super::svg::render_str;
use crate::cancel::CancelToken;
use crate::Result;

/// "#rgb", "#rrggbb" or "#rrggbbaa". Anything else is white.
pub fn parse_color(s: &str) -> [u8; 4] {
    let h = s.trim().trim_start_matches('#');
    let hex = |i: usize, n: usize| u8::from_str_radix(&h[i..i + n], 16).ok();
    let v = match h.len() {
        3 => (|| Some([hex(0, 1)? * 17, hex(1, 1)? * 17, hex(2, 1)? * 17, 255]))(),
        6 => (|| Some([hex(0, 2)?, hex(2, 2)?, hex(4, 2)?, 255]))(),
        8 => (|| Some([hex(0, 2)?, hex(2, 2)?, hex(4, 2)?, hex(6, 2)?]))(),
        _ => None,
    };
    v.unwrap_or([255, 255, 255, 255])
}

// ---------- edit pipeline ----------

fn srgb_to_linear(v: f64) -> f64 {
    let v = (v / 255.0).clamp(0.0, 1.0);
    if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}

fn linear_to_srgb(v: f64) -> f64 {
    let v = v.clamp(0.0, 1.0);
    255.0 * if v <= 0.003_130_8 { v * 12.92 } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 }
}

/// Saturation multiplier and hue rotation (degrees) in Oklch. sharp used CIE LCh; this is close and stable.
fn modulate(c: [f64; 3], saturation: f64, hue_deg: f64) -> [f64; 3] {
    let (r, g, b) = (srgb_to_linear(c[0]), srgb_to_linear(c[1]), srgb_to_linear(c[2]));
    let l = (0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b).cbrt();
    let m = (0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b).cbrt();
    let s = (0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b).cbrt();
    let ll = 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s;
    let a = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
    let bb = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
    let (sin, cos) = hue_deg.to_radians().sin_cos();
    let a2 = (a * cos - bb * sin) * saturation;
    let b2 = (a * sin + bb * cos) * saturation;
    let l_ = ll + 0.396_337_777_4 * a2 + 0.215_803_757_3 * b2;
    let m_ = ll - 0.105_561_345_8 * a2 - 0.063_854_172_8 * b2;
    let s_ = ll - 0.089_484_177_5 * a2 - 1.291_485_548 * b2;
    let (l3, m3, s3) = (l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
    [
        linear_to_srgb(4.076_741_662_1 * l3 - 3.307_711_591_3 * m3 + 0.230_969_929_2 * s3),
        linear_to_srgb(-1.268_438_004_6 * l3 + 2.609_757_401_1 * m3 - 0.341_319_396_5 * s3),
        linear_to_srgb(-0.004_196_086_3 * l3 - 0.703_418_614_7 * m3 + 1.707_614_701 * s3),
    ]
}

fn recomb(m: &M3, c: [f64; 3]) -> [f64; 3] {
    [
        m[0][0] * c[0] + m[0][1] * c[1] + m[0][2] * c[2],
        m[1][0] * c[0] + m[1][1] * c[1] + m[1][2] * c[2],
        m[2][0] * c[0] + m[2][1] * c[1] + m[2][2] * c[2],
    ]
}

/// Darken the edges: elliptical radial gradient, white up to 55 % of the radius, then down to k/255 at 100 %.
fn vignette(px: &mut RgbaImage, strength: f64) {
    let (w, h) = (px.width() as f64, px.height() as f64);
    let k = (255.0 * (1.0 - 0.75 * strength)).round() / 255.0;
    for (x, y, p) in px.enumerate_pixels_mut() {
        let dx = (x as f64 + 0.5 - w / 2.0) / (0.75 * w);
        let dy = (y as f64 + 0.5 - h / 2.0) / (0.75 * h);
        let d = (dx * dx + dy * dy).sqrt();
        let f = if d <= 0.55 { 1.0 } else if d >= 1.0 { k } else { 1.0 + (k - 1.0) * (d - 0.55) / 0.45 };
        for c in 0..3 {
            p[c] = (p[c] as f64 * f).round().clamp(0.0, 255.0) as u8;
        }
    }
}

/// Copy alpha from `src` into `dst` (keeps transparency when an operation should not touch it).
fn restore_alpha(dst: &mut RgbaImage, src: &RgbaImage) {
    for (d, s) in dst.pixels_mut().zip(src.pixels()) {
        d[3] = s[3];
    }
}

/// The same function serves previews and the final export, so previews match the output.
pub fn apply_edit(img: &DynamicImage, spec: &EditSpec) -> DynamicImage {
    let had_alpha = img.color().has_alpha();
    let mut px = img.to_rgba8();
    for p in px.pixels_mut() {
        let mut c = [p[0] as f64, p[1] as f64, p[2] as f64];
        if let Some((a, b)) = spec.linear {
            c = c.map(|v| (v * a + b).clamp(0.0, 255.0));
        }
        if let Some((sat, hue)) = spec.modulate {
            c = modulate(c, sat, hue);
        }
        if let Some(m) = &spec.recomb {
            c = recomb(m, c).map(|v| v.clamp(0.0, 255.0));
        }
        if spec.grayscale {
            let y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
            c = [y, y, y];
        }
        if spec.negate {
            c = c.map(|v| 255.0 - v);
        }
        for i in 0..3 {
            p[i] = c[i].round().clamp(0.0, 255.0) as u8;
        }
    }
    if let Some(sigma) = spec.sharpen_sigma {
        let before = px.clone();
        px = imageops::unsharpen(&px, sigma as f32, 0);
        restore_alpha(&mut px, &before);
    }
    if let Some(sigma) = spec.blur_sigma {
        px = imageops::fast_blur(&px, sigma as f32);
    }
    if spec.vignette > 0.0 {
        vignette(&mut px, spec.vignette);
    }
    if had_alpha { DynamicImage::ImageRgba8(px) } else { DynamicImage::ImageRgb8(DynamicImage::ImageRgba8(px).to_rgb8()) }
}

// ---------- masks and compositing ----------

/// White rounded rectangle on transparent (same SVG as the Electron build).
pub fn rounded_mask(w: u32, h: u32, r: u32) -> Result<RgbaImage> {
    render_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\"><rect width=\"100%\" height=\"100%\" rx=\"{r}\" ry=\"{r}\" fill=\"#fff\"/></svg>"
    ))
}

/// "dest-in": keep `img` only where `mask` is opaque.
pub fn mask_alpha(img: &mut RgbaImage, mask: &RgbaImage) {
    for (p, m) in img.pixels_mut().zip(mask.pixels()) {
        p[3] = ((p[3] as u32 * m[3] as u32 + 127) / 255) as u8;
    }
}

fn gradient(w: u32, h: u32, c1: &str, c2: &str, angle: f64) -> Result<RgbaImage> {
    let rot = alohamora_core::js::js_num(angle - 90.0);
    render_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\"><defs><linearGradient id=\"g\" gradientTransform=\"rotate({rot} .5 .5)\"><stop offset=\"0\" stop-color=\"{c1}\"/><stop offset=\"1\" stop-color=\"{c2}\"/></linearGradient></defs><rect width=\"100%\" height=\"100%\" fill=\"url(#g)\"/></svg>"
    ))
}

fn shadow(big_w: u32, big_h: u32, x: i64, y: i64, w: u32, h: u32, r: u32) -> Result<RgbaImage> {
    let blur = ((w.min(h) as f64 * 0.03).round() as i64).max(6);
    render_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{big_w}\" height=\"{big_h}\"><defs><filter id=\"s\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"{blur}\"/></filter></defs><rect x=\"{x}\" y=\"{}\" width=\"{w}\" height=\"{h}\" rx=\"{r}\" fill=\"rgba(0,0,0,0.35)\" filter=\"url(#s)\"/></svg>",
        y + blur
    ))
}

fn ratio(aspect: &str) -> Option<f64> {
    match aspect {
        "1:1" => Some(1.0),
        "4:5" => Some(4.0 / 5.0),
        "16:9" => Some(16.0 / 9.0),
        "9:16" => Some(9.0 / 16.0),
        _ => None,
    }
}

fn js_round_u32(v: f64) -> u32 {
    alohamora_core::js::js_round(v).max(0.0) as u32
}

/// Port of composeBackground: picture on a padded solid/gradient/blurred backdrop, optional round corners and shadow.
pub fn compose_background(src: &DynamicImage, o: &ImageBackgroundOptions) -> Result<RgbaImage> {
    let fg_src = src.to_rgba8();
    let (w, h) = fg_src.dimensions();
    let pad = js_round_u32(w.max(h) as f64 * o.padding_pct / 100.0);
    let mut big_w = w + 2 * pad;
    let mut big_h = h + 2 * pad;
    if let Some(r) = ratio(&o.aspect) {
        if big_w as f64 / big_h as f64 > r { big_h = js_round_u32(big_w as f64 / r) } else { big_w = js_round_u32(big_h as f64 * r) }
    }
    let radius = js_round_u32(w.min(h) as f64 * o.radius_pct / 100.0);
    let mut fg = fg_src.clone();
    if radius > 0 {
        mask_alpha(&mut fg, &rounded_mask(w, h, radius)?);
    }
    let mut bg: RgbaImage = match o.kind {
        BackgroundKind::Solid => RgbaImage::from_pixel(big_w, big_h, Rgba(parse_color(&o.color))),
        BackgroundKind::Gradient => gradient(big_w, big_h, &o.gradient.0, &o.gradient.1, o.angle)?,
        _ => {
            let filled = DynamicImage::ImageRgba8(fg_src).resize_to_fill(big_w, big_h, FilterType::Triangle);
            let mut b = filled.fast_blur((big_w as f32 / 40.0).round().max(20.0)).to_rgba8();
            for p in b.pixels_mut() {
                for c in 0..3 {
                    p[c] = (p[c] as f64 * 0.9).round() as u8;
                }
            }
            b
        }
    };
    let left = js_round_u32((big_w - w) as f64 / 2.0) as i64;
    let top = js_round_u32((big_h - h) as f64 / 2.0) as i64;
    if o.shadow {
        imageops::overlay(&mut bg, &shadow(big_w, big_h, left, top, w, h, radius)?, 0, 0);
    }
    imageops::overlay(&mut bg, &fg, left, top);
    Ok(bg)
}

/// Fill the box and cut off the overflow (centre crop; sharp used "attention" — documented gap).
pub fn resize_cover(img: &DynamicImage, w: u32, h: u32) -> RgbaImage {
    img.resize_to_fill(w, h, FilterType::Lanczos3).to_rgba8()
}

/// Fit inside the box and pad with `bg`.
pub fn resize_contain(img: &DynamicImage, w: u32, h: u32, bg: [u8; 4]) -> RgbaImage {
    let fitted = img.resize(w, h, FilterType::Lanczos3).to_rgba8();
    let mut canvas = RgbaImage::from_pixel(w, h, Rgba(bg));
    let x = (w as i64 - fitted.width() as i64) / 2;
    let y = (h as i64 - fitted.height() as i64) / 2;
    imageops::overlay(&mut canvas, &fitted, x, y);
    canvas
}

/// Port of composeCollage. Sequential on purpose (keeps memory low). `width` overrides o.width (previews use 800).
pub fn compose_collage(files: &[FileInfo], o: &CollageOptions, width: f64, cancel: Option<&CancelToken>) -> Result<RgbaImage> {
    let layout = collage_cells(files.len(), o.layout, width, o.gap);
    let bg = parse_color(&o.background);
    let mut canvas = RgbaImage::from_pixel(layout.width, layout.height, Rgba(bg));
    for (file, c) in files.iter().zip(layout.cells.iter()) {
        if let Some(t) = cancel {
            t.check()?;
        }
        let w = js_round_u32(c.w).max(1);
        let h = js_round_u32(c.h).max(1);
        let img = super::load(std::path::Path::new(&file.path), file.fmt)?;
        let mut tile = match o.fit {
            CollageFit::Cover => resize_cover(&img, w, h),
            CollageFit::Contain => resize_contain(&img, w, h, bg),
        };
        if o.radius > 0.0 {
            let r = js_round_u32(w.min(h) as f64 * o.radius / 100.0);
            mask_alpha(&mut tile, &rounded_mask(w, h, r)?);
        }
        imageops::overlay(&mut canvas, &tile, alohamora_core::js::js_round(c.x) as i64, alohamora_core::js::js_round(c.y) as i64);
    }
    Ok(canvas)
}

/// Port of runImageRedact's pixel work: black box, strong blur, or 16 px pixelation per region.
pub fn redact(img: &DynamicImage, regions: &[ImageRedactRegion]) -> RgbaImage {
    let mut base = img.to_rgba8();
    let source = base.clone();
    let (iw, ih) = base.dimensions();
    for reg in regions {
        let r = to_pixel_rect(clamp_norm_rect(reg.rect), iw, ih, false);
        let region = imageops::crop_imm(&source, r.x, r.y, r.w, r.h).to_image();
        let patch: RgbaImage = match reg.style {
            RedactStyle::Black => RgbaImage::from_pixel(r.w, r.h, Rgba([0, 0, 0, 255])),
            RedactStyle::Blur => imageops::fast_blur(&region, (r.w.min(r.h) as f32 / 6.0).max(12.0)),
            _ => {
                let small = imageops::resize(&region, r.w.div_ceil(16).max(1), r.h.div_ceil(16).max(1), FilterType::Nearest);
                imageops::resize(&small, r.w, r.h, FilterType::Nearest)
            }
        };
        imageops::replace(&mut base, &patch, r.x as i64, r.y as i64);
    }
    base
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors. (These functions are exercised by the self-test in Task 7.4.)

## Task 5.2 — engine: `pdf`

**Goal.** Open, render, read and change PDFs, and create new ones.

- `pdf/mod.rs` — PDFium. One global `Pdfium` instance, loaded from `paths::pdfium_dir()`. With the `thread_safe`
  feature every PDFium call is serialised behind a mutex, so any job thread may use it. Functions: `open` (with the
  user messages for password-protected and damaged files), `render_page` (at a given dpi, on white), `encode_page`,
  `info_with_thumbnail`, `thumbnails`, `extract_text` (positioned text for `pdf_reflow`) and `title`.
- `pdf/create.rs` — new PDFs with lopdf. JPEG pictures are embedded **as they are** (no re-encoding); other pictures
  become RGB + an alpha mask (SMask). `PdfBuilder::add_searchable_page` draws a page picture and puts invisible OCR text
  over it (text render mode 3, a glyphless font, a ToUnicode map), which makes the PDF searchable and selectable.
- `pdf/edit.rs` — changes to existing PDFs. Merge, split, organize (reorder/rotate/delete pages) and "remove all
  metadata" copy pages with PDFium's page import (fonts and images shared between pages are copied once). Document
  info (title, author, …) and image recompression (Compress PDF) use lopdf.

1. The glyphless font used for the invisible OCR text is Tesseract's `tessdata/pdf.ttf` (Apache-2.0, 572 bytes). Write
   it from this base64 text, then check its SHA-256:

**Run**
```bash
mkdir -p src-tauri/crates/engine/assets
node -e "require('fs').writeFileSync('src-tauri/crates/engine/assets/glyphless.ttf', Buffer.from(process.argv[1], 'base64'))" \
  "AAEAAAAKAIAAAwAgT1MvMlbeyJQAAAEoAAAAYGNtYXAACgA0AAABkAAAAB5nbHlmFSJBJAAAAbgAAAAYaGVhZAt48WUAAACsAAAANmhoZWEMAgQCAAAA5AAAACRobXR4BAAAAAAAAYgAAAAIbG9jYQAMAAAAAAGwAAAABm1heHAABAAFAAABCAAAACBuYW1l8usW2gAAAdAAAABLcG9zdAABAAEAAAIcAAAAIAABAAAAAQAAsJRxEF8PPPUEBwgAAAAAAM+a/G4AAAAA1MOn8gAAAAAEAAgAAAAAEAACAAAAAAAAAAEAAAgA//8AAAQAAAAAAAQAAAEAAAAAAAAAAAAAAAAAAAACAAEAAAACAAQAAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAwAAAZAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAR09PRwBAAAAAAAAB//8AAAABAAGAAAAAAAAAAAAAAAAAAAABAAAAAAAABAAAAAAAAAIAAQAAAAAAFAADAAAAAAAUAAYACgAAAAAAAAAAAAAAAAAMAAAAAQAAAAAEAAgAAAMAADEhESEEAPwACAAAAAADACoAAAADAAAABQAWAAAAAQAAAAAABQALABYAAwABBAkABQAWAAAAVgBlAHIAcwBpAG8AbgAgADEALgAwVmVyc2lvbiAxLjAAAAEAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA="
node -e "const h=require('crypto').createHash('sha256').update(require('fs').readFileSync('src-tauri/crates/engine/assets/glyphless.ttf')).digest('hex'); console.log(h); if (h!=='c7845420925a23d88ed830a63957b8af85a66a8daf8d9fc90e843673b2ef1a59') process.exit(1)"
```

2. The three source files:

**File `src-tauri/crates/engine/src/pdf/mod.rs`**

```rust
//! PDF reading and rendering with pdfium (replaces pdf.js in the hidden engine window).
//! One global `Pdfium`; the `thread_safe` feature serialises every pdfium call behind a mutex,
//! so any job thread may open, render and close documents.

pub mod create;
pub mod edit;

use std::path::Path;
use std::sync::OnceLock;

use alohamora_core::options::StillFormat;
use alohamora_core::pdf_reflow::{TextItem, TextPage};
use image::DynamicImage;
use pdfium_render::prelude::*;

use crate::fsutil::data_url;
use crate::{AppError, Result};

pub const MSG_PASSWORD: &str = "This PDF is password-protected. Remove the password first, then try again.";
pub const MSG_DAMAGED: &str = "This PDF could not be opened. It may be damaged.";

/// Pixel cap for one rendered page (pdf.js used 120 MP).
const MAX_RENDER_PIXELS: f64 = 120_000_000.0;

static PDFIUM: OnceLock<std::result::Result<Pdfium, String>> = OnceLock::new();

/// Bind pdfium from `<resources>/pdfium/` once.
pub fn pdfium() -> Result<&'static Pdfium> {
    let bound = PDFIUM.get_or_init(|| {
        let lib = Pdfium::pdfium_platform_library_name_at_path(&crate::paths::pdfium_dir());
        Pdfium::bind_to_library(&lib).map(Pdfium::new).map_err(|e| format!("{e:?} ({})", lib.display()))
    });
    bound.as_ref().map_err(|e| AppError::tool("The PDF engine could not be loaded.", e.clone()))
}

fn open_error(e: PdfiumError) -> AppError {
    let text = format!("{e:?}");
    if text.contains("Password") {
        AppError::user(MSG_PASSWORD)
    } else {
        AppError::user_with(MSG_DAMAGED, text)
    }
}

pub fn open(path: &Path) -> Result<PdfDocument<'static>> {
    pdfium()?.load_pdf_from_file(path, None).map_err(open_error)
}

/// Page sizes in points, after /Rotate (same as pdf.js viewport at scale 1).
pub fn page_sizes(doc: &PdfDocument) -> Vec<(f64, f64)> {
    doc.pages().iter().map(|p| (p.width().value as f64, p.height().value as f64)).collect()
}

fn pdf_err(e: PdfiumError) -> AppError {
    AppError::tool("The PDF engine failed", format!("{e:?}"))
}

/// Render one page at `dpi` on white. Very large pages are scaled down to stay under the pixel cap.
pub fn render_page(doc: &PdfDocument, index: usize, dpi: f64) -> Result<DynamicImage> {
    let page = doc.pages().get(index as PdfPageIndex).map_err(pdf_err)?;
    let mut scale = dpi / 72.0;
    let px = page.width().value as f64 * scale * page.height().value as f64 * scale;
    if px > MAX_RENDER_PIXELS {
        scale *= (MAX_RENDER_PIXELS / px).sqrt();
    }
    let config = PdfRenderConfig::new()
        .scale_page_by_factor(scale as f32)
        .render_form_data(true)
        .render_annotations(true);
    let bitmap = page.render_with_config(&config).map_err(pdf_err)?;
    let img = bitmap.as_image().map_err(pdf_err)?;
    // pdfium leaves transparent areas transparent; flatten so PNGs look like the printed page.
    Ok(DynamicImage::ImageRgb8(crate::image::encode::flatten(&img, [255, 255, 255])))
}

/// Encode a rendered page. `quality` is 0–1 like canvas.toBlob.
pub fn encode_page(img: &DynamicImage, fmt: StillFormat, quality: f64) -> Result<Vec<u8>> {
    match fmt {
        StillFormat::Png => crate::image::encode::png_bytes(img),
        StillFormat::Jpg => crate::image::encode::jpeg_bytes(img, (quality * 100.0) as f32),
    }
}

/// What `inspect` needs: page count, first page size and a small first-page thumbnail.
pub struct PdfInfo {
    pub pages: u32,
    pub first_width_pt: f64,
    pub first_height_pt: f64,
    pub thumbnail: Option<String>,
}

pub fn info_with_thumbnail(path: &Path, max_width: u32) -> Result<PdfInfo> {
    let doc = open(path)?;
    let sizes = page_sizes(&doc);
    let (w, h) = sizes.first().copied().unwrap_or((0.0, 0.0));
    let thumbnail = if sizes.is_empty() { None } else { thumbnail_of(&doc, 0, max_width).ok() };
    Ok(PdfInfo { pages: sizes.len() as u32, first_width_pt: w, first_height_pt: h, thumbnail })
}

fn thumbnail_of(doc: &PdfDocument, index: usize, max_width: u32) -> Result<String> {
    let page = doc.pages().get(index as PdfPageIndex).map_err(pdf_err)?;
    let dpi = 72.0 * max_width as f64 / page.width().value.max(1.0) as f64;
    let img = render_page(doc, index, dpi)?;
    Ok(data_url("image/jpeg", &crate::image::encode::jpeg_bytes(&img, 75.0)?))
}

/// JPEG data URLs for the page grid in the Organize panel (port of `pdf.thumbnails`).
pub fn thumbnails(path: &Path, max_width: u32, max_pages: Option<usize>) -> Result<Vec<String>> {
    let doc = open(path)?;
    let n = (doc.pages().len() as usize).min(max_pages.unwrap_or(500));
    (0..n).map(|i| thumbnail_of(&doc, i, max_width)).collect()
}

fn is_bold(font: &str) -> bool {
    let f = font.to_lowercase();
    ["bold", "black", "heavy", "semibold", "demi"].iter().any(|k| f.contains(k))
}

fn is_italic(font: &str) -> bool {
    let f = font.to_lowercase();
    f.contains("italic") || f.contains("oblique")
}

/// Text runs per page in the same shape pdf.js produced: x/y = left/baseline in top-left page space.
pub fn extract_text(doc: &PdfDocument) -> Result<Vec<TextPage>> {
    let mut pages = Vec::new();
    for page in doc.pages().iter() {
        let (pw, ph) = (page.width().value as f64, page.height().value as f64);
        let text = page.text().map_err(pdf_err)?;
        let mut items = Vec::new();
        for seg in text.segments().iter() {
            let s = seg.text();
            if s.trim().is_empty() {
                continue;
            }
            let b = seg.bounds();
            let (mut font_size, mut font) = (0.0, String::new());
            if let Ok(chars) = seg.chars() {
                if let Some(c) = chars.iter().find(|c| c.unicode_char().map(|ch| !ch.is_whitespace()).unwrap_or(false)) {
                    font_size = c.scaled_font_size().value as f64;
                    font = c.font_name();
                }
            }
            let h = (b.top().value - b.bottom().value) as f64;
            if font_size <= 0.0 {
                font_size = h;
            }
            items.push(TextItem {
                str: s,
                x: b.left().value as f64,
                y: ph - b.bottom().value as f64,
                w: (b.right().value - b.left().value) as f64,
                h: if h > 0.0 { h } else { font_size },
                font_size,
                bold: is_bold(&font),
                italic: is_italic(&font),
            });
        }
        pages.push(TextPage { width: pw, height: ph, items });
    }
    Ok(pages)
}

/// Read the document title (used by the self-test).
pub fn title(path: &Path) -> Result<Option<String>> {
    let doc = open(path)?;
    Ok(doc.metadata().get(PdfDocumentMetadataTagType::Title).map(|t| t.value().to_string()).filter(|t| !t.is_empty()))
}
```

**File `src-tauri/crates/engine/src/pdf/create.rs`**

```rust
//! Build new PDFs from pictures with lopdf (port of imagesToPdf / pageImagesToPdf / embeddableImage).

use std::path::Path;

use alohamora_core::image_meta::jpeg_sof_info;
use alohamora_core::options::{PdfMargin, PdfPageSize};
use alohamora_core::types::{FileInfo, Fmt};
use lopdf::{dictionary, Document, Object, ObjectId, Stream};

use crate::cancel::CancelToken;
use crate::{AppError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbedKind {
    /// JPEG bytes used as-is; `components` 1 = grey, 3 = colour.
    Jpeg { components: u8 },
    /// PNG bytes (only for pictures with transparency).
    Png,
}

/// A picture ready to put into a PDF or DOCX.
#[derive(Debug, Clone)]
pub struct EmbeddableImage {
    pub kind: EmbedKind,
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Original JPEG bytes when safe (upright, grey or colour); otherwise re-encode (PNG only if transparent).
pub fn embeddable_image(file: &FileInfo) -> Result<EmbeddableImage> {
    let path = Path::new(&file.path);
    if file.fmt == Some(Fmt::Jpg) {
        let bytes = std::fs::read(path)?;
        if let Some((w, h, c)) = jpeg_sof_info(&bytes) {
            if (c == 1 || c == 3) && w > 0 && h > 0 && crate::image::exif::orientation(path) == 1 {
                return Ok(EmbeddableImage { kind: EmbedKind::Jpeg { components: c }, data: bytes, width: w, height: h });
            }
        }
    }
    let img = crate::image::load(path, file.fmt)?;
    let opaque = !img.color().has_alpha() || img.to_rgba8().pixels().all(|p| p[3] == 255);
    if opaque {
        let data = crate::image::encode::jpeg_bytes(&img, 92.0)?;
        Ok(EmbeddableImage { kind: EmbedKind::Jpeg { components: 3 }, data, width: img.width(), height: img.height() })
    } else {
        let data = crate::image::encode::png_bytes(&img)?;
        Ok(EmbeddableImage { kind: EmbedKind::Png, data, width: img.width(), height: img.height() })
    }
}

/// Tesseract's glyph-less font (tessdata/pdf.ttf, Apache-2.0): one empty glyph.
const GLYPHLESS_TTF: &[u8] = include_bytes!("../../assets/glyphless.ttf");

/// CID = UTF-16 code unit, so the identity map gives the text back.
const TO_UNICODE: &str = "/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identify-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
";

/// One recognised word: its box in page-picture pixels and its text.
#[derive(Debug, Clone)]
pub struct OcrWord {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
    pub text: String,
}

/// A page for a searchable PDF: the page picture (JPEG) at `dpi` and the words found on it.
pub struct SearchablePage {
    pub jpeg: Vec<u8>,
    pub width_px: u32,
    pub height_px: u32,
    pub dpi: f64,
    pub words: Vec<OcrWord>,
}

/// Collects pages; each page shows one picture.
pub struct PdfBuilder {
    doc: Document,
    pages_id: ObjectId,
    kids: Vec<Object>,
    /// The invisible-text font, created on first use by `add_searchable_page`.
    glyphless: Option<ObjectId>,
}

impl Default for PdfBuilder {
    fn default() -> Self {
        Self::new()
    }
}

fn num(v: f64) -> String {
    let s = format!("{v:.4}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

impl PdfBuilder {
    pub fn new() -> Self {
        let mut doc = Document::with_version("1.7");
        let pages_id = doc.new_object_id();
        PdfBuilder { doc, pages_id, kids: Vec::new(), glyphless: None }
    }

    fn image_xobject(&mut self, img: &EmbeddableImage) -> Result<ObjectId> {
        let (w, h) = (img.width as i64, img.height as i64);
        match img.kind {
            EmbedKind::Jpeg { components } => {
                let cs = if components == 1 { "DeviceGray" } else { "DeviceRGB" };
                let dict = dictionary! {
                    "Type" => "XObject", "Subtype" => "Image", "Width" => w, "Height" => h,
                    "ColorSpace" => cs, "BitsPerComponent" => 8, "Filter" => "DCTDecode",
                };
                Ok(self.doc.add_object(Stream::new(dict, img.data.clone()).with_compression(false)))
            }
            EmbedKind::Png => {
                let rgba = image::load_from_memory(&img.data).map_err(crate::image::unreadable)?.to_rgba8();
                let mut rgb = Vec::with_capacity(rgba.len() / 4 * 3);
                let mut alpha = Vec::with_capacity(rgba.len() / 4);
                for p in rgba.pixels() {
                    rgb.extend_from_slice(&p.0[..3]);
                    alpha.push(p[3]);
                }
                let mut mask = Stream::new(
                    dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => w, "Height" => h, "ColorSpace" => "DeviceGray", "BitsPerComponent" => 8 },
                    alpha,
                );
                mask.compress().map_err(AppError::other)?;
                let mask_id = self.doc.add_object(mask);
                let mut s = Stream::new(
                    dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => w, "Height" => h, "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "SMask" => mask_id },
                    rgb,
                );
                s.compress().map_err(AppError::other)?;
                Ok(self.doc.add_object(s))
            }
        }
    }

    /// Add a `page_w` × `page_h` pt page with the picture drawn at (x, y) with size (w, h), PDF coordinates (origin bottom-left).
    #[allow(clippy::too_many_arguments)]
    pub fn add_image_page(&mut self, img: &EmbeddableImage, page_w: f64, page_h: f64, x: f64, y: f64, w: f64, h: f64) -> Result<()> {
        let img_id = self.image_xobject(img)?;
        let ops = format!("q {} 0 0 {} {} {} cm /Im0 Do Q", num(w), num(h), num(x), num(y));
        let content_id = self.doc.add_object(Stream::new(dictionary! {}, ops.into_bytes()));
        let page_id = self.doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => self.pages_id,
            "MediaBox" => vec![0.into(), 0.into(), Object::Real(page_w as f32), Object::Real(page_h as f32)],
            "Contents" => content_id,
            "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => img_id } },
        });
        self.kids.push(page_id.into());
        Ok(())
    }

    /// Tesseract's trick for searchable PDFs: a font whose every character is one blank glyph (glyph 1,
    /// 500/1000 em wide), Identity-H encoding with UTF-16 codes, and a ToUnicode map so copy/search work.
    fn glyphless_font(&mut self) -> Result<ObjectId> {
        if let Some(id) = self.glyphless {
            return Ok(id);
        }
        let mut font_file = Stream::new(dictionary! { "Length1" => GLYPHLESS_TTF.len() as i64 }, GLYPHLESS_TTF.to_vec());
        font_file.compress().map_err(AppError::other)?;
        let font_file_id = self.doc.add_object(font_file);
        let descriptor = self.doc.add_object(dictionary! {
            "Type" => "FontDescriptor", "FontName" => "GlyphLessFont", "Flags" => 5,
            "FontBBox" => vec![0.into(), 0.into(), 500.into(), 1000.into()],
            "ItalicAngle" => 0, "Ascent" => 1000, "Descent" => -1, "CapHeight" => 1000, "StemV" => 80,
            "FontFile2" => font_file_id,
        });
        // Every CID (2 bytes) maps to glyph 1.
        let map: Vec<u8> = (0..65536).flat_map(|_| [0u8, 1u8]).collect();
        let mut map_stream = Stream::new(dictionary! {}, map);
        map_stream.compress().map_err(AppError::other)?;
        let map_id = self.doc.add_object(map_stream);
        let cid_font = self.doc.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "CIDFontType2", "BaseFont" => "GlyphLessFont",
            "CIDSystemInfo" => dictionary! { "Registry" => Object::string_literal("Adobe"), "Ordering" => Object::string_literal("Identity"), "Supplement" => 0 },
            "FontDescriptor" => descriptor, "DW" => 500, "CIDToGIDMap" => map_id,
        });
        let to_unicode = self.doc.add_object(Stream::new(dictionary! {}, TO_UNICODE.as_bytes().to_vec()));
        let id = self.doc.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type0", "BaseFont" => "GlyphLessFont", "Encoding" => "Identity-H",
            "DescendantFonts" => vec![cid_font.into()], "ToUnicode" => to_unicode,
        });
        self.glyphless = Some(id);
        Ok(id)
    }

    /// Page = the scanned picture + invisible, selectable text placed over each recognised word.
    pub fn add_searchable_page(&mut self, p: &SearchablePage) -> Result<()> {
        let k = 72.0 / p.dpi;
        let (page_w, page_h) = (p.width_px as f64 * k, p.height_px as f64 * k);
        let (w, h, c) = jpeg_sof_info(&p.jpeg).ok_or_else(|| AppError::other("OCR page picture is not a JPEG"))?;
        let img_id = self.image_xobject(&EmbeddableImage { kind: EmbedKind::Jpeg { components: c }, data: p.jpeg.clone(), width: w, height: h })?;
        let font_id = self.glyphless_font()?;
        let mut ops = format!("q {} 0 0 {} 0 0 cm /Im0 Do Q\nBT 3 Tr\n", num(page_w), num(page_h));
        for word in &p.words {
            let units: Vec<u16> = word.text.encode_utf16().collect();
            if units.is_empty() || word.width <= 0.0 || word.height <= 0.0 {
                continue;
            }
            let size = (word.height * k).max(1.0);
            let natural = units.len() as f64 * 0.5 * size; // each glyph is 500/1000 em wide
            let stretch = 100.0 * word.width * k / natural;
            let hex: String = units.iter().map(|u| format!("{u:04X}")).collect();
            let (x, y) = (word.left * k, page_h - (word.top + word.height) * k);
            ops.push_str(&format!("/F1 {} Tf {} Tz 1 0 0 1 {} {} Tm <{hex}> Tj\n", num(size), num(stretch), num(x), num(y)));
        }
        ops.push_str("ET\n");
        let content_id = self.doc.add_object(Stream::new(dictionary! {}, ops.into_bytes()));
        let page_id = self.doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => self.pages_id,
            "MediaBox" => vec![0.into(), 0.into(), Object::Real(page_w as f32), Object::Real(page_h as f32)],
            "Contents" => content_id,
            "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => img_id }, "Font" => dictionary! { "F1" => font_id } },
        });
        self.kids.push(page_id.into());
        Ok(())
    }

    pub fn page_count(&self) -> usize {
        self.kids.len()
    }

    /// Finish and return the file bytes (object streams on, like pdf-lib's `useObjectStreams`).
    pub fn finish(mut self) -> Result<Vec<u8>> {
        let count = self.kids.len() as i64;
        self.doc.objects.insert(self.pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => self.kids, "Count" => count }));
        let catalog = self.doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => self.pages_id });
        self.doc.trailer.set("Root", catalog);
        self.doc.compress();
        let mut out = Vec::new();
        self.doc.save_modern(&mut out).map_err(AppError::other)?;
        Ok(out)
    }
}

const A4: (f64, f64) = (595.28, 841.89);
const LETTER: (f64, f64) = (612.0, 792.0);

fn margin_pt(m: PdfMargin) -> f64 {
    match m {
        PdfMargin::None => 0.0,
        PdfMargin::Small => 18.0,
        PdfMargin::Large => 36.0,
    }
}

/// Port of imagesToPdf: one page per picture. "fit" = picture size at 96 DPI (capped near A3).
pub fn images_to_pdf(
    files: &[FileInfo], page_size: PdfPageSize, margin: PdfMargin, out: &Path,
    on_progress: &dyn Fn(f64), cancel: &CancelToken,
) -> Result<()> {
    let m = margin_pt(margin);
    let mut b = PdfBuilder::new();
    for (i, f) in files.iter().enumerate() {
        cancel.check()?;
        let img = embeddable_image(f)?;
        let (iw, ih) = (img.width as f64, img.height as f64);
        let (pw, ph) = match page_size {
            PdfPageSize::Fit => {
                let k = (1190.0 / (iw * 0.75).max(ih * 0.75)).min(1.0);
                (iw * 0.75 * k + 2.0 * m, ih * 0.75 * k + 2.0 * m)
            }
            other => {
                let (a, c) = if other == PdfPageSize::A4 { A4 } else { LETTER };
                if iw > ih { (c, a) } else { (a, c) }
            }
        };
        let scale = ((pw - 2.0 * m) / iw).min((ph - 2.0 * m) / ih);
        let (w, h) = (iw * scale, ih * scale);
        b.add_image_page(&img, pw, ph, (pw - w) / 2.0, (ph - h) / 2.0, w, h)?;
        on_progress((i + 1) as f64 / files.len() as f64);
    }
    std::fs::write(out, b.finish()?)?;
    Ok(())
}

/// One page per JPEG, the picture filling the page (used by "Max" compression).
pub fn page_images_to_pdf(pages: &[(Vec<u8>, f64, f64)]) -> Result<Vec<u8>> {
    let mut b = PdfBuilder::new();
    for (jpeg, w_pt, h_pt) in pages {
        let (w, h, c) = jpeg_sof_info(jpeg).ok_or_else(|| AppError::other("rendered page is not a JPEG"))?;
        let img = EmbeddableImage { kind: EmbedKind::Jpeg { components: c }, data: jpeg.clone(), width: w, height: h };
        b.add_image_page(&img, *w_pt, *h_pt, 0.0, 0.0, *w_pt, *h_pt)?;
    }
    b.finish()
}
```

**File `src-tauri/crates/engine/src/pdf/edit.rs`**

```rust
//! Change existing PDFs. Page work (merge/split/organize/strip) uses pdfium page import, which copies
//! shared fonts and images once. Metadata and image recompression use lopdf.

use std::path::Path;

use alohamora_core::image_meta::jpeg_sof_info;
use alohamora_core::options::PdfCompressLevel;
use lopdf::{Document, Object};
use pdfium_render::prelude::*;

use super::{open, pdfium, MSG_DAMAGED, MSG_PASSWORD};
use crate::cancel::CancelToken;
use crate::{AppError, Result};

fn pdf_err(e: PdfiumError) -> AppError {
    AppError::tool("The PDF engine failed", format!("{e:?}"))
}

/// "1,3,4" (1-based) page string for pdfium's import, in the given order.
fn page_list(indexes: &[usize]) -> String {
    indexes.iter().map(|i| (i + 1).to_string()).collect::<Vec<_>>().join(",")
}

/// New PDF with the given pages (0-based, in this order).
pub fn extract_pages(src: &PdfDocument, indexes: &[usize]) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    doc.pages_mut().copy_pages_from_document(src, &page_list(indexes), 0).map_err(pdf_err)?;
    doc.save_to_bytes().map_err(pdf_err)
}

/// All pages of all files, in order.
pub fn merge(paths: &[&Path], on_progress: &dyn Fn(f64), cancel: &CancelToken) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    for (i, p) in paths.iter().enumerate() {
        cancel.check()?;
        let src = open(p)?;
        doc.pages_mut().append(&src).map_err(pdf_err)?;
        on_progress((i + 1) as f64 / paths.len() as f64);
    }
    doc.save_to_bytes().map_err(pdf_err)
}

fn degrees(r: PdfPageRenderRotation) -> i32 {
    match r {
        PdfPageRenderRotation::None => 0,
        PdfPageRenderRotation::Degrees90 => 90,
        PdfPageRenderRotation::Degrees180 => 180,
        PdfPageRenderRotation::Degrees270 => 270,
    }
}

fn rotation(deg: i32) -> PdfPageRenderRotation {
    match deg.rem_euclid(360) {
        90 => PdfPageRenderRotation::Degrees90,
        180 => PdfPageRenderRotation::Degrees180,
        270 => PdfPageRenderRotation::Degrees270,
        _ => PdfPageRenderRotation::None,
    }
}

/// Port of organizePdf: pages in a new order, each with extra rotation (multiples of 90).
pub fn organize(src: &PdfDocument, pages: &[(usize, i32)]) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    let order: Vec<usize> = pages.iter().map(|p| p.0).collect();
    doc.pages_mut().copy_pages_from_document(src, &page_list(&order), 0).map_err(pdf_err)?;
    for (i, (_, extra)) in pages.iter().enumerate() {
        if *extra % 360 == 0 {
            continue;
        }
        let mut page = doc.pages().get(i as PdfPageIndex).map_err(pdf_err)?;
        let current = page.rotation().map(degrees).unwrap_or(0);
        page.set_rotation(rotation(current + extra));
    }
    doc.save_to_bytes().map_err(pdf_err)
}

/// Same pages, no document information, XMP, bookmarks or forms (port of "remove all" metadata).
pub fn strip_metadata(src: &PdfDocument) -> Result<Vec<u8>> {
    let mut doc = pdfium()?.create_new_pdf().map_err(pdf_err)?;
    doc.pages_mut().append(src).map_err(pdf_err)?;
    doc.save_to_bytes().map_err(pdf_err)
}

// ---------- lopdf ----------

/// Load with lopdf, using the same user-facing errors as pdfium.
pub fn load_lopdf(path: &Path) -> Result<Document> {
    let mut doc = Document::load(path).map_err(|e| {
        let t = e.to_string();
        if t.to_lowercase().contains("encrypt") || t.to_lowercase().contains("password") { AppError::user(MSG_PASSWORD) } else { AppError::user_with(MSG_DAMAGED, t) }
    })?;
    if doc.is_encrypted() && doc.decrypt("").is_err() {
        return Err(AppError::user(MSG_PASSWORD));
    }
    Ok(doc)
}

/// PDF text string: plain ASCII as a literal, anything else as UTF-16BE with a BOM.
fn text_string(s: &str) -> Object {
    if s.is_ascii() {
        return Object::string_literal(s);
    }
    let mut b = vec![0xfe, 0xff];
    for u in s.encode_utf16() {
        b.extend_from_slice(&u.to_be_bytes());
    }
    Object::String(b, lopdf::StringFormat::Hexadecimal)
}

/// "D:YYYYMMDDHHmmSSZ" for now (UTC).
fn pdf_date_now() -> String {
    let (y, mo, d, h, mi, s) = alohamora_core::time::utc_from_unix(alohamora_core::time::unix_now());
    format!("D:{y:04}{mo:02}{d:02}{h:02}{mi:02}{s:02}Z")
}

/// Port of the "edit" branch of runPdfMetadata. Keywords are split on commas and joined with spaces like pdf-lib.
pub fn set_info(path: &Path, title: &str, author: &str, subject: &str, keywords: &str) -> Result<Vec<u8>> {
    let mut doc = load_lopdf(path)?;
    let kw: Vec<&str> = keywords.split(',').map(|k| k.trim()).filter(|k| !k.is_empty()).collect();
    let info_id = match doc.trailer.get(b"Info").and_then(|o| o.as_reference()) {
        Ok(id) => id,
        Err(_) => {
            let id = doc.add_object(lopdf::Dictionary::new());
            doc.trailer.set("Info", id);
            id
        }
    };
    let info = doc.get_dictionary_mut(info_id).map_err(|e| AppError::user_with(MSG_DAMAGED, e.to_string()))?;
    info.set("Title", text_string(title));
    info.set("Author", text_string(author));
    info.set("Subject", text_string(subject));
    info.set("Keywords", text_string(&kw.join(" ")));
    info.set("ModDate", Object::string_literal(pdf_date_now()));
    let mut out = Vec::new();
    doc.save_modern(&mut out).map_err(AppError::other)?;
    Ok(out)
}

/// Port of recompressPdfImages: re-encode embedded JPEGs smaller. Returns (file bytes, images changed).
pub fn recompress_images(path: &Path, level: PdfCompressLevel, on_progress: &dyn Fn(f64), cancel: &CancelToken) -> Result<(Vec<u8>, usize)> {
    let (max_side, quality) = match level {
        PdfCompressLevel::Light => (3000, 82.0),
        PdfCompressLevel::Balanced => (2000, 70.0),
        _ => (1400, 55.0),
    };
    let mut doc = load_lopdf(path)?;
    let ids: Vec<_> = doc.objects.keys().copied().collect();
    let mut changed = 0;
    for (k, id) in ids.iter().enumerate() {
        cancel.check()?;
        on_progress(k as f64 / ids.len().max(1) as f64);
        let Some(Object::Stream(stream)) = doc.objects.get_mut(id) else { continue };
        let d = &stream.dict;
        let is_image = d.get(b"Subtype").and_then(|o| o.as_name()).map(|n| n == b"Image").unwrap_or(false);
        let is_dct = match d.get(b"Filter") {
            Ok(Object::Name(n)) => n == b"DCTDecode",
            Ok(Object::Array(a)) => a.len() == 1 && a[0].as_name().map(|n| n == b"DCTDecode").unwrap_or(false),
            _ => false,
        };
        let cmyk = d.get(b"ColorSpace").and_then(|o| o.as_name()).map(|n| n == b"DeviceCMYK").unwrap_or(false);
        if !is_image || !is_dct || cmyk || d.has(b"Decode") {
            continue;
        }
        let input = stream.content.clone();
        if !matches!(jpeg_sof_info(&input), Some((_, _, 1 | 3))) {
            continue; // CMYK or unreadable JPEG: leave untouched
        }
        let Ok(img) = image::load_from_memory_with_format(&input, image::ImageFormat::Jpeg) else { continue };
        let img = crate::image::fit_inside(img, max_side, max_side, false);
        let Ok(out) = crate::image::encode::jpeg_bytes(&img, quality) else { continue };
        if out.len() as f64 >= input.len() as f64 * 0.9 {
            continue;
        }
        stream.dict.set("Width", img.width() as i64);
        stream.dict.set("Height", img.height() as i64);
        stream.dict.set("ColorSpace", "DeviceRGB"); // jpeg_bytes always writes colour JPEGs
        stream.dict.set("BitsPerComponent", 8);
        stream.dict.set("Filter", "DCTDecode");
        stream.dict.remove(b"DecodeParms");
        stream.set_content(out);
        changed += 1;
    }
    let mut bytes = Vec::new();
    doc.save_modern(&mut bytes).map_err(AppError::other)?;
    Ok((bytes, changed))
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** the hash printed is `c7845420925a23d88ed830a63957b8af85a66a8daf8d9fc90e843673b2ef1a59` and `cargo check`
has no errors.

## Task 5.3 — engine: `text_pdf`

**Goal.** Text → PDF without a browser.

Typst lays out the text with a fixed template: 16 mm side margins, 18 mm top/bottom margins, the font family and size from
the options, every line kept as it is (like CSS `white-space: pre-wrap`). Very long words get invisible break points
every 40 characters so they wrap. Fonts: the bundled Noto fonts first, then system fonts (for other scripts).

**Offline:** `typst-as-lib` is used **without** its `packages` feature, so Typst can never download packages. Do not
add that feature.

**File `src-tauri/crates/engine/src/text_pdf.rs`**

```rust
//! Text → PDF with Typst (replaces Chromium printToPDF of textToHtml). Fully offline:
//! no package downloads (typst-as-lib without the `packages` feature), fonts = bundled + system.

use std::sync::OnceLock;

use alohamora_core::options::{ConvertOptions, PageSize, TextFont, TextSize};
use alohamora_core::text::text_size_pt;
use typst::foundations::{Array, Dict, IntoValue};
use typst_as_lib::typst_kit_options::TypstKitFontOptions;
use typst_as_lib::{TypstEngine, TypstTemplateMainFile};

use crate::{AppError, Result};

/// Page: 16 mm left/right, 18 mm top/bottom like the Electron @page rule. Text is drawn line by line
/// so spaces and empty lines are kept (CSS `white-space: pre-wrap`).
const TEMPLATE: &str = r##"#import sys: inputs
#set document(title: inputs.title)
#set page(paper: inputs.paper, margin: (x: 16mm, y: 18mm))
#set text(font: inputs.fonts, size: inputs.size * 1pt, fill: rgb("#111111"), hyphenate: false)
#set par(justify: false, leading: 0.7em, spacing: 0.7em)
#for line in inputs.lines {
  line
  linebreak()
}
"##;

fn engine() -> &'static TypstEngine<TypstTemplateMainFile> {
    static ENGINE: OnceLock<TypstEngine<TypstTemplateMainFile>> = OnceLock::new();
    ENGINE.get_or_init(|| {
        TypstEngine::builder()
            .main_file(TEMPLATE)
            .search_fonts_with(
                TypstKitFontOptions::default()
                    .include_system_fonts(true)
                    .include_dirs([crate::paths::fonts_dir()]),
            )
            .build()
    })
}

/// Bundled family first, then common fallbacks; Typst also falls back to any font that has the glyph.
fn font_families(font: TextFont) -> Vec<&'static str> {
    match font {
        TextFont::Sans => vec!["Noto Sans", "DejaVu Sans", "Arial", "Helvetica"],
        TextFont::Serif => vec!["Noto Serif", "DejaVu Serif", "Times New Roman", "Times"],
        TextFont::Mono | TextFont::Original => vec!["Noto Sans Mono", "DejaVu Sans Mono", "Consolas", "Menlo"],
    }
}

fn paper(size: PageSize) -> &'static str {
    match size {
        PageSize::A4 => "a4",
        PageSize::Letter => "us-letter",
        PageSize::A5 => "a5",
    }
}

/// Tabs become 8 spaces; very long runs without spaces get invisible break points (CSS `overflow-wrap: anywhere`).
fn prepare_line(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut run = 0;
    for ch in line.replace('\t', "        ").chars() {
        if ch.is_whitespace() {
            run = 0;
        } else {
            run += 1;
            if run > 40 {
                out.push('\u{200B}');
                run = 1;
            }
        }
        out.push(ch);
    }
    out
}

/// Typeset `text` with the convert options (font, text size, page size) and return PDF bytes.
pub fn text_to_pdf(text: &str, title: &str, opts: &ConvertOptions) -> Result<Vec<u8>> {
    let font = opts.font.unwrap_or(TextFont::Mono);
    let size = text_size_pt(opts.text_size.unwrap_or(TextSize::Medium));
    text_to_pdf_with(text, title, font, size, opts.page_size.unwrap_or(PageSize::A4))
}

/// Typeset `text` and return PDF bytes. `title` goes into the PDF document title.
pub fn text_to_pdf_with(text: &str, title: &str, font: TextFont, size_pt: f64, page: PageSize) -> Result<Vec<u8>> {
    let lines: Array = text.replace("\r\n", "\n").replace('\r', "\n").split('\n').map(|l| prepare_line(l).into_value()).collect();
    let fonts: Array = font_families(font).into_iter().map(|f| f.into_value()).collect();
    let mut inputs = Dict::new();
    inputs.insert("title".into(), title.into_value());
    inputs.insert("paper".into(), paper(page).into_value());
    inputs.insert("size".into(), size_pt.into_value());
    inputs.insert("fonts".into(), fonts.into_value());
    inputs.insert("lines".into(), lines.into_value());
    // The document type (PagedDocument) is inferred from typst_pdf::pdf below.
    let doc = engine()
        .compile_with_input(inputs)
        .output
        .map_err(|e| AppError::tool("Could not lay out the text as a PDF", format!("{e:?}")))?;
    typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default())
        .map_err(|e| AppError::tool("Could not write the PDF", format!("{e:?}")))
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors.

## Task 5.4 — engine: `docx`, `epub`

**Goal.** Write Word and EPUB files.

- `docx.rs` — a small DOCX writer (a DOCX is a zip of XML files). Three uses: pictures → DOCX (one picture per page),
  PDF text → DOCX (headings 1–3, bullet lists, paragraphs) and PDF pages → DOCX (one page picture per section, page size
  taken from the PDF).
- `epub.rs` — EPUB 3, reflowable (chapters of text) or fixed-layout (one picture per page). The `mimetype` file must
  be the first zip entry and stored without compression; `pack` does that.

**File `src-tauri/crates/engine/src/docx.rs`**

```rust
//! Minimal DOCX writer (port of docxWriter.ts). A DOCX is a zip of XML parts; we write only what Word,
//! LibreOffice and Pages need: content types, relationships, styles (Heading1–3), bullet numbering,
//! core properties, the document body and the pictures.

use std::io::{Cursor, Write};

use alohamora_core::pdf_reflow::{Block, BlockKind, Run};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::pdf::create::{EmbedKind, EmbeddableImage};
use crate::{AppError, Result};

/// EMU (English Metric Units) per pixel at 96 DPI.
const EMU_PER_PX: u64 = 9525;
/// A4 in twips with 1-inch margins (the docx npm package default).
const A4_SECTION: &str = r#"<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>"#;

const CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>"#;

const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>"#;

const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>"#;

const NUMBERING: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>"#;

/// Escape for XML text and drop characters XML 1.0 forbids (PDF text often contains control characters).
fn xml_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\t' | '\n' | '\r' => out.push(' '),
            c if (c as u32) < 0x20 || c == '\u{FFFE}' || c == '\u{FFFF}' => {}
            c => out.push(c),
        }
    }
    out
}

/// Collects the body and the pictures, then zips everything.
struct DocxBuilder {
    body: String,
    media: Vec<(String, Vec<u8>)>,
    title: String,
}

impl DocxBuilder {
    fn new(title: &str) -> Self {
        DocxBuilder { body: String::new(), media: Vec::new(), title: title.to_string() }
    }

    /// Add a picture to the package and return its inline-drawing run XML.
    fn picture_run(&mut self, data: &[u8], kind: EmbedKind, width_px: u64, height_px: u64) -> String {
        let n = self.media.len() + 1;
        let ext = if kind == EmbedKind::Png { "png" } else { "jpeg" };
        self.media.push((format!("image{n}.{ext}"), data.to_vec()));
        let (cx, cy) = (width_px * EMU_PER_PX, height_px * EMU_PER_PX);
        format!(
            r#"<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{n}" name="Picture {n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{n}" name="image{n}.{ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg{n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"#
        )
    }

    fn page_break(&mut self) {
        self.body.push_str(r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#);
    }

    fn runs_xml(runs: &[Run]) -> String {
        runs.iter()
            .map(|r| {
                let mut props = String::new();
                if r.bold { props.push_str("<w:b/>"); }
                if r.italic { props.push_str("<w:i/>"); }
                let rpr = if props.is_empty() { String::new() } else { format!("<w:rPr>{props}</w:rPr>") };
                format!(r#"<w:r>{rpr}<w:t xml:space="preserve">{}</w:t></w:r>"#, xml_text(&r.text))
            })
            .collect()
    }

    /// Zip the package. `final_section` is the body's last sectPr.
    fn finish(self, final_section: &str) -> Result<Vec<u8>> {
        let document = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>{}{final_section}</w:body></w:document>"#,
            self.body
        );
        let mut rels = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>"#);
        for (i, (name, _)) in self.media.iter().enumerate() {
            rels.push_str(&format!(
                r#"<Relationship Id="rIdImg{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{name}"/>"#,
                i + 1
            ));
        }
        rels.push_str("</Relationships>");
        let created = alohamora_core::time::iso_utc(alohamora_core::time::unix_now());
        let core = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{}</dc:title><dc:creator>Alohamora</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{created}</dcterms:modified></cp:coreProperties>"#,
            xml_text(&self.title)
        );

        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let zerr = |e: zip::result::ZipError| AppError::other(format!("zip: {e}"));
        let mut parts: Vec<(String, Vec<u8>)> = vec![
            ("[Content_Types].xml".into(), CONTENT_TYPES.as_bytes().to_vec()),
            ("_rels/.rels".into(), ROOT_RELS.as_bytes().to_vec()),
            ("docProps/core.xml".into(), core.into_bytes()),
            ("word/document.xml".into(), document.into_bytes()),
            ("word/_rels/document.xml.rels".into(), rels.into_bytes()),
            ("word/styles.xml".into(), STYLES.as_bytes().to_vec()),
            ("word/numbering.xml".into(), NUMBERING.as_bytes().to_vec()),
        ];
        for (name, data) in self.media {
            parts.push((format!("word/media/{name}"), data));
        }
        for (name, data) in parts {
            zip.start_file(name, opts).map_err(zerr)?;
            zip.write_all(&data)?;
        }
        Ok(zip.finish().map_err(zerr)?.into_inner())
    }
}

/// One picture per page, scaled to fit 6.5 × 9 inches (624 × 864 px at 96 DPI), centred.
pub fn images_to_docx(images: &[EmbeddableImage]) -> Result<Vec<u8>> {
    let mut b = DocxBuilder::new("");
    for (i, img) in images.iter().enumerate() {
        let k = (624.0 / img.width as f64).min(864.0 / img.height as f64).min(1.0);
        let (w, h) = ((img.width as f64 * k).round() as u64, (img.height as f64 * k).round() as u64);
        let run = b.picture_run(&img.data, img.kind, w, h);
        b.body.push_str(&format!(r#"<w:p><w:pPr><w:jc w:val="center"/></w:pPr>{run}</w:p>"#));
        if i + 1 < images.len() {
            b.page_break();
        }
    }
    b.finish(A4_SECTION)
}

/// Reflowed text: headings use Heading1–3, list items use bullets, paragraphs get 8 pt after.
pub fn blocks_to_docx(blocks: &[Block], title: &str) -> Result<Vec<u8>> {
    let mut b = DocxBuilder::new(title);
    for block in blocks {
        match block {
            Block::PageBreak => b.page_break(),
            Block::Text { kind, runs } => {
                let ppr = match kind {
                    BlockKind::H1 => r#"<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>"#,
                    BlockKind::H2 => r#"<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>"#,
                    BlockKind::H3 => r#"<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>"#,
                    BlockKind::Li => r#"<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>"#,
                    BlockKind::P => r#"<w:pPr><w:spacing w:after="160"/></w:pPr>"#,
                };
                b.body.push_str(&format!("<w:p>{ppr}{}</w:p>", DocxBuilder::runs_xml(runs)));
            }
        }
    }
    b.finish(A4_SECTION)
}

fn page_section(w_pt: f64, h_pt: f64) -> String {
    let (w, h) = ((w_pt * 20.0).round() as i64, (h_pt * 20.0).round() as i64);
    let orient = if w > h { r#" w:orient="landscape""# } else { "" };
    format!(r#"<w:sectPr><w:pgSz w:w="{w}" w:h="{h}"{orient}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>"#)
}

/// "Exact look": each PDF page becomes a full-page picture in its own section (page size = PDF page size).
pub fn page_images_to_docx(pages: &[(Vec<u8>, f64, f64)]) -> Result<Vec<u8>> {
    let mut b = DocxBuilder::new("");
    for (i, (jpeg, w_pt, h_pt)) in pages.iter().enumerate() {
        let w = (w_pt * 96.0 / 72.0 * 0.98).round() as u64;
        let h = (h_pt * 96.0 / 72.0 * 0.98).round() as u64;
        let run = b.picture_run(jpeg, EmbedKind::Jpeg { components: 3 }, w, h);
        // A section ends with the paragraph that carries its sectPr; the last section's sectPr closes the body.
        let ppr = if i + 1 < pages.len() { format!("<w:pPr><w:spacing w:before=\"0\" w:after=\"0\"/>{}</w:pPr>", page_section(*w_pt, *h_pt)) } else { r#"<w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>"#.to_string() };
        b.body.push_str(&format!("<w:p>{ppr}{run}</w:p>"));
    }
    let last = pages.last().map(|(_, w, h)| page_section(*w, *h)).unwrap_or_else(|| A4_SECTION.to_string());
    b.finish(&last)
}
```

**File `src-tauri/crates/engine/src/epub.rs`**

```rust
//! EPUB 3 writer (port of epubWriter.ts + epubTemplates.ts). EPUB is an OUTPUT format only (PDF → EPUB).
//! `mimetype` must be the first zip entry, stored (not compressed), with no extra field, so it sits at byte 30.

use std::io::{Cursor, Write};

use alohamora_core::text::escape_xml;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::{AppError, Result};

pub struct EpubMeta {
    pub title: String,
    pub author: Option<String>,
    pub lang: String,
}

pub struct Chapter {
    pub title: String,
    pub body_xhtml: String,
}

pub struct FixedPage {
    pub jpeg: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

const STYLE_CSS: &str = "body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.25; }
p { margin: 0 0 0.8em; text-align: justify; }
ul { margin: 0 0 0.8em 1.2em; }";

fn chapter_xhtml(title: &str, body: &str, lang: &str) -> String {
    let (t, l) = (escape_xml(title), escape_xml(lang));
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\" xml:lang=\"{l}\" lang=\"{l}\">
<head><meta charset=\"utf-8\"/><title>{t}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/></head>
<body>
{body}
</body>
</html>")
}

fn fixed_page_xhtml(title: &str, img: &str, w: u32, h: u32) -> String {
    let (t, i) = (escape_xml(title), escape_xml(img));
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\">
<head><meta charset=\"utf-8\"/><title>{t}</title><meta name=\"viewport\" content=\"width={w}, height={h}\"/>
<style>html,body{{margin:0;padding:0}}img{{display:block;width:{w}px;height:{h}px}}</style></head>
<body><img src=\"{i}\" alt=\"{t}\"/></body>
</html>")
}

fn nav_xhtml(title: &str, items: &[(String, String)]) -> String {
    let list: Vec<String> = items.iter().map(|(href, t)| format!("<li><a href=\"{}\">{}</a></li>", escape_xml(href), escape_xml(t))).collect();
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">
<head><meta charset=\"utf-8\"/><title>{}</title></head>
<body><nav epub:type=\"toc\" id=\"toc\"><h1>Contents</h1><ol>
{}
</ol></nav></body>
</html>", escape_xml(title), list.join("\n"))
}

struct ManifestItem {
    id: String,
    href: String,
    media_type: &'static str,
}

fn opf_xml(meta: &EpubMeta, fixed: bool, items: &[ManifestItem], images: &[ManifestItem]) -> String {
    let id = uuid::Uuid::new_v4();
    let modified = alohamora_core::time::iso_utc(alohamora_core::time::unix_now());
    let mut manifest = vec!["<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>".to_string()];
    if !fixed {
        manifest.push("<item id=\"css\" href=\"style.css\" media-type=\"text/css\"/>".to_string());
    }
    for i in items.iter().chain(images.iter()) {
        manifest.push(format!("<item id=\"{}\" href=\"{}\" media-type=\"{}\"/>", i.id, escape_xml(&i.href), i.media_type));
    }
    let spine: Vec<String> = items.iter().map(|i| format!("<itemref idref=\"{}\"/>", i.id)).collect();
    let author = meta.author.as_deref().map(|a| format!("<dc:creator>{}</dc:creator>", escape_xml(a))).unwrap_or_default();
    let layout = if fixed { "<meta property=\"rendition:layout\">pre-paginated</meta><meta property=\"rendition:spread\">none</meta>" } else { "" };
    let lang = escape_xml(&meta.lang);
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\" xml:lang=\"{lang}\">
  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">
    <dc:identifier id=\"bookid\">urn:uuid:{id}</dc:identifier>
    <dc:title>{}</dc:title>
    <dc:language>{lang}</dc:language>
    {author}
    <meta property=\"dcterms:modified\">{modified}</meta>
    {layout}
  </metadata>
  <manifest>
    {}
  </manifest>
  <spine>
    {}
  </spine>
</package>", escape_xml(&meta.title), manifest.join("\n    "), spine.join("\n    "))
}

fn zip_err(e: zip::result::ZipError) -> AppError {
    AppError::other(format!("zip: {e}"))
}

/// Zip with `mimetype` first and stored, then everything else deflated.
fn pack(files: Vec<(String, Vec<u8>)>) -> Result<Vec<u8>> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated).compression_level(Some(6));
    zip.start_file("mimetype", stored).map_err(zip_err)?;
    zip.write_all(b"application/epub+zip")?;
    zip.start_file("META-INF/container.xml", deflated).map_err(zip_err)?;
    zip.write_all(CONTAINER_XML.as_bytes())?;
    for (path, data) in files {
        zip.start_file(path, deflated).map_err(zip_err)?;
        zip.write_all(&data)?;
    }
    Ok(zip.finish().map_err(zip_err)?.into_inner())
}

/// Reflowable book: one XHTML file per chapter.
pub fn build_reflow_epub(meta: &EpubMeta, chapters: &[Chapter]) -> Result<Vec<u8>> {
    let items: Vec<ManifestItem> = (1..=chapters.len())
        .map(|i| ManifestItem { id: format!("c{i:03}"), href: format!("c{i:03}.xhtml"), media_type: "application/xhtml+xml" })
        .collect();
    let nav: Vec<(String, String)> = items.iter().zip(chapters).map(|(i, c)| (i.href.clone(), c.title.clone())).collect();
    let mut files = vec![
        ("OEBPS/style.css".to_string(), STYLE_CSS.as_bytes().to_vec()),
        ("OEBPS/nav.xhtml".to_string(), nav_xhtml(&meta.title, &nav).into_bytes()),
    ];
    for (i, c) in items.iter().zip(chapters) {
        files.push((format!("OEBPS/{}", i.href), chapter_xhtml(&c.title, &c.body_xhtml, &meta.lang).into_bytes()));
    }
    files.push(("OEBPS/content.opf".to_string(), opf_xml(meta, false, &items, &[]).into_bytes()));
    pack(files)
}

/// Fixed-layout book: one full-page picture per page.
pub fn build_fixed_epub(meta: &EpubMeta, pages: &[FixedPage]) -> Result<Vec<u8>> {
    let n: Vec<String> = (1..=pages.len()).map(|i| format!("{i:03}")).collect();
    let items: Vec<ManifestItem> = n.iter().map(|k| ManifestItem { id: format!("p{k}"), href: format!("p{k}.xhtml"), media_type: "application/xhtml+xml" }).collect();
    let images: Vec<ManifestItem> = n.iter().map(|k| ManifestItem { id: format!("p{k}-img"), href: format!("images/p{k}.jpg"), media_type: "image/jpeg" }).collect();
    let nav: Vec<(String, String)> = items.iter().enumerate().map(|(i, it)| (it.href.clone(), format!("Page {}", i + 1))).collect();
    let mut files = vec![("OEBPS/nav.xhtml".to_string(), nav_xhtml(&meta.title, &nav).into_bytes())];
    for (img, p) in images.iter().zip(pages) {
        files.push((format!("OEBPS/{}", img.href), p.jpeg.clone()));
    }
    for (i, ((it, img), p)) in items.iter().zip(&images).zip(pages).enumerate() {
        files.push((format!("OEBPS/{}", it.href), fixed_page_xhtml(&format!("Page {}", i + 1), &img.href, p.width, p.height).into_bytes()));
    }
    files.push(("OEBPS/content.opf".to_string(), opf_xml(meta, true, &items, &images).into_bytes()));
    pack(files)
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors.

# Phase 6 — Inspection, previews, metadata, job context, OCR

## Task 6.1 — engine: `thumbnails`, `inspect`

**Goal.** Turn dropped paths into `FileInfo` values: kind, format, size, duration, page count, dimensions and a thumbnail.

- `inspect_basic` is fast (name, size, format from the extension) and is used to open the wheel immediately.
- `inspect_deep` adds what needs reading the file: `ffprobe` for audio/video, the image header for pictures, PDFium for
  PDFs (page count, first page size, thumbnail). `inspect_files` runs it on 4 threads.
- Folders are expanded to the files inside them (`expand_paths`). EPUB files are "not supported" now, like any unknown
  file.
- `thumbnails::make_thumbnail` makes a small JPEG `data:` URL (longest side 256 px): pictures directly, videos from a
  frame at 10 % of the duration (at most 1 s in), PDFs from the first page.

**File `src-tauri/crates/engine/src/thumbnails.rs`**

```rust
//! Port of src/main/thumbnails.ts: small JPEG data URLs (longest side <= 256 px).

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use alohamora_core::js::js_to_fixed;
use alohamora_core::types::{Category, FileInfo};

use crate::ffmpeg::{file_key, run_ffmpeg_to_buffer};
use crate::fsutil::data_url;
use crate::paths::p2s;
use crate::Result;

const SCALE: &str = "scale=256:256:force_original_aspect_ratio=decrease";

fn cache() -> &'static Mutex<HashMap<String, String>> {
    static C: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn s(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|x| x.to_string()).collect()
}

fn build(f: &FileInfo) -> Result<Option<String>> {
    let jpeg = match f.category {
        Some(Category::Image) => Some(crate::image::thumbnail_jpeg(Path::new(&f.path), f.fmt, 256)?),
        Some(Category::Video) => {
            if f.has_video != Some(true) {
                return Ok(None);
            }
            let t = (f.duration_sec.unwrap_or(0.0) * 0.1).min(1.0);
            let mut a = vec!["-ss".to_string(), js_to_fixed(t, 2), "-i".into(), f.path.clone()];
            a.extend(s(&["-frames:v", "1", "-vf", SCALE, "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "5", "pipe:1"]));
            Some(run_ffmpeg_to_buffer(&a, None)?)
        }
        Some(Category::Audio) => {
            if f.has_cover != Some(true) {
                return Ok(None);
            }
            let mut a = vec!["-i".to_string(), f.path.clone()];
            a.extend(s(&["-map", "0:v:0", "-frames:v", "1", "-vf", SCALE, "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"]));
            Some(run_ffmpeg_to_buffer(&a, None)?)
        }
        _ => None,
    };
    Ok(jpeg.map(|b| data_url("image/jpeg", &b)))
}

/// Cached by path + modification time (at most 200 entries).
pub fn make_thumbnail(f: &FileInfo) -> Result<Option<String>> {
    let key = file_key(Path::new(&f.path))?;
    if let Some(hit) = cache().lock().expect("thumbs").get(&key) {
        return Ok(Some(hit.clone()));
    }
    let url = build(f)?;
    if let Some(u) = &url {
        let mut c = cache().lock().expect("thumbs");
        if c.len() > 200 {
            c.clear();
        }
        c.insert(key, u.clone());
    }
    let _ = p2s;
    Ok(url)
}
```

**File `src-tauri/crates/engine/src/inspect.rs`**

```rust
//! Port of src/main/inspect.ts.

use std::path::Path;

use alohamora_core::naming::split_name;
use alohamora_core::registry::{category_of, ext_of, fmt_from_ext};
use alohamora_core::types::{Category, FileInfo};
use alohamora_core::util::base_name;

use crate::ffmpeg::probe;
use crate::par::map_limit;
use crate::thumbnails::make_thumbnail;
use crate::Result;

const MAX_FILES: usize = 500;

/// Folders → their direct files (sorted by name). De-duplicates. At most 500 files.
pub fn expand_paths(paths: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for p in paths {
        let path = Path::new(p);
        if path.is_dir() {
            let mut files: Vec<String> = std::fs::read_dir(path)
                .map(|rd| rd.flatten().filter(|e| e.path().is_file()).map(|e| e.path().to_string_lossy().to_string()).collect())
                .unwrap_or_default();
            files.sort_by_key(|f| base_name(f).to_lowercase());
            out.extend(files);
        } else if path.is_file() {
            out.push(p.clone());
        }
        if out.len() >= MAX_FILES {
            break;
        }
    }
    let mut seen = std::collections::HashSet::new();
    out.into_iter()
        .map(|p| std::path::absolute(&p).map(|a| a.to_string_lossy().to_string()).unwrap_or(p))
        .filter(|p| seen.insert(p.clone()))
        .take(MAX_FILES)
        .collect()
}

pub fn inspect_basic(file_path: &str) -> FileInfo {
    let name = base_name(file_path);
    let ext = ext_of(file_path);
    let fmt = fmt_from_ext(&ext);
    let size = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
    FileInfo {
        path: file_path.to_string(),
        base: split_name(&name).0,
        name,
        ext,
        fmt,
        category: fmt.map(category_of),
        size,
        ..Default::default()
    }
}

fn deep_inner(out: &mut FileInfo) -> Result<()> {
    match out.category {
        Some(Category::Video) | Some(Category::Audio) => {
            let p = probe(Path::new(&out.path))?;
            out.duration_sec = Some(p.duration_sec);
            out.has_video = Some(p.video.is_some());
            out.has_audio = Some(p.audio.is_some());
            out.has_cover = Some(p.has_cover);
            if let Some(v) = &p.video {
                out.width = Some(v.display_width);
                out.height = Some(v.display_height);
                out.video_codec = Some(v.codec.clone());
                out.fps = Some(v.fps);
            }
            if let Some(a) = &p.audio {
                out.audio_codec = Some(a.codec.clone());
                out.sample_rate = Some(a.sample_rate);
                out.channels = Some(a.channels);
            }
        }
        Some(Category::Image) => {
            let (w, h) = crate::image::display_size(Path::new(&out.path), out.fmt)?;
            out.width = Some(w);
            out.height = Some(h);
        }
        Some(Category::Pdf) => {
            let info = crate::pdf::info_with_thumbnail(Path::new(&out.path), 256)?;
            out.pages = Some(info.pages);
            out.width = Some(info.first_width_pt.round() as u32);
            out.height = Some(info.first_height_pt.round() as u32);
            out.thumbnail = info.thumbnail;
        }
        _ => {}
    }
    if out.thumbnail.is_none() {
        out.thumbnail = make_thumbnail(out)?;
    }
    Ok(())
}

/// Adds durations, sizes, page counts and a thumbnail. Never fails: problems go into `error`.
pub fn inspect_deep(info: &FileInfo) -> FileInfo {
    let mut out = info.clone();
    out.deep = Some(true);
    if let Err(e) = deep_inner(&mut out) {
        log::warn!("inspectDeep failed {}: {e:?}", out.path);
        out.error = Some(e.to_string());
    }
    out
}

pub fn inspect_files(paths: &[String], deep: bool) -> Vec<FileInfo> {
    let basic: Vec<FileInfo> = expand_paths(paths).iter().map(|p| inspect_basic(p)).collect();
    if !deep {
        return basic;
    }
    map_limit(&basic, 4, inspect_deep)
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors.

## Task 6.2 — engine: `previews`, `image_preview`, `metadata`

**Goal.** Everything the tool panels show before the user exports.

- `previews::media_source` returns the file a `<video>`/`<audio>` element can play. Files whose container or codecs
  the web view cannot play (AVI, WMV, WMA, AIFF, HEVC video, …) are converted once into a small proxy file in the cache
  folder; a second request for the same file waits for the first conversion instead of starting another. The app serves the file through the `kfile` protocol
  (Task 8.3). `frame` returns one video frame, `waveform` an audio waveform picture.
- `image_preview::preview_image` makes the live preview of the image tools (compress, crop, edit, background, collage)
  with **the same functions as the export**, on a downscaled copy that is cached (last 6).
- `metadata::read_metadata` reads what the Metadata panels show: media tags (FFprobe), photo EXIF fields, PDF document
  info.

**File `src-tauri/crates/engine/src/previews.rs`**

```rust
//! Port of previews.ts: playable media for <video>/<audio>, single frames and waveforms.
//! The engine returns the FILE to serve; the app turns it into a kfile URL (protocol allow-list).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, OnceLock};

use alohamora_core::js::{js_round, js_to_fixed};
use alohamora_core::registry::ext_of;
use sha1::{Digest, Sha1};

use crate::ffmpeg::{probe, run_ffmpeg, run_ffmpeg_to_buffer, FfmpegRun};
use crate::fsutil::data_url;
use crate::paths::{cache_dir, p2s};
use crate::Result;

const PLAYABLE_V: [&str; 4] = ["h264", "vp8", "vp9", "av1"];
const PLAYABLE_A: [&str; 8] = ["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_s24le", "pcm_f32le"];
const PLAYABLE_EXT: [&str; 11] = ["mp4", "m4v", "mov", "webm", "mkv", "mp3", "m4a", "wav", "flac", "ogg", "opus"];

/// Codecs the webview can actually play. WebKit (macOS/Linux) and WebView2 differ, so the app may
/// replace this with what the renderer reported via `set_media_support` (optional, see the plan).
fn playable(codec: &str, list: &[&str]) -> bool {
    list.contains(&codec)
}

fn cache_key(p: &Path) -> Result<String> {
    let md = std::fs::metadata(p)?;
    let mtime = md.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or(0);
    let digest = Sha1::digest(format!("{}|{}|{}", p2s(p), md.len(), mtime).as_bytes());
    Ok(digest.iter().take(8).map(|b| format!("{b:02x}")).collect())
}

/// Set to true (and notified) when a proxy encode finishes.
type Gate = Arc<(Mutex<bool>, Condvar)>;

/// One proxy encode per output file, even when several windows ask at once.
fn inflight() -> &'static Mutex<HashMap<PathBuf, Gate>> {
    static M: OnceLock<Mutex<HashMap<PathBuf, Gate>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The file the UI should play: the original (playable as is) or a cached 480p H.264 / WAV proxy.
/// Returns (file, is_proxy).
pub fn media_source(p: &Path) -> Result<(PathBuf, bool)> {
    let pr = probe(p)?;
    let ext = ext_of(&p2s(p));
    let v_ok = pr.video.as_ref().map(|v| playable(&v.codec, &PLAYABLE_V)).unwrap_or(true);
    let a_ok = pr.audio.as_ref().map(|a| playable(&a.codec, &PLAYABLE_A)).unwrap_or(true);
    if PLAYABLE_EXT.contains(&ext.as_str()) && v_ok && a_ok {
        return Ok((p.to_path_buf(), false));
    }
    let is_video = pr.video.is_some();
    let out = cache_dir("proxies").join(format!("{}.{}", cache_key(p)?, if is_video { "mp4" } else { "wav" }));
    if out.exists() {
        return Ok((out, true));
    }
    // Either start the encode or wait for the one already running.
    let (gate, owner) = {
        let mut map = inflight().lock().expect("inflight");
        match map.get(&out) {
            Some(g) => (g.clone(), false),
            None => {
                let g = Arc::new((Mutex::new(false), Condvar::new()));
                map.insert(out.clone(), g.clone());
                (g, true)
            }
        }
    };
    if !owner {
        let (lock, cv) = &*gate;
        let mut done = lock.lock().expect("gate");
        while !*done {
            done = cv.wait(done).expect("gate");
        }
        return if out.exists() { Ok((out, true)) } else { Err(crate::AppError::user("This file could not be prepared for preview.")) };
    }
    let tmp = out.with_extension(if is_video { "part.mp4" } else { "part.wav" });
    let input = p2s(p);
    let tmp_s = p2s(&tmp);
    let args: Vec<String> = if is_video {
        ["-i", &input, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:'min(ih,480)'", "-c:v", "libx264", "-preset", "ultrafast",
            "-crf", "28", "-g", "15", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", &tmp_s]
            .iter().map(|s| s.to_string()).collect()
    } else {
        ["-i", &input, "-map", "0:a:0", "-c:a", "pcm_s16le", &tmp_s].iter().map(|s| s.to_string()).collect()
    };
    let result = run_ffmpeg(&args, FfmpegRun::default()).and_then(|_| Ok(std::fs::rename(&tmp, &out)?));
    {
        let (lock, cv) = &*gate;
        *lock.lock().expect("gate") = true;
        cv.notify_all();
        inflight().lock().expect("inflight").remove(&out);
    }
    result.map(|_| (out, true))
}

/// One video frame at `t` seconds as a JPEG data URL, at most `max_width` wide.
pub fn frame(p: &Path, t: f64, max_width: u32) -> Result<String> {
    let args: Vec<String> = vec![
        "-ss".into(), js_to_fixed(t.max(0.0), 3), "-i".into(), p2s(p), "-frames:v".into(), "1".into(),
        "-vf".into(), format!("scale='min({max_width},iw)':-2"), "-f".into(), "image2pipe".into(), "-c:v".into(), "mjpeg".into(),
        "-q:v".into(), "4".into(), "pipe:1".into(),
    ];
    Ok(data_url("image/jpeg", &run_ffmpeg_to_buffer(&args, None)?))
}

/// Grey waveform picture (PNG data URL), cached per path and size.
pub fn waveform(p: &Path, width: f64, height: f64) -> Result<String> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let key = format!("{}|{}x{}", p2s(p), width, height);
    if let Some(hit) = cache.lock().expect("wave cache").get(&key) {
        return Ok(hit.clone());
    }
    let w = (js_round(width / 2.0) * 2.0).max(64.0);
    let h = (js_round(height / 2.0) * 2.0).max(32.0);
    let args: Vec<String> = vec![
        "-i".into(), p2s(p), "-filter_complex".into(), format!("aformat=channel_layouts=mono,showwavespic=s={w}x{h}:colors=0x8A8A8A"),
        "-frames:v".into(), "1".into(), "-f".into(), "image2pipe".into(), "-c:v".into(), "png".into(), "pipe:1".into(),
    ];
    let url = data_url("image/png", &run_ffmpeg_to_buffer(&args, None)?);
    cache.lock().expect("wave cache").insert(key, url.clone());
    Ok(url)
}
```

**File `src-tauri/crates/engine/src/image_preview.rs`**

```rust
//! Port of imagePreview.ts: live previews for the image tools, made by the SAME functions as the export.

use std::collections::VecDeque;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use alohamora_core::edit_pipeline::build_edit_spec;
use alohamora_core::options::*;
use alohamora_core::types::{ImagePreviewRequest, ImagePreviewResult, ToolId};
use image::DynamicImage;
use serde_json::Value;

use crate::fsutil::data_url;
use crate::image::{encode, fit_inside, load_with_density, ops};
use crate::inspect::inspect_basic;
use crate::Result;

/// Decoded, upright, downscaled picture; the last 6 are kept.
fn proxy(path: &str, max_side: u32) -> Result<DynamicImage> {
    static CACHE: OnceLock<Mutex<VecDeque<(String, DynamicImage)>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(VecDeque::new()));
    let key = format!("{path}|{max_side}");
    if let Some((_, img)) = cache.lock().expect("proxy cache").iter().find(|(k, _)| *k == key) {
        return Ok(img.clone());
    }
    let info = inspect_basic(path);
    let img = fit_inside(load_with_density(Path::new(path), info.fmt, 144.0)?, max_side, max_side, false);
    let mut c = cache.lock().expect("proxy cache");
    if c.len() >= 6 {
        c.pop_front();
    }
    c.push_back((key, img.clone()));
    Ok(img)
}

fn to_result(img: &DynamicImage, bytes: Option<u64>, original_bytes: Option<u64>) -> Result<ImagePreviewResult> {
    Ok(ImagePreviewResult { data_url: data_url("image/png", &encode::png_bytes(img)?), width: img.width(), height: img.height(), bytes, original_bytes })
}

fn options(req: &ImagePreviewRequest) -> Value {
    req.options.clone().unwrap_or(Value::Object(Default::default()))
}

pub fn preview_image(req: &ImagePreviewRequest) -> Result<ImagePreviewResult> {
    let max = req.max_side.max(1.0) as u32;
    let base = proxy(&req.path, max)?;
    match req.op.as_str() {
        "compress" => {
            let o: ImageCompressOptions = with_defaults(ToolId::ImageCompress, &options(req));
            // Full resolution → the real output size; the picture shown is scaled down again.
            let (bytes, _) = crate::image::compress_to_bytes(&inspect_basic(&req.path), &o)?;
            let original = std::fs::metadata(&req.path)?.len();
            let shown = image::load_from_memory(&bytes).map_err(crate::image::unreadable)?;
            to_result(&fit_inside(shown, max, max, false), Some(bytes.len() as u64), Some(original))
        }
        "crop" => {
            let o: ImageCropOptions = with_defaults(ToolId::ImageCrop, &options(req));
            let mut img = match (alohamora_core::js::js_round(o.rotate) as i64).rem_euclid(360) {
                90 => base.rotate90(),
                180 => base.rotate180(),
                270 => base.rotate270(),
                _ => base,
            };
            if o.flip_v { img = img.flipv(); }
            if o.flip_h { img = img.fliph(); }
            to_result(&img, None, None)
        }
        "edit" => {
            // Missing keys fall back to DEFAULT_EDIT (same as `{ ...DEFAULT_EDIT, ...options }`).
            let params: EditParams = with_defaults(ToolId::ImageEdit, &options(req));
            to_result(&ops::apply_edit(&base, &build_edit_spec(&params)), None, None)
        }
        "background" => {
            let o: ImageBackgroundOptions = with_defaults(ToolId::ImageBackground, &options(req));
            to_result(&DynamicImage::ImageRgba8(ops::compose_background(&base, &o)?), None, None)
        }
        "collage" => {
            let o: CollageOptions = with_defaults(ToolId::ImageCollage, &options(req));
            let paths = req.paths.clone().filter(|p| !p.is_empty()).unwrap_or_else(|| vec![req.path.clone()]);
            let ordered: Vec<String> = if o.order.is_empty() { paths } else { o.order.iter().filter(|p| paths.contains(p)).cloned().collect() };
            let files: Vec<_> = ordered.iter().map(|p| inspect_basic(p)).collect();
            to_result(&DynamicImage::ImageRgba8(ops::compose_collage(&files, &o, 800.0, None)?), None, None)
        }
        _ => to_result(&base, None, None),
    }
}
```

**File `src-tauri/crates/engine/src/metadata.rs`**

```rust
//! Port of metadata.ts: what the Metadata panels show (media tags, photo EXIF, PDF document info).

use std::path::Path;

use alohamora_core::js::{js_num, js_round, js_to_fixed};
use alohamora_core::registry::{category_of, fmt_from_path};
use alohamora_core::types::{Category, MetadataField, MetadataInfo};
use exif::{In, Tag, Value};
use pdfium_render::prelude::*;

use crate::ffmpeg::{probe, run_ffmpeg_to_buffer};
use crate::fsutil::data_url;
use crate::paths::p2s;
use crate::{AppError, Result};

const VIDEO_KEYS: [(&str, &str); 5] = [("title", "Title"), ("artist", "Author"), ("comment", "Comment"), ("date", "Date"), ("description", "Description")];
const AUDIO_KEYS: [(&str, &str); 8] = [
    ("title", "Title"), ("artist", "Artist"), ("album", "Album"), ("album_artist", "Album artist"),
    ("date", "Year"), ("genre", "Genre"), ("track", "Track"), ("comment", "Comment"),
];
const READONLY: [(&str, &str); 5] = [
    ("encoder", "Encoder"), ("creation_time", "Created"), ("location", "Location"),
    ("com.apple.quicktime.location.iso6709", "Location"), ("com.apple.quicktime.model", "Camera"),
];

fn field(key: &str, label: &str, value: String, editable: bool) -> MetadataField {
    MetadataField { key: key.into(), label: label.into(), value, editable }
}

/// Read-only fields are only listed when they have a value.
fn push_ro(fields: &mut Vec<MetadataField>, key: &str, label: &str, value: String) {
    if !value.is_empty() {
        fields.push(field(key, label, value, false));
    }
}

pub fn read_media(p: &Path) -> Result<MetadataInfo> {
    let pr = probe(p)?;
    let audio = fmt_from_path(&p2s(p)).map(category_of) == Some(Category::Audio);
    let keys: &[(&str, &str)] = if audio { &AUDIO_KEYS } else { &VIDEO_KEYS };
    let mut fields: Vec<MetadataField> = keys.iter().map(|(k, l)| field(k, l, pr.tags.get(*k).cloned().unwrap_or_default(), true)).collect();
    for (k, l) in READONLY {
        push_ro(&mut fields, k, l, pr.tags.get(k).cloned().unwrap_or_default());
    }
    let cover = if pr.has_cover {
        let args: Vec<String> = ["-i", &p2s(p), "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=256:256:force_original_aspect_ratio=decrease",
            "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"].iter().map(|s| s.to_string()).collect();
        Some(data_url("image/jpeg", &run_ffmpeg_to_buffer(&args, None)?))
    } else {
        None
    };
    let has_gps = pr.tags.keys().any(|k| k.contains("location"));
    Ok(MetadataInfo { kind: "media".into(), fields, has_gps: Some(has_gps), has_cover: Some(pr.has_cover), cover_data_url: cover })
}

/// EXIF "2024:05:01 14:30:00" → "2024-05-01T14:30" (the format of <input type="datetime-local">).
fn local_input(v: &str) -> String {
    let b = v.as_bytes();
    if v.len() >= 16 && b[4] == b':' && b[7] == b':' {
        format!("{}-{}-{}T{}", &v[0..4], &v[5..7], &v[8..10], &v[11..16])
    } else {
        String::new()
    }
}

fn rational_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Rational(r) => r.first().map(|x| x.to_f64()),
        Value::SRational(r) => r.first().map(|x| x.to_f64()),
        Value::Short(s) => s.first().map(|x| *x as f64),
        Value::Long(l) => l.first().map(|x| *x as f64),
        _ => None,
    }
}

/// Degrees from the three GPS rationals and the N/S/E/W reference.
fn gps_degrees(e: &exif::Exif, value: Tag, reference: Tag) -> Option<f64> {
    let v = match &e.get_field(value, In::PRIMARY)?.value {
        Value::Rational(r) if r.len() >= 3 => r[0].to_f64() + r[1].to_f64() / 60.0 + r[2].to_f64() / 3600.0,
        _ => return None,
    };
    let r = e.get_field(reference, In::PRIMARY).map(|f| f.display_value().to_string()).unwrap_or_default();
    Some(if r.contains('S') || r.contains('W') { -v } else { v })
}

pub fn read_image(p: &Path) -> Result<MetadataInfo> {
    let parsed = std::fs::File::open(p).ok().and_then(|f| exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)).ok());
    let text = |tag: Tag| -> String {
        parsed.as_ref().and_then(|e| e.get_field(tag, In::PRIMARY)).map(|f| match &f.value {
            Value::Ascii(v) => v.iter().map(|s| String::from_utf8_lossy(s).trim_end_matches('\0').trim().to_string()).collect::<Vec<_>>().join(" "),
            other => other.display_as(tag).to_string(),
        }).unwrap_or_default()
    };
    let num = |tag: Tag| parsed.as_ref().and_then(|e| e.get_field(tag, In::PRIMARY)).and_then(|f| rational_f64(&f.value));
    let mut fields = Vec::new();
    push_ro(&mut fields, "make", "Camera make", text(Tag::Make));
    push_ro(&mut fields, "model", "Camera", text(Tag::Model));
    push_ro(&mut fields, "lens", "Lens", text(Tag::LensModel));
    fields.push(field("dateTaken", "Date taken", local_input(&text(Tag::DateTimeOriginal)), true));
    let exposure = num(Tag::ExposureTime).map(|t| if t < 1.0 { format!("1/{} s", js_round(1.0 / t)) } else { format!("{} s", js_num(t)) });
    push_ro(&mut fields, "exposure", "Exposure", exposure.unwrap_or_default());
    push_ro(&mut fields, "aperture", "Aperture", num(Tag::FNumber).map(|f| format!("f/{}", js_num(f))).unwrap_or_default());
    push_ro(&mut fields, "iso", "ISO", text(Tag::PhotographicSensitivity));
    push_ro(&mut fields, "focal", "Focal length", num(Tag::FocalLength).map(|f| format!("{} mm", js_num(f))).unwrap_or_default());
    push_ro(&mut fields, "software", "Software", text(Tag::Software));
    fields.push(field("artist", "Artist", text(Tag::Artist), true));
    fields.push(field("copyright", "Copyright", text(Tag::Copyright), true));
    fields.push(field("description", "Description", text(Tag::ImageDescription), true));
    let lat = parsed.as_ref().and_then(|e| gps_degrees(e, Tag::GPSLatitude, Tag::GPSLatitudeRef));
    let lon = parsed.as_ref().and_then(|e| gps_degrees(e, Tag::GPSLongitude, Tag::GPSLongitudeRef));
    let has_gps = lat.is_some() && lon.is_some();
    if let (Some(a), Some(b)) = (lat, lon) {
        fields.push(field("location", "Location", format!("{}, {}", js_to_fixed(a, 5), js_to_fixed(b, 5)), false));
    }
    Ok(MetadataInfo { kind: "image".into(), fields, has_gps: Some(has_gps), has_cover: None, cover_data_url: None })
}

/// "D:20240501143000+02'00'" → "2024-05-01 14:30:00" (shown as text; the UI does not parse it).
fn pdf_date(v: &str) -> String {
    let d = v.trim_start_matches("D:");
    if d.len() >= 14 && d[..14].chars().all(|c| c.is_ascii_digit()) {
        format!("{}-{}-{} {}:{}:{}", &d[0..4], &d[4..6], &d[6..8], &d[8..10], &d[10..12], &d[12..14])
    } else {
        v.to_string()
    }
}

pub fn read_pdf(p: &Path) -> Result<MetadataInfo> {
    let doc = crate::pdf::open(p)?;
    let get = |t: PdfDocumentMetadataTagType| doc.metadata().get(t).map(|v| v.value().to_string()).unwrap_or_default();
    let mut fields = vec![
        field("title", "Title", get(PdfDocumentMetadataTagType::Title), true),
        field("author", "Author", get(PdfDocumentMetadataTagType::Author), true),
        field("subject", "Subject", get(PdfDocumentMetadataTagType::Subject), true),
        field("keywords", "Keywords", get(PdfDocumentMetadataTagType::Keywords), true),
    ];
    let pages = doc.pages().len().to_string();
    push_ro(&mut fields, "creator", "Creator", get(PdfDocumentMetadataTagType::Creator));
    push_ro(&mut fields, "producer", "Producer", get(PdfDocumentMetadataTagType::Producer));
    push_ro(&mut fields, "created", "Created", pdf_date(&get(PdfDocumentMetadataTagType::CreationDate)));
    push_ro(&mut fields, "modified", "Modified", pdf_date(&get(PdfDocumentMetadataTagType::ModificationDate)));
    push_ro(&mut fields, "pages", "Pages", pages);
    Ok(MetadataInfo { kind: "pdf".into(), fields, has_gps: None, has_cover: None, cover_data_url: None })
}

/// Dispatch on the file's category (port of the meta:read handler).
pub fn read_metadata(p: &Path) -> Result<MetadataInfo> {
    match fmt_from_path(&p2s(p)).map(category_of) {
        Some(Category::Video) | Some(Category::Audio) => read_media(p),
        Some(Category::Image) => read_image(p),
        Some(Category::Pdf) => read_pdf(p),
        _ => Err(AppError::other("No metadata reader for this file type")),
    }
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors.

## Task 6.3 — engine: job context

**Goal.** The object every converter and tool receives: progress, cancellation, notes, and **safe output files**.

Rules enforced by `JobContext` (they protect the user's files):
- Converters and tools write only to paths from `ctx.new_output(spec)` (the final output) or `ctx.temp_path(name)`
  (scratch files). Both are inside the job's own temporary folder.
- `finalize` moves the outputs next to the input (or into the output folder from the settings) and picks a free name
  (`photo (2).png`) instead of overwriting anything. It refuses to replace an input file.
- `cleanup` deletes the job's temporary folder.

`jobs/mod.rs` gets only the `context` module now; Task 7.2 replaces it with the final version.

**File `src-tauri/crates/engine/src/jobs/mod.rs`**

```rust
//! Port of src/main/jobs/*: one job = one JobRequest run by converters or tool runners.
//! Task 7.2 adds the `execute` and `queue` modules.

pub mod context;

pub use context::{JobContext, OutputSpec};
```

**File `src-tauri/crates/engine/src/jobs/context.rs`**

```rust
//! Port of src/main/jobs/context.ts. Converters and tools write ONLY to paths from `new_output` / `temp_path`.
//! `finalize` moves outputs to their final names (never overwriting anything).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use alohamora_core::naming::{group_file_name, group_folder_name, output_file_name, resolve_collision, sanitize_file_name, split_name};
use alohamora_core::types::{Capabilities, Settings};
use alohamora_core::util::path_key;

use crate::cancel::CancelToken;
use crate::fsutil::{move_file, remove_dir_with_retries};
use crate::paths;
use crate::{AppError, Result};

/// Describes one output file. Build with `OutputSpec::new(source, ext)` and the builder methods.
#[derive(Debug, Clone)]
pub struct OutputSpec {
    /// Input file this output derives from (decides folder + base name).
    pub source: String,
    /// Output extension without dot.
    pub ext: String,
    /// "compressed" → "<base>-compressed.<ext>". Empty = no suffix.
    pub suffix: String,
    /// Multi-file output → folder "<base>-<group>/<base>-001.ext".
    pub group: Option<String>,
    /// 1-based (group only).
    pub index: usize,
    /// Group size (for zero padding).
    pub total: usize,
    /// Full file name (rare).
    pub name_override: Option<String>,
}

impl OutputSpec {
    pub fn new(source: &str, ext: &str) -> Self {
        OutputSpec { source: source.to_string(), ext: ext.trim_start_matches('.').to_lowercase(), suffix: String::new(), group: None, index: 1, total: 1, name_override: None }
    }
    pub fn suffix(mut self, suffix: &str) -> Self {
        self.suffix = suffix.to_string();
        self
    }
    pub fn group(mut self, group: &str, index: usize, total: usize) -> Self {
        self.group = Some(group.to_string());
        self.index = index;
        self.total = total;
        self
    }
}

struct Inner {
    outputs: Vec<(PathBuf, OutputSpec)>,
    dropped: HashSet<PathBuf>,
    sub_index: usize,
    sub_total: usize,
    scratch: usize,
    notes: Vec<String>,
}

pub type ProgressFn = Box<dyn Fn(f64, Option<String>) + Send + Sync>;

pub struct JobContext {
    pub id: String,
    pub cancel: CancelToken,
    pub temp_dir: PathBuf,
    pub settings: Settings,
    pub caps: Capabilities,
    report: ProgressFn,
    inner: Mutex<Inner>,
}

/// Final paths reserved by running jobs, so two parallel jobs never pick the same name.
fn reserved() -> &'static Mutex<HashSet<String>> {
    static R: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashSet::new()))
}

impl JobContext {
    pub fn new(id: &str, cancel: CancelToken, settings: Settings, caps: Capabilities, report: ProgressFn) -> Result<Self> {
        let temp_dir = paths::jobs_temp_root().join(id);
        std::fs::create_dir_all(&temp_dir)?;
        Ok(JobContext {
            id: id.to_string(),
            cancel,
            temp_dir,
            settings,
            caps,
            report,
            inner: Mutex::new(Inner { outputs: vec![], dropped: HashSet::new(), sub_index: 0, sub_total: 1, scratch: 0, notes: vec![] }),
        })
    }

    /// Err(Canceled) once the job was cancelled. Call inside loops.
    pub fn check_cancel(&self) -> Result<()> {
        self.cancel.check()
    }

    pub fn set_subtask(&self, index: usize, total: usize, detail: Option<String>) {
        let total = total.max(1);
        {
            let mut i = self.inner.lock().expect("job ctx");
            i.sub_index = index;
            i.sub_total = total;
        }
        (self.report)(index as f64 / total as f64, detail);
    }

    /// 0..1 within the current subtask.
    pub fn progress(&self, fraction: f64, detail: Option<String>) {
        let f = fraction.clamp(0.0, 1.0);
        let (index, total) = {
            let i = self.inner.lock().expect("job ctx");
            (i.sub_index, i.sub_total)
        };
        (self.report)((index as f64 + f) / total as f64, detail);
    }

    /// Returns the temp path to write this output to.
    pub fn new_output(&self, spec: OutputSpec) -> PathBuf {
        let mut i = self.inner.lock().expect("job ctx");
        let p = self.temp_dir.join(format!("out-{}.{}", i.outputs.len(), spec.ext));
        i.outputs.push((p.clone(), spec));
        p
    }

    /// For example: the compressed file came out bigger than the original.
    pub fn drop_output(&self, temp_path: &Path) {
        self.inner.lock().expect("job ctx").dropped.insert(temp_path.to_path_buf());
    }

    /// A scratch file path (not an output).
    pub fn temp_path(&self, name: &str) -> PathBuf {
        let mut i = self.inner.lock().expect("job ctx");
        i.scratch += 1;
        self.temp_dir.join(format!("tmp-{}-{}", i.scratch, name))
    }

    /// Text shown on the Done card.
    pub fn note(&self, text: impl Into<String>) {
        self.inner.lock().expect("job ctx").notes.push(text.into());
    }

    pub fn notes(&self) -> Vec<String> {
        self.inner.lock().expect("job ctx").notes.clone()
    }

    /// Move outputs to their final names. Returns final absolute paths.
    pub fn finalize(&self, inputs: &[String]) -> Result<Vec<String>> {
        let (outputs, dropped) = {
            let i = self.inner.lock().expect("job ctx");
            (i.outputs.clone(), i.dropped.clone())
        };
        let input_keys: HashSet<String> = inputs.iter().map(|p| path_key(Path::new(p))).collect();
        let mut group_dirs: std::collections::HashMap<String, PathBuf> = std::collections::HashMap::new();
        let mut finals = Vec::new();
        let mut mine: Vec<String> = Vec::new();
        let result = (|| -> Result<()> {
            for (temp, spec) in &outputs {
                if dropped.contains(temp) {
                    continue;
                }
                if !temp.exists() {
                    let name = temp.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    return Err(AppError::other(format!("Expected output was not created ({name})")));
                }
                let source = Path::new(&spec.source);
                let (base, _) = split_name(&source.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
                let custom = self.settings.output_mode == "custom-folder" && self.settings.custom_output_dir.is_some();
                let out_dir: PathBuf = if custom {
                    PathBuf::from(self.settings.custom_output_dir.clone().unwrap_or_default())
                } else {
                    source.parent().map(|p| p.to_path_buf()).unwrap_or_default()
                };
                let taken = |p: &str| reserved().lock().expect("reserved").contains(&path_key(Path::new(p))) || Path::new(p).exists();
                let join = |a: &str, b: &str| paths::p2s(&Path::new(a).join(b));
                let final_path: String = if let Some(group) = &spec.group {
                    let key = format!("{}|{}", spec.source, group);
                    let dir = match group_dirs.get(&key) {
                        Some(d) => d.clone(),
                        None => {
                            let d = resolve_collision(&paths::p2s(&out_dir), &sanitize_file_name(&group_folder_name(&base, group)), &taken, &join)
                                .map_err(AppError::other)?;
                            std::fs::create_dir_all(&d)?;
                            group_dirs.insert(key, PathBuf::from(&d));
                            PathBuf::from(d)
                        }
                    };
                    let name = sanitize_file_name(&group_file_name(&base, spec.index, spec.total, &spec.ext));
                    resolve_collision(&paths::p2s(&dir), &name, &taken, &join).map_err(AppError::other)?
                } else {
                    let name = spec.name_override.clone().unwrap_or_else(|| output_file_name(&base, &spec.ext, &spec.suffix));
                    resolve_collision(&paths::p2s(&out_dir), &sanitize_file_name(&name), &taken, &join).map_err(AppError::other)?
                };
                let key = path_key(Path::new(&final_path));
                if input_keys.contains(&key) {
                    return Err(AppError::other("Refusing to overwrite an input file"));
                }
                reserved().lock().expect("reserved").insert(key.clone());
                mine.push(key);
                move_file(temp, Path::new(&final_path))?;
                finals.push(final_path);
            }
            Ok(())
        })();
        let mut r = reserved().lock().expect("reserved");
        for k in &mine {
            r.remove(k);
        }
        result.map(|_| finals)
    }

    pub fn cleanup(&self) {
        remove_dir_with_retries(&self.temp_dir);
    }
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors.

## Task 6.4 — engine: `ocr`

**Goal.** Read text from scanned PDF pages with Tesseract, and build searchable PDFs.

- Language data is read **only** from `<resources>/tessdata` (`eng` and `vie` are bundled). Nothing is downloaded.
- Pages are rendered at 300 dpi with PDFium and passed to Tesseract as grey pixels.
- Text for TXT/DOCX/EPUB comes from Tesseract's plain text, split into paragraphs.
- **Searchable PDF:** we do *not* use Tesseract's own PDF writer. `tesseract-rs` builds Leptonica without zlib, and
  Tesseract's PDF writer then crashes. Instead we read the word boxes (TSV output, `parse_tsv_words`) and build each page
  ourselves with `PdfBuilder::add_searchable_page` (Task 5.2): the page picture (JPEG, quality 85) plus invisible text at
  the word positions.

**File `src-tauri/crates/engine/src/ocr.rs`**

```rust
//! OCR with Tesseract (port of engines/ocr.ts; tesseract.js → tesseract-rs, built from source, linked in).
//! Language data comes ONLY from `<resources>/tessdata` (never downloaded).
//! Searchable PDFs are built by us from Tesseract's word boxes (TSV): tesseract-rs builds Leptonica without
//! zlib, and Tesseract's own PDF renderer then crashes (it writes a null compressed buffer).

use std::path::Path;

use alohamora_core::pdf_reflow::{text_to_blocks, Block};
use image::DynamicImage;
use tesseract_rs::TesseractAPI;

use crate::jobs::JobContext;
use crate::paths::tessdata_dir;
use crate::pdf::create::{OcrWord, PdfBuilder, SearchablePage};
use crate::{AppError, Result};

const OCR_DPI: f64 = 300.0;

/// Languages from `wanted` that have a `<lang>.traineddata` file.
pub fn available_langs(wanted: &[String]) -> Vec<String> {
    wanted.iter().filter(|l| tessdata_dir().join(format!("{l}.traineddata")).exists()).cloned().collect()
}

fn ocr_err(e: impl std::fmt::Debug) -> AppError {
    AppError::tool("Text recognition failed", format!("{e:?}"))
}

fn new_api(langs: &[String]) -> Result<TesseractAPI> {
    let wanted = if langs.is_empty() { vec!["eng".to_string()] } else { langs.to_vec() };
    let ok = available_langs(&wanted);
    if ok.is_empty() {
        return Err(AppError::user("No OCR language data found. Reinstall Alohamora."));
    }
    let api = TesseractAPI::new();
    api.init(tessdata_dir(), &ok.join("+")).map_err(ocr_err)?;
    api.set_variable("user_defined_dpi", "300").map_err(ocr_err)?;
    Ok(api)
}

/// Give a rendered page to Tesseract (8-bit grey is enough and fastest).
fn set_page(api: &TesseractAPI, img: &DynamicImage) -> Result<()> {
    let gray = img.to_luma8();
    let (w, h) = (gray.width() as i32, gray.height() as i32);
    api.set_image(gray.as_raw(), w, h, 1, w).map_err(ocr_err)?;
    api.set_source_resolution(OCR_DPI as i32).map_err(ocr_err)?;
    Ok(())
}

fn page_text(api: &TesseractAPI, img: &DynamicImage) -> Result<String> {
    set_page(api, img)?;
    api.get_utf8_text().map_err(ocr_err)
}

/// OCR pages of a PDF into reflow blocks (used by PDF → TXT/DOCX/EPUB when the PDF has no text layer).
pub fn ocr_pdf_to_blocks(pdf_path: &Path, ctx: &JobContext, page_indexes: Option<Vec<usize>>) -> Result<Vec<Block>> {
    let doc = crate::pdf::open(pdf_path)?;
    let total = doc.pages().len() as usize;
    let api = new_api(&ctx.settings.ocr_languages)?;
    let pages = page_indexes.unwrap_or_else(|| (0..total).collect());
    let mut blocks = Vec::new();
    for (k, &p) in pages.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, p, OCR_DPI)?;
        blocks.extend(text_to_blocks(&page_text(&api, &img)?));
        if k + 1 < pages.len() {
            blocks.push(Block::PageBreak);
        }
        ctx.progress((k + 1) as f64 / pages.len() as f64, Some(format!("Reading page {} of {}", p + 1, total)));
    }
    Ok(blocks)
}

/// Words (TSV level 5) from `TessBaseAPIGetTsvText`: level page block par line word left top width height conf text.
pub fn parse_tsv_words(tsv: &str) -> Vec<OcrWord> {
    tsv.lines()
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            if c.len() < 12 || c[0] != "5" || c[10].starts_with('-') {
                return None;
            }
            let text = c[11..].join("\t").trim().to_string();
            if text.is_empty() {
                return None;
            }
            let n = |i: usize| c[i].parse::<f64>().ok();
            Some(OcrWord { left: n(6)?, top: n(7)?, width: n(8)?, height: n(9)?, text })
        })
        .collect()
}

/// Result of `ocr_pages`: all text (with page headers) and, when asked for, one searchable PDF.
pub struct OcrResult {
    pub text: String,
    pub pdf: Option<Vec<u8>>,
}

/// Port of ocrPages. With `want_pdf`, each page becomes picture + invisible text (one searchable PDF).
pub fn ocr_pages(pdf_path: &Path, ctx: &JobContext, langs: &[String], indexes: &[usize], want_pdf: bool) -> Result<OcrResult> {
    let doc = crate::pdf::open(pdf_path)?;
    let total = doc.pages().len() as usize;
    let api = new_api(langs)?;
    let mut texts = Vec::new();
    let mut builder = if want_pdf { Some(PdfBuilder::new()) } else { None };
    for (k, &p) in indexes.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, p, OCR_DPI)?;
        let text = page_text(&api, &img)?;
        texts.push(format!("--- Page {} ---\n{}", p + 1, text.trim()));
        if let Some(b) = builder.as_mut() {
            let words = parse_tsv_words(&api.get_tsv_text(0).map_err(ocr_err)?);
            let jpeg = crate::image::encode::jpeg_bytes(&img, 85.0)?;
            b.add_searchable_page(&SearchablePage { jpeg, width_px: img.width(), height_px: img.height(), dpi: OCR_DPI, words })?;
        }
        ctx.progress((k + 1) as f64 / indexes.len() as f64, Some(format!("Reading page {} of {}", p + 1, total)));
    }
    let pdf = match builder {
        Some(b) => Some(b.finish()?),
        None => None,
    };
    Ok(OcrResult { text: texts.join("\n\n") + "\n", pdf })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tsv_words() {
        let tsv = "1\t1\t0\t0\t0\t0\t0\t0\t2480\t3508\t-1\t\n5\t1\t1\t1\t1\t1\t236\t240\t520\t60\t96.5\tALOHAMORA\n5\t1\t1\t1\t1\t2\t790\t240\t150\t60\t95\t \n";
        let w = parse_tsv_words(tsv);
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].text, "ALOHAMORA");
        assert_eq!((w[0].left, w[0].top, w[0].width, w[0].height), (236.0, 240.0, 520.0, 60.0));
    }
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** `test result: ok. 4 passed; 0 failed` (settings, capabilities, image EXIF/ICC, OCR).

# Phase 7 — Converters, tools, the job queue and the self-test

## Task 7.1 — engine: converters and tools

**Goal.** Every conversion and every tool of the app.

This is the largest task: 12 files. `convert` and `tools` use each other (video → MP3 uses the video tools' audio
extraction; the PDF tools reuse the PDF converter), so they are compiled together at the end of the task.

**Converters** (`convert/`, one per input kind; `convert::convert` picks the right one):

| File | Does |
|---|---|
| `convert/mod.rs` | Dispatch by input category |
| `convert/av.rs` | Audio/video → any audio/video format with FFmpeg (hardware H.264 when available, with a software fallback) |
| `convert/image.rs` | Picture → JPG/PNG/WebP/AVIF/TIFF/BMP/HEIC (keeps EXIF/ICC), → SVG (trace or embed), → PDF, → DOCX |
| `convert/pdf.rs` | PDF → PNG/JPG pages, TXT, DOCX (text or exact pages), EPUB (reflowable or fixed). Scanned pages go through OCR unless OCR is off |
| `convert/subtitle.rs` | SRT ↔ VTT, subtitles → plain text |
| `convert/text.rs` | TXT → PDF (Typst), → JPG/PNG (PDF page rendered with PDFium), → SRT/VTT (timed cues) |

**Tools** (`tools/`; `tools::run` calls the runner for a tool id):

| File | Tools |
|---|---|
| `tools/mod.rs` | Dispatch, `order_files` (the order chosen in the panel) |
| `tools/video.rs` | compress, trim, split, crop, speed, mute, snapshot, redact (blur/pixelate/black box), metadata, join |
| `tools/audio.rs` | compress, channels, normalize, trim (with fades), visualize (waveform PNG/MP4), bleep, metadata, join |
| `tools/image.rs` | compress, resize, crop/rotate, edit, background, redact, metadata, collage, make PDF |
| `tools/pdf.rs` | compress, merge, split, organize, to images, OCR (TXT or searchable PDF), to Word, metadata |
| `tools/subtitle.rs` | shift subtitle times |

**File `src-tauri/crates/engine/src/convert/mod.rs`**

```rust
//! Port of src/main/converters/*: one converter per input category.

pub mod av;
pub mod image;
pub mod pdf;
pub mod subtitle;
pub mod text;

use alohamora_core::options::ConvertOptions;
use alohamora_core::types::{Category, FileInfo, Fmt};

use crate::jobs::JobContext;
use crate::{AppError, Result};

pub fn convert(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    match file.category {
        Some(Category::Audio) | Some(Category::Video) => av::convert_av(file, target, opts, ctx),
        Some(Category::Image) => image::convert_image(file, target, opts, ctx),
        Some(Category::Pdf) => pdf::convert_pdf(file, target, opts, ctx),
        Some(Category::Text) => text::convert_text(file, target, opts, ctx),
        Some(Category::Subtitle) => subtitle::convert_subtitle(file, target, ctx),
        None => Err(AppError::user(format!("{} is not a supported file type.", file.name))),
    }
}
```

**File `src-tauri/crates/engine/src/convert/av.rs`**

```rust
//! Port of src/main/converters/av.ts.

use std::path::Path;

use alohamora_core::ffmpeg_args::{audio_convert_args, can_remux, to_facts, video_convert_args, GifOptions, Quality};
use alohamora_core::options::{convert_defaults, ConvertOptions};
use alohamora_core::registry::{category_of, output_ext};
use alohamora_core::types::{Category, FileInfo, Fmt};

use crate::ffmpeg::{probe, run_ffmpeg, FfmpegRun};
use crate::jobs::{JobContext, OutputSpec};
use crate::paths::p2s;
use crate::tools::video::run_with_hw_fallback;
use crate::{AppError, Result};

pub fn convert_av(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let facts = to_facts(&probe(Path::new(&file.path))?);
    let target_cat = category_of(target);
    if target_cat == Category::Audio && !facts.has_audio {
        return Err(AppError::user(format!("{} has no audio track.", file.name)));
    }
    if target_cat == Category::Video && !facts.has_video {
        return Err(AppError::user(format!("{} has no video track.", file.name)));
    }
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, output_ext(target))));
    let q = Quality { crf: ctx.settings.video_crf, audio_kbps: ctx.settings.audio_bitrate_kbps };
    let d = convert_defaults();
    let gif = GifOptions { width: opts.gif_width.unwrap_or(d.gif_width), fps: opts.gif_fps.unwrap_or(d.gif_fps) };
    let progress = |p: f64| ctx.progress(p, None);
    if file.category == Some(Category::Audio) {
        let a = audio_convert_args(&file.path, &out, &facts, target, q, true).map_err(AppError::other)?;
        run_ffmpeg(&a, FfmpegRun { duration_sec: Some(facts.duration_sec), cancel: Some(&ctx.cancel), on_progress: Some(&progress) })?;
    } else {
        run_with_hw_fallback(ctx, facts.duration_sec, &|hw| video_convert_args(&file.path, &out, &facts, target, q, gif, hw).map_err(AppError::other))?;
        if can_remux(&facts, target) {
            ctx.note("Copied streams without re-encoding");
        }
    }
    Ok(())
}
```

**File `src-tauri/crates/engine/src/convert/image.rs`**

```rust
//! Port of converters/image.ts.

use std::path::Path;

use alohamora_core::options::{ConvertOptions, SvgMode};
use alohamora_core::types::{FileInfo, Fmt};

use crate::image::encode::{save_as, SaveFmt};
use crate::image::exif::read_source_meta;
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn convert_image(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let quality = opts.quality.unwrap_or(ctx.settings.image_quality);
    let src = Path::new(&file.path);
    let img = crate::image::load(src, file.fmt)?;
    ctx.progress(0.2, None);
    let out = |ext: &str| ctx.new_output(OutputSpec::new(&file.path, ext));
    let raster = |fmt: SaveFmt| -> Result<()> {
        let meta = read_source_meta(src);
        save_as(&img, fmt, &out(fmt.ext()), quality, &ctx.temp_path("heic-src.png"), &ctx.cancel, Some(&meta))
    };
    match target {
        Fmt::Jpg => raster(SaveFmt::Jpg)?,
        Fmt::Png => raster(SaveFmt::Png)?,
        Fmt::Webp => raster(SaveFmt::Webp)?,
        Fmt::Avif => raster(SaveFmt::Avif)?,
        Fmt::Tiff => raster(SaveFmt::Tiff)?,
        Fmt::Bmp => raster(SaveFmt::Bmp)?,
        Fmt::Heic => {
            if !ctx.caps.heif_enc {
                return Err(AppError::user("HEIC output is not available on this computer (see the Formats page)."));
            }
            raster(SaveFmt::Heic)?
        }
        Fmt::Svg => {
            let svg = if opts.svg_mode.unwrap_or(SvgMode::Trace) == SvgMode::Embed {
                crate::image::svg::embed(&img)?
            } else {
                crate::image::svg::trace(&img, opts.svg_colors.unwrap_or(16.0))?
            };
            std::fs::write(out("svg"), svg)?;
        }
        Fmt::Pdf => {
            let pdf = out("pdf");
            crate::pdf::create::images_to_pdf(
                std::slice::from_ref(file), alohamora_core::options::PdfPageSize::Fit, alohamora_core::options::PdfMargin::None,
                &pdf, &|p| ctx.progress(p, None), &ctx.cancel,
            )?;
        }
        Fmt::Docx => {
            let img = crate::pdf::create::embeddable_image(file)?;
            std::fs::write(out("docx"), crate::docx::images_to_docx(&[img])?)?;
        }
        other => return Err(AppError::user(format!("Converting images to {} is not available yet.", other.as_str().to_uppercase()))),
    }
    ctx.progress(1.0, None);
    Ok(())
}
```

**File `src-tauri/crates/engine/src/convert/pdf.rs`**

```rust
//! Port of converters/pdf.ts: PDF → JPG/PNG pages, TXT, DOCX (reflow or exact pages), EPUB (reflow or fixed).

use std::path::Path;

use alohamora_core::options::{ConvertOptions, DocMode, OcrMode, StillFormat};
use alohamora_core::pdf_reflow::{blocks_to_text, blocks_to_xhtml, is_scanned, reflow_pages, split_chapters, Block};
use alohamora_core::text::guess_lang;
use alohamora_core::types::{FileInfo, Fmt};

use crate::epub::{build_fixed_epub, build_reflow_epub, Chapter, EpubMeta, FixedPage};
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

/// Render pages of `pdf_path` to images. `source` decides output naming.
/// One page → a single file; more → a "<base>-pages/" folder.
pub fn pdf_to_images(
    pdf_path: &Path, source: &str, fmt: StillFormat, dpi: f64, quality: f64, ctx: &JobContext, page_indexes: Option<Vec<usize>>,
) -> Result<()> {
    let doc = crate::pdf::open(pdf_path)?;
    let total = doc.pages().len() as usize;
    let pages = page_indexes.unwrap_or_else(|| (0..total).collect());
    let ext = fmt.ext();
    for (k, &p) in pages.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, p, dpi)?;
        let bytes = crate::pdf::encode_page(&img, fmt, quality)?;
        let spec = if pages.len() == 1 {
            OutputSpec::new(source, ext)
        } else {
            OutputSpec::new(source, ext).group("pages", p + 1, total)
        };
        std::fs::write(ctx.new_output(spec), bytes)?;
        ctx.progress((k + 1) as f64 / pages.len() as f64, None);
    }
    Ok(())
}

/// Text layer → blocks; a PDF without text is OCR'd (unless OCR is off).
fn pdf_to_blocks(file: &FileInfo, opts: &ConvertOptions, ctx: &JobContext) -> Result<Vec<Block>> {
    let path = Path::new(&file.path);
    let pages = crate::pdf::extract_text(&crate::pdf::open(path)?)?;
    if is_scanned(&pages) {
        if opts.ocr == Some(OcrMode::Off) {
            return Err(AppError::user("This PDF has no text layer (it looks scanned). Turn on OCR to extract the text."));
        }
        return crate::ocr::ocr_pdf_to_blocks(path, ctx, None);
    }
    Ok(reflow_pages(&pages, false))
}

/// Render every page as JPEG; returns (jpeg, width_pt, height_pt) per page.
fn render_all_jpeg(path: &Path, dpi: f64, quality: f64, ctx: &JobContext) -> Result<Vec<(Vec<u8>, f64, f64)>> {
    let doc = crate::pdf::open(path)?;
    let sizes = crate::pdf::page_sizes(&doc);
    let mut out = Vec::with_capacity(sizes.len());
    for (i, (w, h)) in sizes.iter().enumerate() {
        ctx.check_cancel()?;
        let img = crate::pdf::render_page(&doc, i, dpi)?;
        out.push((crate::pdf::encode_page(&img, StillFormat::Jpg, quality)?, *w, *h));
        ctx.progress((i + 1) as f64 / sizes.len() as f64, None);
    }
    Ok(out)
}

pub fn convert_pdf(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let path = Path::new(&file.path);
    let doc_mode = opts.doc_mode.unwrap_or(DocMode::Reflow);
    match target {
        Fmt::Jpg => pdf_to_images(path, &file.path, StillFormat::Jpg, ctx.settings.pdf_dpi, 0.9, ctx, None),
        Fmt::Png => pdf_to_images(path, &file.path, StillFormat::Png, ctx.settings.pdf_dpi, 0.9, ctx, None),
        Fmt::Txt => {
            let blocks = pdf_to_blocks(file, opts, ctx)?;
            std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "txt")), blocks_to_text(&blocks))?;
            Ok(())
        }
        Fmt::Docx => {
            let out = ctx.new_output(OutputSpec::new(&file.path, "docx"));
            let bytes = if doc_mode == DocMode::Pages {
                crate::docx::page_images_to_docx(&render_all_jpeg(path, 200.0, 0.85, ctx)?)?
            } else {
                crate::docx::blocks_to_docx(&pdf_to_blocks(file, opts, ctx)?, &file.base)?
            };
            std::fs::write(out, bytes)?;
            Ok(())
        }
        Fmt::Epub => {
            let out = ctx.new_output(OutputSpec::new(&file.path, "epub"));
            let mut meta = EpubMeta { title: file.base.clone(), author: None, lang: "en".into() };
            let bytes = if doc_mode == DocMode::Pages {
                let pages: Vec<FixedPage> = render_all_jpeg(path, 150.0, 0.85, ctx)?
                    .into_iter()
                    .map(|(jpeg, w, h)| FixedPage { jpeg, width: (w * 150.0 / 72.0).round() as u32, height: (h * 150.0 / 72.0).round() as u32 })
                    .collect();
                build_fixed_epub(&meta, &pages)?
            } else {
                let blocks = pdf_to_blocks(file, opts, ctx)?;
                meta.lang = guess_lang(&blocks_to_text(&blocks)).to_string();
                let chapters: Vec<Chapter> = split_chapters(&blocks, &file.base)
                    .into_iter()
                    .map(|c| Chapter { title: c.title, body_xhtml: blocks_to_xhtml(&c.blocks) })
                    .collect();
                build_reflow_epub(&meta, &chapters)?
            };
            std::fs::write(out, bytes)?;
            Ok(())
        }
        other => Err(AppError::user(format!("Converting PDF to {} is not available yet.", other.as_str().to_uppercase()))),
    }
}
```

**File `src-tauri/crates/engine/src/convert/subtitle.rs`**

```rust
//! Port of src/main/converters/subtitle.ts.

use alohamora_core::subtitles::{parse_subtitles, to_plain_text, to_srt, to_vtt};
use alohamora_core::text::decode_text;
use alohamora_core::types::{FileInfo, Fmt};

use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn convert_subtitle(file: &FileInfo, target: Fmt, ctx: &JobContext) -> Result<()> {
    let cues = parse_subtitles(&decode_text(&std::fs::read(&file.path)?));
    if cues.is_empty() {
        return Err(AppError::user(format!("No subtitles were found in {}.", file.name)));
    }
    let text = match target {
        Fmt::Srt => format!("\u{FEFF}{}", to_srt(&cues)),
        Fmt::Vtt => to_vtt(&cues),
        _ => to_plain_text(&cues),
    };
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, target.as_str())), text)?;
    Ok(())
}
```

**File `src-tauri/crates/engine/src/convert/text.rs`**

```rust
//! Port of src/main/converters/text.ts. TXT → PDF uses Typst (crate::text_pdf) instead of Chromium printing.

use alohamora_core::options::{convert_defaults, ConvertOptions, CueTiming};
use alohamora_core::subtitles::{text_to_cues, to_srt, to_vtt, CueTimingMode, TextToCuesOptions};
use alohamora_core::text::decode_text;
use alohamora_core::types::{FileInfo, Fmt};

use crate::convert::pdf::pdf_to_images;
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn read_text(file: &FileInfo) -> Result<String> {
    Ok(decode_text(&std::fs::read(&file.path)?))
}

pub fn convert_text(file: &FileInfo, target: Fmt, opts: &ConvertOptions, ctx: &JobContext) -> Result<()> {
    let text = read_text(file)?;
    let d = convert_defaults();
    match target {
        Fmt::Srt | Fmt::Vtt => {
            let timing = match opts.cue_timing.unwrap_or(d.cue_timing) {
                CueTiming::Reading => CueTimingMode::Reading,
                CueTiming::Fixed => CueTimingMode::Fixed,
            };
            let cues = text_to_cues(&text, &TextToCuesOptions { timing, seconds_per_cue: opts.seconds_per_cue.unwrap_or(d.seconds_per_cue) });
            if cues.is_empty() {
                return Err(AppError::user("This text file is empty."));
            }
            let body = if target == Fmt::Srt { format!("\u{FEFF}{}", to_srt(&cues)) } else { to_vtt(&cues) };
            std::fs::write(ctx.new_output(OutputSpec::new(&file.path, target.as_str())), body)?;
            Ok(())
        }
        Fmt::Pdf => {
            let pdf = crate::text_pdf::text_to_pdf(&text, &file.name, opts)?;
            std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf")), pdf)?;
            Ok(())
        }
        Fmt::Jpg | Fmt::Png => {
            let pdf_path = ctx.temp_path("text.pdf");
            std::fs::write(&pdf_path, crate::text_pdf::text_to_pdf(&text, &file.name, opts)?)?;
            let still = if target == Fmt::Png { alohamora_core::options::StillFormat::Png } else { alohamora_core::options::StillFormat::Jpg };
            pdf_to_images(&pdf_path, &file.path, still, opts.image_dpi.unwrap_or(d.image_dpi), 0.9, ctx, None)
        }
        other => Err(AppError::user(format!("Converting text to {} is not available yet.", other.as_str().to_uppercase()))),
    }
}
```

**File `src-tauri/crates/engine/src/tools/mod.rs`**

```rust
//! Port of src/main/tools/index.ts: one runner per tool.

pub mod audio;
pub mod image;
pub mod pdf;
pub mod subtitle;
pub mod video;

use alohamora_core::types::{FileInfo, ToolId};
use serde_json::Value;

use crate::jobs::JobContext;
use crate::Result;

/// Run one tool. Per-file tools get exactly one file; multi-input tools (join, merge, collage, make PDF) get all.
pub fn run(tool: ToolId, files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    use ToolId::*;
    match tool {
        VideoCompress => video::compress(&files[0], options, ctx),
        VideoMetadata => video::metadata(&files[0], options, ctx),
        VideoMute => video::mute(&files[0], ctx),
        VideoTrim => video::trim(&files[0], options, ctx),
        VideoCrop => video::crop(&files[0], options, ctx),
        VideoSpeed => video::speed(&files[0], options, ctx),
        VideoSnapshot => video::snapshot(&files[0], options, ctx),
        VideoSplit => video::split(&files[0], options, ctx),
        VideoRedact => video::redact(&files[0], options, ctx),
        VideoJoin => video::join(files, options, ctx),
        AudioCompress => audio::compress(&files[0], options, ctx),
        AudioNormalize => audio::normalize(&files[0], options, ctx),
        AudioTrim => audio::trim(&files[0], options, ctx),
        AudioChannels => audio::channels(&files[0], options, ctx),
        AudioVisualize => audio::visualize(&files[0], options, ctx),
        AudioBleep => audio::bleep(&files[0], options, ctx),
        AudioMetadata => audio::metadata(&files[0], options, ctx),
        AudioJoin => audio::join(files, options, ctx),
        ImageCompress => image::compress(&files[0], options, ctx),
        ImageResize => image::resize(&files[0], options, ctx),
        ImageCrop => image::crop(&files[0], options, ctx),
        ImageEdit => image::edit(&files[0], options, ctx),
        ImageBackground => image::background(&files[0], options, ctx),
        ImageRedact => image::redact(&files[0], options, ctx),
        ImageMetadata => image::metadata(&files[0], options, ctx),
        ImageCollage => image::collage(files, options, ctx),
        ImagePdf => image::make_pdf(files, options, ctx),
        PdfCompress => pdf::compress(&files[0], options, ctx),
        PdfMerge => pdf::merge(files, options, ctx),
        PdfSplit => pdf::split(&files[0], options, ctx),
        PdfOrganize => pdf::organize(&files[0], options, ctx),
        PdfImages => pdf::images(&files[0], options, ctx),
        PdfOcr => pdf::ocr(&files[0], options, ctx),
        PdfWord => pdf::word(&files[0], options, ctx),
        PdfMetadata => pdf::metadata(&files[0], options, ctx),
        SubtitleShift => subtitle::shift(&files[0], options, ctx),
    }
}

/// Apply the user's order (paths); anything not mentioned keeps its input position at the end.
pub fn order_files(files: &[FileInfo], order: &[String]) -> Vec<FileInfo> {
    if order.is_empty() {
        return files.to_vec();
    }
    let mut picked: Vec<FileInfo> = order.iter().filter_map(|p| files.iter().find(|f| &f.path == p).cloned()).collect();
    picked.extend(files.iter().filter(|f| !order.contains(&f.path)).cloned());
    picked
}

/// The UI's `tags` object as (key, value) pairs in the UI's order.
pub fn tag_pairs(tags: &serde_json::Map<String, Value>) -> Vec<(String, String)> {
    tags.iter()
        .map(|(k, v)| (k.clone(), match v {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        }))
        .collect()
}
```

**File `src-tauri/crates/engine/src/tools/video.rs`**

```rust
//! Port of src/main/tools/video/*.ts.

use std::path::Path;

use alohamora_core::ffmpeg_args::video::{
    can_concat_copy, compress_plan, concat_args, concat_list_file, crop_args, frames_every_args, metadata_args, mute_args, narrow_maps,
    normalize_clip_args, redact_args, snapshot_args, speed_args, target_video_kbps, trim_args, PixelRegion,
};
use alohamora_core::ffmpeg_args::{to_facts, MediaFacts, Quality};
use alohamora_core::geometry::{clamp_norm_rect, is_full_rect, to_pixel_rect};
use alohamora_core::js::{js_num, js_round, js_to_fixed};
use alohamora_core::options::*;
use alohamora_core::split::split_segments;
use alohamora_core::time::{format_bytes, format_duration};
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use super::{order_files, tag_pairs};
use crate::ffmpeg::{probe, run_ffmpeg, FfmpegRun};
use crate::jobs::{JobContext, OutputSpec};
use crate::paths::p2s;
use crate::{AppError, Result};

pub fn video_facts(file: &FileInfo) -> Result<MediaFacts> {
    let f = to_facts(&probe(Path::new(&file.path))?);
    if !f.has_video {
        return Err(AppError::user(format!("{} has no video track.", file.name)));
    }
    Ok(f)
}

/// Tools re-encode at high quality to avoid visible generation loss.
pub fn tool_quality(ctx: &JobContext) -> Quality {
    Quality { crf: ctx.settings.video_crf.min(20.0), audio_kbps: ctx.settings.audio_bitrate_kbps }
}

/// Tools keep the input container so users get back what they gave.
pub fn same_fmt(file: &FileInfo) -> Fmt {
    file.fmt.unwrap_or(Fmt::Mp4)
}

/// The verified hardware H.264 encoder for this job, or None for the CPU.
pub fn hw_for(ctx: &JobContext) -> Option<String> {
    if ctx.settings.hardware_video { ctx.caps.hw_video.clone() } else { None }
}

/// Run FFmpeg with the hardware encoder; if that fails, retry once on the CPU and say so on the Done card.
pub fn run_with_hw_fallback(ctx: &JobContext, duration_sec: f64, build: &dyn Fn(Option<&str>) -> Result<Vec<String>>) -> Result<()> {
    run_with_hw_fallback_scaled(ctx, duration_sec, &|p| p, build)
}

/// Same, with `scale` mapping this run's 0..1 progress into the subtask (for multi-part tools like Split).
pub fn run_with_hw_fallback_scaled(ctx: &JobContext, duration_sec: f64, scale: &dyn Fn(f64) -> f64, build: &dyn Fn(Option<&str>) -> Result<Vec<String>>) -> Result<()> {
    let progress = |p: f64| ctx.progress(scale(p), None);
    let run = |args: Vec<String>| run_ffmpeg(&args, FfmpegRun { duration_sec: Some(duration_sec), cancel: Some(&ctx.cancel), on_progress: Some(&progress) });
    let hw = hw_for(ctx);
    match run(build(hw.as_deref())?) {
        Ok(()) => Ok(()),
        Err(e) if hw.is_none() || e.is_canceled() || ctx.cancel.is_cancelled() => Err(e),
        Err(_) => {
            ctx.note("Hardware encoder failed — used CPU");
            run(build(None)?)
        }
    }
}

fn ffmpeg_with_progress(ctx: &JobContext, args: &[String], duration_sec: Option<f64>, scale: impl Fn(f64) -> f64) -> Result<()> {
    let progress = |p: f64| ctx.progress(scale(p), None);
    run_ffmpeg(args, FfmpegRun { duration_sec, cancel: Some(&ctx.cancel), on_progress: Some(&progress) })
}

fn saved_note(before: u64, after: u64) -> String {
    let pct = js_round((1.0 - after as f64 / before as f64) * 100.0).max(0.0);
    format!("{} → {} (−{}%)", format_bytes(before), format_bytes(after), js_num(pct))
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoCompressOptions = with_defaults(ToolId::VideoCompress, options);
    let f = video_facts(file)?;
    let webm = file.fmt == Some(Fmt::Webm);
    if o.target_size_mb > 0.0 && target_video_kbps(o.target_size_mb, f.duration_sec, 128.0) < 150.0 {
        let min_mb = ((150.0 + 128.0) * f.duration_sec / 8192.0).ceil();
        return Err(AppError::user(format!(
            "{} MB is too small for a {} video. Try at least {} MB.",
            js_num(o.target_size_mb), format_duration(f.duration_sec), js_num(min_mb)
        )));
    }
    let out_path = ctx.new_output(OutputSpec::new(&file.path, if webm { "webm" } else { "mp4" }).suffix("compressed"));
    let out = p2s(&out_path);
    let pass_log = p2s(&ctx.temp_path("pass"));
    let passes = compress_plan(&file.path, &out, &f, &o, webm, &pass_log, None);
    if passes.len() == 1 {
        run_with_hw_fallback(ctx, f.duration_sec, &|hw| Ok(compress_plan(&file.path, &out, &f, &o, webm, &pass_log, hw).remove(0)))?;
    } else {
        let n = passes.len() as f64;
        for (i, pass) in passes.iter().enumerate() {
            ffmpeg_with_progress(ctx, pass, Some(f.duration_sec), |p| (i as f64 + p) / n)?;
        }
    }
    let before = file.size;
    let after = std::fs::metadata(&out_path)?.len();
    if after >= before && o.target_size_mb == 0.0 {
        ctx.drop_output(&out_path);
        ctx.note("Already well compressed — no smaller file was made.");
        return Ok(());
    }
    ctx.note(saved_note(before, after));
    Ok(())
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: MediaMetadataOptions = with_defaults(ToolId::VideoMetadata, options);
    let f = video_facts(file)?;
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(if o.remove_all { "clean" } else { "meta" })));
    let a = metadata_args(&file.path, &out, o.remove_all, &tag_pairs(&o.tags), fmt);
    match ffmpeg_with_progress(ctx, &a, Some(f.duration_sec), |p| p) {
        Ok(()) => {}
        Err(e) if e.is_canceled() => return Err(e),
        Err(_) => ffmpeg_with_progress(ctx, &narrow_maps(&a), Some(f.duration_sec), |p| p)?,
    }
    ctx.note(if o.remove_all { "Metadata removed" } else { "Metadata updated" });
    Ok(())
}

pub fn mute(file: &FileInfo, ctx: &JobContext) -> Result<()> {
    let f = video_facts(file)?;
    if !f.has_audio {
        return Err(AppError::user(format!("{} has no audio to remove.", file.name)));
    }
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("muted")));
    ffmpeg_with_progress(ctx, &mute_args(&file.path, &out, fmt), Some(f.duration_sec), |p| p)
}

pub fn trim(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoTrimOptions = with_defaults(ToolId::VideoTrim, options);
    let f = video_facts(file)?;
    let end = if o.end_sec > 0.0 { o.end_sec.min(f.duration_sec) } else { f.duration_sec };
    if end - o.start_sec < 0.1 {
        return Err(AppError::user("The selection is too short."));
    }
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("trimmed")));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, end - o.start_sec, &|hw| Ok(trim_args(&file.path, &out, &f, o.start_sec, end, o.precise, fmt, q, hw)))
}

pub fn crop(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoCropOptions = with_defaults(ToolId::VideoCrop, options);
    let f = video_facts(file)?;
    if is_full_rect(o.rect) {
        return Err(AppError::user("Move the crop handles first — the whole frame is selected."));
    }
    let r = to_pixel_rect(clamp_norm_rect(o.rect), f.width.unwrap_or(0), f.height.unwrap_or(0), true);
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("cropped")));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, f.duration_sec, &|hw| Ok(crop_args(&file.path, &out, &f, r, fmt, q, hw)))?;
    ctx.note(format!("{} × {} px", r.w, r.h));
    Ok(())
}

pub fn speed(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoSpeedOptions = with_defaults(ToolId::VideoSpeed, options);
    if !(o.factor >= 0.25 && o.factor <= 4.0) {
        return Err(AppError::user("Speed must be between 0.25× and 4×."));
    }
    let f = video_facts(file)?;
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(&format!("{}x", js_num(o.factor)))));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, f.duration_sec / o.factor, &|hw| Ok(speed_args(&file.path, &out, &f, o.factor, o.keep_audio, fmt, q, hw)))
}

pub fn snapshot(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoSnapshotOptions = with_defaults(ToolId::VideoSnapshot, options);
    let f = video_facts(file)?;
    let jpg = o.format == StillFormat::Jpg;
    if o.mode == SnapshotMode::Single {
        let suffix = format!("frame-{}s", js_to_fixed(o.time_sec, 2).replace('.', "_"));
        let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, o.format.ext()).suffix(&suffix)));
        let t = o.time_sec.min((f.duration_sec - 0.05).max(0.0));
        return run_ffmpeg(&snapshot_args(&file.path, &out, t, jpg), FfmpegRun { cancel: Some(&ctx.cancel), ..Default::default() });
    }
    let dir = ctx.temp_path("frames");
    std::fs::create_dir_all(&dir)?;
    let pattern = p2s(&dir.join(format!("f-%05d.{}", o.format.ext())));
    ffmpeg_with_progress(ctx, &frames_every_args(&file.path, &pattern, o.every_sec, jpg), Some(f.duration_sec), |p| p)?;
    let mut names: Vec<_> = std::fs::read_dir(&dir)?.flatten().map(|e| e.path()).collect();
    names.sort();
    let total = names.len();
    for (i, src) in names.iter().enumerate() {
        let out = ctx.new_output(OutputSpec::new(&file.path, o.format.ext()).group("frames", i + 1, total));
        std::fs::rename(src, out)?;
    }
    ctx.note(format!("{total} frames"));
    Ok(())
}

pub fn split(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoSplitOptions = with_defaults(ToolId::VideoSplit, options);
    let f = video_facts(file)?;
    let segs = split_segments(f.duration_sec, &o);
    if segs.len() < 2 {
        return Err(AppError::user("Add at least one cut point inside the video."));
    }
    let fmt = same_fmt(file);
    let q = tool_quality(ctx);
    for (i, s) in segs.iter().enumerate() {
        ctx.check_cancel()?;
        let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).group("parts", i + 1, segs.len())));
        let n = segs.len() as f64;
        run_with_hw_fallback_scaled(ctx, s.end - s.start, &|p| (i as f64 + p) / n, &|hw| Ok(trim_args(&file.path, &out, &f, s.start, s.end, o.precise, fmt, q, hw)))?;
    }
    ctx.note(format!("{} parts", segs.len()));
    Ok(())
}

pub fn redact(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: VideoRedactOptions = with_defaults(ToolId::VideoRedact, options);
    if o.regions.is_empty() {
        return Err(AppError::user("Draw at least one box over the area to hide."));
    }
    let f = video_facts(file)?;
    let regions: Vec<PixelRegion> = o
        .regions
        .iter()
        .map(|r| PixelRegion {
            rect: to_pixel_rect(clamp_norm_rect(r.rect), f.width.unwrap_or(0), f.height.unwrap_or(0), true),
            style: r.style,
            start_sec: r.start_sec,
            end_sec: r.end_sec,
        })
        .collect();
    let fmt = same_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("redacted")));
    let q = tool_quality(ctx);
    run_with_hw_fallback(ctx, f.duration_sec, &|hw| Ok(redact_args(&file.path, &out, &f, &regions, fmt, q, hw)))?;
    ctx.note("Metadata removed");
    Ok(())
}

pub fn join(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: JoinOptions = with_defaults(ToolId::VideoJoin, options);
    let ordered = order_files(files, &o.order);
    let facts: Vec<MediaFacts> = ordered.iter().map(video_facts).collect::<Result<_>>()?;
    let first = &ordered[0];
    let total_sec: f64 = facts.iter().map(|f| f.duration_sec).sum();
    if can_concat_copy(&facts) {
        let fmt = same_fmt(first);
        let list = ctx.temp_path("list.txt");
        std::fs::write(&list, concat_list_file(&ordered.iter().map(|f| f.path.clone()).collect::<Vec<_>>()))?;
        let out = p2s(&ctx.new_output(OutputSpec::new(&first.path, fmt.as_str()).suffix("joined")));
        return ffmpeg_with_progress(ctx, &concat_args(&p2s(&list), &out, fmt), Some(total_sec), |p| p);
    }
    // Clips differ: bring every clip to the first clip's size / frame rate, then copy-concat the results.
    let even = |n: u32| (js_round(n as f64 / 2.0) * 2.0).max(2.0) as u32;
    let width = even(facts[0].width.unwrap_or(1280));
    let height = even(facts[0].height.unwrap_or(720));
    let fps = { let r = js_round(facts[0].fps.filter(|v| *v > 0.0).unwrap_or(30.0)).min(60.0); if r > 0.0 { r } else { 30.0 } };
    let mut parts = Vec::new();
    let n = ordered.len() as f64;
    for (i, file) in ordered.iter().enumerate() {
        ctx.check_cancel()?;
        let tmp = ctx.temp_path(&format!("n{i}.mp4"));
        ffmpeg_with_progress(ctx, &normalize_clip_args(&file.path, &p2s(&tmp), &facts[i], width, height, fps), Some(facts[i].duration_sec), |p| ((i as f64 + p) / n) * 0.8)?;
        parts.push(p2s(&tmp));
    }
    let list = ctx.temp_path("list.txt");
    std::fs::write(&list, concat_list_file(&parts))?;
    let out = p2s(&ctx.new_output(OutputSpec::new(&first.path, "mp4").suffix("joined")));
    ffmpeg_with_progress(ctx, &concat_args(&p2s(&list), &out, Fmt::Mp4), Some(total_sec), |p| 0.8 + p * 0.2)?;
    ctx.note("Clips were re-encoded to match");
    Ok(())
}
```

**File `src-tauri/crates/engine/src/tools/audio.rs`**

```rust
//! Port of src/main/tools/audio/*.ts.

use std::path::Path;

use alohamora_core::ffmpeg_args::audio::{
    audio_metadata_args, bleep_args, channels_args, compress_audio_args, compress_out_fmt, join_audio_args, loudnorm_pass1, loudnorm_pass2,
    parse_loudnorm, trim_audio_args, visualize_args,
};
use alohamora_core::ffmpeg_args::{to_facts, MediaFacts, Quality};
use alohamora_core::js::{js_num, js_round, js_to_fixed};
use alohamora_core::options::*;
use alohamora_core::time::format_bytes;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use super::{order_files, tag_pairs};
use crate::ffmpeg::{probe, run_ffmpeg, run_ffmpeg_capture, FfmpegRun};
use crate::jobs::{JobContext, OutputSpec};
use crate::paths::p2s;
use crate::process::last_lines;
use crate::{AppError, Result};

pub fn audio_facts(file: &FileInfo) -> Result<MediaFacts> {
    let f = to_facts(&probe(Path::new(&file.path))?);
    if !f.has_audio {
        return Err(AppError::user(format!("{} has no audio track.", file.name)));
    }
    Ok(f)
}

/// Audio tools re-encode at a generous bitrate to avoid audible generation loss.
pub fn tool_audio_quality(ctx: &JobContext) -> Quality {
    Quality { crf: 23.0, audio_kbps: ctx.settings.audio_bitrate_kbps.max(192.0) }
}

/// Tools keep the input container so users get back what they gave.
pub fn same_audio_fmt(file: &FileInfo) -> Fmt {
    file.fmt.unwrap_or(Fmt::Mp3)
}

fn run(ctx: &JobContext, args: &[String], duration_sec: Option<f64>, scale: impl Fn(f64) -> f64) -> Result<()> {
    let progress = |p: f64| ctx.progress(scale(p), None);
    run_ffmpeg(args, FfmpegRun { duration_sec, cancel: Some(&ctx.cancel), on_progress: Some(&progress) })
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioCompressOptions = with_defaults(ToolId::AudioCompress, options);
    let f = audio_facts(file)?;
    let out_fmt = compress_out_fmt(same_audio_fmt(file), o.format);
    let out_path = ctx.new_output(OutputSpec::new(&file.path, out_fmt.as_str()).suffix("compressed"));
    let a = compress_audio_args(&file.path, &p2s(&out_path), o.bitrate_kbps, o.mono, out_fmt).map_err(AppError::other)?;
    run(ctx, &a, Some(f.duration_sec), |p| p)?;
    let after = std::fs::metadata(&out_path)?.len();
    if after >= file.size {
        ctx.drop_output(&out_path);
        ctx.note("Already small — no smaller file was made");
        return Ok(());
    }
    let pct = js_round((1.0 - after as f64 / file.size as f64) * 100.0);
    ctx.note(format!("{} → {} (−{}%)", format_bytes(file.size), format_bytes(after), js_num(pct)));
    Ok(())
}

pub fn normalize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioNormalizeOptions = with_defaults(ToolId::AudioNormalize, options);
    let f = audio_facts(file)?;
    ctx.progress(0.25, Some("Measuring loudness".into()));
    let stderr = run_ffmpeg_capture(&loudnorm_pass1(&file.path, &o), Some(&ctx.cancel))?;
    let stats = parse_loudnorm(&stderr).ok_or_else(|| AppError::tool("Could not measure loudness", last_lines(&stderr, 15)))?;
    let measured: f64 = stats.input_i.parse().unwrap_or(f64::NAN);
    if stats.input_i == "-inf" || !measured.is_finite() {
        return Err(AppError::user("This file is silent."));
    }
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("normalized")));
    let a = loudnorm_pass2(&file.path, &out, &f, &o, &stats, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?;
    let progress = |p: f64| ctx.progress(0.5 + p * 0.5, Some("Normalizing".into()));
    run_ffmpeg(&a, FfmpegRun { duration_sec: Some(f.duration_sec), cancel: Some(&ctx.cancel), on_progress: Some(&progress) })?;
    ctx.note(format!("{} LUFS → {} LUFS", js_to_fixed(measured, 1), js_num(o.target)));
    Ok(())
}

pub fn trim(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioTrimOptions = with_defaults(ToolId::AudioTrim, options);
    let f = audio_facts(file)?;
    let end = if o.end_sec > 0.0 { o.end_sec.min(f.duration_sec) } else { f.duration_sec };
    if end - o.start_sec < 0.1 {
        return Err(AppError::user("The selection is too short."));
    }
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("trimmed")));
    let a = trim_audio_args(&file.path, &out, &f, &o, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?;
    run(ctx, &a, Some(end - o.start_sec), |p| p)
}

pub fn channels(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioChannelsOptions = with_defaults(ToolId::AudioChannels, options);
    let f = audio_facts(file)?;
    if matches!(o.mode, ChannelMode::Left | ChannelMode::Right | ChannelMode::Swap) && f.channels.unwrap_or(2) < 2 {
        return Err(AppError::user("This file is mono."));
    }
    let suffix = match o.mode {
        ChannelMode::Mono => "mono",
        ChannelMode::Stereo => "stereo",
        ChannelMode::Left => "left",
        ChannelMode::Right => "right",
        ChannelMode::Swap => "swapped",
    };
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(suffix)));
    let a = channels_args(&file.path, &out, &f, o.mode, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?;
    run(ctx, &a, Some(f.duration_sec), |p| p)
}

pub fn visualize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: AudioVisualizeOptions = with_defaults(ToolId::AudioVisualize, options);
    let f = audio_facts(file)?;
    let (ext, suffix) = match o.kind {
        VisualizeKind::WaveformMp4 => ("mp4", "waveform"),
        VisualizeKind::SpectrogramPng => ("png", "spectrogram"),
        VisualizeKind::WaveformPng => ("png", "waveform"),
    };
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, ext).suffix(suffix)));
    let duration = if o.kind == VisualizeKind::WaveformMp4 { Some(f.duration_sec) } else { None };
    run(ctx, &visualize_args(&file.path, &out, &o), duration, |p| p)
}

pub fn bleep(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let mut o: AudioBleepOptions = with_defaults(ToolId::AudioBleep, options);
    let f = audio_facts(file)?;
    o.ranges = o
        .ranges
        .iter()
        .map(|r| TimeRangeSec { start_sec: r.start_sec.max(0.0), end_sec: r.end_sec.min(f.duration_sec) })
        .filter(|r| r.end_sec - r.start_sec > 0.01)
        .collect();
    if o.ranges.is_empty() {
        return Err(AppError::user("Add at least one part to bleep."));
    }
    let fmt = same_audio_fmt(file);
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix("bleeped")));
    run(ctx, &bleep_args(&file.path, &out, &f, &o, fmt, tool_audio_quality(ctx)).map_err(AppError::other)?, Some(f.duration_sec), |p| p)?;
    let n = o.ranges.len();
    ctx.note(format!("{n} part{} {}", if n == 1 { "" } else { "s" }, if o.sound == BleepSound::Beep { "bleeped" } else { "silenced" }));
    Ok(())
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: MediaMetadataOptions = with_defaults(ToolId::AudioMetadata, options);
    let f = audio_facts(file)?;
    let fmt = same_audio_fmt(file);
    let mut cover_jpg: Option<String> = None;
    if let Some(cover) = &o.cover_path {
        if matches!(fmt, Fmt::Mp3 | Fmt::M4a | Fmt::Flac) {
            let p = ctx.temp_path("cover.jpg");
            crate::image::cover_art_jpeg(Path::new(cover), &p)?;
            cover_jpg = Some(p2s(&p));
        } else {
            ctx.note("Cover art isn't supported for this format");
        }
    }
    let out = p2s(&ctx.new_output(OutputSpec::new(&file.path, fmt.as_str()).suffix(if o.remove_all { "clean" } else { "meta" })));
    let a = audio_metadata_args(&file.path, &out, o.remove_all, o.remove_cover, &tag_pairs(&o.tags), fmt, f.has_cover, cover_jpg.as_deref());
    run(ctx, &a, Some(f.duration_sec), |p| p)?;
    ctx.note(if o.remove_all { "Metadata removed" } else { "Metadata updated" });
    Ok(())
}

pub fn join(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: JoinOptions = with_defaults(ToolId::AudioJoin, options);
    let ordered = order_files(files, &o.order);
    let facts: Vec<MediaFacts> = ordered.iter().map(audio_facts).collect::<Result<_>>()?;
    let first = &ordered[0];
    let fmt = same_audio_fmt(first);
    let out = p2s(&ctx.new_output(OutputSpec::new(&first.path, fmt.as_str()).suffix("joined")));
    let total: f64 = facts.iter().map(|f| f.duration_sec).sum();
    let inputs: Vec<String> = ordered.iter().map(|f| f.path.clone()).collect();
    let a = join_audio_args(&inputs, &out, fmt, tool_audio_quality(ctx), &facts[0]).map_err(AppError::other)?;
    run(ctx, &a, Some(total), |p| p)
}
```

**File `src-tauri/crates/engine/src/tools/image.rs`**

```rust
//! Port of src/main/tools/image/*.ts.

use std::path::Path;

use alohamora_core::edit_pipeline::build_edit_spec;
use alohamora_core::geometry::{clamp_norm_rect, is_full_rect, to_pixel_rect};
use alohamora_core::js::{js_num, js_round};
use alohamora_core::options::*;
use alohamora_core::time::format_bytes;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use image::DynamicImage;
use serde_json::Value;

use super::order_files;
use crate::image::encode::{self, same_image_fmt, save_as, save_raster, SaveFmt};
use crate::image::exif::{self, read_source_meta, EditFields};
use crate::image::{load, ops};
use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

fn src(file: &FileInfo) -> &Path {
    Path::new(&file.path)
}

/// Save in the input's own format (port of saveImageAs). `keep_meta` carries EXIF/ICC over.
fn save_same(img: &DynamicImage, file: &FileInfo, suffix: &str, quality: f64, ctx: &JobContext, keep_meta: bool) -> Result<SaveFmt> {
    let fmt = same_image_fmt(file.fmt, ctx.caps.heif_enc);
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix(suffix));
    let meta = if keep_meta { Some(read_source_meta(src(file))) } else { None };
    save_as(img, fmt, &out, quality, &ctx.temp_path("heic.png"), &ctx.cancel, meta.as_ref())?;
    Ok(fmt)
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageCompressOptions = with_defaults(ToolId::ImageCompress, options);
    let fmt = crate::image::compress_fmt(file, &o);
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix("compressed"));
    let (bytes, _) = crate::image::compress_to_bytes(file, &o)?;
    if bytes.len() as u64 >= file.size {
        ctx.drop_output(&out);
        ctx.note(format!("{} is already small", file.name));
        return Ok(());
    }
    std::fs::write(&out, &bytes)?;
    let saved = js_round((1.0 - bytes.len() as f64 / file.size as f64) * 100.0);
    ctx.note(format!("{} → {} (−{}%)", format_bytes(file.size), format_bytes(bytes.len() as u64), js_num(saved)));
    Ok(())
}

pub fn resize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageResizeOptions = with_defaults(ToolId::ImageResize, options);
    let img = load(src(file), file.fmt)?;
    let (sw, sh) = (img.width() as f64, img.height() as f64);
    let (w, h): (Option<f64>, Option<f64>);
    let mut fill = false;
    if o.mode == ResizeMode::Percent {
        if o.percent.is_nan() || o.percent <= 0.0 {
            return Err(AppError::user("Choose a size above 0 %."));
        }
        w = Some(js_round(sw * o.percent / 100.0).max(1.0));
        h = Some(js_round(sh * o.percent / 100.0).max(1.0));
    } else {
        w = if o.width > 0.0 { Some(js_round(o.width)) } else { None };
        h = if o.height > 0.0 { Some(js_round(o.height)) } else { None };
        if w.is_none() && h.is_none() {
            return Err(AppError::user("Enter a width or a height."));
        }
        if !o.keep_aspect && w.is_some() && h.is_some() {
            fill = true;
        }
    }
    // sharp: one side given → the other follows the aspect ratio; both given + keep aspect → fit inside.
    let resized = match (w, h) {
        (Some(w), Some(h)) if fill => img.resize_exact(w as u32, h as u32, image::imageops::FilterType::Lanczos3),
        (Some(w), Some(h)) => img.resize(w as u32, h as u32, image::imageops::FilterType::Lanczos3),
        (Some(w), None) => img.resize_exact(w as u32, js_round(w * sh / sw).max(1.0) as u32, image::imageops::FilterType::Lanczos3),
        (None, Some(h)) => img.resize_exact(js_round(h * sw / sh).max(1.0) as u32, h as u32, image::imageops::FilterType::Lanczos3),
        (None, None) => img,
    };
    save_same(&resized, file, "resized", ctx.settings.image_quality.max(90.0), ctx, true)?;
    let show = |v: Option<f64>| v.map(js_num).unwrap_or_else(|| "?".into());
    ctx.note(format!("{}×{} → {}×{}", js_num(sw), js_num(sh), show(w), show(h)));
    Ok(())
}

pub fn crop(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageCropOptions = with_defaults(ToolId::ImageCrop, options);
    let mut img = load(src(file), file.fmt)?;
    img = match (js_round(o.rotate) as i64).rem_euclid(360) {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };
    if o.flip_v {
        img = img.flipv();
    }
    if o.flip_h {
        img = img.fliph();
    }
    if !is_full_rect(o.rect) {
        let r = to_pixel_rect(clamp_norm_rect(o.rect), img.width(), img.height(), false);
        img = img.crop_imm(r.x, r.y, r.w, r.h);
    }
    save_same(&img, file, "cropped", ctx.settings.image_quality.max(92.0), ctx, true)?;
    Ok(())
}

pub fn edit(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: EditParams = with_defaults(ToolId::ImageEdit, options);
    let img = load(src(file), file.fmt)?;
    let edited = ops::apply_edit(&img, &build_edit_spec(&o));
    save_same(&edited, file, "edited", ctx.settings.image_quality.max(92.0), ctx, true)?;
    Ok(())
}

pub fn background(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageBackgroundOptions = with_defaults(ToolId::ImageBackground, options);
    let img = load(src(file), file.fmt)?;
    let composed = DynamicImage::ImageRgba8(ops::compose_background(&img, &o)?);
    let fmt = if file.fmt == Some(Fmt::Jpg) { SaveFmt::Jpg } else { SaveFmt::Png };
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix("backdrop"));
    save_raster(&composed, fmt, &out, ctx.settings.image_quality.max(92.0), None)
}

pub fn redact(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageRedactOptions = with_defaults(ToolId::ImageRedact, options);
    if o.regions.is_empty() {
        return Err(AppError::user("Draw at least one box over the area to hide."));
    }
    let img = load(src(file), file.fmt)?;
    let had_alpha = img.color().has_alpha();
    let out = DynamicImage::ImageRgba8(ops::redact(&img, &o.regions));
    let out = if had_alpha { out } else { DynamicImage::ImageRgb8(out.to_rgb8()) };
    save_same(&out, file, "redacted", 92.0, ctx, false)?;
    ctx.note("Metadata removed");
    Ok(())
}

/// "2024-05-01T14:30" (datetime-local) → "2024:05:01 14:30:00" (EXIF). Anything else is returned unchanged.
pub fn to_exif_date(v: Option<&str>) -> Option<String> {
    let v = v.filter(|s| !s.is_empty())?;
    let re = regex::Regex::new(r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?").expect("valid regex");
    Some(match re.captures(v) {
        Some(c) => format!("{}:{}:{} {}:{}:{}", &c[1], &c[2], &c[3], &c[4], &c[5], c.get(6).map(|m| m.as_str()).unwrap_or("00")),
        None => v.to_string(),
    })
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: ImageMetadataOptions = with_defaults(ToolId::ImageMetadata, options);
    let fmt = same_image_fmt(file.fmt, ctx.caps.heif_enc);
    let suffix = match o.action {
        ImageMetadataAction::RemoveAll => "clean",
        ImageMetadataAction::RemoveGps => "nogps",
        ImageMetadataAction::Edit => "meta",
    };
    let out = ctx.new_output(OutputSpec::new(&file.path, fmt.ext()).suffix(suffix));
    let bytes = std::fs::read(src(file))?;
    let bad = |e: String| AppError::user_with(crate::image::MSG_UNREADABLE, e);

    if o.action == ImageMetadataAction::RemoveAll {
        // JPEGs with an orientation tag are re-encoded upright; stripping the tag losslessly would turn them.
        if file.fmt == Some(Fmt::Jpg) && exif::orientation(src(file)) == 1 {
            std::fs::write(&out, alohamora_core::image_meta::strip_jpeg_metadata(&bytes, true).map_err(bad)?)?;
        } else if file.fmt == Some(Fmt::Png) {
            std::fs::write(&out, alohamora_core::image_meta::strip_png_metadata(&bytes).map_err(bad)?)?;
        } else {
            save_as(&load(src(file), file.fmt)?, fmt, &out, 95.0, &ctx.temp_path("heic.png"), &ctx.cancel, None)?;
        }
        ctx.note("Metadata removed");
        return Ok(());
    }

    if file.fmt == Some(Fmt::Jpg) {
        let new_bytes = if o.action == ImageMetadataAction::RemoveGps {
            exif::jpeg_remove_gps(&bytes)?
        } else {
            let f = &o.fields;
            exif::jpeg_edit_fields(&bytes, &EditFields {
                artist: f.artist.clone(),
                copyright: f.copyright.clone(),
                description: f.description.clone(),
                date_taken: to_exif_date(f.date_taken.as_deref()),
            })?
        };
        std::fs::write(&out, new_bytes)?;
    } else {
        // Other formats: re-encode, carrying over (or replacing) only the text fields — never the location.
        let (a0, c0, d0) = exif::text_fields(src(file));
        let edit = o.action == ImageMetadataAction::Edit;
        let pick = |new: &Option<String>, old: String| if edit { new.clone().unwrap_or(old) } else { old };
        let artist = pick(&o.fields.artist, a0);
        let copyright = pick(&o.fields.copyright, c0);
        let description = pick(&o.fields.description, d0);
        let meta = exif::SourceMeta { exif: exif::text_only_exif(&artist, &copyright, &description)?, icc: None };
        save_as(&load(src(file), file.fmt)?, fmt, &out, 95.0, &ctx.temp_path("heic.png"), &ctx.cancel, Some(&meta))?;
    }
    ctx.note(if o.action == ImageMetadataAction::RemoveGps { "Location removed" } else { "Metadata updated" });
    Ok(())
}

pub fn collage(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: CollageOptions = with_defaults(ToolId::ImageCollage, options);
    let ordered = order_files(files, &o.order);
    let canvas = ops::compose_collage(&ordered, &o, o.width, Some(&ctx.cancel))?;
    let bg = ops::parse_color(&o.background);
    let flat = DynamicImage::ImageRgb8(encode::flatten(&DynamicImage::ImageRgba8(canvas), [bg[0], bg[1], bg[2]]));
    let out = ctx.new_output(OutputSpec::new(&ordered[0].path, "jpg").suffix("collage"));
    std::fs::write(out, encode::jpeg_bytes(&flat, 90.0)?)?;
    ctx.note(format!("{} images", ordered.len()));
    Ok(())
}

pub fn make_pdf(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: CreatePdfOptions = with_defaults(ToolId::ImagePdf, options);
    let ordered = order_files(files, &o.order);
    if o.combine {
        let out = ctx.new_output(OutputSpec::new(&ordered[0].path, "pdf"));
        crate::pdf::create::images_to_pdf(&ordered, o.page_size, o.margin, &out, &|p| ctx.progress(p, None), &ctx.cancel)?;
        ctx.note(format!("{} page{}", ordered.len(), if ordered.len() == 1 { "" } else { "s" }));
        return Ok(());
    }
    let n = ordered.len() as f64;
    for (i, f) in ordered.iter().enumerate() {
        let out = ctx.new_output(OutputSpec::new(&f.path, "pdf"));
        crate::pdf::create::images_to_pdf(std::slice::from_ref(f), o.page_size, o.margin, &out, &|p| ctx.progress((i as f64 + p) / n, None), &ctx.cancel)?;
    }
    ctx.note(format!("{} PDFs", ordered.len()));
    Ok(())
}
```

**File `src-tauri/crates/engine/src/tools/pdf.rs`**

```rust
//! Port of src/main/tools/pdf/*.ts.

use std::path::Path;

use alohamora_core::js::{js_num, js_round};
use alohamora_core::options::*;
use alohamora_core::page_ranges::{flatten_ranges, parse_page_ranges};
use alohamora_core::pdf_split::split_groups;
use alohamora_core::time::format_bytes;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use super::order_files;
use crate::jobs::{JobContext, OutputSpec};
use crate::pdf::{create, edit, open, page_sizes, render_page, encode_page};
use crate::{AppError, Result};

fn src(file: &FileInfo) -> &Path {
    Path::new(&file.path)
}

/// Page ranges typed by the user → 0-based page indexes (range errors become user errors).
fn page_indexes(ranges: &str, total: u32) -> Result<Vec<usize>> {
    let groups = parse_page_ranges(ranges, total as usize).map_err(AppError::user)?;
    Ok(flatten_ranges(&groups))
}

pub fn compress(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfCompressOptions = with_defaults(ToolId::PdfCompress, options);
    let out = ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("compressed"));
    if o.level == PdfCompressLevel::Max {
        let doc = open(src(file))?;
        let sizes = page_sizes(&doc);
        let mut pages = Vec::with_capacity(sizes.len());
        for (i, (w, h)) in sizes.iter().enumerate() {
            ctx.check_cancel()?;
            let img = render_page(&doc, i, 110.0)?;
            pages.push((encode_page(&img, StillFormat::Jpg, 0.6)?, *w, *h));
            ctx.progress((i + 1) as f64 / sizes.len() as f64, None);
        }
        std::fs::write(&out, create::page_images_to_pdf(&pages)?)?;
        ctx.note("Pages were converted to images (text is no longer selectable)");
        return Ok(());
    }
    open(src(file))?; // same password/damaged errors as everywhere else
    let (bytes, _) = edit::recompress_images(src(file), o.level, &|p| ctx.progress(p * 0.9, None), &ctx.cancel)?;
    if bytes.len() as f64 >= file.size as f64 * 0.98 {
        ctx.drop_output(&out);
        ctx.note("Already optimized — no smaller file was made");
        return Ok(());
    }
    std::fs::write(&out, &bytes)?;
    let saved = js_round((1.0 - bytes.len() as f64 / file.size as f64) * 100.0);
    ctx.note(format!("{} → {} (−{}%)", format_bytes(file.size), format_bytes(bytes.len() as u64), js_num(saved)));
    Ok(())
}

pub fn merge(files: &[FileInfo], options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfMergeOptions = with_defaults(ToolId::PdfMerge, options);
    let ordered = order_files(files, &o.order);
    let paths: Vec<&Path> = ordered.iter().map(src).collect();
    let bytes = edit::merge(&paths, &|p| ctx.progress(p, None), &ctx.cancel)?;
    std::fs::write(ctx.new_output(OutputSpec::new(&ordered[0].path, "pdf").suffix("merged")), bytes)?;
    let pages: u32 = ordered.iter().map(|f| f.pages.unwrap_or(0)).sum();
    ctx.note(if pages > 0 { format!("{pages} pages") } else { format!("{} PDFs merged", ordered.len()) });
    Ok(())
}

pub fn split(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfSplitOptions = with_defaults(ToolId::PdfSplit, options);
    let doc = open(src(file))?;
    let total = doc.pages().len() as usize;
    let groups = split_groups(&o, total).map_err(AppError::user)?;
    for (i, g) in groups.iter().enumerate() {
        ctx.check_cancel()?;
        let bytes = edit::extract_pages(&doc, g)?;
        let spec = if groups.len() > 1 {
            OutputSpec::new(&file.path, "pdf").group("part", i + 1, groups.len())
        } else {
            OutputSpec::new(&file.path, "pdf").suffix(if o.mode == PdfSplitMode::Every { "part" } else { "extract" })
        };
        std::fs::write(ctx.new_output(spec), bytes)?;
        ctx.progress((i + 1) as f64 / groups.len() as f64, None);
    }
    ctx.note(format!("{} file{}", groups.len(), if groups.len() == 1 { "" } else { "s" }));
    Ok(())
}

pub fn organize(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfOrganizeOptions = with_defaults(ToolId::PdfOrganize, options);
    if o.pages.is_empty() {
        return Err(AppError::user("Nothing changed"));
    }
    let doc = open(src(file))?;
    let total = doc.pages().len() as usize;
    if o.pages.iter().any(|p| p.src.fract() != 0.0 || p.src < 0.0 || p.src as usize >= total) {
        return Err(AppError::user("A page in the list does not exist."));
    }
    let pages: Vec<(usize, i32)> = o.pages.iter().map(|p| (p.src as usize, js_round(p.rotate) as i32)).collect();
    let bytes = edit::organize(&doc, &pages)?;
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("organized")), bytes)?;
    ctx.note(format!("{} of {} pages kept", o.pages.len(), total));
    Ok(())
}

pub fn images(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfImagesOptions = with_defaults(ToolId::PdfImages, options);
    let indexes = page_indexes(&o.ranges, file.pages.unwrap_or(0))?;
    crate::convert::pdf::pdf_to_images(src(file), &file.path, o.format, o.dpi, o.quality / 100.0, ctx, Some(indexes))
}

pub fn ocr(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfOcrOptions = with_defaults(ToolId::PdfOcr, options);
    let wanted: Vec<String> = o.languages.iter().filter(|l| ctx.caps.ocr_languages.contains(l)).cloned().collect();
    let langs = if wanted.is_empty() { vec!["eng".to_string()] } else { wanted };
    let indexes = page_indexes(&o.ranges, file.pages.unwrap_or(0))?;
    let r = crate::ocr::ocr_pages(src(file), ctx, &langs, &indexes, o.output == OcrOutput::Pdf)?;
    if o.output == OcrOutput::Txt {
        std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "txt").suffix("ocr")), r.text)?;
        return Ok(());
    }
    let pdf = r.pdf.ok_or_else(|| AppError::tool("This OCR engine version cannot write PDFs", ""))?;
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("searchable")), pdf)?;
    Ok(())
}

pub fn word(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfWordOptions = with_defaults(ToolId::PdfWord, options);
    let opts = ConvertOptions { doc_mode: Some(o.mode), ocr: Some(o.ocr), ..Default::default() };
    crate::convert::pdf::convert_pdf(file, Fmt::Docx, &opts, ctx)
}

pub fn metadata(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: PdfMetadataOptions = with_defaults(ToolId::PdfMetadata, options);
    let doc = open(src(file))?;
    if o.remove_all {
        let bytes = edit::strip_metadata(&doc)?;
        std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("clean")), bytes)?;
        ctx.note("Bookmarks and form fields are not kept when removing all metadata.");
        return Ok(());
    }
    drop(doc);
    let bytes = edit::set_info(src(file), &o.title, &o.author, &o.subject, &o.keywords)?;
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, "pdf").suffix("meta")), bytes)?;
    ctx.note("Metadata updated");
    Ok(())
}
```

**File `src-tauri/crates/engine/src/tools/subtitle.rs`**

```rust
//! Port of src/main/tools/subtitle/shift.ts.

use alohamora_core::js::js_num;
use alohamora_core::options::{with_defaults, SubtitleShiftOptions};
use alohamora_core::subtitles::{parse_subtitles, shift_cues, to_srt, to_vtt};
use alohamora_core::text::decode_text;
use alohamora_core::types::{FileInfo, Fmt, ToolId};
use serde_json::Value;

use crate::jobs::{JobContext, OutputSpec};
use crate::{AppError, Result};

pub fn shift(file: &FileInfo, options: &Value, ctx: &JobContext) -> Result<()> {
    let o: SubtitleShiftOptions = with_defaults(ToolId::SubtitleShift, options);
    let cues = parse_subtitles(&decode_text(&std::fs::read(&file.path)?));
    if cues.is_empty() {
        return Err(AppError::user(format!("No subtitles were found in {}.", file.name)));
    }
    let shifted = shift_cues(&cues, o.offset_ms / 1000.0);
    let vtt = file.fmt == Some(Fmt::Vtt);
    let text = if vtt { to_vtt(&shifted) } else { format!("\u{FEFF}{}", to_srt(&shifted)) };
    std::fs::write(ctx.new_output(OutputSpec::new(&file.path, if vtt { "vtt" } else { "srt" }).suffix("shifted")), text)?;
    ctx.note(format!("{} subtitles shifted by {} ms", shifted.len(), js_num(o.offset_ms)));
    Ok(())
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors. If there are errors, fix them file by file in the order of the error list: compare each file
with its block above.

## Task 7.2 — engine: job execution and queue

**Goal.** Run a `JobRequest` from start to finish, and run several jobs in the background.

- `jobs/execute.rs` — `execute_request` decides what a request means (convert N files, run a per-file tool on each file,
  or run a multi-file tool once) and reports per-file progress. `run_job_now` runs a whole job synchronously: creates
  the `JobContext`, runs it, finalizes the outputs, and always cleans up. The queue and the self-test both use it.
- `jobs/queue.rs` — the job queue: first in, first out; at most `Settings.maxConcurrentJobs` jobs at the same time, each
  on its own thread; `cancel` stops a queued or running job; every state change is sent to the UI as a `JobUpdate`
  (through the `emit` callback the app passes to `init`).

Replace `jobs/mod.rs` with its final version (it adds `execute` and `queue`):

**File `src-tauri/crates/engine/src/jobs/mod.rs`**

```rust
//! Port of src/main/jobs/*: one job = one JobRequest run by converters or tool runners.

pub mod context;
pub mod execute;
pub mod queue;

pub use context::{JobContext, OutputSpec};
```

**File `src-tauri/crates/engine/src/jobs/execute.rs`**

```rust
//! Port of src/main/jobs/execute.ts.

use alohamora_core::registry::{label, tool_meta};
use alohamora_core::types::{Capabilities, JobRequest, Settings};

use super::context::{JobContext, ProgressFn};
use crate::cancel::CancelToken;
use crate::{convert, inspect, tools, AppError, Result};

pub fn job_label(req: &JobRequest) -> String {
    match req {
        JobRequest::Convert { target, .. } => format!("Convert to {}", label(*target)),
        JobRequest::Tool { tool_id, .. } => tool_meta(*tool_id).label.clone(),
    }
}

fn detail_for(name: &str, i: usize, n: usize) -> String {
    if n > 1 { format!("{name} · {} of {n}", i + 1) } else { name.to_string() }
}

pub fn execute_request(req: &JobRequest, ctx: &JobContext) -> Result<()> {
    let files = inspect::inspect_files(req.inputs(), true);
    if files.is_empty() {
        return Err(AppError::user("No files to process."));
    }
    match req {
        JobRequest::Convert { target, options, .. } => {
            let opts = options.clone().unwrap_or_default();
            let mut skipped = 0;
            for (i, f) in files.iter().enumerate() {
                ctx.check_cancel()?;
                ctx.set_subtask(i, files.len(), Some(detail_for(&f.name, i, files.len())));
                if f.fmt == Some(*target) {
                    skipped += 1;
                    continue;
                }
                if f.fmt.is_none() || f.category.is_none() {
                    return Err(AppError::user(format!("{} is not a supported file type.", f.name)));
                }
                convert::convert(f, *target, &opts, ctx)?;
            }
            if skipped > 0 {
                let what = if skipped > 1 { "files were" } else { "file was" };
                ctx.note(format!("{skipped} {what} already {}", label(*target)));
            }
            Ok(())
        }
        JobRequest::Tool { tool_id, options, .. } => {
            let meta = tool_meta(*tool_id);
            if files.len() < meta.min_inputs {
                return Err(AppError::user(format!("{} needs at least {} files.", meta.label, meta.min_inputs)));
            }
            if meta.per_file {
                for (i, f) in files.iter().enumerate() {
                    ctx.check_cancel()?;
                    ctx.set_subtask(i, files.len(), Some(detail_for(&f.name, i, files.len())));
                    tools::run(*tool_id, std::slice::from_ref(f), options, ctx)?;
                }
            } else {
                ctx.set_subtask(0, 1, Some(format!("{} files", files.len())));
                tools::run(*tool_id, &files, options, ctx)?;
            }
            Ok(())
        }
    }
}

pub struct RunJobOptions {
    pub id: Option<String>,
    pub cancel: CancelToken,
    pub settings: Settings,
    pub caps: Capabilities,
    pub on_progress: ProgressFn,
}

pub struct JobResult {
    pub outputs: Vec<String>,
    pub notes: Vec<String>,
}

/// Execute a request start-to-finish (used by the queue AND the self-test).
pub fn run_job_now(req: &JobRequest, o: RunJobOptions) -> Result<JobResult> {
    let id = o.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let ctx = JobContext::new(&id, o.cancel, o.settings, o.caps, o.on_progress)?;
    let result = execute_request(req, &ctx).and_then(|_| ctx.finalize(req.inputs()));
    let notes = ctx.notes();
    ctx.cleanup();
    result.map(|outputs| JobResult { outputs, notes })
}
```

**File `src-tauri/crates/engine/src/jobs/queue.rs`**

```rust
//! Port of src/main/jobs/queue.ts: FIFO queue, N jobs at a time (Settings.maxConcurrentJobs), one thread per running job.

use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use alohamora_core::error::to_user_message;
use alohamora_core::types::{JobRequest, JobStatus, JobUpdate};
use alohamora_core::util::now_ms;

use super::execute::{job_label, run_job_now, RunJobOptions};
use crate::cancel::CancelToken;
use crate::{capabilities, settings, AppError};

pub type EmitFn = Arc<dyn Fn(&JobUpdate) + Send + Sync>;

struct Rec {
    update: JobUpdate,
    cancel: CancelToken,
    last_emit: Option<Instant>,
}

pub struct JobQueue {
    jobs: Mutex<Vec<Rec>>,
    emit: EmitFn,
    on_finished: EmitFn,
}

static QUEUE: OnceLock<Arc<JobQueue>> = OnceLock::new();

/// Create the queue once at start-up. `emit` sends updates to the UI, `on_finished` shows notifications.
pub fn init(emit: EmitFn, on_finished: EmitFn) -> Arc<JobQueue> {
    QUEUE.get_or_init(|| Arc::new(JobQueue { jobs: Mutex::new(Vec::new()), emit, on_finished })).clone()
}

pub fn get() -> Arc<JobQueue> {
    QUEUE.get().expect("jobs::queue::init must be called at start-up").clone()
}

impl JobQueue {
    pub fn enqueue(self: &Arc<Self>, request: JobRequest) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let update = JobUpdate {
            id: id.clone(),
            label: job_label(&request),
            request,
            status: JobStatus::Queued,
            progress: 0.0,
            detail: None,
            outputs: vec![],
            note: None,
            output_bytes: None,
            error: None,
            error_details: None,
            created_at: now_ms(),
            finished_at: None,
        };
        (self.emit)(&update);
        self.jobs.lock().expect("queue").push(Rec { update, cancel: CancelToken::new(), last_emit: None });
        self.trim();
        self.pump();
        id
    }

    pub fn cancel(self: &Arc<Self>, id: &str) {
        let queued = {
            let jobs = self.jobs.lock().expect("queue");
            match jobs.iter().find(|r| r.update.id == id) {
                Some(r) if r.update.status == JobStatus::Queued => true,
                Some(r) if r.update.status == JobStatus::Running => {
                    r.cancel.cancel();
                    false
                }
                _ => false,
            }
        };
        if queued {
            self.finish(id, |u| u.status = JobStatus::Canceled);
        }
    }

    /// Newest first.
    pub fn list(&self) -> Vec<JobUpdate> {
        let mut v: Vec<JobUpdate> = self.jobs.lock().expect("queue").iter().map(|r| r.update.clone()).collect();
        v.sort_by_key(|u| std::cmp::Reverse(u.created_at));
        v
    }

    fn pump(self: &Arc<Self>) {
        let limit = (settings::get().max_concurrent_jobs as usize).max(1);
        loop {
            let next = {
                let mut jobs = self.jobs.lock().expect("queue");
                let running = jobs.iter().filter(|r| r.update.status == JobStatus::Running).count();
                if running >= limit {
                    return;
                }
                let Some(rec) = jobs.iter_mut().filter(|r| r.update.status == JobStatus::Queued).min_by_key(|r| r.update.created_at) else { return };
                rec.update.status = JobStatus::Running;
                rec.update.progress = 0.0;
                rec.last_emit = Some(Instant::now());
                (rec.update.clone(), rec.cancel.clone())
            };
            (self.emit)(&next.0);
            let me = self.clone();
            std::thread::spawn(move || me.run(next.0, next.1));
        }
    }

    fn run(self: Arc<Self>, update: JobUpdate, cancel: CancelToken) {
        let id = update.id.clone();
        let me = self.clone();
        let progress_id = id.clone();
        let result = run_job_now(
            &update.request,
            RunJobOptions {
                id: Some(id.clone()),
                cancel: cancel.clone(),
                settings: settings::get(),
                caps: capabilities::get(),
                on_progress: Box::new(move |p, detail| me.progress(&progress_id, p, detail)),
            },
        );
        match result {
            Ok(res) => {
                let bytes: u64 = res.outputs.iter().map(|o| std::fs::metadata(o).map(|m| m.len()).unwrap_or(0)).sum();
                let note = if res.notes.is_empty() { None } else { Some(res.notes.join(" · ")) };
                self.finish(&id, |u| {
                    u.status = JobStatus::Done;
                    u.progress = 1.0;
                    u.outputs = res.outputs.clone();
                    u.note = note.clone();
                    u.output_bytes = Some(bytes);
                });
            }
            Err(e) if matches!(e, AppError::Canceled) || cancel.is_cancelled() => self.finish(&id, |u| u.status = JobStatus::Canceled),
            Err(e) => {
                let m = to_user_message(&e);
                log::error!("Job failed: {} {e:?}", update.label);
                self.finish(&id, |u| {
                    u.status = JobStatus::Error;
                    u.error = Some(m.message.clone());
                    u.error_details = m.details.clone();
                });
            }
        }
        self.pump();
    }

    /// Progress updates are sent at most every 100 ms.
    fn progress(&self, id: &str, p: f64, detail: Option<String>) {
        let send = {
            let mut jobs = self.jobs.lock().expect("queue");
            let Some(r) = jobs.iter_mut().find(|r| r.update.id == id) else { return };
            r.update.progress = p;
            if detail.is_some() {
                r.update.detail = detail;
            }
            let due = r.last_emit.map(|t| t.elapsed().as_millis() > 100).unwrap_or(true);
            if due {
                r.last_emit = Some(Instant::now());
                Some(r.update.clone())
            } else {
                None
            }
        };
        if let Some(u) = send {
            (self.emit)(&u);
        }
    }

    fn finish(&self, id: &str, change: impl Fn(&mut JobUpdate)) {
        let u = {
            let mut jobs = self.jobs.lock().expect("queue");
            let Some(r) = jobs.iter_mut().find(|r| r.update.id == id) else { return };
            change(&mut r.update);
            r.update.finished_at = Some(now_ms());
            r.update.clone()
        };
        (self.emit)(&u);
        (self.on_finished)(&u);
    }

    /// Keep at most 50 finished jobs.
    fn trim(&self) {
        let mut jobs = self.jobs.lock().expect("queue");
        let mut finished: Vec<(u64, String)> = jobs
            .iter()
            .filter(|r| !matches!(r.update.status, JobStatus::Queued | JobStatus::Running))
            .map(|r| (r.update.created_at, r.update.id.clone()))
            .collect();
        finished.sort_by_key(|f| std::cmp::Reverse(f.0));
        let drop: std::collections::HashSet<String> = finished.into_iter().skip(50).map(|(_, id)| id).collect();
        jobs.retain(|r| !drop.contains(&r.update.id));
    }
}
```

**Verify**
```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
```

**Done when:** no errors.

## Task 7.3 — engine: the self-test

**Goal.** One command runs real files through every conversion and every tool and checks the results.

- `selftest/mod.rs` — the runner. Each `Case` names its fixtures, builds a `JobRequest`, and either checks the outputs or
  expects a specific user message. A case can be skipped when the machine lacks something (for example no hardware video
  encoder). Results go to the console and to `report.json`.
- `selftest/fixtures.rs` and `selftest/fixtures_docs.rs` — the test inputs, generated once with FFmpeg and our own
  encoders (videos with and without sound, a tone, silence, pictures with EXIF rotation and GPS, a 3-page PDF, a
  "scanned" PDF, SVG, HEIC, …) and the checks (`expect_image`, `expect_pdf_pages`, `pixel`, `zip_entries`, …).
- `selftest/assert.rs` — checks on media files (duration, codecs, streams).
- `selftest/cases/*.rs` — the 121 cases, grouped like the Electron build (Appendix B).
- `examples/selftest.rs` — runs the self-test without the Tauri app (used in Task 7.4; the app's own `--selftest`
  flag arrives in Task 8.8).

**File `src-tauri/crates/engine/src/selftest/mod.rs`**

```rust
//! Port of src/main/selftest/*: real files through every conversion and tool. `alohamora --selftest [--only=<group|prefix>]`.

pub mod assert;
pub mod cases;
pub mod fixtures;
pub mod fixtures_docs;

use std::path::{Path, PathBuf};
use std::time::Instant;

use alohamora_core::error::to_user_message;
use alohamora_core::registry::default_settings;
use alohamora_core::types::{Capabilities, JobRequest};
use regex::Regex;
use serde_json::json;

use crate::cancel::CancelToken;
use crate::jobs::execute::{run_job_now, RunJobOptions};
use crate::{capabilities, hw_video, AppError};

pub type CheckFn = Box<dyn Fn(&[String]) -> std::result::Result<(), String> + Send + Sync>;
pub type RequestFn = Box<dyn Fn(&[String]) -> JobRequest + Send + Sync>;

pub enum Expect {
    /// The job must succeed and this check must pass.
    Check(CheckFn),
    /// The job must FAIL with a user message matching this regex (case-insensitive unless the pattern says otherwise).
    Error(&'static str),
}

pub struct Case {
    /// Unique, e.g. "convert.audio.wav-mp3".
    pub name: String,
    /// "av", "image", "text", "pdf", "tools.video", … "errors".
    pub group: &'static str,
    /// Fixture names used as inputs, in order.
    pub fixtures: Vec<&'static str>,
    pub request: RequestFn,
    pub expect: Expect,
    /// Return a reason to skip.
    pub skip: Option<fn(&Capabilities) -> Option<String>>,
    /// Run this case with different capabilities (e.g. a broken hardware encoder).
    pub caps_override: Option<fn(&mut Capabilities)>,
}

fn describe(e: &AppError) -> String {
    let m = to_user_message(e);
    match m.details {
        Some(d) => {
            let tail: Vec<&str> = d.lines().filter(|l| !l.trim().is_empty()).collect();
            let tail = tail[tail.len().saturating_sub(3)..].join(" / ");
            format!("{} | {tail}", m.message)
        }
        None => m.message,
    }
}

/// Run the self-test. `root` holds fixtures/ (cached) and out/ (recreated). Returns the process exit code.
pub fn run(only: Option<&str>, root: &Path) -> i32 {
    let fx_dir = root.join("fixtures");
    let out_root = root.join("out");
    let _ = std::fs::remove_dir_all(&out_root);
    hw_video::detect_hardware_video(); // so hardware-encoder cases know what this machine can do
    let caps = capabilities::get();
    let all = cases::all();
    let selected: Vec<&Case> = all
        .iter()
        .filter(|c| match only {
            None => true,
            Some(o) => c.group == o || c.group.starts_with(&format!("{o}.")) || c.name.starts_with(o),
        })
        .collect();
    let mut results = Vec::new();
    let (mut pass, mut fail, mut skip) = (0, 0, 0);
    for c in selected {
        let t0 = Instant::now();
        if let Some(reason) = c.skip.and_then(|f| f(&caps)) {
            println!("SKIP  {}  ({reason})", c.name);
            results.push(json!({ "name": c.name, "status": "SKIP", "ms": 0, "info": reason }));
            skip += 1;
            continue;
        }
        let outcome = run_case(c, &caps, &fx_dir, &out_root);
        let ms = t0.elapsed().as_millis() as u64;
        match outcome {
            Ok(()) => {
                println!("PASS  {}  ({ms} ms)", c.name);
                results.push(json!({ "name": c.name, "status": "PASS", "ms": ms }));
                pass += 1;
            }
            Err(info) => {
                println!("FAIL  {}  — {info}", c.name);
                results.push(json!({ "name": c.name, "status": "FAIL", "ms": ms, "info": info }));
                fail += 1;
            }
        }
    }
    let summary = format!("{pass} passed, {fail} failed, {skip} skipped");
    let _ = std::fs::create_dir_all(root);
    let report = root.join("report.json");
    let _ = std::fs::write(&report, serde_json::to_string_pretty(&json!({ "summary": summary, "results": results })).unwrap_or_default());
    println!("\nSELFTEST: {summary}\nReport: {}", report.display());
    if fail > 0 || pass + skip == 0 { 1 } else { 0 }
}

fn run_case(c: &Case, caps: &Capabilities, fx_dir: &Path, out_root: &Path) -> std::result::Result<(), String> {
    let mut inputs = Vec::new();
    for f in &c.fixtures {
        inputs.push(fixtures::ensure(fx_dir, f).map_err(|e| format!("fixture {f}: {}", describe(&e)))?);
    }
    let safe: String = c.name.chars().map(|ch| if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' { ch } else { '_' }).collect();
    let out_dir: PathBuf = out_root.join(safe);
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let mut settings = default_settings();
    settings.output_mode = "custom-folder".into();
    settings.custom_output_dir = Some(out_dir.to_string_lossy().to_string());
    let mut case_caps = caps.clone();
    if let Some(over) = c.caps_override {
        over(&mut case_caps);
    }
    let req = (c.request)(&inputs);
    let result = run_job_now(&req, RunJobOptions { id: None, cancel: CancelToken::new(), settings, caps: case_caps, on_progress: Box::new(|_, _| {}) });
    match (&c.expect, result) {
        (Expect::Check(check), Ok(r)) => check(&r.outputs),
        (Expect::Check(_), Err(e)) => Err(describe(&e)),
        (Expect::Error(pattern), Err(e)) => {
            let msg = to_user_message(&e).message;
            let re = Regex::new(&format!("(?i){pattern}")).expect("valid case regex");
            if re.is_match(&msg) { Ok(()) } else { Err(format!("expected error /{pattern}/, got \"{msg}\"")) }
        }
        (Expect::Error(pattern), Ok(_)) => Err(format!("expected error /{pattern}/, got success")),
    }
}
```

**File `src-tauri/crates/engine/src/selftest/assert.rs`**

```rust
//! Port of src/main/selftest/assert.ts. Every helper returns Err(message) instead of throwing.

use std::path::Path;

use crate::ffmpeg::probe;

pub type Check = std::result::Result<(), String>;

pub fn check(cond: bool, msg: impl Into<String>) -> Check {
    if cond { Ok(()) } else { Err(msg.into()) }
}

pub fn expect_count(outputs: &[String], n: usize) -> Check {
    check(outputs.len() == n, format!("expected {n} output(s), got {}", outputs.len()))
}

pub fn expect_non_empty(file: &str) -> Check {
    let size = std::fs::metadata(file).map(|m| m.len()).unwrap_or(0);
    check(size > 0, format!("{file} is missing or empty"))
}

/// Expected codec for a stream: anything, no such stream, or this codec name.
#[derive(Clone, Copy)]
pub enum Codec {
    Any,
    None,
    Is(&'static str),
}

pub fn expect_streams(file: &str, video: Codec, audio: Codec, duration: Option<(f64, f64)>) -> Check {
    expect_non_empty(file)?;
    let p = probe(Path::new(file)).map_err(|e| e.to_string())?;
    let v = p.video.as_ref().map(|v| v.codec.as_str());
    let a = p.audio.as_ref().map(|a| a.codec.as_str());
    match video {
        Codec::Any => {}
        Codec::None => check(v.is_none(), format!("video codec: expected none, got {}", v.unwrap_or("none")))?,
        Codec::Is(c) => check(v == Some(c), format!("video codec: expected {c}, got {}", v.unwrap_or("none")))?,
    }
    match audio {
        Codec::Any => {}
        Codec::None => check(a.is_none(), format!("audio codec: expected none, got {}", a.unwrap_or("none")))?,
        Codec::Is(c) => check(a == Some(c), format!("audio codec: expected {c}, got {}", a.unwrap_or("none")))?,
    }
    if let Some((sec, tol)) = duration {
        check((p.duration_sec - sec).abs() <= tol, format!("duration: expected ~{sec}s, got {}s", p.duration_sec))?;
    }
    Ok(())
}

pub fn expect_magic(file: &str, offset: usize, ascii: &str) -> Check {
    let bytes = std::fs::read(file).map_err(|e| e.to_string())?;
    let got = bytes.get(offset..offset + ascii.len()).map(|b| String::from_utf8_lossy(b).to_string()).unwrap_or_default();
    check(got == ascii, format!("{file}: expected \"{ascii}\" at byte {offset}, got \"{got}\""))
}

pub fn expect_text_includes(file: &str, text: &str) -> Check {
    let t = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
    check(t.contains(text), format!("{file} does not contain \"{text}\""))
}

/// Text output with the BOM removed and CRLF normalised.
pub fn read_text(file: &str) -> String {
    std::fs::read_to_string(file).unwrap_or_default().trim_start_matches('\u{FEFF}').replace("\r\n", "\n")
}
```

**File `src-tauri/crates/engine/src/selftest/fixtures.rs`**

```rust
//! Port of src/main/selftest/fixtures.ts: test inputs, generated once and cached in <root>/fixtures.

use std::path::Path;

use crate::ffmpeg::{run_ffmpeg, FfmpegRun};
use crate::paths::p2s;
use crate::{AppError, Result};

fn ff(args: &[&str]) -> Result<()> {
    let a: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    run_ffmpeg(&a, FfmpegRun::default())
}

/// Create the fixture once and return its path.
pub fn ensure(dir: &Path, name: &str) -> Result<String> {
    let out = dir.join(name);
    if out.exists() {
        return Ok(p2s(&out));
    }
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("tmp-{name}")); // keeps the extension for FFmpeg
    make(dir, name, &p2s(&tmp))?;
    std::fs::rename(&tmp, &out)?;
    Ok(p2s(&out))
}

fn make(dir: &Path, name: &str, out: &str) -> Result<()> {
    match name {
        "video.mp4" => ff(&["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
            "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", out]),
        "titled.mp4" => ff(&["-i", &ensure(dir, "video.mp4")?, "-c", "copy", "-metadata", "title=Hello", out]),
        "video-copy.mp4" => ff(&["-i", &ensure(dir, "video.mp4")?, "-c", "copy", out]),
        "video-vp9.webm" => ff(&["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000",
            "-t", "3", "-c:v", "libvpx-vp9", "-b:v", "300k", "-c:a", "libopus", out]),
        "fake.mp4" => Ok(std::fs::write(out, "This is only text, not a video.\n".repeat(40))?),
        "fake.mp3" => Ok(std::fs::write(out, "This is only text, not audio.\n".repeat(40))?),
        "broken.png" => Ok(std::fs::write(out, "not a png at all")?),
        "broken.pdf" => Ok(std::fs::write(out, "%PDF-1.4\nthis file is cut off")?),
        "video-noaudio.mp4" => ff(&["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]),
        "video.mkv" => ff(&["-i", &ensure(dir, "video.mp4")?, "-c", "copy", out]),
        "anim.gif" => ff(&["-i", &ensure(dir, "video.mp4")?, "-t", "2", "-vf", "fps=10,scale=160:-1", out]),
        "audio.wav" => ff(&["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=4", "-ac", "2", "-c:a", "pcm_s16le", out]),
        "audio-mono.wav" => ff(&["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=3", "-ac", "1", "-c:a", "pcm_s16le", out]),
        "audio-silent.wav" => ff(&["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "2", "-c:a", "pcm_s16le", out]),
        "audio.mp3" => ff(&["-i", &ensure(dir, "audio.wav")?, "-c:a", "libmp3lame", "-q:a", "4", out]),
        "stereo-lr.wav" => ff(&["-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-f", "lavfi", "-i", "sine=frequency=880:duration=4",
            "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]", "-map", "[a]", "-c:a", "pcm_s16le", out]),
        "text.txt" => Ok(std::fs::write(out, [
            "Alohamora test document",
            "Xin chào thế giới — Tiếng Việt có dấu.",
            "The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.",
            "",
            "Last line.",
        ].join("\n"))?),
        "subs.srt" => Ok(std::fs::write(out, "\u{FEFF}1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> world\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond line\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nThird\r\n")?),
        "subs.vtt" => Ok(std::fs::write(out, "WEBVTT\n\nNOTE test file\n\n00:01.000 --> 00:02.500 align:start\nHello <v Bob>world</v>\n\nid2\n00:00:03.000 --> 00:00:04.000\nSecond line\n")?),
        other => crate::selftest::fixtures_docs::make(dir, other, out).unwrap_or_else(|| Err(AppError::other(format!("No fixture maker for {other}")))),
    }
}
```

**File `src-tauri/crates/engine/src/selftest/fixtures_docs.rs`**

```rust
//! Image and PDF fixtures (the part of fixtures.ts that used sharp, pdf-lib and piexifjs), plus the
//! file checks the image/PDF cases need (formats, sizes, pixels, zip entries, PDF pages/rotation/title, EXIF).

use std::io::Cursor;
use std::path::Path;

use alohamora_core::options::{PageSize, TextFont};
use exif::{Field, In, Rational, Tag, Value};
use image::{DynamicImage, ImageFormat};
use img_parts::{Bytes, ImageEXIF};
use lopdf::{dictionary, Document, Object, Stream};

use super::assert::{check, expect_non_empty, Check};
use super::fixtures::ensure;
use crate::image::encode;
use crate::pdf::create::{EmbedKind, EmbeddableImage, PdfBuilder};
use crate::{AppError, Result};

pub const TEST_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" x2="1">
<stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#2b6cff"/></linearGradient></defs>
<rect x="40" y="40" width="720" height="520" rx="60" fill="url(#g)"/><circle cx="400" cy="300" r="120" fill="#ffffff"/></svg>"##;

fn svg_image() -> Result<DynamicImage> {
    Ok(DynamicImage::ImageRgba8(crate::image::svg::render_str(TEST_SVG)?)) // 800×600, transparent corners
}

fn png_fixture(dir: &Path) -> Result<DynamicImage> {
    image::open(ensure(dir, "image.png")?).map_err(AppError::other)
}

/// EXIF block (raw TIFF) from fields.
fn exif_bytes(fields: &[Field]) -> Result<Vec<u8>> {
    let mut w = exif::experimental::Writer::new();
    for f in fields {
        w.push_field(f);
    }
    let mut out = Cursor::new(Vec::new());
    w.write(&mut out, false).map_err(AppError::other)?;
    Ok(out.into_inner())
}

fn jpeg_with_exif(jpeg: Vec<u8>, exif: Vec<u8>) -> Result<Vec<u8>> {
    let mut j = img_parts::jpeg::Jpeg::from_bytes(Bytes::from(jpeg)).map_err(AppError::other)?;
    j.set_exif(Some(Bytes::from(exif)));
    let mut out = Vec::new();
    j.encoder().write_to(&mut out)?;
    Ok(out)
}

fn rationals(v: &[(u32, u32)]) -> Value {
    Value::Rational(v.iter().map(|&(num, denom)| Rational { num, denom }).collect())
}

/// Text for a PDF literal string in WinAnsiEncoding ("•" = 0x95).
fn win_ansi(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    for ch in s.chars() {
        match ch {
            '(' | ')' | '\\' => {
                out.push(b'\\');
                out.push(ch as u8);
            }
            '•' => out.push(0x95),
            c if c.is_ascii() => out.push(c as u8),
            _ => out.push(b'?'),
        }
    }
    out
}

fn text_op(font: &str, size: f64, x: f64, y: f64, text: &str) -> Vec<u8> {
    let mut v = format!("BT /{font} {size} Tf {x} {y} Td (").into_bytes();
    v.extend(win_ansi(text));
    v.extend(b") Tj ET\n");
    v
}

/// 3 Letter pages: title/chapter headings, a wrapped paragraph, a picture on page 2, bullets on page 3, page numbers.
fn make_doc_pdf(dir: &Path, out: &str) -> Result<()> {
    let jpeg = encode::jpeg_bytes(&png_fixture(dir)?, 80.0)?;
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let font = |base: &str| dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => base.to_string(), "Encoding" => "WinAnsiEncoding" };
    let bold_id = doc.add_object(font("Helvetica-Bold"));
    let reg_id = doc.add_object(font("Helvetica"));
    let img_id = doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => 800, "Height" => 600, "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "Filter" => "DCTDecode" },
        jpeg,
    ).with_compression(false));
    let para = "Alohamora converts files offline. This paragraph is long enough to wrap across several lines so that the reflow logic has something to join back together into one paragraph.";
    let mut kids = Vec::new();
    for p in 1..=3 {
        let mut c = text_op("F1", 24.0, 72.0, 700.0, &if p == 1 { "Alohamora Test Document".to_string() } else { format!("Chapter {p}") });
        // Wrap at ~76 characters (≈460 pt of 12 pt Helvetica).
        let mut line = String::new();
        let mut y = 660.0;
        for w in para.split(' ') {
            if !line.is_empty() && line.len() + 1 + w.len() > 76 {
                c.extend(text_op("F2", 12.0, 72.0, y, &line));
                y -= 16.0;
                line.clear();
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(w);
        }
        c.extend(text_op("F2", 12.0, 72.0, y, &line));
        if p == 2 {
            c.extend(b"q 240 0 0 180 72 300 cm /Im0 Do Q\n");
        }
        if p == 3 {
            c.extend(text_op("F2", 12.0, 72.0, 520.0, "• First item"));
            c.extend(text_op("F2", 12.0, 72.0, 502.0, "• Second item"));
        }
        c.extend(text_op("F2", 10.0, 300.0, 30.0, &p.to_string()));
        let content_id = doc.add_object(Stream::new(dictionary! {}, c));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id, "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Contents" => content_id,
            "Resources" => dictionary! { "Font" => dictionary! { "F1" => bold_id, "F2" => reg_id }, "XObject" => dictionary! { "Im0" => img_id } },
        });
        kids.push(page_id.into());
    }
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => 3 }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    let info = doc.add_object(dictionary! { "Title" => Object::string_literal("Alohamora Test") });
    doc.trailer.set("Root", catalog);
    doc.trailer.set("Info", info);
    doc.compress();
    doc.save(out).map_err(AppError::other)?;
    Ok(())
}

/// A4 page that is only a picture of the words "ALOHAMORA OCR TEST" (no text layer).
fn make_scan_pdf(dir: &Path, out: &str) -> Result<()> {
    let text_pdf = dir.join("tmp-scan-src.pdf");
    std::fs::write(&text_pdf, crate::text_pdf::text_to_pdf_with("ALOHAMORA OCR TEST\n\nHello offline world.", "scan", TextFont::Sans, 28.0, PageSize::A4)?)?;
    let doc = crate::pdf::open(&text_pdf)?;
    let page = crate::pdf::render_page(&doc, 0, 200.0)?;
    let img = EmbeddableImage { kind: EmbedKind::Png, data: encode::png_bytes(&page)?, width: page.width(), height: page.height() };
    let mut b = PdfBuilder::new();
    b.add_image_page(&img, 595.28, 841.89, 0.0, 0.0, 595.28, 841.89)?;
    std::fs::write(out, b.finish()?)?;
    Ok(())
}

/// Called by fixtures::make for names it does not know. None = unknown fixture.
pub fn make(dir: &Path, name: &str, out: &str) -> Option<Result<()>> {
    let r = (|| -> Result<()> {
        match name {
            "image.svg" => std::fs::write(out, TEST_SVG)?,
            "image.png" => std::fs::write(out, encode::png_bytes(&svg_image()?)?)?,
            "photo.jpg" => {
                // 800×600 pixels + EXIF orientation 6 (display 600×800)
                let jpeg = encode::jpeg_bytes(&svg_image()?, 90.0)?;
                let orient = exif_bytes(&[Field { tag: Tag::Orientation, ifd_num: In::PRIMARY, value: Value::Short(vec![6]) }])?;
                std::fs::write(out, jpeg_with_exif(jpeg, orient)?)?
            }
            "image.webp" => std::fs::write(out, encode::webp_bytes(&png_fixture(dir)?, 80.0)?)?,
            "image.tiff" => std::fs::write(out, encode::tiff_bytes(&png_fixture(dir)?)?)?,
            "image.avif" => std::fs::write(out, encode::avif_bytes(&png_fixture(dir)?, 80.0)?)?,
            "image.bmp" => std::fs::write(out, encode::bmp_bytes(&png_fixture(dir)?)?)?,
            "image.heic" => encode::encode_heic_file(Path::new(&ensure(dir, "image.png")?), Path::new(out), 80.0, None)?,
            "doc.pdf" => make_doc_pdf(dir, out)?,
            "doc-copy.pdf" => {
                std::fs::copy(ensure(dir, "doc.pdf")?, out)?;
            }
            "scan.pdf" => make_scan_pdf(dir, out)?,
            "gps.jpg" => {
                let jpeg = encode::jpeg_bytes(&png_fixture(dir)?, 80.0)?;
                let ascii = |tag, s: &str| Field { tag, ifd_num: In::PRIMARY, value: Value::Ascii(vec![s.as_bytes().to_vec()]) };
                let exif = exif_bytes(&[
                    ascii(Tag::Artist, "Tester"),
                    ascii(Tag::GPSLatitudeRef, "N"),
                    Field { tag: Tag::GPSLatitude, ifd_num: In::PRIMARY, value: rationals(&[(21, 1), (1, 1), (3000, 100)]) },
                    ascii(Tag::GPSLongitudeRef, "E"),
                    Field { tag: Tag::GPSLongitude, ifd_num: In::PRIMARY, value: rationals(&[(105, 1), (51, 1), (0, 1)]) },
                ])?;
                std::fs::write(out, jpeg_with_exif(jpeg, exif)?)?
            }
            _ => return Err(AppError::other("unknown")),
        }
        Ok(())
    })();
    match r {
        Err(AppError::Other(m)) if m == "unknown" => None,
        other => Some(other),
    }
}

// ---------- checks ----------

fn s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn pdf_pages(file: &str) -> std::result::Result<usize, String> {
    expect_non_empty(file)?;
    Ok(crate::pdf::open(Path::new(file)).map_err(s)?.pages().len() as usize)
}

pub fn expect_pdf_pages(file: &str, pages: usize) -> Check {
    let n = pdf_pages(file)?;
    check(n == pages, format!("PDF pages: expected {pages}, got {n}"))
}

/// Rotation of page `index` in degrees.
pub fn pdf_rotation(file: &str, index: usize) -> std::result::Result<i32, String> {
    use pdfium_render::prelude::*;
    let doc = crate::pdf::open(Path::new(file)).map_err(s)?;
    let page = doc.pages().get(index as PdfPageIndex).map_err(|e| format!("{e:?}"))?;
    Ok(match page.rotation().map_err(|e| format!("{e:?}"))? {
        PdfPageRenderRotation::None => 0,
        PdfPageRenderRotation::Degrees90 => 90,
        PdfPageRenderRotation::Degrees180 => 180,
        PdfPageRenderRotation::Degrees270 => 270,
    })
}

/// (Title, Author) from the PDF's document information.
pub fn pdf_title_author(file: &str) -> std::result::Result<(Option<String>, Option<String>), String> {
    use pdfium_render::prelude::*;
    let doc = crate::pdf::open(Path::new(file)).map_err(s)?;
    let get = |t| doc.metadata().get(t).map(|v| v.value().to_string()).filter(|v| !v.is_empty());
    Ok((get(PdfDocumentMetadataTagType::Title), get(PdfDocumentMetadataTagType::Author)))
}

/// Page size in points of page `index`.
pub fn pdf_page_size(file: &str, index: usize) -> std::result::Result<(f64, f64), String> {
    let doc = crate::pdf::open(Path::new(file)).map_err(s)?;
    crate::pdf::page_sizes(&doc).get(index).copied().ok_or_else(|| "no such page".to_string())
}

/// Format names as sharp reported them: "jpeg", "png", "webp", "tiff", "bmp", "avif".
pub fn image_format(file: &str) -> std::result::Result<String, String> {
    let bytes = std::fs::read(file).map_err(s)?;
    if bytes.len() > 12 && &bytes[4..12] == b"ftypavif" {
        return Ok("avif".into());
    }
    Ok(match image::guess_format(&bytes).map_err(s)? {
        ImageFormat::Jpeg => "jpeg",
        ImageFormat::Png => "png",
        ImageFormat::WebP => "webp",
        ImageFormat::Tiff => "tiff",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Gif => "gif",
        other => return Ok(format!("{other:?}").to_lowercase()),
    }
    .into())
}

pub fn image_dims(file: &str) -> std::result::Result<(u32, u32), String> {
    image::image_dimensions(file).map_err(s)
}

/// Format must match; size too when given.
pub fn expect_image(file: &str, format: &str, dims: Option<(u32, u32)>) -> Check {
    expect_non_empty(file)?;
    let f = image_format(file)?;
    check(f == format, format!("image format: expected {format}, got {f}"))?;
    if let Some((w, h)) = dims {
        let (aw, ah) = image_dims(file)?;
        check(aw == w && ah == h, format!("size: expected {w}x{h}, got {aw}x{ah}"))?;
    }
    Ok(())
}

/// RGBA of one pixel.
pub fn pixel(file: &str, x: u32, y: u32) -> std::result::Result<[u8; 4], String> {
    let img = image::open(file).map_err(s)?.to_rgba8();
    Ok(img.get_pixel(x, y).0)
}

/// Names of all entries in a zip (DOCX/EPUB).
pub fn zip_entries(file: &str) -> std::result::Result<Vec<String>, String> {
    let f = std::fs::File::open(file).map_err(s)?;
    let z = zip::ZipArchive::new(f).map_err(s)?;
    Ok(z.file_names().map(String::from).collect())
}

pub fn expect_zip_entries(file: &str, names: &[&str]) -> std::result::Result<Vec<String>, String> {
    expect_non_empty(file)?;
    let entries = zip_entries(file)?;
    for n in names {
        check(entries.iter().any(|e| e == n), format!("zip {file} has no entry {n}"))?;
    }
    Ok(entries)
}

pub fn zip_text(file: &str, name: &str) -> std::result::Result<String, String> {
    use std::io::Read;
    let f = std::fs::File::open(file).map_err(s)?;
    let mut z = zip::ZipArchive::new(f).map_err(s)?;
    let mut e = z.by_name(name).map_err(s)?;
    let mut text = String::new();
    e.read_to_string(&mut text).map_err(s)?;
    Ok(text)
}

/// (Artist, has GPS, Orientation) from a file's EXIF; missing EXIF = (None, false, None).
pub fn exif_summary(file: &str) -> (Option<String>, bool, Option<u32>) {
    let Ok(f) = std::fs::File::open(file) else { return (None, false, None) };
    let Ok(e) = exif::Reader::new().read_from_container(&mut std::io::BufReader::new(f)) else { return (None, false, None) };
    let artist = e.get_field(Tag::Artist, In::PRIMARY).and_then(|f| match &f.value {
        Value::Ascii(v) => v.first().map(|b| String::from_utf8_lossy(b).trim_end_matches('\0').to_string()),
        _ => None,
    });
    let gps = e.fields().any(|f| f.tag.context() == exif::Context::Gps && f.tag != Tag::GPSVersionID);
    let orientation = e.get_field(Tag::Orientation, In::PRIMARY).and_then(|f| f.value.get_uint(0));
    (artist, gps, orientation)
}
```

**File `src-tauri/crates/engine/src/selftest/cases/mod.rs`**

```rust
//! All self-test cases (same names and groups as the Electron build).

mod av;
mod errors;
mod image;
mod pdf;
mod text;
mod tools_audio;
mod tools_image;
mod tools_pdf;
mod tools_video;

use alohamora_core::types::{Fmt, JobRequest, ToolId};
use serde_json::Value;

use super::assert::Check;
use super::{Case, Expect};

pub fn all() -> Vec<Case> {
    let mut v = Vec::new();
    v.extend(av::cases());
    v.extend(image::cases());
    v.extend(text::cases());
    v.extend(pdf::cases());
    v.extend(tools_video::cases());
    v.extend(tools_audio::cases());
    v.extend(tools_image::cases());
    v.extend(tools_pdf::cases());
    v.extend(tools_pdf::subtitle_cases());
    v.extend(errors::cases());
    v
}

fn convert_request(target: Fmt, options: Option<Value>) -> super::RequestFn {
    Box::new(move |inputs: &[String]| JobRequest::Convert {
        inputs: inputs.to_vec(),
        target,
        options: options.clone().map(|o| serde_json::from_value(o).expect("valid convert options in a case")),
    })
}

fn tool_request(tool: ToolId, options: Value) -> super::RequestFn {
    Box::new(move |inputs: &[String]| JobRequest::Tool { inputs: inputs.to_vec(), tool_id: tool, options: options.clone() })
}

/// A conversion that must succeed and pass `check`.
pub fn convert_case(
    name: &str, group: &'static str, fixtures: &[&'static str], target: Fmt, options: Option<Value>,
    check: impl Fn(&[String]) -> Check + Send + Sync + 'static,
) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: convert_request(target, options), expect: Expect::Check(Box::new(check)), skip: None, caps_override: None }
}

/// A tool run that must succeed and pass `check`.
pub fn tool_case(
    name: &str, group: &'static str, fixtures: &[&'static str], tool: ToolId, options: Value,
    check: impl Fn(&[String]) -> Check + Send + Sync + 'static,
) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: tool_request(tool, options), expect: Expect::Check(Box::new(check)), skip: None, caps_override: None }
}

/// A conversion that must fail with a message matching `pattern`.
pub fn convert_error(name: &str, group: &'static str, fixtures: &[&'static str], target: Fmt, options: Option<Value>, pattern: &'static str) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: convert_request(target, options), expect: Expect::Error(pattern), skip: None, caps_override: None }
}

/// A tool run that must fail with a message matching `pattern`.
pub fn tool_error(name: &str, group: &'static str, fixtures: &[&'static str], tool: ToolId, options: Value, pattern: &'static str) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: tool_request(tool, options), expect: Expect::Error(pattern), skip: None, caps_override: None }
}
```

**File `src-tauri/crates/engine/src/selftest/cases/av.rs`**

```rust
//! Port of src/main/selftest/cases/av.ts.

use alohamora_core::registry::convert_targets;
use alohamora_core::types::{Category, Fmt};

use super::{convert_case, convert_error, Case};
use crate::paths;
use crate::process::run_process;
use crate::selftest::assert::{check, expect_count, expect_streams, Codec};

/// The encoder that wrote the first video stream (e.g. "Lavc60 libx264" or "Lavc60 h264_nvenc").
fn video_encoder_tag(file: &str) -> String {
    let args: Vec<String> = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream_tags=encoder", "-of", "default=nw=1:nk=1", file]
        .iter().map(|s| s.to_string()).collect();
    run_process(&paths::ffprobe(), &args, None, "FFprobe").map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default()
}

fn audio_codec(t: Fmt) -> &'static str {
    match t {
        Fmt::Mp3 => "mp3", Fmt::M4a => "aac", Fmt::Wav => "pcm_s16le", Fmt::Flac => "flac", Fmt::Ogg => "vorbis",
        Fmt::Opus => "opus", Fmt::Aiff => "pcm_s16be", _ => "wmav2",
    }
}

fn video_codec(t: Fmt) -> &'static str {
    match t {
        Fmt::Mp4 | Fmt::Mov | Fmt::Mkv => "h264", Fmt::Webm => "vp9", Fmt::Avi => "mpeg4", Fmt::Wmv => "wmv2", _ => "gif",
    }
}

pub fn cases() -> Vec<Case> {
    let mut v = Vec::new();
    for &t in convert_targets(Category::Audio).iter().filter(|t| **t != Fmt::Wav) {
        v.push(convert_case(&format!("convert.audio.wav-{}", t.as_str()), "av", &["audio.wav"], t, None, move |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is(audio_codec(t)), Some((4.0, 0.5)))
        }));
    }
    v.push(convert_case("convert.audio.mp3-wav", "av", &["audio.mp3"], Fmt::Wav, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((4.0, 0.5)))
    }));
    for &t in convert_targets(Category::Video).iter().filter(|t| **t != Fmt::Mp4) {
        v.push(convert_case(&format!("convert.video.mp4-{}", t.as_str()), "av", &["video.mp4"], t, None, move |o| {
            expect_count(o, 1)?;
            if t == Fmt::Mp3 {
                expect_streams(&o[0], Codec::None, Codec::Is("mp3"), Some((4.0, 0.5)))
            } else {
                expect_streams(&o[0], Codec::Is(video_codec(t)), Codec::Any, Some((4.0, 0.6)))
            }
        }));
    }
    v.push(convert_case("convert.video.mkv-mp4-remux", "av", &["video.mkv"], Fmt::Mp4, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::Is("aac"), Some((4.0, 0.5)))
    }));
    v.push(convert_case("convert.video.gif-mp4", "av", &["anim.gif"], Fmt::Mp4, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::None, None)
    }));
    // VP9 cannot be remuxed into MOV, so this really encodes — and with a verified hardware encoder it must use it.
    let mut hw = convert_case("convert.video.vp9-mov-hw", "av", &["video-vp9.webm"], Fmt::Mov, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::Any, Some((3.0, 0.6)))?;
        let tag = video_encoder_tag(&o[0]);
        check(!tag.contains("libx264"), format!("expected a hardware encoder, got \"{tag}\""))
    });
    hw.skip = Some(|c| if c.hw_video.is_some() { None } else { Some("no verified hardware video encoder on this machine".into()) });
    v.push(hw);
    // A broken hardware encoder must silently fall back to the CPU (libx264), so the job still succeeds.
    let mut fallback = convert_case("convert.video.vp9-mov-hw-fallback", "av", &["video-vp9.webm"], Fmt::Mov, None, |o| {
        expect_count(o, 1)?;
        expect_streams(&o[0], Codec::Is("h264"), Codec::Any, Some((3.0, 0.6)))?;
        let tag = video_encoder_tag(&o[0]);
        check(tag.contains("libx264"), format!("expected the CPU fallback (libx264), got \"{tag}\""))
    });
    fallback.caps_override = Some(|c| c.hw_video = Some("h264_this_encoder_does_not_exist".into()));
    v.push(fallback);
    v.push(convert_error("convert.video.noaudio-mp3-fails", "av", &["video-noaudio.mp4"], Fmt::Mp3, None, "no audio"));
    v
}
```

**File `src-tauri/crates/engine/src/selftest/cases/image.rs`**

```rust
//! Port of src/main/selftest/cases/image.ts.

use alohamora_core::types::{Capabilities, Fmt};
use serde_json::{json, Value};

use super::{convert_case, Case};
use crate::selftest::assert::{check, expect_count, expect_magic, read_text, Check};
use crate::selftest::fixtures_docs::{exif_summary, expect_image, expect_pdf_pages, expect_zip_entries, image_dims};

const FULL: Option<(u32, u32)> = Some((800, 600));

fn no_heic(c: &Capabilities) -> Option<String> {
    if c.heif_enc { None } else { Some("no HEIC encoder on this OS".into()) }
}

fn case(name: &str, fixture: &'static str, target: Fmt, options: Option<Value>, verify: impl Fn(&str) -> Check + Send + Sync + 'static) -> Case {
    convert_case(name, "image", &[fixture], target, options, move |o| {
        expect_count(o, 1)?;
        verify(&o[0])
    })
}

pub fn cases() -> Vec<Case> {
    let mut v = vec![
        case("convert.image.png-jpg", "image.png", Fmt::Jpg, None, |f| expect_image(f, "jpeg", FULL)),
        case("convert.image.png-webp", "image.png", Fmt::Webp, None, |f| expect_image(f, "webp", FULL)),
        case("convert.image.png-avif", "image.png", Fmt::Avif, None, |f| expect_magic(f, 4, "ftypavif")),
        case("convert.image.png-tiff", "image.png", Fmt::Tiff, None, |f| expect_image(f, "tiff", None)),
        case("convert.image.png-bmp", "image.png", Fmt::Bmp, None, |f| expect_magic(f, 0, "BM")),
        case("convert.image.photo-orient", "photo.jpg", Fmt::Png, None, |f| {
            expect_image(f, "png", Some((600, 800)))?;
            let (_, _, o) = exif_summary(f);
            check(o.is_none() || o == Some(1), format!("orientation tag should be gone, got {o:?}"))
        }),
        case("convert.image.svg-png", "image.svg", Fmt::Png, None, |f| {
            expect_image(f, "png", None)?;
            let (w, _) = image_dims(f)?;
            check(w > 800, format!("SVG should render sharply (width > 800), got {w}"))
        }),
        case("convert.image.bmp-png", "image.bmp", Fmt::Png, None, |f| expect_image(f, "png", FULL)),
        case("convert.image.tiff-webp", "image.tiff", Fmt::Webp, None, |f| expect_image(f, "webp", None)),
        case("convert.image.avif-jpg", "image.avif", Fmt::Jpg, None, |f| expect_image(f, "jpeg", None)),
        case("convert.image.png-svg-trace", "image.png", Fmt::Svg, None, |f| {
            let t = read_text(f);
            check(t.trim_start().starts_with("<svg") && t.contains("<path"), "traced SVG should start with <svg and contain <path")
        }),
        case("convert.image.png-svg-embed", "image.png", Fmt::Svg, Some(json!({ "svgMode": "embed" })), |f| {
            check(read_text(f).contains("data:image/png;base64"), "embedded SVG should contain the PNG data URL")
        }),
    ];
    let mut heic_out = case("convert.image.png-heic", "image.png", Fmt::Heic, None, |f| expect_magic(f, 4, "ftyp"));
    heic_out.skip = Some(no_heic);
    let mut heic_in = case("convert.image.heic-jpg", "image.heic", Fmt::Jpg, None, |f| expect_image(f, "jpeg", FULL));
    heic_in.skip = Some(no_heic);
    v.push(heic_out);
    v.push(heic_in);
    v.push(case("convert.image.png-pdf", "image.png", Fmt::Pdf, None, |f| expect_pdf_pages(f, 1)));
    v.push(case("convert.image.photo-docx", "photo.jpg", Fmt::Docx, None, |f| {
        let entries = expect_zip_entries(f, &["word/document.xml"])?;
        check(entries.iter().any(|n| n.starts_with("word/media/")), "DOCX should contain an image under word/media/")
    }));
    v
}
```

**File `src-tauri/crates/engine/src/selftest/cases/text.rs`**

```rust
//! Port of src/main/selftest/cases/text.ts.

use alohamora_core::subtitles::parse_subtitles;
use alohamora_core::types::Fmt;

use super::{convert_case, Case};
use crate::selftest::assert::{check, expect_count, expect_text_includes, read_text, Check};

fn text_case(name: &str, fixture: &'static str, target: Fmt, verify: impl Fn(&str) -> Check + Send + Sync + 'static) -> Case {
    convert_case(name, "text", &[fixture], target, None, move |o| {
        expect_count(o, 1)?;
        verify(&o[0])
    })
}

pub fn cases() -> Vec<Case> {
    vec![
        text_case("convert.sub.srt-vtt", "subs.srt", Fmt::Vtt, |f| {
            let t = read_text(f);
            check(t.starts_with("WEBVTT"), "VTT must start with WEBVTT")?;
            check(t.contains("00:00:01.000 --> 00:00:02.500"), "VTT should use dot timestamps")
        }),
        text_case("convert.sub.srt-txt", "subs.srt", Fmt::Txt, |f| {
            let t = read_text(f);
            check(t.contains("Hello world"), "TXT should contain the cue text")?;
            check(!t.contains("<i>"), "TXT should not contain tags")
        }),
        text_case("convert.sub.vtt-srt", "subs.vtt", Fmt::Srt, |f| {
            check(read_text(f).contains("1\n00:00:01,000 --> 00:00:02,500"), "SRT should number cues and use comma timestamps")
        }),
        text_case("convert.text.txt-srt", "text.txt", Fmt::Srt, |f| {
            let n = parse_subtitles(&read_text(f)).len();
            check(n >= 4, format!("expected at least 4 cues, got {n}"))
        }),
        text_case("convert.text.txt-vtt", "text.txt", Fmt::Vtt, |f| expect_text_includes(f, "WEBVTT")),
        text_case("convert.text.txt-pdf", "text.txt", Fmt::Pdf, |f| {
            let n = crate::selftest::fixtures_docs::pdf_pages(f)?;
            check(n >= 1, "PDF should have at least one page")
        }),
        text_case("convert.text.txt-png", "text.txt", Fmt::Png, |f| crate::selftest::fixtures_docs::expect_image(f, "png", None)),
        text_case("convert.text.txt-jpg", "text.txt", Fmt::Jpg, |f| crate::selftest::fixtures_docs::expect_image(f, "jpeg", None)),
    ]
}
```

**File `src-tauri/crates/engine/src/selftest/cases/pdf.rs`**

```rust
//! Port of src/main/selftest/cases/pdf.ts (the two EPUB → PDF cases are gone with that feature).

use std::path::Path;

use alohamora_core::types::{Capabilities, Fmt};
use serde_json::{json, Value};

use super::{convert_case, Case};
use crate::selftest::assert::{check, expect_count, expect_magic, expect_text_includes, read_text, Check};
use crate::selftest::fixtures_docs::{expect_image, expect_zip_entries, image_dims, zip_text};

fn no_ocr(c: &Capabilities) -> Option<String> {
    if c.ocr_languages.iter().any(|l| l == "eng") { None } else { Some("no English OCR data".into()) }
}

fn case(name: &str, fixture: &'static str, target: Fmt, options: Option<Value>, verify: impl Fn(&[String]) -> Check + Send + Sync + 'static) -> Case {
    convert_case(name, "pdf", &[fixture], target, options, verify)
}

pub fn cases() -> Vec<Case> {
    let mut v = vec![
        case("convert.pdf.doc-png", "doc.pdf", Fmt::Png, None, |o| {
            expect_count(o, 3)?;
            let (w, _) = image_dims(&o[0])?;
            check((w as i64 - 2550).abs() <= 2, format!("612 pt at 300 DPI should be 2550 px wide, got {w}"))?;
            let dir = Path::new(&o[0]).parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            check(dir.ends_with("-pages"), "page images should be written into a \"-pages\" folder")?;
            let first_dir = Path::new(&o[0]).parent();
            check(o.iter().all(|f| Path::new(f).parent() == first_dir), "all pages should be in one folder")
        }),
        case("convert.pdf.doc-jpg", "doc.pdf", Fmt::Jpg, None, |o| {
            expect_count(o, 3)?;
            o.iter().try_for_each(|f| expect_image(f, "jpeg", None))
        }),
        case("convert.pdf.doc-txt", "doc.pdf", Fmt::Txt, None, |o| {
            expect_count(o, 1)?;
            expect_text_includes(&o[0], "Alohamora Test Document")?;
            expect_text_includes(&o[0], "First item")?;
            let text = read_text(&o[0]);
            check(!text.split('\n').any(|l| l.trim() == "2"), "page number \"2\" should have been removed")
        }),
        case("convert.pdf.doc-docx", "doc.pdf", Fmt::Docx, None, |o| {
            expect_count(o, 1)?;
            expect_zip_entries(&o[0], &["word/document.xml"])?;
            let xml = zip_text(&o[0], "word/document.xml")?;
            check(xml.contains("Alohamora Test Document"), "DOCX should contain the title text")?;
            check(xml.contains("Heading1"), "DOCX should use the Heading1 style")
        }),
        case("convert.pdf.doc-docx-pages", "doc.pdf", Fmt::Docx, Some(json!({ "docMode": "pages" })), |o| {
            expect_count(o, 1)?;
            let entries = expect_zip_entries(&o[0], &["word/document.xml"])?;
            let media = entries.iter().filter(|n| n.starts_with("word/media/") && !n.ends_with('/')).count();
            check(media == 3, format!("expected 3 page images, got {media}"))
        }),
        case("convert.pdf.doc-epub", "doc.pdf", Fmt::Epub, None, |o| {
            expect_count(o, 1)?;
            expect_magic(&o[0], 30, "mimetype")?;
            expect_zip_entries(&o[0], &["mimetype", "META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml"]).map(|_| ())
        }),
        case("convert.pdf.doc-epub-pages", "doc.pdf", Fmt::Epub, Some(json!({ "docMode": "pages" })), |o| {
            expect_count(o, 1)?;
            let entries = expect_zip_entries(&o[0], &["OEBPS/content.opf"])?;
            check(zip_text(&o[0], "OEBPS/content.opf")?.contains("pre-paginated"), "OPF should declare pre-paginated layout")?;
            let jpgs = entries.iter().filter(|n| n.ends_with(".jpg")).count();
            check(jpgs == 3, format!("expected 3 page images, got {jpgs}"))
        }),
    ];
    let mut ocr = case("convert.pdf.scan-txt-ocr", "scan.pdf", Fmt::Txt, None, |o| {
        expect_count(o, 1)?;
        let text = read_text(&o[0]).to_uppercase();
        check(text.contains("ALOHAMORA"), format!("OCR text should contain ALOHAMORA, got: {}", text.chars().take(80).collect::<String>()))?;
        check(text.contains("OCR"), "OCR text should contain OCR")
    });
    ocr.skip = Some(no_ocr);
    v.push(ocr);
    v
}
```

**File `src-tauri/crates/engine/src/selftest/cases/tools_video.rs`**

```rust
//! Port of src/main/selftest/cases/tools-video.ts.

use std::path::Path;

use alohamora_core::types::ToolId;
use serde_json::json;

use super::{tool_case, tool_error, Case};
use crate::ffmpeg::probe;
use crate::selftest::assert::{check, expect_count, expect_streams, Codec};
use crate::selftest::fixtures_docs::expect_image;

const G: &str = "tools.video";

fn n(name: &str) -> String {
    format!("tools.video.{name}")
}

fn p(file: &str) -> Result<alohamora_core::ffmpeg_parse::ProbeResult, String> {
    probe(Path::new(file)).map_err(|e| e.to_string())
}

pub fn cases() -> Vec<Case> {
    vec![
        tool_case(&n("compress"), G, &["video.mp4"], ToolId::VideoCompress, json!({ "preset": "small", "maxHeight": 240 }), |o| {
            expect_count(o, 1)?;
            let v = p(&o[0])?.video.ok_or("no video")?;
            check(v.display_height == 240, format!("expected height 240, got {}", v.display_height))?;
            check(v.codec == "h264", format!("expected h264, got {}", v.codec))
        }),
        tool_case(&n("trim-precise"), G, &["video.mp4"], ToolId::VideoTrim, json!({ "startSec": 1, "endSec": 3, "precise": true }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::Any, Some((2.0, 0.25)))
        }),
        tool_case(&n("trim-fast"), G, &["video.mp4"], ToolId::VideoTrim, json!({ "startSec": 1, "endSec": 3, "precise": false }), |o| {
            expect_count(o, 1)?;
            let d = p(&o[0])?.duration_sec;
            check((1.5..=3.3).contains(&d), format!("fast trim duration should be 1.5–3.3 s, got {d}"))
        }),
        tool_case(&n("split-parts"), G, &["video.mp4"], ToolId::VideoSplit, json!({ "mode": "parts", "parts": 2 }), |o| expect_count(o, 2)),
        tool_case(&n("crop"), G, &["video.mp4"], ToolId::VideoCrop, json!({ "rect": { "x": 0.25, "y": 0.25, "w": 0.5, "h": 0.5 } }), |o| {
            expect_count(o, 1)?;
            let v = p(&o[0])?.video.ok_or("no video")?;
            check(v.display_width == 320 && v.display_height == 180, format!("expected 320x180, got {}x{}", v.display_width, v.display_height))
        }),
        tool_error(&n("crop-full-rect-fails"), G, &["video.mp4"], ToolId::VideoCrop, json!({}), "whole frame"),
        tool_case(&n("speed-2x"), G, &["video.mp4"], ToolId::VideoSpeed, json!({ "factor": 2, "keepAudio": true }), |o| {
            expect_count(o, 1)?;
            let r = p(&o[0])?;
            check((r.duration_sec - 2.0).abs() <= 0.3, format!("expected ~2 s, got {}", r.duration_sec))?;
            check(r.audio.is_some(), "audio should be kept")
        }),
        tool_case(&n("mute"), G, &["video.mp4"], ToolId::VideoMute, json!({}), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::None, None)
        }),
        tool_case(&n("snapshot-single"), G, &["video.mp4"], ToolId::VideoSnapshot, json!({ "mode": "single", "timeSec": 1, "format": "png" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((640, 360)))
        }),
        tool_case(&n("snapshot-every"), G, &["video.mp4"], ToolId::VideoSnapshot, json!({ "mode": "every", "everySec": 1, "format": "jpg" }), |o| {
            check(o.len() == 4 || o.len() == 5, format!("expected 4 or 5 frames, got {}", o.len()))
        }),
        tool_case(&n("redact-blur"), G, &["video.mp4"], ToolId::VideoRedact, json!({ "regions": [{ "rect": { "x": 0.1, "y": 0.1, "w": 0.3, "h": 0.3 }, "style": "blur" }] }), |o| {
            expect_count(o, 1)?;
            let r = p(&o[0])?;
            let v = r.video.ok_or("no video")?;
            check(v.codec == "h264" && v.display_width == 640 && v.display_height == 360, "redacted video should stay h264 640x360")?;
            check(!r.tags.contains_key("title"), "metadata should have been stripped")
        }),
        tool_case(&n("metadata-set-title"), G, &["video.mp4"], ToolId::VideoMetadata, json!({ "tags": { "title": "Hello" } }), |o| {
            expect_count(o, 1)?;
            check(p(&o[0])?.tags.get("title").map(|s| s.as_str()) == Some("Hello"), "title tag should be Hello")
        }),
        tool_case(&n("metadata-remove-all"), G, &["titled.mp4"], ToolId::VideoMetadata, json!({ "removeAll": true }), |o| {
            expect_count(o, 1)?;
            check(!p(&o[0])?.tags.contains_key("title"), "title tag should be gone")
        }),
        tool_case(&n("join-same"), G, &["video.mp4", "video-copy.mp4"], ToolId::VideoJoin, json!({}), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::Is("aac"), Some((8.0, 0.3)))
        }),
        tool_case(&n("join-mixed"), G, &["video.mp4", "video-noaudio.mp4"], ToolId::VideoJoin, json!({}), |o| {
            expect_count(o, 1)?;
            let r = p(&o[0])?;
            check((r.duration_sec - 6.0).abs() <= 0.4, format!("expected ~6 s, got {}", r.duration_sec))?;
            check(r.audio.is_some(), "joined clip should have audio")
        }),
    ]
}
```

**File `src-tauri/crates/engine/src/selftest/cases/tools_audio.rs`**

```rust
//! Port of src/main/selftest/cases/tools-audio.ts.

use std::path::Path;

use alohamora_core::types::ToolId;
use serde_json::json;

use super::{tool_case, tool_error, Case};
use crate::ffmpeg::probe;
use crate::selftest::assert::{check, expect_count, expect_streams, Codec};
use crate::selftest::fixtures_docs::expect_image;

const G: &str = "tools.audio";

fn n(name: &str) -> String {
    format!("tools.audio.{name}")
}

fn channels(file: &str) -> u32 {
    probe(Path::new(file)).ok().and_then(|p| p.audio).map(|a| a.channels).unwrap_or(0)
}

pub fn cases() -> Vec<Case> {
    vec![
        tool_case(&n("compress"), G, &["audio.wav"], ToolId::AudioCompress, json!({ "bitrateKbps": 128, "format": "keep" }), |o| {
            expect_count(o, 1)?;
            check(o[0].ends_with(".mp3"), format!("WAV should compress to MP3, got {}", o[0]))?;
            expect_streams(&o[0], Codec::Any, Codec::Is("mp3"), Some((4.0, 0.5)))
        }),
        tool_case(&n("channels-mono"), G, &["audio.wav"], ToolId::AudioChannels, json!({ "mode": "mono" }), |o| {
            expect_count(o, 1)?;
            check(channels(&o[0]) == 1, "expected 1 channel")
        }),
        tool_case(&n("channels-swap"), G, &["stereo-lr.wav"], ToolId::AudioChannels, json!({ "mode": "swap" }), |o| {
            expect_count(o, 1)?;
            check(channels(&o[0]) == 2, "expected 2 channels")
        }),
        tool_error(&n("channels-left-on-mono-fails"), G, &["audio-mono.wav"], ToolId::AudioChannels, json!({ "mode": "left" }), "mono"),
        tool_case(&n("normalize"), G, &["audio.wav"], ToolId::AudioNormalize, json!({ "target": -16, "truePeak": -1.5 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((4.0, 0.3)))
        }),
        tool_error(&n("normalize-silent-fails"), G, &["audio-silent.wav"], ToolId::AudioNormalize, json!({}), "silent"),
        tool_case(&n("trim-fade"), G, &["audio.wav"], ToolId::AudioTrim, json!({ "startSec": 1, "endSec": 3, "fadeInSec": 0.5 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((2.0, 0.1)))
        }),
        tool_case(&n("visualize-png"), G, &["audio.wav"], ToolId::AudioVisualize, json!({ "kind": "waveform-png", "width": 1920, "height": 480 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((1920, 480)))
        }),
        tool_case(&n("visualize-mp4"), G, &["audio.wav"], ToolId::AudioVisualize, json!({ "kind": "waveform-mp4", "width": 640, "height": 360 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Is("h264"), Codec::Is("aac"), None)
        }),
        tool_case(&n("bleep"), G, &["audio.wav"], ToolId::AudioBleep, json!({ "ranges": [{ "startSec": 1, "endSec": 2 }], "sound": "beep", "frequency": 1000 }), |o| {
            expect_count(o, 1)?;
            expect_streams(&o[0], Codec::Any, Codec::Is("pcm_s16le"), Some((4.0, 0.2)))
        }),
        tool_case(&n("metadata-title"), G, &["audio.mp3"], ToolId::AudioMetadata, json!({ "tags": { "title": "Song" } }), |o| {
            expect_count(o, 1)?;
            let t = probe(Path::new(&o[0])).map_err(|e| e.to_string())?.tags.get("title").cloned();
            check(t.as_deref() == Some("Song"), "title tag should be Song")
        }),
        tool_case(&n("join"), G, &["audio.wav", "audio.mp3"], ToolId::AudioJoin, json!({}), |o| {
            expect_count(o, 1)?;
            let d = probe(Path::new(&o[0])).map_err(|e| e.to_string())?.duration_sec;
            check((d - 8.0).abs() <= 0.3, format!("expected ~8 s, got {d}"))
        }),
    ]
}
```

**File `src-tauri/crates/engine/src/selftest/cases/tools_image.rs`**

```rust
//! Port of src/main/selftest/cases/tools-image.ts.

use alohamora_core::types::ToolId;
use serde_json::{json, Value};

use super::{tool_case, tool_error, Case};
use crate::selftest::assert::{check, expect_count, Check};
use crate::selftest::fixtures_docs::{exif_summary, expect_image, expect_pdf_pages, image_dims, image_format, pixel};

fn case(name: &str, fixtures: &[&'static str], tool: ToolId, options: Value, verify: impl Fn(&[String]) -> Check + Send + Sync + 'static) -> Case {
    tool_case(&format!("tools.image.{name}"), "tools.image", fixtures, tool, options, verify)
}

pub fn cases() -> Vec<Case> {
    vec![
        case("compress-jpg", &["photo.jpg"], ToolId::ImageCompress, json!({ "quality": 40 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "jpeg", None)?;
            // The source is the fixture next to the out/ folder: <root>/fixtures/photo.jpg.
            let out = std::path::Path::new(&o[0]);
            let root = out.ancestors().find(|p| p.join("fixtures").is_dir()).ok_or("fixtures folder not found")?;
            let source = std::fs::metadata(root.join("fixtures").join("photo.jpg")).map_err(|e| e.to_string())?.len();
            let size = std::fs::metadata(out).map_err(|e| e.to_string())?.len();
            check(size < source, format!("compressed ({size}) should be smaller than the source ({source})"))
        }),
        case("compress-png", &["image.png"], ToolId::ImageCompress, json!({}), |o| {
            // either a PNG was written, or the output was dropped because it was not smaller; both are fine, an error is not
            check(o.len() <= 1, format!("expected 0 or 1 outputs, got {}", o.len()))?;
            if o.len() == 1 { expect_image(&o[0], "png", None) } else { Ok(()) }
        }),
        case("resize-50", &["image.png"], ToolId::ImageResize, json!({ "mode": "percent", "percent": 50 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((400, 300)))
        }),
        case("crop-rect", &["image.png"], ToolId::ImageCrop, json!({ "rect": { "x": 0, "y": 0, "w": 0.5, "h": 0.5 } }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((400, 300)))
        }),
        case("crop-rotate", &["image.png"], ToolId::ImageCrop, json!({ "rotate": 90 }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((600, 800)))
        }),
        case("edit-bw-keeps-alpha", &["image.png"], ToolId::ImageEdit, json!({ "exposure": 0.5, "effect": "bw" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", None)?;
            check(pixel(&o[0], 0, 0)?[3] == 0, "transparent corner should stay transparent")
        }),
        case("edit-sepia-jpg", &["photo.jpg"], ToolId::ImageEdit, json!({ "effect": "sepia" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "jpeg", None)
        }),
        case("background", &["image.png"], ToolId::ImageBackground, json!({}), |o| {
            expect_count(o, 1)?;
            let f = image_format(&o[0])?;
            let (w, h) = image_dims(&o[0])?;
            check(f == "png" && w > 800 && h > 600, format!("backdrop should be larger than 800x600, got {w}x{h}"))
        }),
        case("redact-black", &["photo.jpg"], ToolId::ImageRedact, json!({ "regions": [{ "rect": { "x": 0, "y": 0, "w": 0.25, "h": 0.25 }, "style": "black" }] }), |o| {
            expect_count(o, 1)?;
            let p = pixel(&o[0], 5, 5)?;
            check((p[0] as u32 + p[1] as u32 + p[2] as u32) < 30, format!("pixel (5,5) should be near black, got {},{},{}", p[0], p[1], p[2]))
        }),
        tool_error("tools.image.redact-empty-fails", "tools.image", &["photo.jpg"], ToolId::ImageRedact, json!({}), "at least one box"),
        case("metadata-remove-all", &["gps.jpg"], ToolId::ImageMetadata, json!({ "action": "remove-all" }), |o| {
            expect_count(o, 1)?;
            let (artist, gps, _) = exif_summary(&o[0]);
            check(artist.is_none(), "Artist should be gone")?;
            check(!gps, "GPS should be gone")
        }),
        case("metadata-remove-gps", &["gps.jpg"], ToolId::ImageMetadata, json!({ "action": "remove-gps" }), |o| {
            expect_count(o, 1)?;
            let (artist, gps, _) = exif_summary(&o[0]);
            check(artist.as_deref() == Some("Tester"), format!("Artist should survive, got {artist:?}"))?;
            check(!gps, "GPS should be gone")
        }),
        case("metadata-edit", &["gps.jpg"], ToolId::ImageMetadata, json!({ "action": "edit", "fields": { "artist": "New" } }), |o| {
            expect_count(o, 1)?;
            let (artist, _, _) = exif_summary(&o[0]);
            check(artist.as_deref() == Some("New"), format!("Artist should be New, got {artist:?}"))
        }),
        case("metadata-remove-all-png", &["image.png"], ToolId::ImageMetadata, json!({ "action": "remove-all" }), |o| {
            expect_count(o, 1)?;
            expect_image(&o[0], "png", Some((800, 600)))
        }),
        case("collage-grid", &["image.png", "photo.jpg", "image.webp"], ToolId::ImageCollage, json!({ "layout": "grid" }), |o| {
            expect_count(o, 1)?;
            let f = image_format(&o[0])?;
            let (w, _) = image_dims(&o[0])?;
            check(f == "jpeg" && w == 2048, format!("expected a 2048 px wide JPEG, got {f} {w}"))
        }),
        case("make-pdf", &["image.png", "photo.jpg"], ToolId::ImagePdf, json!({ "pageSize": "a4", "combine": true }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 2)
        }),
    ]
}
```

**File `src-tauri/crates/engine/src/selftest/cases/tools_pdf.rs`**

```rust
//! Port of src/main/selftest/cases/tools-pdf.ts (PDF tools + the subtitle tool).

use alohamora_core::types::{Capabilities, ToolId};
use serde_json::{json, Value};

use super::{tool_case, tool_error, Case};
use crate::selftest::assert::{check, expect_count, expect_text_includes, read_text, Check};
use crate::selftest::fixtures_docs::{expect_pdf_pages, expect_zip_entries, image_dims, pdf_rotation, pdf_title_author};

fn no_ocr(c: &Capabilities) -> Option<String> {
    if c.ocr_languages.iter().any(|l| l == "eng") { None } else { Some("no English OCR data".into()) }
}

fn case(name: &str, fixtures: &[&'static str], tool: ToolId, options: Value, verify: impl Fn(&[String]) -> Check + Send + Sync + 'static) -> Case {
    tool_case(&format!("tools.pdf.{name}"), "tools.pdf", fixtures, tool, options, verify)
}

pub fn cases() -> Vec<Case> {
    let mut v = vec![
        case("merge", &["doc.pdf", "doc-copy.pdf"], ToolId::PdfMerge, json!({}), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 6)
        }),
        case("split-each", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "each" }), |o| {
            expect_count(o, 3)?;
            o.iter().try_for_each(|f| expect_pdf_pages(f, 1))
        }),
        case("split-ranges", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "ranges", "ranges": "1-2,3" }), |o| expect_count(o, 2)),
        case("split-extract", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "extract", "ranges": "2" }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 1)
        }),
        tool_error("tools.pdf.split-bad-range-fails", "tools.pdf", &["doc.pdf"], ToolId::PdfSplit, json!({ "mode": "extract", "ranges": "9" }), "(?-i)doesn't exist"),
        case("organize", &["doc.pdf"], ToolId::PdfOrganize, json!({ "pages": [{ "src": 2, "rotate": 90 }, { "src": 0, "rotate": 0 }] }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 2)?;
            check(pdf_rotation(&o[0], 0)? == 90, "first page should be rotated 90°")
        }),
        case("images", &["doc.pdf"], ToolId::PdfImages, json!({ "format": "png", "dpi": 72, "ranges": "1" }), |o| {
            expect_count(o, 1)?;
            check(image_dims(&o[0])?.0 == 612, "a US-letter page at 72 DPI is 612 px wide")
        }),
        case("compress-balanced", &["doc.pdf"], ToolId::PdfCompress, json!({ "level": "balanced" }), |o| {
            check(o.len() <= 1, format!("expected 0 or 1 outputs, got {}", o.len()))?;
            if o.len() == 1 { expect_pdf_pages(&o[0], 3) } else { Ok(()) }
        }),
        case("compress-max", &["doc.pdf"], ToolId::PdfCompress, json!({ "level": "max" }), |o| {
            expect_count(o, 1)?;
            expect_pdf_pages(&o[0], 3)
        }),
    ];
    let mut ocr_txt = case("ocr-txt", &["scan.pdf"], ToolId::PdfOcr, json!({ "languages": ["eng"], "output": "txt" }), |o| {
        expect_count(o, 1)?;
        check(read_text(&o[0]).to_uppercase().contains("ALOHAMORA"), "OCR text should contain ALOHAMORA")
    });
    ocr_txt.skip = Some(no_ocr);
    let mut ocr_pdf = case("ocr-pdf", &["scan.pdf"], ToolId::PdfOcr, json!({ "languages": ["eng"], "output": "pdf" }), |o| {
        expect_count(o, 1)?;
        expect_pdf_pages(&o[0], 1)
    });
    ocr_pdf.skip = Some(no_ocr);
    v.push(ocr_txt);
    v.push(ocr_pdf);
    v.push(case("word", &["doc.pdf"], ToolId::PdfWord, json!({}), |o| {
        expect_count(o, 1)?;
        expect_zip_entries(&o[0], &["word/document.xml"]).map(|_| ())
    }));
    v.push(case("metadata-title", &["doc.pdf"], ToolId::PdfMetadata, json!({ "title": "New Title", "author": "Me", "keywords": "a, b" }), |o| {
        expect_count(o, 1)?;
        let (title, author) = pdf_title_author(&o[0])?;
        check(title.as_deref() == Some("New Title"), format!("title should be New Title, got {title:?}"))?;
        check(author.as_deref() == Some("Me"), "author should be Me")
    }));
    v.push(case("metadata-remove-all", &["doc.pdf"], ToolId::PdfMetadata, json!({ "removeAll": true }), |o| {
        expect_count(o, 1)?;
        check(pdf_title_author(&o[0])?.0.is_none(), "title should be gone")?;
        expect_pdf_pages(&o[0], 3)
    }));
    v
}

pub fn subtitle_cases() -> Vec<Case> {
    vec![tool_case("tools.subtitle.shift", "tools.subtitle", &["subs.srt"], ToolId::SubtitleShift, json!({ "offsetMs": 1000 }), |o| {
        expect_count(o, 1)?;
        expect_text_includes(&o[0], "00:00:02,000 --> 00:00:03,500")
    })]
}
```

**File `src-tauri/crates/engine/src/selftest/cases/errors.rs`**

```rust
//! Port of src/main/selftest/cases/errors.ts: each situation must show a plain-language message.

use alohamora_core::types::{Fmt, ToolId};
use serde_json::json;

use super::{convert_error, tool_error, Case};

const G: &str = "errors";

pub fn cases() -> Vec<Case> {
    let mut heic = convert_error("errors.heic-without-encoder", G, &["image.png"], Fmt::Heic, None, "HEIC output is not available");
    heic.skip = Some(|c| if c.heif_enc { Some("a HEIC encoder exists on this machine".into()) } else { None });
    vec![
        convert_error("errors.fake-video", G, &["fake.mp4"], Fmt::Mkv, None, "damaged|not really the format"),
        convert_error("errors.fake-audio", G, &["fake.mp3"], Fmt::Wav, None, "damaged|not really the format"),
        convert_error("errors.broken-image", G, &["broken.png"], Fmt::Jpg, None, "couldn't read this image"),
        convert_error("errors.broken-pdf", G, &["broken.pdf"], Fmt::Txt, None, "could not be opened|damaged"),
        tool_error("errors.mute-without-audio", G, &["video-noaudio.mp4"], ToolId::VideoMute, json!({}), "no audio to remove"),
        tool_error("errors.compress-target-too-small", G, &["video.mp4"], ToolId::VideoCompress, json!({ "targetSizeMb": 0.001 }), "too small"),
        heic,
        convert_error("errors.scanned-pdf-ocr-off", G, &["scan.pdf"], Fmt::Txt, Some(json!({ "ocr": "off" })), "no text layer"),
        tool_error("errors.trim-too-short", G, &["video.mp4"], ToolId::VideoTrim, json!({ "startSec": 1, "endSec": 1.01 }), "too short"),
        tool_error("errors.split-single-cut", G, &["video.mp4"], ToolId::VideoSplit, json!({ "mode": "at", "times": [] }), "at least one cut"),
        tool_error("errors.wrong-kind-for-tool", G, &["doc.pdf"], ToolId::VideoTrim, json!({}), "damaged|not really the format|no video track"),
    ]
}
```

**File `src-tauri/crates/engine/examples/selftest.rs`**

```rust
//! Dev runner for the engine self-test without the Tauri app:
//! cargo run -p alohamora-engine --example selftest -- <bin_dir> <resource_dir> <work_dir> [--only=<group|prefix>]
use std::path::PathBuf;

use alohamora_engine::{capabilities, paths, selftest, settings};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let arg = |i: usize| PathBuf::from(args.get(i).expect("usage: selftest <bin_dir> <resource_dir> <work_dir> [--only=x]"));
    let (bin_dir, resource_dir, work) = (arg(1), arg(2), arg(3));
    let only = args.iter().find_map(|a| a.strip_prefix("--only=").map(String::from));
    paths::init(paths::Paths {
        bin_dir,
        resource_dir,
        config_dir: work.join("config"),
        cache_dir: work.join("cache"),
        data_dir: work.join("data"),
        jobs_temp_root: std::env::temp_dir().join("alohamora-jobs"),
        app_version: env!("CARGO_PKG_VERSION").into(),
    });
    settings::load_defaults_in_memory();
    capabilities::detect();
    std::process::exit(selftest::run(only.as_deref(), &work.join("selftest")));
}
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine --all-targets -- -D warnings
```

**Done when:** `test result: ok. 4 passed; 0 failed` (the example is compiled too) and Clippy reports no warnings. The
`engine` crate is complete.

## Task 7.4 — Run the self-test

**Goal.** Prove the engine works on real files before any UI is connected.

The arguments are: the folder with the FFmpeg sidecars, the resources folder (PDFium, tessdata, fonts) and a work folder.
Fixtures are generated into `.selftest/selftest/fixtures` the first time (cached afterwards); outputs go to
`.selftest/selftest/out`.

**Run**
```bash
cargo run --locked --manifest-path src-tauri/Cargo.toml -p alohamora-engine --example selftest -- \
  src-tauri/binaries src-tauri/resources .selftest
```

Run a single group or case while fixing something: add `--only=tools.pdf` or `--only=convert.image.png-heic` at the end.

**Done when:** the last lines read `SELFTEST: N passed, 0 failed, M skipped` with N + M = 121, and the command exits
with status 0. Skips are normal and depend on the machine:

| Case | Skipped when |
|---|---|
| `convert.video.vp9-mov-hw` | no hardware H.264 encoder works on this machine |
| `convert.image.png-heic`, `convert.image.heic-jpg` | no HEIC encoder (Windows/Linux without `heif-enc` + its HEVC plugin; the HEIC test picture is made with that encoder) |
| `errors.heic-without-encoder` | a HEIC encoder **does** exist (the case tests the message for the opposite) |

The three OCR cases (`convert.pdf.scan-txt-ocr`, `tools.pdf.ocr-txt`, `tools.pdf.ocr-pdf`) skip only when
`tessdata/eng.traineddata` is missing. That must not happen after Task 2.2: if they skip, run `npm run check-binaries`.

A `FAIL` line names the case and the reason. Look the case up in `selftest/cases/*.rs`, find which converter or tool it
runs, and compare those files with the plan. Appendix D lists known environment problems (old FFmpeg, missing fonts,
missing PDFium).

# Phase 8 — The Tauri app

The app crate (`src-tauri/src`) connects the engine to the UI: two windows, the commands the UI invokes, the events it
listens to, the `kfile` protocol for media previews, the tray and the OS integrations.

The app modules use each other and `lib.rs` declares them all, so the app is compiled once, in Task 8.8. Tasks 8.2–8.7
only write files; their Verify blocks just check that the files exist. Compile errors in Task 8.8 name the file and line:
compare that file with its block.

## Task 8.1 — Tauri configuration and icons

**Goal.** Tauri knows the app's name, windows' security policy, bundled files, installers and icons.

1. The main configuration. Points to remember:
   - `build`: the UI comes from `dist/renderer` (built by `npm run build:ui`), or from the Vite server during development.
   - `app.windows` is empty: the app creates its windows in code (Task 8.4).
   - `app.security.csp`: **the offline guarantee for the web view.** Only the app itself, `data:`/`blob:` URLs, Tauri's IPC
     and the `kfile` protocol are allowed. Never add a remote origin.
   - `bundle.externalBin`: the FFmpeg sidecars from Task 2.2. `bundle.resources`: OCR data, fonts, licence files.
   - Windows: the WebView2 **offline installer** is embedded (the installer works without internet); per-user install;
     uninstall hooks. Linux: package dependencies and the desktop file template. macOS: hardened runtime, entitlements.

**File `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Alohamora",
  "mainBinaryName": "alohamora",
  "version": "0.2.0",
  "identifier": "com.alohamora.app",
  "build": {
    "frontendDist": "../dist/renderer",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev:ui",
    "beforeBuildCommand": "npm run build:ui"
  },
  "app": {
    "windows": [],
    "withGlobalTauri": false,
    "macOSPrivateApi": true,
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: kfile: http://kfile.localhost; media-src 'self' blob: kfile: http://kfile.localhost; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; worker-src 'self' blob:"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "Utility",
    "shortDescription": "Offline file converter",
    "longDescription": "Convert and edit images, video, audio, PDFs and subtitles on your own computer. Nothing is uploaded.",
    "copyright": "Copyright \u00a9 2026 Alohamora contributors",
    "publisher": "Alohamora contributors",
    "externalBin": [
      "binaries/ffmpeg",
      "binaries/ffprobe"
    ],
    "resources": {
      "resources/tessdata/": "tessdata/",
      "resources/fonts/": "fonts/",
      "resources/LICENSE-ffmpeg.txt": "LICENSE-ffmpeg.txt",
      "../THIRD_PARTY_NOTICES.md": "THIRD_PARTY_NOTICES.md"
    },
    "linux": {
      "deb": {
        "depends": [
          "libayatana-appindicator3-1"
        ],
        "recommends": [
          "gstreamer1.0-plugins-good",
          "gstreamer1.0-libav",
          "libheif-examples",
          "libheif-plugin-x265"
        ],
        "desktopTemplate": "linux/alohamora.desktop"
      },
      "rpm": {
        "desktopTemplate": "linux/alohamora.desktop"
      },
      "appimage": {
        "bundleMediaFramework": true
      }
    },
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller",
        "silent": true
      },
      "nsis": {
        "installMode": "currentUser",
        "installerHooks": "windows/hooks.nsh"
      }
    },
    "macOS": {
      "minimumSystemVersion": "11.0",
      "hardenedRuntime": true,
      "entitlements": "macos/entitlements.plist"
    }
  }
}
```

2. Per-OS additions. Tauri merges `tauri.<os>.conf.json` over the main file. PDFium is a resource on Windows and Linux,
   but a **framework** on macOS (it must sit in `Contents/Frameworks` to be signed and notarized). macOS also bundles the
   Swift drag helper, uses ad-hoc signing by default (`"-"`, replaced by a real identity in Task 9.3) and registers the
   file types for "Open With".

**File `src-tauri/tauri.macos.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "externalBin": [
      "binaries/ffmpeg",
      "binaries/ffprobe",
      "binaries/alohamora-drag-helper"
    ],
    "macOS": {
      "frameworks": [
        "resources/pdfium/libpdfium.dylib"
      ],
      "minimumSystemVersion": "11.0",
      "hardenedRuntime": true,
      "entitlements": "macos/entitlements.plist",
      "signingIdentity": "-"
    },
    "fileAssociations": [
      {
        "ext": [
          "jpg",
          "jpeg",
          "png",
          "webp",
          "heic",
          "heif",
          "tif",
          "tiff",
          "svg",
          "avif",
          "bmp"
        ],
        "name": "Image",
        "role": "Viewer",
        "rank": "Alternate"
      },
      {
        "ext": [
          "mp3",
          "m4a",
          "wav",
          "flac",
          "ogg",
          "opus",
          "aiff",
          "aif",
          "wma"
        ],
        "name": "Audio",
        "role": "Viewer",
        "rank": "Alternate"
      },
      {
        "ext": [
          "mp4",
          "m4v",
          "mov",
          "mkv",
          "webm",
          "avi",
          "wmv",
          "gif"
        ],
        "name": "Video",
        "role": "Viewer",
        "rank": "Alternate"
      },
      {
        "ext": [
          "pdf",
          "txt",
          "md",
          "srt",
          "vtt"
        ],
        "name": "Document",
        "role": "Viewer",
        "rank": "Alternate"
      }
    ]
  }
}
```

**File `src-tauri/tauri.windows.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "resources": {
      "resources/pdfium/": "pdfium/"
    }
  }
}
```

**File `src-tauri/tauri.linux.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "resources": {
      "resources/pdfium/": "pdfium/"
    }
  }
}
```

3. Permissions of the web view: the UI may only call the app's own commands plus the window buttons
   (`CaptionButtons`, title-bar dragging).

**File `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "What the UI may call directly. Everything else goes through the app's own commands (validated in Rust).",
  "windows": ["main", "overlay"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "core:window:allow-is-maximized"
  ]
}
```

4. Packaging files: the Linux desktop entry (with the MIME types for "Open With"), the Windows uninstall hook (removes
   the right-click verb, the Send To shortcut and the login entry the app may have created) and the macOS entitlements
   (PDFium is loaded at run time, so library validation is off).

**File `src-tauri/linux/alohamora.desktop`**

```ini
[Desktop Entry]
Categories={{categories}}
Comment={{comment}}
Exec={{exec}} %F
StartupWMClass={{exec}}
Icon={{icon}}
Name={{name}}
Terminal=false
Type=Application
MimeType=image/jpeg;image/png;image/webp;image/heic;image/tiff;image/svg+xml;image/avif;image/bmp;audio/mpeg;audio/mp4;audio/x-wav;audio/flac;audio/ogg;audio/x-aiff;audio/x-ms-wma;video/mp4;video/quicktime;video/x-matroska;video/webm;video/x-msvideo;video/x-ms-wmv;image/gif;application/pdf;text/plain;application/x-subrip;text/vtt;
```

**File `src-tauri/windows/hooks.nsh`**

```nsis
; Tauri NSIS installer hooks (bundle.windows.nsis.installerHooks).
; Uninstall removes what the app created itself: the right-click verb, the Send To shortcut, the login entry.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\*\shell\Alohamora"
  Delete "$APPDATA\Microsoft\Windows\SendTo\Alohamora.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Alohamora"
!macroend
```

**File `src-tauri/macos/entitlements.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- libpdfium.dylib is loaded at run time; ad-hoc signed builds have no Team ID, so library validation must be off. -->
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
```

5. Icons: move the tray icons, remove the Electron packaging files, and generate the app icons from `build/icon.png`
   (1024 × 1024). `tauri icon` also makes Android/iOS icons; we do not need them.

**Run**
```bash
mkdir -p src-tauri/icons
git mv resources/tray.png src-tauri/icons/tray.png
git mv resources/trayTemplate@2x.png src-tauri/icons/trayTemplate@2x.png
git rm -q resources/trayTemplate.png build/installer.nsh build/entitlements.mac.plist
npx tauri icon build/icon.png
rm -rf src-tauri/icons/android src-tauri/icons/ios
```

**Verify**
```bash
ls src-tauri/icons/32x32.png src-tauri/icons/128x128.png src-tauri/icons/128x128@2x.png src-tauri/icons/icon.icns \
   src-tauri/icons/icon.ico src-tauri/icons/tray.png src-tauri/icons/trayTemplate@2x.png
node -e "for (const f of ['tauri.conf.json','tauri.macos.conf.json','tauri.windows.conf.json','tauri.linux.conf.json','capabilities/default.json']) JSON.parse(require('fs').readFileSync('src-tauri/'+f,'utf8'))"
```

**Done when:** all icons exist and the five JSON files parse.

## Task 8.2 — app: state and platform helpers

**Goal.** Process-wide flags, and the few things that need direct OS calls.

- `app_state.rs`: "the app is quitting", "a tray icon exists", and per-window "the UI has rendered" (`mark_ready` /
  `wait_ready`), used to show the main window without a white flash and to send overlay events only once the overlay
  listens.
- `platform/`: one file per OS with the same functions: the pointer position and button (for the global drag wheel),
  the Alt/Shift state during a drop, and showing the overlay **without taking focus** (Windows `SW_SHOWNOACTIVATE`,
  macOS `orderFrontRegardless` at the "pop-up menu" level on every Space).

**File `src-tauri/src/app_state.rs`**

```rust
//! Process-wide flags (port of appState.ts) plus "this window's UI has finished loading".

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

static QUITTING: AtomicBool = AtomicBool::new(false);
static TRAY_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn is_quitting() -> bool {
    QUITTING.load(Ordering::SeqCst)
}

pub fn set_quitting() {
    QUITTING.store(true, Ordering::SeqCst);
}

pub fn is_tray_active() -> bool {
    TRAY_ACTIVE.load(Ordering::SeqCst)
}

pub fn set_tray_active(v: bool) {
    TRAY_ACTIVE.store(v, Ordering::SeqCst);
}

fn ready() -> &'static (Mutex<HashSet<String>>, Condvar) {
    static R: OnceLock<(Mutex<HashSet<String>>, Condvar)> = OnceLock::new();
    R.get_or_init(|| (Mutex::new(HashSet::new()), Condvar::new()))
}

/// Called by the `ui_ready` command: the window's React tree is mounted and its event listeners exist.
pub fn mark_ready(label: &str) {
    let (set, cv) = ready();
    set.lock().expect("ready set").insert(label.to_string());
    cv.notify_all();
}

/// Wait (at most `timeout`) until `label` has called `ui_ready`. Events sent earlier would be lost.
pub fn wait_ready(label: &str, timeout: Duration) -> bool {
    let (set, cv) = ready();
    let guard = set.lock().expect("ready set");
    let (guard, _) = cv.wait_timeout_while(guard, timeout, |s| !s.contains(label)).expect("ready set");
    guard.contains(label)
}

/// The main window is re-created after it was destroyed; its new page must report again.
pub fn clear_ready(label: &str) {
    ready().0.lock().expect("ready set").remove(label);
}
```

**File `src-tauri/src/platform/mod.rs`**

```rust
//! Small OS-specific helpers: modifier keys during a drop, the pointer for the global drag wheel,
//! and showing the overlay without stealing focus. One file per OS; all expose the same functions.

/// Pointer state in PHYSICAL screen pixels.
#[derive(Debug, Clone, Copy, Default)]
pub struct Pointer {
    pub x: f64,
    pub y: f64,
    pub left_down: bool,
    pub shift: bool,
    pub alt: bool,
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "linux")]
pub use linux::*;
#[cfg(target_os = "macos")]
pub use macos::*;
#[cfg(windows)]
pub use windows::*;
```

**File `src-tauri/src/platform/linux.rs`**

```rust
//! Linux: X11 via x11rb (pure Rust, no libX11). On Wayland there is no global pointer/keyboard access:
//! everything returns "unknown" (None / false), matching the Electron build's limits.

use std::sync::{Mutex, OnceLock};

use tauri::WebviewWindow;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt, KeyButMask, Window};
use x11rb::rust_connection::RustConnection;

use super::Pointer;

fn x11() -> Option<&'static Mutex<(RustConnection, Window)>> {
    static CONN: OnceLock<Option<Mutex<(RustConnection, Window)>>> = OnceLock::new();
    CONN.get_or_init(|| {
        let (conn, screen) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots.get(screen)?.root;
        Some(Mutex::new((conn, root)))
    })
    .as_ref()
}

/// Pointer position and button/modifier state, or None without X11.
pub fn pointer() -> Option<Pointer> {
    let guard = x11()?.lock().ok()?;
    let (conn, root) = &*guard;
    let r = conn.query_pointer(*root).ok()?.reply().ok()?;
    let has = |m: KeyButMask| r.mask.contains(m);
    Some(Pointer {
        x: r.root_x as f64,
        y: r.root_y as f64,
        left_down: has(KeyButMask::BUTTON1),
        shift: has(KeyButMask::SHIFT),
        alt: has(KeyButMask::MOD1),
    })
}

/// (alt, shift) right now.
pub fn modifiers() -> (bool, bool) {
    pointer().map(|p| (p.alt, p.shift)).unwrap_or((false, false))
}

/// GTK maps the window without asking for focus when it was built with `.focused(false)`.
pub fn show_without_focus(win: &WebviewWindow) {
    let _ = win.show();
}

/// Nothing extra on Linux (always-on-top and skip-taskbar come from the builder).
pub fn configure_overlay(_win: &WebviewWindow) {}
```

**File `src-tauri/src/platform/windows.rs`**

```rust
//! Windows: Win32 polling (no low-level hooks).

use tauri::WebviewWindow;
use windows_sys::Win32::Foundation::{HWND, POINT};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MENU, VK_RBUTTON, VK_SHIFT};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, ShowWindow, SM_SWAPBUTTON, SW_SHOWNOACTIVATE};

use super::Pointer;

fn down(vk: u16) -> bool {
    // High bit = the key is down now.
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

/// Physical cursor position (Tauri apps are per-monitor DPI aware) and button/modifier state.
pub fn pointer() -> Option<Pointer> {
    let mut p = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut p) } == 0 {
        return None;
    }
    // Left-handed users swap the buttons; the "primary" button is then VK_RBUTTON.
    let primary = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 { VK_RBUTTON } else { VK_LBUTTON };
    Some(Pointer { x: p.x as f64, y: p.y as f64, left_down: down(primary), shift: down(VK_SHIFT), alt: down(VK_MENU) })
}

/// (alt, shift) right now.
pub fn modifiers() -> (bool, bool) {
    (down(VK_MENU), down(VK_SHIFT))
}

/// Electron's `showInactive()`: show without activating, so Explorer keeps the drag.
pub fn show_without_focus(win: &WebviewWindow) {
    match win.hwnd() {
        Ok(h) => unsafe {
            ShowWindow(h.0 as HWND, SW_SHOWNOACTIVATE);
        },
        Err(_) => {
            let _ = win.show();
        }
    }
}

pub fn configure_overlay(_win: &WebviewWindow) {}
```

**File `src-tauri/src/platform/macos.rs`**

```rust
//! macOS: AppKit through objc2. The global drag wheel uses the Swift helper, so `pointer()` is not needed.

use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSWindow, NSWindowCollectionBehavior};
use tauri::WebviewWindow;

use super::Pointer;

/// NSPopUpMenuWindowLevel (= kCGPopUpMenuWindowLevel): above normal windows and the Dock, like Electron's 'pop-up-menu'.
const POP_UP_MENU_WINDOW_LEVEL: isize = 101;

pub fn pointer() -> Option<Pointer> {
    None
}

/// (alt, shift) right now. `+[NSEvent modifierFlags]` needs no permission.
pub fn modifiers() -> (bool, bool) {
    let f = NSEvent::modifierFlags_class();
    (f.contains(NSEventModifierFlags::Option), f.contains(NSEventModifierFlags::Shift))
}

fn with_ns_window(win: &WebviewWindow, f: impl FnOnce(&NSWindow) + Send + 'static) {
    let w = win.clone();
    let _ = win.run_on_main_thread(move || {
        if let Ok(ptr) = w.ns_window() {
            // SAFETY: Tauri returns a valid NSWindow pointer and we are on the main thread.
            let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
            f(ns);
        }
    });
}

/// Show above other apps without activating Alohamora (Electron's showInactive()).
pub fn show_without_focus(win: &WebviewWindow) {
    with_ns_window(win, |ns| ns.orderFrontRegardless());
}

/// Pop-up-menu level, on every Space and over full-screen apps.
pub fn configure_overlay(win: &WebviewWindow) {
    with_ns_window(win, |ns| {
        ns.setLevel(POP_UP_MENU_WINDOW_LEVEL);
        ns.setCollectionBehavior(NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::FullScreenAuxiliary);
    });
}
```

**Verify**
```bash
ls src-tauri/src/app_state.rs src-tauri/src/platform/mod.rs src-tauri/src/platform/linux.rs \
   src-tauri/src/platform/windows.rs src-tauri/src/platform/macos.rs
```

**Done when:** the five files exist.

## Task 8.3 — app: the `kfile` protocol

**Goal.** `<video>`, `<audio>` and `<img>` can load local files — but only files the back end has allowed.

`allow_file(path)` adds a file to an allow-list and returns its URL (`kfile://localhost/<encoded path>` on macOS/Linux,
`http://kfile.localhost/<encoded path>` on Windows, where WebView2 needs that form). `handle` serves only allowed files,
supports HTTP `Range` requests (needed for seeking in videos, at most 4 MiB per response) and answers everything else with
403/404. It runs file reads on a blocking thread.

**File `src-tauri/src/protocol.rs`**

```rust
//! The `kfile` URI scheme (port of protocol.ts `kfile://`): lets <video>/<audio>/<img> load local files the
//! backend has explicitly allowed, with HTTP Range support. Nothing else on disk is reachable.
//! URL form differs per OS (wry): Windows uses `http://kfile.localhost/<path>`, macOS/Linux `kfile://localhost/<path>`.

use std::collections::HashSet;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use alohamora_core::util::path_key;
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Runtime, UriSchemeContext, UriSchemeResponder};

/// Same characters as JavaScript's encodeURIComponent leaves alone.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'!').remove(b'~').remove(b'*').remove(b'\'').remove(b'(').remove(b')');

/// Largest body for one Range response; players ask again for the rest.
const MAX_CHUNK: u64 = 4 * 1024 * 1024;

fn allowed() -> &'static Mutex<HashSet<String>> {
    static A: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    A.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Allow the UI to load this file and return its URL.
pub fn allow_file(file: &Path) -> String {
    let abs = std::path::absolute(file).unwrap_or_else(|_| file.to_path_buf());
    allowed().lock().expect("kfile allow-list").insert(path_key(&abs));
    let encoded = utf8_percent_encode(&abs.to_string_lossy(), COMPONENT).to_string();
    if cfg!(windows) { format!("http://kfile.localhost/{encoded}") } else { format!("kfile://localhost/{encoded}") }
}

fn mime_for(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "ogg" | "opus" => "audio/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .expect("valid response")
}

/// "bytes=a-b" / "bytes=a-" / "bytes=-n" → inclusive (start, end), or None when unsatisfiable.
pub fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let spec = value.trim().strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (start, end) = match (a.trim(), b.trim()) {
        ("", "") => return None,
        ("", n) => {
            let n: u64 = n.parse().ok()?;
            (size.saturating_sub(n), size.saturating_sub(1))
        }
        (s, "") => (s.parse().ok()?, size.saturating_sub(1)),
        (s, e) => (s.parse().ok()?, e.parse::<u64>().ok()?.min(size.saturating_sub(1))),
    };
    if size == 0 || start > end || start >= size { None } else { Some((start, end)) }
}

fn read_range(p: &Path, start: u64, len: u64) -> std::io::Result<Vec<u8>> {
    let mut f = std::fs::File::open(p)?;
    f.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::with_capacity(len as usize);
    f.take(len).read_to_end(&mut buf)?;
    Ok(buf)
}

fn respond(req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let cors = |b: tauri::http::response::Builder| {
        b.header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Range, Accept-Ranges, Content-Length")
    };
    if req.method() == tauri::http::Method::OPTIONS {
        return cors(Response::builder().status(StatusCode::NO_CONTENT))
            .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
            .body(Vec::new())
            .expect("valid response");
    }
    let raw = req.uri().path().trim_start_matches('/');
    let decoded = percent_decode_str(raw).decode_utf8_lossy().to_string();
    let file = PathBuf::from(decoded);
    if !allowed().lock().expect("kfile allow-list").contains(&path_key(&file)) {
        return status(StatusCode::FORBIDDEN);
    }
    let Ok(meta) = std::fs::metadata(&file) else { return status(StatusCode::NOT_FOUND) };
    let size = meta.len();
    let mime = mime_for(&file);
    if let Some(range) = req.headers().get(header::RANGE).and_then(|v| v.to_str().ok()) {
        let Some((start, end)) = parse_range(range, size) else {
            return cors(Response::builder().status(StatusCode::RANGE_NOT_SATISFIABLE))
                .header(header::CONTENT_RANGE, format!("bytes */{size}"))
                .body(Vec::new())
                .expect("valid response");
        };
        let end = end.min(start + MAX_CHUNK - 1);
        let Ok(body) = read_range(&file, start, end - start + 1) else { return status(StatusCode::NOT_FOUND) };
        return cors(Response::builder().status(StatusCode::PARTIAL_CONTENT))
            .header(header::CONTENT_TYPE, mime)
            .header(header::CONTENT_LENGTH, body.len().to_string())
            .header(header::CONTENT_RANGE, format!("bytes {start}-{}/{size}", start + body.len() as u64 - 1))
            .header(header::ACCEPT_RANGES, "bytes")
            .body(body)
            .expect("valid response");
    }
    let Ok(body) = std::fs::read(&file) else { return status(StatusCode::NOT_FOUND) };
    cors(Response::builder().status(StatusCode::OK))
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, size.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(body)
        .expect("valid response")
}

/// Registered with `register_asynchronous_uri_scheme_protocol("kfile", handle)`. File I/O runs off the UI thread.
pub fn handle<R: Runtime>(_ctx: UriSchemeContext<'_, R>, req: Request<Vec<u8>>, responder: UriSchemeResponder) {
    tauri::async_runtime::spawn_blocking(move || responder.respond(respond(&req)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=10-19", 100), Some((10, 19)));
        assert_eq!(parse_range("bytes=-10", 100), Some((90, 99)));
        assert_eq!(parse_range("bytes=50-500", 100), Some((50, 99)));
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=5-1", 100), None);
        assert_eq!(parse_range("items=0-1", 100), None);
    }

    #[test]
    fn urls_are_encoded() {
        let url = allow_file(Path::new("/tmp/a b#c.mp4"));
        assert!(url.ends_with("%2Ftmp%2Fa%20b%23c.mp4"), "{url}");
    }
}
```

**Verify**
```bash
test -f src-tauri/src/protocol.rs
```

**Done when:** the file exists.

## Task 8.4 — app: windows

**Goal.** The main window and the overlay (the transparent wheel), created in code.

- `windows/mod.rs`: `WEBVIEW2_ARGS` (Windows web view switches that turn off SmartScreen, component updates, pings and
  other background traffic — part of the offline guarantee), and the window event handler: closing the main window hides
  it when the tray is active; native file drops are forwarded **to that window only** as `ev:drop`.
- `windows/main_window.rs`: 1000 × 720 (minimum 760 × 560), created hidden and shown when the UI reports ready; macOS
  overlay title bar with the traffic lights at (16, 15); Windows without native frame (the UI draws the buttons).
- `windows/overlay.rs`: 440 × 500, transparent, no frame, no shadow, always on top, not in the task bar, on every
  workspace. It is created hidden at start-up and kept loaded, so it opens instantly. `open` places it near the pointer
  (inside the work area of that screen), sends `ev:overlay-init` with the quick file info, shows it, then sends
  `ev:overlay-files` with the full info. The drag functions drive the global drag wheel.

**File `src-tauri/src/windows/mod.rs`**

```rust
//! The two windows: `main` (the app) and `overlay` (the transparent wheel). Both load index.html;
//! the UI picks its view from the window label.

pub mod main_window;
pub mod overlay;

use tauri::{Emitter, Manager, Window, WindowEvent};

use crate::platform;

/// WebView2 (Windows) only — ignored elsewhere: wry's defaults (no SmartScreen, no Office/PDF UI) plus no
/// background networking (component updates, pings, reliability reports). The app never talks to the network.
pub const WEBVIEW2_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-networking --disable-component-update --no-pings --disable-domain-reliability";

/// Payload of `ev:drop` (native file drag-and-drop on a window). x/y are CSS pixels inside the window.
#[derive(Clone, serde::Serialize)]
pub struct DropEvent {
    pub phase: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paths: Option<Vec<String>>,
    pub x: f64,
    pub y: f64,
    pub alt: bool,
    pub shift: bool,
}

fn drop_event(phase: &'static str, paths: Option<&Vec<std::path::PathBuf>>, pos: Option<tauri::PhysicalPosition<f64>>, scale: f64) -> DropEvent {
    let (alt, shift) = platform::modifiers();
    let (x, y) = pos.map(|p| (p.x / scale, p.y / scale)).unwrap_or((0.0, 0.0));
    DropEvent { phase, paths: paths.map(|v| v.iter().map(|p| p.to_string_lossy().to_string()).collect()), x, y, alt, shift }
}

/// Builder-level window event hook (`Builder::on_window_event`).
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } if window.label() == main_window::LABEL => {
            if main_window::close_should_hide(window.app_handle()) {
                api.prevent_close();
                let _ = window.hide();
            } else {
                crate::quit(window.app_handle());
            }
        }
        WindowEvent::DragDrop(dd) => {
            let scale = window.scale_factor().unwrap_or(1.0);
            let payload = match dd {
                tauri::DragDropEvent::Enter { paths, position } => drop_event("enter", Some(paths), Some(*position), scale),
                tauri::DragDropEvent::Over { position } => drop_event("over", None, Some(*position), scale),
                tauri::DragDropEvent::Drop { paths, position } => drop_event("drop", Some(paths), Some(*position), scale),
                tauri::DragDropEvent::Leave => drop_event("leave", None, None, scale),
                _ => return,
            };
            let _ = window.emit_to(window.label(), "ev:drop", payload);
        }
        _ => {}
    }
}
```

**File `src-tauri/src/windows/main_window.rs`**

```rust
//! Port of windows/mainWindow.ts.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::app_state;

pub const LABEL: &str = "main";

/// Show the window when its UI reports ready (avoids a white flash).
static SHOW_ON_READY: AtomicBool = AtomicBool::new(false);

const DARK_BG: Color = Color(0x16, 0x16, 0x17, 0xff);
const LIGHT_BG: Color = Color(0xf3, 0xf3, 0xf2, 0xff);

pub fn create(app: &AppHandle, show_when_ready: bool) -> tauri::Result<WebviewWindow> {
    SHOW_ON_READY.store(show_when_ready, Ordering::SeqCst);
    app_state::clear_ready(LABEL);
    #[allow(unused_mut)]
    let mut b = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Alohamora")
        .inner_size(1000.0, 720.0)
        .min_inner_size(760.0, 560.0)
        .visible(false)
        .additional_browser_args(super::WEBVIEW2_ARGS);
    #[cfg(target_os = "macos")]
    {
        // Traffic lights inside our 44 px header.
        b = b
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 15.0));
    }
    #[cfg(windows)]
    {
        // No native caption bar; the UI draws minimise/maximise/close (CaptionButtons.tsx).
        b = b.decorations(false);
    }
    let win = b.build()?;
    let dark = win.theme().map(|t| t == Theme::Dark).unwrap_or(false);
    let _ = win.set_background_color(Some(if dark { DARK_BG } else { LIGHT_BG }));
    Ok(win)
}

/// Show (re-creating it if it was destroyed) and focus.
pub fn show(app: &AppHandle) {
    match app.get_webview_window(LABEL) {
        Some(w) => {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
        None => {
            if let Err(e) = create(app, true) {
                log::error!("could not create the main window: {e}");
            }
        }
    }
}

/// Called from `ui_ready` for the main window.
pub fn on_ui_ready(app: &AppHandle) {
    if SHOW_ON_READY.swap(false, Ordering::SeqCst) {
        show(app);
    }
}

/// Close button: macOS always hides; elsewhere hide when "close to tray" is on and a tray exists, else quit.
pub fn close_should_hide(_app: &AppHandle) -> bool {
    if app_state::is_quitting() {
        return false;
    }
    cfg!(target_os = "macos") || (alohamora_engine::settings::get().close_to_tray && app_state::is_tray_active())
}

pub fn is_focused(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).and_then(|w| w.is_focused().ok()).unwrap_or(false)
}
```

**File `src-tauri/src/windows/overlay.rs`**

```rust
//! Port of windows/overlayWindow.ts: the transparent wheel window, kept loaded and hidden.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use alohamora_core::types::{DragState, FileInfo, OverlayInit, OverlaySize, WheelMode, WHEEL_STAGE_ANCHOR_X, WHEEL_STAGE_ANCHOR_Y, WHEEL_STAGE_HEIGHT, WHEEL_STAGE_WIDTH};
use alohamora_engine::{capabilities, inspect::inspect_files};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{app_state, platform};

pub const LABEL: &str = "overlay";

/// Where the wheel centre goes, in PHYSICAL screen pixels.
static ANCHOR: Mutex<(f64, f64)> = Mutex::new((0.0, 0.0));
static DROP_RECEIVED: AtomicBool = AtomicBool::new(false);
/// Bumped to cancel a pending "hide after drag end".
static HIDE_GENERATION: AtomicU64 = AtomicU64::new(0);

fn wheel_size() -> OverlaySize {
    OverlaySize { width: WHEEL_STAGE_WIDTH, height: WHEEL_STAGE_HEIGHT, anchor: "wheel".into() }
}

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Alohamora")
        .inner_size(WHEEL_STAGE_WIDTH, WHEEL_STAGE_HEIGHT)
        .visible(false)
        .focused(false)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(false)
        .visible_on_all_workspaces(true)
        .additional_browser_args(super::WEBVIEW2_ARGS)
        .build()?;
    platform::configure_overlay(&win);
    Ok(win)
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Port of place(): wheel centre (or window centre) at the anchor, clamped to that monitor's work area.
/// Tauri reports monitors in physical pixels; the stage size is in logical pixels, so scale by the monitor.
pub fn place(app: &AppHandle, size: &OverlaySize) {
    let Some(win) = window(app) else { return };
    let (ax, ay) = *ANCHOR.lock().expect("anchor");
    let monitor = app.monitor_from_point(ax, ay).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let s = m.scale_factor();
    let wa = m.work_area();
    let (wx, wy, ww, wh) = (wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64);
    let width = (size.width * s).min(ww);
    let height = (size.height * s).min(wh);
    let (mut x, mut y) = if size.anchor == "wheel" {
        (ax - WHEEL_STAGE_ANCHOR_X * s, ay - WHEEL_STAGE_ANCHOR_Y * s)
    } else {
        (ax - (width / 2.0).round(), ay - (height / 2.0).round())
    };
    x = x.min(wx + ww - width).max(wx);
    y = y.min(wy + wh - height).max(wy);
    let _ = win.set_size(PhysicalSize::new(width.round() as u32, height.round() as u32));
    let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

fn set_anchor(p: (f64, f64)) {
    *ANCHOR.lock().expect("anchor") = p;
}

/// Show the wheel for these files. Runs on a worker thread (inspection reads the files).
pub fn open(app: &AppHandle, paths: &[String], mode: WheelMode, source: &str, at: Option<(f64, f64)>) {
    if window(app).is_none() && create(app).is_err() {
        return;
    }
    // Events sent before the overlay page listens would be lost.
    app_state::wait_ready(LABEL, Duration::from_secs(10));
    let basic = inspect_files(paths, false);
    let Some(win) = window(app) else { return };
    if basic.is_empty() {
        return;
    }
    let cursor = app.cursor_position().map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
    set_anchor(at.unwrap_or(cursor));
    place(app, &wheel_size());
    let init = OverlayInit { files: basic.clone(), mode, caps: capabilities::get(), source: source.into() };
    let _ = app.emit_to(LABEL, "ev:overlay-init", init);
    let _ = win.show();
    let _ = win.set_focus();
    let deep = inspect_files(&basic.iter().map(|f| f.path.clone()).collect::<Vec<_>>(), true);
    let _ = app.emit_to(LABEL, "ev:overlay-files", deep);
}

pub fn resize(app: &AppHandle, size: &OverlaySize) {
    place(app, size);
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = window(app) {
        let _ = w.hide();
    }
}

pub fn is_visible(app: &AppHandle) -> bool {
    window(app).and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

/// Global drag started (Shift held while dragging files). `files` is known on macOS (helper) and after `Enter`.
pub fn drag_start(app: &AppHandle, mode: WheelMode, at: (f64, f64), files: Option<Vec<FileInfo>>) {
    let Some(win) = window(app) else { return };
    DROP_RECEIVED.store(false, Ordering::SeqCst);
    HIDE_GENERATION.fetch_add(1, Ordering::SeqCst);
    set_anchor(at);
    place(app, &wheel_size());
    let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: true, mode, files });
    platform::show_without_focus(&win); // do not steal focus from Explorer/Finder mid-drag
}

pub fn drag_files(app: &AppHandle, mode: WheelMode, files: Vec<FileInfo>) {
    let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: true, mode, files: Some(files) });
}

pub fn drag_mode(app: &AppHandle, mode: WheelMode) {
    let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: true, mode, files: None });
}

/// Mouse released. The drop event can arrive a little later, so wait 600 ms before hiding.
pub fn drag_end(app: &AppHandle) {
    let generation = HIDE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        if HIDE_GENERATION.load(Ordering::SeqCst) == generation && !DROP_RECEIVED.load(Ordering::SeqCst) {
            let _ = app.emit_to(LABEL, "ev:overlay-drag", DragState { active: false, mode: WheelMode::Convert, files: None });
            hide(&app);
        }
    });
}

/// Files were dropped on the wheel: keep it open, focus it, return full file info.
pub fn dropped(app: &AppHandle, paths: &[String]) -> Vec<FileInfo> {
    DROP_RECEIVED.store(true, Ordering::SeqCst);
    HIDE_GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(w) = window(app) {
        let _ = w.set_focus();
    }
    inspect_files(paths, true)
}
```

**Verify**
```bash
ls src-tauri/src/windows/mod.rs src-tauri/src/windows/main_window.rs src-tauri/src/windows/overlay.rs
```

**Done when:** the three files exist.

## Task 8.5 — app: commands

**Goal.** Every call the UI makes (Appendix A lists them all).

Rules followed by every command:
- Paths given to `reveal`, `open_path`, the preview commands, `pdf_thumbnails` and `read_metadata` must exist.
- Blocking work runs in `blocking(...)` on Tauri's blocking thread pool, never on the main thread.
- Errors reach the UI as `{ message }` with the user-facing sentence (`CmdError`), so `api.ts` can throw a normal
  `Error`.
- File dialogs are attached to the window that asked (`set_parent`).

**File `src-tauri/src/commands.rs`**

```rust
//! Every `invoke` the UI can make (port of ipc.ts, previews.ts, imagePreview.ts, metadata.ts handlers).
//! Rules: validate inputs, run blocking work on a worker thread, return errors as `{ message }`.

use std::path::{Path, PathBuf};

use alohamora_core::error::to_user_message;
use alohamora_core::types::{Capabilities, FileInfo, ImagePreviewRequest, ImagePreviewResult, JobRequest, JobUpdate, MetadataInfo, OverlaySize, Settings, WheelMode};
use alohamora_engine::{capabilities, image_preview, inspect, jobs, metadata, paths, pdf, previews, settings, AppError};
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::windows::{main_window, overlay};

/// What a rejected `invoke` promise carries.
#[derive(Debug, Serialize)]
pub struct CmdError {
    pub message: String,
}

impl From<AppError> for CmdError {
    fn from(e: AppError) -> Self {
        CmdError { message: to_user_message(&e).message }
    }
}

impl From<String> for CmdError {
    fn from(message: String) -> Self {
        CmdError { message }
    }
}

type CmdResult<T> = Result<T, CmdError>;

/// Run blocking engine work off the async runtime threads.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> CmdResult<T> + Send + 'static) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| CmdError { message: e.to_string() })?
}

fn existing(p: &str) -> CmdResult<PathBuf> {
    let path = PathBuf::from(p);
    if path.exists() { Ok(path) } else { Err("Path does not exist".to_string().into()) }
}

#[tauri::command]
pub fn get_capabilities() -> Capabilities {
    capabilities::get()
}

#[tauri::command]
pub fn get_settings() -> Settings {
    settings::get()
}

/// Sanitize, save atomically, then listeners apply integrations and emit `ev:settings`.
#[tauri::command]
pub async fn set_settings(patch: serde_json::Value) -> CmdResult<Settings> {
    blocking(move || Ok(settings::update(&patch)?)).await
}

#[tauri::command]
pub async fn pick_files(window: WebviewWindow) -> CmdResult<Vec<String>> {
    let app = window.app_handle().clone();
    blocking(move || {
        let picked = app.dialog().file().set_parent(&window).blocking_pick_files();
        Ok(picked.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok()).map(|p| paths::p2s(&p)).collect())
    })
    .await
}

#[tauri::command]
pub async fn pick_folder(window: WebviewWindow) -> CmdResult<Option<String>> {
    let app = window.app_handle().clone();
    blocking(move || Ok(app.dialog().file().set_parent(&window).blocking_pick_folder().and_then(|f| f.into_path().ok()).map(|p| paths::p2s(&p)))).await
}

#[tauri::command]
pub async fn inspect_files(paths: Vec<String>, deep: bool) -> CmdResult<Vec<FileInfo>> {
    blocking(move || Ok(inspect::inspect_files(&paths, deep))).await
}

#[tauri::command]
pub fn start_job(req: JobRequest) -> String {
    jobs::queue::get().enqueue(req)
}

#[tauri::command]
pub fn cancel_job(id: String) {
    jobs::queue::get().cancel(&id);
}

#[tauri::command]
pub fn list_jobs() -> Vec<JobUpdate> {
    jobs::queue::get().list()
}

#[tauri::command]
pub fn reveal(app: AppHandle, path: String) -> CmdResult<()> {
    let p = existing(&path)?;
    app.opener().reveal_item_in_dir(p).map_err(|e| CmdError { message: e.to_string() })
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> CmdResult<()> {
    existing(&path)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| CmdError { message: e.to_string() })
}

#[tauri::command]
pub fn open_notices(app: AppHandle) -> CmdResult<()> {
    app.opener().open_path(paths::p2s(&paths::notices()), None::<&str>).map_err(|e| CmdError { message: e.to_string() })
}

#[tauri::command]
pub async fn open_overlay(app: AppHandle, paths: Vec<String>, mode: WheelMode) -> CmdResult<()> {
    blocking(move || {
        overlay::open(&app, &paths, mode, "window", None);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn close_overlay(app: AppHandle) {
    overlay::hide(&app);
}

#[tauri::command]
pub fn resize_overlay(app: AppHandle, size: OverlaySize) {
    overlay::resize(&app, &size);
}

#[tauri::command]
pub async fn overlay_dropped(app: AppHandle, paths: Vec<String>) -> CmdResult<Vec<FileInfo>> {
    blocking(move || Ok(overlay::dropped(&app, &paths))).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUrl {
    pub url: String,
    pub is_proxy: bool,
}

#[tauri::command]
pub async fn preview_media(path: String) -> CmdResult<MediaUrl> {
    blocking(move || {
        let (file, is_proxy) = previews::media_source(&existing(&path)?)?;
        Ok(MediaUrl { url: crate::protocol::allow_file(&file), is_proxy })
    })
    .await
}

#[tauri::command]
pub async fn preview_frame(path: String, time_sec: f64, max_width: f64) -> CmdResult<String> {
    let w = if max_width > 0.0 { max_width as u32 } else { 640 };
    blocking(move || Ok(previews::frame(&existing(&path)?, time_sec.max(0.0), w)?)).await
}

#[tauri::command]
pub async fn preview_waveform(path: String, width: f64, height: f64) -> CmdResult<String> {
    let (w, h) = (if width > 0.0 { width } else { 800.0 }, if height > 0.0 { height } else { 120.0 });
    blocking(move || Ok(previews::waveform(&existing(&path)?, w, h)?)).await
}

#[tauri::command]
pub async fn preview_image(req: ImagePreviewRequest) -> CmdResult<ImagePreviewResult> {
    blocking(move || Ok(image_preview::preview_image(&req)?)).await
}

#[tauri::command]
pub async fn pdf_thumbnails(path: String, max_width: f64) -> CmdResult<Vec<String>> {
    let w = if max_width > 0.0 { max_width as u32 } else { 160 };
    blocking(move || Ok(pdf::thumbnails(&existing(&path)?, w, None)?)).await
}

#[tauri::command]
pub async fn read_metadata(path: String) -> CmdResult<MetadataInfo> {
    blocking(move || Ok(metadata::read_metadata(Path::new(&existing(&path)?))?)).await
}

/// The window's UI is mounted and listening: show the main window, release waiting overlay events.
#[tauri::command]
pub fn ui_ready(window: WebviewWindow) {
    log::info!("UI ready: {}", window.label());
    crate::app_state::mark_ready(window.label());
    if window.label() == main_window::LABEL {
        main_window::on_ui_ready(window.app_handle());
    }
}
```

**Verify**
```bash
test -f src-tauri/src/commands.rs
```

**Done when:** the file exists.

## Task 8.6 — app: argv, tray, notifications

**Goal.** Files given at start-up, the tray icon and the "done" notification.

- `argv.rs`: file paths on the command line (also from a **second launch**, which the single-instance plugin forwards
  together with that launch's working folder, and from macOS "Open With"). Paths arriving within 350 ms are collected
  into one batch and opened in the wheel. Paths that arrive before the app is ready are kept until `mark_started`.
- `tray.rs`: tray icon with "Open Alohamora" and "Quit Alohamora" (macOS: menu-bar icon as a template image), and the
  macOS application menu (so ⌘C/⌘V/⌘Q and ⌘, work).
- `notify.rs`: when a job finishes: reveal the output if "Reveal when done" is on; show a notification (if
  "Notify when done" is on) unless the overlay is visible or the main window has focus. Clicking the notification does
  nothing (the plugin reports no clicks on desktop; Appendix F).

**File `src-tauri/src/argv.rs`**

```rust
//! Port of integrations/argv.ts: files passed on the command line, by a second instance, or by macOS "Open With".

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use alohamora_core::types::WheelMode;
use alohamora_core::util::path_key;
use tauri::AppHandle;

use crate::windows::{main_window, overlay};

static PENDING: Mutex<Vec<String>> = Mutex::new(Vec::new());
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// Files that arrive before setup has finished wait here (macOS can send Opened before the app is ready).
static STARTED: AtomicBool = AtomicBool::new(false);

/// Existing file/folder paths from argv. Ignores flags, macOS `-psn_…`, the executable itself.
/// Relative paths are resolved against `cwd` (the second instance's working folder).
pub fn files_from_argv(argv: &[String], cwd: &Path) -> Vec<String> {
    let exe = std::env::current_exe().map(|p| path_key(&p)).unwrap_or_default();
    argv.iter()
        .skip(1)
        .filter(|a| !a.is_empty() && !a.starts_with('-') && !a.starts_with("psn_"))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| path_key(p) != exe && p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

fn open_batch(app: &AppHandle, batch: Vec<String>) {
    let app = app.clone();
    std::thread::spawn(move || overlay::open(&app, &batch, WheelMode::Convert, "argv", None));
}

/// Explorer may start one process per selected file: batch everything that arrives within 350 ms.
pub fn queue_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    PENDING.lock().expect("pending").extend(files);
    if !STARTED.load(Ordering::SeqCst) {
        return; // flushed by `mark_started`
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(350));
        if GENERATION.load(Ordering::SeqCst) != generation {
            return; // a newer arrival restarted the timer
        }
        let mut batch: Vec<String> = std::mem::take(&mut *PENDING.lock().expect("pending"));
        let mut seen = std::collections::HashSet::new();
        batch.retain(|p| seen.insert(p.clone()));
        if !batch.is_empty() {
            open_batch(&app, batch);
        }
    });
}

/// Setup finished: open whatever arrived early.
pub fn mark_started(app: &AppHandle) {
    STARTED.store(true, Ordering::SeqCst);
    let early: Vec<String> = std::mem::take(&mut *PENDING.lock().expect("pending"));
    queue_files(app, early);
}

/// `tauri-plugin-single-instance` callback: a second launch passes its argv and cwd here.
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let files = files_from_argv(&argv, Path::new(&cwd));
    if files.is_empty() {
        main_window::show(app);
    } else {
        queue_files(app, files);
    }
}

/// macOS `RunEvent::Opened`: Finder "Open With", Dock drops, `open -a Alohamora file`.
#[allow(dead_code)] // only used on macOS
pub fn on_opened_urls(app: &AppHandle, urls: &[tauri::Url]) {
    let files: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().to_string()).collect();
    queue_files(app, files);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argv_filtering() {
        let dir = std::env::temp_dir();
        let f = dir.join("alohamora-argv-test.txt");
        std::fs::write(&f, "x").unwrap();
        let argv = vec!["app".to_string(), "--hidden".into(), "-psn_0_1".into(), "alohamora-argv-test.txt".into(), "missing.txt".into()];
        let got = files_from_argv(&argv, &dir);
        assert_eq!(got, vec![f.to_string_lossy().to_string()]);
        let _ = std::fs::remove_file(f);
    }
}
```

**File `src-tauri/src/tray.rs`**

```rust
//! Port of integrations/tray.ts + appMenu.ts. Windows/Linux: system tray. macOS: menu-bar icon (template image)
//! plus the application menu (App, Edit, Window) so ⌘C/⌘V/⌘Q work.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter};

use crate::app_state;
use crate::windows::main_window;

/// macOS: a template image (black + alpha) that the system tints for light/dark menu bars.
#[cfg(target_os = "macos")]
const TRAY_ICON: &[u8] = include_bytes!("../icons/trayTemplate@2x.png");
/// Windows/Linux: a normal colour icon.
#[cfg(not(target_os = "macos"))]
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "tray-open", "Open Alohamora", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quit Alohamora", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(TRAY_ICON)?)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Alohamora — drop files to convert")
        .menu(&menu)
        // macOS convention: a click opens the menu. Windows: left click opens the window. Linux: menu only (no click events).
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => main_window::show(app),
            "tray-quit" => crate::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if !cfg!(target_os = "macos") {
                    main_window::show(tray.app_handle());
                }
            }
        })
        .build(app)?;
    app_state::set_tray_active(true);
    Ok(())
}

/// macOS application menu. Windows/Linux have no menu bar.
pub fn install_app_menu(app: &AppHandle) -> tauri::Result<()> {
    if !cfg!(target_os = "macos") {
        return Ok(());
    }
    use tauri::menu::{AboutMetadata, SubmenuBuilder};
    let settings = MenuItem::with_id(app, "app-settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let app_menu = SubmenuBuilder::new(app, "Alohamora")
        .item(&PredefinedMenuItem::about(app, None, Some(AboutMetadata::default()))?)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit").undo().redo().separator().cut().copy().paste().select_all().build()?;
    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().separator().close_window().build()?;
    app.set_menu(Menu::with_items(app, &[&app_menu, &edit, &window])?)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "app-settings" {
            main_window::show(app);
            let _ = app.emit_to(main_window::LABEL, "ev:navigate", "settings");
        }
    });
    Ok(())
}

/// macOS only: hide/show the Dock icon (menu-bar-only mode).
pub fn set_dock_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_dock_visibility(visible);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
}
```

**File `src-tauri/src/notify.rs`**

```rust
//! Port of notify.ts. Desktop notifications cannot report clicks in tauri-plugin-notification, so
//! "click to reveal" from the Electron build is gone (documented gap); "reveal when done" still works.

use alohamora_core::types::{JobStatus, JobUpdate};
use alohamora_core::util::base_name;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

use crate::windows::{main_window, overlay};

pub fn job_finished(app: &AppHandle, u: &JobUpdate) {
    let s = alohamora_engine::settings::get();
    if u.status == JobStatus::Done && s.reveal_when_done {
        if let Some(first) = u.outputs.first() {
            let _ = app.opener().reveal_item_in_dir(first);
        }
    }
    if !s.notify_when_done || !matches!(u.status, JobStatus::Done | JobStatus::Error) {
        return;
    }
    if overlay::is_visible(app) || main_window::is_focused(app) {
        return; // the user is already looking
    }
    let (title, body) = if u.status == JobStatus::Done {
        let what = if u.outputs.len() == 1 { base_name(&u.outputs[0]) } else { format!("{} files saved", u.outputs.len()) };
        let note = u.note.as_deref().map(|n| format!(" · {n}")).unwrap_or_default();
        (format!("{} — done", u.label), format!("{what}{note}"))
    } else {
        (format!("{} failed", u.label), u.error.clone().unwrap_or_else(|| "Something went wrong".into()))
    };
    let _ = app.notification().builder().title(title).body(body).show();
}
```

**Verify**
```bash
ls src-tauri/src/argv.rs src-tauri/src/tray.rs src-tauri/src/notify.rs
```

**Done when:** the three files exist.

## Task 8.7 — app: OS integrations

**Goal.** The optional integrations from the Settings page, switched on and off when settings change.

| File | What |
|---|---|
| `integrations/mod.rs` | `apply(app, settings, previous)`: start/stop each integration when its setting changes; launch at login |
| `integrations/windows.rs` | "Send to → Alohamora" shortcut (COM `IShellLinkW`) and the Explorer right-click verb (`HKCU\Software\Classes\*\shell\Alohamora`, written with the registry API) |
| `integrations/linux.rs` | Nautilus script, Dolphin service menu, autostart `.desktop` file |
| `integrations/global_drag.rs` | Global drag wheel on Windows and Linux X11: a 60 Hz pointer poller (no global hooks) |
| `integrations/mac_helper.rs` | Global drag wheel on macOS: runs the Swift helper sidecar and reads its JSON lines |
| `integrations/legacy.rs` | First start: copy `settings.json` from the Electron build's folder if the new one does not exist |

**File `src-tauri/src/integrations/mod.rs`**

```rust
//! Port of integrations/index.ts: turn OS integrations on/off when settings change.

pub mod global_drag;
pub mod legacy;
pub mod linux;
pub mod mac_helper;
pub mod windows;

use alohamora_core::types::Settings;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// At start-up (`prev` None) only turn ON what is enabled; afterwards apply what changed.
pub fn apply(app: &AppHandle, s: &Settings, prev: Option<&Settings>) {
    let changed = |now: bool, before: Option<bool>| match before {
        Some(b) => now != b,
        None => now,
    };
    if cfg!(windows) && changed(s.send_to_menu, prev.map(|p| p.send_to_menu)) {
        log_err("Send To", windows::set_send_to(s.send_to_menu));
    }
    if changed(s.context_menu, prev.map(|p| p.context_menu)) {
        if cfg!(windows) {
            log_err("context menu", windows::set_context_menu(s.context_menu));
        }
        if cfg!(target_os = "linux") {
            log_err("file manager menus", linux::set_file_manager_menus(s.context_menu));
        }
    }
    if changed(s.launch_at_login, prev.map(|p| p.launch_at_login)) {
        set_login_item(app, s.launch_at_login);
    }
    if cfg!(target_os = "macos") && prev.map(|p| p.show_in_dock != s.show_in_dock).unwrap_or(true) {
        crate::tray::set_dock_visible(app, s.show_in_dock);
    }
    if changed(s.global_drag_wheel, prev.map(|p| p.global_drag_wheel)) {
        match alohamora_engine::capabilities::get().global_drag.as_str() {
            "mac-helper" => if s.global_drag_wheel { mac_helper::start(app) } else { mac_helper::stop() },
            "hook" => if s.global_drag_wheel { global_drag::start(app) } else { global_drag::stop() },
            _ => {}
        }
    }
}

fn log_err(what: &str, r: std::io::Result<()>) {
    if let Err(e) = r {
        log::warn!("{what}: {e}");
    }
}

/// Windows/macOS: tauri-plugin-autostart (starts with --hidden). Linux: our own autostart .desktop file.
fn set_login_item(app: &AppHandle, enabled: bool) {
    if cfg!(target_os = "linux") {
        log_err("autostart", linux::set_autostart(enabled));
        return;
    }
    let al = app.autolaunch();
    let r = if enabled { al.enable() } else { al.disable() };
    if let Err(e) = r {
        log::warn!("launch at login: {e}");
    }
}
```

**File `src-tauri/src/integrations/windows.rs`**

```rust
//! Windows: "Send to" shortcut and the Explorer right-click verb (ports of sendTo.ts and contextMenu.ts).
//! No reg.exe or PowerShell: the registry and COM are used directly. Stubs on other OSes.

use std::io;

#[cfg(windows)]
fn send_to_lnk() -> io::Result<std::path::PathBuf> {
    let appdata = std::env::var_os("APPDATA").ok_or_else(|| io::Error::other("APPDATA is not set"))?;
    Ok(std::path::PathBuf::from(appdata).join("Microsoft\\Windows\\SendTo\\Alohamora.lnk"))
}

/// %APPDATA%\Microsoft\Windows\SendTo\Alohamora.lnk → this executable.
#[cfg(windows)]
pub fn set_send_to(enabled: bool) -> io::Result<()> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    let lnk = send_to_lnk()?;
    if !enabled {
        let _ = std::fs::remove_file(&lnk);
        return Ok(());
    }
    let exe = std::env::current_exe()?;
    let err = |e: windows::core::Error| io::Error::other(e.to_string());
    unsafe {
        // S_FALSE (already initialised) is fine; a different apartment mode still lets us create the object.
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(err)?;
        link.SetPath(&HSTRING::from(exe.as_os_str())).map_err(err)?;
        link.SetDescription(&HSTRING::from("Convert with Alohamora")).map_err(err)?;
        link.SetIconLocation(&HSTRING::from(exe.as_os_str()), 0).map_err(err)?;
        let file: IPersistFile = link.cast().map_err(err)?;
        file.Save(&HSTRING::from(lnk.as_os_str()), true).map_err(err)?;
    }
    Ok(())
}

const VERB_KEY: &str = "Software\\Classes\\*\\shell\\Alohamora";

/// HKCU\Software\Classes\*\shell\Alohamora: "Convert with Alohamora" on every file.
#[cfg(windows)]
pub fn set_context_menu(enabled: bool) -> io::Result<()> {
    use windows_registry::CURRENT_USER;
    let err = |e: windows_result::Error| io::Error::other(e.to_string());
    if !enabled {
        let _ = CURRENT_USER.remove_tree(VERB_KEY);
        return Ok(());
    }
    let exe = std::env::current_exe()?.to_string_lossy().to_string();
    let key = CURRENT_USER.create(VERB_KEY).map_err(err)?;
    key.set_string("", "Convert with Alohamora").map_err(err)?;
    key.set_string("Icon", &exe).map_err(err)?;
    key.set_string("MultiSelectModel", "Player").map_err(err)?;
    let cmd = CURRENT_USER.create(format!("{VERB_KEY}\\command")).map_err(err)?;
    cmd.set_string("", &format!("\"{exe}\" \"%1\"")).map_err(err)?;
    Ok(())
}

#[cfg(not(windows))]
pub fn set_send_to(_enabled: bool) -> io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub fn set_context_menu(_enabled: bool) -> io::Result<()> {
    let _ = VERB_KEY;
    Ok(())
}
```

**File `src-tauri/src/integrations/linux.rs`**

```rust
//! Linux: Nautilus script, Dolphin service menu and autostart entry (ports of linuxFileManagers.ts and loginItem.ts).
//! The functions exist on every OS so callers need no cfg; they are only called on Linux.

use std::io;
use std::path::PathBuf;

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// The command that starts this app: the AppImage when running as one, otherwise this executable.
pub fn self_command() -> String {
    std::env::var("APPIMAGE")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default())
}

#[cfg(unix)]
fn write_executable(path: &PathBuf, text: &str) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(path.parent().unwrap_or(path))?;
    std::fs::write(path, text)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
}

#[cfg(not(unix))]
fn write_executable(path: &PathBuf, text: &str) -> io::Result<()> {
    std::fs::write(path, text)
}

/// Settings → "File manager menu" (reuses settings.contextMenu on Linux).
pub fn set_file_manager_menus(enabled: bool) -> io::Result<()> {
    let nautilus = home().join(".local/share/nautilus/scripts/Convert with Alohamora");
    let dolphin = home().join(".local/share/kio/servicemenus/alohamora.desktop");
    if !enabled {
        let _ = std::fs::remove_file(&nautilus);
        let _ = std::fs::remove_file(&dolphin);
        return Ok(());
    }
    let cmd = format!("\"{}\"", self_command());
    // Nautilus (GNOME Files): Scripts submenu; selected files are passed as arguments.
    write_executable(&nautilus, &format!("#!/bin/sh\nexec {cmd} \"$@\"\n"))?;
    // Dolphin (KDE): service menu; KF6 requires the file to be executable.
    let desktop = [
        "[Desktop Entry]", "Type=Service", "MimeType=all/allfiles;", "Actions=convert;", "X-KDE-Priority=TopLevel", "",
        "[Desktop Action convert]", "Name=Convert with Alohamora", "Icon=alohamora", &format!("Exec={cmd} %F"), "",
    ]
    .join("\n");
    write_executable(&dolphin, &desktop)
}

/// ~/.config/autostart/alohamora.desktop, started with --hidden.
pub fn set_autostart(enabled: bool) -> io::Result<()> {
    let file = home().join(".config/autostart/alohamora.desktop");
    if !enabled {
        let _ = std::fs::remove_file(&file);
        return Ok(());
    }
    std::fs::create_dir_all(file.parent().unwrap_or(&file))?;
    let exec = format!("\"{}\" \"--hidden\"", self_command());
    std::fs::write(&file, format!("[Desktop Entry]\nType=Application\nName=Alohamora\nExec={exec}\nX-GNOME-Autostart-enabled=true\nNoDisplay=false\n"))
}
```

**File `src-tauri/src/integrations/global_drag.rs`**

```rust
//! Global drag wheel on Windows and Linux X11 (replaces uiohook-napi). A 60 Hz poller thread — no low-level
//! hooks — runs only while the setting is on. Logic: primary button down and moved > 12 px = dragging;
//! Shift held while dragging shows the wheel at the cursor; Alt picks the Tools ring; release = drag end.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use alohamora_core::types::WheelMode;
use tauri::AppHandle;

use crate::platform;
use crate::windows::overlay;

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn start(app: &AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut down_at: Option<(f64, f64)> = None;
        let mut dragging = false;
        let mut shown = false;
        let mut last_mode = WheelMode::Convert;
        while RUNNING.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(16));
            let Some(p) = platform::pointer() else { continue };
            let mode = if p.alt { WheelMode::Tools } else { WheelMode::Convert };
            if p.left_down {
                match down_at {
                    None => {
                        down_at = Some((p.x, p.y));
                        dragging = false;
                    }
                    Some((x0, y0)) if !dragging && (p.x - x0).hypot(p.y - y0) > 12.0 => dragging = true,
                    _ => {}
                }
                if dragging && p.shift && !shown {
                    shown = true;
                    last_mode = mode;
                    overlay::drag_start(&app, mode, (p.x, p.y), None);
                } else if shown && mode != last_mode {
                    last_mode = mode;
                    overlay::drag_mode(&app, mode);
                }
            } else if down_at.is_some() {
                down_at = None;
                dragging = false;
                if shown {
                    shown = false;
                    overlay::drag_end(&app);
                }
            }
        }
    });
    log::info!("Global drag wheel started");
}

pub fn stop() {
    if RUNNING.swap(false, Ordering::SeqCst) {
        log::info!("Global drag wheel stopped");
    }
}
```

**File `src-tauri/src/integrations/mac_helper.rs`**

```rust
//! macOS global drag wheel: the existing Swift helper (native/mac/DragHelper.swift, shipped as a sidecar)
//! prints JSON lines: {"t":"drag"} {"t":"mods","shift":b,"alt":b} {"t":"files","paths":[…]} {"t":"up"}.
//! It exits when its stdin closes. Port of integrations/macDragHelper.ts.

use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::Mutex;

use alohamora_core::types::WheelMode;
use alohamora_engine::inspect::inspect_files;
use tauri::AppHandle;

use crate::windows::overlay;

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

#[derive(serde::Deserialize)]
struct HelperEvent {
    t: String,
    #[serde(default)]
    alt: bool,
    #[serde(default)]
    paths: Vec<String>,
}

pub fn start(app: &AppHandle) {
    let mut guard = CHILD.lock().expect("helper");
    if guard.is_some() || !cfg!(target_os = "macos") {
        return;
    }
    let mut child = match alohamora_engine::process::command(&alohamora_engine::paths::mac_drag_helper())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            log::warn!("drag helper: {e}");
            return;
        }
    };
    let stdout = child.stdout.take().expect("piped stdout");
    *guard = Some(child);
    let app = app.clone();
    std::thread::spawn(move || {
        let (mut shown, mut alt) = (false, false);
        let mode = |alt: bool| if alt { WheelMode::Tools } else { WheelMode::Convert };
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(ev) = serde_json::from_str::<HelperEvent>(&line) else { continue };
            match ev.t.as_str() {
                "drag" => alt = false,
                "mods" => {
                    alt = ev.alt;
                    if shown {
                        overlay::drag_mode(&app, mode(alt));
                    }
                }
                "files" => {
                    let basic = if ev.paths.is_empty() { None } else { Some(inspect_files(&ev.paths, false)) };
                    shown = true;
                    let cursor = app.cursor_position().map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
                    let has_files = basic.as_ref().map(|b| !b.is_empty()).unwrap_or(false);
                    overlay::drag_start(&app, mode(alt), cursor, basic); // None → "Drop to choose"
                    if has_files {
                        overlay::drag_files(&app, mode(alt), inspect_files(&ev.paths, true)); // then thumbnails
                    }
                }
                "up" if shown => {
                    shown = false;
                    overlay::drag_end(&app);
                }
                _ => {}
            }
        }
        log::warn!("drag helper exited");
        *CHILD.lock().expect("helper") = None;
    });
    log::info!("macOS drag helper started");
}

pub fn stop() {
    if let Some(mut c) = CHILD.lock().expect("helper").take() {
        drop(c.stdin.take()); // the helper exits when stdin closes
        let _ = c.kill();
        let _ = c.wait();
    }
}
```

**File `src-tauri/src/integrations/legacy.rs`**

```rust
//! First start of the Tauri build: copy settings from the Electron build (or the older Kabooks build)
//! when the new settings file does not exist yet. Replaces integrations/legacy.ts.

use std::path::{Path, PathBuf};

/// Electron's userData folders (`app.getPath('appData')/<name>`), newest name first.
fn electron_settings_candidates() -> Vec<PathBuf> {
    let app_data: Option<PathBuf> = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    };
    let Some(base) = app_data else { return Vec::new() };
    ["Alohamora", "alohamora", "Kabooks", "kabooks"].iter().map(|n| base.join(n).join("settings.json")).collect()
}

/// Returns true when settings were copied (integrations are then re-applied with this executable's path).
pub fn migrate_settings(config_dir: &Path) -> bool {
    let target = config_dir.join("settings.json");
    if target.exists() {
        return false;
    }
    let Some(old) = electron_settings_candidates().into_iter().find(|p| p.exists()) else { return false };
    if std::fs::create_dir_all(config_dir).is_err() {
        return false;
    }
    match std::fs::copy(&old, &target) {
        Ok(_) => {
            log::info!("Copied settings from {}", old.display());
            true
        }
        Err(e) => {
            log::warn!("Could not copy the old settings: {e}");
            false
        }
    }
}
```

**Verify**
```bash
ls src-tauri/src/integrations/mod.rs src-tauri/src/integrations/windows.rs src-tauri/src/integrations/linux.rs \
   src-tauri/src/integrations/global_drag.rs src-tauri/src/integrations/mac_helper.rs src-tauri/src/integrations/legacy.rs
```

**Done when:** the six files exist.

## Task 8.8 — app: `lib.rs`, build, and the self-test through the app

**Goal.** The app compiles, its tests pass, and the self-test passes when run by the real app binary.

`lib.rs` replaces the placeholder from Task 3.1. `run()`:
1. handles `--selftest` first (headless: no windows), then builds the Tauri app;
2. registers the plugins: **single-instance first** (a second launch forwards its files to this one), log, dialog,
   opener, notification, autostart;
3. registers the `kfile` protocol and the 23 commands;
4. in `setup`: copies settings from the Electron build (first start only), loads settings, detects capabilities, starts
   the job queue (job updates are sent to both windows as `ev:job-update`), creates the main window (hidden) and the
   overlay, the menu and tray, applies the OS integrations, starts the hardware-encoder test and the clean-up of old
   temporary files in the background, and finally opens files passed on the command line;
5. keeps the app running when the last window closes while the tray is active, and handles macOS "Open With" and Dock
   clicks.

**File `src-tauri/src/lib.rs`**

```rust
//! Alohamora desktop app (Tauri 2). Port of src/main/index.ts.
//! The UI is unchanged React; this crate wires windows, commands, events and OS integrations to the engine.

mod app_state;
mod argv;
mod commands;
mod integrations;
mod notify;
mod platform;
mod protocol;
mod tray;
mod windows;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use alohamora_engine::{capabilities, fsutil, hw_video, jobs, paths, settings};
use tauri::{AppHandle, Emitter, Manager, RunEvent};

use windows::{main_window, overlay};

/// Quit for real (tray "Quit", ⌘Q, closing the main window without close-to-tray).
pub fn quit(app: &AppHandle) {
    app_state::set_quitting();
    integrations::mac_helper::stop();
    integrations::global_drag::stop();
    app.exit(0);
}

/// Engine paths from Tauri's path resolver.
fn init_paths(app: &AppHandle) -> tauri::Result<()> {
    let p = app.path();
    let exe_dir = std::env::current_exe()?.parent().map(PathBuf::from).unwrap_or_default();
    paths::init(paths::Paths {
        bin_dir: exe_dir,
        resource_dir: p.resource_dir()?,
        config_dir: p.app_config_dir()?,
        cache_dir: p.app_cache_dir()?,
        data_dir: p.app_data_dir()?,
        jobs_temp_root: std::env::temp_dir().join("alohamora-jobs"),
        app_version: app.package_info().version.to_string(),
    });
    Ok(())
}

/// `alohamora --selftest [--only=<group|prefix>] [--out=<dir>]`: runs without creating any window, so it also
/// works on a headless CI runner. Paths come from Tauri's resource-dir rules for this executable.
fn run_selftest(context: &tauri::Context, args: &[String]) -> i32 {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(PathBuf::from)).unwrap_or_default();
    let resource_dir = tauri::utils::platform::resource_dir(context.package_info(), &tauri::Env::default()).unwrap_or_else(|_| exe_dir.clone());
    let work = args
        .iter()
        .find_map(|a| a.strip_prefix("--out=").map(PathBuf::from))
        .unwrap_or_else(|| std::env::temp_dir().join("alohamora-selftest"));
    paths::init(paths::Paths {
        bin_dir: exe_dir,
        resource_dir,
        config_dir: work.join("config"),
        cache_dir: work.join("cache"),
        data_dir: work.join("data"),
        jobs_temp_root: std::env::temp_dir().join("alohamora-jobs"),
        app_version: context.package_info().version.to_string(),
    });
    settings::load_defaults_in_memory();
    capabilities::detect();
    let only = args.iter().find_map(|a| a.strip_prefix("--only=").map(String::from));
    alohamora_engine::selftest::run(only.as_deref(), &work)
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    init_paths(&handle)?;
    integrations::legacy::migrate_settings(&paths::get().config_dir);
    let s = settings::load(paths::get().config_dir.clone());
    capabilities::detect();

    let emit_handle = handle.clone();
    let finish_handle = handle.clone();
    jobs::queue::init(
        Arc::new(move |u| {
            let _ = emit_handle.emit("ev:job-update", u);
        }),
        Arc::new(move |u| notify::job_finished(&finish_handle, u)),
    );

    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    let initial = argv::files_from_argv(&args, &cwd);
    let hidden = args.iter().any(|a| a == "--hidden");
    main_window::create(&handle, initial.is_empty() && !hidden)?;
    overlay::create(&handle)?;
    tray::install_app_menu(&handle)?;
    tray::create(&handle)?;
    integrations::apply(&handle, &s, None);

    let settings_handle = handle.clone();
    settings::on_changed(move |now, prev| {
        let _ = settings_handle.emit("ev:settings", now);
        integrations::apply(&settings_handle, now, Some(prev));
    });

    // Background: 1-frame hardware encoder tests and clean-up never block start-up.
    std::thread::spawn(hw_video::detect_hardware_video);
    std::thread::spawn(|| {
        let day = Duration::from_secs(24 * 60 * 60);
        let proxies = fsutil::remove_older_than(&paths::cache_dir("proxies"), day * 7);
        let jobs = fsutil::remove_older_than(&paths::jobs_temp_root(), day);
        if proxies + jobs > 0 {
            log::info!("Housekeeping removed {proxies} proxies, {jobs} job folders");
        }
    });

    argv::queue_files(&handle, initial);
    argv::mark_started(&handle);
    log::info!("Alohamora ready");
    Ok(())
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let context = tauri::generate_context!();
    if args.iter().any(|a| a == "--selftest") {
        std::process::exit(run_selftest(&context, &args));
    }
    let app = tauri::Builder::default()
        // Must be the first plugin: a second launch hands its argv to us and exits.
        .plugin(tauri_plugin_single_instance::init(argv::on_second_instance))
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .register_asynchronous_uri_scheme_protocol("kfile", protocol::handle)
        .invoke_handler(tauri::generate_handler![
            commands::get_capabilities,
            commands::get_settings,
            commands::set_settings,
            commands::pick_files,
            commands::pick_folder,
            commands::inspect_files,
            commands::start_job,
            commands::cancel_job,
            commands::list_jobs,
            commands::reveal,
            commands::open_path,
            commands::open_notices,
            commands::open_overlay,
            commands::close_overlay,
            commands::resize_overlay,
            commands::overlay_dropped,
            commands::preview_media,
            commands::preview_frame,
            commands::preview_waveform,
            commands::preview_image,
            commands::pdf_thumbnails,
            commands::read_metadata,
            commands::ui_ready,
        ])
        .on_window_event(windows::on_window_event)
        .setup(setup)
        .build(context)
        .expect("error while building Alohamora");

    app.run(|handle, event| match event {
        // Keep running in the tray when the last window closes; only an explicit quit exits.
        RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() && !app_state::is_quitting() {
                api.prevent_exit();
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => argv::on_opened_urls(handle, &urls),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => main_window::show(handle),
        _ => {
            let _ = handle;
        }
    });
}
```

**Run**
```bash
cargo build --locked --manifest-path src-tauri/Cargo.toml
```

**Verify**
```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml -p alohamora
./src-tauri/target/debug/alohamora --selftest --out=.selftest-app
```

**Done when:** the build has no errors, the app's tests pass (`test result: ok. 3 passed; 0 failed`), and the self-test
ends with `SELFTEST: N passed, 0 failed, M skipped` (N + M = 121), exactly like Task 7.4. On Windows the binary is
`alohamora.exe`; Git Bash finds it with the same command.

## Task 8.9 — Run the app (manual)

**Goal.** See the app work.

**Run (manual)**
```bash
npm run dev
```

`npm run dev` runs `tauri dev`: it starts the Vite server (`npm run dev:ui`) and then the app in debug mode. Check:

1. The main window appears after a moment, without a white flash, with the Convert, Formats and Settings tabs.
2. Drag a PNG from your file manager onto the window: the drop zone highlights, and on release the wheel opens next to
   the pointer. Click "WEBP": a `.webp` file appears next to the original and the activity list shows it.
3. Hold Alt (Option on macOS) while dropping: the Tools ring opens instead.
4. Drop an MP4, open the Tools ring, choose Trim: the video preview plays and seeks.
5. Drop a PDF, choose Organize: page thumbnails appear and can be dragged into a new order.
6. Settings: switch "Sound effects" off and on; on Windows, switch on "Send to"; on Linux, the file-manager menus.
7. Close the main window: the app keeps running in the tray; "Quit Alohamora" in the tray menu ends it.

**Done when:** all seven checks behave as described. Write the result (and anything odd) into `rewrite/PROGRESS.md`.
Appendix G has the full per-OS checklist used in Phase 10.

# Phase 9 — Packaging, signing, CI, notices

## Task 9.1 — Notices, README, offline and licence checks

**Goal.** The licences are documented, the README describes the Tauri build, and the offline guarantee and licence
policy are checked automatically.

1. Third-party notices (bundled with the app as `THIRD_PARTY_NOTICES.md`) and the README:

**File `THIRD_PARTY_NOTICES.md`**

```markdown
# Third-party notices

Alohamora is built from the open-source components below. Each keeps its own licence. Alohamora runs entirely on your computer
and contacts no servers. Every Rust crate compiled into the app, with its licence, is listed in `THIRD_PARTY_CRATES.md`.

| Component | Licence | Note |
|---|---|---|
| Tauri, wry, tao | MIT / Apache-2.0 | Application runtime (uses the system web view: WebView2, WKWebView or WebKitGTK) |
| FFmpeg (gyan.dev "essentials" build on Windows; Martin Riedl builds on macOS and Linux) | **GPL** (includes x264 / x265) | Separate programs (`ffmpeg`, `ffprobe`); see `LICENSE-ffmpeg.txt`. Source: https://ffmpeg.org and the build providers. |
| PDFium (bblanchon/pdfium-binaries) | BSD-3-Clause / Apache-2.0 and bundled third-party licences | PDF rendering, text and page editing; see `pdfium/LICENSE-pdfium.txt` |
| Tesseract OCR, Leptonica | Apache-2.0, BSD-2-Clause | OCR, compiled into the app |
| tessdata_fast (English, Vietnamese) | Apache-2.0 | OCR language data |
| Typst | Apache-2.0 | Text → PDF typesetting |
| Noto Sans, Noto Serif, Noto Sans Mono | SIL OFL 1.1 | Fonts for text → PDF |
| image, png, tiff, image-webp, zune-jpeg, resvg, tiny-skia, vtracer, visioncortex | MIT / Apache-2.0 / Zlib | Image decoding, SVG and tracing |
| mozjpeg (libjpeg-turbo + mozjpeg) | IJG / BSD-3-Clause / Zlib | JPEG encoding |
| libwebp | BSD-3-Clause | WebP encoding |
| rav1e, ravif | BSD-2-Clause | AVIF encoding |
| lopdf, kamadak-exif, img-parts, zip | MIT | PDF writing, EXIF, metadata blocks, DOCX/EPUB packaging |
| alohamora-drag-helper (macOS) | Alohamora's own code | Reads only the drag pasteboard and modifier-key state |
| heif-enc (optional, not bundled) | LGPL-3.0 + x265 GPL-2.0 | Only if you install it yourself for HEIC output |
| React, zustand | MIT | User interface |
| lucide-react | ISC | Icons |
| Inter font | SIL OFL 1.1 | Typeface |

Some crates used by Tauri (cssparser, selectors, dtoa-short, option-ext) are MPL-2.0. They are used unmodified; their source is
available from crates.io.

## FFmpeg and the GPL

The FFmpeg builds used here are licensed under the GNU General Public License because they include the x264 and x265 encoders.
That is fine for personal use. **Before distributing Alohamora publicly**, either ship the GPL notice and an offer of the
corresponding source code (the licence text is in `LICENSE-ffmpeg.txt`), or switch to an LGPL-only FFmpeg build (which has
no x264 / x265, so H.264 / H.265 encoding would then rely on hardware encoders or a different codec).

Alohamora starts FFmpeg as a separate program and does not link against it.
```

**File `README.md`**

````markdown
# Alohamora

An offline file converter for **Windows, macOS and Linux** with a spinning-wheel interface. Drop a file, pick a slice, and the
result is saved next to the original. Nothing is uploaded; there is no account, telemetry or auto-update, and the app never
opens a network connection.

- **Convert** images, video, audio, PDFs, text and subtitles; PDFs can also become Word (DOCX) or EPUB files (see the *Formats*
  tab for the full matrix).
- **Tools** (hold Shift + Alt, or ⇧⌥ on a Mac): compress, trim, crop, redact, normalize, OCR, merge, organize and more.
- Built with Tauri 2: a Rust back end (`src-tauri/`) and a React + Vite user interface (`src/renderer/`). FFmpeg, PDFium,
  Tesseract and Typst do the heavy lifting; images are handled by pure-Rust codecs.

The rewrite from Electron is described in `rewrite/OUTLINE.md` (design) and `rewrite/PLAN.md` (step-by-step build plan);
progress is logged in `rewrite/PROGRESS.md`.

## Running it from source

Requirements (details per OS in `rewrite/PLAN.md` Task 0.1): Git, Node 22.18+, Rust (installed by `rustup`; the version is
pinned in `rust-toolchain.toml`), CMake, NASM and a C/C++ compiler. On Linux also the WebKitGTK development packages:

```
sudo apt install build-essential curl wget file pkg-config cmake nasm libwebkit2gtk-4.1-dev libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

On macOS install the Xcode Command Line Tools (`xcode-select --install`) and `brew install cmake nasm`.

```
npm ci
npm run fetch-binaries     # FFmpeg, PDFium, OCR data and fonts for this OS (needs internet once; the app stays offline)
npm run check-binaries
npm run dev                # starts Vite and the Tauri app
```

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | UI and shared-logic unit tests (Vitest) |
| `npm run typecheck` | Type-check the UI and shared TypeScript |
| `cargo test --manifest-path src-tauri/Cargo.toml --workspace` | Rust unit tests |
| `npm run selftest` | End-to-end self-test: real files through every conversion and tool (`-- --only=av` for one group) |
| `npm run gen:registry` | Regenerate `src/shared/registry/*.json` after changing formats, tools or defaults |
| `npm run check:offline` / `check:licenses` | The offline guarantee and the licence policy (CI runs both) |
| `npm run build` | Package installers for the current OS into `src-tauri/target/release/bundle/` |

## HEIC output

HEIC *input* works everywhere (decoded by the bundled FFmpeg). HEIC *output* needs an encoder, which patents keep out of the
bundled programs:

- **macOS:** built in (`sips`), nothing to do.
- **Windows:** download a Windows build of libheif that includes `heif-enc.exe`, and copy `heif-enc.exe` **and every `.dll`
  next to it** into `%APPDATA%\com.alohamora.app\heif\`. Restart Alohamora. The *Formats* tab shows HEIC struck through until
  then.
- **Linux:** `sudo apt install libheif-examples libheif-plugin-x265` (Debian/Ubuntu) or `sudo dnf install libheif-tools`
  (Fedora). Alohamora only offers HEIC when `heif-enc --list-encoders` shows an HEVC encoder.

## Packaging

Each OS builds on itself: `npm run build` (after `npm run fetch-binaries`).

| OS | Output |
|---|---|
| Windows | NSIS installer (per-user, includes the WebView2 offline installer, so it installs without internet) |
| macOS | `.app` and `.dmg`; ad-hoc signed unless signing secrets are set (see `rewrite/PLAN.md` Task 9.3) |
| Linux | `.deb`, `.rpm` and AppImage |

A packaged app can test itself and writes a JSON report:

| OS | Command | Report |
|---|---|---|
| Windows | `alohamora.exe --selftest` | `%TEMP%\alohamora-selftest\report.json` |
| macOS | `Alohamora.app/Contents/MacOS/alohamora --selftest` | `$TMPDIR/alohamora-selftest/report.json` |
| Linux | `alohamora --selftest` | `/tmp/alohamora-selftest/report.json` |

`.github/workflows/build.yml` builds, tests and self-tests all platforms (on Linux with networking switched off).

## Platform notes

| | Windows | macOS | Linux |
|---|---|---|---|
| Global "drag + Shift" wheel | yes | yes, shows your real file before you drop | X11 only (not possible on Wayland) |
| File-manager entry | Send to + right-click | Open With, Dock drop | Open With, Nautilus script, Dolphin menu |
| Hardware video encoding | NVENC / Quick Sync / AMF | VideoToolbox | NVENC |
| Video previews | built in | built in | needs GStreamer plugins (`gstreamer1.0-plugins-good`, `gstreamer1.0-libav`) |
| Transparent wheel window | yes | yes | needs a compositing window manager |

Troubleshooting tips are in `rewrite/PLAN.md` Appendix D.

## Licences

See `THIRD_PARTY_NOTICES.md` (components) and `THIRD_PARTY_CRATES.md` (every Rust crate and its licence). The bundled FFmpeg
builds are GPL; read the notices before distributing Alohamora.
````

2. `scripts/check-offline.mjs` is the static half of the offline guarantee (§3). It fails when: a network client crate
   (reqwest, hyper, rustls, …) is a **runtime** dependency of the app on any desktop OS; our Rust code uses sockets; the
   UI uses `fetch`, `XMLHttpRequest`, `WebSocket` or a remote URL; or the Content-Security-Policy allows a remote origin.

**File `scripts/check-offline.mjs`**

```js
// Static half of the offline guarantee (the dynamic half is the self-test run without a network in CI).
// Fails when something could let the app reach the network:
//   1. an HTTP / WebSocket / TLS client crate among the app's runtime dependencies (any OS);
//   2. socket APIs in our own Rust code;
//   3. network APIs in the UI source;
//   4. a Content-Security-Policy that allows a remote origin.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
/** The desktop targets we ship (Tauri also lists mobile-only dependencies, e.g. reqwest on iOS/Android). */
const DESKTOP_TARGETS = ['x86_64-pc-windows-msvc', 'aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu'];
const problems = [];

// 1. Runtime crates. Build-only dependencies (e.g. tesseract-rs downloading sources while compiling) are allowed.
const NET_CRATES = ['reqwest', 'hyper', 'hyper-util', 'ureq', 'curl', 'curl-sys', 'isahc', 'attohttpc', 'surf', 'h2', 'h3',
  'rustls', 'native-tls', 'openssl', 'openssl-sys', 'tungstenite', 'tokio-tungstenite', 'quinn', 'trust-dns-resolver', 'hickory-resolver'];
const tree = execFileSync('cargo', ['tree', '-e', 'normal', ...DESKTOP_TARGETS.flatMap((t) => ['--target', t]), '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml'),
  '--prefix', 'none', '--format', '{p}'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString();
const crates = new Set(tree.split('\n').map((l) => l.trim().split(' ')[0]).filter(Boolean));
for (const c of NET_CRATES) if (crates.has(c)) problems.push(`runtime dependency on network crate "${c}" (cargo tree -i ${c})`);

// 2 + 3. Source scans.
function scan(dir, exts, pattern, what) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'target' && e.name !== 'node_modules') scan(p, exts, pattern, what); continue; }
    if (!exts.some((x) => e.name.endsWith(x)) || e.name.endsWith('.test.ts')) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (pattern.test(line)) problems.push(`${what}: ${path.relative(root, p)}:${i + 1}: ${line.trim()}`);
    });
  }
}
scan(path.join(root, 'src-tauri', 'src'), ['.rs'], /std::net|TcpStream|UdpSocket|TcpListener/, 'socket API');
scan(path.join(root, 'src-tauri', 'crates'), ['.rs'], /std::net|TcpStream|UdpSocket|TcpListener/, 'socket API');
scan(path.join(root, 'src'), ['.ts', '.tsx'], /\bfetch\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|https?:\/\/(?!localhost|kfile\.localhost|ipc\.localhost|www\.w3\.org)/, 'network API in UI');

// 4. CSP: only the app itself, data/blob URLs, the ipc: and kfile: protocols (and their Windows *.localhost forms).
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const csp = conf.app?.security?.csp ?? '';
if (!csp) problems.push('tauri.conf.json has no Content-Security-Policy');
for (const origin of csp.match(/https?:\/\/[^\s;]+/g) ?? []) {
  if (!/^http:\/\/(kfile|ipc)\.localhost$/.test(origin)) problems.push(`CSP allows a remote origin: ${origin}`);
}

if (problems.length) { for (const p of problems) console.error(`✗ ${p}`); process.exit(1); }
console.log(`Offline check passed (${crates.size} runtime crates scanned).`);
```

3. `scripts/check-licenses.mjs` lists every Rust crate linked into the app with its licence in `THIRD_PARTY_CRATES.md`
   and fails on GPL/LGPL/AGPL-only crates. MPL-2.0 is allowed (Appendix F).

**File `scripts/check-licenses.mjs`**

```js
// Lists every Rust crate linked into the app (runtime dependencies only) with its licence, writes
// THIRD_PARTY_CRATES.md, and FAILS when a crate is only available under a strong copyleft licence (GPL/LGPL/AGPL).
// MPL-2.0 is allowed: it is file-level copyleft and applies only if we modified those crates (Tauri itself uses them).
// Offline: uses `cargo metadata` / `cargo tree` on the lock file. Run after adding or updating any crate.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
/** The desktop targets we ship (Tauri also lists mobile-only dependencies, e.g. reqwest on iOS/Android). */
const DESKTOP_TARGETS = ['x86_64-pc-windows-msvc', 'aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu'];
const manifest = path.join(root, 'src-tauri', 'Cargo.toml');
const cargo = (args) => execFileSync('cargo', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString();

// Runtime (normal) dependency closure of the app crate for every desktop OS, as "name version".
const used = new Set(cargo(['tree', '-e', 'normal', ...DESKTOP_TARGETS.flatMap((t) => ['--target', t]), '--manifest-path', manifest, '--prefix', 'none', '--format', '{p}'])
  .split('\n').map((l) => l.trim().split(' ').slice(0, 2).join(' ')).filter(Boolean));
const meta = JSON.parse(cargo(['metadata', '--format-version', '1', '--manifest-path', manifest]));
const ours = new Set(['alohamora', 'alohamora-core', 'alohamora-engine']);
const rows = meta.packages
  .filter((p) => used.has(`${p.name} v${p.version}`) && !ours.has(p.name))
  .sort((a, b) => a.name.localeCompare(b.name));

/** True when at least one permissive option exists in the SPDX expression (e.g. "MIT OR Apache-2.0"). */
const COPYLEFT = /\b(A?GPL|LGPL|EUPL|SSPL)/i;
const permissive = (expr) => expr.split(/\s+OR\s+|\//).some((part) => !COPYLEFT.test(part));

const bad = rows.filter((p) => !p.license || !permissive(p.license.replace(/[()]/g, '')));
const lines = ['# Rust crates in Alohamora', '', 'Generated by `node scripts/check-licenses.mjs`. Do not edit.', '',
  '| Crate | Version | Licence |', '|---|---|---|',
  ...rows.map((p) => `| ${p.name} | ${p.version} | ${p.license ?? 'UNKNOWN'} |`), ''];
fs.writeFileSync(path.join(root, 'THIRD_PARTY_CRATES.md'), lines.join('\n'));
console.log(`${rows.length} crates written to THIRD_PARTY_CRATES.md`);
if (bad.length) {
  for (const p of bad) console.error(`✗ ${p.name} ${p.version}: ${p.license ?? 'no licence field'}`);
  console.error('GPL-family-only or unknown licences found. Replace the crate or record an exception in PLAN.md Appendix F.');
  process.exit(1);
}
console.log('All crate licences are permissive.');
```

**Run**
```bash
npm run check:licenses
```

**Verify**
```bash
npm run check:offline
test -s THIRD_PARTY_CRATES.md
```

**Done when:** `check:licenses` prints `All crate licences are permissive.`, `check:offline` prints
`Offline check passed (… runtime crates scanned).`, and `THIRD_PARTY_CRATES.md` exists. Commit `THIRD_PARTY_CRATES.md`
too. If `check:offline` fails, **do not weaken the check**: remove whatever brought in the network code.

## Task 9.2 — Continuous integration

**Goal.** Every push builds, tests, self-tests (on Linux with networking switched off) and packages the app on Windows,
macOS (Apple Silicon and Intel) and Linux.

The workflow follows the order of this plan: install tools, `npm ci`, fetch and check the binaries, check the registry
JSON, type-check and test the UI, test and lint the Rust code, run the offline and licence checks, build the app, run
`--selftest` with the real app binary (`unshare -rn` removes the network on Linux), then `tauri build` and upload the
installers and the self-test report. The Apple signing secrets are optional (Task 9.3).

**File `.github/workflows/build.yml`**

```yaml
name: build
on:
  push:
    branches: [master]
  pull_request:
  workflow_dispatch:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: windows-latest, target: x86_64-pc-windows-msvc }
          - { os: macos-15, target: aarch64-apple-darwin }          # Apple Silicon
          - { os: macos-15-intel, target: x86_64-apple-darwin }     # Intel (label available until Aug 2027)
          - { os: ubuntu-22.04, target: x86_64-unknown-linux-gnu }
    runs-on: ${{ matrix.os }}
    env:
      CARGO_TERM_COLOR: always
      MANIFEST: src-tauri/Cargo.toml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Rust (version from rust-toolchain.toml)
        run: rustup show active-toolchain || rustup toolchain install
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      # tesseract-rs compiles Leptonica + Tesseract once (several minutes) and keeps them in this folder.
      - uses: actions/cache@v4
        with:
          path: |
            ~/.tesseract-rs
            ~/Library/Application Support/tesseract-rs
            ~/AppData/Roaming/tesseract-rs
          key: tesseract-rs-0.4.0-${{ matrix.os }}
      - name: Linux packages
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y build-essential file pkg-config cmake nasm libwebkit2gtk-4.1-dev libxdo-dev libssl-dev \
            libayatana-appindicator3-dev librsvg2-dev patchelf libheif-examples libheif-plugin-x265 \
            gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-libav
      - name: macOS tools
        if: runner.os == 'macOS'
        run: brew install nasm
      - name: Windows tools
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          choco install nasm -y --no-progress
          "C:\Program Files\NASM" | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
      - run: npm ci
      - run: npm run fetch-binaries        # also builds the macOS drag helper on macOS runners
      - run: npm run check-binaries
      - run: npm run gen:registry -- --check
      - run: npm run typecheck
      - run: npm test
      - run: cargo test --manifest-path $MANIFEST --workspace
        shell: bash
      - run: cargo clippy --manifest-path $MANIFEST --workspace --all-targets -- -D warnings
        shell: bash
      - run: npm run check:offline
      - run: npm run check:licenses
      - name: Build the app (debug) for the self-test
        run: cargo build --manifest-path $MANIFEST
        shell: bash
      - name: Self-test (Linux, with networking switched off)
        if: runner.os == 'Linux'
        run: unshare -rn ./src-tauri/target/debug/alohamora --selftest --out=.selftest
      - name: Self-test
        if: runner.os != 'Linux'
        shell: bash
        run: ./src-tauri/target/debug/alohamora --selftest --out=.selftest
      - name: Package
        shell: bash
        run: |
          # Secrets that are not configured arrive as empty strings; Tauri must not see them at all.
          for v in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
            [ -n "${!v}" ] || unset "$v"
          done
          npx tauri build --target ${{ matrix.target }}
        env:
          # Optional. Without these secrets macOS builds are ad-hoc signed and not notarized (PLAN.md Task 9.3).
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: alohamora-${{ matrix.target }}
          path: |
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.exe
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.dmg
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.deb
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.rpm
            src-tauri/target/${{ matrix.target }}/release/bundle/**/*.AppImage
            .selftest/report.json
          if-no-files-found: ignore
```

**Verify**
```bash
grep -q "unshare -rn" .github/workflows/build.yml
grep -q "check:offline" .github/workflows/build.yml
```

**Run (manual)**
```bash
git push
# Then open the repository's "Actions" tab on GitHub and wait for the "build" workflow.
```

**Done when:** the greps succeed. After pushing, all four jobs of the workflow are green (write the run URL into
`rewrite/PROGRESS.md`). A job that is red on one OS only: open its log, find the first error, and check Appendix D.

## Task 9.3 — Signing and notarization (manual)

**Goal.** Installers that open without security warnings.

Nothing in the code changes. Signing is configured with secrets in CI (or environment variables on a build machine).

**macOS (Developer ID + notarization).** Without these settings the app is **ad-hoc signed** (`signingIdentity: "-"` in
`tauri.macos.conf.json`): it runs on the build Mac, but other Macs show "cannot be opened" until the user allows it in
System Settings → Privacy & Security.

1. In the Apple Developer account, create a **Developer ID Application** certificate. Export it with its private key
   from Keychain Access as a `.p12` file with a password.
2. Create an **app-specific password** for your Apple ID at appleid.apple.com.
3. Add these repository secrets on GitHub (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | the `.p12` file as base64: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID1234)` |
| `APPLE_ID` | your Apple ID e-mail |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | your 10-character team ID |

4. Run the workflow. `tauri build` imports the certificate, signs the app, the sidecars (`ffmpeg`, `ffprobe`, the drag
   helper) and the PDFium framework with the hardened runtime and `macos/entitlements.plist`, then notarizes and staples
   the `.dmg`. `APPLE_SIGNING_IDENTITY` overrides the `"-"` in the config.
5. Check on a Mac: `codesign --verify --deep --strict --verbose=2 Alohamora.app` and
   `spctl --assess --type execute --verbose Alohamora.app` (must say `accepted`, `source=Notarized Developer ID`).

The same variables work on a local Mac: export them in the shell, then `npm run build`.

**Windows (optional, Authenticode).** Unsigned installers work but show a SmartScreen warning. With a code-signing
certificate, add to `tauri.windows.conf.json` under `bundle.windows` either `"certificateThumbprint"` (certificate in the
Windows certificate store, plus `"digestAlgorithm": "sha256"` and `"timestampUrl"`) or a `"signCommand"` for a cloud
signing service. Tauri then signs the app, the sidecars and the installer. The timestamp server is contacted **at build
time only**.

**Linux.** Nothing to sign. (Optionally sign the `.deb`/`.rpm` repository metadata if you publish a repository.)

**Done when:** (with secrets) the macOS checks above pass on a second Mac; or you have recorded in
`rewrite/PROGRESS.md` that signing is postponed and builds are ad-hoc signed.

## Task 9.4 — Lint and full test run

**Goal.** Everything that CI checks passes locally.

**Verify**
```bash
npm run gen:registry -- --check
npm run typecheck
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --workspace
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --workspace --all-targets -- -D warnings
npm run check:offline
```

**Done when:** every command passes. Rust unit tests: 58 in `core`, 4 in `engine`, 3 in the app.

## Task 9.5 — Release build

**Goal.** Installers for this OS, and proof that the **packaged** app works.

**Run**
```bash
npm run build
```

`npm run build` runs `tauri build`: it builds the UI (`npm run build:ui`), compiles the app in release mode (link-time
optimisation; 10–30 minutes) and packages it. Output in `src-tauri/target/release/bundle/`:

| OS | Files |
|---|---|
| Windows | `nsis/Alohamora_0.2.0_x64-setup.exe` |
| macOS | `macos/Alohamora.app`, `dmg/Alohamora_0.2.0_<arch>.dmg` |
| Linux | `deb/Alohamora_0.2.0_amd64.deb`, `rpm/Alohamora-0.2.0-1.x86_64.rpm`, `appimage/Alohamora_0.2.0_amd64.AppImage` |

The AppImage step downloads its packaging tools once (build time only). If that is blocked, build the other formats with
`npx tauri build --bundles deb,rpm`.

**Verify**
```bash
case "$(uname -s)" in
  Linux)  BIN=$(ls -d src-tauri/target/release/bundle/deb/*/data/usr/bin/alohamora) ;;
  Darwin) BIN=src-tauri/target/release/bundle/macos/Alohamora.app/Contents/MacOS/alohamora ;;
  *)      BIN=src-tauri/target/release/alohamora.exe ;;
esac
"$BIN" --selftest --out=.selftest-release
```

**Done when:** the packaged app's self-test ends with `0 failed` (N + M = 121, as in Task 7.4). This proves the bundled
FFmpeg, PDFium, OCR data and fonts are found in the installed layout.

# Phase 10 — Verification on every OS and cut-over

The code was validated on Linux. Some behaviour can only be checked by a person on each OS: windows, drag-and-drop,
the tray, notifications, installers, file associations. Use the checklists in Appendix G. Write every result into
`rewrite/PROGRESS.md`; a failed check becomes a "Blocked" entry with the exact symptom, unless Appendix D or F already
covers it.

## Task 10.1 — Windows checks (manual)

**Goal.** The app works on Windows 10 and 11.

**Run (manual)**
```bash
npm run fetch-binaries && npm run check-binaries
npm run build
"src-tauri/target/release/alohamora.exe" --selftest --out=.selftest-win
```

Then install `src-tauri/target/release/bundle/nsis/Alohamora_0.2.0_x64-setup.exe` (on a second PC without internet if
possible: the installer must work offline) and go through **Appendix G.1**.

**Done when:** the self-test has `0 failed` and every item of G.1 is ticked or recorded.

## Task 10.2 — macOS checks (manual)

**Goal.** The app works on Apple Silicon and Intel Macs, macOS 11 or newer.

**Run (manual)**
```bash
npm run fetch-binaries && npm run check-binaries
npm run build
src-tauri/target/release/bundle/macos/Alohamora.app/Contents/MacOS/alohamora --selftest --out=.selftest-mac
```

Then open the `.dmg`, drag Alohamora to Applications, start it and go through **Appendix G.2**. For an Intel build on an
Apple Silicon Mac, run the CI workflow (the `macos-15-intel` job) and test its artifact on an Intel Mac.

**Done when:** the self-test has `0 failed` and every item of G.2 is ticked or recorded.

## Task 10.3 — Linux checks and cut-over

**Goal.** The app works on Linux, and the repository is switched over to the Tauri build.

1. **(manual)** Install the package and go through **Appendix G.3** (X11 and Wayland sessions if you can):

**Run (manual)**
```bash
sudo apt install ./src-tauri/target/release/bundle/deb/Alohamora_0.2.0_amd64.deb
alohamora --selftest
```

2. Move the old Electron plan documents out of the repository root, so nobody follows them by mistake:

**Run**
```bash
mkdir -p docs/electron
git mv PLAN.md docs/electron/PLAN.md
git mv OUTLINE.md docs/electron/OUTLINE.md
git mv PROGRESS.md docs/electron/PROGRESS.md
```

3. Final check of everything that can run without a person:

**Verify**
```bash
test ! -e src/main && test ! -e electron-builder.yml
npm run gen:registry -- --check
npm run typecheck
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --workspace
npm run check:offline
npm run check:licenses
./src-tauri/target/debug/alohamora --selftest --out=.selftest-final
```

4. **(manual, owner)** When Phases 10.1–10.3 are done and CI is green: merge the rewrite branch into `master`, tag the
   release (`git tag v0.2.0`) and attach the CI artifacts to a GitHub release.

**Done when:** the Verify block passes, the G.3 checklist is recorded, and `rewrite/PROGRESS.md` shows every task ticked
(or `[~]` with a note). The rewrite is finished.

## Appendix A — Command and event contract

The UI talks to Rust only through these commands and events. TypeScript types are in `src/shared/types.ts`,
`src/shared/ipc.ts` and `src/shared/overlay.ts`; the Rust structs with the same names are in `core/src/types.rs` (JSON
field names are camelCase on both sides). If you add or change a command, change all four places: `commands.rs`, the
`invoke_handler` list in `lib.rs`, `AlohamoraApi` in `ipc.ts` and `api` in `api.ts`.

**Commands** (`invoke(name, args)`; argument names are camelCase in the UI and snake_case in Rust; errors reject with
`{ message }`, which `api.ts` turns into an `Error`):

| Command | UI arguments | Returns | Notes |
|---|---|---|---|
| `get_capabilities` | — | `Capabilities` | FFmpeg version/encoders, HEIC output, OCR languages, hardware encoder, platform |
| `get_settings` | — | `Settings` | |
| `set_settings` | `patch: Partial<Settings>` | `Settings` | Sanitised, saved atomically, then `ev:settings` is sent to every window |
| `pick_files` | — | `string[]` | Empty when cancelled |
| `pick_folder` | — | `string \| null` | |
| `inspect_files` | `paths: string[], deep: boolean` | `FileInfo[]` | Folders are expanded |
| `start_job` | `req: JobRequest` | `string` (job id) | Updates arrive as `ev:job-update` |
| `cancel_job` | `id: string` | — | |
| `list_jobs` | — | `JobUpdate[]` | Current and recent jobs |
| `reveal` | `path: string` | — | Show in Finder/Explorer/file manager |
| `open_path` | `path: string` | — | Open with the default app |
| `open_notices` | — | — | Opens the bundled `THIRD_PARTY_NOTICES.md` |
| `open_overlay` | `paths: string[], mode: WheelMode` | — | Opens the wheel at the pointer |
| `close_overlay` | — | — | Hides the wheel |
| `resize_overlay` | `size: OverlaySize` | — | |
| `overlay_dropped` | `paths: string[]` | `FileInfo[]` | Files dropped on the open overlay (outside the wheel) |
| `preview_media` | `path: string` | `{ url: string, isProxy: boolean }` | A `kfile` URL for `<video>`/`<audio>` |
| `preview_frame` | `path, timeSec, maxWidth` | `string` (data URL) | One video frame |
| `preview_waveform` | `path, width, height` | `string` (data URL) | Audio waveform picture |
| `preview_image` | `req: ImagePreviewRequest` | `ImagePreviewResult` | Live preview of the image tools |
| `pdf_thumbnails` | `path, maxWidth` | `string[]` (data URLs) | One per page (Organize panel) |
| `read_metadata` | `path: string` | `MetadataInfo` | Metadata panels |
| `ui_ready` | — | — | The calling window has rendered and registered its listeners |

**Events** (Rust → UI; the UI subscribes with `api.onXxx`, which listens on its own window):

| Event | Sent to | Payload | When |
|---|---|---|---|
| `ev:job-update` | all windows | `JobUpdate` | Every job state or progress change |
| `ev:settings` | all windows | `Settings` | After any settings change |
| `ev:navigate` | `main` | `'convert' \| 'formats' \| 'settings'` | macOS menu "Settings…" (⌘,) |
| `ev:drop` | the window under the pointer | `DropEvent` | Native file drag enter/over/drop/leave |
| `ev:overlay-init` | `overlay` | `OverlayInit` | The wheel opens (quick file info) |
| `ev:overlay-files` | `overlay` | `FileInfo[]` | Full file info after deep inspection |
| `ev:overlay-drag` | `overlay` | `DragState` | Global drag wheel: drag started, files known, modifier change, drag ended |

**The `kfile` protocol.** `preview_media` (and only the back end) adds a file to the allow-list and returns its URL:
`kfile://localhost/<encodeURIComponent(path)>` on macOS and Linux, `http://kfile.localhost/<encodeURIComponent(path)>` on
Windows. Requests for files not on the list get 403. `Range` requests are answered with 206 and at most 4 MiB.

**Window labels.** `main` (the app) and `overlay` (the wheel). Both load the same `index.html`; `main.tsx` picks the view
from the label.

## Appendix B — Self-test cases (121)

The self-test (Tasks 7.3, 7.4, 8.8, 9.5) runs these cases, in this order. Names and groups are the same as in the
Electron build, minus the two removed EPUB → PDF cases (`convert.epub.book-pdf`, `convert.epub.fixed-pdf`). Select
cases with `--only=<name prefix>` (for example `--only=tools.pdf` or `--only=convert.image.png-heic`) or with an internal
group name (`av`, `image`, `text`, `pdf`, `tools.video`, `tools.audio`, `errors`, …).

| Name prefix | Cases | Names (after the prefix) |
|---|---|---|
| `convert.audio` | 8 | `wav-mp3`, `wav-m4a`, `wav-flac`, `wav-ogg`, `wav-opus`, `wav-aiff`, `wav-wma`, `mp3-wav` |
| `convert.video` | 12 | `mp4-mov`, `mp4-mkv`, `mp4-webm`, `mp4-avi`, `mp4-wmv`, `mp4-gif`, `mp4-mp3`, `mkv-mp4-remux`, `gif-mp4`, `vp9-mov-hw`, `vp9-mov-hw-fallback`, `noaudio-mp3-fails` |
| `convert.image` | 16 | `png-jpg`, `png-webp`, `png-avif`, `png-tiff`, `png-bmp`, `photo-orient`, `svg-png`, `bmp-png`, `tiff-webp`, `avif-jpg`, `png-svg-trace`, `png-svg-embed`, `png-heic`, `heic-jpg`, `png-pdf`, `photo-docx` |
| `convert.sub` | 3 | `srt-vtt`, `srt-txt`, `vtt-srt` |
| `convert.text` | 5 | `txt-srt`, `txt-vtt`, `txt-pdf`, `txt-png`, `txt-jpg` |
| `convert.pdf` | 8 | `doc-png`, `doc-jpg`, `doc-txt`, `doc-docx`, `doc-docx-pages`, `doc-epub`, `doc-epub-pages`, `scan-txt-ocr` |
| `tools.video` | 15 | `compress`, `trim-precise`, `trim-fast`, `split-parts`, `crop`, `crop-full-rect-fails`, `speed-2x`, `mute`, `snapshot-single`, `snapshot-every`, `redact-blur`, `metadata-set-title`, `metadata-remove-all`, `join-same`, `join-mixed` |
| `tools.audio` | 12 | `compress`, `channels-mono`, `channels-swap`, `channels-left-on-mono-fails`, `normalize`, `normalize-silent-fails`, `trim-fade`, `visualize-png`, `visualize-mp4`, `bleep`, `metadata-title`, `join` |
| `tools.image` | 16 | `compress-jpg`, `compress-png`, `resize-50`, `crop-rect`, `crop-rotate`, `edit-bw-keeps-alpha`, `edit-sepia-jpg`, `background`, `redact-black`, `redact-empty-fails`, `metadata-remove-all`, `metadata-remove-gps`, `metadata-edit`, `metadata-remove-all-png`, `collage-grid`, `make-pdf` |
| `tools.pdf` | 14 | `merge`, `split-each`, `split-ranges`, `split-extract`, `split-bad-range-fails`, `organize`, `images`, `compress-balanced`, `compress-max`, `ocr-txt`, `ocr-pdf`, `word`, `metadata-title`, `metadata-remove-all` |
| `tools.subtitle` | 1 | `shift` |
| `errors` | 11 | `fake-video`, `fake-audio`, `broken-image`, `broken-pdf`, `mute-without-audio`, `compress-target-too-small`, `heic-without-encoder`, `scanned-pdf-ocr-off`, `trim-too-short`, `split-single-cut`, `wrong-kind-for-tool` |

Total: 121 cases. Machine-dependent skips are listed in Task 7.4.

## Appendix C — User-facing messages

These sentences are what users see when something cannot be done. They are part of the product: keep them exactly as
written, and write new ones in the same style (short, plain words, say what to do). `{}` is filled in at run time (file
name, format, number). File paths are relative to `src-tauri/crates/`.

**General** (`core/src/error.rs`, used by `to_user_message` for I/O and unknown errors):

| Message | When |
|---|---|
| Alohamora can't read or write this file. Close it in other apps and try again. | Permission denied, file locked |
| The disk is full. | No space left |
| Something went wrong while processing this file. | Any unexpected error |

**FFmpeg** (`core/src/ffmpeg_parse.rs`, `friendly_ffmpeg_error`):

| Message | FFmpeg said |
|---|---|
| This file looks damaged, or it is not really the format its name says. | "Invalid data found when processing input", "moov atom not found" |
| This file has no usable audio or video for this action. | "matches no streams", "does not contain any stream" |
| This FFmpeg build is missing an encoder needed for this format. | "Unknown encoder", "Encoder not found" |
| The encoder needs an even width and height. | "not divisible by 2" |
| FFmpeg could not process this file. | anything else |

**Images and PDFs:**

| Message | Where |
|---|---|
| Alohamora couldn't read this image. It may be damaged. | `engine/src/image/mod.rs` (`MSG_UNREADABLE`) |
| This image could not be converted. It may be damaged or too large. | `engine/src/image/encode.rs` (an encoder failed) |
| This SVG is too large to draw. | `engine/src/image/svg.rs` |
| HEIC output is not available on this computer. | `engine/src/image/encode.rs` |
| HEIC output is not available on this computer (see the Formats page). | `engine/src/convert/image.rs` |
| This PDF is password-protected. Remove the password first, then try again. | `engine/src/pdf/mod.rs` (`MSG_PASSWORD`) |
| This PDF could not be opened. It may be damaged. | `engine/src/pdf/mod.rs` (`MSG_DAMAGED`) |
| This PDF has no text layer (it looks scanned). Turn on OCR to extract the text. | `engine/src/convert/pdf.rs` |
| No OCR language data found. Reinstall Alohamora. | `engine/src/ocr.rs` |

**Converters and jobs:**

| Message | Where |
|---|---|
| {} is not a supported file type. | `engine/src/convert/mod.rs`, `engine/src/jobs/execute.rs` |
| No files to process. | `engine/src/jobs/execute.rs` |
| {} needs at least {} files. | `engine/src/jobs/execute.rs` (join, merge, collage) |
| {} has no audio track. / {} has no video track. | `engine/src/convert/av.rs`, tools |
| Converting images to {} is not available yet. (also PDF, text) | `engine/src/convert/{image,pdf,text}.rs` |
| This text file is empty. | `engine/src/convert/text.rs` |
| No subtitles were found in {}. | `engine/src/convert/subtitle.rs`, `engine/src/tools/subtitle.rs` |
| This file could not be prepared for preview. | `engine/src/previews.rs` |

**Tools:**

| Message | Where |
|---|---|
| {} MB is too small for a {} video. Try at least {} MB. | `engine/src/tools/video.rs` (compress to a size) |
| The selection is too short. | `engine/src/tools/video.rs`, `engine/src/tools/audio.rs` (trim) |
| Add at least one cut point inside the video. | `engine/src/tools/video.rs` (split) |
| Move the crop handles first — the whole frame is selected. | `engine/src/tools/video.rs` (crop) |
| Speed must be between 0.25× and 4×. | `engine/src/tools/video.rs` |
| {} has no audio to remove. | `engine/src/tools/video.rs` (mute) |
| Draw at least one box over the area to hide. | `engine/src/tools/video.rs`, `engine/src/tools/image.rs` (redact) |
| This file is mono. | `engine/src/tools/audio.rs` (channels) |
| This file is silent. | `engine/src/tools/audio.rs` (normalize) |
| Add at least one part to bleep. | `engine/src/tools/audio.rs` |
| Enter a width or a height. | `engine/src/tools/image.rs` (resize) |
| Choose a size above 0 %. | `engine/src/tools/image.rs` (resize) |
| Nothing changed | `engine/src/tools/pdf.rs` (organize without changes) |
| A page in the list does not exist. | `engine/src/tools/pdf.rs` (organize) |

**Page ranges** (`core/src/page_ranges.rs`, `core/src/pdf_split.rs`; shown by Split PDF and PDF → images):

| Message |
|---|
| "{}" is not a page range. Use something like 1-3, 5, 8- |
| Page numbers start at 1 |
| Page {} doesn't exist (this PDF has {} pages) |
| "{}" goes backwards |
| No pages selected |
| Enter the pages to use, for example 1-3, 5 |

## Appendix D — Troubleshooting

Problems that came up while this plan was validated, and their fixes. Look for your symptom here before changing any code.

**Setting up and building**

| Symptom | Cause | Fix |
|---|---|---|
| `npm ci`: "package.json and package-lock.json are not in sync" | The lock file was not copied, or `package.json` differs from the plan | `cp rewrite/package-lock.json package-lock.json`, compare `package.json` with Task 1.1 |
| `npm run gen:registry`: "Unknown file extension .ts" or a syntax error in a `.ts` file | Node older than 22.18 cannot run TypeScript files | Install Node 22.18 or newer |
| Type errors about `window.api`, `getPathForFile`, `pathsFromDataTransfer` or `EpubToPdfCard` | A UI file from Phase 1 was not replaced | Compare the file named in the error with its block in Tasks 1.1–1.8 |
| Cargo: "the lock file … needs to be updated but --locked was passed" | A `Cargo.toml` differs from the plan | Compare all `Cargo.toml` files with Task 3.1. Never edit `Cargo.lock` |
| `rustc --version` is not 1.97.0 inside the repository | `rust-toolchain.toml` missing or rustup too old | Check Task 3.1 step 1; `rustup self update`; `rustup toolchain install 1.97.0` |
| Building `tesseract-rs`: "Failed to download" / HTTP 403 / timeout | Its build script downloads Leptonica 1.87.0, Tesseract 5.5.2 and two language files from GitHub | Pre-fill its cache by hand (commands below), then build again |
| CMake errors while building Leptonica or Tesseract | CMake missing or too old; on Windows no MSVC | Install CMake 3.20+; on Windows install the VS 2022 C++ build tools and build from Git Bash |
| `nasm: command not found` (mozjpeg, rav1e) | NASM missing | Install NASM 2.15+ and put it on `PATH` (Task 0.1) |
| The first engine build takes very long or the disk fills up | Normal: C/C++ libraries are compiled; `src-tauri/target` grows to ~10 GB | Free disk space; later builds reuse the results |
| `cargo clippy` reports warnings that the plan does not mention | Different Rust version | Use the pinned toolchain (1.97.0) |
| `error: unterminated raw string` after editing the Typst template in `text_pdf.rs` | `r#"…"#` ends at the first `"#` (for example in `"#111111"`) | Keep the template in `r##"…"##` |

Pre-filling the `tesseract-rs` cache (only if its download is blocked). The folder is `~/.tesseract-rs` on Linux,
`~/Library/Application Support/tesseract-rs` on macOS and `%APPDATA%\tesseract-rs` on Windows:

```bash
D=~/.tesseract-rs                     # change for macOS / Windows, see above
mkdir -p "$D/third_party" "$D/tessdata"
git clone --depth 1 --branch 1.87.0 https://github.com/DanBloomberg/leptonica "$D/third_party/leptonica"
git clone --depth 1 --branch 5.5.2 https://github.com/tesseract-ocr/tesseract "$D/third_party/tesseract"
# The build script only checks that these two files exist; the app uses src-tauri/resources/tessdata instead.
cp src-tauri/resources/tessdata/eng.traineddata "$D/tessdata/eng.traineddata"
: > "$D/tessdata/tur.traineddata"
```

**Bundled binaries**

| Symptom | Cause | Fix |
|---|---|---|
| `fetch-binaries`: HTTP 403/404 for the FFmpeg download | The download site is blocked or moved | Download a static FFmpeg 7.1+ build yourself (for example BtbN's `ffmpeg-master-latest-<os>-gpl` or `ffmpeg-n7.1-latest-<os>-gpl` from github.com/BtbN/FFmpeg-Builds, or evermeet.cx on macOS), extract it, then `npm run fetch-binaries -- --ffmpeg-dir=<folder with ffmpeg and ffprobe>` |
| `check-binaries`: "FFmpeg 7.1 or newer is required" | Older FFmpeg cannot decode tiled HEIC photos (iPhone) in one piece | Use a 7.1+ build (see above) |
| `check-binaries`: an encoder is missing | An FFmpeg build without that library (for example an LGPL build without libx264) | Use a GPL "full" build; see THIRD_PARTY_NOTICES.md about the GPL |
| Self-test: almost everything with PDFs fails, "Pdfium library could not be loaded" | `src-tauri/resources/pdfium/` missing, or the wrong CPU architecture | `npm run fetch-binaries`; on macOS check `file src-tauri/resources/pdfium/libpdfium.dylib` matches your CPU |
| Self-test: `convert.text.txt-pdf` fails with a font error, or text PDFs show boxes | `src-tauri/resources/fonts/` missing | `npm run fetch-binaries` |
| HEIC output: "No HEVC encoder available" (Linux) | `heif-enc` is installed but has no HEVC plugin | `sudo apt install libheif-plugin-x265`. The app checks `heif-enc --list-encoders` and hides HEIC output otherwise |
| Searchable PDF crashes in `TessPDFRenderer` | Tesseract's own PDF writer needs zlib, which `tesseract-rs` leaves out of Leptonica | Do not use Tesseract's PDF renderer; `ocr.rs` builds the PDF itself (Task 6.4) |

**Running the app**

| Symptom | Cause | Fix |
|---|---|---|
| Debug app shows "Could not connect to localhost" or a blank window | A debug build loads the UI from the Vite server (`devUrl`) | Use `npm run dev` (it starts Vite), or run `npm run dev:ui` in another terminal first |
| The main window never appears | It is shown only after the UI calls `ui_ready` | Open the web inspector (debug build: right-click → Inspect) and look for a JavaScript error; check `App.tsx` calls `api.uiReady()` |
| The overlay opens but shows nothing, or misses the first files | Events were sent before the overlay listened | `OverlayApp.tsx` must call `api.uiReady()` after registering listeners (Task 1.5); `overlay::open` waits for it |
| Dropping files does nothing | Native drops reach the UI as `ev:drop`; HTML5 drops are not used | Check `useNativeDrop` is used (Tasks 1.4–1.5) and `windows::on_window_event` is registered in `lib.rs` |
| Reordering rows does not work on Windows | WebView2 sends no HTML5 drag events inside a page that accepts native file drops | Use the pointer-event versions from Task 1.6 |
| Linux: videos do not play in previews | WebKitGTK needs GStreamer plugins | `sudo apt install gstreamer1.0-plugins-good gstreamer1.0-libav` |
| Linux: the wheel window is not transparent | No compositing window manager | Use a compositor (GNOME, KDE and most desktops have one) |
| Linux: no tray icon | Missing AppIndicator support | Install `libayatana-appindicator3-1`; on GNOME enable the "AppIndicator" extension |
| Linux Wayland: the global drag wheel never appears | Wayland does not let apps read the pointer globally | Expected: the feature works on X11 only. Normal drag-and-drop works everywhere |
| macOS: "Alohamora is damaged and can't be opened" on another Mac | The build is only ad-hoc signed | Sign and notarize (Task 9.3), or for testing: `xattr -dr com.apple.quarantine /Applications/Alohamora.app` |
| A notification appears but clicking it does nothing | The notification plugin reports no clicks on desktop | Known gap (Appendix F); "Reveal when done" in Settings opens the folder instead |

**Checks**

| Symptom | Cause | Fix |
|---|---|---|
| `check:offline` lists `reqwest` or `hyper` | Someone added a crate that pulls in an HTTP client, or ran `cargo tree` for mobile targets | Remove the crate. (Tauri lists `reqwest` only for iOS/Android; the script checks desktop targets only — keep it that way) |
| `check:licenses` fails on an MPL-2.0 crate | It should not: MPL-2.0 is allowed | Make sure `scripts/check-licenses.mjs` matches Task 9.1 |
| `check:licenses` fails on a GPL/LGPL crate | A new dependency | Remove it or ask the owner (Appendix F) |

**Code for other operating systems.** `platform/windows.rs`, `platform/macos.rs`, `integrations/windows.rs` and
`integrations/mac_helper.rs` compile only on their own OS. They were type-checked for `x86_64-pc-windows-msvc` and
`aarch64-apple-darwin` in isolation, but the whole app cannot be cross-compiled from Linux (Tesseract, mozjpeg and libwebp
are C/C++). If you change them, the CI jobs for Windows and macOS (Task 9.2) are the real check.

## Appendix E — Keeping `rewrite/PROGRESS.md`

`rewrite/PROGRESS.md` is created in Task 0.2 with one line per task. Keep it current; it is how the owner (and the next
agent) knows where the work stands.

- Tick a task (`[x]`) only after its **Verify** block passed. Use `[~]` when it passed but something is worth knowing,
  and `[!]` when it is blocked.
- Add one short line under **Notes and deviations** for anything that differs from the plan: a skipped self-test case
  and why, a manual check you could not do, a tool version that differs.
- When you are blocked (rule 9 in §0), write under **Blocked**: the task, the exact command, the first error lines, and
  what you already tried. Then stop and ask.
- Commit `rewrite/PROGRESS.md` together with the task's files.

Example entries:

```text
- [x] 3.6 core: types, registry, options
- [~] 7.4 Run the self-test — 119 passed, 0 failed, 2 skipped (no hardware encoder; HEIC encoder present)
- [!] 9.5 Release build — see Blocked

## Blocked
- 9.5: `npm run build` fails in the AppImage step: "failed to download linuxdeploy" (network blocked).
  Tried: `npx tauri build --bundles deb,rpm` → works. Waiting for the owner: is a .deb + .rpm release enough?
```

## Appendix F — Deliberate changes, known gaps and open questions

**Deliberate changes** (decided; do not "fix" them back):

| Change | Why |
|---|---|
| EPUB → PDF is removed; EPUB is output-only | Owner decision. It needed a hidden browser window for printing |
| Collage "cover" crops to the centre (sharp used its "attention" strategy) | No equivalent permissive crate worth the size |
| PNG → SVG tracing uses vtracer; the paths differ from imagetracerjs | imagetracerjs was JavaScript |
| Text → PDF is typeset by Typst; line breaks can differ slightly from Chromium | No browser engine in the back end |
| HEIC/AVIF input is decoded by the bundled FFmpeg | No extra C library (libheif) to build and license |
| HEIC output is offered only when `heif-enc` has an HEVC encoder | A `heif-enc` without its HEVC plugin exists on many Linux systems and cannot encode |
| Searchable PDFs are built from Tesseract's word boxes | Tesseract's PDF writer crashes without zlib (Appendix D) |
| Own DOCX and EPUB writers | Small, no extra dependencies, same structure as before |
| Paths from a second launch are resolved against that launch's working folder | The Electron build used the first instance's folder |
| The Windows right-click verb is written with the registry API | No `reg.exe` child process |
| The main window appears only after the UI has rendered | No white flash |
| Settings are copied once from the Electron build's folder (`integrations/legacy.rs`) | Users keep their settings |
| "No OCR language data found. Reinstall Alohamora." instead of '… Run "npm run fetch-binaries".' | Users of an installed app have no npm |

**Known gaps** (accepted for now; mention them in release notes):

| Gap | Details |
|---|---|
| Clicking a "done" notification does nothing | `tauri-plugin-notification` has no click events on desktop. "Reveal when done" in Settings still opens the folder |
| Linux tray icon has a menu but no click action | AppIndicator reports no clicks |
| Linux video previews need GStreamer plugins | `.deb` recommends them; the AppImage bundles them |
| Linux Wayland: no global drag wheel | Wayland does not allow reading the pointer globally (same as the Electron build) |
| No Windows "portable" `.exe` and no macOS `.zip` | Tauri builds an NSIS installer and `.app`/`.dmg`. Zip the `.app` by hand if a zip is needed |
| Windows has no "Open With" file associations | Send To and the right-click verb cover it (as before) |
| HEIC output on Windows needs a user-installed `heif-enc` | README explains it; HEIC encoders are patent-encumbered |
| No colour-management transform | sharp converted CMYK and wide-gamut pictures to sRGB. The Rust build keeps the ICC profile in JPEG/PNG/WebP outputs (so colours stay right there); AVIF/TIFF/BMP outputs and CMYK JPEG inputs can look different |

**Licence notes.**
- MPL-2.0 crates used unmodified by Tauri (cssparser, selectors, dtoa-short, option-ext) are allowed: MPL is file-level
  copyleft and applies only to changes of those files. `check:licenses` permits MPL and rejects GPL/LGPL/AGPL-only crates.
- The bundled FFmpeg builds are GPL (x264/x265). They run as separate programs. Before a public release the owner must
  either ship the GPL notice plus a source offer, or switch to LGPL-only builds (THIRD_PARTY_NOTICES.md).

**Open questions — verify on real machines (Phase 10):**
1. macOS: PDFium shipped as a framework, signed by `tauri build` with the hardened runtime and notarized; it must load in
   the notarized app (Task 9.3, G.2).
2. macOS and Windows: the overlay must appear **without taking focus** during a global drag (`orderFrontRegardless`,
   `SW_SHOWNOACTIVATE`), so the drop still reaches the wheel.
3. Windows with two monitors at different scaling (e.g. 100 % and 150 %): the overlay must open fully inside the monitor
   under the pointer.
4. Windows: the WebView2 offline installer makes the setup file about 130 MB larger. If that is too big, switch
   `webviewInstallMode` to `downloadBootstrapper` — but then installing needs the internet (the app itself stays offline).
5. Windows: the NSIS installer's options (install folder, desktop shortcut) differ from the old electron-builder installer;
   the owner decides whether that is acceptable.
6. GitHub's `macos-15-intel` runner is announced until August 2027; after that Intel Mac builds need another machine.

## Appendix G — Manual test checklists

Copy the list for your OS into `rewrite/PROGRESS.md` and tick each item, or write what happened instead. Use a mix of
small and large files, names with spaces and non-English characters (`ảnh chụp 1.jpg`), and a folder.

**On every OS** (do these first):

- [ ] The installed app's self-test passes: `--selftest` (Task 9.5 / 10.x).
- [ ] The main window appears without a white flash; the Convert, Formats and Settings tabs work; light and dark theme.
- [ ] Drop one PNG on the window → the wheel opens at the pointer → **WEBP** → the file appears next to the original;
      the activity list shows it; "Show in folder" works.
- [ ] Drop three files of different kinds, and a folder → the wheel shows the right targets.
- [ ] Hold Alt (Option) while dropping → the Tools ring opens.
- [ ] One conversion per kind: MP4 → MOV, WAV → MP3, iPhone HEIC → JPG, PDF → DOCX, PDF → EPUB, TXT → PDF, SRT → VTT.
- [ ] Tools with previews: Video Trim (video plays and seeks), Image Crop and Edit (preview updates), PDF Organize (drag
      pages into a new order), Merge PDFs and Collage (reorder rows by dragging), Audio Normalize.
- [ ] OCR: a scanned PDF → searchable PDF; the text can be selected and searched in a PDF viewer.
- [ ] Cancel a long video compression → the job stops, no half-written file is left.
- [ ] An existing output name gets a new name (`photo (2).webp`); the original is never changed.
- [ ] Settings: sound effects (the first click enables sound), custom output folder (folder picker), notify when done,
      reveal when done, launch at login (check the OS login items), number of jobs at the same time.
- [ ] A notification appears when a job finishes while the window is in the background.
- [ ] With "Close to tray" on, closing the main window keeps the app running in the tray/menu bar; "Open Alohamora"
      brings it back; "Quit Alohamora" ends it. With it off, closing the window quits.
- [ ] Start the app a second time with a file argument (or "Open With") → the running app opens the wheel; no second
      app starts.
- [ ] **Offline:** turn off Wi-Fi/Ethernet, restart the app, repeat a few conversions → everything works. With the network
      on, watch connections (Windows: Resource Monitor → Network; macOS: `nettop -p alohamora`; Linux:
      `ss -tpn | grep alohamora`) → the app opens **no** connection.

**G.1 Windows 10 / 11**

- [ ] Install `Alohamora_0.2.0_x64-setup.exe` on a PC **without internet** (WebView2 offline installer) → installs and
      starts.
- [ ] Title bar: the minimize/maximize/close buttons work; dragging the title bar moves the window; double-click maximizes.
- [ ] Settings → "Send to": Explorer → right-click a file → Send to → Alohamora opens the wheel.
- [ ] Settings → right-click menu: the "Alohamora" verb appears for files and opens the wheel; turning it off removes it.
- [ ] Global drag wheel: start dragging a file in Explorer, hold Shift → the wheel appears at the pointer and Explorer
      keeps the focus; Alt switches to Tools; dropping on a slice runs it; releasing elsewhere hides the wheel.
- [ ] Two monitors with different scaling (100 % + 150 %): the wheel opens fully on the monitor under the pointer.
- [ ] Hardware encoding: on a PC with NVIDIA/Intel/AMD graphics, Settings → "Use hardware video encoding" says
      "Using h264_…" and video conversion is faster.
- [ ] HEIC output after copying `heif-enc.exe` and its DLLs into `%APPDATA%\com.alohamora.app\heif\` (README).
- [ ] No console windows flash up during conversions.
- [ ] Uninstall → the Send To shortcut, the right-click verb and the login entry are gone.

**G.2 macOS 11+ (Apple Silicon and Intel)**

- [ ] The `.dmg` opens; the app starts without a Gatekeeper warning (notarized build) or after "Open Anyway" (ad-hoc).
- [ ] The traffic lights sit inside the title bar; the window drags by its title bar.
- [ ] Menus: ⌘, opens Settings; ⌘Q quits; copy/paste works in text fields (Edit menu).
- [ ] The menu-bar icon is visible in light and dark menu bars; its menu works.
- [ ] Settings → "Show in Dock" off (menu-bar-only mode) and on again.
- [ ] Drop files on the Dock icon, and Finder → right-click → Open With → Alohamora → the wheel opens.
- [ ] Global drag wheel (Swift helper): drag a file in Finder, hold Shift → the wheel shows the real file; Option picks
      Tools; dropping on a slice runs it; Finder keeps the focus.
- [ ] HEIC output (via `sips`) and iPhone HEIC input.
- [ ] Settings → "Use hardware video encoding" says "Using h264_videotoolbox".
- [ ] PDFs work in the **notarized** build (PDFium framework loads) — PDF → PNG, Merge, OCR.
- [ ] Repeat the "every OS" list on the other CPU type (Intel or Apple Silicon), using the CI artifact.

**G.3 Linux (Ubuntu 22.04+, X11 and Wayland)**

- [ ] `sudo apt install ./Alohamora_0.2.0_amd64.deb` installs the dependencies; the AppImage starts after `chmod +x`.
- [ ] Files/Dolphin → right-click an image → Open With → Alohamora → the wheel opens.
- [ ] Settings → right-click menu: the Nautilus script (Scripts → "Convert with Alohamora") and the Dolphin service
      menu work; turning the setting off removes them.
- [ ] Settings → launch at login creates `~/.config/autostart/alohamora.desktop`; turning it off removes it.
- [ ] X11: the global drag wheel works (Shift while dragging). Wayland: the setting has no effect, nothing breaks.
- [ ] Video previews play (with `gstreamer1.0-plugins-good` and `gstreamer1.0-libav` installed).
- [ ] The wheel window is transparent (compositing desktop).
- [ ] HEIC output works with `libheif-examples` + `libheif-plugin-x265`, and is hidden without them.
- [ ] The tray icon shows a menu (GNOME: with the AppIndicator extension).
