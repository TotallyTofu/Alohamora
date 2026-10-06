# Third-party notices

Alohamora is built from the open-source components below. Each keeps its own licence. Alohamora runs entirely on your computer and
contacts no servers.

| Component | Licence | Note |
|---|---|---|
| Electron / Chromium | MIT / BSD-style | Application runtime |
| FFmpeg (gyan.dev "essentials" build on Windows; Martin Riedl builds on macOS and Linux) | **GPL** (includes x264 / x265) | See `bin/LICENSE-ffmpeg.txt`. The source code is available from https://ffmpeg.org and from the build providers. |
| alohamora-drag-helper (macOS) | Alohamora's own code | Reads only the drag pasteboard and modifier-key state |
| sharp / libvips | Apache-2.0 / LGPL-3.0 | Image processing |
| heic-decode / libheif | ISC / LGPL-3.0 | HEIC input |
| heif-enc (optional, not bundled) | LGPL-3.0 + x265 GPL-2.0 | Only if you install it yourself for HEIC output |
| pdf.js | Apache-2.0 | PDF rendering and text extraction |
| pdf-lib | MIT | PDF editing |
| docx | MIT | Word output |
| JSZip | MIT (dual MIT / GPLv3) | EPUB and DOCX packaging |
| fast-xml-parser | MIT | EPUB package parsing |
| exifr | MIT | Reading photo metadata |
| piexifjs | MIT | Editing JPEG EXIF |
| imagetracerjs | Unlicense | Raster to SVG tracing |
| tesseract.js + traineddata (English, Vietnamese) | Apache-2.0 | OCR |
| uiohook-napi | MIT | Global drag-wheel gesture on Windows and Linux/X11 |
| React, zustand | MIT | User interface |
| lucide-react | ISC | Icons |
| Inter font | SIL OFL 1.1 | Typeface |

## FFmpeg and the GPL

The FFmpeg builds used here are licensed under the GNU General Public License because they include the x264 and x265 encoders.
That is fine for personal use. **Before distributing Alohamora publicly**, either ship the GPL notice and an offer of the
corresponding source code (the licence text is in `bin/LICENSE-ffmpeg.txt`), or switch to an LGPL-only FFmpeg build (which has
no x264 / x265, so H.264 / H.265 encoding would then rely on hardware encoders or a different codec).

Alohamora starts FFmpeg as a separate program and does not link against it.
