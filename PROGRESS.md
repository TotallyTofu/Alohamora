# Kabooks — progress log
Legend: [x] done · [~] partial (see notes) · [ ] todo
Platform: win32-x64 (Node v22.19.0, npm 10.9.3, Windows 11). Developed and verified on Windows only.
Blocked: (write here if something blocks you)

## Phase 0 — Scaffold
- [x] 0.1 Repo init
- [x] 0.2 package.json & deps
- [x] 0.3 TS / electron-vite / Vitest config
- [x] 0.4 Hello window
- [x] 0.5 Vitest smoke
## Phase 1 — Shared core
- [ ] 1.1 types  - [ ] 1.2 formats  - [ ] 1.3 tools/toolOptions  - [ ] 1.4 geometry  - [ ] 1.5 naming
- [ ] 1.6 time/pageRanges  - [ ] 1.7 subtitles  - [ ] 1.8 text  - [ ] 1.9 wheelItems  - [ ] 1.10 overlay/ipc
## Phase 2 — Binaries
- [ ] 2.1 fetch-binaries  - [ ] 2.2 pdf.js assets  - [ ] 2.3 heif-enc (optional): enabled? yes/no  - [ ] 2.4 paths/log/errors/process/capabilities
## Phase 3 — Main foundation
- [ ] 3.1 security/protocol  - [ ] 3.2 settings  - [ ] 3.3 ffmpeg runner  - [ ] 3.4 inspect/thumbnails  - [ ] 3.5 jobs
- [ ] 3.6 engine window  - [ ] 3.7 windows  - [ ] 3.8 IPC/preload  - [ ] 3.9 index/notify  - [ ] 3.10 foundation check
## Phase 4 — AV + self-test
- [ ] 4.1 ffmpegArgs  - [ ] 4.2 av converter  - [ ] 4.3 selftest harness (av: __ passed / __ failed)
## Phase 5 — UI & wheel (M1)
- [ ] 5.1 tokens  - [ ] 5.2 components  - [ ] 5.3 geometry  - [ ] 5.4 Wheel  - [ ] 5.5 overlay
- [ ] 5.6 stages  - [ ] 5.7 main window  - [ ] 5.8 options/panels  - [ ] 5.9 M1 acceptance
## Phase 6 — Conversions (M2)
- [ ] 6.1 images raster  - [ ] 6.2 SVG  - [ ] 6.3 HEIC out  - [ ] 6.4 img→PDF/DOCX  - [ ] 6.5 subtitles/TXT→cues
- [ ] 6.6 print/engine/TXT→PDF  - [ ] 6.7 PDF→images  - [ ] 6.8 reflow/TXT  - [ ] 6.9 PDF→DOCX  - [ ] 6.10 PDF→EPUB
- [ ] 6.11 EPUB→PDF  - [ ] 6.12 OCR  - [ ] 6.13 M2 full matrix
## Phase 7 — Video tools (M3a)
- [ ] 7.1 previews  - [ ] 7.2 editors  - [ ] 7.3 videoArgs  - [ ] 7.4 compress  - [ ] 7.5 trim/split
- [ ] 7.6 crop  - [ ] 7.7 speed/mute  - [ ] 7.8 snapshot  - [ ] 7.9 redact  - [ ] 7.10 metadata/join  - [ ] 7.11 M3a
## Phase 8 — Audio tools (M3b)
- [ ] 8.1 waveform  - [ ] 8.2 audioArgs  - [ ] 8.3 compress/channels  - [ ] 8.4 normalize  - [ ] 8.5 trim
- [ ] 8.6 visualize/bleep  - [ ] 8.7 metadata/join  - [ ] 8.8 M3b
## Phase 9 — Image tools (M4)
- [ ] 9.1 preview pipeline  - [ ] 9.2 compress/resize  - [ ] 9.3 crop  - [ ] 9.4 edit  - [ ] 9.5 backdrop
- [ ] 9.6 redact  - [ ] 9.7 metadata  - [ ] 9.8 collage  - [ ] 9.9 make PDF  - [ ] 9.10 M4
## Phase 10 — PDF tools (M5)
- [ ] 10.1 merge/split  - [ ] 10.2 organize  - [ ] 10.3 images  - [ ] 10.4 compress  - [ ] 10.5 OCR
- [ ] 10.6 word  - [ ] 10.7 metadata  - [ ] 10.8 subtitle shift + M5
## Phase 11 — Desktop integration (M6)  — mark OS-specific tasks "Not verified on <OS>" if you can't test them
- [ ] 11.1 argv/open-file  - [ ] 11.2 [Win] Send to  - [ ] 11.3 [Win] context menu  - [ ] 11.4 tray/menu bar/login/icons
- [ ] 11.5 [Win/Linux-X11] global drag (uiohook)  - [ ] 11.6 global drag (UI)  - [ ] 11.7 [Mac] Swift drag helper
- [ ] 11.8 [Mac] Open With/Dock/menu bar/vibrancy  - [ ] 11.9 [Linux] Nautilus/Dolphin  - [ ] 11.10 M6 acceptance (my OS: ____)
## Phase 12 — Polish
- [ ] 12.1 formats  - [ ] 12.2 settings  - [ ] 12.3 activity  - [ ] 12.4 a11y/dark  - [ ] 12.5 errors  - [ ] 12.6 housekeeping  - [ ] 12.7 hardware video
## Phase 13 — Packaging (M7)
- [ ] 13.1 builder config  - [ ] 13.2 packaged selftest (my OS)  - [ ] 13.3 notices  - [ ] 13.4 release checklist  - [ ] 13.5 CI (Win / Mac arm64 / Mac x64 / Linux green?)  - [ ] 13.6 signing (optional)

## Notes & deviations
- (date) Task X.Y — note
- 2026-10-06 Tasks 0.2,0.3,0.4,0.5 — Deviations: electron-vite 5 needs vite<=7, so installed vite@7, @vitejs/plugin-react@5 (v6 needs vite 8), @types/node@22. typescript resolved to 7.x which removed baseUrl: tsconfig paths now use './src/...' without baseUrl. Preload builds as .js (not .mjs). Built app launches (smoke-tested).
