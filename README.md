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
