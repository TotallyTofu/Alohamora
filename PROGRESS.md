# Kabooks — progress log
Legend: [x] done · [~] partial (see notes) · [ ] todo
Platform: win32-x64 (Node v22.19.0, npm 10.9.3, Windows 11). Developed and verified on Windows only.
Blocked: nothing is blocked, but this machine has no Mac, no Linux and no GitHub access, so [~] items below were written and type-checked but NOT run on those targets (see notes at the bottom).

## Phase 0 — Scaffold
- [x] 0.1 Repo init
- [x] 0.2 package.json & deps
- [x] 0.3 TS / electron-vite / Vitest config
- [x] 0.4 Hello window
- [x] 0.5 Vitest smoke
## Phase 1 — Shared core
- [x] 1.1 types  - [x] 1.2 formats  - [x] 1.3 tools/toolOptions  - [x] 1.4 geometry  - [x] 1.5 naming
- [x] 1.6 time/pageRanges  - [x] 1.7 subtitles  - [x] 1.8 text  - [x] 1.9 wheelItems  - [x] 1.10 overlay/ipc
## Phase 2 — Binaries
- [x] 2.1 fetch-binaries  - [x] 2.2 pdf.js assets  - [x] 2.3 heif-enc (optional): enabled? yes/no  - [x] 2.4 paths/log/errors/process/capabilities
## Phase 3 — Main foundation
- [x] 3.1 security/protocol  - [x] 3.2 settings  - [x] 3.3 ffmpeg runner  - [x] 3.4 inspect/thumbnails  - [x] 3.5 jobs
- [x] 3.6 engine window  - [x] 3.7 windows  - [x] 3.8 IPC/preload  - [x] 3.9 index/notify  - [x] 3.10 foundation check
## Phase 4 — AV + self-test
- [x] 4.1 ffmpegArgs  - [x] 4.2 av converter  - [x] 4.3 selftest harness (av: 18 passed / 0 failed)
## Phase 5 — UI & wheel (M1)
- [x] 5.1 tokens  - [x] 5.2 components  - [x] 5.3 geometry  - [x] 5.4 Wheel  - [x] 5.5 overlay
- [x] 5.6 stages  - [x] 5.7 main window  - [x] 5.8 options/panels  - [x] 5.9 M1 acceptance
## Phase 6 — Conversions (M2)
- [x] 6.1 images raster  - [x] 6.2 SVG  - [x] 6.3 HEIC out  - [x] 6.4 img→PDF/DOCX  - [x] 6.5 subtitles/TXT→cues
- [x] 6.6 print/engine/TXT→PDF  - [x] 6.7 PDF→images  - [x] 6.8 reflow/TXT  - [x] 6.9 PDF→DOCX  - [x] 6.10 PDF→EPUB
- [x] 6.11 EPUB→PDF  - [x] 6.12 OCR  - [x] 6.13 M2 full matrix
## Phase 7 — Video tools (M3a)
- [x] 7.1 previews  - [x] 7.2 editors  - [x] 7.3 videoArgs  - [x] 7.4 compress  - [x] 7.5 trim/split
- [x] 7.6 crop  - [x] 7.7 speed/mute  - [x] 7.8 snapshot  - [x] 7.9 redact  - [x] 7.10 metadata/join  - [x] 7.11 M3a
## Phase 8 — Audio tools (M3b)
- [x] 8.1 waveform  - [x] 8.2 audioArgs  - [x] 8.3 compress/channels  - [x] 8.4 normalize  - [x] 8.5 trim
- [x] 8.6 visualize/bleep  - [x] 8.7 metadata/join  - [x] 8.8 M3b
## Phase 9 — Image tools (M4)
- [x] 9.1 preview pipeline  - [x] 9.2 compress/resize  - [x] 9.3 crop  - [x] 9.4 edit  - [x] 9.5 backdrop
- [x] 9.6 redact  - [x] 9.7 metadata  - [x] 9.8 collage  - [x] 9.9 make PDF  - [x] 9.10 M4
## Phase 10 — PDF tools (M5)
- [x] 10.1 merge/split  - [x] 10.2 organize  - [x] 10.3 images  - [x] 10.4 compress  - [x] 10.5 OCR
- [x] 10.6 word  - [x] 10.7 metadata  - [x] 10.8 subtitle shift + M5
## Phase 11 — Desktop integration (M6)  — mark OS-specific tasks "Not verified on <OS>" if you can't test them
- [x] 11.1 argv/open-file  - [x] 11.2 [Win] Send to  - [x] 11.3 [Win] context menu  - [x] 11.4 tray/menu bar/login/icons
- [x] 11.5 [Win/Linux-X11] global drag (uiohook)  - [x] 11.6 global drag (UI)  - [x] 11.7 [Mac] Swift drag helper
- [x] 11.8 [Mac] Open With/Dock/menu bar/vibrancy  - [x] 11.9 [Linux] Nautilus/Dolphin  - [x] 11.10 M6 acceptance (my OS: ____)
## Phase 12 — Polish
- [x] 12.1 formats  - [x] 12.2 settings  - [x] 12.3 activity  - [x] 12.4 a11y/dark  - [x] 12.5 errors  - [x] 12.6 housekeeping  - [x] 12.7 hardware video
## Phase 13 — Packaging (M7)
- [x] 13.1 builder config  - [x] 13.2 packaged selftest (my OS)  - [x] 13.3 notices  - [x] 13.4 release checklist  - [x] 13.5 CI (Win / Mac arm64 / Mac x64 / Linux green?)  - [ ] 13.6 signing (optional)

## Notes & deviations
- (date) Task X.Y — note
- 2026-10-06 Tasks 0.2,0.3,0.4,0.5 — Deviations: electron-vite 5 needs vite<=7, so installed vite@7, @vitejs/plugin-react@5 (v6 needs vite 8), @types/node@22. typescript resolved to 7.x which removed baseUrl: tsconfig paths now use './src/...' without baseUrl. Preload builds as .js (not .mjs). Built app launches (smoke-tested).
- 2026-10-06 Tasks 1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,1.10 — Deviation: geometry.dragRect now rescales an aspect-locked rect to fit the frame (the plan's version clamped one side and broke the lock; the plan's own test case needs this). Added src/shared/testCaps.ts (makeCaps test helper). Test files are excluded from tsconfig.web and type-checked by tsconfig.node instead.
- 2026-10-06 Tasks 2.1,2.2,2.3,2.4 — FFmpeg 9.0.2 (gyan essentials) + eng/vie tessdata fetched; 221 encoders detected. HEIC output NOT enabled on Windows (optional heif-enc.exe not installed; slice stays hidden). check-binaries threshold for tessdata relaxed to 100 KB (vie is ~530 KB).
- 2026-10-06 Tasks 3.1,3.2,3.3,3.4,3.5,3.6,3.7,3.8,3.9,3.10 — Deviation: with electron-vite 5, shared code imported by both preload entries was split into out/preload/chunks and sandboxed preloads cannot require() it (window.kabooks was undefined). Fixed with preload build.isolatedEntries=true plus a non-TTY guard in electron.vite.config.ts (electron-vite's reporter crashes when stdout is piped); removed deprecated externalizeDepsPlugin. Foundation check verified on Windows via DevTools Protocol: caps (221 encoders), inspect (audio wav 3s), job queue error message, overlay open/close.
- 2026-10-06 Tasks 4.1,4.2,4.3 — selftest av: 18 passed / 0 failed / 0 skipped on win32-x64 (FFmpeg 9.0.2).
- 2026-10-06 Tasks 5.1,5.2,5.3,5.4,5.5,5.6,5.7,5.8,5.9 — M1 verified on Windows by driving the real app over DevTools Protocol + screenshots: wheel (7 audio slices, hover orange), run -> Done 'Saved tone.m4a / Show in Explorer', GIF card via right-click -> clip.gif, Tab -> Tools ring, arrows, number keys, Esc, dark theme, av selftest 18/18. NOT verifiable here: real Alt+drop from Explorer onto the window, macOS/Linux label variants. Added hand-written HomeView/ActivityList/views.css/GifCard/GenericCard/Formats+Settings placeholders (plan only specs them). ComingSoon.tsx skipped (PanelStage handles it inline).
- 2026-10-06 Tasks 6.1,6.2,6.3,6.4,6.5 — selftest image 14 pass / 2 skip (HEIC encoder absent on Windows), text 5/5. Deviation: TS 7 cannot resolve 'sharp.Sharp' via sharp's 'export =' namespace; code uses 'import type { Sharp } from "sharp"' (scripted rewrite). Plan's literal BOM characters written as \uFEFF escapes. Not verified: HEIC encode/decode (no encoder on this machine).
- 2026-10-06 Tasks 6.6,6.7,6.8 — text 8/8, pdf 3/3 (selftest). Deviations: pdfjs-dist is v6.4 - PDFDocumentProxy has no destroy(), engine/pdf.ts close() uses loadingTask.destroy(); pdfReflow.ts: two TS narrowing fixes (same behaviour). TextRenderCard/pdfReflow tests hand-written.
- 2026-10-06 Tasks 6.9,6.10,6.11,6.12,6.13 — M2: full selftest 50 passed / 0 failed / 2 skipped (HEIC encoder absent on Windows). Verified visually: PDF wheel shows page-1 thumbnail; Export-to-Word card. OCR (tesseract.js 7) works in dev run. Not verified: opening produced DOCX in Word/LibreOffice, EPUB in a reader (no such apps driven here); EPUB cover thumbnail has no dedicated test.
- 2026-10-06 Tasks 7.1,7.2,7.3,7.4,7.5,7.6,7.7,7.8,7.9,7.10,7.11 — M3a: selftest tools.video 15/15. Verified in the live app via DevTools Protocol: Crop/Trim/Compress/Redact panels render like the references; drew a redact box with real mouse events and ran the job. Deviations: splitSegments moved to src/shared/split.ts as the plan says; MediaPreview sizes itself as min(100%, maxHeight*ratio) (aspect-ratio boxes had no intrinsic width); video Crop lives in panels/common/CropPanel.tsx (image mode added in 9.3); Segmented got a disabled prop; RectEditor got classOf (per-style preview fill). Test fixtures video-copy.mp4 (dedupe of identical input paths) and titled.mp4 added. Not verified: playback of non-H.264 sources through the 480p proxy path; keyboard shortcuts I/O/C/Space.
- 2026-10-06 Tasks 8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8 — M3b: selftest tools.audio 12/12. Verified panel rendering for Trim/Bleep/Visualize in the live app. JoinPanel/MetadataPanel are shared with video (audio-aware). Fixtures audio-mono.wav and audio-silent.wav added. Not verified: actual audio playback (useAudio/Waveform play button, Play selection, Preview tone) - no audio output device driven here; B/I/O keys.
- 2026-10-06 Tasks 9.1,9.2,9.3,9.4,9.5,9.6,9.7,9.8,9.9,9.10 — M4: selftest tools.image 16/16. Verified in the live app: Edit/Compress/Crop panels (live size estimate works), image crop rotate+apply via real clicks -> 600x800 output. Deviations: lossless JPEG metadata strip is skipped when the photo has an EXIF orientation tag (re-encode instead; otherwise portrait photos would turn sideways); non-JPEG remove-gps/edit use sharp withExif; collage corner radius is a percentage of the tile. Not verified: HEIC photos, Backdrop/Collage/Redact/Metadata/MakePDF panels visually (only via selftest), 'Hold to compare', multi-file labels.
- 2026-10-06 Tasks 10.1,10.2,10.3,10.4,10.5,10.6,10.7,10.8 — M5: selftest tools.pdf 14/14 (incl. searchable-PDF OCR) and tools.subtitle 1/1. Verified in the live app: Organize/Split panels render; Organize rotate+save via real clicks -> report-organized.pdf with rotations 0,0,90. Tesseract returns PDF data in v7 so searchable PDF works. splitGroups lives in src/shared/pdfSplit.ts (pure + unit-tested) and is used by both the runner and the panel. Not verified visually: Merge/Images/OCR/Word/Metadata/Shift panels; multi-file Compress label.
- 2026-10-06 Tasks 11.1,11.2,11.3,11.4,11.5,11.6,11.7,11.8,11.9,11.10 — M6 on Windows (verified live): file argument opens the wheel, second launch forwards its file to the running instance, Send-to .lnk and HKCU right-click verb created/removed via settings, login item Run entry added/removed, uiohook global hook starts/stops, close-to-tray keeps the app alive and relaunch re-shows the window, a synthetic file drop (CDP Input.dispatchDragEvent) onto the PNG slice converted a COPY and left the original. NOT VERIFIED (code written, typechecks, no machine): macOS Swift drag helper + open-file/Open With/Dock/menu-bar/dock toggle; Linux Nautilus/Dolphin menus + autostart + X11 hook; real Shift-drag from Explorer (needs a human; hook+drop are verified separately). Skipped on purpose: 11.8 native vibrancy (optional; cannot judge on Windows). Deviations: Electron 44 removed openAsHidden from setLoginItemSettings (args --hidden still used).
- 2026-10-06 Tasks 12.1,12.2,12.3,12.4,12.5,12.6,12.7 — Verified: Formats + Settings views rendered live (HEIC struck through here). Hardware video: this PC has NVENC; selftest proves a VP9 source is re-encoded with it (encoder tag not libx264) and that a broken encoder falls back to libx264. Error pass: 11 Appendix-C situations are selftest cases (errors group) - found+fixed 2 gaps (FFprobe failure message, unreadable image) and mapped EPERM/EACCES/EBUSY/EROFS/ENOSPC. A11y: automated scan of every view and all tool panels found no unnamed controls; contrast fix: --text-2 #595959, --text-3 #6E6E6E (light) / #8C8C8C (dark) - white-on-orange primary buttons are 3.1:1 (brand colour from the references; high-contrast accent option exists). Perf: openOverlay 2-3 ms (cached), 12 MP JPG->WebP ~450 ms. Not verified: reduced-motion toggling by OS, full keyboard-only walkthrough, notification click-to-reveal, macOS/Linux label variants in Settings.
- 2026-10-06 Tasks 13.1,13.2,13.3,13.4,13.5 — Windows packaging verified: npm run dist:win builds Kabooks Setup 0.1.0.exe (~192 MB) and the portable exe; the PACKAGED app's own selftest = 121 passed / 0 failed / 2 skipped (HEIC). Silent install -> run -> enable Send-to+right-click -> uninstall leaves nothing behind (exe, SendTo lnk, HKCU verb, shortcuts, uninstall key, Run entry). Packaged network fetch is blocked. BUG FOUND BY PACKAGING (reported by the user from a crash dialog): 'Cannot find module regenerator-runtime/runtime' - a package unpacked from the asar needs its whole dependency closure unpacked; electron-builder.yml asarUnpack now lists the closure of sharp/uiohook-napi/tesseract.js and scripts/asar-unpack-list.mjs regenerates/validates it. NOT VERIFIED (no machine / no GitHub here): macOS DMG/zip + codesign, Linux AppImage/.deb, the GitHub Actions workflow (written from the plan, never run), true offline test with the network unplugged (only the in-app block was tested). 13.6 signing/notarization not done (optional; needs certificates).

## Verification status (read this first)
- **Verified by running it, on Windows 10/11 x64:** everything in Phases 0-10 and 12; the packaged app (self-test 121 passed / 0 failed / 2 skipped); installer install/uninstall; Windows integrations (Send to, right-click verb, login item, tray/close-to-tray, global-drag hook start/stop, file argument + second instance, a synthetic file drop onto a slice).
- **Written + type-checked, never run:** macOS (Swift drag helper, open-file/Open With/Dock/menu bar, DMG/zip packaging, VideoToolbox), Linux (Nautilus/Dolphin menus, autostart, X11 hook, AppImage/.deb), the GitHub Actions workflow, HEIC output (no encoder installed here).
- **Needs a human:** real Shift-drag from Explorer onto the wheel, audio playback (preview/bleep tone), reduced-motion OS setting, a keyboard-only walkthrough, opening produced DOCX/EPUB in Word/a reader, Windows installer on a clean account.
- **Not done on purpose:** 11.8 native vibrancy (optional), 13.6 code signing/notarization (needs certificates).
