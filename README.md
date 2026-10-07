# Alohamora

An offline file converter for **Windows, macOS and Linux** with a spinning-wheel interface. Drop a file, pick a slice, and the
result is saved next to the original. Nothing is uploaded; there is no account, telemetry or auto-update.

- **Convert** images, video, audio, PDFs, EPUB, text and subtitles (see the *Formats* tab for the full matrix).
- **Tools** (hold Shift + Alt, or ⇧⌥ on a Mac): compress, trim, crop, redact, normalize, OCR, merge, organize and more.
- One TypeScript codebase: Electron + React + Vite. FFmpeg, libvips (sharp), pdf.js, pdf-lib and Tesseract do the work.

Design notes live in `OUTLINE.md`; the build plan is `PLAN.md`; the build log (what was verified and where) is `PROGRESS.md`.

## Running it from source

Requirements: Node 22+, and Git. On Linux install the Electron libraries first
(`sudo apt install libgtk-3-0 libnss3 libxss1 libasound2t64 libgbm1 libxtst6 libnotify4`). On macOS install the Xcode
Command Line Tools (`xcode-select --install`): `fetch-binaries` uses `swiftc` to build the drag helper, and packaging uses
`codesign`. On Apple Silicon use an **arm64** Node (`node -p process.arch` must print `arm64`, not `x64`).

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
npm run dist:mac      # DMG + ZIP; needs a signing identity, see "Building for macOS" below
npm run dist:linux    # AppImage + .deb
```

### Building for macOS

`npm run dist:mac` signs with your Developer ID when one is installed (see PLAN.md Task 13.6 for signing and notarization).
Without one, build an **ad-hoc signed** app, which is what you want for your own Mac or for testing:

```
npm run build
npx electron-builder --mac -c.mac.identity=- -c.directories.output="$HOME/alohamora-build/dist"
```

- **Do not use `CSC_IDENTITY_AUTO_DISCOVERY=false` on its own.** It skips signing altogether and leaves the renamed app with
  an invalid signature (`codesign --verify` fails). A copy downloaded from the internet is then reported as *"is damaged and
  can't be opened"* instead of the normal *unidentified developer* prompt.
- **Keep the output folder out of iCloud.** If the project is in `~/Desktop` or `~/Documents` with iCloud Drive sync on, macOS
  adds Finder attributes to the build output and `codesign` fails with *"resource fork, Finder information, or similar
  detritus not allowed"*. The `-c.directories.output=...` above writes the DMG and ZIP to a folder that is not synced.
- The command builds for the CPU you are on (arm64 on Apple Silicon). An Intel build needs an Intel Mac or the CI runner.
- Check the result: `codesign --verify --deep --strict --verbose=2 "$HOME/alohamora-build/dist/mac-arm64/Alohamora.app"`.

### Self-test of a packaged app

A packaged app can test itself and writes a JSON report:

| OS | Command | Report |
|---|---|---|
| Windows | `Alohamora.exe --selftest` | `%TEMP%\alohamora-selftest\report.json` |
| macOS | `Alohamora.app/Contents/MacOS/Alohamora --selftest` | `$TMPDIR/alohamora-selftest/report.json` |

On an Apple Silicon Mac the result was `122 passed, 0 failed, 1 skipped` (the skip is the "no HEIC encoder" case, which
cannot run because `sips` provides an encoder).

`.github/workflows/build.yml` builds and self-tests all platforms. Unsigned or ad-hoc signed builds show one OS warning on
first launch. On macOS (Gatekeeper), open the app with right-click → Open, or use System Settings → Privacy & Security →
Open Anyway. An app you built on the same Mac has no quarantine flag and opens normally.

## Platform notes

| | Windows | macOS | Linux |
|---|---|---|---|
| Global "drag + Shift" wheel | yes (not over apps running as administrator) | yes, shows your real file before you drop | X11 only (not possible on Wayland) |
| File-manager entry | Send to + right-click | Open With, Dock drop | Open With, Nautilus script, Dolphin menu |
| Hardware video encoding | NVENC / Quick Sync / AMF | VideoToolbox | NVENC |

Troubleshooting tips are in `PLAN.md` Appendix D. Status of each platform (what has been run and what has not) is in the
"Verification status" section of `PROGRESS.md`.

## Licences

See `THIRD_PARTY_NOTICES.md`. The bundled FFmpeg builds are GPL; read that file before distributing Alohamora.
