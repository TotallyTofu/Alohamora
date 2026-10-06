# Alohamora

An offline file converter for **Windows, macOS and Linux** with a spinning-wheel interface. Drop a file, pick a slice, and the
result is saved next to the original. Nothing is uploaded; there is no account, telemetry or auto-update.

- **Convert** images, video, audio, PDFs, EPUB, text and subtitles (see the *Formats* tab for the full matrix).
- **Tools** (hold Shift + Alt, or ⇧⌥ on a Mac): compress, trim, crop, redact, normalize, OCR, merge, organize and more.
- One TypeScript codebase: Electron + React + Vite. FFmpeg, libvips (sharp), pdf.js, pdf-lib and Tesseract do the work.

Design notes live in `OUTLINE.md`; the build plan is `PLAN.md`; the build log (what was verified and where) is `PROGRESS.md`.

## Running it from source

Requirements: Node 22+, and Git. On Linux install the Electron libraries first
(`sudo apt install libgtk-3-0 libnss3 libxss1 libasound2t64 libgbm1 libxtst6 libnotify4`).

```
npm install
npm run fetch-binaries     # FFmpeg + OCR data for this OS (needs internet once; the app itself stays offline)
npm run check-binaries
npm run dev
```

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | Unit tests (pure logic) |
| `npm run typecheck` | Type-check the main/preload and renderer projects |
| `npm run selftest` | End-to-end self-test: real files through every conversion and tool (`-- --only=av` for one group) |
| `npm run dist:win` / `dist:mac` / `dist:linux` | Package an installer for the current OS (see below) |

## HEIC output

HEIC *input* works everywhere. HEIC *output* needs an encoder, which patents keep out of the bundled libraries:

- **macOS:** built in (`sips`), nothing to do.
- **Windows:** download a Windows build of libheif that includes `heif-enc.exe`, and copy `heif-enc.exe` **and every `.dll`
  next to it** into `resources/bin/win32-x64/heif/`. Restart Alohamora. The *Formats* tab shows HEIC struck through until then.
- **Linux:** `sudo apt install libheif-examples` (Debian/Ubuntu) or `sudo dnf install libheif-tools` (Fedora).

## Packaging

Each OS builds on itself (the native `sharp` binaries are per-OS and per-CPU):

```
npm run dist:win      # NSIS installer + portable .exe in dist/
npm run dist:mac      # DMG + ZIP (set CSC_IDENTITY_AUTO_DISCOVERY=false for an unsigned build)
npm run dist:linux    # AppImage + .deb
```

A packaged app can test itself: run `Alohamora.exe --selftest` and read `<temp>/alohamora-selftest/report.json`.
`.github/workflows/build.yml` builds and self-tests all platforms. Unsigned builds show one OS warning on first launch
(SmartScreen, Gatekeeper); see PLAN.md Task 13.6 for signing and notarization.

## Platform notes

| | Windows | macOS | Linux |
|---|---|---|---|
| Global "drag + Shift" wheel | yes (not over apps running as administrator) | yes, shows your real file before you drop | X11 only (not possible on Wayland) |
| File-manager entry | Send to + right-click | Open With, Dock drop | Open With, Nautilus script, Dolphin menu |
| Hardware video encoding | NVENC / Quick Sync / AMF | VideoToolbox | NVENC |

Troubleshooting tips are in `PLAN.md` Appendix D.

## Licences

See `THIRD_PARTY_NOTICES.md`. The bundled FFmpeg builds are GPL; read that file before distributing Alohamora.
