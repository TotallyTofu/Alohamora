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
