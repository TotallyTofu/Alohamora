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

## Supported formats and tools

<img width="950" height="973" alt="image" src="https://github.com/user-attachments/assets/0c6c86e4-34ca-4b43-9e94-9dd446e425c0" />

Optional Settings for Image quality, resolution, and Audio bitrate quality can be changed in the Settings tab:

<img width="764" height="1439" alt="image" src="https://github.com/user-attachments/assets/61a22411-07db-4a0e-972b-03b5d1154ec6" />

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
| `npm run verify` | Everything below that needs no build: typecheck, Vitest, Rust tests and clippy. Run it before pushing |
| `npm test` | UI, shared-logic and build-script tests (Vitest) |
| `npm run typecheck` | Type-check the UI and shared TypeScript |
| `npm run test:rust` | Rust unit tests and the golden cases (`cargo test --workspace`) |
| `npm run lint:rust` | `cargo clippy` with warnings as errors, as in CI |
| `npm run selftest` | End-to-end self-test: real files through every conversion and tool (`-- --only=av` for one group) |
| `npm run gen:registry` | Regenerate `src/shared/registry/*.json` after changing formats, tools or defaults |
| `npm run check:offline` / `check:licenses` | The offline guarantee and the licence policy (CI runs both) |
| `npm run build` | Package installers for the current OS into `src-tauri/target/release/bundle/` |

### Tests

- **Unit tests** sit next to the code: `*.test.ts` files for TypeScript, `#[cfg(test)] mod tests` at the end of each Rust file.
- **Golden cases** (`src/shared/golden/*.json`): inputs and expected outputs for the logic that exists twice, once in TypeScript
  for the UI's previews and once in Rust for the real work (time codes, file names, page ranges, split points, subtitles, crop
  rectangles, collage layout, the edit pipeline, PDF reflow). `src/shared/golden.test.ts` and
  `src-tauri/crates/core/tests/golden.rs` run every case, so the two can never drift apart. When you fix a bug in one of these,
  add its input as a case first.
- **Self-test** (`npm run selftest`): real files through every conversion and tool, with the bundled FFmpeg, PDFium and Tesseract.

CI runs all three on Windows, macOS and Linux for every push and pull request.

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
| macOS | `.app` and `.dmg`; ad-hoc signed and not notarized unless signing secrets are set (see `rewrite/PLAN.md` Task 9.3). Tried by hand on Apple Silicon only; the Intel build is made by CI but has not been tried by hand |
| Linux | `.deb`, `.rpm` and AppImage |

A packaged app can test itself and writes a JSON report:

| OS | Command | Report |
|---|---|---|
| Windows | `alohamora.exe --selftest` | `%TEMP%\alohamora-selftest\report.json` |
| macOS | `Alohamora.app/Contents/MacOS/alohamora --selftest` | `$TMPDIR/alohamora-selftest/report.json` |
| Linux | `alohamora --selftest` | `/tmp/alohamora-selftest/report.json` |

The self-test reuses any fixture files it already finds in its output folder. If results look wrong after an upgrade, run it
again with a fresh folder: `--selftest --out=<empty folder>`.

`.github/workflows/build.yml` builds, tests and self-tests all platforms (on Linux with networking switched off). Pushing a
tag such as `v0.3.0` also collects the installers into a draft GitHub Release with the notes in `.github/release-notes.md`; a
tag with a hyphen (`v0.3.0-beta.1`) is marked as a pre-release.

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

Alohamora's own source code is licensed under the [MIT License](LICENSE).

MIT covers only Alohamora's code. The app bundles and uses third-party components that keep their own licences: see
`THIRD_PARTY_NOTICES.md` (components) and `THIRD_PARTY_CRATES.md` (every Rust crate and its licence).

**FFmpeg is GPL.** The bundled FFmpeg builds include the x264 and x265 encoders and are licensed under the GPL; the MIT licence
does not change that. Alohamora runs FFmpeg as a separate program and does not link against it. Before you distribute
installers publicly, either ship the GPL notice and an offer of the corresponding source code, or switch to an LGPL-only FFmpeg
build. The details are in the "FFmpeg and the GPL" section of `THIRD_PARTY_NOTICES.md`.
