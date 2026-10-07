# Rust + Tauri rewrite — progress log

Plan: `rewrite/PLAN.md`. Tick a task only when its **Verify** block passed. One line of notes per task is enough.
Legend: [x] done · [~] done with notes · [ ] todo · [!] blocked

Machine: Windows 11 Pro 10.0.26200 x64 (Git Bash), Node 22.19.0, rustup 1.29.1 / Rust stable 1.99.0 (1.97.0 is pinned from Task 3.1), CMake 4.3.2, NASM 3.02, MSVC 19.44 (VS 2022 Community)

## Blocked
(nothing)

## Phase 0 — Preparation
- [x] 0.1 Install the build tools — rustup and NASM installed with winget; CMake, MSVC, Node were already present
- [x] 0.2 Tag the Electron build and start the progress log — `electron-last` already pointed at HEAD (144eec0); work is on branch `rust-tauri-rewrite`

## Phase 1 — Convert the user interface to Tauri
- [x] 1.1 Remove Electron; Vite + Tauri packages — npm ci installed tauri api/cli 2.12.1 and vite 7.3.7 (npm audit reports 1 dev-only advisory; versions are pinned by the plan)
- [x] 1.2 Remove EPUB as an input format — 13 shared test files / 101 tests pass
- [x] 1.3 Generate the registry JSON for Rust — registry ok: 29 formats, 36 tools
- [x] 1.4 The Tauri bridge (ipc.ts, api.ts, nativeDrop.ts) — type checking happens in Task 1.9
- [x] 1.5 Native drag-and-drop in the drop zone, home view and wheel
- [x] 1.6 Pointer-based reordering
- [x] 1.7 Window chrome and start-up
- [x] 1.8 Sound, panels and the formats page
- [~] 1.9 Check the whole UI — typecheck clean, 122 tests / 15 files pass, build:ui produces dist/renderer/index.html (TEMP must be inside the repo on this PC, see Notes)

## Phase 2 — Build scripts
- [x] 2.1 Fetch and check scripts
- [x] 2.2 Fetch the binaries — All required binaries OK (FFmpeg 9.0.2). On Windows run the script with the system tar first (PATH=/c/Windows/System32:$PATH node scripts/fetch-binaries.mjs): Git Bash's GNU tar reads C:\ as a remote host

## Phase 3 — Rust workspace and the core crate
- [x] 3.1 Workspace skeleton — rustc 1.97.0; cargo check -p alohamora-core OK
- [x] 3.2 core: js — 3 passed
- [x] 3.3 core: error — 6 passed
- [x] 3.4 core: util, naming, time, page_ranges — 15 passed
- [x] 3.5 core: geometry — 17 passed
- [x] 3.6 core: types, registry, options — 25 passed
- [x] 3.7 core: split, pdf_split — 27 passed
- [x] 3.8 core: text, subtitles — 33 passed
- [x] 3.9 core: collage_layout, edit_pipeline — 35 passed
- [x] 3.10 core: pdf_reflow — 38 passed
- [x] 3.11 core: ffmpeg_parse — 42 passed
- [x] 3.12 core: ffmpeg_args — 54 passed
- [x] 3.13 core: image_meta — 58 passed, clippy clean (core crate complete)

## Phase 4 — Engine foundation
- [x] 4.1 engine: cancel, paths, process, fsutil, par — cargo check -p alohamora-engine OK (needs TEMP/APPDATA inside the repo, see Notes)
- [x] 4.2 engine: ffmpeg — cargo check OK
- [x] 4.3 engine: settings — 1 passed
- [x] 4.4 engine: capabilities, hw_video — 2 passed

## Phase 5 — Images, PDFs and documents
- [x] 5.1 engine: image — cargo check OK
- [x] 5.2 engine: pdf — glyphless.ttf sha256 matches; cargo check OK
- [x] 5.3 engine: text_pdf — cargo check OK
- [x] 5.4 engine: docx, epub — cargo check OK

## Phase 6 — Inspection, previews, metadata, job context, OCR
- [x] 6.1 engine: thumbnails, inspect — cargo check OK
- [x] 6.2 engine: previews, image_preview, metadata — cargo check OK
- [x] 6.3 engine: job context — cargo check OK
- [x] 6.4 engine: ocr — 4 passed (OCR tessdata eng+vie bundled)

## Phase 7 — Converters, tools, job queue, self-test
- [x] 7.1 engine: converters and tools — cargo check OK
- [x] 7.2 engine: job execution and queue — cargo check OK
- [x] 7.3 engine: self-test — 4 passed, clippy clean (engine crate complete)
- [x] 7.4 Run the self-test — SELFTEST: 119 passed, 0 failed, 2 skipped (the 2 HEIC cases: no heif-enc on Windows). Run through cargo.sh (TEMP/APPDATA in the repo)

## Phase 8 — The Tauri app
- [x] 8.1 Tauri configuration and icons — icons generated with tauri icon; 5 JSON files parse
- [x] 8.2 app: state and platform helpers
- [x] 8.3 app: kfile protocol
- [x] 8.4 app: windows
- [x] 8.5 app: commands
- [x] 8.6 app: argv, tray, notifications
- [x] 8.7 app: OS integrations
- [~] 8.8 app: lib.rs, build and self-test through the app — build OK; app tests 3 passed; app self-test 119 passed, 0 failed, 2 skipped. Two owner-approved Windows fixes (paths.rs verbatim prefix, protocol.rs test) - see Notes
- [ ] 8.9 Run the app (manual) — NOT DONE, needs a person (drag-and-drop, windows, tray). An automated attempt (Vite + `alohamora.exe --hidden` from `src-tauri/target/debug`) stopped at start-up: `error while building Alohamora: PluginInitialization("log", "Access is denied. (os error 5)")`, because a program run from inside this Low-integrity folder cannot write to `%LOCALAPPDATA%\com.alohamora.app\logs` (see Notes). Run `npm run dev` yourself from a normal (not Low-integrity) copy of the folder, or install the build, and tick the 7 checks of Task 8.9.

## Phase 9 — Packaging, signing, CI, notices
- [x] 9.1 Notices, README, offline and licence checks — check:licenses: 673 crates, all permissive; check:offline passed (607 runtime crates)
- [~] 9.2 Continuous integration — workflow file written and Verify greps pass. NOT done: git push and the 4 green CI jobs (manual, outward-facing; waiting for the owner to push branch rust-tauri-rewrite)
- [~] 9.3 Signing and notarization (manual) — NOT done (manual, needs Apple/Windows signing credentials). Signing is postponed: macOS builds stay ad-hoc signed (signingIdentity "-"), Windows installer unsigned (SmartScreen warning)
- [~] 9.4 Lint and full test run — all checks pass (registry, typecheck, 122 UI tests, Rust 58+4+3, clippy -D warnings, check:offline) after one Windows-only clippy fix, see Notes
- [x] 9.5 Release build — npm run build OK (7m35s release compile): NSIS Alohamora_0.2.0_x64-setup.exe 284 MiB + MSI 311 MiB (targets all); release alohamora.exe --selftest: 119 passed, 0 failed, 2 skipped. Not tried: installing it (manual, and a Low-integrity installer cannot install here)

## Phase 10 — Verification on every OS and cut-over
- [ ] 10.1 Windows checks (manual) — self-test part done: `src-tauri/target/release/alohamora.exe --selftest --out=.selftest-win` = 119 passed, 0 failed, 2 skipped. NOT done: installing `Alohamora_0.2.0_x64-setup.exe` (284 MiB; the MSI is 311 MiB) and Appendix G.1 (needs a person and a PC outside this Low-integrity folder).
- [ ] 10.2 macOS checks (manual) — NOT done: no Mac was available. Run it on Apple Silicon and Intel (Appendix G.2).
- [ ] 10.3 Linux checks and cut-over — done: step 2 (old Electron docs moved to `docs/electron/`, `PLAN(old).md` and `OUTLINE(old).md` given the plan's names `PLAN.md` and `OUTLINE.md` as the owner chose) and step 3 (Verify block, below). NOT done: step 1 (Linux install and Appendix G.3, no Linux machine) and step 4 (merge to master, tag `v0.2.0`: the owner's decision).

## Notes and deviations
- **This PC: the repository folder is labelled Low integrity (found in Tasks 1.9 and 4.1).** `icacls .` shows
  `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)` on the repository root (not on its parents), so every file in it inherits that
  label and every program started from such a file (esbuild, Cargo build scripts, the tools they spawn) runs at Low integrity and
  **cannot write to `%TEMP%` or `%APPDATA%`**. Symptoms: `[vite:esbuild-transpile] remove ...\Temp\esbuild-<hash>: Access is denied.`,
  `LINK : fatal error LNK1104: cannot open file '...\Temp\lnk{...}.tmp'` (mozjpeg-sys, libwebp-sys, rav1e) and
  `tesseract-rs build.rs: Failed to create cache directory: Access is denied.` The same executable copied outside the repository works.
  The label was not changed (it looks like a deliberate sandbox boundary). Instead every build runs with its temp and app-data
  folders inside the repository (`.cache` is git-ignored):
  `TEMP=TMP=<repo>\.cache\tmp`, and for `cargo` also `APPDATA=<repo>\.cache\appdata` (tesseract-rs keeps its sources and builds in
  `%APPDATA%\tesseract-rs`, now `.cache\appdata\tesseract-rs`). Examples: `TEMP=$PWD/.cache/tmp TMP=$PWD/.cache/tmp npm run build:ui`
  and a small wrapper that exports those variables before `cargo ...`. Consequence for later tasks: a program built here (the app,
  the self-test) also starts at Low integrity, so it may not be able to write settings, caches or the WebView2 profile outside the
  repository; see the notes of Tasks 7.4 and 8.8.
- **Windows: `npm run fetch-binaries` needs the system `tar` (Task 2.2).** Git Bash's GNU `tar` reads `C:\...` as a remote host
  ("Cannot connect to C: resolve failed"). Run `PATH=/c/Windows/System32:$PATH node scripts/fetch-binaries.mjs`.
- **Two Windows fixes to plan code (Task 8.8; the owner approved them when asked).** The plan was validated on Linux only.
  1. `src-tauri/crates/engine/src/paths.rs`: `paths::init` now strips the `\\?\` prefix from `bin_dir` and `resource_dir`
     (new private `strip_verbatim`). Tauri returns `\\?\C:\...` on Windows and Tesseract cannot open `eng.traineddata` below such a
     folder: through the app binary `convert.pdf.scan-txt-ocr`, `tools.pdf.ocr-txt` and `tools.pdf.ocr-pdf` failed with
     `Text recognition failed | InitError` (116 passed, 3 failed) while the engine example, which got a plain path, passed.
  2. `src-tauri/src/protocol.rs`, test `urls_are_encoded`: it expected the Linux suffix `%2Ftmp%2Fa%20b%23c.mp4`; on Windows the
     URL of an absolute path ends `C%3A%5Ctmp%5Ca%20b%23c.mp4`. The test now uses a path and expected suffix per OS (no change to
     the code under test). The test count is unchanged (3 in the app, 4 in the engine).
- **Third Windows fix (Task 9.4) and a standing approval.** `src-tauri/src/integrations/windows.rs:56`: `cmd.set_string("", &format!(...))`
  became `cmd.set_string("", format!(...))` because `cargo clippy -D warnings` (clippy::needless_borrows_for_generic_args) rejects it.
  This code only compiles on Windows, so the Linux validation never linted it. The owner then approved, as a standing rule, minimal
  fixes for failures that appear only on Windows (lint, compile error or a test that expects Linux paths); each one is logged here.
- **Still to do by a person (everything the plan marks manual).** 8.9 run the app and tick its 7 checks; 9.2 `git push` the branch
  `rust-tauri-rewrite` and get four green CI jobs; 9.3 signing credentials (until then macOS is ad-hoc signed, the Windows installer
  unsigned); 10.1 install the NSIS setup and tick Appendix G.1 (and the "every OS" list); 10.2 Appendix G.2 on a Mac; 10.3 step 1
  (Linux, G.3) and step 4 (merge to `master`, tag `v0.2.0`). None of this could run on this PC: the repository folder is
  Low integrity, so a program built here cannot write the app's log, settings or WebView2 profile outside the folder.
- **Size.** `Alohamora_0.2.0_x64-setup.exe` is 284 MiB and the MSI 311 MiB (`bundle.targets` is "all"), far above the outline's
  budget of 110 MB. Most of it is two FFmpeg builds of about 105 MB each plus the 127 MB WebView2 offline installer
  (PLAN.md Appendix F, open question 4 lists the installer mode as the owner's choice).
- **After the owner's first manual test (2026-10-07).** Reported: "Browse files" works; dropping files from Explorer onto the app does
  nothing; the global drag wheel (Shift + drag) shows an empty wheel ("This file type isn't supported yet", 0 files) that never goes
  away. Found and fixed: `platform::windows::show_without_focus` shows the overlay with a direct `ShowWindow(SW_SHOWNOACTIVATE)`, so
  tao still thinks the window is hidden and `win.hide()` is a no-op (tao `apply_diff` returns early when the flags do not change,
  tao-0.37.1 `window_state.rs:318`); the overlay (also Esc and click-away) could never close. New `platform::hide` also calls
  `ShowWindow(SW_HIDE)`; `overlay::hide` uses it. NOT fixed yet: native file-drop events (`ev:drop`) do not reach the UI in either
  window, so the wheel never learns the dragged formats and drops are ignored. The log from the owner's run
  (`%LOCALAPPDATA%\com.alohamora.app\logs\Alohamora.log`) shows no drop activity. Possible causes: the app running with higher
  privileges than Explorer (UIPI blocks drops), or wry's OLE drop target not registered on WebView2's windows. Diagnostics added so the
  next run settles it: log lines `native drag-drop enter|drop|leave on '<window>': N path(s)`, `overlay: global drag started|ended`,
  `process integrity: Mandatory Label\<level>` and `drop targets on '<window>': <class>=drop target|none, ...`.
- **Second manual test (owner, MSI build with the diagnostics).** Works: dropping files on the main window (log: `native drag-drop
  enter/drop on 'main'`), right-click "Convert with Alohamora", the wheel now hides after a global drag (`overlay: hide`). The process is
  not elevated (`process integrity: Medium`). Still wrong: Shift + drag shows an empty wheel. Cause found in the log line
  `drop targets on 'overlay': ... Chrome_WidgetWin_1=none, Chrome_RenderWidgetHostHWND=none` (the main window has a drop target on all
  three WebView2 windows): wry registers its OLE drop target only on the WebView2 windows that exist when the webview is created, and
  the overlay is built with `.focused(false)`, which also skips wry's `controller.MoveFocus` (wry-0.57.0 `webview2/mod.rs:612`), so
  its render window does not exist yet and never gets a drop target; no `drag-drop enter on 'overlay'` can ever arrive. Fix applied
  afterwards (`windows/overlay.rs`): `.focused(false)` is now only used on non-Windows. To confirm on Windows: the log line
  `drop targets on 'overlay'` should list a `drop target` on `Chrome_RenderWidgetHostHWND`, and a Shift-drag should log
  `native drag-drop enter on 'overlay'` and show the conversion slices. Not yet confirmed by a run.
- **Repository hygiene problem found before the first push.** The `.gitignore` of Task 1.1 no longer lists `out/`, `resources/bin/`,
  `resources/tessdata/` and `src/renderer/public/pdfjs/` (old Electron build leftovers that the previous `.gitignore` ignored), so the
  `git add -A` of every task commit since Task 1.1 added them: `resources/bin/win32-x64/ffmpeg.exe` and `ffprobe.exe` (about 100.5 MiB
  each, above GitHub's 100 MB per-file limit), `out/` (215 files), `src/renderer/public/pdfjs/` (202 files) and the two tessdata files.
  None of them exist on `origin/master`. The push is blocked until these are removed from the 58 local commits (history rewrite, needs
  the owner's approval) or the work is squashed into one new commit. Local backup branch: `backup/before-cleanup`.
- **Self-test output folders.** The plan's `.gitignore` covers `.selftest/` only; `.selftest-app/`, `.selftest-release/` etc. are
  ignored through the local-only `.git/info/exclude`, so no tracked file changed.
