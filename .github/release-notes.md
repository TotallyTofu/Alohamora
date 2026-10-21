Alohamora is an offline file converter: drop a file, pick a slice on the wheel, and the converted file is saved next to the
original. Nothing is uploaded and the app never goes online.

### Download the file for your computer

| Your computer | File to download (under **Assets** below) |
|---|---|
| Windows 10 or 11 | the one ending in `x64-setup.exe` |
| Mac with Apple Silicon (M1 or newer) | the one ending in `aarch64.dmg` |
| Mac with an Intel processor | the one ending in `x64.dmg` |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M…" is Apple Silicon, "Processor: …Intel…" is Intel.

### Installing

This build is not signed by Microsoft or Apple yet, so your computer warns you the first time.

- **Windows:** double-click the `setup.exe`. If you see "Windows protected your PC", click **More info** → **Run anyway**.
- **Mac:** open the `.dmg` and drag **Alohamora** into **Applications**. The first time you open it macOS refuses: go to
  System Settings → **Privacy & Security**, scroll down and click **Open Anyway**. If macOS says the app "is damaged and can't
  be opened", open Terminal, run `xattr -dr com.apple.quarantine /Applications/Alohamora.app` and open it again.

### Using it

- Drop files onto the Alohamora window (or click **Browse files**) and pick a format on the wheel.
- Or start dragging a file anywhere and hold **Shift**: the wheel pops up where you are. Hold **Shift + Alt** (⇧⌥ on a Mac)
  for tools such as compress, trim and crop.

Found a bug or something confusing? Please [open an issue](https://github.com/TotallyTofu/Alohamora/issues) saying what you
did and what happened.

### Licences

Alohamora's own code is MIT-licensed. The app bundles FFmpeg, which is licensed under the GPL; its licence text is installed
with the app (`LICENSE-ffmpeg.txt`). FFmpeg source code: https://ffmpeg.org/download.html. The bundled builds come from
https://www.gyan.dev/ffmpeg/builds/ (Windows), https://www.osxexperts.net/ (macOS) and https://ffmpeg.martin-riedl.de/ (Linux).
Every other component and its licence is listed in `THIRD_PARTY_NOTICES.md`.
