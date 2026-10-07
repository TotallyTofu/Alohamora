# PLAN.md — Build "Kabooks" step by step (Windows · macOS · Linux)

This plan turns `OUTLINE.md` into small, verifiable tasks. It is written for an implementing agent with limited context. **Every task says which files to touch, gives the code or an exact spec, and says how to verify it.**

**Kabooks must run on Windows 10/11 x64, macOS 12+ (Apple Silicon arm64 and Intel x64) and Linux x64/arm64.**
- Develop and verify on whatever OS you are on.
- Code must never assume one OS. Follow §1.9.
- The CI workflow (Task 13.5) builds and self-tests all three.

---

## Table of contents
- §0 How to use this plan (rules)
- §1 Conventions
- §2 Approved dependencies
- §3 Final folder tree
- Phase 0: Scaffold (Tasks 0.1–0.5)
- Phase 1: Shared core, pure TypeScript (Tasks 1.1–1.10)
- Phase 2: Binaries & capabilities (Tasks 2.1–2.4)
- Phase 3: Main-process foundation (Tasks 3.1–3.10)
- Phase 4: Audio/video conversion + self-test harness (Tasks 4.1–4.3)
- Phase 5: UI foundation & the wheel, **Milestone M1** (Tasks 5.1–5.9)
- Phase 6: All remaining conversions, **Milestone M2** (Tasks 6.1–6.13)
- Phase 7: Shared editors + video tools, M3a (Tasks 7.1–7.11)
- Phase 8: Audio tools, M3b (Tasks 8.1–8.8)
- Phase 9: Image tools, M4 (Tasks 9.1–9.10)
- Phase 10: PDF tools, M5 (Tasks 10.1–10.8)
- Phase 11: Desktop integration for Windows, macOS and Linux, M6 (Tasks 11.1–11.10)
- Phase 12: Views, polish & hardware video (Tasks 12.1–12.7)
- Phase 13: Packaging for all three OSes + CI, M7 (Tasks 13.1–13.6)
- Appendix A: FFmpeg cookbook
- Appendix B: EPUB templates
- Appendix C: Error-message catalogue
- Appendix D: Troubleshooting
- Appendix E: PROGRESS.md template
- Appendix F: Logo SVG

---

## §0 How to use this plan (READ FIRST)

1. **Read §0–§3 once.** For each later task, read only that task plus any section it references. You do not need the whole file in context; it is long on purpose.
   - To find a task, run `grep -n "^## Task 6.4" PLAN.md`.
   - Read from that line to the next `## Task` heading.
2. **Work strictly in order.** Do not start a task until the previous task's *Verify* steps pass.
3. **Each task has the same parts:**
   - **Goal:** what the task achieves.
   - **Files:** the only files you may create or modify.
   - **Steps:** what to do.
   - **Code:** reference code. Copy it, then fix only real type or version mismatches.
   - **Verify:** commands and checks.
   - **Done when:** the acceptance criteria.
4. **Quality gates.** After every task, run these (once they exist):
   ```
   npm run typecheck
   npm test
   ```
   From Phase 4 on, also run the self-test group named in the task: `npm run selftest -- --only=<group>`.
5. **Progress log.** After a task passes, tick its box in `PROGRESS.md` and add one line of notes. Record any deviation from the plan, for example: "Deviation: pdfjs v5 renamed X, used Y".
6. **Commit after each task.** Use exactly:
   ```
   git add -A
   git commit -m "Task X.Y: <title>"
   ```
7. **If a library API differs from this plan** (version drift), open the package's type definitions (`node_modules/<pkg>/**/*.d.ts`) or README. Make the *smallest* change that works, and note the deviation. Never invent APIs.
8. **Do not add dependencies** that are not in §2. If you truly need one, write the reason in PROGRESS.md first.
9. **Do not refactor earlier tasks** unless the current task tells you to.
10. **Never touch the user's reference files:** `OUTLINE.md`, `PLAN.md`, `features.md`, `*.png` in the root. Never delete files outside `out/`, `dist/`, `.cache/` and `.selftest/`.
11. **Keep files small** (under about 300 lines). If a file grows bigger, split it in the way the task suggests.
12. **If you are blocked by the environment** (a download is blocked, or a binary is missing), stop and write a clear note in PROGRESS.md under "Blocked". Do not fake results.
13. **The project root is this folder**, the one that contains `PLAN.md`. Its path may contain spaces, so always quote paths in shell commands.
14. **Shell commands are cross-platform where possible.** Prefer the `npm run …` scripts, which work on every OS. When a raw command is needed, the plan gives both forms:
    - **PowerShell** (Windows);
    - **bash/zsh** (macOS/Linux).
    
    Run the one for your OS.
15. **OS-specific tasks.** A task marked **[macOS]**, **[Windows]** or **[Linux]** can only be *verified* on that OS. Still write the code everywhere (it must typecheck on all OSes). If you cannot verify it, write "Not verified on <OS>" in PROGRESS.md and continue. CI (Task 13.5) runs the self-test on all OSes.

---

## §1 Conventions

### 1.1 Code style
- TypeScript `strict`, 2-space indent, **single quotes, semicolons**, max line length about 110.
- Named exports only (no default exports), except React components used lazily, which never happens in this plan.
- Use `async`/`await`, never `.then` chains, except for fire-and-forget calls written as `void promise`.
- No `any`. At IPC boundaries use `unknown` and narrow it.

### 1.2 Process boundaries (very important)
| Folder | Runs in | May import |
|---|---|---|
| `src/shared/**` | everywhere | **only** other `src/shared` files. No `electron`, no `node:*`, no `react`. |
| `src/main/**` | Electron main (Node) | anything Node, electron, `@shared/*` |
| `src/preload/**` | sandboxed preload | **only** `electron` (`contextBridge`, `ipcRenderer`, `webUtils`) and `@shared/*` |
| `src/renderer/**` | Chromium (browser) | `react`, `zustand`, `lucide-react`, `pdfjs-dist`, `@shared/*`, browser APIs. **No Node.** |

**Pure files** contain no I/O and are unit-tested with Vitest: everything in `src/shared/`, plus `src/main/engines/*Args.ts`, `src/main/engines/ffmpegParse.ts`, `src/main/engines/imageMeta.ts` and `src/renderer/src/components/Wheel/wheelGeometry.ts`. Pure files must never import `electron` (directly or through another file), otherwise Vitest fails.

### 1.3 Paths & processes
- Always build paths with `path.join` / `path.resolve`. Never concatenate path strings.
- **Never** use `shell: true` or `exec(string)`. Always use `spawn(exe, argsArray, { windowsHide: true })` or `execFile`.
- File paths with spaces need no quoting inside `args` arrays.

### 1.4 Geometry & time
- **Every rectangle drawn in the UI is normalized** (`NormRect`, 0..1) relative to the *displayed* frame, meaning after EXIF or video rotation. Only the main process converts it to pixels, using `toPixelRect()`, and to even numbers for video.
- Times in options are seconds as `number`. They become FFmpeg args via `sec.toFixed(3)`.

### 1.5 Outputs
- Converters and tools **must only write to paths returned by `ctx.newOutput()`** (final outputs) or `ctx.tempPath()` (scratch files).
- Never write next to the source directly. Never overwrite. The job runner moves outputs to their final names.

### 1.6 Errors
- Expected problems (wrong input, encrypted PDF, no audio track): `throw new UserError('Plain sentence for the user.')`.
- Engine failures: `ToolError(message, technicalDetails)`.
- Cancellation: `CanceledError`.
- The UI shows `UserError.message` as-is and puts the details behind a "Details" disclosure. See Appendix C for wording.

### 1.7 UI
- Colours, radii, shadows and fonts come only from CSS variables in `styles/tokens.css`.
- Icons only through `<Icon name="…">`, whose map is in `components/Icon.tsx`.
- Every interactive element must be reachable by keyboard and show a focus ring.

### 1.8 IPC
- Channel names live only in `src/shared/ipc.ts` (`IPC.*`).
- The renderer calls `api.*` (from `lib/api.ts`), never `ipcRenderer` directly.

### 1.9 Platform rules (Windows · macOS · Linux)
- **Branching on `process.platform` is allowed only in:**
  - `src/main/paths.ts`
  - `src/main/capabilities.ts`
  - `src/main/windows/*`
  - `src/main/integrations/*`
  - `src/main/index.ts`
  - `scripts/*`

  Everything else calls helpers from those files.
- **The renderer** uses `lib/platform.ts` (Task 5.1), based on `navigator.userAgent`, only for **labels, keycaps and CSS** (`<html data-platform="win32|darwin|linux">`). It never uses it for logic.
- **Binaries** live in `resources/bin/<platform>-<arch>/` (for example `darwin-arm64`). File names come from `paths.ts`: `ffmpeg.exe` on Windows, `ffmpeg` elsewhere. Never hard-code `.exe`.
- **Path comparison:**
  - always use `pathKey(p)` from `util.ts` (lower-cases on Windows and macOS; keeps case on Linux);
  - never call `.toLowerCase()` on a path directly.
- **Modifier keys:**
  - "Alt" in code and events means **Option ⌥** on macOS (`event.altKey`).
  - For "multi-select" clicks use `modClick(e)` from `lib/platform.ts` (⌘ on Mac, Ctrl elsewhere).
- **No Windows-only APIs without a guard:**
  - `app.setAppUserModelId`, `shell.writeShortcutLink`, `reg.exe`, `titleBarOverlay`;
  - and no macOS-only ones without a guard: `app.dock`, `setVibrancy`, `systemPreferences`.
- **Fonts used for generated documents** must list Windows, macOS and Linux fonts (see `fontStack` in Task 1.8).
- **Executable bits:** on macOS/Linux, downloaded binaries must be `chmod 755`. On macOS they must also be code-signed (ad-hoc is fine for development) or Apple Silicon refuses to run them. `scripts/fetch-binaries.mjs` does both.

---

## §2 Approved dependencies

| Package | Install as | Used in | Purpose |
|---|---|---|---|
| `electron` | dev | — | app runtime |
| `electron-vite`, `vite`, `@vitejs/plugin-react` | dev | build | bundling main/preload/renderer |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | dev | — | types |
| `vitest` | dev | tests | unit tests |
| `electron-builder` | dev | packaging | installer |
| `extract-zip` | dev | scripts | unzip FFmpeg download |
| `react`, `react-dom`, `zustand`, `lucide-react`, `@fontsource-variable/inter`, `pdfjs-dist` | **dev** | renderer only (bundled by Vite, so they need not ship in node_modules) | UI, state, icons, font, PDF rendering |
| `sharp` | prod | main | images |
| `heic-decode` | prod | main | HEIC input |
| `imagetracerjs` | prod | main | raster→SVG tracing |
| `pdf-lib` | prod | main | PDF writing/editing |
| `docx` | prod | main | Word output |
| `jszip` | prod | main | EPUB read/write |
| `fast-xml-parser` | prod | main | EPUB OPF parsing |
| `exifr` | prod | main | read EXIF |
| `piexifjs` | prod | main | edit EXIF in JPEG |
| `tesseract.js` | prod | main | OCR |
| `uiohook-napi` | prod | main | global drag + Shift detection on **Windows and Linux-X11** (macOS uses the Swift helper instead) |

Do **not** use ESM-only packages in the main process: `p-queue`, `nanoid@5`, `electron-store@9+`, `execa`. Use Node built-ins instead, such as `crypto.randomUUID()`.

`sharp` and `uiohook-napi` install prebuilt binaries for the **current** OS/arch only. That is why each OS installs and builds on itself (CI matrix, Task 13.5). Never copy `node_modules` between OSes.

**Native toolchain per OS** (not npm packages):
| OS | Needed for development |
|---|---|
| Windows | Git for Windows. Nothing else. |
| macOS | Xcode Command Line Tools: `xcode-select --install`. Provides `git`, `swiftc` (drag helper, Task 11.7), `codesign`. `sips` is built in. |
| Linux | Electron runtime libraries: `sudo apt install libgtk-3-0 libnss3 libxss1 libasound2t64 libgbm1 libxtst6 libnotify4` (package names vary; Fedora: `gtk3 nss libXScrnSaver alsa-lib mesa-libgbm libXtst libnotify`). For headless self-tests: `xvfb`. Optional HEIC output: `libheif-examples` (apt) / `libheif-tools` (dnf). |

---

## §3 Final folder tree (target state)

```
<root>/                                  ← this folder (contains PLAN.md)
├─ OUTLINE.md  PLAN.md  PROGRESS.md  features.md  *.png      (docs; do not move)
├─ package.json  package-lock.json  .gitignore
├─ electron.vite.config.ts  electron-builder.yml  vitest.config.ts
├─ tsconfig.json  tsconfig.node.json  tsconfig.web.json
├─ .github/workflows/  build.yml                     (CI: Windows, macOS arm64, macOS x64, Linux)
├─ build/              icon.png (1024)  icon.svg  installer.nsh  entitlements.mac.plist
├─ native/mac/         DragHelper.swift              (the only non-TypeScript source)
├─ resources/
│  ├─ bin/<platform>-<arch>/                          (gitignored, filled by scripts)
│  │     win32-x64/    ffmpeg.exe  ffprobe.exe  LICENSE-ffmpeg.txt  heif/ (optional heif-enc.exe + DLLs)
│  │     darwin-arm64/ ffmpeg  ffprobe  kabooks-drag-helper
│  │     darwin-x64/   ffmpeg  ffprobe  kabooks-drag-helper
│  │     linux-x64/    ffmpeg  ffprobe
│  │     linux-arm64/  ffmpeg  ffprobe
│  ├─ tessdata/        eng.traineddata  vie.traineddata
│  ├─ tray.png         (Windows/Linux tray)
│  └─ trayTemplate.png  trayTemplate@2x.png   (macOS menu-bar template icons)
├─ scripts/            fetch-binaries.mjs  check-binaries.mjs  build-mac-helper.mjs  copy-pdfjs-assets.mjs  make-icons.mjs
└─ src/
   ├─ shared/          types.ts formats.ts tools.ts toolOptions.ts wheelItems.ts naming.ts time.ts
   │                   pageRanges.ts geometry.ts subtitles.ts text.ts pdfReflow.ts editPipeline.ts
   │                   collageLayout.ts overlay.ts ipc.ts   + *.test.ts
   ├─ main/
   │  ├─ index.ts paths.ts log.ts errors.ts util.ts appState.ts security.ts protocol.ts settings.ts capabilities.ts
   │  ├─ ipc.ts inspect.ts thumbnails.ts previews.ts metadata.ts notify.ts
   │  ├─ windows/      mainWindow.ts overlayWindow.ts engineWindow.ts
   │  ├─ jobs/         context.ts execute.ts queue.ts
   │  ├─ engines/      process.ts ffmpeg.ts ffmpegParse.ts ffmpegArgs.ts videoArgs.ts audioArgs.ts (+tests)
   │  │                image.ts imageEdit.ts imageBackground.ts imageMeta.ts(+test) svg.ts heif.ts
   │  │                pdfEngine.ts pdfOps.ts pdfCompress.ts print.ts docxWriter.ts
   │  │                epubWriter.ts epubReader.ts ocr.ts
   │  ├─ converters/   index.ts av.ts image.ts text.ts subtitle.ts pdf.ts epub.ts
   │  ├─ tools/        index.ts  video/*.ts  audio/*.ts  image/*.ts  pdf/*.ts  subtitle/*.ts
   │  ├─ integrations/ index.ts argv.ts appMenu.ts tray.ts loginItem.ts
   │  │                win: sendTo.ts contextMenu.ts · win+linux: globalDrag.ts (uiohook)
   │  │                mac: macDragHelper.ts macPolish.ts · linux: linuxFileManagers.ts
   │  ├─ selftest/     index.ts types.ts fixtures.ts assert.ts cases/{index,av,image,text,pdf,tools-*}.ts
   │  └─ types/        shims.d.ts
   ├─ preload/         index.ts engine.ts index.d.ts
   └─ renderer/
      ├─ index.html engine.html
      ├─ public/pdfjs/ (generated, gitignored)
      └─ src/
         ├─ main.tsx App.tsx OverlayApp.tsx env.d.ts
         ├─ engine/    main.ts pdf.ts
         ├─ lib/       api.ts theme.ts dnd.ts useJob.ts format.ts platform.ts
         ├─ styles/    tokens.css global.css
         ├─ components/  Button Icon Keycap Panel Slider Segmented Select Toggle TextField ProgressRing
         │               ReorderList ColorSwatches MediaPreview TimeRange CropBox RectEditor Waveform
         │               ImagePreview DropZone  (.tsx) + components.css
         │               Wheel/ Wheel.tsx wheelGeometry.ts wheelGeometry.test.ts wheel.css
         ├─ overlay/   store.ts sizes.ts overlay.css stages/{Wheel,Options,Panel,Running,Done,Error}Stage.tsx
         ├─ panels/    index.ts  convert/*.tsx  video/*.tsx  audio/*.tsx  image/*.tsx  pdf/*.tsx  subtitle/*.tsx
         └─ views/     HomeView.tsx FormatsView.tsx SettingsView.tsx ActivityList.tsx views.css
```

---

# Phase 0 — Scaffold

## Task 0.1 — Prerequisites, git, progress log
**Goal:** a git repository with ignore rules and a progress log.
**Files:** `.gitignore`, `PROGRESS.md`

**Steps**
1. Check the tools:
   - `node -v` must be **v22 or newer** (v24 LTS is fine).
   - `npm -v` and `git --version` must print versions.
   - Node must match the machine architecture: `node -p "process.platform + '-' + process.arch"` prints `win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64` or `linux-arm64`. On Apple Silicon it must say **arm64**, not x64 (Rosetta). Write this value in PROGRESS.md; later tasks call it `<platform>-<arch>`.
   - Install the native toolchain for your OS from §2.
     - macOS: run `xcode-select -p`; it must print a path (otherwise run `xcode-select --install`).
     - Linux: install the Electron runtime libraries.
   - If something is missing and you cannot install it, stop and record it under "Blocked".
2. Run `git init` in the project root, unless `.git` already exists. Then create `.gitattributes` with `* text=auto eol=lf`, plus `*.png binary`. This keeps line endings consistent across Windows/macOS/Linux.
3. Create `.gitignore`:
   ```
   node_modules/
   out/
   dist/
   .cache/
   .selftest/
   resources/bin/
   resources/tessdata/
   src/renderer/public/pdfjs/
   *.log
   .DS_Store
   ```
4. Create `PROGRESS.md` by copying the template in **Appendix E**.

**Verify:** `git status` shows `.gitignore` and `PROGRESS.md` as untracked.
**Done when:** the first commit "Task 0.1: repo init" exists.

---

## Task 0.2 — package.json and dependencies
**Goal:** all dependencies installed.
**Files:** `package.json` (`package-lock.json` is created automatically)

**Code: `package.json`** (write exactly this, then run the installs)
```json
{
  "name": "kabooks",
  "productName": "Kabooks",
  "version": "0.1.0",
  "description": "Offline file converter with a spinning wheel UI",
  "main": "./out/main/index.js",
  "author": "Kabooks contributors",
  "license": "UNLICENSED",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run"
  }
}
```

**Steps**
```
npm install sharp heic-decode imagetracerjs pdf-lib docx jszip fast-xml-parser exifr piexifjs tesseract.js uiohook-napi
npm install -D electron electron-vite vite @vitejs/plugin-react typescript @types/node @types/react @types/react-dom vitest electron-builder extract-zip
npm install -D react react-dom zustand lucide-react @fontsource-variable/inter pdfjs-dist
```
- If npm reports **ERESOLVE / peer dependency conflicts** between `electron-vite`, `vite` and `@vitejs/plugin-react`:
  1. Run `npm view electron-vite peerDependencies` and install the `vite` major it asks for, for example `npm install -D vite@6`.
  2. Then install the matching `@vitejs/plugin-react` version (check with `npm view @vitejs/plugin-react peerDependencies`).
- If `sharp` fails to install, run `npm install --include=optional sharp`.

**Verify:** `npx electron --version` prints a version, and `node -e "require('sharp')"` prints nothing (no error).
**Done when:** `node_modules` exists and the lockfile is committed.

---

## Task 0.3 — TypeScript, electron-vite and Vitest config
**Files:** `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, `vitest.config.ts`

**Code: `tsconfig.json`**
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

**Code: `tsconfig.node.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["electron.vite.config.ts", "vitest.config.ts", "src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```

**Code: `tsconfig.web.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"], "@renderer/*": ["src/renderer/src/*"] }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*", "src/preload/index.d.ts"]
}
```

**Code: `electron.vite.config.ts`**
```ts
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), engine: resolve('src/preload/engine.ts') }
      }
    }
  },
  renderer: {
    resolve: { alias: { ...alias, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html'), engine: resolve('src/renderer/engine.html') }
      }
    }
  }
});
```
> If `externalizeDepsPlugin` is reported as deprecated or missing, remove it and its import. Newer electron-vite versions externalize dependencies by default.

**Code: `vitest.config.ts`**
```ts
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer/src') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
```

**Verify:** none yet (there are no sources). Continue to 0.4.

---

## Task 0.4 — Minimal entry points ("hello window")
**Files:**
- `src/main/index.ts`
- `src/preload/index.ts`, `src/preload/engine.ts`
- `src/renderer/index.html`, `src/renderer/engine.html`
- `src/renderer/src/main.tsx`, `src/renderer/src/env.d.ts`, `src/renderer/src/engine/main.ts`

**Code: `src/main/index.ts`** (temporary; Task 3.9 replaces it)
```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  });
  win.once('ready-to-show', () => win.show());
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}/index.html`);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

**Code: `src/preload/index.ts`** (temporary)
```ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('kabooks', { ping: () => 'pong' });
```

**Code: `src/preload/engine.ts`** (temporary)
```ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('kabooksEngine', { ping: () => 'pong' });
```

**Code: `src/renderer/index.html`**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kabooks</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
> Do **not** add a CSP `<meta>` tag. In production the CSP is sent as an HTTP header by the `app://` protocol (Task 3.1). In development the Vite React plugin needs an inline preamble script, which a meta CSP would block.

**Code: `src/renderer/engine.html`**
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>engine</title></head>
  <body>
    <script type="module" src="/src/engine/main.ts"></script>
  </body>
</html>
```

**Code: `src/renderer/src/env.d.ts`**
```ts
/// <reference types="vite/client" />
```

**Code: `src/renderer/src/main.tsx`** (temporary)
```tsx
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root') as HTMLElement).render(<h1>Kabooks</h1>);
```

**Code: `src/renderer/src/engine/main.ts`** (temporary)
```ts
console.log('engine page loaded');
```

**Verify**
1. `npm run dev` opens a window showing "Kabooks". Close it.
   - **Linux:** if Electron exits with "The SUID sandbox helper binary was found, but is not configured correctly", see Appendix D (Ubuntu 23.10+ AppArmor). For development you may run `npx electron-vite dev --noSandbox`. Note it in PROGRESS.md.
2. `npm run build` finishes without errors and creates `out/main/index.js`, `out/preload/index.js`, `out/preload/engine.js`, `out/renderer/index.html` and `out/renderer/engine.html`.
   - If the preload files are emitted as `.mjs`, note it in PROGRESS.md and use `.mjs` in every `preload` path (Task 2.4 `preloadPath`).

**Done when:** both commands succeed.

---

## Task 0.5 — Vitest smoke test
**Files:** `src/shared/smoke.test.ts`
```ts
import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```
**Verify:** `npm test` reports 1 passed test, and `npm run typecheck` passes.

---

# Phase 1 — Shared core (pure TypeScript)

All files in this phase live in `src/shared/` and **must not import** `electron`, `node:*` or `react`.

## Task 1.1 — `types.ts`
**Files:** `src/shared/types.ts`
```ts
import type { ConvertOptions } from './toolOptions';

export type Category = 'image' | 'video' | 'audio' | 'pdf' | 'epub' | 'text' | 'subtitle';

export type Fmt =
  | 'jpg' | 'png' | 'webp' | 'heic' | 'tiff' | 'svg' | 'avif' | 'bmp'
  | 'mp3' | 'm4a' | 'wav' | 'flac' | 'ogg' | 'opus' | 'aiff' | 'wma'
  | 'mp4' | 'mov' | 'mkv' | 'webm' | 'avi' | 'wmv' | 'gif'
  | 'pdf' | 'docx' | 'epub' | 'txt' | 'srt' | 'vtt';

export type WheelMode = 'convert' | 'tools';

export type ToolId =
  | 'video.compress' | 'video.metadata' | 'video.mute' | 'video.trim' | 'video.crop'
  | 'video.speed' | 'video.snapshot' | 'video.split' | 'video.redact' | 'video.join'
  | 'audio.compress' | 'audio.normalize' | 'audio.trim' | 'audio.channels' | 'audio.visualize'
  | 'audio.bleep' | 'audio.metadata' | 'audio.join'
  | 'image.compress' | 'image.resize' | 'image.crop' | 'image.edit' | 'image.background'
  | 'image.redact' | 'image.metadata' | 'image.collage' | 'image.pdf'
  | 'pdf.compress' | 'pdf.merge' | 'pdf.split' | 'pdf.organize' | 'pdf.images' | 'pdf.ocr'
  | 'pdf.word' | 'pdf.metadata'
  | 'subtitle.shift';

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }

export interface FileInfo {
  path: string;
  name: string;            // "geese.mp4"
  base: string;            // "geese"
  ext: string;             // "mp4" (lower-case, no dot)
  fmt: Fmt | null;         // null = unsupported input
  category: Category | null;
  size: number;            // bytes
  deep?: boolean;          // true once deep inspection finished
  width?: number;          // DISPLAY width (after rotation / EXIF orientation)
  height?: number;
  durationSec?: number;
  pages?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  hasCover?: boolean;
  videoCodec?: string;
  audioCodec?: string;
  fps?: number;
  sampleRate?: number;
  channels?: number;
  thumbnail?: string;      // data URL, longest side <= 256 px
  error?: string;
}

export type Platform = 'win32' | 'darwin' | 'linux';

export interface Capabilities {
  platform: Platform;
  arch: string;                  // 'x64' | 'arm64'
  appVersion: string;
  ffmpeg: boolean;
  ffmpegVersion: string;
  encoders: string[];
  heifEnc: boolean;              // true = HEIC OUTPUT is possible (via heicTool)
  heicTool: 'sips' | 'heif-enc' | null;   // macOS: sips (built in); Windows/Linux: heif-enc if present
  hwVideo: string | null;        // verified hardware H.264 encoder, e.g. 'h264_videotoolbox' (Task 12.7; null until then)
  globalDrag: 'mac-helper' | 'hook' | 'unavailable';   // how the global drag wheel works on this OS/session
  ocrLanguages: string[];
}

export interface Settings {
  outputMode: 'same-folder' | 'custom-folder';
  customOutputDir: string | null;
  theme: 'system' | 'light' | 'dark';
  highContrastAccent: boolean;
  imageQuality: number;      // 1..100
  videoCrf: number;          // 18..32 (H.264 CRF)
  audioBitrateKbps: number;  // AAC/WMA/Opus bitrate
  pdfDpi: number;            // PDF → image DPI
  ocrLanguages: string[];    // e.g. ['eng'] or ['eng','vie']
  maxConcurrentJobs: number;
  hardwareVideo: boolean;    // use caps.hwVideo when available (Task 12.7)
  notifyWhenDone: boolean;
  revealWhenDone: boolean;
  globalDragWheel: boolean;
  sendToMenu: boolean;       // Windows only: Explorer "Send to"
  contextMenu: boolean;      // Windows: right-click verb · Linux: Nautilus script + Dolphin service menu
  launchAtLogin: boolean;
  closeToTray: boolean;      // Windows/Linux tray · macOS menu bar
  showInDock: boolean;       // macOS only
}

export const DEFAULT_SETTINGS: Settings = {
  outputMode: 'same-folder',
  customOutputDir: null,
  theme: 'system',
  highContrastAccent: false,
  imageQuality: 85,
  videoCrf: 23,
  audioBitrateKbps: 192,
  pdfDpi: 300,
  ocrLanguages: ['eng'],
  maxConcurrentJobs: 2,
  hardwareVideo: true,
  notifyWhenDone: true,
  revealWhenDone: false,
  globalDragWheel: false,
  sendToMenu: false,
  contextMenu: false,
  launchAtLogin: false,
  closeToTray: true,
  showInDock: true
};

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

export type JobRequest =
  | { kind: 'convert'; inputs: string[]; target: Fmt; options?: ConvertOptions }
  | { kind: 'tool'; inputs: string[]; toolId: ToolId; options: Record<string, unknown> };

export interface JobUpdate {
  id: string;
  label: string;             // "Convert to MP4" / "Compress"
  request: JobRequest;
  status: JobStatus;
  progress: number;          // 0..1 overall
  detail?: string;           // "geese.mov · 2 of 5"
  outputs: string[];         // absolute final paths (status 'done')
  note?: string;             // "Saved 42 % (12.3 MB → 7.1 MB)"
  error?: string;            // user-facing message
  errorDetails?: string;     // technical text
  createdAt: number;
  finishedAt?: number;
}

export interface OverlayInit {
  files: FileInfo[];
  mode: WheelMode;
  caps: Capabilities;
  source: 'window' | 'argv' | 'drag';
}

/** Global drag. `files` is filled only on macOS, where the Swift helper can read the dragged files before the drop. */
export interface DragState { active: boolean; mode: WheelMode; files?: FileInfo[] }

export interface MetadataField { key: string; label: string; value: string; editable: boolean }

export interface MetadataInfo {
  kind: 'media' | 'image' | 'pdf';
  fields: MetadataField[];
  hasGps?: boolean;
  hasCover?: boolean;
  coverDataUrl?: string;
}

export interface ImagePreviewRequest {
  op: 'none' | 'edit' | 'background' | 'compress' | 'collage' | 'crop';
  path: string;              // main image (collage: ignored, uses `paths`)
  paths?: string[];
  maxSide: number;           // preview size, e.g. 1200
  options?: Record<string, unknown>;
}

export interface ImagePreviewResult {
  dataUrl: string;
  width: number;
  height: number;
  bytes?: number;            // compress: estimated output size (full resolution)
  originalBytes?: number;
}
```

**Verify:** `npm run typecheck`. It will fail until Tasks 1.3 and 1.4 create `toolOptions.ts` and `geometry.ts`; that is expected. Continue with 1.2–1.4, then run it.

---

## Task 1.2 — `formats.ts` (format registry and conversion matrix)
**Files:** `src/shared/formats.ts`, `src/shared/formats.test.ts`
```ts
import type { Capabilities, Category, Fmt } from './types';

export interface FormatInfo {
  fmt: Fmt;
  label: string;
  category: Category;
  exts: string[];          // first = canonical output extension
  mimes: string[];
  input: boolean;          // false = output-only (DOCX)
}

export const FORMATS: Record<Fmt, FormatInfo> = {
  jpg: { fmt: 'jpg', label: 'JPG', category: 'image', exts: ['jpg', 'jpeg', 'jfif'], mimes: ['image/jpeg'], input: true },
  png: { fmt: 'png', label: 'PNG', category: 'image', exts: ['png'], mimes: ['image/png'], input: true },
  webp: { fmt: 'webp', label: 'WebP', category: 'image', exts: ['webp'], mimes: ['image/webp'], input: true },
  heic: { fmt: 'heic', label: 'HEIC', category: 'image', exts: ['heic', 'heif'], mimes: ['image/heic', 'image/heif'], input: true },
  tiff: { fmt: 'tiff', label: 'TIFF', category: 'image', exts: ['tiff', 'tif'], mimes: ['image/tiff'], input: true },
  svg: { fmt: 'svg', label: 'SVG', category: 'image', exts: ['svg'], mimes: ['image/svg+xml'], input: true },
  avif: { fmt: 'avif', label: 'AVIF', category: 'image', exts: ['avif'], mimes: ['image/avif'], input: true },
  bmp: { fmt: 'bmp', label: 'BMP', category: 'image', exts: ['bmp'], mimes: ['image/bmp', 'image/x-ms-bmp'], input: true },
  mp3: { fmt: 'mp3', label: 'MP3', category: 'audio', exts: ['mp3'], mimes: ['audio/mpeg', 'audio/mp3'], input: true },
  m4a: { fmt: 'm4a', label: 'M4A', category: 'audio', exts: ['m4a', 'aac'], mimes: ['audio/mp4', 'audio/x-m4a', 'audio/aac'], input: true },
  wav: { fmt: 'wav', label: 'WAV', category: 'audio', exts: ['wav'], mimes: ['audio/wav', 'audio/x-wav', 'audio/wave'], input: true },
  flac: { fmt: 'flac', label: 'FLAC', category: 'audio', exts: ['flac'], mimes: ['audio/flac', 'audio/x-flac'], input: true },
  ogg: { fmt: 'ogg', label: 'OGG', category: 'audio', exts: ['ogg', 'oga'], mimes: ['audio/ogg'], input: true },
  opus: { fmt: 'opus', label: 'Opus', category: 'audio', exts: ['opus'], mimes: ['audio/opus'], input: true },
  aiff: { fmt: 'aiff', label: 'AIFF', category: 'audio', exts: ['aiff', 'aif'], mimes: ['audio/aiff', 'audio/x-aiff'], input: true },
  wma: { fmt: 'wma', label: 'WMA', category: 'audio', exts: ['wma'], mimes: ['audio/x-ms-wma'], input: true },
  mp4: { fmt: 'mp4', label: 'MP4', category: 'video', exts: ['mp4', 'm4v'], mimes: ['video/mp4', 'video/x-m4v'], input: true },
  mov: { fmt: 'mov', label: 'MOV', category: 'video', exts: ['mov'], mimes: ['video/quicktime'], input: true },
  mkv: { fmt: 'mkv', label: 'MKV', category: 'video', exts: ['mkv'], mimes: ['video/x-matroska', 'video/matroska'], input: true },
  webm: { fmt: 'webm', label: 'WebM', category: 'video', exts: ['webm'], mimes: ['video/webm'], input: true },
  avi: { fmt: 'avi', label: 'AVI', category: 'video', exts: ['avi'], mimes: ['video/x-msvideo', 'video/avi', 'video/msvideo'], input: true },
  wmv: { fmt: 'wmv', label: 'WMV', category: 'video', exts: ['wmv'], mimes: ['video/x-ms-wmv'], input: true },
  gif: { fmt: 'gif', label: 'GIF', category: 'video', exts: ['gif'], mimes: ['image/gif'], input: true },
  pdf: { fmt: 'pdf', label: 'PDF', category: 'pdf', exts: ['pdf'], mimes: ['application/pdf'], input: true },
  docx: {
    fmt: 'docx', label: 'DOCX', category: 'pdf', exts: ['docx'],
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], input: false
  },
  epub: { fmt: 'epub', label: 'EPUB', category: 'epub', exts: ['epub'], mimes: ['application/epub+zip'], input: true },
  txt: { fmt: 'txt', label: 'TXT', category: 'text', exts: ['txt', 'text', 'md', 'markdown', 'log', 'csv'], mimes: ['text/plain', 'text/markdown', 'text/csv'], input: true },
  srt: { fmt: 'srt', label: 'SRT', category: 'subtitle', exts: ['srt'], mimes: ['application/x-subrip', 'text/srt'], input: true },
  vtt: { fmt: 'vtt', label: 'VTT', category: 'subtitle', exts: ['vtt'], mimes: ['text/vtt'], input: true }
};

const EXT_INDEX = new Map<string, Fmt>();
const MIME_INDEX = new Map<string, Fmt>();
for (const info of Object.values(FORMATS)) {
  if (!info.input) continue;
  for (const e of info.exts) EXT_INDEX.set(e, info.fmt);
  for (const m of info.mimes) MIME_INDEX.set(m, info.fmt);
}

/** "C:\\a\\b.JPEG" → "jpeg" (lower-case, no dot). Works with / and \. */
export function extOf(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function fmtFromExt(ext: string): Fmt | null {
  return EXT_INDEX.get(ext.toLowerCase()) ?? null;
}

export function fmtFromPath(filePath: string): Fmt | null {
  return fmtFromExt(extOf(filePath));
}

export function fmtFromMime(mime: string): Fmt | null {
  return MIME_INDEX.get(mime.toLowerCase()) ?? null;
}

export function categoryOf(fmt: Fmt): Category {
  return FORMATS[fmt].category;
}

/** Canonical extension to write for a format, e.g. jpg → "jpg", tiff → "tiff". */
export function outputExt(fmt: Fmt): string {
  return FORMATS[fmt].exts[0];
}

export const CATEGORY_ORDER: Category[] = ['image', 'audio', 'video', 'pdf', 'epub', 'text', 'subtitle'];

export const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Images', audio: 'Audio', video: 'Video', pdf: 'PDF', epub: 'EPUB', text: 'Text', subtitle: 'Subtitles'
};

export const CATEGORY_NOTE: Record<Category, string> = {
  image: 'PDF & DOCX export',
  audio: '',
  video: 'MP3 audio export',
  pdf: 'All pages · images at 300 DPI',
  epub: 'Adjustable text or preserved pages',
  text: 'UTF-8 text',
  subtitle: ''
};

/** What each input category can become (wheel order, clockwise from 12 o'clock). */
export const CONVERT_TARGETS: Record<Category, Fmt[]> = {
  image: ['jpg', 'png', 'webp', 'heic', 'tiff', 'svg', 'avif', 'bmp', 'pdf', 'docx'],
  audio: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'wma'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'gif', 'mp3'],
  pdf: ['docx', 'jpg', 'png', 'epub', 'txt'],
  epub: ['pdf'],
  text: ['pdf', 'jpg', 'png', 'srt', 'vtt'],
  subtitle: ['srt', 'vtt', 'txt']
};

/** FFmpeg encoders required to produce each target from audio/video sources (and BMP from images). */
export const REQUIRED_ENCODERS: Partial<Record<Fmt, string[]>> = {
  mp4: ['libx264', 'aac'],
  mov: ['libx264', 'aac'],
  mkv: ['libx264', 'aac'],
  webm: ['libvpx-vp9', 'libopus'],
  avi: ['mpeg4', 'libmp3lame'],
  wmv: ['wmv2', 'wmav2'],
  gif: ['gif'],
  mp3: ['libmp3lame'],
  m4a: ['aac'],
  wav: ['pcm_s16le'],
  flac: ['flac'],
  ogg: ['libvorbis'],
  opus: ['libopus'],
  aiff: ['pcm_s16be'],
  wma: ['wmav2'],
  bmp: ['bmp']
};

/** Conversions that show a Step-2 options card by default. */
const OPTION_PAIRS: Array<[Category, Fmt]> = [
  ['image', 'svg'], ['video', 'gif'], ['pdf', 'docx'], ['pdf', 'epub'], ['epub', 'pdf'],
  ['text', 'pdf'], ['text', 'jpg'], ['text', 'png'], ['text', 'srt'], ['text', 'vtt']
];

export function needsOptions(from: Category, to: Fmt): boolean {
  return OPTION_PAIRS.some(([c, f]) => c === from && f === to);
}

/** True when the engine that produces `target` from `from` is available. */
export function targetAvailable(target: Fmt, from: Category, caps: Capabilities): boolean {
  if (from === 'image' && target === 'heic') return caps.heifEnc;
  const usesFfmpeg = from === 'audio' || from === 'video' || (from === 'image' && target === 'bmp');
  if (!usesFfmpeg) return true;
  if (!caps.ffmpeg) return false;
  return (REQUIRED_ENCODERS[target] ?? []).every((e) => caps.encoders.includes(e));
}
```

**Tests (`formats.test.ts`): write at least these cases**
- `extOf('C:\\x\\Photo.JPEG')` → `'jpeg'`; `extOf('noext')` → `''`; `extOf('.bashrc')` → `''`.
- `fmtFromPath('a.jpeg')` → `'jpg'`; `fmtFromPath('a.tif')` → `'tiff'`; `fmtFromPath('a.docx')` → `null` (output-only); `fmtFromPath('a.zip')` → `null`.
- `fmtFromMime('video/quicktime')` → `'mov'`.
- `targetAvailable('heic','image', caps with heifEnc:false)` → false.
- `targetAvailable('webm','video', caps with encoders ['libvpx-vp9','libopus'])` → true; with `[]` → false.
- `targetAvailable('png','image', caps with ffmpeg:false)` → true (sharp needs no FFmpeg).
- `needsOptions('video','gif')` → true; `needsOptions('video','mp4')` → false.

**Verify:** `npm test`.

---

## Task 1.3 — `toolOptions.ts` (option types + defaults) and `tools.ts` (tool metadata)
**Files:** `src/shared/toolOptions.ts`, `src/shared/tools.ts`, `src/shared/tools.test.ts`

**Code: `src/shared/toolOptions.ts`**
```ts
import type { NormRect } from './geometry';
import type { ToolId } from './types';

// ---------- Convert options (Step-2 cards for conversions) ----------
export interface ConvertOptions {
  quality?: number;                                     // images 1..100
  svgMode?: 'trace' | 'embed';
  svgColors?: number;                                   // 2..32
  gifWidth?: number;                                    // 0 = original
  gifFps?: number;
  docMode?: 'reflow' | 'pages';                         // PDF→DOCX/EPUB, EPUB→PDF
  ocr?: 'auto' | 'off';
  textSize?: 'small' | 'medium' | 'large' | 'xlarge';
  font?: 'original' | 'serif' | 'sans' | 'mono';
  pageSize?: 'a4' | 'letter' | 'a5';
  imageDpi?: number;                                    // TXT → JPG/PNG
  cueTiming?: 'reading' | 'fixed';
  secondsPerCue?: number;
}

export const DEFAULT_CONVERT_OPTIONS: Required<ConvertOptions> = {
  quality: 85, svgMode: 'trace', svgColors: 16, gifWidth: 480, gifFps: 12, docMode: 'reflow', ocr: 'auto',
  textSize: 'medium', font: 'original', pageSize: 'a4', imageDpi: 150, cueTiming: 'reading', secondsPerCue: 3
};

// ---------- Tool options ----------
export interface TimeRangeSec { startSec: number; endSec: number }

export interface VideoCompressOptions { preset: 'high' | 'balanced' | 'small'; maxHeight: 0 | 2160 | 1080 | 720 | 480; codec: 'h264' | 'h265'; targetSizeMb: number }
export interface VideoTrimOptions { startSec: number; endSec: number; precise: boolean }   // endSec 0 = end of file
export interface VideoSplitOptions { mode: 'at' | 'parts' | 'every'; times: number[]; parts: number; everySec: number; precise: boolean }
export interface VideoCropOptions { rect: NormRect }
export interface VideoSpeedOptions { factor: number; keepAudio: boolean }
export interface VideoSnapshotOptions { mode: 'single' | 'every'; timeSec: number; everySec: number; format: 'png' | 'jpg' }
export interface RedactRegion { rect: NormRect; style: 'blur' | 'pixelate' | 'black'; startSec?: number; endSec?: number }
export interface VideoRedactOptions { regions: RedactRegion[] }
export interface MediaMetadataOptions { removeAll: boolean; tags: Record<string, string>; coverPath: string | null; removeCover: boolean }
export interface JoinOptions { order: string[] }                                         // empty = input order
export interface AudioCompressOptions { bitrateKbps: number; format: 'keep' | 'mp3' | 'm4a' | 'opus'; mono: boolean }
export interface AudioNormalizeOptions { target: number; truePeak: number }               // LUFS, dBTP
export interface AudioTrimOptions { startSec: number; endSec: number; fadeInSec: number; fadeOutSec: number }
export interface AudioChannelsOptions { mode: 'mono' | 'stereo' | 'left' | 'right' | 'swap' }
export interface AudioVisualizeOptions { kind: 'waveform-png' | 'spectrogram-png' | 'waveform-mp4'; width: number; height: number; color: string; background: string }
export interface AudioBleepOptions { ranges: TimeRangeSec[]; sound: 'beep' | 'silence'; frequency: number }
export interface ImageCompressOptions { quality: number; maxSide: number; format: 'keep' | 'jpg' | 'webp' | 'avif'; stripMetadata: boolean }
export interface ImageResizeOptions { mode: 'percent' | 'pixels'; percent: number; width: number; height: number; keepAspect: boolean }
export interface ImageCropOptions { rect: NormRect; rotate: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean }
export interface EditParams {
  exposure: number;   // -2..2 EV
  brightness: number; // -100..100
  contrast: number;   // -100..100
  saturation: number; // -100..100
  warmth: number;     // -100..100
  hue: number;        // -180..180
  detail: number;     // 0..100 (sharpen)
  blur: number;       // 0..100
  vignette: number;   // 0..100
  effect: 'none' | 'bw' | 'sepia' | 'vintage' | 'invert';
}
export interface ImageBackgroundOptions {
  kind: 'solid' | 'gradient' | 'blur'; color: string; gradient: [string, string]; angle: number;
  paddingPct: number; radiusPct: number; shadow: boolean; aspect: 'auto' | '1:1' | '4:5' | '16:9' | '9:16';
}
export interface ImageRedactOptions { regions: Array<{ rect: NormRect; style: 'blur' | 'pixelate' | 'black' }> }
export interface ImageMetadataOptions {
  action: 'remove-all' | 'remove-gps' | 'edit';
  fields: { artist?: string; copyright?: string; description?: string; dateTaken?: string };
}
export interface CollageOptions {
  layout: 'grid' | 'row' | 'column' | 'featured'; order: string[]; gap: number; background: string;
  radius: number; width: number; fit: 'cover' | 'contain';
}
export interface CreatePdfOptions { order: string[]; pageSize: 'fit' | 'a4' | 'letter'; margin: 'none' | 'small' | 'large'; combine: boolean }
export interface PdfCompressOptions { level: 'light' | 'balanced' | 'strong' | 'max' }
export interface PdfMergeOptions { order: string[] }
export interface PdfSplitOptions { mode: 'each' | 'every' | 'ranges' | 'extract'; every: number; ranges: string }
export interface PdfOrganizeOptions { pages: Array<{ src: number; rotate: 0 | 90 | 180 | 270 }> } // final order; src = 0-based
export interface PdfImagesOptions { format: 'png' | 'jpg'; dpi: number; ranges: string; quality: number }
export interface PdfOcrOptions { languages: string[]; output: 'txt' | 'pdf'; ranges: string }
export interface PdfWordOptions { mode: 'reflow' | 'pages'; ocr: 'auto' | 'off' }
export interface PdfMetadataOptions { removeAll: boolean; title: string; author: string; subject: string; keywords: string }
export interface SubtitleShiftOptions { offsetMs: number }

export const DEFAULT_EDIT: EditParams = {
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: 0, detail: 0, blur: 0, vignette: 0, effect: 'none'
};

const FULL: NormRect = { x: 0, y: 0, w: 1, h: 1 };

export const TOOL_DEFAULTS = {
  'video.compress': { preset: 'balanced', maxHeight: 0, codec: 'h264', targetSizeMb: 0 } as VideoCompressOptions,
  'video.metadata': { removeAll: false, tags: {}, coverPath: null, removeCover: false } as MediaMetadataOptions,
  'video.mute': {},
  'video.trim': { startSec: 0, endSec: 0, precise: false } as VideoTrimOptions,
  'video.crop': { rect: FULL } as VideoCropOptions,
  'video.speed': { factor: 2, keepAudio: true } as VideoSpeedOptions,
  'video.snapshot': { mode: 'single', timeSec: 0, everySec: 5, format: 'png' } as VideoSnapshotOptions,
  'video.split': { mode: 'parts', times: [], parts: 2, everySec: 60, precise: false } as VideoSplitOptions,
  'video.redact': { regions: [] } as VideoRedactOptions,
  'video.join': { order: [] } as JoinOptions,
  'audio.compress': { bitrateKbps: 128, format: 'keep', mono: false } as AudioCompressOptions,
  'audio.normalize': { target: -16, truePeak: -1.5 } as AudioNormalizeOptions,
  'audio.trim': { startSec: 0, endSec: 0, fadeInSec: 0, fadeOutSec: 0 } as AudioTrimOptions,
  'audio.channels': { mode: 'mono' } as AudioChannelsOptions,
  'audio.visualize': { kind: 'waveform-png', width: 1920, height: 480, color: '#FF5A1F', background: '#FFFFFF' } as AudioVisualizeOptions,
  'audio.bleep': { ranges: [], sound: 'beep', frequency: 1000 } as AudioBleepOptions,
  'audio.metadata': { removeAll: false, tags: {}, coverPath: null, removeCover: false } as MediaMetadataOptions,
  'audio.join': { order: [] } as JoinOptions,
  'image.compress': { quality: 75, maxSide: 0, format: 'keep', stripMetadata: true } as ImageCompressOptions,
  'image.resize': { mode: 'percent', percent: 50, width: 0, height: 0, keepAspect: true } as ImageResizeOptions,
  'image.crop': { rect: FULL, rotate: 0, flipH: false, flipV: false } as ImageCropOptions,
  'image.edit': { ...DEFAULT_EDIT } as EditParams,
  'image.background': {
    kind: 'gradient', color: '#F3F3F2', gradient: ['#FFB38A', '#FF5A1F'], angle: 135,
    paddingPct: 8, radiusPct: 3, shadow: true, aspect: 'auto'
  } as ImageBackgroundOptions,
  'image.redact': { regions: [] } as ImageRedactOptions,
  'image.metadata': { action: 'remove-all', fields: {} } as ImageMetadataOptions,
  'image.collage': { layout: 'grid', order: [], gap: 12, background: '#FFFFFF', radius: 8, width: 2048, fit: 'cover' } as CollageOptions,
  'image.pdf': { order: [], pageSize: 'a4', margin: 'small', combine: true } as CreatePdfOptions,
  'pdf.compress': { level: 'balanced' } as PdfCompressOptions,
  'pdf.merge': { order: [] } as PdfMergeOptions,
  'pdf.split': { mode: 'each', every: 1, ranges: '' } as PdfSplitOptions,
  'pdf.organize': { pages: [] } as PdfOrganizeOptions,
  'pdf.images': { format: 'png', dpi: 300, ranges: '', quality: 90 } as PdfImagesOptions,
  'pdf.ocr': { languages: ['eng'], output: 'txt', ranges: '' } as PdfOcrOptions,
  'pdf.word': { mode: 'reflow', ocr: 'auto' } as PdfWordOptions,
  'pdf.metadata': { removeAll: false, title: '', author: '', subject: '', keywords: '' } as PdfMetadataOptions,
  'subtitle.shift': { offsetMs: 0 } as SubtitleShiftOptions
} satisfies Record<ToolId, object>;

/** Merge user options over defaults (shallow). Use in every tool runner. */
export function withDefaults<T extends object>(toolId: ToolId, options: Record<string, unknown> | undefined): T {
  return { ...(TOOL_DEFAULTS[toolId] as object), ...(options ?? {}) } as T;
}
```

**Code: `src/shared/tools.ts`**
```ts
import type { Category, ToolId } from './types';

export interface ToolMeta {
  id: ToolId;
  category: Category;
  label: string;          // wheel label
  icon: string;           // key in renderer Icon map
  description: string;
  minInputs: number;
  maxInputs: number;
  perFile: boolean;       // true = run once per input file
  suffix: string;         // output name suffix ("" = none)
  instant?: boolean;      // true = no options card, start immediately
  extra?: boolean;        // ☆ optional/suggested tool
}

const M = (t: ToolMeta): ToolMeta => t;

/** Order inside each category = wheel order (clockwise from 12 o'clock). */
export const TOOLS: ToolMeta[] = [
  // ---- video (order matches clean UI.png) ----
  M({ id: 'video.compress', category: 'video', label: 'Compress', icon: 'compress', description: 'Smaller file, good quality', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'compressed' }),
  M({ id: 'video.metadata', category: 'video', label: 'Metadata', icon: 'tag', description: 'View, edit or remove tags', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'meta' }),
  M({ id: 'video.mute', category: 'video', label: 'Mute', icon: 'mute', description: 'Remove the audio track', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'muted', instant: true }),
  M({ id: 'video.trim', category: 'video', label: 'Trim', icon: 'scissors', description: 'Keep one part', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'trimmed' }),
  M({ id: 'video.crop', category: 'video', label: 'Crop', icon: 'crop', description: 'Crop the frame', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'cropped' }),
  M({ id: 'video.speed', category: 'video', label: 'Speed', icon: 'gauge', description: 'Faster or slower', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'speed' }),
  M({ id: 'video.snapshot', category: 'video', label: 'Snapshot', icon: 'camera', description: 'Save a frame', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'frame' }),
  M({ id: 'video.split', category: 'video', label: 'Split', icon: 'film', description: 'Cut into parts', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'part' }),
  M({ id: 'video.redact', category: 'video', label: 'Redact', icon: 'eyeOff', description: 'Blur or hide areas', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'redacted' }),
  M({ id: 'video.join', category: 'video', label: 'Join', icon: 'join', description: 'Combine clips', minInputs: 2, maxInputs: 50, perFile: false, suffix: 'joined' }),
  // ---- audio ----
  M({ id: 'audio.compress', category: 'audio', label: 'Compress', icon: 'compress', description: 'Lower bitrate', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'compressed' }),
  M({ id: 'audio.normalize', category: 'audio', label: 'Normalize', icon: 'normalize', description: 'Even loudness', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'normalized' }),
  M({ id: 'audio.trim', category: 'audio', label: 'Trim', icon: 'scissors', description: 'Keep one part', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'trimmed' }),
  M({ id: 'audio.channels', category: 'audio', label: 'Channels', icon: 'channels', description: 'Mono, stereo, swap', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'channels' }),
  M({ id: 'audio.visualize', category: 'audio', label: 'Visualize', icon: 'waveform', description: 'Waveform or spectrogram', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'waveform' }),
  M({ id: 'audio.bleep', category: 'audio', label: 'Bleep', icon: 'bleep', description: 'Censor parts', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'bleeped' }),
  M({ id: 'audio.metadata', category: 'audio', label: 'Metadata', icon: 'tag', description: 'Tags and cover art', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'meta' }),
  M({ id: 'audio.join', category: 'audio', label: 'Join', icon: 'join', description: 'Combine files', minInputs: 2, maxInputs: 50, perFile: false, suffix: 'joined', extra: true }),
  // ---- image ----
  M({ id: 'image.compress', category: 'image', label: 'Compress', icon: 'compress', description: 'Smaller file', minInputs: 1, maxInputs: 200, perFile: true, suffix: 'compressed' }),
  M({ id: 'image.resize', category: 'image', label: 'Resize', icon: 'resize', description: 'Change dimensions', minInputs: 1, maxInputs: 200, perFile: true, suffix: 'resized', extra: true }),
  M({ id: 'image.crop', category: 'image', label: 'Crop', icon: 'crop', description: 'Crop, rotate, flip', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'cropped' }),
  M({ id: 'image.edit', category: 'image', label: 'Edit', icon: 'sliders', description: 'Exposure, color, effects', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'edited' }),
  M({ id: 'image.background', category: 'image', label: 'Backdrop', icon: 'frame', description: 'Add a background', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'backdrop' }),
  M({ id: 'image.redact', category: 'image', label: 'Redact', icon: 'eyeOff', description: 'Hide parts', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'redacted' }),
  M({ id: 'image.metadata', category: 'image', label: 'Metadata', icon: 'tag', description: 'EXIF, GPS', minInputs: 1, maxInputs: 200, perFile: true, suffix: 'clean' }),
  M({ id: 'image.collage', category: 'image', label: 'Collage', icon: 'grid', description: 'Combine images', minInputs: 2, maxInputs: 30, perFile: false, suffix: 'collage' }),
  M({ id: 'image.pdf', category: 'image', label: 'Make PDF', icon: 'filePdf', description: 'Images to one PDF', minInputs: 1, maxInputs: 500, perFile: false, suffix: '' }),
  // ---- pdf ----
  M({ id: 'pdf.compress', category: 'pdf', label: 'Compress', icon: 'compress', description: 'Smaller PDF', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'compressed' }),
  M({ id: 'pdf.merge', category: 'pdf', label: 'Merge', icon: 'join', description: 'Combine PDFs', minInputs: 2, maxInputs: 100, perFile: false, suffix: 'merged' }),
  M({ id: 'pdf.split', category: 'pdf', label: 'Split', icon: 'split', description: 'Split pages', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'part' }),
  M({ id: 'pdf.organize', category: 'pdf', label: 'Organize', icon: 'grid', description: 'Reorder, rotate, delete', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'organized' }),
  M({ id: 'pdf.images', category: 'pdf', label: 'Images', icon: 'images', description: 'Pages as images', minInputs: 1, maxInputs: 20, perFile: true, suffix: 'pages' }),
  M({ id: 'pdf.ocr', category: 'pdf', label: 'OCR', icon: 'scanText', description: 'Extract text', minInputs: 1, maxInputs: 20, perFile: true, suffix: 'ocr' }),
  M({ id: 'pdf.word', category: 'pdf', label: 'Word', icon: 'fileWord', description: 'Export to DOCX', minInputs: 1, maxInputs: 20, perFile: true, suffix: '' }),
  M({ id: 'pdf.metadata', category: 'pdf', label: 'Metadata', icon: 'tag', description: 'Title, author…', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'meta' }),
  // ---- subtitles ----
  M({ id: 'subtitle.shift', category: 'subtitle', label: 'Shift', icon: 'clock', description: 'Fix timing', minInputs: 1, maxInputs: 20, perFile: true, suffix: 'shifted', extra: true })
];

export function toolMeta(id: ToolId): ToolMeta {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tool ${id}`);
  return t;
}

export function toolsFor(category: Category, count: number): ToolMeta[] {
  return TOOLS.filter((t) => t.category === category && count >= t.minInputs && count <= t.maxInputs);
}
```

**Tests (`tools.test.ts`)**
- `toolsFor('video', 1)` has 9 items, starts with `video.compress` and does not include `video.join`.
- `toolsFor('video', 2)` includes `video.join` and excludes `video.trim` (maxInputs 1).
- `toolsFor('epub', 1)` → `[]`.
- Every `ToolId` key in `TOOL_DEFAULTS` exists in `TOOLS` (iterate over `Object.keys(TOOL_DEFAULTS)`).

---

## Task 1.4 — `geometry.ts` (normalized rectangles)
**Files:** `src/shared/geometry.ts`, `src/shared/geometry.test.ts`
```ts
export interface NormRect { x: number; y: number; w: number; h: number }   // 0..1
export interface PixelRect { x: number; y: number; w: number; h: number }

export type DragHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const MIN_NORM = 0.02;
export const FULL_RECT: NormRect = { x: 0, y: 0, w: 1, h: 1 };

export const ASPECTS: Array<{ key: string; label: string; ratio: number | null }> = [
  { key: 'free', label: 'Freeform', ratio: null },
  { key: 'original', label: 'Original', ratio: null },   // ratio computed from media
  { key: '1:1', label: 'Square 1:1', ratio: 1 },
  { key: '4:5', label: 'Portrait 4:5', ratio: 4 / 5 },
  { key: '9:16', label: 'Story 9:16', ratio: 9 / 16 },
  { key: '16:9', label: 'Wide 16:9', ratio: 16 / 9 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:2', label: '3:2', ratio: 3 / 2 },
  { key: '21:9', label: 'Cinema 21:9', ratio: 21 / 9 }
];

export function clampNormRect(r: NormRect): NormRect {
  const w = Math.min(1, Math.max(MIN_NORM, r.w));
  const h = Math.min(1, Math.max(MIN_NORM, r.h));
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

/** Rect after dragging `handle` by (dx, dy) in normalized units.
 *  aspect = wanted PIXEL width/height (null = free). frameAspect = media pixel width/height. */
export function dragRect(start: NormRect, handle: DragHandle, dx: number, dy: number, aspect: number | null, frameAspect: number): NormRect {
  if (handle === 'move') {
    return {
      ...start,
      x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
      y: Math.min(1 - start.h, Math.max(0, start.y + dy))
    };
  }
  let { x, y, w, h } = start;
  if (handle.includes('e')) w = start.w + dx;
  if (handle.includes('w')) { x = start.x + dx; w = start.w - dx; }
  if (handle.includes('s')) h = start.h + dy;
  if (handle.includes('n')) { y = start.y + dy; h = start.h - dy; }
  w = Math.max(MIN_NORM, w);
  h = Math.max(MIN_NORM, h);
  if (aspect !== null) {
    const k = frameAspect / aspect;            // keeps (w*W)/(h*H) === aspect
    if (handle === 'n' || handle === 's') w = h / k; else h = w * k;
    if (handle.includes('n')) y = start.y + start.h - h;
    if (handle.includes('w')) x = start.x + start.w - w;
  }
  return clampNormRect({ x, y, w, h });
}

/** Largest centred rect with pixel aspect `ratio` inside a width×height frame. */
export function fitAspect(ratio: number, width: number, height: number): NormRect {
  const frame = width / height;
  if (ratio > frame) {
    const h = frame / ratio;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = ratio / frame;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/** Normalized → integer pixels inside the frame. `even` rounds down to even numbers (required by H.264). */
export function toPixelRect(r: NormRect, width: number, height: number, even = false): PixelRect {
  let x = Math.round(r.x * width);
  let y = Math.round(r.y * height);
  let w = Math.round(r.w * width);
  let h = Math.round(r.h * height);
  w = Math.max(2, Math.min(w, width - x));
  h = Math.max(2, Math.min(h, height - y));
  if (even) {
    x -= x % 2; y -= y % 2;
    w -= w % 2; h -= h % 2;
  }
  return { x, y, w, h };
}

export function isFullRect(r: NormRect): boolean {
  return r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;
}
```

**Tests**
- `fitAspect(1, 1920, 1080)` → `w ≈ 0.5625, h = 1, x ≈ 0.21875`.
- `toPixelRect({x:0.1,y:0.1,w:0.5,h:0.5}, 1001, 501, true)` → all four values are even, and `x + w ≤ 1001`.
- `dragRect(FULL_RECT, 'se', -0.5, -0.5, null, 1)` → `w = 0.5, h = 0.5`.
- `dragRect({x:0,y:0,w:0.5,h:0.5}, 'e', 0.2, 0, 1, 16/9)`: the pixel aspect `(w*16)/(h*9)` ≈ 1 (±0.01).
- `dragRect(..., 'move', 2, 2, ...)` stays inside 0..1.

---

## Task 1.5 — `naming.ts` (output names)
**Files:** `src/shared/naming.ts`, `src/shared/naming.test.ts`
```ts
/** "a.b.mp4" → {base:"a.b", ext:"mp4"}; ".bashrc" → {base:".bashrc", ext:""} */
export function splitName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1) };
}

export function outputFileName(base: string, ext: string, suffix?: string): string {
  return `${base}${suffix ? `-${suffix}` : ''}.${ext}`;
}

export function groupFolderName(base: string, group: string): string {
  return `${base}-${group}`;
}

/** "report", 3, 120, "jpg" → "report-003.jpg" (padding grows with total). */
export function groupFileName(base: string, index: number, total: number, ext: string): string {
  const pad = Math.max(3, String(total).length);
  return `${base}-${String(index).padStart(pad, '0')}.${ext}`;
}

/** "a.jpg", 2 → "a (2).jpg"; "folder", 1 → "folder (1)" */
export function withCounter(name: string, n: number): string {
  const { base, ext } = splitName(name);
  return ext ? `${base} (${n}).${ext}` : `${name} (${n})`;
}

/** First free path: name, name (1), name (2)… */
export function resolveCollision(
  dir: string,
  name: string,
  exists: (fullPath: string) => boolean,
  join: (a: string, b: string) => string
): string {
  let candidate = join(dir, name);
  for (let n = 1; exists(candidate); n++) {
    if (n > 9999) throw new Error('Too many files with the same name');
    candidate = join(dir, withCounter(name, n));
  }
  return candidate;
}

/** Remove characters Windows forbids; trim; limit length. */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  let s = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim();
  if (s.length === 0) s = 'output';
  if (s.length > 180) {
    const { base, ext } = splitName(s);
    s = `${base.slice(0, 170)}${ext ? `.${ext}` : ''}`;
  }
  return s;
}
```

**Tests:** cover every function. For `resolveCollision`, use a `Set` of existing paths and Node's `path.win32.join` in the test file. (Test files may import `node:path`.)

---

## Task 1.6 — `time.ts` and `pageRanges.ts`
**Files:** `src/shared/time.ts`, `src/shared/pageRanges.ts`, `src/shared/time.test.ts`, `src/shared/pageRanges.test.ts`

**Code: `time.ts`**
```ts
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** "1:02:03.5" | "02:03" | "75" | "00:00:01,500" → seconds (null if invalid). */
export function parseTimecode(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return null;
  const parts = s.split(':').map(Number);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return Number.isFinite(sec) ? sec : null;
}

const pad = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0');

/** 5.41 → "0:05.41"; 3725.5 → "1:02:05.50" (like the crop screenshot). */
export function formatTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const cs = Math.floor((rest - Math.floor(rest)) * 100);
  const core = `${pad(rest)}.${pad(cs)}`;
  return h > 0 ? `${h}:${pad(m)}:${core}` : `${m}:${core}`;
}

function hms(sec: number, sep: ',' | '.'): string {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export const formatSrtTime = (sec: number): string => hms(sec, ',');
export const formatVttTime = (sec: number): string => hms(sec, '.');

/** 65 → "1:05"; 3725 → "1:02:05" */
export function formatDuration(sec: number): string {
  const s = Math.round(Math.max(0, sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Explorer-style sizes (1024 based): "12.3 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}
```

**Code: `pageRanges.ts`**
```ts
/** Parse "1-3, 5, 8-" (1-based, inclusive) into groups of 0-based page indexes.
 *  "" → one group with all pages. Throws RangeError with a user-friendly message. */
export function parsePageRanges(input: string, total: number): number[][] {
  const text = input.trim();
  if (text === '') return [Array.from({ length: total }, (_, i) => i)];
  const groups: number[][] = [];
  for (const raw of text.split(',')) {
    const part = raw.trim();
    if (part === '') continue;
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    let from: number;
    let to: number;
    if (m) {
      from = m[1] ? Number(m[1]) : 1;
      to = m[2] ? Number(m[2]) : total;
    } else if (/^\d+$/.test(part)) {
      from = to = Number(part);
    } else {
      throw new RangeError(`"${part}" is not a page range. Use something like 1-3, 5, 8-`);
    }
    if (from < 1 || to < 1) throw new RangeError('Page numbers start at 1');
    if (from > total || to > total) throw new RangeError(`Page ${Math.max(from, to)} doesn't exist (this PDF has ${total} pages)`);
    if (from > to) throw new RangeError(`"${part}" goes backwards`);
    groups.push(Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  }
  if (groups.length === 0) throw new RangeError('No pages selected');
  return groups;
}

/** Unique page indexes in first-seen order. */
export function flattenRanges(groups: number[][]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const g of groups) for (const p of g) if (!seen.has(p)) { seen.add(p); out.push(p); }
  return out;
}
```

**Tests**
- `parseTimecode('1:02:03.5')` → `3723.5`; `parseTimecode('00:00:01,500')` → `1.5`; `parseTimecode('abc')` → `null`.
- `formatTimecode(5.41)` → `'0:05.41'`; `formatSrtTime(3723.5)` → `'01:02:03,500'`.
- `formatBytes(1536)` → `'1.5 KB'`.
- `parsePageRanges('', 3)` → `[[0,1,2]]`; `parsePageRanges('1-2, 3', 3)` → `[[0,1],[2]]`; `parsePageRanges('2-', 4)` → `[[1,2,3]]`.
- `parsePageRanges('5', 3)` throws a `RangeError` whose message contains `doesn't exist`.

---

## Task 1.7 — `subtitles.ts`
**Files:** `src/shared/subtitles.ts`, `src/shared/subtitles.test.ts`
```ts
import { formatSrtTime, formatVttTime, parseTimecode } from './time';

export interface Cue { start: number; end: number; text: string }

const TIME_LINE = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function normalize(input: string): string {
  return input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** Works for both SRT and VTT (headers, NOTE, STYLE and cue settings are skipped). */
export function parseSubtitles(input: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of normalize(input).split(/\n{2,}/)) {
    const lines = block.split('\n');
    const idx = lines.findIndex((l) => TIME_LINE.test(l));
    if (idx === -1) continue;
    const m = TIME_LINE.exec(lines[idx]);
    if (!m) continue;
    const start = parseTimecode(m[1]);
    const end = parseTimecode(m[2]);
    if (start === null || end === null) continue;
    const text = lines.slice(idx + 1).join('\n').trim();
    if (!text) continue;
    cues.push({ start, end: Math.max(start, end), text });
  }
  return cues;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&quot;': '"' };

/** keepBasic=true keeps <i> <b> <u> (valid in SRT). */
export function stripTags(text: string, keepBasic: boolean): string {
  const noTags = text.replace(/<\/?([a-z0-9.]+)[^>]*>/gi, (tag, name: string) =>
    keepBasic && ['i', 'b', 'u'].includes(name.toLowerCase()) ? tag.replace(/\s.*?>/, '>') : '');
  return keepBasic ? noTags : noTags.replace(/&(amp|lt|gt|nbsp|quot);/g, (e) => ENTITIES[e] ?? e);
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${stripTags(c.text, true)}\n`)
    .join('\n');
}

export function toVtt(cues: Cue[]): string {
  return 'WEBVTT\n\n' + cues.map((c) => `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text}\n`).join('\n');
}

export function toPlainText(cues: Cue[]): string {
  return cues.map((c) => stripTags(c.text, false)).join('\n') + '\n';
}

export function shiftCues(cues: Cue[], offsetSec: number): Cue[] {
  return cues
    .map((c) => ({ ...c, start: Math.max(0, c.start + offsetSec), end: c.end + offsetSec }))
    .filter((c) => c.end > 0);
}

export interface TextToCuesOptions {
  timing: 'reading' | 'fixed';
  secondsPerCue: number;
  charsPerSecond?: number;   // default 15
  maxLineChars?: number;     // default 42
  gapSec?: number;           // default 0.1
}

function wrapTwoLines(text: string, max: number): string {
  if (text.length <= max) return text;
  const mid = Math.floor(text.length / 2);
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best === -1 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

function chunk(line: string, maxChunk: number): string[] {
  const words = line.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChunk) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** One cue per non-empty line (long lines are split), timed by reading speed or a fixed duration. */
export function textToCues(text: string, o: TextToCuesOptions): Cue[] {
  const cps = o.charsPerSecond ?? 15;
  const maxLine = o.maxLineChars ?? 42;
  const gap = o.gapSec ?? 0.1;
  const pieces = normalize(text).split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => chunk(l, maxLine * 2));
  const cues: Cue[] = [];
  let t = 0;
  for (const p of pieces) {
    const dur = o.timing === 'fixed' ? o.secondsPerCue : Math.min(7, Math.max(1.2, p.length / cps));
    cues.push({ start: t, end: t + dur, text: wrapTwoLines(p, maxLine) });
    t += dur + gap;
  }
  return cues;
}
```

**Tests**
- Parse an SRT with a BOM, CRLF line endings and 2 cues → 2 cues with correct times.
- Parse a VTT with a `WEBVTT` header, a `NOTE` block, a cue without an id, a `mm:ss.mmm` time and cue settings (`align:start`) → correct cues.
- `toSrt(parseSubtitles(toVtt(cues)))` equals `toSrt(cues)` (round trip).
- `stripTags('<v Bob><i>Hi</i> &amp; bye</v>', false)` → `'Hi & bye'`; with `keepBasic` true → `'<i>Hi</i> &amp; bye'`.
- `textToCues('a\n\nb', {timing:'fixed', secondsPerCue:2})` → 2 cues: `[0,2]` and `[2.1,4.1]`.

---

## Task 1.8 — `text.ts` (decoding & HTML helpers)
**Files:** `src/shared/text.ts`, `src/shared/text.test.ts`
```ts
/** Decode text bytes: UTF-8 (with/without BOM), UTF-16 LE/BE with BOM. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export const escapeHtml = escapeXml;

export type TextFont = 'mono' | 'serif' | 'sans' | 'original';

/** Font stacks covering Windows, macOS and Linux (all include Vietnamese glyphs). */
export function fontStack(font: TextFont): string {
  if (font === 'mono') return "'Cascadia Mono', Consolas, 'SF Mono', Menlo, 'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', monospace";
  if (font === 'serif') return "Georgia, 'Times New Roman', 'Noto Serif', 'DejaVu Serif', 'Liberation Serif', serif";
  return "'Segoe UI', -apple-system, 'Helvetica Neue', 'Noto Sans', 'DejaVu Sans', Ubuntu, Cantarell, Arial, sans-serif";
}

export const TEXT_SIZE_PT: Record<'small' | 'medium' | 'large' | 'xlarge', number> = { small: 9.5, medium: 11, large: 13, xlarge: 16 };

export function cssPageSize(size: 'a4' | 'letter' | 'a5'): string {
  return size === 'letter' ? 'letter' : size === 'a5' ? 'A5' : 'A4';
}

/** Plain text → printable HTML document (used by TXT → PDF/JPG/PNG). */
export function textToHtml(text: string, o: { title: string; font: TextFont; sizePt: number; pageSize: 'a4' | 'letter' | 'a5' }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(o.title)}</title><style>
@page { size: ${cssPageSize(o.pageSize)}; margin: 18mm 16mm; }
html, body { margin: 0; background: #fff; }
body { font-family: ${fontStack(o.font)}; font-size: ${o.sizePt}pt; line-height: 1.45; color: #111; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0; }
</style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
}

/** Rough language guess for EPUB metadata. */
export function guessLang(text: string): string {
  return /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text) ? 'vi' : 'en';
}
```

**Tests**
- `decodeText` handles a UTF-8 BOM, UTF-16LE with BOM (`[0xff,0xfe,0x41,0x00]` → `'A'`) and plain UTF-8 `'Tiếng Việt'`.
- `escapeXml('<a & "b">')` → `'&lt;a &amp; &quot;b&quot;&gt;'`.
- `guessLang('Xin chào thế giới')` → `'vi'`.

---

## Task 1.9 — `wheelItems.ts` (what the wheel shows)
**Files:** `src/shared/wheelItems.ts`, `src/shared/wheelItems.test.ts`
```ts
import { CONVERT_TARGETS, FORMATS, needsOptions, targetAvailable } from './formats';
import { toolsFor } from './tools';
import type { Capabilities, Category, FileInfo, Fmt, ToolId, WheelMode } from './types';

export const MAX_SLICES = 12;

export interface WheelItem {
  key: string;
  label: string;
  icon?: string;
  kind: 'format' | 'tool';
  target?: Fmt;
  toolId?: ToolId;
  needsOptions: boolean;
}

export interface WheelModel {
  items: WheelItem[];
  emptyReason?: string;
  category: Category | null;   // null when mixed or unknown
  mixed: boolean;
}

export function buildWheel(files: FileInfo[], mode: WheelMode, caps: Capabilities): WheelModel {
  const supported = files.filter((f) => f.category !== null);
  if (supported.length === 0) {
    return { items: [], emptyReason: "This file type isn't supported yet", category: null, mixed: false };
  }
  const cats = new Set<Category>(supported.map((f) => f.category as Category));
  const mixed = cats.size > 1;
  const category = mixed ? null : [...cats][0];

  if (mode === 'tools') {
    if (!category) return { items: [], emptyReason: 'Mixed file types — drop files of one kind to see tools', category, mixed };
    const tools = toolsFor(category, supported.length);
    if (tools.length === 0) return { items: [], emptyReason: 'No tools for this file type yet', category, mixed };
    return {
      items: tools.slice(0, MAX_SLICES).map((t) => ({
        key: t.id, label: t.label, icon: t.icon, kind: 'tool' as const, toolId: t.id, needsOptions: !t.instant
      })),
      category,
      mixed
    };
  }

  let targets: Fmt[] | null = null;
  for (const c of cats) {
    const list = CONVERT_TARGETS[c].filter((t) => targetAvailable(t, c, caps));
    targets = targets === null ? list : targets.filter((t) => list.includes(t));
  }
  const finalTargets = (targets ?? []).filter((t) => !supported.every((f) => f.fmt === t));
  if (finalTargets.length === 0) {
    return { items: [], emptyReason: 'No shared conversion — drop files of one kind', category, mixed };
  }
  return {
    items: finalTargets.slice(0, MAX_SLICES).map((t) => ({
      key: `to-${t}`,
      label: FORMATS[t].label,
      kind: 'format' as const,
      target: t,
      needsOptions: category !== null && needsOptions(category, t)
    })),
    category,
    mixed
  };
}
```

**Tests:** build `FileInfo` objects with a small helper `fi(path, fmt, category)`, and a full `caps` object with every `Capabilities` field: `platform: 'win32'`, `ffmpeg: true`, all encoders from `REQUIRED_ENCODERS`, `heifEnc: false`, `heicTool: null`, `hwVideo: null`, `globalDrag: 'hook'`. Add one extra test with `platform: 'darwin', heifEnc: true, heicTool: 'sips'` → HEIC **is** offered for a PNG.
- One PNG → targets exclude `png` and `heic`, include `pdf` and `docx`; 8 items.
- One MP4 and one MP3 → convert items equal exactly `['mp3']`.
- One MP4 and one MP3 in tools mode → `items: []` and the reason contains "Mixed".
- Two PDFs in tools mode → includes `pdf.merge`. One PDF → no merge.
- `video.mute` has `needsOptions: false`.

---

## Task 1.10 — `overlay.ts` and `ipc.ts` (window layout + IPC contract)
**Files:** `src/shared/overlay.ts`, `src/shared/ipc.ts`

**Code: `overlay.ts`**
```ts
export interface OverlaySize { width: number; height: number; anchor: 'wheel' | 'center' }

/** Overlay window while showing the wheel. The wheel centre (anchorX, anchorY) is placed at the cursor. */
export const WHEEL_STAGE = { width: 440, height: 500, anchorX: 220, anchorY: 210 } as const;
export const WHEEL_SIZE = 340;   // svg box; top-left inside the window = (50, 40)
```

**Code: `ipc.ts`**
```ts
import type { OverlaySize } from './overlay';
import type {
  Capabilities, DragState, FileInfo, ImagePreviewRequest, ImagePreviewResult, JobRequest, JobUpdate,
  MetadataInfo, OverlayInit, Settings, WheelMode
} from './types';

export const IPC = {
  getCapabilities: 'app:get-capabilities',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  pickFiles: 'files:pick',
  pickFolder: 'files:pick-folder',
  inspectFiles: 'files:inspect',
  startJob: 'job:start',
  cancelJob: 'job:cancel',
  listJobs: 'job:list',
  reveal: 'shell:reveal',
  openPath: 'shell:open',
  openOverlay: 'overlay:open',
  closeOverlay: 'overlay:close',
  resizeOverlay: 'overlay:resize',
  overlayDropped: 'overlay:dropped',
  previewMedia: 'preview:media',
  previewFrame: 'preview:frame',
  previewWaveform: 'preview:waveform',
  previewImage: 'preview:image',
  pdfThumbnails: 'preview:pdf-thumbnails',
  readMetadata: 'meta:read',
  evJobUpdate: 'ev:job-update',
  evOverlayInit: 'ev:overlay-init',
  evOverlayFiles: 'ev:overlay-files',
  evOverlayDrag: 'ev:overlay-drag',
  evSettings: 'ev:settings',
  evNavigate: 'ev:navigate',          // main → main window: switch tab (macOS ⌘, opens Settings)
  engineCall: 'engine:call',
  engineResult: 'engine:result',
  engineReady: 'engine:ready'
} as const;

export interface KabooksApi {
  getPathForFile(file: File): string;
  getCapabilities(): Promise<Capabilities>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  pickFiles(): Promise<string[]>;
  pickFolder(): Promise<string | null>;
  inspectFiles(paths: string[], deep: boolean): Promise<FileInfo[]>;
  startJob(req: JobRequest): Promise<string>;
  cancelJob(id: string): Promise<void>;
  listJobs(): Promise<JobUpdate[]>;
  reveal(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  openOverlay(paths: string[], mode: WheelMode): Promise<void>;
  closeOverlay(): Promise<void>;
  resizeOverlay(size: OverlaySize): Promise<void>;
  overlayDropped(paths: string[]): Promise<FileInfo[]>;
  previewMedia(path: string): Promise<{ url: string; isProxy: boolean }>;
  previewFrame(path: string, timeSec: number, maxWidth: number): Promise<string>;
  previewWaveform(path: string, width: number, height: number): Promise<string>;
  previewImage(req: ImagePreviewRequest): Promise<ImagePreviewResult>;
  pdfThumbnails(path: string, maxWidth: number): Promise<string[]>;
  readMetadata(path: string): Promise<MetadataInfo>;
  onJobUpdate(cb: (u: JobUpdate) => void): () => void;
  onOverlayInit(cb: (p: OverlayInit) => void): () => void;
  onOverlayFiles(cb: (files: FileInfo[]) => void): () => void;
  onOverlayDrag(cb: (s: DragState) => void): () => void;
  onSettings(cb: (s: Settings) => void): () => void;
  onNavigate(cb: (tab: 'convert' | 'formats' | 'settings') => void): () => void;
}

export type EngineMethod = 'ping' | 'pdf.open' | 'pdf.close' | 'pdf.renderPage' | 'pdf.extractText' | 'pdf.thumbnails';
export interface EngineCall { id: string; method: EngineMethod; params: unknown }
export interface EngineResult { id: string; ok: boolean; result?: unknown; error?: string }
export interface EngineApi {
  onCall(cb: (call: EngineCall) => void): void;
  sendResult(r: EngineResult): void;
  ready(): void;
}
```

**Verify:**
- `npm run typecheck` passes.
- `npm test` passes all shared tests.
- Delete `src/shared/smoke.test.ts`.

**Done when:** Phase 1 is committed and PROGRESS.md is ticked.

# Phase 2 — Binaries & capabilities

## Task 2.1 — `scripts/fetch-binaries.mjs` + `scripts/check-binaries.mjs` (FFmpeg per OS + OCR data)
**Goal:** download FFmpeg/FFprobe **for the current OS/arch** (or a `--target`) and the OCR language files into `resources/`. This runs once at development time (and in CI) and needs internet; the app itself stays offline.

| Target | Source | Archive |
|---|---|---|
| `win32-x64` | gyan.dev "release essentials" | one zip with `bin/ffmpeg.exe`, `bin/ffprobe.exe` |
| `darwin-arm64`, `darwin-x64` | ffmpeg.martin-riedl.de (signed macOS builds) | `ffmpeg.zip` and `ffprobe.zip` |
| `linux-x64`, `linux-arm64` | ffmpeg.martin-riedl.de (static Linux builds) | `ffmpeg.zip` and `ffprobe.zip` |

**Files:**
- `scripts/fetch-binaries.mjs`, `scripts/check-binaries.mjs`
- `package.json` scripts:
  - `"fetch-binaries": "node scripts/fetch-binaries.mjs"`
  - `"check-binaries": "node scripts/check-binaries.mjs"`
```js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import extract from 'extract-zip';

const root = path.resolve(import.meta.dirname, '..');
const targetArg = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length);
const target = targetArg ?? `${process.platform}-${process.arch}`;          // e.g. darwin-arm64
const [platform, arch] = target.split('-');
const exe = (name) => (platform === 'win32' ? `${name}.exe` : name);
const binDir = path.join(root, 'resources', 'bin', target);
const tessDir = path.join(root, 'resources', 'tessdata');
const tmp = path.join(root, '.cache', 'downloads', target);

const RIEDL = (os, a, file) => `https://ffmpeg.martin-riedl.de/redirect/latest/${os}/${a === 'x64' ? 'amd64' : 'arm64'}/release/${file}`;
const SOURCES = {
  'win32-x64': [{ url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', zip: 'ffmpeg-win.zip', files: ['ffmpeg.exe', 'ffprobe.exe'] }],
  'darwin-arm64': [{ url: RIEDL('macos', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'darwin-x64': [{ url: RIEDL('macos', 'x64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('macos', 'x64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-x64': [{ url: RIEDL('linux', 'x64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'x64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }],
  'linux-arm64': [{ url: RIEDL('linux', 'arm64', 'ffmpeg.zip'), zip: 'ffmpeg.zip', files: ['ffmpeg'] }, { url: RIEDL('linux', 'arm64', 'ffprobe.zip'), zip: 'ffprobe.zip', files: ['ffprobe'] }]
};
const TESS = {
  eng: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
  vie: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/vie.traineddata'
};

async function download(url, dest) {
  if (fs.existsSync(dest)) { console.log('cached  ', path.basename(dest)); return; }
  console.log('download', url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + '.part'));
  await fs.promises.rename(dest + '.part', dest);
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findFile(p, name); if (r) return r; }
    else if (e.name.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

/** macOS/Linux: make executable. macOS: drop quarantine, keep a valid signature (ad-hoc sign if needed). */
function prepareBinary(file) {
  if (platform === 'win32') return;
  fs.chmodSync(file, 0o755);
  if (platform !== 'darwin' || process.platform !== 'darwin') return;   // can only sign on a Mac
  try { execFileSync('xattr', ['-d', 'com.apple.quarantine', file], { stdio: 'ignore' }); } catch { /* not quarantined */ }
  try { execFileSync('codesign', ['--verify', file], { stdio: 'ignore' }); }
  catch { execFileSync('codesign', ['--force', '--sign', '-', file]); console.log('ad-hoc signed', path.basename(file)); }
}

async function main() {
  const sources = SOURCES[target];
  if (!sources) throw new Error(`Unsupported target ${target}. Use one of: ${Object.keys(SOURCES).join(', ')}`);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(tessDir, { recursive: true });
  if (!fs.existsSync(path.join(binDir, exe('ffmpeg'))) || !fs.existsSync(path.join(binDir, exe('ffprobe')))) {
    for (const s of sources) {
      const zip = path.join(tmp, s.zip);
      await download(s.url, zip);
      const out = path.join(tmp, `${s.zip}-extract`);
      fs.rmSync(out, { recursive: true, force: true });
      await extract(zip, { dir: out });
      for (const name of s.files) {
        const src = findFile(out, name);
        if (!src) throw new Error(`${name} not found inside ${s.zip}`);
        const dest = path.join(binDir, name);
        fs.copyFileSync(src, dest);
        prepareBinary(dest);
      }
      const lic = findFile(out, 'LICENSE') ?? findFile(out, 'LICENSE.txt') ?? findFile(out, 'COPYING.GPLv3');
      if (lic) fs.copyFileSync(lic, path.join(binDir, 'LICENSE-ffmpeg.txt'));
    }
  } else {
    console.log('ffmpeg already present for', target);
  }
  for (const [lang, url] of Object.entries(TESS)) await download(url, path.join(tessDir, `${lang}.traineddata`));
  console.log('Done. Binaries in', binDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Code: `scripts/check-binaries.mjs`** (cross-platform replacement for OS-specific shell checks)
```js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = `${process.platform}-${process.arch}`;
const bin = (n) => path.join(root, 'resources', 'bin', target, process.platform === 'win32' ? `${n}.exe` : n);
const NEED = ['libx264', 'aac', 'libvpx-vp9', 'libopus', 'mpeg4', 'libmp3lame', 'wmv2', 'wmav2', 'gif', 'flac', 'libvorbis', 'pcm_s16le', 'pcm_s16be', 'bmp'];
let ok = true;
for (const n of ['ffmpeg', 'ffprobe']) {
  try { console.log(execFileSync(bin(n), ['-version']).toString().split('\n')[0]); }
  catch (e) { ok = false; console.error(`✗ ${n} does not run: ${e.message}`); }
}
try {
  const enc = execFileSync(bin('ffmpeg'), ['-hide_banner', '-encoders']).toString();
  for (const e of NEED) { const has = new RegExp(`\\s${e.replace(/[-]/g, '\\-')}\\s`).test(enc); if (!has) ok = false; console.log(`${has ? '✓' : '✗'} encoder ${e}`); }
  for (const hw of ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']) if (enc.includes(` ${hw} `)) console.log(`• hardware encoder available in build: ${hw}`);
} catch { ok = false; }
for (const lang of ['eng', 'vie']) {
  const f = path.join(root, 'resources', 'tessdata', `${lang}.traineddata`);
  const has = fs.existsSync(f) && fs.statSync(f).size > 1_000_000;
  console.log(`${has ? '✓' : '✗'} tessdata ${lang}`);
  if (!has && lang === 'eng') ok = false;
}
console.log(ok ? '\nAll required binaries OK' : '\nSome required binaries are missing');
process.exit(ok ? 0 : 1);
```
**Verify**
1. Run `npm run fetch-binaries`. It takes a while; the downloads are 30–100 MB.
2. Run `npm run check-binaries`. It must end with "All required binaries OK".
3. **macOS:** `codesign --verify resources/bin/darwin-<arch>/ffmpeg` prints nothing (valid signature).

If a download URL fails:
- **Windows:** open https://www.gyan.dev/ffmpeg/builds/ and copy the current "release essentials" `.zip` link.
- **macOS/Linux:** open https://ffmpeg.martin-riedl.de/ and use the "redirect" URL pattern shown there.

Update `SOURCES` with the link and note it in PROGRESS.md.

---

## Task 2.2 — `scripts/copy-pdfjs-assets.mjs`
**Goal:** pdf.js needs its CMaps, standard fonts and (in v5+) wasm/ICC files served locally.
**Files:** `scripts/copy-pdfjs-assets.mjs`, plus these `package.json` scripts:
`"predev": "node scripts/copy-pdfjs-assets.mjs"` and `"prebuild": "node scripts/copy-pdfjs-assets.mjs"`.
```js
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const dest = path.join(root, 'src', 'renderer', 'public', 'pdfjs');
let copied = 0;
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  const from = path.join(src, dir);
  if (!fs.existsSync(from)) continue;              // wasm/iccs only exist in newer pdf.js
  fs.cpSync(from, path.join(dest, dir), { recursive: true });
  copied++;
}
if (copied < 2) { console.error('pdfjs-dist assets not found in', src); process.exit(1); }
console.log(`pdf.js assets copied (${copied} folders) →`, dest);
```
**Verify:** `npm run build` now prints "pdf.js assets copied", and `out/renderer/pdfjs/cmaps` exists after the build.

---

## Task 2.3 — HEIC output encoder per OS
**Goal:** enable HEIC *output*. The capability is detected automatically in Task 2.4; this task only makes the tool available.

| OS | What to do |
|---|---|
| **macOS** | Nothing. Apple's `/usr/bin/sips` encodes HEIC on every Mac. Check: `sips --help` prints usage. |
| **Windows** (optional) | Download a Windows build of libheif with `heif-enc.exe` and the x265 encoder (e.g. https://github.com/pphh77/libheif-Windowsbinary/releases). Copy `heif-enc.exe` **plus every `.dll` next to it** into `resources/bin/win32-x64/heif/`. Check: `& ".\resources\bin\win32-x64\heif\heif-enc.exe" --help` lists `-q` and `-o`. |
| **Linux** (optional) | Install the system tool: `sudo apt install libheif-examples` (Debian/Ubuntu) or `sudo dnf install libheif-tools` (Fedora). Check: `heif-enc --help`. Kabooks finds it on `PATH`. **The packaged app does not bundle it**, so end users install it the same way. Mention this on the Formats page. |

Record in PROGRESS.md whether HEIC output is enabled on your OS.

---

## Task 2.4 — `paths.ts`, `log.ts`, `errors.ts`, `util.ts`, `appState.ts`, `engines/process.ts`, `engines/ffmpegParse.ts`, `capabilities.ts`
**Files:** the eight files above under `src/main/`, plus `src/main/engines/ffmpegParse.test.ts`.

**Code: `src/main/paths.ts`**
```ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const isWin = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

/** "win32-x64", "darwin-arm64", "linux-x64", … (folder name under resources/bin in development). */
export const platformKey = (): string => `${process.platform}-${process.arch}`;
const exeName = (name: string): string => (isWin ? `${name}.exe` : name);

/** resources/ in dev, process.resourcesPath when packaged. */
export function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
}
/** Packaged: electron-builder copies resources/bin/<platform>-<arch> to <resources>/bin (Task 13.1). */
export function binDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(resourcesRoot(), 'bin', platformKey());
}
export const ffmpegPath = (): string => path.join(binDir(), exeName('ffmpeg'));
export const ffprobePath = (): string => path.join(binDir(), exeName('ffprobe'));
/** Bundled heif-enc (Windows). Linux uses the system one on PATH; macOS uses sips (see capabilities.ts). */
export const heifEncPath = (): string => path.join(binDir(), 'heif', exeName('heif-enc'));
export const macDragHelperPath = (): string => path.join(binDir(), 'kabooks-drag-helper');
export const tessdataDir = (): string => path.join(resourcesRoot(), 'tessdata');
/** macOS uses a black "template" image so the menu bar can tint it; Windows/Linux use the coloured icon. */
export const trayIconPath = (): string => path.join(resourcesRoot(), isMac ? 'trayTemplate.png' : 'tray.png');

/** Find an executable on PATH (Linux/macOS), or null. */
export function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, exeName(name));
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ }
  }
  return null;
}

export function userDir(...parts: string[]): string {
  const p = path.join(app.getPath('userData'), ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
export const cacheDir = (...parts: string[]): string => userDir('cache', ...parts);

export function jobsTempRoot(): string {
  const p = path.join(app.getPath('temp'), 'kabooks-jobs');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export const preloadPath = (name: 'index' | 'engine'): string => path.join(__dirname, '../preload', `${name}.js`);
export const rendererDir = (): string => path.join(__dirname, '../renderer');

export function rendererUrl(page: 'index' | 'engine', query = ''): string {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && dev) return `${dev}/${page}.html${query}`;
  return `app://kabooks/${page}.html${query}`;
}
```

**Code: `src/main/log.ts`**
```ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let stream: fs.WriteStream | null = null;

function out(): fs.WriteStream {
  if (!stream) {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    stream = fs.createWriteStream(path.join(dir, 'main.log'), { flags: 'a' });
  }
  return stream;
}

function fmt(a: unknown): string {
  if (a instanceof Error) return a.stack ?? a.message;
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}

function write(level: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${level} ${args.map(fmt).join(' ')}`;
  console.log(line);
  out().write(line + '\n');
}

export const log = {
  info: (...a: unknown[]): void => write('INFO', a),
  warn: (...a: unknown[]): void => write('WARN', a),
  error: (...a: unknown[]): void => write('ERROR', a)
};
```

**Code: `src/main/errors.ts`**
```ts
export class UserError extends Error {
  constructor(message: string, public details?: string) { super(message); this.name = 'UserError'; }
}
export class ToolError extends Error {
  constructor(message: string, public details: string) { super(message); this.name = 'ToolError'; }
}
export class CanceledError extends Error {
  constructor() { super('Canceled'); this.name = 'CanceledError'; }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new CanceledError();
}

export function toUserMessage(err: unknown): { message: string; details?: string } {
  if (err instanceof UserError) return { message: err.message, details: err.details };
  if (err instanceof ToolError) return { message: err.message, details: err.details };
  const e = err as Error | undefined;
  return { message: 'Something went wrong while processing this file.', details: e?.stack ?? String(err) };
}
```

**Code: `src/main/util.ts`**
```ts
import fs from 'node:fs';

/** Run `fn` over items with at most `limit` in flight. Keeps order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Move a file; falls back to copy+delete across drives. Never overwrites. */
export async function moveFile(src: string, dest: string): Promise<void> {
  if (fs.existsSync(dest)) throw new Error(`Destination exists: ${dest}`);
  try {
    await fs.promises.rename(src, dest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.promises.copyFile(src, dest, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(src);
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Key for comparing paths: Windows and default macOS volumes are case-insensitive, Linux is case-sensitive. */
export function pathKey(p: string): string {
  const abs = path.resolve(p);
  return process.platform === 'linux' ? abs : abs.toLowerCase();
}
```
(Add `import path from 'node:path';` at the top of `util.ts`.)

**Code: `src/main/appState.ts`**
```ts
let quitting = false;
let trayActive = false;
export const isQuitting = (): boolean => quitting;
export const setQuitting = (): void => { quitting = true; };
/** Set by integrations/tray.ts (Task 11.4). Until a tray icon exists, closing the main window quits the app. */
export const isTrayActive = (): boolean => trayActive;
export const setTrayActive = (v: boolean): void => { trayActive = v; };
```

**Code: `src/main/engines/process.ts`**
```ts
import { spawn } from 'node:child_process';
import { CanceledError, ToolError } from '../errors';

export interface ProcessResult { stdout: Buffer; stderr: string }

/** Run a binary with an args array (never a shell). Rejects with ToolError on non-zero exit. */
export function runProcess(exe: string, args: string[], opts: { signal?: AbortSignal; name?: string } = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) { reject(new CanceledError()); return; }
    const child = spawn(exe, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-20000); });
    const onAbort = (): void => { child.kill(); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => { opts.signal?.removeEventListener('abort', onAbort); reject(e); });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) { reject(new CanceledError()); return; }
      if (code === 0) resolve({ stdout: Buffer.concat(chunks), stderr });
      else reject(new ToolError(`${opts.name ?? 'Process'} failed (exit code ${code})`, stderr.split(/\r?\n/).slice(-20).join('\n')));
    });
  });
}
```

**Code: `src/main/engines/ffmpegParse.ts`** (pure; no electron imports)
```ts
export interface ProbeVideo {
  codec: string; width: number; height: number; displayWidth: number; displayHeight: number;
  fps: number; pixFmt: string; rotation: number;
}
export interface ProbeAudio { codec: string; sampleRate: number; channels: number; bitRate: number }
export interface ProbeResult {
  durationSec: number; formatName: string; bitRate: number;
  video: ProbeVideo | null; audio: ProbeAudio | null; hasCover: boolean; tags: Record<string, string>;
}

export function parseEncoderList(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith('------'));
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) names.push(parts[1]);
  }
  return names;
}

export function parseRate(r: string | undefined): number {
  if (!r) return 0;
  const [a, b] = r.split('/').map(Number);
  if (!b) return Number.isFinite(a) ? a : 0;
  return a / b;
}

interface RawStream {
  codec_type?: string; codec_name?: string; width?: number; height?: number;
  avg_frame_rate?: string; r_frame_rate?: string; pix_fmt?: string;
  sample_rate?: string; channels?: number; bit_rate?: string; duration?: string;
  disposition?: { attached_pic?: number }; tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}
interface RawFormat { duration?: string; format_name?: string; bit_rate?: string; tags?: Record<string, string> }

export function parseProbeJson(json: string): ProbeResult {
  const data = JSON.parse(json) as { streams?: RawStream[]; format?: RawFormat };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const hasCover = streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic === 1);
  const a = streams.find((s) => s.codec_type === 'audio');
  let video: ProbeVideo | null = null;
  if (v && v.width && v.height) {
    const rot = Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0) || 0;
    const swap = Math.abs(rot) % 180 === 90;
    const fps = parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate);
    video = {
      codec: v.codec_name ?? '', width: v.width, height: v.height,
      displayWidth: swap ? v.height : v.width, displayHeight: swap ? v.width : v.height,
      fps: fps > 0 && fps < 1000 ? fps : 0, pixFmt: v.pix_fmt ?? '', rotation: rot
    };
  }
  const audio: ProbeAudio | null = a
    ? { codec: a.codec_name ?? '', sampleRate: Number(a.sample_rate ?? 0), channels: a.channels ?? 0, bitRate: Number(a.bit_rate ?? 0) }
    : null;
  const f = data.format ?? {};
  const durations = [Number(f.duration), ...streams.map((s) => Number(s.duration))].filter((d) => Number.isFinite(d) && d > 0);
  const tags: Record<string, string> = {};
  for (const [k, val] of Object.entries(f.tags ?? {})) tags[k.toLowerCase()] = String(val);
  return { durationSec: durations[0] ?? 0, formatName: f.format_name ?? '', bitRate: Number(f.bit_rate ?? 0), video, audio, hasCover, tags };
}

/** Map FFmpeg stderr to a plain-English message (see Appendix C). */
export function friendlyFfmpegError(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes('invalid data found when processing input') || s.includes('moov atom not found')) return 'This file looks damaged, or it is not really the format its name says.';
  if (s.includes('matches no streams') || s.includes('does not contain any stream')) return 'This file has no usable audio or video for this action.';
  if (s.includes('permission denied')) return "Kabooks can't read or write this file. Close it in other apps and try again.";
  if (s.includes('no space left')) return 'The disk is full.';
  if (s.includes('unknown encoder') || s.includes('encoder not found')) return 'This FFmpeg build is missing an encoder needed for this format.';
  if (s.includes('not divisible by 2')) return 'The encoder needs an even width and height.';
  return 'FFmpeg could not process this file.';
}
```

**Code: `src/main/capabilities.ts`**
```ts
import { app } from 'electron';
import fs from 'node:fs';
import type { Capabilities, Platform } from '@shared/types';
import { runProcess } from './engines/process';
import { parseEncoderList } from './engines/ffmpegParse';
import { ffmpegPath, findOnPath, heifEncPath, isLinux, isMac, macDragHelperPath, tessdataDir } from './paths';
import { log } from './log';

const empty = (): Capabilities => ({
  platform: process.platform as Platform, arch: process.arch, appVersion: app.getVersion(),
  ffmpeg: false, ffmpegVersion: '', encoders: [], heifEnc: false, heicTool: null, hwVideo: null,
  globalDrag: 'unavailable', ocrLanguages: []
});

let caps: Capabilities = empty();
let heicToolPath: string | null = null;

/** Where the HEIC encoder lives (used by engines/heif.ts). */
export function getHeicTool(): { kind: 'sips' | 'heif-enc'; path: string } | null {
  return caps.heicTool && heicToolPath ? { kind: caps.heicTool, path: heicToolPath } : null;
}

function detectHeic(next: Capabilities): void {
  if (isMac && fs.existsSync('/usr/bin/sips')) { next.heicTool = 'sips'; heicToolPath = '/usr/bin/sips'; }
  else if (fs.existsSync(heifEncPath())) { next.heicTool = 'heif-enc'; heicToolPath = heifEncPath(); }
  else if (isLinux) { const p = findOnPath('heif-enc'); if (p) { next.heicTool = 'heif-enc'; heicToolPath = p; } }
  next.heifEnc = next.heicTool !== null;
}

function detectGlobalDrag(): Capabilities['globalDrag'] {
  if (isMac) return fs.existsSync(macDragHelperPath()) ? 'mac-helper' : 'unavailable';
  if (isLinux) {
    const wayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
    return wayland ? 'unavailable' : 'hook';        // global hooks are impossible on Wayland
  }
  return 'hook';
}

export async function detectCapabilities(): Promise<Capabilities> {
  const next = empty();
  try {
    const enc = await runProcess(ffmpegPath(), ['-hide_banner', '-encoders'], { name: 'FFmpeg' });
    next.encoders = parseEncoderList(enc.stdout.toString());
    const ver = await runProcess(ffmpegPath(), ['-version'], { name: 'FFmpeg' });
    next.ffmpegVersion = ver.stdout.toString().split(/\r?\n/)[0] ?? '';
    next.ffmpeg = next.encoders.length > 0;
  } catch (e) {
    log.error('FFmpeg is not available', e);
  }
  detectHeic(next);
  next.globalDrag = detectGlobalDrag();
  try {
    next.ocrLanguages = fs.readdirSync(tessdataDir()).filter((f) => f.endsWith('.traineddata')).map((f) => f.replace(/\.traineddata$/, ''));
  } catch {
    next.ocrLanguages = [];
  }
  next.hwVideo = caps.hwVideo;          // filled later by detectHardwareVideo() (Task 12.7)
  caps = next;
  log.info('Capabilities', { platform: `${caps.platform}-${caps.arch}`, ffmpeg: caps.ffmpeg, version: caps.ffmpegVersion,
    encoders: caps.encoders.length, heic: caps.heicTool, globalDrag: caps.globalDrag, ocr: caps.ocrLanguages });
  return caps;
}

/** Used by Task 12.7 after it test-encodes a frame. */
export function setHardwareVideo(encoder: string | null): void {
  caps = { ...caps, hwVideo: encoder };
}

export function getCapabilities(): Capabilities {
  return caps;
}
```

**Tests: `ffmpegParse.test.ts`**
- `parseEncoderList`: feed a sample containing the header, a `------` line and two lines (` V....D libx264  libx264 H.264` and ` A....D aac  AAC`). Expect `['libx264','aac']`.
- `parseRate('30000/1001')` ≈ 29.97, and `parseRate('0/0')` → `NaN`-safe. Adjust the code so it returns `0`.
- `parseProbeJson`: a stream with `side_data_list:[{rotation:-90}]` and width 1920 / height 1080 gives `displayWidth` 1080. An `attached_pic` stream sets `hasCover` and is not chosen as `video`.

**Temporary wiring for verification:** in the temporary `src/main/index.ts`, after `app.whenReady()`, call `void detectCapabilities()`.

**Verify:** `npm run dev`. The terminal logs `Capabilities {"ffmpeg":true,…"encoders":<number above 100>…}`. Then `npm test` passes.

---

# Phase 3 — Main-process foundation

## Task 3.1 — `security.ts` and `protocol.ts` (`app://` and `kfile://`)
**Goal:**
- Serve the built UI from `app://kabooks/…` with a strict CSP.
- Serve allow-listed local media from `kfile://local/<encoded path>` with HTTP Range support, so video seeking works.
- Block all network access.

**Files:** `src/main/security.ts`, `src/main/protocol.ts`

**Code: `src/main/security.ts`**
```ts
import { app, session, type Session } from 'electron';

/** Cancel every http(s)/ws(s) request except the Vite dev server in development. */
export function blockNetwork(ses: Session = session.defaultSession): void {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  const devHost = !app.isPackaged && dev ? new URL(dev).host : null;
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, cb) => {
    if (devHost && new URL(details.url).host === devHost) { cb({}); return; }
    cb({ cancel: true });
  });
}

/** No popups, no navigation away from the app. */
export function hardenWebContents(): void {
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (event, url) => {
      const dev = process.env['ELECTRON_RENDERER_URL'];
      const ok = url.startsWith('app://') || (!!dev && url.startsWith(dev));
      if (!ok) event.preventDefault();
    });
  });
}
```

**Code: `src/main/protocol.ts`**
```ts
import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { rendererDir } from './paths';
import { pathKey } from './util';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: kfile:",
  "media-src 'self' blob: kfile:",
  "font-src 'self' data:",
  "connect-src 'self' kfile: data: blob:",
  "worker-src 'self' blob:"
].join('; ');

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', wasm: 'application/wasm',
  bcmap: 'application/octet-stream', pfb: 'application/octet-stream', icc: 'application/octet-stream',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', pdf: 'application/pdf'
};
const mimeFor = (p: string): string => MIME[path.extname(p).slice(1).toLowerCase()] ?? 'application/octet-stream';

/** MUST be called before app 'ready'. Register both schemes in ONE call. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    { scheme: 'kfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
  ]);
}

// ---- kfile allow-list ----
const allowed = new Set<string>();

/** Allow the renderer to load this local file and return its kfile:// URL. */
export function allowFile(filePath: string): string {
  const abs = path.resolve(filePath);
  allowed.add(pathKey(abs));
  return `kfile://local/${encodeURIComponent(abs)}`;
}

async function handleApp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const root = rendererDir();
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return new Response('Forbidden', { status: 403 });
  try {
    const data = await fs.promises.readFile(full);
    const headers: Record<string, string> = { 'Content-Type': mimeFor(full) };
    if (full.endsWith('.html')) headers['Content-Security-Policy'] = CSP;
    return new Response(new Uint8Array(data), { headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

async function handleKfile(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const filePath = path.resolve(decodeURIComponent(url.pathname.slice(1)));
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length' };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
  }
  if (!allowed.has(pathKey(filePath))) return new Response('Forbidden', { status: 403 });
  let size: number;
  try { size = (await fs.promises.stat(filePath)).size; } catch { return new Response('Not found', { status: 404 }); }
  const type = mimeFor(filePath);
  const range = request.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...cors, 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' }
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...cors, 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
}

/** Call after app 'ready'. */
export function registerProtocolHandlers(): void {
  protocol.handle('app', handleApp);
  protocol.handle('kfile', handleKfile);
}
```
**Verify:** done in Task 3.9.

---

## Task 3.2 — `settings.ts`
**Files:** `src/main/settings.ts`
```ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';

let current: Settings = { ...DEFAULT_SETTINGS };
const listeners = new Set<(s: Settings, prev: Settings) => void>();

const file = (): string => path.join(app.getPath('userData'), 'settings.json');

/** Keep only known keys whose type matches the default. */
function sanitize(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (def === null ? v === null || typeof v === 'string' : Array.isArray(def) ? Array.isArray(v) : typeof v === typeof def) out[k] = v;
  }
  return out as Partial<Settings>;
}

export function loadSettings(): Settings {
  try {
    current = { ...DEFAULT_SETTINGS, ...sanitize(JSON.parse(fs.readFileSync(file(), 'utf8'))) };
  } catch {
    current = { ...DEFAULT_SETTINGS };
  }
  return current;
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const prev = current;
  current = { ...current, ...sanitize(patch) };
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2));
  fs.renameSync(tmp, file());
  for (const l of listeners) l(current, prev);
  return current;
}

export function onSettingsChanged(cb: (s: Settings, prev: Settings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
```

---

## Task 3.3 — `engines/ffmpeg.ts` (run with progress, buffers, probe)
**Files:** `src/main/engines/ffmpeg.ts`
```ts
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { CanceledError, ToolError } from '../errors';
import { ffmpegPath, ffprobePath } from '../paths';
import { friendlyFfmpegError, parseProbeJson, type ProbeResult } from './ffmpegParse';
import { runProcess } from './process';

export interface FfmpegRunOptions {
  durationSec?: number;                 // expected OUTPUT duration, for progress
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** Runs ffmpeg with progress reporting. `args` must NOT include -y/-progress (added here). */
export function runFfmpeg(args: string[], opts: FfmpegRunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) { reject(new CanceledError()); return; }
    const full = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', ...args];
    const child = spawn(ffmpegPath(), full, { windowsHide: true });
    let stderr = '';
    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const k = line.slice(0, eq);
        const v = line.slice(eq + 1);
        if ((k === 'out_time_us' || k === 'out_time_ms') && opts.durationSec && opts.onProgress) {
          const us = Number(v);   // both keys are microseconds in FFmpeg
          if (Number.isFinite(us) && us > 0) opts.onProgress(Math.min(0.999, us / 1e6 / opts.durationSec));
        }
        if (k === 'progress' && v === 'end') opts.onProgress?.(1);
      }
    });
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-12000); });
    const onAbort = (): void => { child.kill(); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => { opts.signal?.removeEventListener('abort', onAbort); reject(e); });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) { reject(new CanceledError()); return; }
      if (code === 0) { resolve(); return; }
      const tail = stderr.split(/\r?\n/).slice(-15).join('\n');
      reject(new ToolError(friendlyFfmpegError(stderr), `ffmpeg ${full.join(' ')}\n\n${tail}`));
    });
  });
}

/** Run ffmpeg and return stdout (use with `-f image2pipe … pipe:1`). */
export async function runFfmpegToBuffer(args: string[], signal?: AbortSignal): Promise<Buffer> {
  const r = await runProcess(ffmpegPath(), ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], { signal, name: 'FFmpeg' });
  return r.stdout;
}

/** Run ffmpeg at loglevel info and return stderr (for loudnorm/volumedetect analysis). */
export async function runFfmpegCapture(args: string[], signal?: AbortSignal): Promise<string> {
  const r = await runProcess(ffmpegPath(), ['-hide_banner', '-nostdin', '-loglevel', 'info', ...args], { signal, name: 'FFmpeg' });
  return r.stderr;
}

const probeCache = new Map<string, ProbeResult>();

export async function probe(filePath: string): Promise<ProbeResult> {
  const st = await fs.promises.stat(filePath);
  const key = `${filePath}|${st.size}|${st.mtimeMs}`;
  const hit = probeCache.get(key);
  if (hit) return hit;
  const r = await runProcess(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath], { name: 'FFprobe' });
  const result = parseProbeJson(r.stdout.toString('utf8'));
  if (probeCache.size > 300) probeCache.clear();
  probeCache.set(key, result);
  return result;
}
```

---

## Task 3.4 — `inspect.ts` and `thumbnails.ts`
**Files:** `src/main/inspect.ts`, `src/main/thumbnails.ts`

**Code: `src/main/thumbnails.ts`** (Phase 6 adds HEIC, BMP, PDF and EPUB)
```ts
import fs from 'node:fs';
import sharp from 'sharp';
import type { FileInfo } from '@shared/types';
import { runFfmpegToBuffer } from './engines/ffmpeg';

const cache = new Map<string, string>();
const toDataUrl = (b: Buffer): string => `data:image/jpeg;base64,${b.toString('base64')}`;
const SCALE = 'scale=256:256:force_original_aspect_ratio=decrease';

async function build(f: FileInfo): Promise<string | undefined> {
  switch (f.category) {
    case 'image': {
      if (f.fmt === 'heic' || f.fmt === 'bmp') return undefined;      // Task 6.1
      const b = await sharp(f.path, { failOn: 'none', density: 72 }).rotate().resize(256, 256, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
      return toDataUrl(b);
    }
    case 'video': {
      if (!f.hasVideo) return undefined;
      const t = Math.min(1, (f.durationSec ?? 0) * 0.1);
      return toDataUrl(await runFfmpegToBuffer(['-ss', t.toFixed(2), '-i', f.path, '-frames:v', '1', '-vf', SCALE, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1']));
    }
    case 'audio': {
      if (!f.hasCover) return undefined;
      return toDataUrl(await runFfmpegToBuffer(['-i', f.path, '-map', '0:v:0', '-frames:v', '1', '-vf', SCALE, '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']));
    }
    default:
      return undefined;
  }
}

export async function makeThumbnail(f: FileInfo): Promise<string | undefined> {
  const st = await fs.promises.stat(f.path);
  const key = `${f.path}|${st.mtimeMs}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = await build(f);
  if (url) {
    if (cache.size > 200) cache.clear();
    cache.set(key, url);
  }
  return url;
}
```

**Code: `src/main/inspect.ts`**
```ts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { categoryOf, extOf, fmtFromExt } from '@shared/formats';
import { splitName } from '@shared/naming';
import type { FileInfo } from '@shared/types';
import { probe } from './engines/ffmpeg';
import { log } from './log';
import { makeThumbnail } from './thumbnails';
import { mapLimit } from './util';

const MAX_FILES = 500;

/** Folders → their direct files (sorted). De-duplicates. */
export async function expandPaths(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    try {
      const st = await fs.promises.stat(p);
      if (st.isDirectory()) {
        const entries = await fs.promises.readdir(p, { withFileTypes: true });
        for (const e of entries.filter((x) => x.isFile()).sort((a, b) => a.name.localeCompare(b.name))) out.push(path.join(p, e.name));
      } else if (st.isFile()) {
        out.push(p);
      }
    } catch {
      /* ignore missing paths */
    }
    if (out.length >= MAX_FILES) break;
  }
  return [...new Set(out.map((p) => path.resolve(p)))].slice(0, MAX_FILES);
}

export function inspectBasic(filePath: string): FileInfo {
  const name = path.basename(filePath);
  const ext = extOf(filePath);
  const fmt = fmtFromExt(ext);
  let size = 0;
  try { size = fs.statSync(filePath).size; } catch { /* missing */ }
  return { path: filePath, name, base: splitName(name).base, ext, fmt, category: fmt ? categoryOf(fmt) : null, size };
}

export async function inspectDeep(info: FileInfo): Promise<FileInfo> {
  const out: FileInfo = { ...info, deep: true };
  try {
    if (out.category === 'video' || out.category === 'audio') {
      const p = await probe(out.path);
      out.durationSec = p.durationSec;
      out.hasVideo = !!p.video;
      out.hasAudio = !!p.audio;
      out.hasCover = p.hasCover;
      if (p.video) { out.width = p.video.displayWidth; out.height = p.video.displayHeight; out.videoCodec = p.video.codec; out.fps = p.video.fps; }
      if (p.audio) { out.audioCodec = p.audio.codec; out.sampleRate = p.audio.sampleRate; out.channels = p.audio.channels; }
    } else if (out.category === 'image' && out.fmt !== 'heic' && out.fmt !== 'bmp') {
      const m = await sharp(out.path, { failOn: 'none' }).metadata();
      const swap = (m.orientation ?? 1) >= 5;
      out.width = swap ? m.height : m.width;
      out.height = swap ? m.width : m.height;
    }
    out.thumbnail = await makeThumbnail(out);
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    log.warn('inspectDeep failed', out.path, e);
  }
  return out;
}

export async function inspectFiles(paths: string[], deep: boolean): Promise<FileInfo[]> {
  const basic = (await expandPaths(paths)).map(inspectBasic);
  return deep ? mapLimit(basic, 4, inspectDeep) : basic;
}
```

---

## Task 3.5 — Jobs: `context.ts`, `execute.ts`, `queue.ts` + empty registries
**Files:** `src/main/jobs/context.ts`, `src/main/jobs/execute.ts`, `src/main/jobs/queue.ts`, `src/main/converters/index.ts`, `src/main/tools/index.ts`

**Code: `src/main/converters/index.ts`**
```ts
import type { ConvertOptions } from '@shared/toolOptions';
import type { Category, FileInfo, Fmt } from '@shared/types';
import type { JobContext } from '../jobs/context';

export type ConvertFn = (file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext) => Promise<void>;

/** One converter per input category. Later tasks add entries here. */
export const CONVERTERS: Partial<Record<Category, ConvertFn>> = {};
```

**Code: `src/main/tools/index.ts`**
```ts
import type { FileInfo, ToolId } from '@shared/types';
import type { JobContext } from '../jobs/context';

export type ToolRunFn = (files: FileInfo[], options: Record<string, unknown>, ctx: JobContext) => Promise<void>;

/** Later tasks add entries here, e.g. 'video.compress': runVideoCompress. */
export const TOOL_RUNNERS: Partial<Record<ToolId, ToolRunFn>> = {};
```

**Code: `src/main/jobs/context.ts`**
```ts
import fs from 'node:fs';
import path from 'node:path';
import { groupFileName, groupFolderName, outputFileName, resolveCollision, sanitizeFileName, splitName } from '@shared/naming';
import type { Capabilities, Settings } from '@shared/types';
import { jobsTempRoot } from '../paths';
import { moveFile, pathKey } from '../util';

export interface OutputSpec {
  source: string;          // input file this output derives from (decides folder + base name)
  ext: string;             // output extension without dot
  suffix?: string;         // "-compressed"
  group?: string;          // multi-file output → folder "<base>-<group>/<base>-001.ext"
  index?: number;          // 1-based (group only)
  total?: number;          // group size (for zero padding)
  nameOverride?: string;   // full file name (rare)
}

export interface JobContext {
  readonly id: string;
  readonly signal: AbortSignal;
  readonly tempDir: string;
  readonly settings: Settings;
  readonly caps: Capabilities;
  progress(fraction: number, detail?: string): void;          // 0..1 within current subtask
  setSubtask(index: number, total: number, detail?: string): void;
  newOutput(spec: OutputSpec): string;                         // returns temp path to write to
  dropOutput(tempPath: string): void;                          // e.g. compressed file was bigger
  tempPath(name: string): string;                              // scratch file path (not an output)
  note(text: string): void;                                    // shown on the Done card
}

const reserved = new Set<string>();
const taken = (p: string): boolean => reserved.has(pathKey(p)) || fs.existsSync(p);

export class JobRun implements JobContext {
  readonly tempDir: string;
  readonly notes: string[] = [];
  private outputs: Array<{ tempPath: string; spec: OutputSpec }> = [];
  private dropped = new Set<string>();
  private sub = { index: 0, total: 1 };
  private scratch = 0;

  constructor(
    readonly id: string,
    readonly signal: AbortSignal,
    readonly settings: Settings,
    readonly caps: Capabilities,
    private report: (overall: number, detail?: string) => void
  ) {
    this.tempDir = path.join(jobsTempRoot(), id);
  }

  async init(): Promise<void> { await fs.promises.mkdir(this.tempDir, { recursive: true }); }

  setSubtask(index: number, total: number, detail?: string): void {
    this.sub = { index, total: Math.max(1, total) };
    this.report(index / this.sub.total, detail);
  }

  progress(fraction: number, detail?: string): void {
    const f = Math.min(1, Math.max(0, fraction));
    this.report((this.sub.index + f) / this.sub.total, detail);
  }

  newOutput(spec: OutputSpec): string {
    const ext = spec.ext.replace(/^\./, '').toLowerCase();
    const tempPath = path.join(this.tempDir, `out-${this.outputs.length}.${ext}`);
    this.outputs.push({ tempPath, spec: { ...spec, ext } });
    return tempPath;
  }

  dropOutput(tempPath: string): void { this.dropped.add(tempPath); }

  tempPath(name: string): string {
    this.scratch++;
    return path.join(this.tempDir, `tmp-${this.scratch}-${name}`);
  }

  note(text: string): void { this.notes.push(text); }

  /** Move outputs to their final names. Returns final absolute paths. */
  async finalize(inputs: string[]): Promise<string[]> {
    const inputSet = new Set(inputs.map((p) => pathKey(p)));
    const groupDirs = new Map<string, string>();
    const finals: string[] = [];
    const mine: string[] = [];
    try {
      for (const o of this.outputs) {
        if (this.dropped.has(o.tempPath)) continue;
        if (!fs.existsSync(o.tempPath)) throw new Error(`Expected output was not created (${path.basename(o.tempPath)})`);
        const { base } = splitName(path.basename(o.spec.source));
        const custom = this.settings.outputMode === 'custom-folder' && this.settings.customOutputDir;
        const outDir = custom ? (this.settings.customOutputDir as string) : path.dirname(o.spec.source);
        let finalPath: string;
        if (o.spec.group) {
          const key = `${o.spec.source}|${o.spec.group}`;
          let dir = groupDirs.get(key);
          if (!dir) {
            dir = resolveCollision(outDir, sanitizeFileName(groupFolderName(base, o.spec.group)), taken, path.join);
            await fs.promises.mkdir(dir, { recursive: true });
            groupDirs.set(key, dir);
          }
          finalPath = resolveCollision(dir, sanitizeFileName(groupFileName(base, o.spec.index ?? 1, o.spec.total ?? 1, o.spec.ext)), taken, path.join);
        } else {
          const name = o.spec.nameOverride ?? outputFileName(base, o.spec.ext, o.spec.suffix);
          finalPath = resolveCollision(outDir, sanitizeFileName(name), taken, path.join);
        }
        if (inputSet.has(pathKey(finalPath))) throw new Error('Refusing to overwrite an input file');
        reserved.add(pathKey(finalPath));
        mine.push(pathKey(finalPath));
        await moveFile(o.tempPath, finalPath);
        finals.push(finalPath);
      }
    } finally {
      for (const p of mine) reserved.delete(p);
    }
    return finals;
  }

  async cleanup(): Promise<void> {
    await fs.promises.rm(this.tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => undefined);
  }
}
```

**Code: `src/main/jobs/execute.ts`**
```ts
import { randomUUID } from 'node:crypto';
import { FORMATS } from '@shared/formats';
import { toolMeta } from '@shared/tools';
import type { Capabilities, JobRequest, Settings } from '@shared/types';
import { CONVERTERS } from '../converters';
import { throwIfAborted, UserError } from '../errors';
import { inspectFiles } from '../inspect';
import { TOOL_RUNNERS } from '../tools';
import { JobRun, type JobContext } from './context';

export function jobLabel(req: JobRequest): string {
  return req.kind === 'convert' ? `Convert to ${FORMATS[req.target].label}` : toolMeta(req.toolId).label;
}

const detailFor = (name: string, i: number, n: number): string => (n > 1 ? `${name} · ${i + 1} of ${n}` : name);

export async function executeRequest(req: JobRequest, ctx: JobContext): Promise<void> {
  const files = await inspectFiles(req.inputs, true);
  if (files.length === 0) throw new UserError('No files to process.');

  if (req.kind === 'convert') {
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
      throwIfAborted(ctx.signal);
      const f = files[i];
      ctx.setSubtask(i, files.length, detailFor(f.name, i, files.length));
      if (f.fmt === req.target) { skipped++; continue; }
      if (!f.category || !f.fmt) throw new UserError(`${f.name} is not a supported file type.`);
      const convert = CONVERTERS[f.category];
      if (!convert) throw new UserError(`Converting ${FORMATS[f.fmt].label} files is not available yet.`);
      await convert(f, req.target, req.options ?? {}, ctx);
    }
    if (skipped > 0) ctx.note(`${skipped} file${skipped > 1 ? 's were' : ' was'} already ${FORMATS[req.target].label}`);
    return;
  }

  const meta = toolMeta(req.toolId);
  const run = TOOL_RUNNERS[req.toolId];
  if (!run) throw new UserError(`${meta.label} is not available yet.`);
  if (files.length < meta.minInputs) throw new UserError(`${meta.label} needs at least ${meta.minInputs} files.`);
  if (meta.perFile) {
    for (let i = 0; i < files.length; i++) {
      throwIfAborted(ctx.signal);
      ctx.setSubtask(i, files.length, detailFor(files[i].name, i, files.length));
      await run([files[i]], req.options, ctx);
    }
  } else {
    ctx.setSubtask(0, 1, `${files.length} files`);
    await run(files, req.options, ctx);
  }
}

export interface RunJobOptions {
  id?: string;
  signal?: AbortSignal;
  settings: Settings;
  caps: Capabilities;
  onProgress?: (overall: number, detail?: string) => void;
}

/** Execute a request start-to-finish (used by the queue AND the self-test). */
export async function runJobNow(req: JobRequest, o: RunJobOptions): Promise<{ outputs: string[]; notes: string[] }> {
  const run = new JobRun(o.id ?? randomUUID(), o.signal ?? new AbortController().signal, o.settings, o.caps, o.onProgress ?? (() => undefined));
  try {
    await run.init();
    await executeRequest(req, run);
    const outputs = await run.finalize(req.inputs);
    return { outputs, notes: run.notes };
  } finally {
    await run.cleanup();
  }
}
```

**Code: `src/main/jobs/queue.ts`**
```ts
import { randomUUID } from 'node:crypto';
import type { JobRequest, JobUpdate } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { CanceledError, toUserMessage } from '../errors';
import { log } from '../log';
import { getSettings } from '../settings';
import { jobLabel, runJobNow } from './execute';

interface Rec { update: JobUpdate; controller: AbortController; lastEmit: number }

export class JobQueue {
  private jobs = new Map<string, Rec>();
  private running = 0;

  constructor(private emit: (u: JobUpdate) => void, private onFinished: (u: JobUpdate) => void) {}

  enqueue(request: JobRequest): string {
    const id = randomUUID();
    const update: JobUpdate = { id, label: jobLabel(request), request, status: 'queued', progress: 0, outputs: [], createdAt: Date.now() };
    this.jobs.set(id, { update, controller: new AbortController(), lastEmit: 0 });
    this.emit(update);
    this.trim();
    this.pump();
    return id;
  }

  cancel(id: string): void {
    const r = this.jobs.get(id);
    if (!r) return;
    if (r.update.status === 'queued') this.finish(r, { status: 'canceled' });
    else if (r.update.status === 'running') r.controller.abort();
  }

  list(): JobUpdate[] {
    return [...this.jobs.values()].map((r) => r.update).sort((a, b) => b.createdAt - a.createdAt);
  }

  private pump(): void {
    const limit = Math.max(1, getSettings().maxConcurrentJobs);
    while (this.running < limit) {
      const next = [...this.jobs.values()]
        .filter((r) => r.update.status === 'queued')
        .sort((a, b) => a.update.createdAt - b.update.createdAt)[0];
      if (!next) return;
      this.running++;
      void this.run(next).finally(() => { this.running--; this.pump(); });
    }
  }

  private async run(r: Rec): Promise<void> {
    this.patch(r, { status: 'running', progress: 0 }, true);
    try {
      const res = await runJobNow(r.update.request, {
        id: r.update.id,
        signal: r.controller.signal,
        settings: getSettings(),
        caps: getCapabilities(),
        onProgress: (p, detail) => this.patch(r, { progress: p, detail: detail ?? r.update.detail }, false)
      });
      this.finish(r, { status: 'done', progress: 1, outputs: res.outputs, note: res.notes.join(' · ') || undefined });
    } catch (e) {
      if (e instanceof CanceledError || r.controller.signal.aborted) {
        this.finish(r, { status: 'canceled' });
      } else {
        const m = toUserMessage(e);
        log.error('Job failed:', r.update.label, e);
        this.finish(r, { status: 'error', error: m.message, errorDetails: m.details });
      }
    }
  }

  private patch(r: Rec, p: Partial<JobUpdate>, force: boolean): void {
    r.update = { ...r.update, ...p };
    const now = Date.now();
    if (force || now - r.lastEmit > 100) { r.lastEmit = now; this.emit(r.update); }
  }

  private finish(r: Rec, p: Partial<JobUpdate>): void {
    this.patch(r, { ...p, finishedAt: Date.now() }, true);
    this.onFinished(r.update);
  }

  private trim(): void {
    const finished = this.list().filter((u) => u.status !== 'queued' && u.status !== 'running');
    for (const u of finished.slice(50)) this.jobs.delete(u.id);
  }
}

let instance: JobQueue | null = null;
export function initQueue(emit: (u: JobUpdate) => void, onFinished: (u: JobUpdate) => void): JobQueue {
  instance = new JobQueue(emit, onFinished);
  return instance;
}
export function getQueue(): JobQueue {
  if (!instance) throw new Error('Queue not initialised');
  return instance;
}
```

---

## Task 3.6 — Engine window (hidden pdf.js host) + bridge
**Files:** `src/main/windows/engineWindow.ts`, `src/preload/engine.ts` (replace), `src/renderer/src/engine/main.ts` (replace)

**Code: `src/main/windows/engineWindow.ts`**
```ts
import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { IPC, type EngineCall, type EngineMethod, type EngineResult } from '@shared/ipc';
import { log } from '../log';
import { preloadPath, rendererUrl } from '../paths';

let win: BrowserWindow | null = null;
let ready: Promise<void> | null = null;
let listening = false;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

function listen(): void {
  if (listening) return;
  listening = true;
  ipcMain.on(IPC.engineResult, (_e, r: EngineResult) => {
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    clearTimeout(p.timer);
    if (r.ok) p.resolve(r.result);
    else p.reject(new Error(r.error ?? 'Engine error'));
  });
}

export function startEngine(): Promise<void> {
  if (ready) return ready;
  listen();
  ready = new Promise<void>((resolve) => {
    ipcMain.once(IPC.engineReady, () => resolve());
    win = new BrowserWindow({
      show: false, width: 900, height: 700,
      webPreferences: { preload: preloadPath('engine'), sandbox: true, contextIsolation: true, backgroundThrottling: false }
    });
    void win.loadURL(rendererUrl('engine'));
    win.webContents.on('render-process-gone', (_e, d) => { log.error('Engine crashed', d.reason); resetEngine(); });
    win.on('closed', () => resetEngine());
  });
  return ready;
}

function resetEngine(): void {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Engine stopped')); }
  pending.clear();
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
  ready = null;
}

export function isEngineWindow(w: BrowserWindow): boolean {
  return w === win;
}

export async function callEngine<T>(method: EngineMethod, params: unknown, timeoutMs = 180_000): Promise<T> {
  await startEngine();
  return new Promise<T>((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Engine call ${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    const call: EngineCall = { id, method, params };
    win?.webContents.send(IPC.engineCall, call);
  });
}
```

**Code: `src/preload/engine.ts`**
```ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type EngineApi, type EngineCall, type EngineResult } from '@shared/ipc';

const api: EngineApi = {
  onCall: (cb) => { ipcRenderer.on(IPC.engineCall, (_e, call: EngineCall) => cb(call)); },
  sendResult: (r: EngineResult) => ipcRenderer.send(IPC.engineResult, r),
  ready: () => ipcRenderer.send(IPC.engineReady)
};

contextBridge.exposeInMainWorld('kabooksEngine', api);
```

**Code: `src/renderer/src/engine/main.ts`**
```ts
import type { EngineApi, EngineMethod } from '@shared/ipc';

declare global { interface Window { kabooksEngine: EngineApi } }

type Handler = (params: never) => Promise<unknown>;
const handlers: Partial<Record<EngineMethod, Handler>> = {
  ping: async () => 'pong'
};

/** Phase 6 registers pdf.* handlers through this function. */
export function registerHandlers(extra: Partial<Record<EngineMethod, Handler>>): void {
  Object.assign(handlers, extra);
}

window.kabooksEngine.onCall(async (call) => {
  try {
    const fn = handlers[call.method];
    if (!fn) throw new Error(`Unknown engine method ${call.method}`);
    const result = await fn(call.params as never);
    window.kabooksEngine.sendResult({ id: call.id, ok: true, result });
  } catch (e) {
    const err = e as Error;
    window.kabooksEngine.sendResult({ id: call.id, ok: false, error: `${err.name ?? 'Error'}: ${err.message ?? String(e)}` });
  }
});

window.kabooksEngine.ready();
```

---

## Task 3.7 — Main window and overlay window
**Files:** `src/main/windows/mainWindow.ts`, `src/main/windows/overlayWindow.ts`

**Code: `src/main/windows/mainWindow.ts`**
```ts
import { app, BrowserWindow, nativeTheme, type BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { isQuitting, isTrayActive } from '../appState';
import { isMac, isWin, preloadPath, rendererUrl, resourcesRoot } from '../paths';
import { getSettings } from '../settings';

let win: BrowserWindow | null = null;

function overlayColors(): { color: string; symbolColor: string } {
  return nativeTheme.shouldUseDarkColors ? { color: '#161617', symbolColor: '#EDEDED' } : { color: '#F3F3F2', symbolColor: '#1F1F1F' };
}

/** Native window chrome per OS (see OUTLINE §9.5). */
function chromeOptions(): BrowserWindowConstructorOptions {
  if (isMac) return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } };      // traffic lights inside our 44 px header
  if (isWin) return { titleBarStyle: 'hidden', titleBarOverlay: { ...overlayColors(), height: 44 } };  // native caption buttons
  return { icon: path.join(resourcesRoot(), 'tray.png') };                                           // Linux: native frame
}

export function createMainWindow(showNow = true): BrowserWindow {
  win = new BrowserWindow({
    width: 1000, height: 720, minWidth: 760, minHeight: 560, show: false, title: 'Kabooks',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161617' : '#F3F3F2',
    ...chromeOptions(),
    webPreferences: { preload: preloadPath('index'), sandbox: true, contextIsolation: true }
  });
  if (showNow) win.once('ready-to-show', () => win?.show());
  void win.loadURL(rendererUrl('index', '?view=main'));
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools();
    });
  }
  win.on('close', (e) => {
    if (isQuitting()) return;
    // macOS convention: closing the window never quits (⌘Q / menu / menu-bar icon does).
    if (isMac || (getSettings().closeToTray && isTrayActive())) { e.preventDefault(); win?.hide(); }
    else app.quit();
  });
  win.on('closed', () => { win = null; });
  nativeTheme.on('updated', () => { if (win && isWin) win.setTitleBarOverlay({ ...overlayColors(), height: 44 }); });
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return win;
}

export function showMainWindow(): void {
  if (!win) createMainWindow();
  win?.show();
  win?.focus();
}
```

**Code: `src/main/windows/overlayWindow.ts`**
```ts
import { app, BrowserWindow, screen } from 'electron';
import { IPC } from '@shared/ipc';
import { WHEEL_STAGE, type OverlaySize } from '@shared/overlay';
import type { OverlayInit, Point, WheelMode } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { inspectFiles } from '../inspect';
import { preloadPath, rendererUrl } from '../paths';

let win: BrowserWindow | null = null;
let loaded: Promise<void> | null = null;
let anchor: Point = { x: 0, y: 0 };

export function createOverlayWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: WHEEL_STAGE.width, height: WHEEL_STAGE.height, show: false, frame: false, transparent: true,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000', title: 'Kabooks',
    webPreferences: { preload: preloadPath('index'), sandbox: true, contextIsolation: true, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  if (process.platform === 'darwin') {
    // Show over full-screen apps and on every Space, without turning the app into a background-only process.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
  loaded = win.loadURL(rendererUrl('index', '?view=overlay'));
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.openDevTools({ mode: 'detach' });
    });
  }
  win.on('closed', () => { win = null; loaded = null; });
  return win;
}

/** Position the window so that the wheel centre (or the window centre) sits at `anchor`, clamped to the screen. */
function place(size: OverlaySize): void {
  if (!win) return;
  const wa = screen.getDisplayNearestPoint(anchor).workArea;
  const width = Math.min(size.width, wa.width);
  const height = Math.min(size.height, wa.height);
  let x = size.anchor === 'wheel' ? anchor.x - WHEEL_STAGE.anchorX : anchor.x - Math.round(width / 2);
  let y = size.anchor === 'wheel' ? anchor.y - WHEEL_STAGE.anchorY : anchor.y - Math.round(height / 2);
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - width));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - height));
  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

export async function openOverlay(paths: string[], mode: WheelMode, source: OverlayInit['source'], at?: Point): Promise<void> {
  if (!win) createOverlayWindow();
  await loaded;
  const basic = await inspectFiles(paths, false);
  if (basic.length === 0 || !win) return;
  anchor = at ?? screen.getCursorScreenPoint();
  place({ width: WHEEL_STAGE.width, height: WHEEL_STAGE.height, anchor: 'wheel' });
  const init: OverlayInit = { files: basic, mode, caps: getCapabilities(), source };
  win.webContents.send(IPC.evOverlayInit, init);
  win.show();
  win.focus();
  const deep = await inspectFiles(basic.map((f) => f.path), true);
  win?.webContents.send(IPC.evOverlayFiles, deep);
}

export function resizeOverlay(size: OverlaySize): void { place(size); }
export function hideOverlay(): void { win?.hide(); }
export function isOverlayVisible(): boolean { return !!win && win.isVisible(); }
export function getOverlayWindow(): BrowserWindow | null { return win; }
export function setOverlayAnchor(p: Point): void { anchor = p; }
```

---

## Task 3.8 — IPC (main), preload API, renderer `api`
**Files:** `src/main/ipc.ts`, `src/preload/index.ts` (replace), `src/preload/index.d.ts`, `src/renderer/src/lib/api.ts`

**Code: `src/main/ipc.ts`**
```ts
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import { IPC } from '@shared/ipc';
import type { OverlaySize } from '@shared/overlay';
import type { JobRequest, Settings, WheelMode } from '@shared/types';
import { getCapabilities } from './capabilities';
import { inspectFiles } from './inspect';
import { getQueue } from './jobs/queue';
import { getSettings, updateSettings } from './settings';
import { isEngineWindow } from './windows/engineWindow';
import { hideOverlay, openOverlay, resizeOverlay } from './windows/overlayWindow';

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`Invalid ${what}`);
  return v;
}
function existingPath(v: unknown): string {
  if (typeof v !== 'string' || !fs.existsSync(v)) throw new Error('Path does not exist');
  return v;
}
function validateRequest(req: unknown): JobRequest {
  const r = req as JobRequest;
  if (!r || (r.kind !== 'convert' && r.kind !== 'tool')) throw new Error('Invalid job request');
  strings(r.inputs, 'inputs');
  return r;
}

export function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !isEngineWindow(w)) w.webContents.send(channel, payload);
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.getCapabilities, () => getCapabilities());
  ipcMain.handle(IPC.getSettings, () => getSettings());
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => updateSettings(patch));
  ipcMain.handle(IPC.pickFiles, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const r = parent ? await dialog.showOpenDialog(parent, { properties: ['openFile', 'multiSelections'] }) : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle(IPC.pickFolder, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle(IPC.inspectFiles, (_e, paths: unknown, deep: unknown) => inspectFiles(strings(paths, 'paths'), deep === true));
  ipcMain.handle(IPC.startJob, (_e, req: unknown) => getQueue().enqueue(validateRequest(req)));
  ipcMain.handle(IPC.cancelJob, (_e, id: unknown) => getQueue().cancel(String(id)));
  ipcMain.handle(IPC.listJobs, () => getQueue().list());
  ipcMain.handle(IPC.reveal, (_e, p: unknown) => shell.showItemInFolder(existingPath(p)));
  ipcMain.handle(IPC.openPath, async (_e, p: unknown) => {
    const err = await shell.openPath(existingPath(p));
    if (err) throw new Error(err);
  });
  ipcMain.handle(IPC.openOverlay, (_e, paths: unknown, mode: WheelMode) => openOverlay(strings(paths, 'paths'), mode === 'tools' ? 'tools' : 'convert', 'window'));
  ipcMain.handle(IPC.closeOverlay, () => hideOverlay());
  ipcMain.handle(IPC.resizeOverlay, (_e, size: OverlaySize) => resizeOverlay(size));
  // preview:* , meta:read and overlay:dropped are registered by later tasks (7.1, 7.10, 8.1, 9.1, 11.6).
}
```

**Code: `src/preload/index.ts`**
```ts
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type KabooksApi } from '@shared/ipc';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

const api: KabooksApi = {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getCapabilities: () => ipcRenderer.invoke(IPC.getCapabilities),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  inspectFiles: (paths, deep) => ipcRenderer.invoke(IPC.inspectFiles, paths, deep),
  startJob: (req) => ipcRenderer.invoke(IPC.startJob, req),
  cancelJob: (id) => ipcRenderer.invoke(IPC.cancelJob, id),
  listJobs: () => ipcRenderer.invoke(IPC.listJobs),
  reveal: (p) => ipcRenderer.invoke(IPC.reveal, p),
  openPath: (p) => ipcRenderer.invoke(IPC.openPath, p),
  openOverlay: (paths, mode) => ipcRenderer.invoke(IPC.openOverlay, paths, mode),
  closeOverlay: () => ipcRenderer.invoke(IPC.closeOverlay),
  resizeOverlay: (size) => ipcRenderer.invoke(IPC.resizeOverlay, size),
  overlayDropped: (paths) => ipcRenderer.invoke(IPC.overlayDropped, paths),
  previewMedia: (p) => ipcRenderer.invoke(IPC.previewMedia, p),
  previewFrame: (p, t, w) => ipcRenderer.invoke(IPC.previewFrame, p, t, w),
  previewWaveform: (p, w, h) => ipcRenderer.invoke(IPC.previewWaveform, p, w, h),
  previewImage: (req) => ipcRenderer.invoke(IPC.previewImage, req),
  pdfThumbnails: (p, w) => ipcRenderer.invoke(IPC.pdfThumbnails, p, w),
  readMetadata: (p) => ipcRenderer.invoke(IPC.readMetadata, p),
  onJobUpdate: (cb) => on(IPC.evJobUpdate, cb),
  onOverlayInit: (cb) => on(IPC.evOverlayInit, cb),
  onOverlayFiles: (cb) => on(IPC.evOverlayFiles, cb),
  onOverlayDrag: (cb) => on(IPC.evOverlayDrag, cb),
  onSettings: (cb) => on(IPC.evSettings, cb),
  onNavigate: (cb) => on(IPC.evNavigate, cb)
};

contextBridge.exposeInMainWorld('kabooks', api);
```

**Code: `src/preload/index.d.ts`**
```ts
import type { KabooksApi } from '../shared/ipc';

declare global {
  interface Window { kabooks: KabooksApi }
}
export {};
```

**Code: `src/renderer/src/lib/api.ts`**
```ts
import type { KabooksApi } from '@shared/ipc';

export const api: KabooksApi = window.kabooks;
```

---

## Task 3.9 — Final `src/main/index.ts` and `notify.ts`
**Files:** `src/main/index.ts` (replace), `src/main/notify.ts`, `src/main/integrations/appMenu.ts`, `src/renderer/src/main.tsx` (temporary view switch)

**Code: `src/main/notify.ts`**
```ts
import { Notification, shell } from 'electron';
import type { JobUpdate } from '@shared/types';
import { getSettings } from './settings';
import { getMainWindow } from './windows/mainWindow';
import { isOverlayVisible } from './windows/overlayWindow';

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

export function notifyJobFinished(u: JobUpdate): void {
  const s = getSettings();
  if (u.status === 'done' && s.revealWhenDone && u.outputs[0]) shell.showItemInFolder(u.outputs[0]);
  if (!s.notifyWhenDone || !Notification.isSupported()) return;
  if (u.status !== 'done' && u.status !== 'error') return;
  if (isOverlayVisible() || getMainWindow()?.isFocused()) return;   // user is already looking
  const body = u.status === 'done'
    ? `${u.outputs.length === 1 ? baseName(u.outputs[0]) : `${u.outputs.length} files saved`}${u.note ? ` · ${u.note}` : ''}`
    : u.error ?? 'Something went wrong';
  const n = new Notification({ title: u.status === 'done' ? `${u.label} — done` : `${u.label} failed`, body, silent: true });
  n.on('click', () => { if (u.outputs[0]) shell.showItemInFolder(u.outputs[0]); });
  n.show();
}
```

**Code: `src/main/index.ts`**
```ts
import { app, nativeTheme } from 'electron';
import sharp from 'sharp';
import { IPC } from '@shared/ipc';
import { setQuitting } from './appState';
import { detectCapabilities } from './capabilities';
import { broadcast, registerIpc } from './ipc';
import { initQueue } from './jobs/queue';
import { log } from './log';
import { notifyJobFinished } from './notify';
import { registerProtocolHandlers, registerSchemes } from './protocol';
import { blockNetwork, hardenWebContents } from './security';
import { loadSettings, onSettingsChanged } from './settings';
import { installAppMenu } from './integrations/appMenu';
import { startEngine } from './windows/engineWindow';
import { createMainWindow, showMainWindow } from './windows/mainWindow';
import { createOverlayWindow } from './windows/overlayWindow';

sharp.cache(false);                         // avoid file locks (Windows) and stale reads
if (process.platform === 'win32') app.setAppUserModelId('com.kabooks.app');           // Windows notifications
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');  // transparent overlay
registerSchemes();                          // must run before 'ready'

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('before-quit', () => setQuitting());
  app.on('window-all-closed', () => { /* keep running; quitting is explicit */ });
  app.on('activate', () => showMainWindow());   // macOS: clicking the Dock icon re-opens the window

  void app.whenReady().then(async () => {
    installAppMenu();                           // macOS: App/Edit/Window menus (⌘C/⌘V, ⌘,); others: no menu bar
    registerProtocolHandlers();
    blockNetwork();
    hardenWebContents();
    const settings = loadSettings();
    nativeTheme.themeSource = settings.theme;
    await detectCapabilities();
    initQueue((u) => broadcast(IPC.evJobUpdate, u), notifyJobFinished);
    registerIpc();
    await startEngine();
    // Task 4.3 inserts the --selftest branch HERE.
    createMainWindow();
    createOverlayWindow();
    onSettingsChanged((s) => { nativeTheme.themeSource = s.theme; broadcast(IPC.evSettings, s); });
    log.info('Kabooks ready');
  });
}
```

**Code: `src/main/integrations/appMenu.ts`**
```ts
import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '@shared/ipc';
import { getMainWindow, showMainWindow } from '../windows/mainWindow';

/** macOS needs a real application menu (otherwise ⌘C/⌘V/⌘Q don't work). Windows/Linux: no menu bar. */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  const openSettings = (): void => { showMainWindow(); getMainWindow()?.webContents.send(IPC.evNavigate, 'settings'); };
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { label: 'Settings…', accelerator: 'Command+,', click: openSettings },
        { type: 'separator' }, { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

**Code: `src/renderer/src/main.tsx`** (temporary until Phase 5)
```tsx
import { createRoot } from 'react-dom/client';

const view = new URLSearchParams(window.location.search).get('view') ?? 'main';
document.documentElement.dataset.view = view;
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
createRoot(document.getElementById('root') as HTMLElement).render(
  view === 'overlay' ? <h1 style={{ background: 'white' }}>Overlay</h1> : <h1>Kabooks main</h1>
);
```

---

## Task 3.10 — Foundation check (manual)
**Steps**
1. Create a test tone with the bundled FFmpeg. Replace `<platform>-<arch>` with your value from Task 0.1.
   - **PowerShell (Windows):**
     ```
     New-Item -ItemType Directory -Force ".cache\manual" | Out-Null
     & ".\resources\bin\win32-x64\ffmpeg.exe" -y -f lavfi -i "sine=frequency=440:duration=3" ".cache\manual\tone.wav"
     ```
   - **bash/zsh (macOS/Linux):**
     ```
     mkdir -p .cache/manual
     ./resources/bin/<platform>-<arch>/ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" .cache/manual/tone.wav
     ```
2. Run `npm run dev`. Press **F12** in the main window to open DevTools.
3. In the DevTools console run each line and check the result. `<ROOT>` is the absolute project path; use `\` on Windows and `/` elsewhere.
   - `await window.kabooks.getCapabilities()` → `ffmpeg: true`, `encoders` includes `libx264`, and `platform`/`arch` match your machine. On macOS, `heicTool: 'sips'`.
   - `await window.kabooks.inspectFiles([String.raw\`<ROOT>/.cache/manual/tone.wav\`], true)` → `category: 'audio'`, `durationSec ≈ 3`.
   - `await window.kabooks.startJob({kind:'convert', inputs:[<same path>], target:'mp3'})` → returns an id. Then `await window.kabooks.listJobs()` shows that job with `status: 'error'` and the message "Converting WAV files is not available yet." This proves the queue works.
   - `await window.kabooks.openOverlay([<same path>], 'convert')` → a small window saying "Overlay" appears near the cursor. Close it with `await window.kabooks.closeOverlay()`.
4. Run `npm run build`, then `npx electron .`. The main window must load from `app://kabooks/index.html`; check that it is not blank. DevTools is not needed.
5. **Window chrome check:**
   - **Windows:** the minimize/maximize/close buttons sit at the top-right over the header.
   - **macOS:** the traffic lights sit at the top-left, ⌘Q quits, and clicking the Dock icon after closing the window re-opens it.
   - **Linux:** a normal window frame.

**Done when:** all of the above works. Commit "Task 3.10: foundation verified".

# Phase 4 — Audio/video conversion + self-test harness

## Task 4.1 — `engines/ffmpegArgs.ts` (pure argument builders)
**Files:** `src/main/engines/ffmpegArgs.ts`, `src/main/engines/ffmpegArgs.test.ts`
```ts
import type { Fmt } from '@shared/types';
import type { ProbeResult } from './ffmpegParse';

export interface MediaFacts {
  durationSec: number;
  container: string;
  hasVideo: boolean;
  hasAudio: boolean;
  hasCover: boolean;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;       // display size (after rotation)
  height?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
}

export interface Quality { crf: number; audioKbps: number }

export function toFacts(p: ProbeResult): MediaFacts {
  return {
    durationSec: p.durationSec, container: p.formatName, hasVideo: !!p.video, hasAudio: !!p.audio, hasCover: p.hasCover,
    videoCodec: p.video?.codec, audioCodec: p.audio?.codec, width: p.video?.displayWidth, height: p.video?.displayHeight,
    fps: p.video?.fps, sampleRate: p.audio?.sampleRate, channels: p.audio?.channels
  };
}

/** Codecs each container can hold as-is (names as ffprobe reports them). */
const COPY_OK: Partial<Record<Fmt, { video: string[]; audio: string[] }>> = {
  mp4: { video: ['h264', 'hevc', 'av1', 'mpeg4'], audio: ['aac', 'mp3', 'alac', 'opus', 'ac3'] },
  mov: { video: ['h264', 'hevc', 'mpeg4', 'prores', 'mjpeg'], audio: ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le'] },
  mkv: { video: ['h264', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg4', 'mpeg2video', 'theora'], audio: ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3', 'eac3', 'dts', 'alac', 'pcm_s16le'] },
  webm: { video: ['vp8', 'vp9', 'av1'], audio: ['opus', 'vorbis'] },
  avi: { video: ['mpeg4', 'mjpeg', 'msmpeg4v3'], audio: ['mp3', 'ac3', 'pcm_s16le'] },
  wmv: { video: ['wmv1', 'wmv2', 'wmv3', 'vc1'], audio: ['wmav1', 'wmav2', 'wmapro'] }
};

/** True when streams can be copied into `target` without re-encoding (instant & lossless). */
export function canRemux(f: MediaFacts, target: Fmt): boolean {
  const rule = COPY_OK[target];
  if (!rule || !f.hasVideo) return false;
  if (!f.videoCodec || !rule.video.includes(f.videoCodec)) return false;
  if (f.hasAudio && (!f.audioCodec || !rule.audio.includes(f.audioCodec))) return false;
  return true;
}

export const EVEN_SCALE = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

export interface GifOptions { width: number; fps: number }

/** The -vf value: extra filters + even-size guard, or the GIF palette chain. */
export function videoFilter(target: Fmt, filters: string[], gif: GifOptions = { width: 480, fps: 12 }): string {
  if (target === 'gif') {
    const scale = gif.width > 0 ? `scale='min(${gif.width},iw)':-1:flags=lanczos` : 'scale=iw:ih';
    return [...filters, `fps=${gif.fps}`, scale,
      'split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'].join(',');
  }
  return [...filters, EVEN_SCALE].join(',');
}

export function wmvBitrate(f: MediaFacts): string {
  const px = (f.width ?? 1280) * (f.height ?? 720);
  if (px <= 640 * 480) return '1500k';
  if (px <= 1280 * 720) return '3000k';
  if (px <= 1920 * 1080) return '6000k';
  return '12000k';
}

function videoAudioCodec(target: Fmt, q: Quality): string[] {
  if (target === 'webm') return ['-c:a', 'libopus', '-b:a', `${Math.min(q.audioKbps, 160)}k`];
  if (target === 'avi') return ['-c:a', 'libmp3lame', '-q:a', '3'];
  if (target === 'wmv') return ['-c:a', 'wmav2', '-b:a', '192k'];
  return ['-c:a', 'aac', '-b:a', `${q.audioKbps}k`];
}

/** Codec flags to encode INTO `target`. No -i, -vf, -map or output path. */
export function videoEncodeArgs(target: Fmt, q: Quality, f: MediaFacts, audio: 'encode' | 'copy' | 'none' = 'encode'): string[] {
  const a: string[] = [];
  switch (target) {
    case 'mp4': case 'mov': case 'mkv':
      a.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(q.crf), '-pix_fmt', 'yuv420p');
      break;
    case 'webm':
      a.push('-c:v', 'libvpx-vp9', '-crf', String(Math.min(63, q.crf + 9)), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p');
      break;
    case 'avi':
      a.push('-c:v', 'mpeg4', '-q:v', '4', '-vtag', 'xvid');
      break;
    case 'wmv':
      a.push('-c:v', 'wmv2', '-b:v', wmvBitrate(f));
      break;
    case 'gif':
      break;
    default:
      throw new Error(`No video encoder for ${target}`);
  }
  if (target === 'gif' || audio === 'none' || !f.hasAudio) a.push('-an');
  else if (audio === 'copy') a.push('-c:a', 'copy');
  else a.push(...videoAudioCodec(target, q));
  if (target === 'mp4' || target === 'mov') a.push('-movflags', '+faststart');
  return a;
}

/** Codec flags for an audio-only output. */
export function audioCodecArgs(target: Fmt, q: Quality, f: MediaFacts): string[] {
  const a: string[] = [];
  switch (target) {
    case 'mp3': a.push('-c:a', 'libmp3lame', '-q:a', '2'); break;
    case 'm4a': a.push('-c:a', 'aac', '-b:a', `${q.audioKbps}k`); break;
    case 'wav': a.push('-c:a', 'pcm_s16le'); break;
    case 'flac': a.push('-c:a', 'flac', '-compression_level', '5'); break;
    case 'ogg': a.push('-c:a', 'libvorbis', '-q:a', '5'); break;
    case 'opus': a.push('-c:a', 'libopus', '-b:a', `${Math.min(q.audioKbps, 160)}k`, '-ar', '48000'); break;
    case 'aiff': a.push('-c:a', 'pcm_s16be'); break;
    case 'wma': a.push('-c:a', 'wmav2', '-b:a', `${Math.min(q.audioKbps, 192)}k`); break;
    default: throw new Error(`No audio encoder for ${target}`);
  }
  const sr = f.sampleRate ?? 0;
  if ((target === 'mp3' || target === 'wma' || target === 'm4a') && sr > 48000) a.push('-ar', '48000');
  if ((target === 'mp3' || target === 'wma') && (f.channels ?? 2) > 2) a.push('-ac', '2');
  if (target === 'mp3') a.push('-id3v2_version', '3');
  if (target === 'm4a') a.push('-movflags', '+faststart');
  return a;
}

export function audioConvertArgs(input: string, output: string, f: MediaFacts, target: Fmt, q: Quality, keepCover: boolean): string[] {
  const cover = keepCover && f.hasCover && (target === 'mp3' || target === 'm4a' || target === 'flac');
  return [
    '-i', input, '-map', '0:a:0',
    ...(cover ? ['-map', '0:v:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic'] : ['-vn']),
    '-map_metadata', '0',
    ...audioCodecArgs(target, q, f),
    output
  ];
}

export function videoConvertArgs(input: string, output: string, f: MediaFacts, target: Fmt, q: Quality, gif?: GifOptions): string[] {
  if (target === 'mp3') return audioConvertArgs(input, output, f, 'mp3', q, false);
  if (canRemux(f, target)) {
    const a = ['-i', input, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy'];
    if (target === 'mp4' || target === 'mov') {
      a.push('-movflags', '+faststart');
      if (f.videoCodec === 'hevc') a.push('-tag:v', 'hvc1');
    }
    return [...a, output];
  }
  const maps = target === 'gif' ? ['-map', '0:v:0'] : ['-map', '0:v:0', '-map', '0:a:0?'];
  return ['-i', input, ...maps, '-vf', videoFilter(target, [], gif), ...videoEncodeArgs(target, q, f), output];
}
```

**Tests: `ffmpegArgs.test.ts`.** Build facts with a helper, then check:
- MKV with h264/aac → `videoConvertArgs(..., 'mp4', ...)` contains `'-c','copy'` and `'+faststart'`.
- vp9/opus → target mp4 → contains `'libx264'` and the `-vf` value ends with `EVEN_SCALE`.
- h264/aac → target webm → contains `'libvpx-vp9'` and `'libopus'`.
- Target gif → the `-vf` value contains `palettegen`, the args contain `'-an'`, and they do not contain `'0:a:0?'`.
- `audioConvertArgs` for a WAV at 96000 Hz → mp3 contains `'-ar','48000'`; target opus contains `'-ar','48000'`.
- `canRemux({hasVideo:false,...}, 'mp4')` → false.

---

## Task 4.2 — `converters/av.ts` (audio & video conversions)
**Files:** `src/main/converters/av.ts`, update `src/main/converters/index.ts`
```ts
import { FORMATS, outputExt } from '@shared/formats';
import { DEFAULT_CONVERT_OPTIONS, type ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import { probe, runFfmpeg } from '../engines/ffmpeg';
import { audioConvertArgs, canRemux, toFacts, videoConvertArgs } from '../engines/ffmpegArgs';
import type { JobContext } from '../jobs/context';

export async function convertAv(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const facts = toFacts(await probe(file.path));
  const targetCat = FORMATS[target].category;
  if (targetCat === 'audio' && !facts.hasAudio) throw new UserError(`${file.name} has no audio track.`);
  if (targetCat === 'video' && !facts.hasVideo) throw new UserError(`${file.name} has no video track.`);
  const out = ctx.newOutput({ source: file.path, ext: outputExt(target) });
  const q = { crf: ctx.settings.videoCrf, audioKbps: ctx.settings.audioBitrateKbps };
  const gif = { width: opts.gifWidth ?? DEFAULT_CONVERT_OPTIONS.gifWidth, fps: opts.gifFps ?? DEFAULT_CONVERT_OPTIONS.gifFps };
  const args = file.category === 'audio'
    ? audioConvertArgs(file.path, out, facts, target, q, true)
    : videoConvertArgs(file.path, out, facts, target, q, gif);
  await runFfmpeg(args, { durationSec: facts.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  if (file.category === 'video' && canRemux(facts, target)) ctx.note('Copied streams without re-encoding');
}
```
In `converters/index.ts`, set `CONVERTERS = { audio: convertAv, video: convertAv }` (import `convertAv`).

**Verify (manual):** run `npm run dev`. In the DevTools console, start a job converting `.cache/manual/tone.wav` (from Task 3.10) to `mp3`. `listJobs()` shows `done`, and `tone.mp3` appears in `.cache/manual/`.

---

## Task 4.3 — Self-test harness (`npm run selftest`)
**Goal:** an end-to-end test that generates fixtures, runs real jobs through `runJobNow`, and checks the outputs. Every later phase adds cases here.
**Files:**
- `src/main/selftest/index.ts`, `src/main/selftest/types.ts`, `src/main/selftest/assert.ts`, `src/main/selftest/fixtures.ts`
- `src/main/selftest/cases/index.ts`, `src/main/selftest/cases/av.ts`
- `package.json` script: `"selftest": "npm run build && electron . --selftest"`
- `src/main/index.ts` (insert the branch)

**Code: `selftest/types.ts`**
```ts
import type { Capabilities, JobRequest } from '@shared/types';

export interface SelfTestCase {
  name: string;                                   // unique, e.g. "convert.audio.wav-mp3"
  group: string;                                  // "av", "image", "pdf", "text", "tools.video", ...
  fixtures: string[];                             // fixture names used as inputs, in order
  request: (inputs: string[]) => JobRequest;
  check?: (outputs: string[]) => Promise<void>;   // required unless expectError is set
  expectError?: RegExp;                           // the job must FAIL with a message matching this
  skip?: (caps: Capabilities) => string | false;  // return a reason to skip
}
```

**Code: `selftest/assert.ts`** (later tasks add more helpers here)
```ts
import fs from 'node:fs';
import { probe } from '../engines/ffmpeg';

export function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function expectCount(outputs: string[], n: number): void {
  check(outputs.length === n, `expected ${n} output(s), got ${outputs.length}`);
}

export function expectNonEmpty(file: string): void {
  check(fs.existsSync(file) && fs.statSync(file).size > 0, `${file} is missing or empty`);
}

export async function expectStreams(file: string, e: { video?: string | null; audio?: string | null; durationSec?: number; tolerance?: number }): Promise<void> {
  expectNonEmpty(file);
  const p = await probe(file);
  if (e.video !== undefined) check(e.video === null ? !p.video : p.video?.codec === e.video, `video codec: expected ${e.video}, got ${p.video?.codec ?? 'none'}`);
  if (e.audio !== undefined) check(e.audio === null ? !p.audio : p.audio?.codec === e.audio, `audio codec: expected ${e.audio}, got ${p.audio?.codec ?? 'none'}`);
  if (e.durationSec !== undefined) {
    check(Math.abs(p.durationSec - e.durationSec) <= (e.tolerance ?? 0.5), `duration: expected ~${e.durationSec}s, got ${p.durationSec}s`);
  }
}

export function expectMagic(file: string, offset: number, ascii: string): void {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(ascii.length);
  fs.readSync(fd, buf, 0, ascii.length, offset);
  fs.closeSync(fd);
  check(buf.toString('latin1') === ascii, `${file}: expected "${ascii}" at byte ${offset}, got "${buf.toString('latin1')}"`);
}

export function expectTextIncludes(file: string, text: string): void {
  check(fs.readFileSync(file, 'utf8').includes(text), `${file} does not contain "${text}"`);
}
```

**Code: `selftest/fixtures.ts`** (later tasks add makers)
```ts
import fs from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from '../engines/ffmpeg';

type Maker = (out: string, dir: string) => Promise<void>;

export const FIXTURES: Record<string, Maker> = {
  'video.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out]),
  'video-noaudio.mp4': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]),
  'video.mkv': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-c', 'copy', out]); },
  'anim.gif': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'video.mp4'), '-t', '2', '-vf', 'fps=10,scale=160:-1', out]); },
  'audio.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=4', '-ac', '2', '-c:a', 'pcm_s16le', out]),
  'audio.mp3': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'audio.wav'), '-c:a', 'libmp3lame', '-q:a', '4', out]); },
  'stereo-lr.wav': (out) => runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=4',
    '-filter_complex', '[0:a][1:a]join=inputs=2:channel_layout=stereo[a]', '-map', '[a]', '-c:a', 'pcm_s16le', out])
};

/** Create the fixture once (cached in the fixtures dir) and return its path. */
export async function ensureFixture(dir: string, name: string): Promise<string> {
  const out = path.join(dir, name);
  if (fs.existsSync(out)) return out;
  const make = FIXTURES[name];
  if (!make) throw new Error(`No fixture maker for ${name}`);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `tmp-${name}`);        // keeps the extension for FFmpeg
  await make(tmp, dir);
  await fs.promises.rename(tmp, out);
  return out;
}
```

**Code: `selftest/cases/av.ts`**
```ts
import { CONVERT_TARGETS } from '@shared/formats';
import type { Fmt } from '@shared/types';
import { expectCount, expectStreams } from '../assert';
import type { SelfTestCase } from '../types';

const AUDIO_CODEC: Partial<Record<Fmt, string>> = { mp3: 'mp3', m4a: 'aac', wav: 'pcm_s16le', flac: 'flac', ogg: 'vorbis', opus: 'opus', aiff: 'pcm_s16be', wma: 'wmav2' };
const VIDEO_CODEC: Partial<Record<Fmt, string>> = { mp4: 'h264', mov: 'h264', mkv: 'h264', webm: 'vp9', avi: 'mpeg4', wmv: 'wmv2', gif: 'gif' };

export const AV_CASES: SelfTestCase[] = [
  ...CONVERT_TARGETS.audio.filter((t) => t !== 'wav').map((t): SelfTestCase => ({
    name: `convert.audio.wav-${t}`, group: 'av', fixtures: ['audio.wav'],
    request: (i) => ({ kind: 'convert', inputs: i, target: t }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { audio: AUDIO_CODEC[t], durationSec: 4 }); }
  })),
  {
    name: 'convert.audio.mp3-wav', group: 'av', fixtures: ['audio.mp3'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'wav' }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { audio: 'pcm_s16le', durationSec: 4 }); }
  },
  ...CONVERT_TARGETS.video.filter((t) => t !== 'mp4').map((t): SelfTestCase => ({
    name: `convert.video.mp4-${t}`, group: 'av', fixtures: ['video.mp4'],
    request: (i) => ({ kind: 'convert', inputs: i, target: t }),
    check: async (o) => {
      expectCount(o, 1);
      if (t === 'mp3') await expectStreams(o[0], { audio: 'mp3', video: null, durationSec: 4 });
      else await expectStreams(o[0], { video: VIDEO_CODEC[t], durationSec: 4, tolerance: 0.6 });
    }
  })),
  {
    name: 'convert.video.mkv-mp4-remux', group: 'av', fixtures: ['video.mkv'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mp4' }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { video: 'h264', audio: 'aac', durationSec: 4 }); }
  },
  {
    name: 'convert.video.gif-mp4', group: 'av', fixtures: ['anim.gif'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mp4' }),
    check: async (o) => { expectCount(o, 1); await expectStreams(o[0], { video: 'h264', audio: null }); }
  },
  {
    name: 'convert.video.noaudio-mp3-fails', group: 'av', fixtures: ['video-noaudio.mp4'],
    request: (i) => ({ kind: 'convert', inputs: i, target: 'mp3' }),
    expectError: /no audio/i
  }
];
```

**Code: `selftest/cases/index.ts`**
```ts
import type { SelfTestCase } from '../types';
import { AV_CASES } from './av';

/** Later tasks import and append their case lists here. */
export const CASES: SelfTestCase[] = [...AV_CASES];
```

**Code: `selftest/index.ts`**
```ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { ToolError, toUserMessage, UserError } from '../errors';
import { runJobNow } from '../jobs/execute';
import { CASES } from './cases';
import { ensureFixture } from './fixtures';

type Result = { name: string; status: 'PASS' | 'FAIL' | 'SKIP'; ms: number; info?: string };

function describeError(e: unknown): string {
  if (e instanceof UserError || e instanceof ToolError) {
    const tail = (e.details ?? '').split('\n').filter(Boolean).slice(-3).join(' / ');
    return tail ? `${e.message} | ${tail}` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export async function runSelfTest(argv: string[]): Promise<number> {
  const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const root = app.isPackaged ? path.join(app.getPath('temp'), 'kabooks-selftest') : path.join(app.getAppPath(), '.selftest');
  const fxDir = path.join(root, 'fixtures');
  const outRoot = path.join(root, 'out');
  await fs.promises.rm(outRoot, { recursive: true, force: true });
  const caps = getCapabilities();
  const cases = CASES.filter((c) => !only || c.group === only || c.group.startsWith(`${only}.`) || c.name.startsWith(only));
  const results: Result[] = [];

  for (const c of cases) {
    const t0 = Date.now();
    const skip = c.skip?.(caps);
    if (skip) { results.push({ name: c.name, status: 'SKIP', ms: 0, info: skip }); console.log(`SKIP  ${c.name}  (${skip})`); continue; }
    try {
      const inputs: string[] = [];
      for (const f of c.fixtures) inputs.push(await ensureFixture(fxDir, f));
      const outDir = path.join(outRoot, c.name.replace(/[^\w.-]+/g, '_'));
      await fs.promises.mkdir(outDir, { recursive: true });
      let outputs: string[] = [];
      let error: unknown = null;
      try {
        const settings = { ...DEFAULT_SETTINGS, outputMode: 'custom-folder' as const, customOutputDir: outDir };
        outputs = (await runJobNow(c.request(inputs), { settings, caps })).outputs;
      } catch (e) {
        error = e;
      }
      if (c.expectError) {
        const msg = error ? toUserMessage(error).message : '';
        if (!error || !c.expectError.test(msg)) throw new Error(`expected error ${c.expectError}, got ${error ? `"${msg}"` : 'success'}`);
      } else {
        if (error) throw error;
        if (!c.check) throw new Error('case has no check');
        await c.check(outputs);
      }
      const ms = Date.now() - t0;
      results.push({ name: c.name, status: 'PASS', ms });
      console.log(`PASS  ${c.name}  (${ms} ms)`);
    } catch (e) {
      const info = describeError(e);
      results.push({ name: c.name, status: 'FAIL', ms: Date.now() - t0, info });
      console.log(`FAIL  ${c.name}  — ${info}`);
    }
  }

  const count = (s: Result['status']): number => results.filter((r) => r.status === s).length;
  const summary = `${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`;
  await fs.promises.mkdir(root, { recursive: true });
  const reportPath = path.join(root, 'report.json');
  await fs.promises.writeFile(reportPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`\nSELFTEST: ${summary}\nReport: ${reportPath}`);
  return count('FAIL') > 0 || results.length === 0 ? 1 : 0;
}
```

**Edit `src/main/index.ts`:**
1. Add `import { runSelfTest } from './selftest';`.
2. Change the lock line to `if (!process.argv.includes('--selftest') && !app.requestSingleInstanceLock()) {`. This lets the self-test run while the dev app is open.
3. Insert where the comment says:
   ```ts
   if (process.argv.includes('--selftest')) {
     const code = await runSelfTest(process.argv);
     app.exit(code);
     return;
   }
   ```

**Verify:** `npm run selftest -- --only=av` prints `PASS` for every case and ends with `SELFTEST: 16 passed, 0 failed, 0 skipped`. The exact count may differ by ±1; what matters is **0 failed**. The first run is slower because it creates the fixtures.

**Done when:** all AV cases pass. Commit.

---

# Phase 5 — UI foundation & the wheel (Milestone M1)

## Task 5.1 — Design tokens, global CSS, fonts, theme, renderer entry
**Files:** `src/renderer/src/styles/tokens.css`, `src/renderer/src/styles/global.css`, `src/renderer/src/lib/theme.ts`, `src/renderer/src/lib/platform.ts`, `src/renderer/src/main.tsx` (replace)

**Code: `lib/platform.ts`** (labels and CSS only; never logic, see §1.9)
```ts
export type UiPlatform = 'win32' | 'darwin' | 'linux';

const ua = navigator.userAgent;
const platform: UiPlatform = ua.includes('Macintosh') ? 'darwin' : ua.includes('Windows') ? 'win32' : 'linux';

export const getPlatform = (): UiPlatform => platform;
export const isMacUi = (): boolean => platform === 'darwin';

/** Name of the Alt key as users know it. */
export const altKeyName = (): string => (isMacUi() ? 'Option' : 'Alt');
/** Keycap for the tools modifier: ⌥ option on Mac (like clean UI.png), ⎇ alt elsewhere. */
export const altKeycap = (): { glyph: string; label: string } => (isMacUi() ? { glyph: '⌥', label: 'option' } : { glyph: '⎇', label: 'alt' });
/** Button text for "reveal file". */
export const revealLabel = (): string => (platform === 'darwin' ? 'Show in Finder' : platform === 'win32' ? 'Show in Explorer' : 'Show in folder');
/** Multi-select modifier: ⌘ on Mac, Ctrl elsewhere. */
export const modClick = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => (isMacUi() ? e.metaKey : e.ctrlKey);
```

**Code: `tokens.css`**
```css
:root {
  --font-ui: 'Inter Variable', 'Segoe UI', system-ui, sans-serif;
  --bg: #F3F3F2;
  --surface: #FFFFFF;
  --surface-2: #F7F7F6;
  --border: #E6E6E4;
  --text: #1F1F1F;
  --text-2: #6B6B6B;
  --text-3: #9A9A9A;
  --accent: #FF5A1F;
  --accent-hover: #F04E12;
  --accent-press: #D9440C;
  --accent-contrast: #FFFFFF;
  --accent-soft: #FFE6DB;
  --track: #E4E4E2;
  --wheel-base: #ECECEB;
  --slice-top: #FBFBFA;
  --slice-bottom: #EFEFED;
  --slice-text: #1A1A1A;
  --hub: #FFFFFF;
  --success: #1F9D55;
  --danger: #D93025;
  --radius-s: 8px;
  --radius-m: 14px;
  --radius-l: 22px;
  --radius-xl: 28px;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, .06), 0 1px 1px rgba(0, 0, 0, .04);
  --shadow-2: 0 10px 30px rgba(0, 0, 0, .10), 0 2px 6px rgba(0, 0, 0, .06);
  --shadow-3: 0 24px 60px rgba(0, 0, 0, .18), 0 4px 12px rgba(0, 0, 0, .08);
  --inset-hub: inset 0 2px 6px rgba(0, 0, 0, .10), 0 1px 0 rgba(255, 255, 255, .8);
  --ease-out: cubic-bezier(.2, .8, .2, 1);
  --ease-spring: cubic-bezier(.2, .9, .3, 1.15);
  color-scheme: light;
}
:root[data-theme='dark'] {
  --bg: #161617;
  --surface: #1F1F21;
  --surface-2: #262628;
  --border: #313134;
  --text: #EDEDED;
  --text-2: #A3A3A3;
  --text-3: #6E6E6E;
  --accent-soft: #3A2318;
  --track: #3A3A3D;
  --wheel-base: #1C1C1E;
  --slice-top: #2E2E31;
  --slice-bottom: #262629;
  --slice-text: #EDEDED;
  --hub: #2A2A2D;
  --shadow-2: 0 10px 30px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .3);
  --shadow-3: 0 24px 60px rgba(0, 0, 0, .6), 0 4px 12px rgba(0, 0, 0, .35);
  --inset-hub: inset 0 2px 6px rgba(0, 0, 0, .5);
  color-scheme: dark;
}
:root[data-contrast='high'] { --accent: #C2410C; --accent-hover: #B23A0A; --accent-press: #9A3209; }
```

**Code: `global.css`**
```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: var(--font-ui); font-size: 14px; color: var(--text); background: var(--bg);
  -webkit-font-smoothing: antialiased; user-select: none;
}
html[data-view='overlay'], html[data-view='overlay'] body { background: transparent; overflow: hidden; }
button { font: inherit; color: inherit; }
input, select, textarea { font: inherit; color: inherit; user-select: text; }
h1, h2, h3, p { margin: 0; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
kbd {
  font: 600 11px/1 var(--font-ui); padding: 3px 6px; border-radius: 6px;
  background: var(--surface-2); border: 1px solid var(--border); box-shadow: 0 1px 0 var(--border);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

**Code: `lib/theme.ts`**
```ts
import type { Settings } from '@shared/types';
import { api } from './api';

const mq = window.matchMedia('(prefers-color-scheme: dark)');
let current: Settings | null = null;

export function applyTheme(s: Settings): void {
  current = s;
  const dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.contrast = s.highContrastAccent ? 'high' : 'normal';
}

export async function initTheme(): Promise<void> {
  applyTheme(await api.getSettings());
  api.onSettings(applyTheme);
  mq.addEventListener('change', () => { if (current) applyTheme(current); });
}
```

**Code: `main.tsx`**
```tsx
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/global.css';
import './components/components.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { OverlayApp } from './OverlayApp';
import { getPlatform } from './lib/platform';
import { initTheme } from './lib/theme';

const view = new URLSearchParams(window.location.search).get('view') ?? 'main';
document.documentElement.dataset.view = view;
document.documentElement.dataset.platform = getPlatform();   // CSS: html[data-platform='darwin'] …
// Without this, dropping a file anywhere would navigate the window to that file.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
void initTheme();
createRoot(document.getElementById('root') as HTMLElement).render(view === 'overlay' ? <OverlayApp /> : <App />);
```
(`App` and `OverlayApp` are created in 5.5 and 5.7. Until then, create stubs that return `<div>App</div>` and `<div>Overlay</div>`, plus an empty `components/components.css`, which Task 5.2 fills.)

---

## Task 5.2 — Base components
**Files:**
- `components/Icon.tsx`, `components/Button.tsx`, `components/Keycap.tsx`, `components/Panel.tsx` (exports `Panel` and `Row`)
- `components/Slider.tsx`, `components/Segmented.tsx`, `components/Select.tsx`, `components/Toggle.tsx`, `components/TextField.tsx`, `components/ProgressRing.tsx`
- `components/components.css`

> **React 19 note:** do **not** write `: JSX.Element` return types (the global `JSX` namespace was removed). Let TypeScript infer them.

**Code: `Icon.tsx`.** Every name below exists in recent `lucide-react`. If an import fails, open `node_modules/lucide-react/dist/lucide-react.d.ts`, pick the closest existing icon, and note the swap.
```tsx
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine, AudioLines, AudioWaveform, Ban, BookOpen, Camera, Captions, Check, ChevronLeft, ChevronsUpDown,
  Clock, Combine, Crop, ExternalLink, EyeOff, File, FileText, FileType2, Film, FlipHorizontal2, FlipVertical2,
  FolderOpen, Frame, Gauge, GripVertical, Image, Images, LayoutGrid, Maximize2, Music, Pause, Play, Plus,
  RotateCcw, RotateCw, Scaling, ScanText, Scissors, Shrink, SlidersHorizontal, Split, Tag, Trash2, TriangleAlert,
  Video, VolumeX, Waves, X
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  compress: Shrink, tag: Tag, mute: VolumeX, scissors: Scissors, crop: Crop, gauge: Gauge, camera: Camera,
  film: Film, eyeOff: EyeOff, join: Combine, normalize: Waves, channels: AudioLines, waveform: AudioWaveform,
  bleep: Ban, resize: Scaling, sliders: SlidersHorizontal, frame: Frame, grid: LayoutGrid, filePdf: FileText,
  split: Split, images: Images, scanText: ScanText, fileWord: FileType2, clock: Clock,
  image: Image, video: Video, audio: Music, pdf: FileText, epub: BookOpen, text: FileText, subtitle: Captions, file: File,
  close: X, back: ChevronLeft, check: Check, alert: TriangleAlert, folder: FolderOpen, open: ExternalLink,
  drop: ArrowDownToLine, rotateLeft: RotateCcw, rotateRight: RotateCw, flipH: FlipHorizontal2, flipV: FlipVertical2,
  expand: Maximize2, plus: Plus, trash: Trash2, grip: GripVertical, play: Play, pause: Pause, chevrons: ChevronsUpDown
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? ICONS.file;
  return <C size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}

/** Icon key for a file category (used in the wheel hub when there is no thumbnail). */
export const CATEGORY_ICON: Record<string, string> = {
  image: 'image', video: 'video', audio: 'audio', pdf: 'pdf', epub: 'epub', text: 'text', subtitle: 'subtitle'
};
```

**Code: `Button.tsx`**
```tsx
import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';

type Variant = 'primary' | 'soft' | 'ghost';

export function Button({ variant = 'soft', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`btn btn--${variant} ${className}`} {...rest} />;
}

export function IconButton({ label, icon, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  );
}
```

**Code: `Keycap.tsx`**
```tsx
export function Keycap({ glyph, label }: { glyph?: string; label: string }) {
  return (
    <div className="keycap" aria-hidden="true">
      {glyph && <span className="keycap__glyph">{glyph}</span>}
      <span className="keycap__label">{label}</span>
    </div>
  );
}
```

**Code: `Panel.tsx`.** This is the card anatomy from `crop-options.png`.
```tsx
import type { ReactNode } from 'react';
import { Button, IconButton } from './Button';

export interface PanelProps {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  onReset?: () => void;
  onApply?: () => void;
  applyLabel?: string;
  applyDisabled?: boolean;
  footerExtra?: ReactNode;
  children: ReactNode;
}

export function Panel(p: PanelProps) {
  return (
    <section className="panel" role="dialog" aria-label={p.title}>
      <header className="panel__header">
        {p.onBack ? <IconButton label="Back" icon="back" onClick={p.onBack} /> : <span className="icon-btn-spacer" />}
        <h2 className="panel__title">{p.title}</h2>
        {p.onClose ? <IconButton label="Close" icon="close" onClick={p.onClose} /> : <span className="icon-btn-spacer" />}
      </header>
      <div className="panel__body">{p.children}</div>
      {(p.onApply || p.onReset || p.footerExtra) && (
        <footer className="panel__footer">
          {p.onReset ? <Button variant="soft" onClick={p.onReset}>Reset</Button> : <span />}
          <div className="panel__footer-right">
            {p.footerExtra}
            {p.onApply && <Button variant="primary" onClick={p.onApply} disabled={p.applyDisabled}>{p.applyLabel ?? 'Apply'}</Button>}
          </div>
        </footer>
      )}
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row__label">{label}{hint && <span className="row__hint">{hint}</span>}</div>
      <div className="row__control">{children}</div>
    </div>
  );
}
```

**Code: `Slider.tsx`** (orange fill like the screenshot)
```tsx
export function Slider(p: { value: number; min: number; max: number; step?: number; label: string; onChange: (v: number) => void; format?: (v: number) => string }) {
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <div className="slider">
      <span className="slider__label">{p.label}</span>
      <input type="range" min={p.min} max={p.max} step={p.step ?? 1} value={p.value} aria-label={p.label}
        style={{ ['--pct' as string]: `${pct}%` }} onChange={(e) => p.onChange(Number(e.target.value))} />
      <span className="slider__value">{p.format ? p.format(p.value) : p.value}</span>
    </div>
  );
}
```

**Code: `Segmented.tsx`**
```tsx
export function Segmented<T extends string | number>(p: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={p.label}>
      {p.options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === p.value}
          className={`segmented__item${o.value === p.value ? ' is-on' : ''}`} onClick={() => p.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

**Code: `Select.tsx`**
```tsx
import { Icon } from './Icon';

export function Select<T extends string>(p: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="select">
      <select aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value as T)}>
        {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="chevrons" size={14} />
    </div>
  );
}
```

**Code: `Toggle.tsx`, `TextField.tsx`**
```tsx
export function Toggle(p: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={p.checked} aria-label={p.label}
      className={`toggle${p.checked ? ' is-on' : ''}`} onClick={() => p.onChange(!p.checked)}>
      <span className="toggle__knob" />
    </button>
  );
}
```
```tsx
export function TextField(p: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; type?: 'text' | 'number' }) {
  return <input className="textfield" type={p.type ?? 'text'} value={p.value} placeholder={p.placeholder} aria-label={p.label} onChange={(e) => p.onChange(e.target.value)} />;
}
```

**Code: `ProgressRing.tsx`**
```tsx
import type { ReactNode } from 'react';

export function ProgressRing({ value, size = 96, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 200ms linear' }} />
      </svg>
      <div className="ring__inner">{children}</div>
    </div>
  );
}
```

**Code: `components.css`** (write all of these rules)
```css
/* buttons */
.btn { border: 0; border-radius: 10px; padding: 8px 16px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 120ms var(--ease-out), transform 80ms; }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: .45; cursor: default; }
.btn--primary { background: var(--accent); color: var(--accent-contrast); }
.btn--primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn--soft { background: var(--accent-soft); color: var(--text); }
.btn--ghost { background: transparent; color: var(--text-2); }
.btn--ghost:hover { background: var(--surface-2); }
.icon-btn { width: 32px; height: 32px; border-radius: 50%; border: 0; background: var(--surface-2); display: grid; place-items: center; cursor: pointer; color: var(--text-2); }
.icon-btn:hover { color: var(--text); }
.icon-btn-spacer { width: 32px; height: 32px; }
/* keycap (clean UI.png) */
.keycap { width: 76px; height: 76px; border-radius: 12px; position: relative; background: linear-gradient(#FBFBF8, #EFEFEA);
  border: 1px solid #E3E3DE; box-shadow: 0 3px 0 #D9D9D2, 0 8px 18px rgba(0,0,0,.06); color: #8A8A85; }
:root[data-theme='dark'] .keycap { background: linear-gradient(#34343A, #2A2A2F); border-color: #3A3A40; box-shadow: 0 3px 0 #1A1A1D, 0 8px 18px rgba(0,0,0,.4); color: #A3A3A3; }
.keycap__glyph { position: absolute; left: 10px; top: 8px; font-size: 18px; }
.keycap__label { position: absolute; left: 10px; bottom: 8px; font-size: 11px; }
/* panel (crop-options.png) */
.panel { width: 100%; max-height: 100%; display: flex; flex-direction: column; background: var(--surface); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-3); overflow: hidden; animation: panel-in 200ms var(--ease-out) both; }
@keyframes panel-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
.panel__header { height: 56px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; border-bottom: 1px solid var(--border); }
.panel__title { font-size: 17px; font-weight: 600; }
.panel__body { flex: 1; overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; user-select: none; }
.panel__footer { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-top: 1px solid var(--border); }
.panel__footer-right { display: flex; gap: 8px; align-items: center; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 34px; }
.row__label { font-size: 15px; display: flex; flex-direction: column; }
.row__hint { font-size: 12px; color: var(--text-3); }
.row__control { display: flex; align-items: center; gap: 8px; }
/* slider */
.slider { display: grid; grid-template-columns: 70px 1fr 52px; align-items: center; gap: 12px; }
.slider__label { font-size: 15px; }
.slider__value { font-size: 15px; text-align: right; font-variant-numeric: tabular-nums; }
.slider input[type='range'] { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 999px; outline-offset: 6px;
  background: linear-gradient(to right, var(--accent) 0 var(--pct), var(--track) var(--pct) 100%); }
.slider input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25), 0 0 0 .5px rgba(0,0,0,.08); cursor: grab; }
/* segmented */
.segmented { display: inline-flex; background: var(--surface-2); border-radius: 10px; padding: 3px; gap: 2px; }
.segmented__item { border: 0; background: transparent; padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text-2); }
.segmented__item.is-on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-1); }
/* select */
.select { position: relative; display: inline-flex; align-items: center; }
.select select { appearance: none; border: 0; background: var(--surface-2); border-radius: 10px; padding: 7px 32px 7px 12px; font-size: 14px; cursor: pointer; }
.select svg { position: absolute; right: 10px; pointer-events: none; color: var(--text-2); }
/* toggle */
.toggle { width: 42px; height: 24px; border-radius: 999px; border: 0; background: var(--track); position: relative; cursor: pointer; transition: background 150ms; }
.toggle.is-on { background: var(--accent); }
.toggle__knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-1); transition: transform 150ms var(--ease-out); }
.toggle.is-on .toggle__knob { transform: translateX(18px); }
/* text field */
.textfield { border: 1px solid var(--border); background: var(--surface); border-radius: 10px; padding: 7px 10px; min-width: 0; width: 100%; }
/* progress ring */
.ring { position: relative; }
.ring svg { position: absolute; inset: 0; }
.ring__inner { position: absolute; inset: 10px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; font-weight: 600; }
.ring__inner img { width: 100%; height: 100%; object-fit: cover; }
```

**Verify:** `npm run typecheck`.

---

## Task 5.3 — Wheel geometry (pure + tests)
**Files:** `src/renderer/src/components/Wheel/wheelGeometry.ts`, `wheelGeometry.test.ts`
```ts
export interface WheelGeometry { size: number; cx: number; cy: number; rOuter: number; rInner: number; gap: number; corner: number }

export const DEFAULT_GEOMETRY: WheelGeometry = { size: 340, cx: 170, cy: 170, rOuter: 160, rInner: 62, gap: 6, corner: 12 };

/** Angle 0° = 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG path of slice i of n. It is shrunk by `corner` on every side so that a round-joined
 *  stroke of width 2*corner restores the full size WITH rounded corners. Slice 0 is centred at 12 o'clock. */
export function slicePath(i: number, n: number, g: WheelGeometry): string {
  const span = 360 / n;
  const a0 = i * span - span / 2;
  const a1 = a0 + span;
  const ro = g.rOuter - g.corner;
  const ri = g.rInner + g.corner;
  const pad = (r: number): number => ((g.gap / 2 + g.corner) / r) * (180 / Math.PI);
  const p1 = polar(g.cx, g.cy, ro, a0 + pad(ro));
  const p2 = polar(g.cx, g.cy, ro, a1 - pad(ro));
  const p3 = polar(g.cx, g.cy, ri, a1 - pad(ri));
  const p4 = polar(g.cx, g.cy, ri, a0 + pad(ri));
  const largeOuter = span - 2 * pad(ro) > 180 ? 1 : 0;
  const largeInner = span - 2 * pad(ri) > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${ro} ${ro} 0 ${largeOuter} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${ri} ${ri} 0 ${largeInner} 0 ${p4.x} ${p4.y} Z`;
}

/** Centre of slice i (where the icon + label go). */
export function labelPoint(i: number, n: number, g: WheelGeometry): { x: number; y: number } {
  return polar(g.cx, g.cy, (g.rOuter + g.rInner) / 2, i * (360 / n));
}

/** Small outward offset for the active slice. */
export function sliceOffset(i: number, n: number, distance: number): { x: number; y: number } {
  const p = polar(0, 0, distance, i * (360 / n));
  return { x: p.x, y: p.y };
}

/** Which slice is under the point (wheel-local coordinates)? */
export function hitTest(x: number, y: number, n: number, g: WheelGeometry): number | 'center' | null {
  const dx = x - g.cx;
  const dy = y - g.cy;
  const d = Math.hypot(dx, dy);
  if (d < g.rInner) return 'center';
  if (d > g.rOuter + 24 || n === 0) return null;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;   // 0 = up, clockwise
  deg = (deg + 360 + 180 / n) % 360;                     // shift so slice 0 spans [0, span)
  return Math.floor(deg / (360 / n)) % n;
}
```
**Tests**
- `hitTest(170, 30, 4, G)` → 0 (straight up).
- `hitTest(310, 170, 4, G)` → 1 (right).
- `hitTest(170, 310, 4, G)` → 2.
- `hitTest(30, 170, 4, G)` → 3.
- `hitTest(170, 170, 4, G)` → `'center'`.
- `hitTest(0, 0, 4, G)` → `null`.
- With n = 7, the point just right of 12 o'clock is still slice 0.
- `slicePath(0, 8, G)` starts with `'M '` and contains two `' A '` arcs.

---

## Task 5.4 — `Wheel` component
**Files:** `components/Wheel/Wheel.tsx`, `components/Wheel/wheel.css`
```tsx
import type { WheelItem } from '@shared/wheelItems';
import { useRef } from 'react';
import { Icon } from '../Icon';
import { DEFAULT_GEOMETRY as G, hitTest, labelPoint, sliceOffset, slicePath } from './wheelGeometry';
import './wheel.css';

export interface WheelProps {
  items: WheelItem[];
  active: number | null;
  onActiveChange?: (i: number | null) => void;
  onPick?: (i: number, withOptions: boolean) => void;
  hubLabel?: string;
  thumbnail?: string;
  hubIcon?: string;
  demo?: boolean;                                                     // non-interactive (home page)
  onDropFiles?: (dt: DataTransfer, hit: number | 'center' | null) => void;   // global-drag mode
  onDragTypes?: (dt: DataTransfer) => void;                           // global-drag mode: read MIME types
}

export function Wheel(p: WheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const n = p.items.length;

  const hit = (clientX: number, clientY: number): number | 'center' | null => {
    const el = ref.current;
    if (!el || n === 0) return null;
    const r = el.getBoundingClientRect();
    const s = r.width / G.size;                     // supports CSS scaling
    return hitTest((clientX - r.left) / s, (clientY - r.top) / s, n, G);
  };
  const setActive = (h: number | 'center' | null): void => p.onActiveChange?.(typeof h === 'number' ? h : null);

  return (
    <div
      ref={ref}
      className={`wheel${p.demo ? ' wheel--demo' : ''}`}
      style={{ width: G.size, height: G.size }}
      role="menu"
      aria-activedescendant={p.active !== null ? `wheel-item-${p.active}` : undefined}
      onPointerMove={(e) => { if (!p.demo) setActive(hit(e.clientX, e.clientY)); }}
      onPointerLeave={() => { if (!p.demo) p.onActiveChange?.(null); }}
      onClick={(e) => { const h = hit(e.clientX, e.clientY); if (!p.demo && typeof h === 'number') p.onPick?.(h, false); }}
      onContextMenu={(e) => { e.preventDefault(); const h = hit(e.clientX, e.clientY); if (!p.demo && typeof h === 'number') p.onPick?.(h, true); }}
      onDragEnter={(e) => { if (p.onDragTypes) p.onDragTypes(e.dataTransfer); }}
      onDragOver={(e) => {
        if (!p.onDropFiles) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';      // NEVER 'move' — Explorer/Finder/Nautilus could delete the original
        setActive(hit(e.clientX, e.clientY));
      }}
      onDrop={(e) => { if (!p.onDropFiles) return; e.preventDefault(); p.onDropFiles(e.dataTransfer, hit(e.clientX, e.clientY)); }}
    >
      <svg className="wheel__svg" width={G.size} height={G.size} viewBox={`0 0 ${G.size} ${G.size}`} aria-hidden="true">
        <defs>
          <linearGradient id="kbSliceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--slice-top)' }} />
            <stop offset="1" style={{ stopColor: 'var(--slice-bottom)' }} />
          </linearGradient>
          <filter id="kbSliceShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.16" />
          </filter>
        </defs>
        <circle className="wheel__base" cx={G.cx} cy={G.cy} r={G.rOuter + 8} />
        {p.items.map((item, i) => {
          const off = sliceOffset(i, n, 3);
          return (
            <path key={item.key} d={slicePath(i, n, G)} className={`wheel__slice${i === p.active ? ' is-active' : ''}`}
              strokeWidth={G.corner * 2} strokeLinejoin="round" filter="url(#kbSliceShadow)"
              style={{ ['--tx' as string]: `${off.x}px`, ['--ty' as string]: `${off.y}px` }} />
          );
        })}
      </svg>
      {p.items.map((item, i) => {
        const pt = labelPoint(i, n, G);
        const off = sliceOffset(i, n, 3);
        return (
          <div key={item.key} id={`wheel-item-${i}`} role="menuitem" aria-label={item.label}
            className={`wheel__label${i === p.active ? ' is-active' : ''}`}
            style={{ left: pt.x, top: pt.y, ['--tx' as string]: `${off.x}px`, ['--ty' as string]: `${off.y}px` }}>
            {item.icon && <Icon name={item.icon} size={18} />}
            <span>{item.label}</span>
          </div>
        );
      })}
      <div className="wheel__hub" style={{ width: (G.rInner - 6) * 2, height: (G.rInner - 6) * 2 }}>
        {p.thumbnail ? <img className="wheel__thumb" src={p.thumbnail} alt="" /> : p.hubIcon ? <Icon name={p.hubIcon} size={28} /> : null}
        {p.hubLabel && <span className="wheel__pill">{p.hubLabel}</span>}
      </div>
    </div>
  );
}
```

**Code: `wheel.css`**
```css
.wheel { position: relative; user-select: none; animation: wheel-in 280ms var(--ease-spring) both; }
.wheel--demo { pointer-events: none; animation: none; }
.wheel__svg { position: absolute; inset: 0; overflow: visible; }
.wheel__base { fill: var(--wheel-base); filter: drop-shadow(0 18px 40px rgba(0,0,0,.14)) drop-shadow(0 2px 6px rgba(0,0,0,.08)); }
.wheel__slice { fill: url(#kbSliceFill); stroke: url(#kbSliceFill); cursor: pointer;
  transition: fill 120ms var(--ease-out), stroke 120ms var(--ease-out), transform 160ms var(--ease-out); }
.wheel__slice.is-active { fill: var(--accent); stroke: var(--accent); transform: translate(var(--tx), var(--ty)); }
.wheel__label { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--slice-text);
  pointer-events: none; white-space: nowrap; transition: color 120ms, transform 160ms var(--ease-out); }
.wheel__label.is-active { color: var(--accent-contrast); transform: translate(-50%, -50%) translate(var(--tx), var(--ty)); }
.wheel__hub { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: 50%; background: var(--hub);
  box-shadow: var(--inset-hub); display: grid; place-items: center; overflow: hidden; pointer-events: none; color: var(--text-2); }
.wheel__thumb { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.wheel__pill { position: relative; padding: 6px 12px; border-radius: 999px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  background: color-mix(in srgb, var(--surface) 88%, transparent); box-shadow: var(--shadow-1); font-size: 12px; font-weight: 600; color: var(--text); }
@keyframes wheel-in { from { opacity: 0; transform: scale(.82) rotate(-35deg); } to { opacity: 1; transform: none; } }
```

---

## Task 5.5 — Overlay store, sizes, `OverlayApp`, Wheel stage
**Files:** `overlay/store.ts`, `overlay/sizes.ts`, `overlay/overlay.css`, `overlay/stages/WheelStage.tsx`, `OverlayApp.tsx`, `lib/format.ts`, and `panels/index.ts` (registry skeleton, used by `sizes.ts`)

**Code: `panels/index.ts`** (skeleton; filled by later tasks)
```ts
import type { ComponentType } from 'react';
import type { ConvertOptions } from '@shared/toolOptions';
import type { Category, FileInfo, Fmt, ToolId } from '@shared/types';

export interface ToolPanelProps {
  files: FileInfo[];
  onApply: (options: Record<string, unknown>) => void;
  onBack: () => void;
  onClose: () => void;
}
export interface ToolPanelDef { component: ComponentType<ToolPanelProps>; width: number; height: number }

/** Tool panels (Phases 7–10 add entries). */
export const PANELS: Partial<Record<ToolId, ToolPanelDef>> = {};

export interface ConvertCardProps {
  files: FileInfo[];
  target: Fmt;
  onApply: (o: ConvertOptions) => void;
  onBack: () => void;
  onClose: () => void;
}
export interface ConvertCardDef { component: ComponentType<ConvertCardProps>; width: number; height: number }

/** Keys: "<category>-><target>", "*-><target>", "<category>->*", "*->*" (most specific wins). */
export const CONVERT_CARDS: Record<string, ConvertCardDef> = {};

export function convertCardFor(category: Category | null, target: Fmt): ConvertCardDef | undefined {
  return CONVERT_CARDS[`${category}->${target}`] ?? CONVERT_CARDS[`*->${target}`] ?? CONVERT_CARDS[`${category}->*`] ?? CONVERT_CARDS['*->*'];
}
```

**Code: `overlay/store.ts`**
```ts
import { create } from 'zustand';
import type { Capabilities, FileInfo, Fmt, JobUpdate, OverlayInit, ToolId, WheelMode } from '@shared/types';

export type Stage =
  | { name: 'empty' }
  | { name: 'wheel' }
  | { name: 'options'; target: Fmt }
  | { name: 'panel'; toolId: ToolId }
  | { name: 'running'; jobId: string }
  | { name: 'done'; job: JobUpdate }
  | { name: 'error'; message: string; details?: string };

interface OverlayState {
  files: FileInfo[];
  mode: WheelMode;
  caps: Capabilities | null;
  source: OverlayInit['source'];
  stage: Stage;
  active: number | null;
  dragging: boolean;
  init: (p: OverlayInit) => void;
  mergeFiles: (deep: FileInfo[]) => void;
  setMode: (m: WheelMode) => void;
  setActive: (i: number | null) => void;
  go: (s: Stage) => void;
}

export const useOverlay = create<OverlayState>()((set) => ({
  files: [],
  mode: 'convert',
  caps: null,
  source: 'window',
  stage: { name: 'empty' },
  active: null,
  dragging: false,
  init: (p) => set({ files: p.files, mode: p.mode, caps: p.caps, source: p.source, stage: { name: 'wheel' }, active: null, dragging: false }),
  mergeFiles: (deep) => set((s) => ({ files: s.files.map((f) => deep.find((d) => d.path === f.path) ?? f) })),
  setMode: (mode) => set({ mode, active: null }),
  setActive: (active) => set({ active }),
  go: (stage) => set({ stage })
}));
```

**Code: `overlay/sizes.ts`**
```ts
import { WHEEL_STAGE, type OverlaySize } from '@shared/overlay';
import { PANELS } from '../panels';
import type { Stage } from './store';

const MARGIN = 48;   // transparent space around cards for their shadow

export function sizeForStage(stage: Stage): OverlaySize {
  switch (stage.name) {
    case 'empty':
    case 'wheel':
      return { width: WHEEL_STAGE.width, height: WHEEL_STAGE.height, anchor: 'wheel' };
    case 'options':
      return { width: 420 + MARGIN, height: 560 + MARGIN, anchor: 'center' };   // Task 5.8 uses the card's own size
    case 'panel': {
      const d = PANELS[stage.toolId];
      return { width: (d?.width ?? 440) + MARGIN, height: (d?.height ?? 520) + MARGIN, anchor: 'center' };
    }
    case 'running':
    case 'done':
      return { width: 380 + MARGIN, height: 320 + MARGIN, anchor: 'center' };
    case 'error':
      return { width: 440 + MARGIN, height: 380 + MARGIN, anchor: 'center' };
  }
}
```
(Task 5.8 changes the `options` case to use the size of the specific card.)

**Code: `lib/format.ts`**
```ts
export const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
export { formatBytes, formatDuration, formatTimecode } from '@shared/time';
```

**Code: `overlay/stages/WheelStage.tsx`**
```tsx
import { useEffect, useMemo } from 'react';
import { buildWheel } from '@shared/wheelItems';
import { CATEGORY_ICON } from '../../components/Icon';
import { Wheel } from '../../components/Wheel/Wheel';
import { api } from '../../lib/api';
import { useOverlay } from '../store';

export function WheelStage() {
  const { files, mode, caps, active, setActive, setMode, go } = useOverlay();
  const model = useMemo(() => (caps ? buildWheel(files, mode, caps) : { items: [], category: null, mixed: false }), [files, mode, caps]);

  const pick = async (i: number, withOptions: boolean): Promise<void> => {
    const item = model.items[i];
    if (!item) return;
    if (item.kind === 'tool' && item.toolId) {
      if (!item.needsOptions && !withOptions) {
        const jobId = await api.startJob({ kind: 'tool', inputs: files.map((f) => f.path), toolId: item.toolId, options: {} });
        go({ name: 'running', jobId });
      } else {
        go({ name: 'panel', toolId: item.toolId });
      }
      return;
    }
    if (!item.target) return;
    if (item.needsOptions || withOptions) { go({ name: 'options', target: item.target }); return; }
    const jobId = await api.startJob({ kind: 'convert', inputs: files.map((f) => f.path), target: item.target });
    go({ name: 'running', jobId });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const n = model.items.length;
      if (e.key === 'Escape') { void api.closeOverlay(); return; }
      if (e.key === 'Tab') { e.preventDefault(); setMode(mode === 'convert' ? 'tools' : 'convert'); return; }
      if (n === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActive(active === null ? 0 : (active + 1) % n); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActive(active === null ? n - 1 : (active - 1 + n) % n); }
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) void pick(Number(e.key) - 1, false);
      else if (e.key === 'Enter' && active !== null) void pick(active, e.shiftKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hovered = active !== null ? model.items[active] : undefined;
  const first = files[0];
  const caption = hovered
    ? hovered.kind === 'format' ? `Convert to ${hovered.label}` : hovered.label
    : model.emptyReason ?? (mode === 'convert' ? 'Convert formats' : 'Advanced tools');
  const hubLabel = hovered?.label ?? (files.length > 1 ? `${files.length} files` : first?.fmt?.toUpperCase() ?? '');

  return (
    <div className="stage-wheel">
      <Wheel items={model.items} active={active} onActiveChange={setActive} onPick={(i, o) => void pick(i, o)}
        hubLabel={hubLabel} thumbnail={first?.thumbnail} hubIcon={model.category ? CATEGORY_ICON[model.category] : 'file'} />
      <p className="stage-wheel__caption">{caption}</p>
      <p className="stage-wheel__sub">
        {files.length === 1 ? first?.name : `${files.length} files`} · <kbd>Tab</kbd> {mode === 'convert' ? 'Tools' : 'Formats'}
      </p>
    </div>
  );
}
```

**Code: `overlay/overlay.css`**
```css
.overlay { position: fixed; inset: 0; }
.overlay__center { position: absolute; inset: 24px; display: grid; place-items: center; }
.stage-wheel { position: absolute; left: 50px; top: 40px; width: 340px; display: flex; flex-direction: column; align-items: center; }
.stage-wheel__caption { margin-top: 18px; padding: 6px 14px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow-2);
  font-size: 14px; font-weight: 600; max-width: 340px; text-align: center; }
.stage-wheel__sub { margin-top: 8px; font-size: 12px; color: var(--text-2); background: color-mix(in srgb, var(--surface) 80%, transparent);
  padding: 3px 10px; border-radius: 999px; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card { width: 100%; background: var(--surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-3); padding: 24px;
  display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; animation: panel-in 200ms var(--ease-out) both; }
.status__title { font-size: 17px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status__sub { font-size: 13px; color: var(--text-2); }
.status__actions { display: flex; gap: 8px; margin-top: 4px; }
.status__icon { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; }
.status__icon--ok { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
.status__icon--err { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
.status__details { width: 100%; max-height: 140px; overflow: auto; text-align: left; font: 12px/1.4 Consolas, monospace;
  background: var(--surface-2); border-radius: 10px; padding: 8px; white-space: pre-wrap; user-select: text; }
```

**Code: `OverlayApp.tsx`**
```tsx
import { useEffect } from 'react';
import { api } from './lib/api';
import { sizeForStage } from './overlay/sizes';
import { useOverlay, type Stage } from './overlay/store';
import { DoneStage } from './overlay/stages/DoneStage';
import { ErrorStage } from './overlay/stages/ErrorStage';
import { OptionsStage } from './overlay/stages/OptionsStage';
import { PanelStage } from './overlay/stages/PanelStage';
import { RunningStage } from './overlay/stages/RunningStage';
import { WheelStage } from './overlay/stages/WheelStage';
import './overlay/overlay.css';

const AUTO_CLOSE_ON_BLUR: Stage['name'][] = ['wheel', 'running', 'done', 'error'];

function StageView({ stage }: { stage: Stage }) {
  switch (stage.name) {
    case 'empty': return null;
    case 'wheel': return <WheelStage />;
    case 'options': return <div className="overlay__center"><OptionsStage target={stage.target} /></div>;
    case 'panel': return <div className="overlay__center"><PanelStage toolId={stage.toolId} /></div>;
    case 'running': return <div className="overlay__center"><RunningStage jobId={stage.jobId} /></div>;
    case 'done': return <div className="overlay__center"><DoneStage job={stage.job} /></div>;
    case 'error': return <div className="overlay__center"><ErrorStage message={stage.message} details={stage.details} /></div>;
  }
}

export function OverlayApp() {
  const stage = useOverlay((s) => s.stage);

  useEffect(() => {
    const offs = [
      api.onOverlayInit((p) => useOverlay.getState().init(p)),
      api.onOverlayFiles((files) => useOverlay.getState().mergeFiles(files))
    ];
    const onBlur = (): void => { if (AUTO_CLOSE_ON_BLUR.includes(useOverlay.getState().stage.name)) void api.closeOverlay(); };
    window.addEventListener('blur', onBlur);
    return () => { offs.forEach((o) => o()); window.removeEventListener('blur', onBlur); };
  }, []);

  useEffect(() => { void api.resizeOverlay(sizeForStage(stage)); }, [stage]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && stage.name === 'wheel') void api.closeOverlay(); }}>
      <StageView stage={stage} />
    </div>
  );
}
```

> Create placeholder components now so this compiles: `OptionsStage`, `PanelStage`, `RunningStage`, `DoneStage`, `ErrorStage`. Each returns `<Panel title="…">Coming soon</Panel>`. They are implemented in 5.6 and 5.8.

---

## Task 5.6 — Running / Done / Error stages + `useJob`
**Files:** `lib/useJob.ts`, `overlay/stages/RunningStage.tsx`, `overlay/stages/DoneStage.tsx`, `overlay/stages/ErrorStage.tsx`

**Code: `lib/useJob.ts`**
```ts
import { useEffect, useState } from 'react';
import type { JobUpdate } from '@shared/types';
import { api } from './api';

export function useJob(jobId: string | null): JobUpdate | null {
  const [job, setJob] = useState<JobUpdate | null>(null);
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    void api.listJobs().then((list) => { const j = list.find((x) => x.id === jobId); if (alive && j) setJob(j); });
    const off = api.onJobUpdate((u) => { if (u.id === jobId) setJob(u); });
    return () => { alive = false; off(); };
  }, [jobId]);
  return job;
}
```

**Code: `RunningStage.tsx`**
```tsx
import { useEffect } from 'react';
import { Button } from '../../components/Button';
import { ProgressRing } from '../../components/ProgressRing';
import { api } from '../../lib/api';
import { useJob } from '../../lib/useJob';
import { useOverlay } from '../store';

export function RunningStage({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const go = useOverlay((s) => s.go);
  const first = useOverlay((s) => s.files[0]);

  useEffect(() => {
    if (!job) return;
    if (job.status === 'done') go({ name: 'done', job });
    else if (job.status === 'error') go({ name: 'error', message: job.error ?? 'Something went wrong.', details: job.errorDetails });
    else if (job.status === 'canceled') void api.closeOverlay();
  }, [job, go]);

  const pct = Math.round((job?.progress ?? 0) * 100);
  return (
    <div className="card">
      <ProgressRing value={job?.progress ?? 0} size={104}>
        {first?.thumbnail ? <img src={first.thumbnail} alt="" /> : <span>{pct}%</span>}
      </ProgressRing>
      <h2 className="status__title">{job?.label ?? 'Starting…'}</h2>
      <p className="status__sub">{job?.detail ?? first?.name} · {pct}%</p>
      <Button variant="soft" onClick={() => void api.cancelJob(jobId)}>Cancel</Button>
    </div>
  );
}
```

**Code: `DoneStage.tsx`**
```tsx
import { useEffect, useState } from 'react';
import type { JobUpdate } from '@shared/types';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { baseName } from '../../lib/format';
import { revealLabel } from '../../lib/platform';

export function DoneStage({ job }: { job: JobUpdate }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setTimeout(() => void api.closeOverlay(), 6000);
    return () => clearTimeout(t);
  }, [hover]);
  const first = job.outputs[0];
  const title = !first ? 'Nothing new to save' : job.outputs.length === 1 ? `Saved ${baseName(first)}` : `Saved ${job.outputs.length} files`;
  return (
    <div className="card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="status__icon status__icon--ok"><Icon name="check" size={36} /></div>
      <h2 className="status__title" title={first}>{title}</h2>
      {job.note && <p className="status__sub">{job.note}</p>}
      <div className="status__actions">
        {first && <Button variant="primary" onClick={() => { void api.reveal(first); void api.closeOverlay(); }}>{revealLabel()}</Button>}
        {first && job.outputs.length === 1 && <Button variant="soft" onClick={() => { void api.openPath(first); void api.closeOverlay(); }}>Open</Button>}
        {!first && <Button variant="soft" onClick={() => void api.closeOverlay()}>Close</Button>}
      </div>
    </div>
  );
}
```

**Code: `ErrorStage.tsx`**
```tsx
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { useOverlay } from '../store';

export function ErrorStage({ message, details }: { message: string; details?: string }) {
  const [open, setOpen] = useState(false);
  const go = useOverlay((s) => s.go);
  return (
    <div className="card">
      <div className="status__icon status__icon--err"><Icon name="alert" size={32} /></div>
      <h2 className="status__title" style={{ whiteSpace: 'normal' }}>{message}</h2>
      {details && <Button variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Details'}</Button>}
      {open && details && <pre className="status__details">{details}</pre>}
      <div className="status__actions">
        {details && <Button variant="soft" onClick={() => void navigator.clipboard.writeText(`${message}\n\n${details}`)}>Copy details</Button>}
        <Button variant="soft" onClick={() => go({ name: 'wheel' })}>Back</Button>
        <Button variant="primary" onClick={() => void api.closeOverlay()}>Close</Button>
      </div>
    </div>
  );
}
```

---

## Task 5.7 — Main window: shell, Home view, drop zone, activity
**Files:** `App.tsx`, `views/HomeView.tsx`, `views/FormatsView.tsx` (placeholder), `views/SettingsView.tsx` (placeholder), `views/ActivityList.tsx`, `views/views.css`, `components/DropZone.tsx`, `lib/dnd.ts`

**Code: `lib/dnd.ts`**
```ts
import { fmtFromMime } from '@shared/formats';
import type { Fmt } from '@shared/types';
import { api } from './api';

export function pathsFromDataTransfer(dt: DataTransfer): string[] {
  return Array.from(dt.files).map((f) => api.getPathForFile(f)).filter((p) => p.length > 0);
}

/** During a drag only MIME types are readable (not paths). Used by the global drag wheel (Phase 11). */
export function fmtsFromDragTypes(dt: DataTransfer): Array<Fmt | null> {
  return Array.from(dt.items).filter((i) => i.kind === 'file').map((i) => (i.type ? fmtFromMime(i.type) : null));
}
```

**Code: `components/DropZone.tsx`**
```tsx
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { pathsFromDataTransfer } from '../lib/dnd';
import { Button } from './Button';
import { Icon } from './Icon';

export function DropZone() {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const open = (paths: string[], tools: boolean): void => { if (paths.length) void api.openOverlay(paths, tools ? 'tools' : 'convert'); };
  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true); }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setOver(false); open(pathsFromDataTransfer(e.dataTransfer), e.altKey); }}
    >
      <Icon name="drop" size={30} />
      <p className="dropzone__title">Drop files here</p>
      <p className="dropzone__sub">
        or <Button variant="soft" onClick={() => void api.pickFiles().then((p) => open(p, false))}>Browse files…</Button>
      </p>
    </div>
  );
}
```

**Spec: `views/HomeView.tsx`**
- Layout, top to bottom, max width 880 px, centred:
  1. H1 "Drop a file. Pick a slice." (40 px, weight 500, letter-spacing −0.02em).
  2. Subtitle "Convert and edit images, video, audio, PDFs, ebooks and subtitles — offline, on this computer. Nothing is uploaded." (`--text-2`).
  3. **Warning banner** when `caps.ffmpeg === false`: "FFmpeg was not found — video and audio are disabled. Run `npm run fetch-binaries`."
  4. `<DropZone />`: about 220 px high, dashed 2 px `--border` outline, radius 22, accent outline when `.is-over`.
  5. Two **hint cards** side by side, like `clean UI.png`:
     - Card 1: one `Keycap glyph="⇧" label="shift"`, the caption "Convert formats", and below it a **demo wheel** (`<Wheel demo …>` scaled to 0.62 inside a wrapper using `transform: scale(.62); transform-origin: top center; height: 211px`). Items: MP4, MKV, WEBM, AVI, WMV, GIF, MP3, as `WheelItem`s with `kind: 'format'`.
     - Card 2: Keycaps `⇧ shift` + `altKeycap()` (⌥ option on macOS, ⎇ alt elsewhere, from `lib/platform.ts`), the caption "Advanced tools", and a demo wheel with the 9 video tools from `toolsFor('video', 1)`.
     - Each demo wheel cycles `active` every 1200 ms (`setInterval`). The caption under the demo reads "Convert to WMV" or the tool label, like the screenshot.
  6. A small tip line: "In this window: drop = convert · `{altKeyName()}` + drop = tools · `Tab` switches inside the wheel".
  7. `<ActivityList />`.
- The **whole view** is also a drop target (same handlers as the DropZone), so dropping anywhere works.

**Spec: `views/ActivityList.tsx`**
- Load `api.listJobs()` on mount, then subscribe to `api.onJobUpdate`: **replace the job in place** if it exists, otherwise prepend it. Keep at most 20.
- Each row has:
  - a status icon (spinning ring while running, a check when done, an alert on error, grey when canceled);
  - the label and file name (`baseName(request.inputs[0])`, plus "+N" when there are more inputs);
  - a thin progress bar while running, `note` when done, `error` on failure;
  - a right-side action: **Cancel** (running/queued) or **Show** (done → `api.reveal(outputs[0])`).
- Hide the whole section when the list is empty.

**Code: `App.tsx`**
```tsx
import { useState } from 'react';
import { FormatsView } from './views/FormatsView';
import { HomeView } from './views/HomeView';
import { SettingsView } from './views/SettingsView';
import './views/views.css';

type Tab = 'convert' | 'formats' | 'settings';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'convert', label: 'Convert' }, { id: 'formats', label: 'Formats' }, { id: 'settings', label: 'Settings' }
];

export function App() {
  const [tab, setTab] = useState<Tab>('convert');
  useEffect(() => api.onNavigate(setTab), []);    // macOS ⌘, → Settings (import useEffect and api)
  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand"><span className="brand__logo" aria-hidden="true" />Kabooks</div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main className="app__content">
        {tab === 'convert' ? <HomeView /> : tab === 'formats' ? <FormatsView /> : <SettingsView />}
      </main>
    </div>
  );
}
```

**`views.css` must define:**
- `.app` (flex column, full height)
- `.titlebar`: height 44 px, flex with the brand on the left and the tabs centred. Per OS:
  - `html[data-platform='win32'] .titlebar { -webkit-app-region: drag; padding-right: 150px; }` clears the caption buttons.
  - `html[data-platform='darwin'] .titlebar { -webkit-app-region: drag; padding-left: 84px; }` clears the traffic lights.
  - `html[data-platform='linux'] .titlebar { -webkit-app-region: no-drag; }`; the native frame already has a title bar.
- `.tabs button` (`-webkit-app-region: no-drag`, pill style; `.is-on` uses `--surface` and `--shadow-1`)
- `.brand__logo` (16 px circle with a conic-gradient where one quarter is `--accent` and the rest `--slice-bottom`)
- `.app__content` (flex 1, overflow auto, padding 32 px 40 px)
- `.home`, `.dropzone`, `.dropzone.is-over`, `.hints`, `.hint-card`, `.activity` and the activity rows

Use tokens only.

**Verify:** `npm run dev`. The window looks like the outline mock (§7.5), and the demo wheels animate.

---

## Task 5.8 — Options stage (conversion cards) + Panel stage + GIF card + generic card
**Files:**
- `overlay/stages/OptionsStage.tsx`, `overlay/stages/PanelStage.tsx`
- `panels/convert/GifCard.tsx`, `panels/convert/GenericCard.tsx`
- `panels/common/ComingSoon.tsx`, `panels/useDeepFiles.ts`
- update `panels/index.ts` (register the cards) and `overlay/sizes.ts`

**Code: `panels/useDeepFiles.ts`**
```ts
import type { FileInfo } from '@shared/types';
import { useOverlay } from '../overlay/store';

/** Returns the files once deep inspection has arrived (width/height/duration known), else null. */
export function useDeepFiles(): FileInfo[] | null {
  const files = useOverlay((s) => s.files);
  return files.length > 0 && files.every((f) => f.deep) ? files : null;
}
```

**Code: `OptionsStage.tsx`**
```tsx
import type { ConvertOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { api } from '../../lib/api';
import { convertCardFor } from '../../panels';
import { useOverlay } from '../store';

export function OptionsStage({ target }: { target: Fmt }) {
  const { files, go } = useOverlay();
  const cats = new Set(files.map((f) => f.category));
  const category = cats.size === 1 ? [...cats][0] : null;
  const def = convertCardFor(category, target);
  const start = async (options: ConvertOptions): Promise<void> => {
    const jobId = await api.startJob({ kind: 'convert', inputs: files.map((f) => f.path), target, options });
    go({ name: 'running', jobId });
  };
  if (!def) return null;
  const Card = def.component;
  return <Card files={files} target={target} onApply={(o) => void start(o)} onBack={() => go({ name: 'wheel' })} onClose={() => void api.closeOverlay()} />;
}
```

**Code: `PanelStage.tsx`**
```tsx
import { useEffect } from 'react';
import { toolMeta } from '@shared/tools';
import type { ToolId } from '@shared/types';
import { Panel } from '../../components/Panel';
import { api } from '../../lib/api';
import { PANELS } from '../../panels';
import { useDeepFiles } from '../../panels/useDeepFiles';
import { useOverlay } from '../store';

export function PanelStage({ toolId }: { toolId: ToolId }) {
  const go = useOverlay((s) => s.go);
  const files = useDeepFiles();
  const meta = toolMeta(toolId);
  const def = PANELS[toolId];
  const back = (): void => go({ name: 'wheel' });
  const close = (): void => { void api.closeOverlay(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && !typing) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!files) return <Panel title={meta.label} onBack={back} onClose={close}><p>Reading file…</p></Panel>;
  if (!def) return <Panel title={meta.label} onBack={back} onClose={close}><p>This tool is coming soon.</p></Panel>;
  const C = def.component;
  const apply = async (options: Record<string, unknown>): Promise<void> => {
    const jobId = await api.startJob({ kind: 'tool', inputs: files.map((f) => f.path), toolId, options });
    go({ name: 'running', jobId });
  };
  return <C files={files} onApply={(o) => void apply(o)} onBack={back} onClose={close} />;
}
```

**Spec: `GifCard.tsx`** (key `'video->gif'`, size 420×420)
- `Panel` title "Make a GIF".
- Rows:
  - **Width:** Segmented 320 / 480 / 640 / Original (0). Default 480.
  - **Frame rate:** Segmented 10 / 12 / 15 / 24. Default 12.
- Note text: "GIFs are large. Shorter clips work best — trim first if needed."
- Apply label "Convert". It calls `onApply({ gifWidth, gifFps })`.

**Spec: `GenericCard.tsx`** (key `'*->*'`, size 420×360). Used for Shift+Enter or right-click on an "instant" format.
- Title `Convert to <LABEL>`.
- If the files are images and the target is jpg/webp/avif/heic: a **Quality** slider (40–100, default from settings 85). Otherwise show the text "No options for this format — default high quality is used."
- Apply label "Convert".

**Edit `sizes.ts`:** for the `options` stage, find the card with `convertCardFor(category, target)` (compute the category from the store's files) and use its `width/height` + MARGIN. `sizeForStage` therefore takes `(stage, files)`; update the call in `OverlayApp`.

**Register in `panels/index.ts`:**
```ts
CONVERT_CARDS['video->gif'] = { component: GifCard, width: 420, height: 420 };
CONVERT_CARDS['*->*'] = { component: GenericCard, width: 420, height: 360 };
```
Put these lines at the bottom of `panels/index.ts` after importing the components. The type-only imports from the card files back into `index.ts` are fine.

---

## Task 5.9 — Milestone M1 acceptance (manual)
Run `npm run dev` and check every item:
1. Drop `.cache/manual/tone.wav` (from Task 3.10) on the main window → the wheel spins open **centred under the cursor**, showing 7 audio formats (no WAV).
2. Hover slices → the hovered slice turns orange and slides outward. The hub pill and caption read "Convert to MP3".
3. Click MP3 → progress card → Done card "Saved tone.mp3" → **Show in Explorer / Show in Finder / Show in folder** opens the file manager with the file selected.
4. Drop again and use the keyboard:
   - `→` moves the highlight.
   - `Tab` switches to Tools. Picking a tool shows a "This tool is coming soon" panel; that is OK for now, and `‹` returns to the wheel.
   - `Esc` closes the wheel.
5. Alt + drop (macOS: Option + drop) opens the Tools ring directly.
6. Drop the self-test fixture `.selftest/fixtures/video.mp4`, then right-click GIF (macOS: Control-click also works) → the GIF card appears. Apply → a GIF is produced.
7. Click outside the wheel (on the transparent area) → the overlay closes.
   - **Linux:** if the area around the wheel is black instead of transparent, see Appendix D (compositor / transparent visuals).
8. Switch the OS to dark mode, or set the theme via DevTools: `await window.kabooks.setSettings({theme:'dark'})` → the colours switch.
9. Platform labels:
   - **macOS:** the home keycaps read "⇧ shift" + "⌥ option", and the Done button reads "Show in Finder".
   - **Windows:** "⇧ shift" + "alt" and "Show in Explorer".
   - **Linux:** "⇧ shift" + "alt" and "Show in folder".
10. `npm run selftest -- --only=av` still passes.

**Done when:** all 10 items pass on your OS. Commit "Milestone M1".

# Phase 6 — All remaining conversions (Milestone M2)

## Task 6.1 — Image engine + raster conversions (JPG/PNG/WebP/AVIF/TIFF/BMP)
**Files:**
- `src/main/types/shims.d.ts`, `src/main/engines/image.ts`, `src/main/converters/image.ts`
- update `converters/index.ts` (`image: convertImage`) and `thumbnails.ts` (HEIC/BMP)
- `selftest/cases/image.ts`, plus new fixtures and the helper `expectImage` in `assert.ts`

**Code: `src/main/types/shims.d.ts`**
```ts
declare module 'heic-decode' {
  interface Decoded { width: number; height: number; data: Uint8ClampedArray }
  function decode(opts: { buffer: Buffer | Uint8Array | ArrayBuffer }): Promise<Decoded>;
  export default decode;
}
declare module 'imagetracerjs' {
  const ImageTracer: {
    imagedataToSVG(imgd: { width: number; height: number; data: Uint8ClampedArray }, options?: Record<string, unknown> | string): string;
  };
  export default ImageTracer;
}
declare module 'piexifjs' {
  const piexif: {
    load(binary: string): Record<string, Record<number, unknown>>;
    dump(exif: Record<string, unknown>): string;
    insert(exifBytes: string, binary: string): string;
    remove(binary: string): string;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
  };
  export default piexif;
}
```

**Code: `src/main/engines/image.ts`**
```ts
import fs from 'node:fs';
import heicDecode from 'heic-decode';
import sharp from 'sharp';
import type { FileInfo } from '@shared/types';
import { UserError } from '../errors';
import { runFfmpeg, runFfmpegToBuffer } from './ffmpeg';

export type RasterFmt = 'jpg' | 'png' | 'webp' | 'avif' | 'tiff';

/** Load any supported image as an auto-oriented sharp pipeline. Use `.clone()` to reuse it. */
export async function loadImage(file: Pick<FileInfo, 'path' | 'fmt'>, opts: { density?: number } = {}): Promise<sharp.Sharp> {
  try {
    if (file.fmt === 'heic') {
      const { width, height, data } = await heicDecode({ buffer: await fs.promises.readFile(file.path) });
      return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
    }
    if (file.fmt === 'bmp') {
      const png = await runFfmpegToBuffer(['-i', file.path, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
      return sharp(png);
    }
    if (file.fmt === 'svg') return sharp(file.path, { density: opts.density ?? 300 });
    return sharp(file.path, { failOn: 'none' }).rotate();   // rotate() = auto-orient from EXIF and drop the tag
  } catch (e) {
    throw new UserError("Kabooks couldn't read this image. It may be damaged.", (e as Error).message);
  }
}

/** Encode to a raster format. keepMetadata keeps EXIF/ICC (orientation is already applied). */
export async function saveRaster(img: sharp.Sharp, fmt: RasterFmt, out: string, quality: number, keepMetadata = true): Promise<void> {
  let s = keepMetadata ? img.withMetadata() : img;
  if (fmt === 'jpg') s = s.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
  else if (fmt === 'png') s = s.png({ compressionLevel: 9, adaptiveFiltering: true });
  else if (fmt === 'webp') s = s.webp({ quality, effort: 5 });
  else if (fmt === 'avif') s = s.avif({ quality: Math.round(quality * 0.65), effort: 4 });
  else s = s.tiff({ compression: 'lzw' });
  try {
    await s.toFile(out);
  } catch (e) {
    throw new UserError('This image could not be converted. It may be damaged or too large.', (e as Error).message);
  }
}

/** BMP via FFmpeg (sharp has no BMP encoder). */
export async function saveBmp(img: sharp.Sharp, out: string, scratchPng: string): Promise<void> {
  await img.flatten({ background: '#ffffff' }).png().toFile(scratchPng);
  await runFfmpeg(['-i', scratchPng, '-frames:v', '1', '-pix_fmt', 'bgr24', out]);
}

/** Display size after orientation (HEIC/BMP need a decode). */
export async function imageSize(file: Pick<FileInfo, 'path' | 'fmt'>): Promise<{ width: number; height: number }> {
  const { info } = await (await loadImage(file)).toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
}
```

**Code: `src/main/converters/image.ts`** (the svg/heic/pdf/docx cases are filled in by 6.2–6.4)
```ts
import { outputExt } from '@shared/formats';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import { loadImage, saveBmp, saveRaster } from '../engines/image';
import type { JobContext } from '../jobs/context';

export async function convertImage(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const quality = opts.quality ?? ctx.settings.imageQuality;
  const img = await loadImage(file);
  ctx.progress(0.2);
  switch (target) {
    case 'jpg': case 'png': case 'webp': case 'avif': case 'tiff':
      await saveRaster(img, target, ctx.newOutput({ source: file.path, ext: outputExt(target) }), quality);
      break;
    case 'bmp':
      await saveBmp(img, ctx.newOutput({ source: file.path, ext: 'bmp' }), ctx.tempPath('bmp-src.png'));
      break;
    default:
      throw new UserError(`Converting images to ${target.toUpperCase()} is not available yet.`);
  }
  ctx.progress(1);
}
```

**Edit `thumbnails.ts`:** in the `'image'` case, for HEIC and BMP use
`(await loadImage(f)).resize(256, 256, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer()`.
**Edit `inspect.ts`:** for HEIC and BMP images, set `width/height` from `imageSize(f)`.

**Fixtures (add to `FIXTURES` in `selftest/fixtures.ts`; import `sharp`):**
```ts
const TEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" x2="1">
<stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#2b6cff"/></linearGradient></defs>
<rect x="40" y="40" width="720" height="520" rx="60" fill="url(#g)"/><circle cx="400" cy="300" r="120" fill="#ffffff"/></svg>`;

// inside FIXTURES:
'image.svg': async (out) => { await fs.promises.writeFile(out, TEST_SVG, 'utf8'); },
'image.png': async (out) => { await sharp(Buffer.from(TEST_SVG), { density: 72 }).png().toFile(out); },            // 800x600, transparent corners
'photo.jpg': async (out) => {                                                                                     // 800x600 pixels + EXIF orientation 6
  await sharp(Buffer.from(TEST_SVG), { density: 72 }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 }).toFile(out);
},
'image.webp': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).webp().toFile(out); },
'image.tiff': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).tiff().toFile(out); },
'image.avif': async (out, dir) => { await sharp(await ensureFixture(dir, 'image.png')).avif().toFile(out); },
'image.bmp': async (out, dir) => { await runFfmpeg(['-i', await ensureFixture(dir, 'image.png'), '-pix_fmt', 'bgr24', out]); },
```

**Helper (add to `assert.ts`):**
```ts
import sharp from 'sharp';
export async function expectImage(file: string, format: string, dims?: { width: number; height: number }): Promise<void> {
  expectNonEmpty(file);
  const m = await sharp(file).metadata();
  check(m.format === format, `image format: expected ${format}, got ${m.format}`);
  if (dims) check(m.width === dims.width && m.height === dims.height, `size: expected ${dims.width}x${dims.height}, got ${m.width}x${m.height}`);
}
```
(sharp reports AVIF and HEIC as `format: 'heif'`.)

**Cases (`selftest/cases/image.ts`, group `image`; add to `cases/index.ts`):**
| name | fixture → target | check |
|---|---|---|
| `convert.image.png-jpg` | image.png → jpg | `expectImage(o[0],'jpeg',{width:800,height:600})` |
| `convert.image.png-webp` | → webp | `'webp'`, 800×600 |
| `convert.image.png-avif` | → avif | `'heif'` |
| `convert.image.png-tiff` | → tiff | `'tiff'` |
| `convert.image.png-bmp` | → bmp | `expectMagic(o[0],0,'BM')` |
| `convert.image.photo-orient` | photo.jpg → png | 600×800 (rotated) **and** `(await sharp(o[0]).metadata()).orientation` is `undefined` or `1` |
| `convert.image.svg-png` | image.svg → png | format png, width > 800 |
| `convert.image.bmp-png` | image.bmp → png | png 800×600 |
| `convert.image.tiff-webp` | image.tiff → webp | webp |
| `convert.image.avif-jpg` | image.avif → jpg | jpeg |

**Verify:** `npm run selftest -- --only=image` shows 0 failed.

---

## Task 6.2 — Image → SVG (trace or embed) + SVG card
**Files:** `src/main/engines/svg.ts`, update `converters/image.ts`, `panels/convert/SvgCard.tsx`, register the card in `panels/index.ts`
```ts
import fs from 'node:fs';
import ImageTracer from 'imagetracerjs';
import type sharp from 'sharp';

export async function embedAsSvg(img: sharp.Sharp, out: string): Promise<void> {
  const { data, info } = await img.png().toBuffer({ resolveWithObject: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}">`
    + `<image width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/></svg>`;
  await fs.promises.writeFile(out, svg, 'utf8');
}

/** Vectorize: downscale to ≤1000 px, quantize to `colors`, trace paths. */
export async function traceToSvg(img: sharp.Sharp, out: string, colors: number): Promise<void> {
  const { data, info } = await img.resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imgd = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
  let svg = ImageTracer.imagedataToSVG(imgd, {
    numberofcolors: colors, pathomit: 8, ltres: 1, qtres: 1, colorquantcycles: 3, strokewidth: 0,
    linefilter: true, roundcoords: 1, viewbox: true, desc: false
  });
  if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg ', `<svg width="${info.width}" height="${info.height}" `);
  await fs.promises.writeFile(out, svg, 'utf8');
}
```
**In `convertImage`** add:
```ts
case 'svg': {
  const out = ctx.newOutput({ source: file.path, ext: 'svg' });
  if ((opts.svgMode ?? 'trace') === 'embed') await embedAsSvg(img, out);
  else await traceToSvg(img, out, opts.svgColors ?? 16);
  break;
}
```

**Spec: `SvgCard.tsx`** (key `'image->svg'`, 420×440)
- Title "Convert to SVG".
- **Mode:** Segmented "Trace (vector)" / "Embed (exact)". Default Trace.
- **Colors:** Segmented 2 / 8 / 16 / 32. Shown only in Trace mode; default 16.
- Note under the controls:
  - Trace: "Turns shapes into vector paths — best for logos, icons and flat artwork."
  - Embed: "Wraps the exact pixels inside an SVG file. It will not become a vector."
- Apply "Convert" → `onApply({ svgMode, svgColors })`.

**Cases:**
- `convert.image.png-svg-trace`: the output text starts with `<svg` and contains `<path`.
- `convert.image.png-svg-embed` (request `options: { svgMode: 'embed' }`): contains `data:image/png;base64`.

---

## Task 6.3 — Image → HEIC (macOS: `sips`; Windows/Linux: `heif-enc` when present)
**Files:** `src/main/engines/heif.ts`, update `converters/image.ts`, fixtures, cases
```ts
import type sharp from 'sharp';
import { getHeicTool } from '../capabilities';
import { UserError } from '../errors';
import { runProcess } from './process';

/** Write `img` as HEIC. macOS uses Apple's built-in sips; Windows/Linux use heif-enc (x265). */
export async function encodeHeic(img: sharp.Sharp, out: string, quality: number, scratchPng: string, signal: AbortSignal): Promise<void> {
  const tool = getHeicTool();
  if (!tool) throw new UserError('HEIC output is not available on this computer (see the Formats page).');
  await img.png().toFile(scratchPng);
  await encodeHeicFile(scratchPng, out, quality, signal);
}

export async function encodeHeicFile(inputPng: string, out: string, quality: number, signal?: AbortSignal): Promise<void> {
  const tool = getHeicTool();
  if (!tool) throw new UserError('HEIC output is not available on this computer.');
  const q = String(Math.max(1, Math.min(100, Math.round(quality))));
  const args = tool.kind === 'sips'
    ? ['-s', 'format', 'heic', '-s', 'formatOptions', q, inputPng, '--out', out]
    : ['-q', q, '-o', out, inputPng];
  await runProcess(tool.path, args, { signal, name: tool.kind });
}
```
**In `convertImage`:**
```ts
case 'heic': {
  if (!ctx.caps.heifEnc) throw new UserError('HEIC output is not available on this computer (see the Formats page).');
  await encodeHeic(img, ctx.newOutput({ source: file.path, ext: 'heic' }), quality, ctx.tempPath('heic-src.png'), ctx.signal);
  break;
}
```
**Fixture:**
```ts
'image.heic': async (out, dir) => { await encodeHeicFile(await ensureFixture(dir, 'image.png'), out, 80); },
```
**Cases** (both with `skip: (c) => (c.heifEnc ? false : 'no HEIC encoder on this OS')`; they always run on macOS):
- `convert.image.png-heic`: `expectMagic(o[0], 4, 'ftyp')`.
- `convert.image.heic-jpg`: jpeg 800×600.

---

## Task 6.4 — Images → PDF and DOCX
**Files:** `src/main/engines/pdfOps.ts` (new; Phase 10 adds more), `src/main/engines/docxWriter.ts` (new), update `converters/image.ts`, the `assert.ts` helpers, cases

**Code: `pdfOps.ts` (first part)**
```ts
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { FileInfo } from '@shared/types';
import { throwIfAborted } from '../errors';
import { loadImage } from './image';

export type PageSizeOpt = 'fit' | 'a4' | 'letter';
export type MarginOpt = 'none' | 'small' | 'large';
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGINS: Record<MarginOpt, number> = { none: 0, small: 18, large: 36 };

export interface EmbeddableImage { kind: 'jpg' | 'png'; data: Buffer; width: number; height: number }

/** Original JPEG bytes when safe (no rotation, sRGB/grey); otherwise re-encode (PNG if transparent). */
export async function embeddableImage(file: FileInfo): Promise<EmbeddableImage> {
  if (file.fmt === 'jpg') {
    const m = await sharp(file.path).metadata();
    if ((m.orientation ?? 1) === 1 && (m.space === 'srgb' || m.space === 'b-w') && m.width && m.height) {
      return { kind: 'jpg', data: await fs.promises.readFile(file.path), width: m.width, height: m.height };
    }
  }
  const img = await loadImage(file);
  const opaque = (await img.clone().stats()).isOpaque;          // fully opaque → JPEG (smaller)
  const { data, info } = opaque
    ? await img.flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true })
    : await img.png().toBuffer({ resolveWithObject: true });
  return { kind: opaque ? 'jpg' : 'png', data, width: info.width, height: info.height };
}

export async function imagesToPdf(
  files: FileInfo[], o: { pageSize: PageSizeOpt; margin: MarginOpt }, out: string,
  onProgress: (f: number) => void, signal: AbortSignal
): Promise<void> {
  const pdf = await PDFDocument.create();
  const m = MARGINS[o.margin];
  for (let i = 0; i < files.length; i++) {
    throwIfAborted(signal);
    const img = await embeddableImage(files[i]);
    const emb = img.kind === 'jpg' ? await pdf.embedJpg(img.data) : await pdf.embedPng(img.data);
    let pw: number;
    let ph: number;
    if (o.pageSize === 'fit') {
      const k = Math.min(1, 1190 / Math.max(img.width * 0.75, img.height * 0.75));   // 96 DPI, capped near A3
      pw = img.width * 0.75 * k + 2 * m;
      ph = img.height * 0.75 * k + 2 * m;
    } else {
      const [a, b] = SIZES[o.pageSize];
      [pw, ph] = img.width > img.height ? [b, a] : [a, b];
    }
    const page = pdf.addPage([pw, ph]);
    const scale = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(emb, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    onProgress((i + 1) / files.length);
  }
  await fs.promises.writeFile(out, await pdf.save());
}
```

**Code: `docxWriter.ts` (first part)**
```ts
import { AlignmentType, Document, ImageRun, Packer, PageBreak, Paragraph } from 'docx';
import type { EmbeddableImage } from './pdfOps';

/** One image per page, scaled to fit 6.5 × 9 inches (624 × 864 px at 96 DPI). */
export async function imagesToDocx(images: EmbeddableImage[]): Promise<Buffer> {
  const children: Paragraph[] = [];
  images.forEach((img, i) => {
    const k = Math.min(1, 624 / img.width, 864 / img.height);
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type: img.kind, data: img.data, transformation: { width: Math.round(img.width * k), height: Math.round(img.height * k) } })]
    }));
    if (i < images.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
  });
  return Packer.toBuffer(new Document({ creator: 'Kabooks', sections: [{ children }] }));
}
```
> If your `docx` version rejects `type` in `ImageRun`, remove it and note the deviation.

**In `convertImage`:**
```ts
case 'pdf':
  await imagesToPdf([file], { pageSize: 'fit', margin: 'none' }, ctx.newOutput({ source: file.path, ext: 'pdf' }), (p) => ctx.progress(p), ctx.signal);
  break;
case 'docx':
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'docx' }), await imagesToDocx([await embeddableImage(file)]));
  break;
```

**Helpers (add to `assert.ts`):**
```ts
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
export async function expectPdfPages(file: string, pages: number | 'any'): Promise<number> {
  expectNonEmpty(file);
  const doc = await PDFDocument.load(fs.readFileSync(file));
  const n = doc.getPageCount();
  if (pages !== 'any') check(n === pages, `PDF pages: expected ${pages}, got ${n}`);
  return n;
}
export async function expectZipEntries(file: string, names: string[]): Promise<JSZip> {
  expectNonEmpty(file);
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  for (const n of names) check(zip.file(n) !== null, `zip ${file} has no entry ${n}`);
  return zip;
}
```
**Cases:**
- `convert.image.png-pdf`: `expectPdfPages(o[0], 1)`.
- `convert.image.photo-docx`: `expectZipEntries(o[0], ['word/document.xml'])`, and at least one file name starts with `word/media/`.

---

## Task 6.5 — Subtitles ↔ and TXT → SRT/VTT
**Files:**
- `src/main/converters/subtitle.ts`, `src/main/converters/text.ts` (SRT/VTT part)
- `panels/convert/CueTimingCard.tsx`
- register in `converters/index.ts` (`subtitle`, `text`) and `panels/index.ts` (`'text->srt'`, `'text->vtt'`)
- fixtures, `cases/text.ts`

**Code: `converters/subtitle.ts`**
```ts
import fs from 'node:fs';
import { parseSubtitles, toPlainText, toSrt, toVtt } from '@shared/subtitles';
import { decodeText } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import type { JobContext } from '../jobs/context';

export async function convertSubtitle(file: FileInfo, target: Fmt, _opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const cues = parseSubtitles(decodeText(await fs.promises.readFile(file.path)));
  if (cues.length === 0) throw new UserError(`No subtitles were found in ${file.name}.`);
  const out = ctx.newOutput({ source: file.path, ext: target });
  const text = target === 'srt' ? '﻿' + toSrt(cues) : target === 'vtt' ? toVtt(cues) : toPlainText(cues);
  await fs.promises.writeFile(out, text, 'utf8');
}
```

**Code: `converters/text.ts`** (first version; Task 6.6 adds PDF/JPG/PNG)
```ts
import fs from 'node:fs';
import { toSrt, toVtt, textToCues } from '@shared/subtitles';
import { decodeText } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../errors';
import type { JobContext } from '../jobs/context';

export async function readText(file: FileInfo): Promise<string> {
  return decodeText(await fs.promises.readFile(file.path));
}

export async function convertText(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  const text = await readText(file);
  if (target === 'srt' || target === 'vtt') {
    const cues = textToCues(text, { timing: opts.cueTiming ?? 'reading', secondsPerCue: opts.secondsPerCue ?? 3 });
    if (cues.length === 0) throw new UserError('This text file is empty.');
    const out = ctx.newOutput({ source: file.path, ext: target });
    await fs.promises.writeFile(out, target === 'srt' ? '﻿' + toSrt(cues) : toVtt(cues), 'utf8');
    return;
  }
  throw new UserError(`Converting text to ${target.toUpperCase()} is not available yet.`);
}
```

**Spec: `CueTimingCard.tsx`** (420×420)
- Title "Make subtitles".
- **Timing:** Segmented "Reading speed" / "Fixed".
- **Seconds per line:** Slider 1–10, step 0.5. Shown only when Fixed.
- Note: "One subtitle per line of text. Long lines are split and wrapped to two lines of up to 42 characters."
- Apply "Convert" → `{ cueTiming, secondsPerCue }`.

**Fixtures:**
```ts
'text.txt': async (out) => {
  await fs.promises.writeFile(out, [
    'Kabooks test document',
    'Xin chào thế giới — Tiếng Việt có dấu.',
    'The quick brown fox jumps over the lazy dog. '.repeat(4).trim(),
    '',
    'Last line.'
  ].join('\n'), 'utf8');
},
'subs.srt': async (out) => {
  await fs.promises.writeFile(out, '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> world\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond line\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nThird\r\n', 'utf8');
},
'subs.vtt': async (out) => {
  await fs.promises.writeFile(out, 'WEBVTT\n\nNOTE test file\n\n00:01.000 --> 00:02.500 align:start\nHello <v Bob>world</v>\n\nid2\n00:00:03.000 --> 00:00:04.000\nSecond line\n', 'utf8');
},
```
**Cases (group `text`):**
- `convert.sub.srt-vtt`: output starts with `WEBVTT` and contains `00:00:01.000 --> 00:00:02.500`.
- `convert.sub.srt-txt`: contains `Hello world` and no `<i>`.
- `convert.sub.vtt-srt`: contains `1\n00:00:01,000 --> 00:00:02,500`, ignoring the BOM; normalize `\r\n` before comparing.
- `convert.text.txt-srt`: `parseSubtitles(content).length >= 4`.
- `convert.text.txt-vtt`: starts with `WEBVTT`.

---

## Task 6.6 — Chromium print helper, engine pdf.js handlers, TXT → PDF/JPG/PNG, PDF inspection
**Files:**
- `src/main/engines/print.ts`, `src/renderer/src/engine/pdf.ts`, update `src/renderer/src/engine/main.ts`
- `src/main/engines/pdfEngine.ts`, `src/main/converters/pdf.ts` (helper `pdfToImages` only for now)
- update `converters/text.ts`, `inspect.ts`, `thumbnails.ts`, `ipc.ts` (`pdfThumbnails`)
- `panels/convert/TextRenderCard.tsx`, `src/shared/text.ts` (add `readerCss`)

**Code: `src/main/engines/print.ts`**
```ts
import { BrowserWindow, session, type Session } from 'electron';
import { blockNetwork } from '../security';

let printSession: Session | null = null;
function getPrintSession(): Session {
  if (!printSession) {
    printSession = session.fromPartition('kabooks-print');
    blockNetwork(printSession);
  }
  return printSession;
}

export interface PrintOptions {
  css?: string;                                                    // injected as USER stylesheet (wins with !important)
  pageSize?: 'A4' | 'Letter' | 'A5' | { width: number; height: number };   // object = inches
  zeroMargins?: boolean;
  landscape?: boolean;
}

/** Render a local HTML/XHTML file to PDF (JavaScript disabled, network blocked). */
export async function htmlFileToPdf(filePath: string, o: PrintOptions = {}): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false, width: 1000, height: 1400,
    webPreferences: { session: getPrintSession(), javascript: false, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  });
  try {
    await win.loadFile(filePath);
    if (o.css) await win.webContents.insertCSS(o.css, { cssOrigin: 'user' });
    await new Promise((r) => setTimeout(r, 200));       // let images/fonts settle
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: !o.pageSize,
      landscape: o.landscape ?? false,
      ...(o.pageSize ? { pageSize: o.pageSize } : {}),
      ...(o.zeroMargins ? { margins: { top: 0, bottom: 0, left: 0, right: 0 } } : {})
    });
  } finally {
    win.destroy();
  }
}
```

**Code: `src/renderer/src/engine/pdf.ts`**
```ts
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem, TextPage } from '@shared/pdfReflow';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
const docs = new Map<string, Doc>();
const asset = (sub: string): string => new URL(`./pdfjs/${sub}/`, window.location.href).toString();

async function open(p: { data: Uint8Array }): Promise<{ id: string; pages: number; sizes: Array<{ width: number; height: number }> }> {
  const params: Record<string, unknown> = {
    data: p.data, cMapUrl: asset('cmaps'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'), iccUrl: asset('iccs'), isEvalSupported: false, fontExtraProperties: true
  };
  const doc = await pdfjs.getDocument(params as never).promise;
  const id = crypto.randomUUID();
  docs.set(id, doc);
  const sizes: Array<{ width: number; height: number }> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v = page.getViewport({ scale: 1 });
    sizes.push({ width: v.width, height: v.height });
  }
  return { id, pages: doc.numPages, sizes };
}

function get(id: string): Doc {
  const d = docs.get(id);
  if (!d) throw new Error('PDF is not open');
  return d;
}

async function close(p: { id: string }): Promise<void> {
  const d = docs.get(p.id);
  docs.delete(p.id);
  await d?.destroy();
}

async function renderToCanvas(doc: Doc, pageIndex: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1);
  let s = scale;
  const v0 = page.getViewport({ scale: s });
  const MAX = 120_000_000;                                   // pixel cap (Chromium canvas limit is ~268 MP)
  if (v0.width * v0.height > MAX) s *= Math.sqrt(MAX / (v0.width * v0.height));
  const viewport = page.getViewport({ scale: s });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
  page.cleanup();
  return canvas;
}

async function renderPage(p: { id: string; pageIndex: number; dpi: number; mime: 'image/png' | 'image/jpeg'; quality?: number }): Promise<Uint8Array> {
  const canvas = await renderToCanvas(get(p.id), p.pageIndex, p.dpi / 72);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Canvas export failed'))), p.mime, p.quality ?? 0.92));
  canvas.width = 0;
  canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

async function thumbnails(p: { id: string; maxWidth: number; maxPages?: number }): Promise<string[]> {
  const doc = get(p.id);
  const out: string[] = [];
  const n = Math.min(doc.numPages, p.maxPages ?? 500);
  for (let i = 0; i < n; i++) {
    const page = await doc.getPage(i + 1);
    const w = page.getViewport({ scale: 1 }).width;
    page.cleanup();
    const c = await renderToCanvas(doc, i, p.maxWidth / w);
    out.push(c.toDataURL('image/jpeg', 0.75));
    c.width = 0;
    c.height = 0;
  }
  return out;
}

async function extractText(p: { id: string }): Promise<TextPage[]> {
  const doc = get(p.id);
  const pages: TextPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    await page.getOperatorList();                 // loads fonts so real font names are known
    const tc = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of tc.items) {
      if (!('str' in raw)) continue;
      const tx = pdfjs.Util.transform(vp.transform, raw.transform);
      const fontSize = Math.hypot(tx[2], tx[3]);
      let fontName = '';
      try { fontName = String((page.commonObjs.get(raw.fontName) as { name?: string } | undefined)?.name ?? ''); } catch { fontName = ''; }
      if (!fontName) fontName = tc.styles[raw.fontName]?.fontFamily ?? '';
      items.push({
        str: raw.str, x: tx[4], y: tx[5], w: raw.width, h: raw.height || fontSize, fontSize,
        bold: /bold|black|heavy|semibold|demi/i.test(fontName), italic: /italic|oblique/i.test(fontName)
      });
    }
    pages.push({ width: vp.width, height: vp.height, items });
    page.cleanup();
  }
  return pages;
}

export const PDF_HANDLERS = {
  'pdf.open': open, 'pdf.close': close, 'pdf.renderPage': renderPage, 'pdf.thumbnails': thumbnails, 'pdf.extractText': extractText
};
```
> `TextItem`/`TextPage` come from `src/shared/pdfReflow.ts`. Create that file now with **only** these two interfaces. Task 6.8 adds the rest:
> ```ts
> export interface TextItem { str: string; x: number; y: number; w: number; h: number; fontSize: number; bold: boolean; italic: boolean }
> export interface TextPage { width: number; height: number; items: TextItem[] }
> ```

**Edit `engine/main.ts`:** add `import { PDF_HANDLERS } from './pdf';` and change the `handlers` initialiser to `{ ping: async () => 'pong', ...PDF_HANDLERS }`. Do not use `registerHandlers` from `pdf.ts` because that creates a circular import.

**Code: `src/main/engines/pdfEngine.ts`**
```ts
import fs from 'node:fs';
import type { TextPage } from '@shared/pdfReflow';
import { UserError } from '../errors';
import { callEngine } from '../windows/engineWindow';

export interface PdfDocHandle { id: string; pages: number; sizes: Array<{ width: number; height: number }> }

export async function pdfOpen(filePath: string): Promise<PdfDocHandle> {
  const data = new Uint8Array(await fs.promises.readFile(filePath));
  try {
    return await callEngine<PdfDocHandle>('pdf.open', { data });
  } catch (e) {
    const msg = (e as Error).message;
    if (/password/i.test(msg)) throw new UserError('This PDF is password-protected. Remove the password first, then try again.');
    throw new UserError('This PDF could not be opened. It may be damaged.', msg);
  }
}

export async function pdfClose(id: string): Promise<void> {
  await callEngine('pdf.close', { id }).catch(() => undefined);
}

export async function withPdf<T>(filePath: string, fn: (doc: PdfDocHandle) => Promise<T>): Promise<T> {
  const doc = await pdfOpen(filePath);
  try { return await fn(doc); } finally { await pdfClose(doc.id); }
}

export async function pdfRenderPage(id: string, pageIndex: number, o: { dpi: number; mime: 'image/png' | 'image/jpeg'; quality?: number }): Promise<Buffer> {
  const u8 = await callEngine<Uint8Array>('pdf.renderPage', { id, pageIndex, ...o });
  return Buffer.from(u8);
}

export const pdfThumbs = (id: string, maxWidth: number, maxPages?: number): Promise<string[]> =>
  callEngine<string[]>('pdf.thumbnails', { id, maxWidth, maxPages }, 600_000);

export const pdfExtractText = (id: string): Promise<TextPage[]> => callEngine<TextPage[]>('pdf.extractText', { id }, 600_000);
```

**Code: `converters/pdf.ts`** (helper only in this task)
```ts
import fs from 'node:fs';
import type { FileInfo } from '@shared/types';
import { throwIfAborted } from '../errors';
import { pdfRenderPage, withPdf } from '../engines/pdfEngine';
import type { JobContext } from '../jobs/context';

/** Render pages of `pdfPath` to images. `source` decides output naming. One page → single file; more → "<base>-pages/" folder. */
export async function pdfToImages(
  pdfPath: string, source: string, fmt: 'jpg' | 'png', dpi: number, quality: number, ctx: JobContext, pageIndexes?: number[]
): Promise<void> {
  await withPdf(pdfPath, async (doc) => {
    const pages = pageIndexes ?? Array.from({ length: doc.pages }, (_, i) => i);
    for (let k = 0; k < pages.length; k++) {
      throwIfAborted(ctx.signal);
      const buf = await pdfRenderPage(doc.id, pages[k], { dpi, mime: fmt === 'png' ? 'image/png' : 'image/jpeg', quality });
      const out = pages.length === 1
        ? ctx.newOutput({ source, ext: fmt })
        : ctx.newOutput({ source, ext: fmt, group: 'pages', index: pages[k] + 1, total: doc.pages });
      await fs.promises.writeFile(out, buf);
      ctx.progress((k + 1) / pages.length);
    }
  });
}
```

**Add `readerCss` to `src/shared/text.ts`** (also used in Task 6.11):
```ts
export function readerCss(o: { textSize?: 'small' | 'medium' | 'large' | 'xlarge'; font?: TextFont; pageSize?: 'a4' | 'letter' | 'a5' }): string {
  const pt = { small: 10.5, medium: 12, large: 14, xlarge: 16 }[o.textSize ?? 'medium'];
  const fam = o.font && o.font !== 'original' ? `font-family: ${fontStack(o.font)} !important;` : '';
  return `@page { size: ${cssPageSize(o.pageSize ?? 'a4')}; margin: 18mm 16mm; }
html { font-size: ${pt}pt !important; }
body { margin: 0 !important; padding: 0 !important; line-height: 1.5 !important; ${fam} }
p, li, blockquote, dd, div { font-size: 1rem !important; ${fam} }
img, svg, video { max-width: 100% !important; height: auto !important; break-inside: avoid; }
h1, h2, h3 { break-after: avoid; }`;
}
```

**Extend `converters/text.ts`:**
```ts
async function textToPdfFile(file: FileInfo, opts: ConvertOptions, ctx: JobContext): Promise<string> {
  const html = textToHtml(await readText(file), {
    title: file.name,
    font: opts.font && opts.font !== 'original' ? opts.font : 'mono',
    sizePt: TEXT_SIZE_PT[opts.textSize ?? 'medium'],
    pageSize: opts.pageSize ?? 'a4'
  });
  const htmlPath = ctx.tempPath('text.html');
  await fs.promises.writeFile(htmlPath, html, 'utf8');
  const pdfPath = ctx.tempPath('text.pdf');
  await fs.promises.writeFile(pdfPath, await htmlFileToPdf(htmlPath));
  return pdfPath;
}
// in convertText():
if (target === 'pdf') { await fs.promises.copyFile(await textToPdfFile(file, opts, ctx), ctx.newOutput({ source: file.path, ext: 'pdf' })); return; }
if (target === 'jpg' || target === 'png') {
  const pdf = await textToPdfFile(file, opts, ctx);
  await pdfToImages(pdf, file.path, target, opts.imageDpi ?? 150, 0.9, ctx);
  return;
}
```

**Spec: `TextRenderCard.tsx`** (keys `'text->pdf'`, `'text->jpg'`, `'text->png'`; 420×500)
- Title `Text to <TARGET>`.
- **Font:** Segmented Mono / Sans / Serif (default Mono).
- **Size:** Segmented S / M / L / XL (default M).
- **Page:** Select A4 / Letter / A5.
- For JPG/PNG only, **Resolution:** Segmented 96 / 150 / 300 DPI (default 150).
- Apply "Convert" → `{ font, textSize, pageSize, imageDpi }`.

**Edit `inspect.ts`:**
```ts
} else if (out.category === 'pdf') {
  await withPdf(out.path, async (doc) => {
    out.pages = doc.pages;
    out.width = doc.sizes[0]?.width;
    out.height = doc.sizes[0]?.height;
    out.thumbnail = (await pdfThumbs(doc.id, 256, 1))[0];
  });
}
```
Skip `makeThumbnail` when `out.thumbnail` is already set.

**Edit `ipc.ts`:**
```ts
ipcMain.handle(IPC.pdfThumbnails, (_e, p: unknown, w: unknown) => withPdf(existingPath(p), (doc) => pdfThumbs(doc.id, Number(w) || 160)));
```

**Fixture `doc.pdf`** (pdf-lib; 3 pages, metadata title "Kabooks Test"):
```ts
'doc.pdf': async (out, dir) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Kabooks Test');
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const jpg = await pdf.embedJpg(await sharp(await ensureFixture(dir, 'image.png')).flatten({ background: '#fff' }).jpeg().toBuffer());
  const para = 'Kabooks converts files offline. This paragraph is long enough to wrap across several lines so that the reflow logic has something to join back together into one paragraph.';
  for (let p = 1; p <= 3; p++) {
    const page = pdf.addPage([612, 792]);
    page.drawText(p === 1 ? 'Kabooks Test Document' : `Chapter ${p}`, { x: 72, y: 700, size: 24, font: bold });
    const words = para.split(' ');
    let line = '';
    let y = 660;
    for (const w of words) {
      if (reg.widthOfTextAtSize(`${line} ${w}`, 12) > 460) { page.drawText(line.trim(), { x: 72, y, size: 12, font: reg }); y -= 16; line = ''; }
      line += ` ${w}`;
    }
    page.drawText(line.trim(), { x: 72, y, size: 12, font: reg });
    if (p === 2) page.drawImage(jpg, { x: 72, y: 300, width: 240, height: 180 });
    if (p === 3) ['• First item', '• Second item'].forEach((t, i) => page.drawText(t, { x: 72, y: 520 - i * 18, size: 12, font: reg }));
    page.drawText(String(p), { x: 300, y: 30, size: 10, font: reg });
  }
  await fs.promises.writeFile(out, await pdf.save());
},
```

**Cases (`cases/text.ts` and `cases/pdf.ts`):**
- `convert.text.txt-pdf`: `expectPdfPages(o[0], 'any') >= 1`.
- `convert.text.txt-png`: 1 output, PNG.
- `convert.text.txt-jpg`: 1 output, JPEG.

**Verify:** `npm run selftest -- --only=text`. Also open the dev app, drop `doc.pdf`, and the wheel hub shows the page-1 thumbnail.

---

## Task 6.7 — PDF → JPG / PNG
**Files:** extend `converters/pdf.ts` with `convertPdf`, register `pdf: convertPdf` in `converters/index.ts`, `cases/pdf.ts`
```ts
export async function convertPdf(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  switch (target) {
    case 'jpg':
    case 'png':
      return pdfToImages(file.path, file.path, target, ctx.settings.pdfDpi, 0.9, ctx);
    default:
      throw new UserError(`Converting PDF to ${target.toUpperCase()} is not available yet.`);
  }
}
```
**Cases:**
- `convert.pdf.doc-png`: 3 outputs. The first image's width is 2550 ±2 (612 pt at 300 DPI). All outputs are in one folder ending in `-pages`.
- `convert.pdf.doc-jpg`: 3 JPEG outputs.

---

## Task 6.8 — PDF text reflow (pure) + PDF → TXT
**Files:** `src/shared/pdfReflow.ts` (complete it), `src/shared/pdfReflow.test.ts`, extend `converters/pdf.ts`
```ts
export interface TextItem { str: string; x: number; y: number; w: number; h: number; fontSize: number; bold: boolean; italic: boolean }
export interface TextPage { width: number; height: number; items: TextItem[] }
export interface Run { text: string; bold: boolean; italic: boolean }
export type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'li'; runs: Run[] }
  | { type: 'pagebreak' };

export interface Line { y: number; x: number; right: number; fontSize: number; runs: Run[]; text: string; bold: boolean }

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const runsText = (runs: Run[]): string => runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();

export function totalChars(pages: TextPage[]): number {
  return pages.reduce((n, p) => n + p.items.reduce((k, i) => k + i.str.trim().length, 0), 0);
}

/** A PDF with almost no text per page is probably scanned images. */
export function isScanned(pages: TextPage[]): boolean {
  return pages.length > 0 && totalChars(pages) < 25 * pages.length;
}

export function groupLines(page: TextPage): Line[] {
  const items = page.items.filter((i) => i.str.length > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextItem[][] = [];
  let rowY = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.y - rowY) <= Math.max(1.5, it.fontSize * 0.5)) row.push(it);
    else { rows.push([it]); rowY = it.y; }
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const runs: Run[] = [];
    let text = '';
    let prevRight: number | null = null;
    for (const it of row) {
      let s = it.str;
      if (prevRight !== null && it.x - prevRight > it.fontSize * 0.2 && !text.endsWith(' ') && !s.startsWith(' ')) s = ` ${s}`;
      text += s;
      prevRight = it.x + it.w;
      const last = runs[runs.length - 1];
      if (last && last.bold === it.bold && last.italic === it.italic) last.text += s;
      else runs.push({ text: s, bold: it.bold, italic: it.italic });
    }
    return {
      y: row[0].y, x: row[0].x, right: prevRight ?? row[0].x, fontSize: median(row.map((i) => i.fontSize)),
      runs, text: text.replace(/\s+/g, ' ').trim(), bold: runs.every((r) => r.bold || r.text.trim() === '')
    };
  }).filter((l) => l.text.length > 0);
}

const EDGE = 0.08;
const PAGE_NO = /^\s*(page\s*)?\d+(\s*(of|\/)\s*\d+)?\s*$/i;

/** Drop page numbers and lines repeated in the top/bottom 8% of most pages (headers/footers). */
export function removeRepeatedEdges(pages: Line[][], heights: number[]): Line[][] {
  const isEdge = (l: Line, h: number): boolean => l.y < h * EDGE || l.y > h * (1 - EDGE);
  const key = (l: Line): string => l.text.replace(/\d+/g, '#').toLowerCase();
  const counts = new Map<string, number>();
  pages.forEach((lines, p) => {
    const seen = new Set<string>();
    for (const l of lines) {
      if (!isEdge(l, heights[p])) continue;
      const k = key(l);
      if (!seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) ?? 0) + 1); }
    }
  });
  const threshold = Math.max(2, Math.ceil(pages.length * 0.5));
  return pages.map((lines, p) => lines.filter((l) => {
    if (!isEdge(l, heights[p])) return true;
    if (PAGE_NO.test(l.text)) return false;
    return (counts.get(key(l)) ?? 0) < threshold;
  }));
}

function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const s = Math.round(l.fontSize * 2) / 2;
    weight.set(s, (weight.get(s) ?? 0) + l.text.length);
  }
  let best = 12;
  let bestW = -1;
  for (const [s, w] of weight) if (w > bestW) { best = s; bestW = w; }
  return best;
}

const BULLET = /^(?:[•◦▪‣∙●○■□–-]|\*|\d{1,3}[.)]|[a-z][.)])\s+/i;
const ENDS_SENTENCE = /[.!?:]["”')]?$/;

export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic) last.text += r.text;
    else out.push({ ...r });
  }
  return out.map((r) => ({ ...r, text: r.text.replace(/\s+/g, ' ') })).filter((r) => r.text.length > 0);
}

/** Turn positioned text into headings / paragraphs / list items. */
export function reflowPages(pages: TextPage[], opts: { pageBreaks?: boolean } = {}): Block[] {
  const cleaned = removeRepeatedEdges(pages.map(groupLines), pages.map((p) => p.height));
  const all = cleaned.flat();
  if (all.length === 0) return [];
  const body = bodySize(all);
  const blocks: Block[] = [];
  let cur: { type: 'p' | 'li'; runs: Run[]; last: Line } | null = null;
  const flush = (): void => {
    if (cur) blocks.push({ type: cur.type, runs: mergeRuns(cur.runs) });
    cur = null;
  };

  cleaned.forEach((lines, pi) => {
    if (opts.pageBreaks && pi > 0) { flush(); blocks.push({ type: 'pagebreak' }); }
    const gaps: number[] = [];
    for (let i = 1; i < lines.length; i++) { const g = lines[i].y - lines[i - 1].y; if (g > 0) gaps.push(g); }
    const normalGap = median(gaps) || body * 1.3;
    const pageRight = Math.max(0, ...lines.map((l) => l.right));

    lines.forEach((line, li) => {
      const ratio = line.fontSize / body;
      const short = line.text.length < 160;
      const level: 'h1' | 'h2' | 'h3' | null = !short ? null
        : ratio >= 1.8 ? 'h1'
        : ratio >= 1.4 ? 'h2'
        : ratio >= 1.15 || (line.bold && line.text.length < 90 && !/[.,;:]$/.test(line.text)) ? 'h3'
        : null;
      if (level) {
        flush();
        const prevBlock = blocks[blocks.length - 1];
        const continues = li > 0 && prevBlock && prevBlock.type === level && line.y - lines[li - 1].y <= normalGap * 1.6;
        if (continues && prevBlock && prevBlock.type !== 'pagebreak') prevBlock.runs.push({ text: ' ', bold: false, italic: false }, ...line.runs);
        else blocks.push({ type: level, runs: [...line.runs] });
        return;
      }
      const bullet = BULLET.exec(line.text);
      const prev = li > 0 ? lines[li - 1] : null;
      const active = cur as { type: 'p' | 'li'; runs: Run[]; last: Line } | null;
      const bigGap = prev ? line.y - prev.y > normalGap * 1.45 : active ? ENDS_SENTENCE.test(active.last.text) : true;
      const prevEnded = active !== null && ENDS_SENTENCE.test(active.last.text) && active.last.right < pageRight * 0.85;
      if (!active || bigGap || bullet || prevEnded) {
        flush();
        const runs = bullet ? line.runs.map((r, i) => (i === 0 ? { ...r, text: r.text.trimStart().replace(BULLET, '') } : r)) : [...line.runs];
        cur = { type: bullet ? 'li' : 'p', runs, last: line };
      } else {
        const lastRun = active.runs[active.runs.length - 1];
        if (lastRun && /\p{L}-$/u.test(lastRun.text) && /^\p{Ll}/u.test(line.text)) lastRun.text = lastRun.text.slice(0, -1);
        else active.runs.push({ text: ' ', bold: false, italic: false });
        active.runs.push(...line.runs);
        active.last = line;
      }
    });
  });
  flush();
  return blocks;
}

export function blocksToText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.type !== 'pagebreak')
    .map((b) => (b.type === 'pagebreak' ? '' : b.type === 'li' ? `• ${runsText(b.runs)}` : runsText(b.runs)))
    .join('\n\n') + '\n';
}

/** Plain text (e.g. OCR output) → paragraph blocks. */
export function textToBlocks(text: string): Block[] {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
    .map((t) => ({ type: 'p' as const, runs: [{ text: t, bold: false, italic: false }] }));
}
```

**Tests (`pdfReflow.test.ts`).** Build pages with a helper `item(str, x, y, size, bold?)`. Page height is 800.
1. Page 1: a title at y=80 (size 24, bold); body lines at y=120 and 135 (size 12); a line at y=180 ending with "."; a bullet "• item one" at y=220; "1" at y=780. Expect blocks `h1, p, p, li`, and no block whose text is "1".
2. Three pages, each with "Confidential" at y=790 and some body text → no block contains "Confidential".
3. Hyphenation: "infor-" at y=100 and "mation continues" at y=114 → one paragraph containing "information continues".
4. `isScanned([{width:600,height:800,items:[]}])` → true.

**Extend `converters/pdf.ts`:**
```ts
async function pdfToBlocks(file: FileInfo, opts: ConvertOptions, ctx: JobContext): Promise<Block[]> {
  const pages = await withPdf(file.path, (doc) => pdfExtractText(doc.id));
  if (isScanned(pages)) {
    if (opts.ocr === 'off') throw new UserError('This PDF has no text layer (it looks scanned). Turn on OCR to extract the text.');
    return ocrPdfToBlocks(file.path, ctx);       // Task 6.12. Until then: throw new UserError('OCR is not available yet.')
  }
  return reflowPages(pages);
}
// in convertPdf switch:
case 'txt': {
  const blocks = await pdfToBlocks(file, opts, ctx);
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'txt' }), blocksToText(blocks), 'utf8');
  return;
}
```
**Case:** `convert.pdf.doc-txt`: the text contains "Kabooks Test Document" and "First item", and does **not** contain a line that is only "2".

---

## Task 6.9 — PDF → DOCX (Editable / Exact look) + DocMode card
**Files:** extend `engines/docxWriter.ts`, `converters/pdf.ts`, `panels/convert/DocModeCard.tsx`, register keys `'pdf->docx'` and `'pdf->epub'`
```ts
// docxWriter.ts additions
import { HeadingLevel, TextRun } from 'docx';
import type { Block } from '@shared/pdfReflow';

export async function blocksToDocx(blocks: Block[], title: string): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (const b of blocks) {
    if (b.type === 'pagebreak') { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    const runs = b.runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic }));
    if (b.type === 'h1') children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs }));
    else if (b.type === 'h2') children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs }));
    else if (b.type === 'h3') children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs }));
    else if (b.type === 'li') children.push(new Paragraph({ bullet: { level: 0 }, children: runs }));
    else children.push(new Paragraph({ children: runs, spacing: { after: 160 } }));
  }
  return Packer.toBuffer(new Document({ creator: 'Kabooks', title, sections: [{ children }] }));
}

/** "Exact look": each PDF page becomes a full-page picture in its own section. */
export async function pageImagesToDocx(pages: Array<{ jpeg: Buffer; widthPt: number; heightPt: number }>): Promise<Buffer> {
  const sections = pages.map((p) => ({
    properties: { page: {
      size: { width: Math.round(p.widthPt * 20), height: Math.round(p.heightPt * 20) },          // twips
      margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 }
    } },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({ type: 'jpg', data: p.jpeg, transformation: {
        width: Math.round(((p.widthPt * 96) / 72) * 0.98), height: Math.round(((p.heightPt * 96) / 72) * 0.98)
      } })]
    })]
  }));
  return Packer.toBuffer(new Document({ creator: 'Kabooks', sections }));
}
```
**In `convertPdf`:**
```ts
case 'docx': {
  const out = ctx.newOutput({ source: file.path, ext: 'docx' });
  if ((opts.docMode ?? 'reflow') === 'pages') {
    const pages = await withPdf(file.path, async (doc) => {
      const list: Array<{ jpeg: Buffer; widthPt: number; heightPt: number }> = [];
      for (let i = 0; i < doc.pages; i++) {
        throwIfAborted(ctx.signal);
        list.push({ jpeg: await pdfRenderPage(doc.id, i, { dpi: 200, mime: 'image/jpeg', quality: 0.85 }), widthPt: doc.sizes[i].width, heightPt: doc.sizes[i].height });
        ctx.progress((i + 1) / doc.pages);
      }
      return list;
    });
    await fs.promises.writeFile(out, await pageImagesToDocx(pages));
  } else {
    await fs.promises.writeFile(out, await blocksToDocx(await pdfToBlocks(file, opts, ctx), file.base));
  }
  return;
}
```
**Spec: `DocModeCard.tsx`** (keys `'pdf->docx'`, `'pdf->epub'`; 440×460)
- Title: "Export to Word" (docx) or "Make an EPUB" (epub).
- **Layout:** Segmented. Labels for docx: "Editable text" / "Exact look". Labels for epub: "Adjustable text" / "Preserved pages". Values `'reflow'` / `'pages'`.
- Explanatory note:
  - reflow: "Text flows like a normal document. Headings, bold, italics and lists are kept; complex layouts may shift."
  - pages: "Each page becomes a picture — looks identical, but the text can't be edited."
- **OCR for scanned PDFs:** Toggle, default on (`'auto'`); off = `'off'`. Shown only for reflow.
- Apply "Convert".

**Cases:**
- `convert.pdf.doc-docx`: `word/document.xml` contains "Kabooks Test Document" and the heading style `Heading1`.
- `convert.pdf.doc-docx-pages` (`options: { docMode: 'pages' }`): 3 images under `word/media/`.

---

## Task 6.10 — EPUB writer + PDF → EPUB
**Files:** `src/main/engines/epubWriter.ts`, extend `shared/pdfReflow.ts` (`blocksToXhtml`, `splitChapters`), extend `converters/pdf.ts`, tests
**Templates:** use **Appendix B** verbatim.
```ts
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { escapeXml } from '@shared/text';
import { CONTAINER_XML, chapterXhtml, fixedPageXhtml, navXhtml, opfXml, STYLE_CSS } from './epubTemplates';

export interface EpubMeta { title: string; author?: string; lang: string }

async function pack(files: Array<{ path: string; data: string | Buffer }>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });   // MUST be first and uncompressed
  zip.file('META-INF/container.xml', CONTAINER_XML);
  for (const f of files) zip.file(f.path, f.data);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function buildReflowEpub(meta: EpubMeta, chapters: Array<{ title: string; bodyXhtml: string }>): Promise<Buffer> {
  const items = chapters.map((c, i) => ({ id: `c${String(i + 1).padStart(3, '0')}`, href: `c${String(i + 1).padStart(3, '0')}.xhtml`, title: c.title, body: c.bodyXhtml }));
  return pack([
    { path: 'OEBPS/style.css', data: STYLE_CSS },
    { path: 'OEBPS/nav.xhtml', data: navXhtml(meta.title, items) },
    ...items.map((it) => ({ path: `OEBPS/${it.href}`, data: chapterXhtml(it.title, it.body, meta.lang) })),
    { path: 'OEBPS/content.opf', data: opfXml({ ...meta, id: randomUUID(), fixed: false, items: items.map((i) => ({ id: i.id, href: i.href, type: 'application/xhtml+xml' })), images: [] }) }
  ]);
}

export async function buildFixedEpub(meta: EpubMeta, pages: Array<{ jpeg: Buffer; width: number; height: number }>): Promise<Buffer> {
  const items = pages.map((p, i) => {
    const n = String(i + 1).padStart(3, '0');
    return { id: `p${n}`, href: `p${n}.xhtml`, img: `images/p${n}.jpg`, title: `Page ${i + 1}`, ...p };
  });
  return pack([
    { path: 'OEBPS/nav.xhtml', data: navXhtml(meta.title, items) },
    ...items.map((it) => ({ path: `OEBPS/${it.img}`, data: it.jpeg })),
    ...items.map((it) => ({ path: `OEBPS/${it.href}`, data: fixedPageXhtml(it.title, it.img, it.width, it.height) })),
    { path: 'OEBPS/content.opf', data: opfXml({
      ...meta, id: randomUUID(), fixed: true,
      items: items.map((i) => ({ id: i.id, href: i.href, type: 'application/xhtml+xml' })),
      images: items.map((i) => ({ id: `${i.id}-img`, href: i.img, type: 'image/jpeg' }))
    }) }
  ]);
}

export { escapeXml };
```
Put the template functions from Appendix B in `src/main/engines/epubTemplates.ts`.

**Add to `shared/pdfReflow.ts`** (import `escapeXml` from `./text`):
```ts
export function blocksToXhtml(blocks: Block[]): string {
  const out: string[] = [];
  let inList = false;
  for (const b of blocks) {
    if (b.type === 'pagebreak') continue;
    if (b.type === 'li' && !inList) { out.push('<ul>'); inList = true; }
    if (b.type !== 'li' && inList) { out.push('</ul>'); inList = false; }
    const inner = b.runs.map((r) => {
      let t = escapeXml(r.text);
      if (r.italic) t = `<em>${t}</em>`;
      if (r.bold) t = `<strong>${t}</strong>`;
      return t;
    }).join('');
    out.push(`<${b.type}>${inner}</${b.type}>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

/** New chapter at every h1; very long chapters are cut every 300 blocks. */
export function splitChapters(blocks: Block[], fallbackTitle: string): Array<{ title: string; blocks: Block[] }> {
  const chapters: Array<{ title: string; blocks: Block[] }> = [];
  for (const b of blocks) {
    const cur = chapters[chapters.length - 1];
    if (!cur || b.type === 'h1' || cur.blocks.length >= 300) {
      chapters.push({ title: b.type === 'h1' ? runsText(b.runs) : cur ? `${cur.title} (cont.)` : fallbackTitle, blocks: [] });
    }
    chapters[chapters.length - 1].blocks.push(b);
  }
  return chapters;
}
```
**Tests:** `blocksToXhtml` wraps consecutive `li` in one `<ul>` and escapes `<` and `&`. `splitChapters` with two `h1` produces 2 chapters.

**In `convertPdf`:**
```ts
case 'epub': {
  const out = ctx.newOutput({ source: file.path, ext: 'epub' });
  const meta = { title: file.base, lang: 'en' };
  if ((opts.docMode ?? 'reflow') === 'pages') {
    const pages = await withPdf(file.path, async (doc) => {
      const list: Array<{ jpeg: Buffer; width: number; height: number }> = [];
      for (let i = 0; i < doc.pages; i++) {
        throwIfAborted(ctx.signal);
        const jpeg = await pdfRenderPage(doc.id, i, { dpi: 150, mime: 'image/jpeg', quality: 0.85 });
        list.push({ jpeg, width: Math.round((doc.sizes[i].width * 150) / 72), height: Math.round((doc.sizes[i].height * 150) / 72) });
        ctx.progress((i + 1) / doc.pages);
      }
      return list;
    });
    await fs.promises.writeFile(out, await buildFixedEpub(meta, pages));
  } else {
    const blocks = await pdfToBlocks(file, opts, ctx);
    meta.lang = guessLang(blocksToText(blocks));
    const chapters = splitChapters(blocks, file.base).map((c) => ({ title: c.title, bodyXhtml: blocksToXhtml(c.blocks) }));
    await fs.promises.writeFile(out, await buildReflowEpub(meta, chapters));
  }
  return;
}
```
**Cases:**
- `convert.pdf.doc-epub`: `expectMagic(o[0], 30, 'mimetype')`, and the zip has `OEBPS/content.opf` and `OEBPS/nav.xhtml`.
- `convert.pdf.doc-epub-pages` (`docMode:'pages'`): content.opf contains `pre-paginated`, and there are 3 `.jpg` entries.

---

## Task 6.11 — EPUB reader + EPUB → PDF + EPUB card + EPUB thumbnail
**Files:** `src/main/engines/epubReader.ts`, `src/main/converters/epub.ts`, `panels/convert/EpubToPdfCard.tsx`, register `epub` converter and `'epub->pdf'` card, update `inspect.ts`/`thumbnails.ts` (cover), fixtures, cases

**Code: `epubReader.ts`.** XML results are untyped. The local `Xml` alias is the **only** allowed use of `any` in the project.
```ts
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { UserError } from '../errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Xml = any;

export interface EpubBook { root: string; title: string; spine: string[]; fixedLayout: boolean; coverPath?: string }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
const arr = (v: Xml): Xml[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const textOf = (v: Xml): string => (typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String(v['#text']) : '');
const cleanHref = (h: string): string => decodeURIComponent(String(h).split('#')[0]);

interface Package { opfDir: string; title: string; spineHrefs: string[]; fixedLayout: boolean; coverHref?: string }

function parsePackage(containerXml: string, readOpf: (rel: string) => string): Package {
  const rootfile = arr(parser.parse(containerXml)?.container?.rootfiles?.rootfile)[0];
  const opfRel: string | undefined = rootfile?.['@_full-path'];
  if (!opfRel) throw new UserError('This EPUB is missing its package file.');
  const opf = parser.parse(readOpf(opfRel))?.package;
  const manifest = new Map<string, { href: string; props: string }>();
  for (const it of arr(opf?.manifest?.item)) manifest.set(it['@_id'], { href: cleanHref(it['@_href']), props: it['@_properties'] ?? '' });
  const spineHrefs = arr(opf?.spine?.itemref).map((r: Xml) => manifest.get(r['@_idref'])?.href).filter((h: string | undefined): h is string => !!h);
  const metas = arr(opf?.metadata?.meta);
  const fixedLayout = metas.some((m: Xml) => m['@_property'] === 'rendition:layout' && textOf(m).trim() === 'pre-paginated');
  const title = textOf(arr(opf?.metadata?.title)[0]).trim();
  const coverId = metas.find((m: Xml) => m['@_name'] === 'cover')?.['@_content'];
  const cover = [...manifest.values()].find((m) => m.props.includes('cover-image')) ?? (coverId ? manifest.get(coverId) : undefined);
  return { opfDir: path.posix.dirname(opfRel), title, spineHrefs, fixedLayout, coverHref: cover?.href };
}

/** Extract to destDir (zip-slip safe) and describe the book. */
export async function extractEpub(epubPath: string, destDir: string): Promise<EpubBook> {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(epubPath));
  const root = path.resolve(destDir);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const target = path.resolve(root, entry.name);
    if (!target.startsWith(root + path.sep)) continue;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, await entry.async('nodebuffer'));
  }
  const containerPath = path.join(root, 'META-INF', 'container.xml');
  if (!fs.existsSync(containerPath)) throw new UserError('This file is not a valid EPUB.');
  const pkg = parsePackage(fs.readFileSync(containerPath, 'utf8'), (rel) => fs.readFileSync(path.resolve(root, rel), 'utf8'));
  const abs = (href: string): string => path.resolve(root, pkg.opfDir, href);
  return {
    root, title: pkg.title || path.basename(epubPath, path.extname(epubPath)),
    spine: pkg.spineHrefs.map(abs).filter((p) => fs.existsSync(p)),
    fixedLayout: pkg.fixedLayout, coverPath: pkg.coverHref ? abs(pkg.coverHref) : undefined
  };
}

/** Cover image bytes without extracting the whole book (for thumbnails). */
export async function readEpubCover(epubPath: string): Promise<Buffer | null> {
  const zip = await JSZip.loadAsync(await fs.promises.readFile(epubPath));
  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) return null;
  const opfFiles: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) if (name.endsWith('.opf')) opfFiles[name] = await zip.file(name)!.async('string');
  const pkg = parsePackage(container, (rel) => opfFiles[rel] ?? '');
  if (!pkg.coverHref) return null;
  const coverName = path.posix.normalize(path.posix.join(pkg.opfDir, pkg.coverHref));
  return (await zip.file(coverName)?.async('nodebuffer')) ?? null;
}

/** `<meta name="viewport" content="width=1200, height=1600">` from a fixed-layout page. */
export function readViewport(xhtmlPath: string): { width: number; height: number } | null {
  const s = fs.readFileSync(xhtmlPath, 'utf8');
  const m = /name=["']viewport["'][^>]*content=["'][^"']*width\s*=\s*(\d+)[^"']*height\s*=\s*(\d+)/i.exec(s);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}
```

**Code: `converters/epub.ts`**
```ts
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { cssPageSize, readerCss } from '@shared/text';
import type { ConvertOptions } from '@shared/toolOptions';
import type { FileInfo, Fmt } from '@shared/types';
import { throwIfAborted, UserError } from '../errors';
import { extractEpub, readViewport } from '../engines/epubReader';
import { htmlFileToPdf } from '../engines/print';
import type { JobContext } from '../jobs/context';

export async function convertEpub(file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext): Promise<void> {
  if (target !== 'pdf') throw new UserError('EPUB can only be converted to PDF.');
  const book = await extractEpub(file.path, ctx.tempPath('epub'));
  if (book.spine.length === 0) throw new UserError('This EPUB has no readable chapters.');
  const merged = await PDFDocument.create();
  for (let i = 0; i < book.spine.length; i++) {
    throwIfAborted(ctx.signal);
    const chapter = book.spine[i];
    let bytes: Buffer;
    if (book.fixedLayout) {
      const vp = readViewport(chapter);
      bytes = await htmlFileToPdf(chapter, {
        pageSize: vp ? { width: vp.width / 96, height: vp.height / 96 } : 'A4', zeroMargins: true,
        css: 'html,body{margin:0!important;padding:0!important}'
      });
    } else if ((opts.docMode ?? 'reflow') === 'reflow') {
      bytes = await htmlFileToPdf(chapter, { css: readerCss({ textSize: opts.textSize, font: opts.font, pageSize: opts.pageSize }) });
    } else {
      bytes = await htmlFileToPdf(chapter, { css: `@page { size: ${cssPageSize(opts.pageSize ?? 'a4')}; margin: 16mm; }` });
    }
    const src = await PDFDocument.load(bytes);
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
    ctx.progress((i + 1) / book.spine.length);
  }
  merged.setTitle(book.title);
  await fs.promises.writeFile(ctx.newOutput({ source: file.path, ext: 'pdf' }), await merged.save());
}
```

**Spec: `EpubToPdfCard.tsx`** (key `'epub->pdf'`; 440×520)
- Title "EPUB to PDF".
- **Layout:** Segmented "Adjustable text" (`reflow`) / "Preserved pages" (`pages`).
- When adjustable:
  - **Text size** Segmented S/M/L/XL (default M)
  - **Font** Select Original / Serif / Sans
  - **Page** Select A4 / Letter / A5
- When preserved: **Page** select only, with the note "Keeps the publisher's styling."
- Footer note: "Fixed-layout ebooks (comics, picture books) always keep their exact pages."
- Apply "Convert" → `{ docMode, textSize, font, pageSize }`.

**Thumbnail:** in `thumbnails.ts`, add the `'epub'` case: `readEpubCover(f.path)` → if it is a buffer, `sharp(buf).resize(256,256,{fit:'inside'}).jpeg({quality:70})`.

**Fixtures:**
```ts
'book.epub': async (out) => {
  await fs.promises.writeFile(out, await buildReflowEpub({ title: 'Test Book', lang: 'en' }, [
    { title: 'Chapter One', bodyXhtml: '<h1>Chapter One</h1><p>Kabooks converts files offline. Xin chào thế giới.</p>' },
    { title: 'Chapter Two', bodyXhtml: '<h1>Chapter Two</h1><p>Second chapter text.</p><ul><li>One</li><li>Two</li></ul>' }
  ]));
},
'fixed.epub': async (out, dir) => {
  const jpeg = await sharp(await ensureFixture(dir, 'image.png')).flatten({ background: '#fff' }).jpeg().toBuffer();
  await fs.promises.writeFile(out, await buildFixedEpub({ title: 'Fixed', lang: 'en' }, [
    { jpeg, width: 800, height: 600 }, { jpeg, width: 800, height: 600 }
  ]));
},
```

**Cases:**
- `convert.epub.book-pdf`: PDF pages ≥ 2.
- `convert.epub.fixed-pdf`: PDF pages = 2.

---

## Task 6.12 — OCR engine + scanned-PDF fallback
**Files:** `src/main/engines/ocr.ts`, wire `ocrPdfToBlocks` into `converters/pdf.ts`, fixture `scan.pdf`, case
```ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { textToBlocks, type Block } from '@shared/pdfReflow';
import { throwIfAborted, UserError } from '../errors';
import type { JobContext } from '../jobs/context';
import { cacheDir, tessdataDir } from '../paths';
import { pdfRenderPage, withPdf } from './pdfEngine';

export function availableLangs(wanted: string[]): string[] {
  return wanted.filter((l) => fs.existsSync(path.join(tessdataDir(), `${l}.traineddata`)));
}

export async function withOcrWorker<T>(langs: string[], fn: (w: Worker) => Promise<T>): Promise<T> {
  const ok = availableLangs(langs.length ? langs : ['eng']);
  if (ok.length === 0) throw new UserError('No OCR language data found. Run "npm run fetch-binaries".');
  const options: Record<string, unknown> = { langPath: tessdataDir(), cachePath: cacheDir('tesseract'), gzip: false, cacheMethod: 'none' };
  if (app.isPackaged) {
    options.workerPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js');
  }
  const worker = await createWorker(ok, 1, options as Parameters<typeof createWorker>[2]);
  try {
    await worker.setParameters({ user_defined_dpi: '300' } as never);
    return await fn(worker);
  } finally {
    await worker.terminate();
  }
}

export async function recognize(worker: Worker, image: Buffer, wantPdf: boolean): Promise<{ text: string; pdf?: Buffer }> {
  const { data } = await worker.recognize(image, {}, { text: true, pdf: wantPdf } as never);
  const d = data as unknown as { text: string; pdf?: number[] | null };
  return { text: d.text ?? '', pdf: wantPdf && d.pdf ? Buffer.from(d.pdf) : undefined };
}

/** OCR every page (or the given pages) of a PDF into text blocks. */
export async function ocrPdfToBlocks(pdfPath: string, ctx: JobContext, pageIndexes?: number[]): Promise<Block[]> {
  const langs = ctx.settings.ocrLanguages;
  return withPdf(pdfPath, (doc) => withOcrWorker(langs, async (worker) => {
    const pages = pageIndexes ?? Array.from({ length: doc.pages }, (_, i) => i);
    const blocks: Block[] = [];
    for (let k = 0; k < pages.length; k++) {
      throwIfAborted(ctx.signal);
      const png = await pdfRenderPage(doc.id, pages[k], { dpi: 300, mime: 'image/png' });
      blocks.push(...textToBlocks((await recognize(worker, png, false)).text));
      if (k < pages.length - 1) blocks.push({ type: 'pagebreak' });
      ctx.progress((k + 1) / pages.length, `Reading page ${pages[k] + 1} of ${doc.pages}`);
    }
    return blocks;
  }));
}
```
Remove the temporary "OCR is not available yet" line in `pdfToBlocks`.

**Fixture `scan.pdf`** (an image-only PDF of real text). Import `textToHtml` and `htmlFileToPdf`, and use `withPdf` + `pdfRenderPage`:
```ts
'scan.pdf': async (out, dir) => {
  const html = path.join(dir, 'tmp-scan.html');
  await fs.promises.writeFile(html, textToHtml('KABOOKS OCR TEST\n\nHello offline world.', { title: 'scan', font: 'sans', sizePt: 28, pageSize: 'a4' }), 'utf8');
  const textPdf = path.join(dir, 'tmp-scan-src.pdf');
  await fs.promises.writeFile(textPdf, await htmlFileToPdf(html));
  const png = await withPdf(textPdf, (doc) => pdfRenderPage(doc.id, 0, { dpi: 200, mime: 'image/png' }));
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  pdf.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  await fs.promises.writeFile(out, await pdf.save());
},
```
**Case:** `convert.pdf.scan-txt-ocr`. The text, uppercased, contains `KABOOKS OCR TEST` (allow OCR noise: check `includes('KABOOKS')` and `includes('OCR')`). Skip it when `!caps.ocrLanguages.includes('eng')`.

---

## Task 6.13 — Milestone M2: full matrix green
1. `npm run selftest` (all groups) → **0 failed**. Only HEIC cases may be SKIP.
2. Manual checks in `npm run dev`:
   - PNG → SVG opens the SVG card.
   - PDF → DOCX opens the DocMode card.
   - EPUB → PDF opens the EPUB card.
   - TXT → SRT opens the timing card.
   - Each produces a file that opens in its default app: Word for .docx, the browser for .svg, any reader for .epub.
3. Open a produced `.docx` in Word or LibreOffice: headings appear as headings.
4. Commit "Milestone M2".

# Phase 7 — Shared editors + video tools (Milestone M3a)

**How every tool is wired (read once; repeated in every Phase 7–10 task):**
1. **Pure args/logic** goes in `src/main/engines/*Args.ts` or `src/shared/*`, with unit tests.
2. **Runner:** `src/main/tools/<category>/<name>.ts` exports `run…: ToolRunFn`. It reads options with `withDefaults<T>(toolId, options)` and writes only through `ctx.newOutput()`/`ctx.tempPath()`. Register it in `src/main/tools/index.ts` → `TOOL_RUNNERS`.
3. **Panel:** `src/renderer/src/panels/<category>/<Name>Panel.tsx`. It receives `ToolPanelProps`, uses `<Panel title … onBack onClose onReset onApply>`, and calls `onApply(options)` with exactly the option interface from `shared/toolOptions.ts`. Register it in `panels/index.ts` → `PANELS[toolId] = { component, width, height }`.
4. **Self-test case** in `selftest/cases/tools-<category>.ts` (group `tools.<category>`). Append the exported list to `CASES` in `selftest/cases/index.ts`. New fixtures go into `FIXTURES` in `selftest/fixtures.ts`.
5. **Snippets in Phases 7–10 leave out obvious import lines** (shared types/options, `withDefaults`, engines, errors, `fs`, `path`, `sharp`). Add them. Use `import type` for `ToolRunFn`/`ToolPanelProps` to avoid circular imports.

## Task 7.1 — Media previews (main) + `MediaPreview` component
**Files:** `src/main/previews.ts`, call `registerPreviewIpc()` from `registerIpc()`, `components/MediaPreview.tsx`, CSS
```ts
import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '@shared/ipc';
import { probe, runFfmpeg, runFfmpegToBuffer } from './engines/ffmpeg';
import { cacheDir } from './paths';
import { allowFile } from './protocol';

const PLAYABLE_V = ['h264', 'vp8', 'vp9', 'av1'];
const PLAYABLE_A = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'];
const PLAYABLE_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'];
const inflight = new Map<string, Promise<void>>();

async function cacheKey(p: string): Promise<string> {
  const st = await fs.promises.stat(p);
  return crypto.createHash('sha1').update(`${p}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
}

/** A kfile:// URL Chromium can play: the file itself, or a cached 480p H.264 / WAV proxy. */
export async function previewMedia(p: string): Promise<{ url: string; isProxy: boolean }> {
  const pr = await probe(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const vOk = !pr.video || PLAYABLE_V.includes(pr.video.codec);
  const aOk = !pr.audio || PLAYABLE_A.includes(pr.audio.codec);
  if (PLAYABLE_EXT.includes(ext) && vOk && aOk) return { url: allowFile(p), isProxy: false };
  const isVideo = !!pr.video;
  const out = path.join(cacheDir('proxies'), `${await cacheKey(p)}.${isVideo ? 'mp4' : 'wav'}`);
  if (!fs.existsSync(out)) {
    let job = inflight.get(out);
    if (!job) {
      const tmp = out.replace(/\.(mp4|wav)$/, '.part.$1');
      const args = isVideo
        ? ['-i', p, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale=-2:'min(ih,480)'", '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '28', '-g', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmp]
        : ['-i', p, '-map', '0:a:0', '-c:a', 'pcm_s16le', tmp];
      job = runFfmpeg(args).then(() => fs.promises.rename(tmp, out)).finally(() => inflight.delete(out));
      inflight.set(out, job);
    }
    await job;
  }
  return { url: allowFile(out), isProxy: true };
}

export async function previewFrame(p: string, t: number, maxWidth: number): Promise<string> {
  const buf = await runFfmpegToBuffer(['-ss', Math.max(0, t).toFixed(3), '-i', p, '-frames:v', '1', '-vf', `scale='min(${maxWidth},iw)':-2`,
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1']);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

export function registerPreviewIpc(): void {
  ipcMain.handle(IPC.previewMedia, (_e, p: string) => previewMedia(p));
  ipcMain.handle(IPC.previewFrame, (_e, p: string, t: number, w: number) => previewFrame(p, Number(t) || 0, Number(w) || 640));
}
```

**Spec: `MediaPreview.tsx`**
- Props: `{ file: FileInfo; time: number; onTime(t: number): void; maxHeight?: number; children?: ReactNode }`.
  `children` are overlays (`CropBox`/`RectEditor`) placed **exactly over the picture**.
- Container `div.media` uses `style={{ aspectRatio: \`${file.width} / ${file.height}\`, maxHeight, maxWidth: '100%' }}` and `position: relative`. The `<video>` fills it (`width/height: 100%`, `object-fit: contain`). The overlay div is `position:absolute; inset:0`.
- On mount, call `api.previewMedia(file.path)`. While it is pending, show "Preparing preview…" with a small spinner.
- Two-way time sync:
  - `onTimeUpdate` → `onTime(video.currentTime)`.
  - When the prop `time` differs from `video.currentTime` by more than 0.04 s, set `video.currentTime = time`.
- A small round play/pause button in the bottom-left corner. **Space** toggles play/pause unless focus is in an input.
- **Fallback:** on `<video>` `error`, switch to `<img>` showing `api.previewFrame(file.path, time, 960)`, refreshed (debounced 150 ms) when `time` changes.
- The white 3 px border + 4 px radius frame look comes from `crop-options.png`.

---

## Task 7.2 — Editing components: `TimeRange`, `CropBox`, `RectEditor`, `ReorderList`
**Files:** `components/TimeRange.tsx`, `components/CropBox.tsx`, `components/RectEditor.tsx`, `components/ReorderList.tsx`, CSS. In the Icon map add `stepBack: StepBack` and `stepForward: StepForward` from lucide.

**Code: `TimeRange.tsx`** (the `◁| ●──── |▷` row and time labels from `crop-options.png`)
```tsx
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { formatTimecode } from '@shared/time';
import { IconButton } from './Button';

type Grab = 'start' | 'end' | 'head';

export interface TimeRangeProps {
  duration: number;
  playhead: number;
  onSeek: (t: number) => void;
  range?: { start: number; end: number };
  onRange?: (start: number, end: number) => void;
  marks?: Array<{ start: number; end: number }>;
  step?: number;                                   // seconds per step (default 1/30)
}

export function TimeRange(p: TimeRangeProps) {
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef<Grab | null>(null);
  const step = p.step ?? 1 / 30;
  const d = p.duration || 1;
  const pct = (t: number): string => `${Math.min(Math.max(t / d, 0), 1) * 100}%`;

  const timeAt = (clientX: number): number => {
    const r = (track.current as HTMLDivElement).getBoundingClientRect();
    return Math.min(p.duration, Math.max(0, ((clientX - r.left) / r.width) * p.duration));
  };
  const apply = (g: Grab, t: number): void => {
    if (g === 'head') { p.onSeek(t); return; }
    if (!p.range || !p.onRange) return;
    if (g === 'start') { const s = Math.min(t, p.range.end - 0.1); p.onRange(Math.max(0, s), p.range.end); p.onSeek(Math.max(0, s)); }
    else { const e = Math.max(t, p.range.start + 0.1); p.onRange(p.range.start, Math.min(p.duration, e)); p.onSeek(Math.min(p.duration, e)); }
  };
  const down = (g: Grab) => (e: PointerEvent): void => {
    e.stopPropagation();
    grab.current = g;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    apply(g, timeAt(e.clientX));
  };
  const key = (g: Grab) => (e: KeyboardEvent): void => {
    const delta = (e.shiftKey ? 1 : step) * (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    if (!delta) return;
    e.preventDefault();
    const base = g === 'head' ? p.playhead : g === 'start' ? (p.range?.start ?? 0) : (p.range?.end ?? 0);
    apply(g, Math.min(p.duration, Math.max(0, base + delta)));
  };

  return (
    <div className="timerange">
      <div className="timerange__row">
        <IconButton label="Previous frame" icon="stepBack" onClick={() => p.onSeek(Math.max(0, p.playhead - step))} />
        <div ref={track} className="timerange__track" onPointerDown={down('head')}
          onPointerMove={(e) => { if (grab.current) apply(grab.current, timeAt(e.clientX)); }}
          onPointerUp={() => { grab.current = null; }}>
          {p.marks?.map((m, i) => (
            <div key={i} className="timerange__mark" style={{ left: pct(m.start), width: `calc(${pct(m.end)} - ${pct(m.start)})` }} />
          ))}
          {p.range && <div className="timerange__sel" style={{ left: pct(p.range.start), width: `calc(${pct(p.range.end)} - ${pct(p.range.start)})` }} />}
          {p.range && <button type="button" className="timerange__handle" style={{ left: pct(p.range.start) }} aria-label="Start" onPointerDown={down('start')} onKeyDown={key('start')} />}
          {p.range && <button type="button" className="timerange__handle" style={{ left: pct(p.range.end) }} aria-label="End" onPointerDown={down('end')} onKeyDown={key('end')} />}
          <div className="timerange__head" style={{ left: pct(p.playhead) }} role="slider" tabIndex={0} aria-label="Playhead"
            aria-valuemin={0} aria-valuemax={p.duration} aria-valuenow={p.playhead} onPointerDown={down('head')} onKeyDown={key('head')} />
        </div>
        <IconButton label="Next frame" icon="stepForward" onClick={() => p.onSeek(Math.min(p.duration, p.playhead + step))} />
      </div>
      <div className="timerange__labels">
        <span>{formatTimecode(p.range ? p.range.start : p.playhead)}</span>
        <span>{formatTimecode(p.range ? p.range.end : p.duration)}</span>
      </div>
    </div>
  );
}
```
**CSS:**
- `.timerange__track`: height 28 px; a 6 px line through the middle (`--track`); `position: relative`; `cursor: pointer`.
- `.timerange__sel`: `--accent` fill on the line.
- `.timerange__mark`: `color-mix(--danger 40%)`.
- `.timerange__head`: a 22 px white circle with a shadow (like the screenshot thumb), `transform: translateX(-50%)`.
- `.timerange__handle`: 10×28 px accent rounded bar.
- `.timerange__labels`: monospace 13 px, `--text-2`, space-between.

**Code: `CropBox.tsx`**
```tsx
import { useRef, type PointerEvent } from 'react';
import { dragRect, type DragHandle, type NormRect } from '@shared/geometry';

const HANDLES: DragHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function CropBox(p: { rect: NormRect; onChange: (r: NormRect) => void; aspect: number | null; frameAspect: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: DragHandle; x: number; y: number; start: NormRect } | null>(null);
  const down = (handle: DragHandle) => (e: PointerEvent): void => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, start: p.rect };
  };
  const move = (e: PointerEvent): void => {
    const d = drag.current;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return;
    p.onChange(dragRect(d.start, d.handle, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height, p.aspect, p.frameAspect));
  };
  const r = p.rect;
  return (
    <div ref={ref} className="cropbox" onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
      <div className="cropbox__rect" onPointerDown={down('move')}
        style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
        <div className="cropbox__grid" />
        {HANDLES.map((h) => <div key={h} className={`cropbox__handle cropbox__handle--${h}`} onPointerDown={down(h)} />)}
      </div>
    </div>
  );
}
```
**CSS:**
- `.cropbox`: `position:absolute; inset:0; overflow:hidden`.
- `.cropbox__rect`: `position:absolute; border: 2px solid #fff; box-shadow: 0 0 0 9999px rgba(0,0,0,.45); cursor: move`.
- `.cropbox__grid`: thirds lines at 30 % white.
- Handles are 14 px white squares with a shadow, positioned on the corners and edges by modifier class, with matching `cursor` (`nwse-resize`, …).

**Spec: `RectEditor.tsx`** (many boxes, used by Redact)
- Props: `{ rects: Array<{ id: string; rect: NormRect }>; selected: string | null; onSelect(id|null); onChange(rects); frameAspect: number; labelOf?(id): string }`.
- **Pointer-down on empty space** creates a rect at the pointer (`w = h = MIN_NORM`), selects it, and continues the drag as handle `'se'`. Use `dragRect(start, handle, dx, dy, null, frameAspect)` exactly as in `CropBox`.
- **Pointer-down on a rect** selects it and moves it. Its 8 handles resize it.
- The selected rect has an accent border, a small `×` button at its top-right that deletes it, and the label (`labelOf`) in its top-left corner.
- The **Delete/Backspace** key removes the selected rect (only when focus is not in an input).
- Unselected rects: 2 px white dashed border, no shade.

**Spec: `ReorderList.tsx`**
- Props: `{ items: Array<{ id: string; title: string; subtitle?: string; thumbnail?: string }>; onChange(ids: string[]) }`.
- Each row has a grip icon, a 40 px thumbnail (or category icon), title and subtitle.
- **HTML5 drag & drop within the list:**
  - `draggable` rows.
  - `onDragStart` stores the index.
  - `onDragOver` another row → reorder the array live and call `onChange`.
  - Set `dataTransfer.effectAllowed = 'move'`. This is internal only and never touches files.
- **Keyboard:** focus a row and press `Alt+↑/↓` to move it.

---

## Task 7.3 — `engines/videoArgs.ts` (pure) + tests
**Files:** `src/main/engines/videoArgs.ts`, `src/main/engines/videoArgs.test.ts`
```ts
import type { PixelRect } from '@shared/geometry';
import type { VideoCompressOptions, VideoSplitOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { EVEN_SCALE, videoEncodeArgs, videoFilter, type MediaFacts, type Quality } from './ffmpegArgs';

const t3 = (s: number): string => s.toFixed(3);
const faststart = (fmt: Fmt): string[] => (fmt === 'mp4' || fmt === 'mov' ? ['-movflags', '+faststart'] : []);
const audioMap = (fmt: Fmt): string[] => (fmt === 'gif' ? [] : ['-map', '0:a:0?']);

export const PRESET_CRF = { high: 20, balanced: 24, small: 28 } as const;

/** New size with the SHORT side capped at maxShort (even numbers); null = unchanged. */
export function capSize(w: number, h: number, maxShort: number): { width: number; height: number } | null {
  if (!maxShort || Math.min(w, h) <= maxShort) return null;
  const k = maxShort / Math.min(w, h);
  const even = (n: number): number => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(w), height: even(h) };
}

/** kbit/s for the video stream so that the whole file is ≈ targetMb. */
export function targetVideoKbps(targetMb: number, durationSec: number, audioKbps: number): number {
  return Math.floor((targetMb * 8192) / Math.max(1, durationSec) - audioKbps);
}

/** One or two FFmpeg runs (two = target-size two-pass). */
export function compressPlan(input: string, output: string, f: MediaFacts, o: VideoCompressOptions, outFmt: 'mp4' | 'webm', passLog: string): string[][] {
  const size = f.width && f.height ? capSize(f.width, f.height, o.maxHeight) : null;
  const vf = [...(size ? [`scale=${size.width}:${size.height}`] : []), EVEN_SCALE].join(',');
  const base = ['-i', input, '-map', '0:v:0', '-vf', vf];
  const webm = outFmt === 'webm';
  const audio = f.hasAudio ? ['-map', '0:a:0', ...(webm ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '128k'])] : ['-an'];
  const tail = webm ? [] : ['-movflags', '+faststart'];
  if (o.targetSizeMb > 0) {
    const kbps = targetVideoKbps(o.targetSizeMb, f.durationSec, f.hasAudio ? (webm ? 96 : 128) : 0);
    const v = webm
      ? ['-c:v', 'libvpx-vp9', '-b:v', `${kbps}k`, '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${kbps}k`, '-pix_fmt', 'yuv420p'];
    return [
      [...base, ...v, '-pass', '1', '-passlogfile', passLog, '-an', '-f', 'null', '-'],
      [...base, ...v, '-pass', '2', '-passlogfile', passLog, ...audio, ...tail, output]
    ];
  }
  const h265 = !webm && o.codec === 'h265';
  const v = webm
    ? ['-c:v', 'libvpx-vp9', '-crf', String(PRESET_CRF[o.preset] + 9), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p']
    : ['-c:v', h265 ? 'libx265' : 'libx264', '-preset', 'medium', '-crf', String(PRESET_CRF[o.preset] + (h265 ? 4 : 0)), '-pix_fmt', 'yuv420p', ...(h265 ? ['-tag:v', 'hvc1'] : [])];
  return [[...base, ...v, ...audio, ...tail, output]];
}

export function trimArgs(input: string, output: string, f: MediaFacts, start: number, end: number, precise: boolean, fmt: Fmt, q: Quality): string[] {
  const dur = Math.max(0.05, end - start);
  if (!precise && fmt !== 'gif') {
    return ['-ss', t3(start), '-i', input, '-t', t3(dur), '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', ...faststart(fmt), output];
  }
  return ['-ss', t3(start), '-i', input, '-t', t3(dur), '-map', '0:v:0', ...audioMap(fmt), '-vf', videoFilter(fmt, [], { width: 0, fps: Math.round(f.fps || 12) }), ...videoEncodeArgs(fmt, q, f), output];
}

export function splitSegments(duration: number, o: VideoSplitOptions): Array<{ start: number; end: number }> {
  let cuts: number[];
  if (o.mode === 'parts') {
    const n = Math.max(2, Math.min(100, Math.round(o.parts)));
    cuts = Array.from({ length: n - 1 }, (_, i) => (duration * (i + 1)) / n);
  } else if (o.mode === 'every') {
    const s = Math.max(1, o.everySec);
    cuts = [];
    for (let t = s; t < duration - 0.05; t += s) cuts.push(t);
  } else {
    cuts = [...o.times];
  }
  const clean = [...new Set(cuts.filter((t) => t > 0.05 && t < duration - 0.05).map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
  const pts = [0, ...clean, duration];
  return pts.slice(0, -1).map((s, i) => ({ start: s, end: pts[i + 1] }));
}

export function cropArgs(input: string, output: string, f: MediaFacts, r: PixelRect, fmt: Fmt, q: Quality): string[] {
  return ['-i', input, '-map', '0:v:0', ...audioMap(fmt), '-vf', videoFilter(fmt, [`crop=${r.w}:${r.h}:${r.x}:${r.y}`], { width: 0, fps: Math.round(f.fps || 12) }),
    ...videoEncodeArgs(fmt, q, f, 'copy'), output];
}

export function atempoChain(factor: number): string {
  const parts: string[] = [];
  let r = factor;
  while (r > 2) { parts.push('atempo=2.0'); r /= 2; }
  while (r < 0.5) { parts.push('atempo=0.5'); r /= 0.5; }
  parts.push(`atempo=${r.toFixed(4)}`);
  return parts.join(',');
}

export function speedArgs(input: string, output: string, f: MediaFacts, factor: number, keepAudio: boolean, fmt: Fmt, q: Quality): string[] {
  const vf = videoFilter(fmt, [`setpts=PTS/${factor.toFixed(4)}`], { width: 0, fps: Math.round(f.fps || 12) });
  if (!(keepAudio && f.hasAudio && fmt !== 'gif')) {
    return ['-i', input, '-map', '0:v:0', '-vf', vf, ...videoEncodeArgs(fmt, q, f, 'none'), output];
  }
  return ['-i', input, '-filter_complex', `[0:v:0]${vf}[v];[0:a:0]${atempoChain(factor)}[a]`, '-map', '[v]', '-map', '[a]', ...videoEncodeArgs(fmt, q, f), output];
}

export function muteArgs(input: string, output: string, fmt: Fmt): string[] {
  return ['-i', input, '-map', '0:v', '-c', 'copy', '-an', ...faststart(fmt), output];
}

export function snapshotArgs(input: string, output: string, t: number, fmt: 'png' | 'jpg'): string[] {
  return ['-ss', t3(Math.max(0, t)), '-i', input, '-frames:v', '1', ...(fmt === 'jpg' ? ['-q:v', '2'] : []), output];
}

export function framesEveryArgs(input: string, pattern: string, everySec: number, fmt: 'png' | 'jpg'): string[] {
  return ['-i', input, '-vf', `fps=1/${Math.max(0.1, everySec)}`, ...(fmt === 'jpg' ? ['-q:v', '2'] : []), pattern];
}

export interface PixelRegion { rect: PixelRect; style: 'blur' | 'pixelate' | 'black'; startSec?: number; endSec?: number }

/** filter_complex graph applying every region in order; returns the final label. */
export function redactGraph(regions: PixelRegion[]): { graph: string; out: string } {
  const parts: string[] = [];
  let cur = '0:v:0';
  regions.forEach((r, i) => {
    const en = r.startSec !== undefined && r.endSec !== undefined ? `:enable='between(t,${t3(r.startSec)},${t3(r.endSec)})'` : '';
    const { x, y, w, h } = r.rect;
    const out = `v${i}`;
    if (r.style === 'black') {
      parts.push(`[${cur}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black@1:t=fill${en}[${out}]`);
    } else {
      const fx = r.style === 'blur'
        ? `gblur=sigma=${Math.max(8, Math.round(Math.min(w, h) / 6))}`
        : `scale=${Math.max(1, Math.round(w / 12))}:${Math.max(1, Math.round(h / 12))}:flags=neighbor,scale=${w}:${h}:flags=neighbor`;
      parts.push(`[${cur}]split=2[b${i}][c${i}]`, `[c${i}]crop=${w}:${h}:${x}:${y},${fx}[r${i}]`, `[b${i}][r${i}]overlay=${x}:${y}${en}[${out}]`);
    }
    cur = out;
  });
  return { graph: parts.join(';'), out: cur };
}

export function redactArgs(input: string, output: string, f: MediaFacts, regions: PixelRegion[], fmt: Fmt, q: Quality): string[] {
  const { graph, out } = redactGraph(regions);
  const tail = videoFilter(fmt, [], { width: 0, fps: Math.round(f.fps || 12) });
  return ['-i', input, '-filter_complex', `${graph};[${out}]${tail}[vout]`, '-map', '[vout]', ...audioMap(fmt),
    ...videoEncodeArgs(fmt, q, f, 'copy'), '-map_metadata', '-1', output];
}

export function metadataArgs(input: string, output: string, o: { removeAll: boolean; tags: Record<string, string> }, fmt: Fmt): string[] {
  const a = ['-i', input, '-map', '0', '-c', 'copy', '-map_metadata', o.removeAll ? '-1' : '0'];
  if (o.removeAll) a.push('-map_chapters', '-1', '-fflags', '+bitexact');
  for (const [k, v] of Object.entries(o.tags)) a.push('-metadata', `${k}=${v}`);
  if (fmt === 'mp4' || fmt === 'mov') a.push('-movflags', Object.keys(o.tags).length ? '+faststart+use_metadata_tags' : '+faststart');
  a.push(output);
  return a;
}

export function canConcatCopy(list: MediaFacts[]): boolean {
  const a = list[0];
  return list.every((f) => f.videoCodec === a.videoCodec && f.width === a.width && f.height === a.height
    && Math.abs((f.fps ?? 0) - (a.fps ?? 0)) < 0.01 && f.hasAudio === a.hasAudio
    && f.audioCodec === a.audioCodec && f.sampleRate === a.sampleRate && f.channels === a.channels);
}

/** Contents of an FFmpeg concat-demuxer list file. */
export function concatListFile(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}

export function concatArgs(listFile: string, output: string, fmt: Fmt): string[] {
  return ['-f', 'concat', '-safe', '0', '-i', listFile, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', ...faststart(fmt), output];
}

/** Re-encode a clip to a common size/fps/audio layout so the concat demuxer can copy it. */
export function normalizeClipArgs(input: string, output: string, f: MediaFacts, target: { width: number; height: number; fps: number }): string[] {
  const vf = `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${target.fps}`;
  const a = ['-i', input];
  if (!f.hasAudio) a.push('-f', 'lavfi', '-t', t3(f.durationSec), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  a.push('-map', '0:v:0', '-map', f.hasAudio ? '0:a:0' : '1:a:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', output);
  return a;
}
```
**Tests (videoArgs.test.ts)**
- `capSize(1920,1080,720)` → `{width:1280,height:720}`; `capSize(1080,1920,720)` → `{width:720,height:1280}`; `capSize(640,360,720)` → null.
- `targetVideoKbps(10, 60, 128)` → 1237.
- `compressPlan(..., {targetSizeMb:10,...}, 'mp4', 'log')` returns 2 arrays. The first contains `'-pass','1'` and ends with `'-'`.
- `splitSegments(9,{mode:'parts',parts:3,…})` → `[[0,3],[3,6],[6,9]]`; `splitSegments(10,{mode:'every',everySec:4,…})` → 3 segments ending at 10; `splitSegments(10,{mode:'at',times:[5,0,20],…})` → `[[0,5],[5,10]]`.
- `atempoChain(4)` → `'atempo=2.0,atempo=2.0000'`; `atempoChain(0.25)` → `'atempo=0.5,atempo=0.5000'`.
- `redactGraph` with one blur region and one black region contains `gblur`, `drawbox` and `[v1]`, and `out === 'v1'`.
- `concatListFile(["C:\\a b\\it's.mp4"])` → `file 'C:/a b/it'\''s.mp4'\n`.

---

## Task 7.4 — Video **Compress**
**Files:** `tools/video/common.ts`, `tools/video/compress.ts`, `panels/video/CompressPanel.tsx`, registrations, case

**Code: `tools/video/common.ts`**
```ts
import type { FileInfo, Fmt } from '@shared/types';
import { UserError } from '../../errors';
import { probe } from '../../engines/ffmpeg';
import { toFacts, type MediaFacts, type Quality } from '../../engines/ffmpegArgs';
import type { JobContext } from '../../jobs/context';

export async function videoFacts(file: FileInfo): Promise<MediaFacts> {
  const f = toFacts(await probe(file.path));
  if (!f.hasVideo) throw new UserError(`${file.name} has no video track.`);
  return f;
}

/** Tools re-encode at high quality to avoid visible generation loss. */
export const toolQuality = (ctx: JobContext): Quality => ({ crf: Math.min(ctx.settings.videoCrf, 20), audioKbps: ctx.settings.audioBitrateKbps });

/** Tools keep the input container (fmt) so users get back what they gave. */
export const sameFmt = (file: FileInfo): Fmt => file.fmt ?? 'mp4';
```

**Code: `tools/video/compress.ts`**
```ts
import fs from 'node:fs';
import { formatBytes, formatDuration } from '@shared/time';
import { withDefaults, type VideoCompressOptions } from '@shared/toolOptions';
import { UserError } from '../../errors';
import { runFfmpeg } from '../../engines/ffmpeg';
import { compressPlan, targetVideoKbps } from '../../engines/videoArgs';
import type { ToolRunFn } from '../index';
import { videoFacts } from './common';

export const runVideoCompress: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoCompressOptions>('video.compress', options);
  const f = await videoFacts(file);
  const outFmt = file.fmt === 'webm' ? 'webm' : 'mp4';
  if (o.targetSizeMb > 0 && targetVideoKbps(o.targetSizeMb, f.durationSec, 128) < 150) {
    const minMb = Math.ceil(((150 + 128) * f.durationSec) / 8192);
    throw new UserError(`${o.targetSizeMb} MB is too small for a ${formatDuration(f.durationSec)} video. Try at least ${minMb} MB.`);
  }
  const out = ctx.newOutput({ source: file.path, ext: outFmt, suffix: 'compressed' });
  const passes = compressPlan(file.path, out, f, o, outFmt, ctx.tempPath('pass'));
  for (let i = 0; i < passes.length; i++) {
    await runFfmpeg(passes[i], { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress((i + p) / passes.length) });
  }
  const before = file.size;
  const after = (await fs.promises.stat(out)).size;
  if (after >= before && o.targetSizeMb === 0) {
    ctx.dropOutput(out);
    ctx.note('Already well compressed — no smaller file was made.');
    return;
  }
  ctx.note(`${formatBytes(before)} → ${formatBytes(after)} (−${Math.max(0, Math.round((1 - after / before) * 100))}%)`);
};
```
Register: `TOOL_RUNNERS['video.compress'] = runVideoCompress` (write it as an entry in the object literal).

**Spec: `CompressPanel.tsx`** (420×540)
- Header info line: `48.2 MB · 1920×1080 · 1:24` (from `FileInfo`).
- **Quality:** Segmented High / Balanced / Small.
- **Max resolution:** Select Original / 2160p / 1080p / 720p / 480p. Only list values smaller than the short side.
- **Codec:** Segmented "H.264 (most compatible)" / "H.265 (smaller)". Hidden for WebM input.
- **Target size:** Toggle. When on, show a number field (MB) and disable Quality and Codec, with the note "Uses two passes for an accurate size (H.264)".
- Apply "Compress".
- Payload: `VideoCompressOptions`.

**Case** (`tools.video.compress`): `video.mp4` with `{preset:'small', maxHeight:240}` → 1 output with `displayHeight` 240, codec h264.

---

## Task 7.5 — Video **Trim** and **Split**
**Files:** `tools/video/trim.ts`, `tools/video/split.ts`, `panels/video/TrimPanel.tsx`, `panels/video/SplitPanel.tsx`
```ts
// trim.ts
export const runVideoTrim: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoTrimOptions>('video.trim', options);
  const f = await videoFacts(file);
  const end = o.endSec > 0 ? Math.min(o.endSec, f.durationSec) : f.durationSec;
  if (end - o.startSec < 0.1) throw new UserError('The selection is too short.');
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'trimmed' });
  await runFfmpeg(trimArgs(file.path, out, f, o.startSec, end, o.precise, fmt, toolQuality(ctx)),
    { durationSec: end - o.startSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
};

// split.ts
export const runVideoSplit: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoSplitOptions>('video.split', options);
  const f = await videoFacts(file);
  const segs = splitSegments(f.durationSec, o);
  if (segs.length < 2) throw new UserError('Add at least one cut point inside the video.');
  const fmt = sameFmt(file);
  for (let i = 0; i < segs.length; i++) {
    throwIfAborted(ctx.signal);
    const out = ctx.newOutput({ source: file.path, ext: fmt, group: 'parts', index: i + 1, total: segs.length });
    await runFfmpeg(trimArgs(file.path, out, f, segs[i].start, segs[i].end, o.precise, fmt, toolQuality(ctx)),
      { durationSec: segs[i].end - segs[i].start, signal: ctx.signal, onProgress: (p) => ctx.progress((i + p) / segs.length) });
  }
  ctx.note(`${segs.length} parts`);
};
```
> `splitSegments` is defined in Task 7.3. **Move it to `src/shared/split.ts`** (it is pure, and the Split panel needs it too). Import it in `videoArgs.ts`, `split.ts` and the tests from `@shared/split`.
**Spec: `TrimPanel.tsx`** (460×600)
- `MediaPreview` (max-height 280) on top.
- Below it, `TimeRange` with `range`. Default range: 0 → duration.
- Buttons "Set start" (key `I`) and "Set end" (key `O`) use the current playhead.
- Readout "Keeps 0:12.40".
- **Mode:** Segmented "Fast (no quality loss)" / "Precise".
- Note for Fast: "Cuts at the nearest keyframe, so it may start slightly early."
- Payload `{ startSec, endSec, precise }`.

**Spec: `SplitPanel.tsx`** (460×640)
- `MediaPreview` + `TimeRange`; `marks` show the resulting cuts as thin lines (marks of 0.05 s width).
- **Split by:** Segmented "Into parts" / "Every" / "At times".
  - Into parts: stepper 2–20.
  - Every: Segmented 30 s / 1 min / 5 min / 10 min + a custom seconds field.
  - At times: "Add cut at playhead" button (key `C`) and a list of times, each with a remove button.
- Live text "Creates N files", computed with `splitSegments` from `@shared/split`.
- Precise toggle.
- Payload `VideoSplitOptions`.

**Cases:**
- Precise trim 1→3 → duration 2 ±0.25.
- Fast trim → duration between 1.5 and 3.3.
- Split `{mode:'parts',parts:2}` → 2 outputs.

---

## Task 7.6 — Video **Crop** (replica of `crop-options.png`)
**Files:** `tools/video/crop.ts`, `panels/video/CropPanel.tsx`
```ts
export const runVideoCrop: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoCropOptions>('video.crop', options);
  const f = await videoFacts(file);
  if (isFullRect(o.rect)) throw new UserError('Move the crop handles first — the whole frame is selected.');
  const r = toPixelRect(clampNormRect(o.rect), f.width ?? 0, f.height ?? 0, true);
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'cropped' });
  await runFfmpeg(cropArgs(file.path, out, f, r, fmt, toolQuality(ctx)), { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  ctx.note(`${r.w} × ${r.h} px`);
};
```
**Spec: `CropPanel.tsx`** (440×660). Match the screenshot.
- Title "Crop Video" (images reuse this panel as "Crop Image" in 9.3, so make the title a prop).
- `MediaPreview` (max-height 320) with `CropBox` as its child, plus a small `⤢` expand button in the preview's bottom-right corner. Expand toggles `maxHeight` 320 ↔ 520 and calls `api.resizeOverlay({ width: 440+48 or 640+48, height: 660+48 or 860+48, anchor: 'center' })`.
- **Row "Aspect ratio":** Select from `ASPECTS`.
  - Choosing a ratio → `rect = fitAspect(ratio, w, h)`.
  - "Original" → `FULL_RECT`.
  - "Freeform" → keep the rect but drop the lock.
- **Row:** soft **Reset** button (left) and pixel readout `960 × 1,152 px` (right), computed with `toPixelRect(rect, w, h, true)` and `toLocaleString()`.
- **Width** and **Height** sliders (10–100 %): set `rect.w` / `rect.h` keeping the rect centred and clamped. With an aspect lock, changing one updates the other and the Height slider is disabled.
- `TimeRange` (playhead only) under the sliders to scrub frames.
- Footer: orange **Apply** (right).
- Payload `{ rect }`.

**Case:** rect `{x:.25,y:.25,w:.5,h:.5}` on video.mp4 → output 320×180.

---

## Task 7.7 — Video **Speed** and **Mute**
**Files:** `tools/video/speed.ts`, `tools/video/mute.ts`, `panels/video/SpeedPanel.tsx` (Mute is `instant` and has no panel)
```ts
export const runVideoSpeed: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoSpeedOptions>('video.speed', options);
  if (!(o.factor >= 0.25 && o.factor <= 4)) throw new UserError('Speed must be between 0.25× and 4×.');
  const f = await videoFacts(file);
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: `${o.factor}x` });
  await runFfmpeg(speedArgs(file.path, out, f, o.factor, o.keepAudio, fmt, toolQuality(ctx)),
    { durationSec: f.durationSec / o.factor, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
};

export const runVideoMute: ToolRunFn = async ([file], _options, ctx) => {
  const f = await videoFacts(file);
  if (!f.hasAudio) throw new UserError(`${file.name} has no audio to remove.`);
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'muted' });
  await runFfmpeg(muteArgs(file.path, out, fmt), { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
};
```
**Spec: `SpeedPanel.tsx`** (420×460)
- Preset Segmented in two rows: 0.25× 0.5× 0.75× 1.25× | 1.5× 2× 3× 4×.
- Custom slider 0.25–4 (step 0.05) bound to the same value.
- Toggle "Keep audio (pitch preserved)".
- Readout "New length 0:42 (was 1:24)".
- Payload `{ factor, keepAudio }`.

**Cases:** speed 2 → duration 2 ±0.3 and has audio; mute → `audio: null`.

---

## Task 7.8 — Video **Snapshot**
**Files:** `tools/video/snapshot.ts`, `panels/video/SnapshotPanel.tsx`
```ts
export const runVideoSnapshot: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoSnapshotOptions>('video.snapshot', options);
  const f = await videoFacts(file);
  if (o.mode === 'single') {
    const out = ctx.newOutput({ source: file.path, ext: o.format, suffix: `frame-${o.timeSec.toFixed(2).replace('.', '_')}s` });
    await runFfmpeg(snapshotArgs(file.path, out, Math.min(o.timeSec, Math.max(0, f.durationSec - 0.05)), o.format), { signal: ctx.signal });
    return;
  }
  const dir = ctx.tempPath('frames');
  await fs.promises.mkdir(dir, { recursive: true });
  await runFfmpeg(framesEveryArgs(file.path, path.join(dir, `f-%05d.${o.format}`), o.everySec, o.format),
    { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  const names = (await fs.promises.readdir(dir)).sort();
  for (let i = 0; i < names.length; i++) {
    const out = ctx.newOutput({ source: file.path, ext: o.format, group: 'frames', index: i + 1, total: names.length });
    await fs.promises.rename(path.join(dir, names[i]), out);
  }
  ctx.note(`${names.length} frames`);
};
```
**Spec: `SnapshotPanel.tsx`** (440×620)
- `MediaPreview` + `TimeRange` (playhead).
- **Mode:** Segmented "This frame" / "Every N seconds". In "every" mode, a seconds field (default 5).
- **Format:** Segmented PNG / JPG.
- Apply label "Save frame" or "Save frames".
- Payload `{ mode, timeSec: playhead, everySec, format }`.

**Cases:**
- Single at t=1 → PNG 640×360.
- Every 1 s on a 4 s clip → 4 or 5 outputs.

---

## Task 7.9 — Video **Redact**
**Files:** `tools/video/redact.ts`, `panels/video/RedactPanel.tsx`
```ts
export const runVideoRedact: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<VideoRedactOptions>('video.redact', options);
  if (o.regions.length === 0) throw new UserError('Draw at least one box over the area to hide.');
  const f = await videoFacts(file);
  const regions: PixelRegion[] = o.regions.map((r) => ({
    rect: toPixelRect(clampNormRect(r.rect), f.width ?? 0, f.height ?? 0, true), style: r.style, startSec: r.startSec, endSec: r.endSec
  }));
  const fmt = sameFmt(file);
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'redacted' });
  await runFfmpeg(redactArgs(file.path, out, f, regions, fmt, toolQuality(ctx)), { durationSec: f.durationSec, signal: ctx.signal, onProgress: (p) => ctx.progress(p) });
  ctx.note('Metadata removed');
};
```
**Spec: `RedactPanel.tsx`** (540×720)
- `MediaPreview` (max-height 340) with `RectEditor` as its child. Hint text "Drag on the video to draw a box."
- **Region list:** chips "Box 1 · Blur · whole video". Click a chip to select its box.
- For the selected box:
  - **Style:** Segmented Blur / Pixelate / Black.
  - Toggle **"Only between"**: when on, show a `TimeRange` with `range` bound to that box's start/end.
- The preview does not render the effect live; boxes show a translucent fill whose pattern matches the style.
- Apply "Redact" (disabled with 0 boxes).
- Payload `{ regions }`.

**Case:** one blur region → h264 640×360. The output's format tags have no `encoder`/`title` beyond FFmpeg defaults, because `-map_metadata -1` was used.

---

## Task 7.10 — Media **Metadata** (read + write) and Video **Join**
**Files:** `src/main/metadata.ts` (IPC `meta:read` for media; images and PDFs are added later), `tools/video/metadata.ts`, `tools/video/join.ts`, `panels/video/MetadataPanel.tsx`, `panels/video/JoinPanel.tsx`

**Code: `src/main/metadata.ts`** (first part)
```ts
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { MetadataField, MetadataInfo } from '@shared/types';
import { fmtFromPath, categoryOf } from '@shared/formats';
import { probe, runFfmpegToBuffer } from './engines/ffmpeg';

const VIDEO_KEYS: Array<[string, string]> = [['title', 'Title'], ['artist', 'Author'], ['comment', 'Comment'], ['date', 'Date'], ['description', 'Description']];
const AUDIO_KEYS: Array<[string, string]> = [['title', 'Title'], ['artist', 'Artist'], ['album', 'Album'], ['album_artist', 'Album artist'], ['date', 'Year'], ['genre', 'Genre'], ['track', 'Track'], ['comment', 'Comment']];
const READONLY: Array<[string, string]> = [['encoder', 'Encoder'], ['creation_time', 'Created'], ['location', 'Location'], ['com.apple.quicktime.location.iso6709', 'Location'], ['com.apple.quicktime.model', 'Camera']];

export async function readMediaMetadata(p: string): Promise<MetadataInfo> {
  const pr = await probe(p);
  const fmt = fmtFromPath(p);
  const keys = fmt && categoryOf(fmt) === 'audio' ? AUDIO_KEYS : VIDEO_KEYS;
  const fields: MetadataField[] = keys.map(([key, label]) => ({ key, label, value: pr.tags[key] ?? '', editable: true }));
  for (const [key, label] of READONLY) if (pr.tags[key]) fields.push({ key, label, value: pr.tags[key], editable: false });
  let coverDataUrl: string | undefined;
  if (pr.hasCover) {
    const buf = await runFfmpegToBuffer(['-i', p, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=256:256:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']);
    coverDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  const hasGps = Object.keys(pr.tags).some((k) => k.includes('location'));
  return { kind: 'media', fields, hasGps, hasCover: pr.hasCover, coverDataUrl };
}

export function registerMetadataIpc(): void {
  ipcMain.handle(IPC.readMetadata, async (_e, p: string) => {
    const fmt = fmtFromPath(p);
    const cat = fmt ? categoryOf(fmt) : null;
    if (cat === 'video' || cat === 'audio') return readMediaMetadata(p);
    // Task 9.7 adds 'image', Task 10.7 adds 'pdf'
    throw new Error('No metadata reader for this file type');
  });
}
```
Call `registerMetadataIpc()` from `registerIpc()`.

**Video metadata runner:** `metadataArgs(file.path, out, { removeAll, tags }, fmt)` with suffix `meta` (or `clean` when `removeAll`).
- If FFmpeg fails with `-map 0` (some containers reject data streams), retry once with the maps replaced by `-map 0:v? -map 0:a? -map 0:s?`.
- Note "Metadata removed" or "Metadata updated".

**Join runner (`tools/video/join.ts`):**
1. Order the files by `options.order` (paths). If it is empty, use the input order.
2. Get `facts` for each (`videoFacts`).
3. If `canConcatCopy(facts)`: write `concatListFile(paths)` to `ctx.tempPath('list.txt')` → run `concatArgs(list, out, firstFmt)`. Output ext = the first file's fmt.
4. Else, for the target size use the first clip's display size made even, and `fps = round(first.fps || 30)` capped at 60. Normalize each clip to `ctx.tempPath('n<i>.mp4')` (progress 0–0.8), then concat-copy those into `out.mp4` (0.8–1.0). Note "Clips were re-encoded to match".

**Spec: `MetadataPanel.tsx`** (440×640; shared with audio in 8.7)
- Load `api.readMetadata(file.path)`.
- Editable fields → `TextField`s. Read-only fields → grey rows. If `hasGps`, show a warning chip "Contains location".
- **Remove all metadata:** Toggle; when on, disable the fields.
- Audio only: a cover box with the current `coverDataUrl` and buttons **Change…** (`api.pickFiles()` → first image path) and **Remove**.
- Payload `{ removeAll, tags: only changed fields, coverPath, removeCover }`.

**Spec: `JoinPanel.tsx`** (460×620)
- `ReorderList` of the files (thumbnail, name, `formatDuration(durationSec)`, `width×height`).
- Warning line when clips differ (width/height/videoCodec/audioCodec mismatch): "Clips differ — they'll be re-encoded to MP4 (slower)."
- Apply "Join".
- Payload `{ order }`.

**Cases:**
- Metadata `{tags:{title:'Hello'}}` → `probe(o[0]).tags.title === 'Hello'`.
- Metadata `{removeAll:true}` on that output → no `title`.
- Join `[video.mp4, video.mp4]` → duration 8 ±0.3.
- Join `[video.mp4, video-noaudio.mp4]` → duration 6 ±0.4 and has audio.

---

## Task 7.11 — Video tools self-test + manual check (Milestone M3a)
1. `npm run selftest -- --only=tools.video` → 0 failed.
2. Manual (`npm run dev`) with `.selftest\fixtures\video.mp4`. For each of the 10 tools: Alt+drop in the window (Option+drop on macOS) → pick the tool → change options → Apply → check the output in the file manager.
3. The Crop panel must look like `crop-options.png`: rounded card, preview, aspect select, Reset + px readout, orange sliders, timeline and the orange Apply button.

---

# Phase 8 — Audio tools (Milestone M3b)

## Task 8.1 — Waveform preview + `Waveform` component
**Files:** add `previewWaveform` to `previews.ts` and its IPC; `components/Waveform.tsx`; `lib/useAudio.ts`
```ts
const waveCache = new Map<string, string>();
export async function previewWaveform(p: string, width: number, height: number): Promise<string> {
  const key = `${p}|${width}x${height}`;
  const hit = waveCache.get(key);
  if (hit) return hit;
  const w = Math.max(64, Math.round(width / 2) * 2);
  const h = Math.max(32, Math.round(height / 2) * 2);
  const buf = await runFfmpegToBuffer(['-i', p, '-filter_complex', `aformat=channel_layouts=mono,showwavespic=s=${w}x${h}:colors=0x8A8A8A`,
    '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
  const url = `data:image/png;base64,${buf.toString('base64')}`;
  waveCache.set(key, url);
  return url;
}
// in registerPreviewIpc():
ipcMain.handle(IPC.previewWaveform, (_e, p: string, w: number, h: number) => previewWaveform(p, Number(w) || 800, Number(h) || 120));
```
**`lib/useAudio.ts`** creates one `HTMLAudioElement` from `api.previewMedia(path).url` and returns `{ ready, playing, time, play(), pause(), toggle(), seek(t), playRange(a,b) }`. `playRange` stops at `b` using `timeupdate`.

**Spec: `Waveform.tsx`**
- Props: `{ file: FileInfo; time: number; onSeek(t); range?; onRange?; marks?; height?: number }`.
- Show the waveform image (from `api.previewWaveform(path, 800, height ?? 96)`) stretched to full width (`--surface-2` background, radius 10).
- Absolutely positioned on top: the selection shade (`--accent` 20 %) for `range`, red shades for `marks`, and a 2 px accent playhead line.
- Under it, a `TimeRange` with the same props (handles, keyboard).
- Left of the time labels, a round play/pause button using `useAudio`. **Space** toggles.

---

## Task 8.2 — `engines/audioArgs.ts` (pure) + tests
**Files:** `src/main/engines/audioArgs.ts`, `audioArgs.test.ts`
```ts
import type { AudioBleepOptions, AudioChannelsOptions, AudioCompressOptions, AudioNormalizeOptions, AudioTrimOptions, AudioVisualizeOptions, MediaMetadataOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { audioCodecArgs, type MediaFacts, type Quality } from './ffmpegArgs';

const t3 = (s: number): string => s.toFixed(3);
const LOSSLESS: Fmt[] = ['wav', 'flac', 'aiff'];

export function compressOutFmt(input: Fmt, choice: AudioCompressOptions['format']): Fmt {
  if (choice !== 'keep') return choice;
  return LOSSLESS.includes(input) ? 'mp3' : input;
}

export function compressAudioArgs(input: string, output: string, o: AudioCompressOptions, outFmt: Fmt): string[] {
  const k = `${o.bitrateKbps}k`;
  const codec: Partial<Record<Fmt, string[]>> = {
    mp3: ['-c:a', 'libmp3lame', '-b:a', k], m4a: ['-c:a', 'aac', '-b:a', k, '-movflags', '+faststart'],
    opus: ['-c:a', 'libopus', '-b:a', k, '-ar', '48000'], ogg: ['-c:a', 'libvorbis', '-b:a', k], wma: ['-c:a', 'wmav2', '-b:a', k]
  };
  const c = codec[outFmt];
  if (!c) throw new Error(`Cannot compress to ${outFmt}`);
  return ['-i', input, '-map', '0:a:0', '-vn', '-map_metadata', '0', ...c, ...(o.mono ? ['-ac', '1'] : []), output];
}

export function loudnormPass1(input: string, o: AudioNormalizeOptions): string[] {
  return ['-i', input, '-map', '0:a:0', '-af', `loudnorm=I=${o.target}:TP=${o.truePeak}:LRA=11:print_format=json`, '-f', 'null', '-'];
}

export interface LoudnormStats { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }

export function parseLoudnorm(stderr: string): LoudnormStats | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(stderr.slice(start, end + 1)) as LoudnormStats; } catch { return null; }
}

export function loudnormPass2(input: string, output: string, f: MediaFacts, o: AudioNormalizeOptions, s: LoudnormStats, fmt: Fmt, q: Quality): string[] {
  const af = `loudnorm=I=${o.target}:TP=${o.truePeak}:LRA=11:measured_I=${s.input_i}:measured_TP=${s.input_tp}`
    + `:measured_LRA=${s.input_lra}:measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true:print_format=summary`;
  // -ar BEFORE codec args so a codec-required rate (e.g. Opus 48 kHz) wins. loudnorm upsamples to 192 kHz otherwise.
  return ['-i', input, '-map', '0:a:0', '-vn', '-map_metadata', '0', '-af', af, '-ar', String(f.sampleRate || 48000), ...audioCodecArgs(fmt, q, f), output];
}

export function trimAudioArgs(input: string, output: string, f: MediaFacts, o: AudioTrimOptions, fmt: Fmt, q: Quality): string[] {
  const end = o.endSec > 0 ? Math.min(o.endSec, f.durationSec) : f.durationSec;
  const d = Math.max(0.05, end - o.startSec);
  const fades: string[] = [];
  if (o.fadeInSec > 0) fades.push(`afade=t=in:st=0:d=${t3(o.fadeInSec)}`);
  if (o.fadeOutSec > 0) fades.push(`afade=t=out:st=${t3(Math.max(0, d - o.fadeOutSec))}:d=${t3(o.fadeOutSec)}`);
  const a = ['-ss', t3(o.startSec), '-i', input, '-t', t3(d), '-map', '0:a:0', '-vn', '-map_metadata', '0'];
  if (fades.length) a.push('-af', fades.join(','), ...audioCodecArgs(fmt, q, f));
  else a.push('-c:a', 'copy');
  a.push(output);
  return a;
}

const CHANNEL_ARGS: Record<AudioChannelsOptions['mode'], string[]> = {
  mono: ['-ac', '1'], stereo: ['-ac', '2'],
  left: ['-af', 'pan=mono|c0=c0'], right: ['-af', 'pan=mono|c0=c1'], swap: ['-af', 'pan=stereo|c0=c1|c1=c0']
};

export function channelsArgs(input: string, output: string, f: MediaFacts, mode: AudioChannelsOptions['mode'], fmt: Fmt, q: Quality): string[] {
  // channel args AFTER codec args so they win over the codec's automatic "-ac 2"
  return ['-i', input, '-map', '0:a:0', '-vn', '-map_metadata', '0', ...audioCodecArgs(fmt, q, f), ...CHANNEL_ARGS[mode], output];
}

export function visualizeArgs(input: string, output: string, o: AudioVisualizeOptions): string[] {
  const W = Math.round(o.width / 2) * 2;
  const H = Math.round(o.height / 2) * 2;
  const color = o.color.replace('#', '0x');
  const bg = o.background.replace('#', '0x');
  if (o.kind === 'waveform-png') {
    return ['-i', input, '-filter_complex', `[0:a:0]aformat=channel_layouts=mono,showwavespic=s=${W}x${H}:colors=${color}[fg];color=c=${bg}:s=${W}x${H}[bg];[bg][fg]overlay=format=auto`, '-frames:v', '1', output];
  }
  if (o.kind === 'spectrogram-png') return ['-i', input, '-lavfi', `showspectrumpic=s=${W}x${H}:legend=1`, output];
  return ['-i', input, '-filter_complex',
    `[0:a:0]showwaves=s=${W}x${H}:mode=cline:rate=30:colors=${color},format=rgba[fg];color=c=${bg}:s=${W}x${H}:r=30[bg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output];
}

export function bleepArgs(input: string, output: string, f: MediaFacts, o: AudioBleepOptions, fmt: Fmt, q: Quality): string[] {
  const expr = o.ranges.map((r) => `between(t,${t3(r.startSec)},${t3(r.endSec)})`).join('+');
  const layout = (f.channels ?? 2) >= 2 ? 'stereo' : 'mono';
  const sr = f.sampleRate || 44100;
  const graph = o.sound === 'silence'
    ? `[0:a:0]volume=volume=0:enable='${expr}'[out]`
    : `[0:a:0]aformat=channel_layouts=${layout},volume=volume=0:enable='${expr}'[m];`
      + `sine=frequency=${o.frequency}:sample_rate=${sr},aformat=channel_layouts=${layout},volume=volume=0.35,volume=volume=0:enable='not(${expr})'[t];`
      + `[m][t]amix=inputs=2:duration=first:normalize=0[out]`;
  return ['-i', input, '-filter_complex', graph, '-map', '[out]', '-map_metadata', '0', ...audioCodecArgs(fmt, q, f), output];
}

export function audioMetadataArgs(input: string, output: string, o: MediaMetadataOptions, fmt: Fmt, hasCover: boolean, coverJpg: string | null): string[] {
  const coverOk = fmt === 'mp3' || fmt === 'm4a' || fmt === 'flac';
  const a = ['-i', input, ...(coverJpg && coverOk ? ['-i', coverJpg] : []), '-map', '0:a:0'];
  if (coverJpg && coverOk) a.push('-map', '1:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  else if (hasCover && coverOk && !o.removeCover && !o.removeAll) a.push('-map', '0:v:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  a.push('-c:a', 'copy', '-map_metadata', o.removeAll ? '-1' : '0');
  for (const [k, v] of Object.entries(o.tags)) a.push('-metadata', `${k}=${v}`);
  if (fmt === 'mp3') a.push('-id3v2_version', '3', '-write_id3v1', '1');
  if (fmt === 'm4a') a.push('-movflags', '+faststart');
  a.push(output);
  return a;
}

export function joinAudioArgs(inputs: string[], output: string, fmt: Fmt, q: Quality, f: MediaFacts): string[] {
  const ins = inputs.flatMap((p) => ['-i', p]);
  const pre = inputs.map((_, i) => `[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`).join(';');
  const cat = `${inputs.map((_, i) => `[a${i}]`).join('')}concat=n=${inputs.length}:v=0:a=1[out]`;
  return [...ins, '-filter_complex', `${pre};${cat}`, '-map', '[out]', ...audioCodecArgs(fmt, q, { ...f, sampleRate: 48000, channels: 2 }), output];
}
```
**Tests**
- `compressOutFmt('wav','keep')` → `'mp3'`; `compressOutFmt('ogg','keep')` → `'ogg'`.
- `parseLoudnorm('junk\n{\n"input_i" : "-23.0", "input_tp":"-5.0","input_lra":"3.0","input_thresh":"-33.0","target_offset":"0.1"\n}')` → `input_i === '-23.0'`.
- `loudnormPass2(..., fmt 'opus')`: the **last** `-ar` value in the args is `'48000'`.
- `trimAudioArgs` without fades contains `'-c:a','copy'`; with `fadeOutSec:1` and d=2 contains `afade=t=out:st=1.000`.
- `channelsArgs(..., 'mono', 'mp3', …)` with 6 channels: the last `-ac` value is `'1'`.
- `bleepArgs` with two ranges contains `between(t,1.000,2.000)+between(t,3.000,3.500)` and `amix`.

---

## Task 8.3 — Audio **Compress** and **Channels**
**Files:** `tools/audio/common.ts` (`audioFacts(file)` throws `UserError` without audio; `toolAudioQuality(ctx)` = `{ crf: 23, audioKbps: Math.max(192, ctx.settings.audioBitrateKbps) }`), `tools/audio/compress.ts`, `tools/audio/channels.ts`, panels, cases

**Compress runner:**
1. `outFmt = compressOutFmt(file.fmt, o.format)` → output suffix `compressed`, ext `outFmt` → run `compressAudioArgs`.
2. If the output is not smaller than the input: `dropOutput` + note "Already small — no smaller file was made". Otherwise note "8.4 MB → 2.1 MB (−75 %)".

**Channels runner:**
- Validate: `left/right/swap` need `channels ≥ 2`, otherwise `UserError('This file is mono.')`.
- Suffix by mode: `mono | stereo | left | right | swapped`.
- Output fmt = input fmt.

**Spec: `AudioCompressPanel.tsx`** (420×460)
- **Bitrate:** Segmented 64 / 96 / 128 / 160 / 192 / 256.
- **Format:** Select Keep (MP3 for WAV/FLAC/AIFF) / MP3 / M4A / Opus.
- Toggle **Mono**, with the hint "Halves the size. Good for speech."
- Info line "Current: 8.4 MB · 44.1 kHz · stereo".

**Spec: `ChannelsPanel.tsx`** (420×420)
- A radio list: "Stereo → Mono", "Mono → Stereo", "Left channel only", "Right channel only", "Swap left / right".
- Options that need stereo are disabled when `channels < 2`.

**Cases:**
- `audio.wav` compress 128 → mp3 output.
- Channels mono → `probe(o[0]).audio.channels === 1`.
- `stereo-lr.wav` swap → 2 channels.

---

## Task 8.4 — Audio **Normalize**
**Runner:**
1. `stderr = await runFfmpegCapture(loudnormPass1(...))` (progress 0–0.5 is unknown; call `ctx.progress(0.25, 'Measuring loudness')`).
2. `s = parseLoudnorm(stderr)`. If `null` → `ToolError('Could not measure loudness', stderr tail)`. If `s.input_i === '-inf'` → `UserError('This file is silent.')`.
3. Pass 2: `runFfmpeg(loudnormPass2(...))` with progress mapped to 0.5–1.
4. Output: same fmt, suffix `normalized`. Note `"−23.4 LUFS → −16 LUFS"`.

**Spec: `NormalizePanel.tsx`** (420×400)
- **Target:** Segmented "Streaming −14" / "Podcast −16" / "Broadcast −23" (LUFS).
- Note "Two-pass EBU R128 loudness normalization. Peaks are limited to −1.5 dBTP."
- Payload `{ target, truePeak: -1.5 }`.

**Case:** `audio.wav` → pcm_s16le output, duration 4 ±0.3.

---

## Task 8.5 — Audio **Trim** (with fades)
**Runner:** validate the selection length (≥ 0.1 s) → `trimAudioArgs` → suffix `trimmed`, same fmt.

**Spec: `AudioTrimPanel.tsx`** (480×560)
- `Waveform` with `range`.
- Buttons "Play selection", "Set start" (I) and "Set end" (O).
- **Fade in** and **Fade out** sliders, 0–5 s, step 0.1.
- Readout "Keeps 0:12.40".

**Case:** `audio.wav` start 1, end 3, fadeIn 0.5 → duration 2 ±0.1.

---

## Task 8.6 — Audio **Visualize** and **Bleep**
**Visualize runner:**
- `waveform-png` and `spectrogram-png` → ext `png`, suffix `waveform` / `spectrogram`.
- `waveform-mp4` → ext `mp4`, suffix `waveform`.
- Run `visualizeArgs`. For mp4, progress uses `durationSec`.

**Bleep runner:** require `ranges.length ≥ 1`. Clamp each range into `[0, duration]` and drop empty ones. Same fmt, suffix `bleeped`.

**Spec: `VisualizePanel.tsx`** (460×560)
- **Output:** Segmented "Waveform image" / "Spectrogram" / "Waveform video".
- **Size:** Select 1920×480 / 1280×720 / 1080×1080 / 1080×1920.
- **Colour:** swatches (accent `#FF5A1F`, `#1F1F1F`, `#FFFFFF`, `#2B6CFF`).
- **Background:** swatches (`#FFFFFF`, `#000000`, `#F3F3F2`).
- A static preview using `api.previewWaveform`.

**Spec: `BleepPanel.tsx`** (520×620)
- `Waveform` showing all ranges as `marks`, plus the selected range as `range`.
- "Add bleep at playhead" (key `B`) adds `[t, t+0.5]`.
- A list of ranges ("0:12.40 – 0:12.90"), each with a remove button; click to select.
- **Sound:** Segmented Beep / Silence.
- **Tone:** slider 400–2000 Hz (Beep only), with a "Preview tone" button that plays a short WebAudio oscillator. It is local and allowed.
- Apply disabled with 0 ranges.

**Cases:**
- Visualize waveform-png 1920×480 → png 1920×480.
- Visualize waveform-mp4 → h264 + aac.
- Bleep `[{1,2}]` → same codec, duration 4 ±0.2.

---

## Task 8.7 — Audio **Metadata** and **Join**
**Metadata runner:**
1. If `coverPath` is set: convert it to JPEG ≤ 1000 px with sharp → `ctx.tempPath('cover.jpg')`.
2. Run `audioMetadataArgs`.
3. For OGG/Opus/WAV/AIFF/WMA with a cover request: note "Cover art isn't supported for this format" and continue without the cover.

Reuse `MetadataPanel` from 7.10; it shows the cover box for audio.

**Join runner:** order like video join → `joinAudioArgs` → output fmt = first file's fmt, suffix `joined`. Reuse `JoinPanel` (it shows durations).

**Cases:**
- Metadata title "Song" on `audio.mp3` → `tags.title === 'Song'`.
- Join `[audio.wav, audio.mp3]` → duration 8 ±0.3.

---

## Task 8.8 — Audio self-test + manual check (Milestone M3b)
1. `npm run selftest -- --only=tools.audio` → 0 failed.
2. Manual pass over all audio tools with `C:\Windows\Media\*.wav` copies. Listen to the bleep result and the normalize result.

# Phase 9 — Image tools (Milestone M4)

## Task 9.1 — Image preview pipeline (main) + `ImagePreview` component
**Files:** `src/main/imagePreview.ts` (IPC `preview:image`), additions to `engines/image.ts` (`materialize`, `sameImageFmt`, `saveImageAs`), `components/ImagePreview.tsx`

**Add to `engines/image.ts`:**
```ts
/** Bake pending operations into raw pixels. Needed before a second rotate()/extract(). */
export async function materialize(img: sharp.Sharp): Promise<sharp.Sharp> {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

/** Tools keep the input format when Kabooks can write it. */
export function sameImageFmt(fmt: Fmt | null, heifEnc: boolean): 'jpg' | 'png' | 'webp' | 'avif' | 'tiff' | 'bmp' | 'heic' {
  if (fmt === 'jpg' || fmt === 'png' || fmt === 'webp' || fmt === 'avif' || fmt === 'tiff' || fmt === 'bmp') return fmt;
  if (fmt === 'heic') return heifEnc ? 'heic' : 'jpg';
  return 'png';   // svg and anything else
}

export async function saveImageAs(img: sharp.Sharp, fmt: ReturnType<typeof sameImageFmt>, out: string, quality: number,
  ctx: { tempPath(n: string): string; signal: AbortSignal }, keepMetadata = true): Promise<void> {
  if (fmt === 'bmp') return saveBmp(img, out, ctx.tempPath('bmp.png'));
  if (fmt === 'heic') return encodeHeic(img, out, quality, ctx.tempPath('heic.png'), ctx.signal);
  return saveRaster(img, fmt, out, quality, keepMetadata);
}
```
(Import `encodeHeic` from `./heif` and `Fmt` from `@shared/types`.)

**Code: `src/main/imagePreview.ts`**
```ts
import { ipcMain } from 'electron';
import sharp from 'sharp';
import { IPC } from '@shared/ipc';
import type { ImagePreviewRequest, ImagePreviewResult } from '@shared/types';
import { inspectBasic } from './inspect';
import { loadImage } from './engines/image';

const proxyCache = new Map<string, { data: Buffer; width: number; height: number; channels: 1 | 2 | 3 | 4 }>();

/** Decoded, auto-oriented, downscaled raw pixels (cached, max 6 entries). */
export async function proxy(path: string, maxSide: number): Promise<sharp.Sharp> {
  const key = `${path}|${maxSide}`;
  let hit = proxyCache.get(key);
  if (!hit) {
    const { data, info } = await (await loadImage(inspectBasic(path), { density: 144 }))
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    hit = { data, width: info.width, height: info.height, channels: info.channels };
    if (proxyCache.size >= 6) proxyCache.delete(proxyCache.keys().next().value as string);
    proxyCache.set(key, hit);
  }
  return sharp(hit.data, { raw: { width: hit.width, height: hit.height, channels: hit.channels } });
}

async function toResult(img: sharp.Sharp, extra: Partial<ImagePreviewResult> = {}): Promise<ImagePreviewResult> {
  const { data, info } = await img.png().toBuffer({ resolveWithObject: true });
  return { dataUrl: `data:image/png;base64,${data.toString('base64')}`, width: info.width, height: info.height, ...extra };
}

export async function previewImage(req: ImagePreviewRequest): Promise<ImagePreviewResult> {
  const base = await proxy(req.path, req.maxSide);
  switch (req.op) {
    case 'none': return toResult(base);
    // 'crop' (9.3), 'compress' (9.2), 'edit' (9.4), 'background' (9.5), 'collage' (9.8) are added by their tasks
    default: return toResult(base);
  }
}

export function registerImagePreviewIpc(): void {
  ipcMain.handle(IPC.previewImage, (_e, req: ImagePreviewRequest) => previewImage(req));
}
```
Call `registerImagePreviewIpc()` from `registerIpc()`.

**Spec: `ImagePreview.tsx`**
- Props: `{ request: ImagePreviewRequest; children?: ReactNode; maxHeight?: number; onLoaded?(r: ImagePreviewResult): void }`.
- Debounce request changes by 120 ms → `api.previewImage(request)`. Keep showing the previous image with a faint spinner until the new one arrives, and ignore stale responses (use a request counter).
- The container uses `aspectRatio: width / height` of the latest result. The `children` overlay sits exactly over the image (same pattern as `MediaPreview`).
- Optional prop `compare`: a "Hold to compare" button. While it is pressed, show the `op:'none'` result.

---

## Task 9.2 — Image **Compress** (live size estimate) and **Resize**
**Files:** `tools/image/compress.ts`, `tools/image/resize.ts`, add `'compress'` to `previewImage`, panels, cases

**Compress runner:**
```ts
export async function compressImageTo(file: FileInfo, o: ImageCompressOptions, out: string | null): Promise<{ buffer: Buffer; fmt: string }> {
  const fmt = o.format === 'keep' ? (['jpg', 'png', 'webp', 'avif'].includes(file.fmt ?? '') ? (file.fmt as string) : 'jpg') : o.format;
  let img = await loadImage(file);
  if (o.maxSide > 0) img = img.resize({ width: o.maxSide, height: o.maxSide, fit: 'inside', withoutEnlargement: true });
  if (!o.stripMetadata) img = img.withMetadata();
  if (fmt === 'png') img = img.png({ palette: true, quality: o.quality, effort: 7, compressionLevel: 9 });
  else if (fmt === 'webp') img = img.webp({ quality: o.quality, effort: 5 });
  else if (fmt === 'avif') img = img.avif({ quality: Math.round(o.quality * 0.65), effort: 4 });
  else img = img.flatten({ background: '#ffffff' }).jpeg({ quality: o.quality, mozjpeg: true });
  const buffer = await img.toBuffer();
  if (out) await fs.promises.writeFile(out, buffer);
  return { buffer, fmt };
}

export const runImageCompress: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageCompressOptions>('image.compress', options);
  const fmt = o.format === 'keep' ? (['jpg', 'png', 'webp', 'avif'].includes(file.fmt ?? '') ? (file.fmt as string) : 'jpg') : o.format;
  const out = ctx.newOutput({ source: file.path, ext: fmt, suffix: 'compressed' });
  const { buffer } = await compressImageTo(file, o, out);
  if (buffer.length >= file.size) { ctx.dropOutput(out); ctx.note(`${file.name} is already small`); return; }
  ctx.note(`${formatBytes(file.size)} → ${formatBytes(buffer.length)} (−${Math.round((1 - buffer.length / file.size) * 100)}%)`);
};
```
In `previewImage`, case `'compress'`:
- Run `compressImageTo(inspectBasic(req.path), options, null)` at **full resolution** to get the real size.
- Return `toResult(sharp(buffer).resize(maxSide…))` with `bytes: buffer.length` and `originalBytes: stat.size`.

**Resize runner:**
- Compute the target size from the original `imageSize(file)`:
  - percent → `round(w*p/100)`.
  - pixels:
    - keepAspect with both values set → `fit: 'inside'`;
    - one value 0 → auto;
    - not keepAspect → `fit: 'fill'`.
- `saveImageAs(img.resize(...), sameImageFmt(file.fmt, ctx.caps.heifEnc), out, max(settings.imageQuality, 90), ctx)` with suffix `resized`.

**Spec: `ImageCompressPanel.tsx`** (440×600)
- `ImagePreview` with `op:'compress'` and `compare`.
- A large size readout: "2.4 MB → 640 KB (−73 %)", from `bytes/originalBytes`.
- **Quality** slider 10–100.
- **Max size** Select Original / 4096 / 2560 / 1920 / 1280 px.
- **Format** Select Keep / JPG / WebP / AVIF.
- Toggle "Remove metadata (EXIF, GPS)", default on.
- With more than one file, the preview shows the first file and the apply label reads "Compress 12 images".

**Spec: `ResizePanel.tsx`** (420×420)
- Segmented Percent / Pixels.
- Percent: slider 5–200 %.
- Pixels: width and height fields with a "Lock aspect" toggle; changing one updates the other using the first file's ratio.
- Readout "4032×3024 → 2016×1512".

**Cases:**
- Compress `photo.jpg` quality 40 → jpeg smaller than the source.
- Compress `image.png` → png output **or** a dropped output plus a note. The job must not error.
- Resize 50 % `image.png` → 400×300 png.

---

## Task 9.3 — Image **Crop / rotate / flip**
**Files:** `tools/image/crop.ts`; generalise `panels/video/CropPanel.tsx` into `panels/common/CropPanel.tsx` with `kind: 'video' | 'image'`; add `'crop'` to `previewImage`
```ts
export const runImageCrop: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageCropOptions>('image.crop', options);
  let img = await materialize(await loadImage(file));           // auto-orient baked in
  if (o.rotate) img = img.rotate(o.rotate);
  if (o.flipV) img = img.flip();
  if (o.flipH) img = img.flop();
  img = await materialize(img);                                  // rotation baked in, so extract uses rotated coords
  const meta = await img.metadata();
  const r = toPixelRect(clampNormRect(o.rect), meta.width ?? 0, meta.height ?? 0);
  if (!isFullRect(o.rect)) img = img.extract({ left: r.x, top: r.y, width: r.w, height: r.h });
  const fmt = sameImageFmt(file.fmt, ctx.caps.heifEnc);
  await saveImageAs(img, fmt, ctx.newOutput({ source: file.path, ext: fmt, suffix: 'cropped' }), Math.max(ctx.settings.imageQuality, 92), ctx);
};
```
- `previewImage` `'crop'`: apply `rotate/flipH/flipV` from `options` to the proxy (materialize first, then rotate), and return the result. The CropBox then uses the rotated proxy's aspect ratio.
- **Panel (image mode):** same layout as the video crop panel, but with `ImagePreview` (`op:'crop'`) instead of `MediaPreview`, a row of icon buttons ⟲ ⟳ ⇋ ⇵, and no timeline.
  - Rotating resets the rect to `FULL_RECT`.
  - The px readout uses the rotated original size: for 90/270 swap `file.width`/`file.height`.

**Cases:**
- `image.png` with rect `{x:0,y:0,w:.5,h:.5}` → 400×300.
- rotate 90 + full rect → 600×800.

---

## Task 9.4 — Image **Edit** (adjustments & effects)
**Files:** `src/shared/editPipeline.ts` (+ test), `src/main/engines/imageEdit.ts`, `tools/image/edit.ts`, add `'edit'` to `previewImage`, `panels/image/EditPanel.tsx`

**Code: `shared/editPipeline.ts`**
```ts
import type { EditParams } from './toolOptions';

type M3 = [[number, number, number], [number, number, number], [number, number, number]];
const I: M3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const SEPIA: M3 = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];

export function mul(a: M3, b: M3): M3 {
  const r = (i: number, j: number): number => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return [[r(0, 0), r(0, 1), r(0, 2)], [r(1, 0), r(1, 1), r(1, 2)], [r(2, 0), r(2, 1), r(2, 2)]];
}
function mix(a: M3, b: M3, t: number): M3 {
  return a.map((row, i) => row.map((v, j) => v * t + b[i][j] * (1 - t))) as M3;
}

export interface EditSpec {
  linear: [number, number] | null;                       // out = a*in + b
  modulate: { saturation: number; hue: number } | null;
  recomb: M3 | null;
  grayscale: boolean;
  negate: boolean;
  sharpenSigma: number | null;
  blurSigma: number | null;
  vignette: number;                                       // 0..1
}

export function buildEditSpec(p: EditParams): EditSpec {
  const m = Math.pow(2, p.exposure);
  const c = 1 + p.contrast / 100;
  const a = m * c;
  const b = 128 * (1 - c) + p.brightness * 1.28;
  const sat = 1 + p.saturation / 100;
  let recomb: M3 | null = null;
  if (p.warmth !== 0) {
    const w = (p.warmth / 100) * 0.12;
    recomb = [[1 + w, 0, 0], [0, 1, 0], [0, 0, 1 - w]];
  }
  if (p.effect === 'sepia' || p.effect === 'vintage') {
    const s = p.effect === 'sepia' ? SEPIA : mix(SEPIA, I, 0.5);
    recomb = mul(s, recomb ?? I);
  }
  return {
    linear: Math.abs(a - 1) > 1e-6 || Math.abs(b) > 1e-6 ? [a, b] : null,
    modulate: sat !== 1 || p.hue !== 0 ? { saturation: sat, hue: Math.round(p.hue) } : null,
    recomb,
    grayscale: p.effect === 'bw',
    negate: p.effect === 'invert',
    sharpenSigma: p.detail > 0 ? 0.5 + p.detail / 40 : null,
    blurSigma: p.blur > 0 ? 0.3 + p.blur / 5 : null,
    vignette: Math.min(1, (p.vignette + (p.effect === 'vintage' ? 35 : 0)) / 100)
  };
}
```
**Tests:**
- `buildEditSpec(DEFAULT_EDIT)` → every field null/false/0.
- exposure 1 → `linear [2,0]`.
- contrast 50 → `linear [1.5,-64]`.
- effect sepia → `recomb` not null.
- effect vintage → `vignette 0.35`.

**Code: `engines/imageEdit.ts`**
```ts
import sharp from 'sharp';
import type { EditSpec } from '@shared/editPipeline';

function vignetteSvg(w: number, h: number, strength: number): Buffer {
  const k = Math.round(255 * (1 - 0.75 * strength));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%">`
    + `<stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="rgb(${k},${k},${k})"/></radialGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#v)"/></svg>`);
}

/** Same function for the preview (proxy) and the final export, so the preview matches the output. */
export function applyEdit(img: sharp.Sharp, spec: EditSpec, size: { width: number; height: number }): sharp.Sharp {
  let s = img;
  if (spec.linear) s = s.linear(spec.linear[0], spec.linear[1]);
  if (spec.modulate) s = s.modulate({ saturation: spec.modulate.saturation, hue: spec.modulate.hue });
  if (spec.recomb) s = s.recomb(spec.recomb);
  if (spec.grayscale) s = s.grayscale();
  if (spec.negate) s = s.negate({ alpha: false });
  if (spec.sharpenSigma) s = s.sharpen({ sigma: spec.sharpenSigma });
  if (spec.blurSigma) s = s.blur(spec.blurSigma);
  if (spec.vignette > 0) s = s.composite([{ input: vignetteSvg(size.width, size.height, spec.vignette), blend: 'multiply' }]);
  return s;
}
```
- **Runner:** `img = await materialize(await loadImage(file))` → get the size from `metadata()` → `applyEdit` → `saveImageAs(sameFmt, quality max(settings,92))` with suffix `edited`.
- **Preview** `'edit'`: proxy → `applyEdit(proxy, buildEditSpec(options), proxySize)`.

**Spec: `EditPanel.tsx`** (780×620, two columns)
- **Left (440 px):** `ImagePreview` `op:'edit'` with `compare` ("Hold to compare").
- **Right:** scrollable groups:
  - **Light:** Exposure (−2…+2 EV, step 0.05), Brightness, Contrast.
  - **Colour:** Saturation, Warmth, Hue (−180…180).
  - **Detail:** Sharpen (0–100), Blur (0–100).
  - **Effects:** a Segmented of thumbnail chips None / B&W / Sepia / Vintage / Invert, plus a Vignette slider.
- **Reset** sets `DEFAULT_EDIT`.
- Double-click a slider label to reset just that slider.
- Payload: `EditParams`.

**Cases:**
- Edit `image.png` with `{exposure:0.5, effect:'bw'}` → png output where corner pixel (0,0) alpha is 0 (transparency kept). Check with `sharp(o[0]).ensureAlpha().extract({left:0,top:0,width:1,height:1}).raw().toBuffer()` → `[3] === 0`.
- Edit `photo.jpg` sepia → jpeg.

---

## Task 9.5 — Image **Backdrop** (add a background)
**Files:** `src/main/engines/imageBackground.ts`, `tools/image/background.ts`, add `'background'` to `previewImage`, `panels/image/BackgroundPanel.tsx`
```ts
import sharp from 'sharp';
import type { ImageBackgroundOptions } from '@shared/toolOptions';

const RATIO: Record<string, number> = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9, '9:16': 9 / 16 };

function gradientSvg(w: number, h: number, [c1, c2]: [string, string], angle: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>`
    + `<linearGradient id="g" gradientTransform="rotate(${angle - 90} .5 .5)"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`
    + `</defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
}
function roundedMask(w: number, h: number, r: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
}
function shadowSvg(W: number, H: number, x: number, y: number, w: number, h: number, r: number): Buffer {
  const blur = Math.max(6, Math.round(Math.min(w, h) * 0.03));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">`
    + `<feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect x="${x}" y="${y + blur}" width="${w}" height="${h}" rx="${r}" fill="rgba(0,0,0,0.35)" filter="url(#s)"/></svg>`);
}

/** `src` must already be materialized (raw/PNG) at the size you want. */
export async function composeBackground(src: sharp.Sharp, o: ImageBackgroundOptions): Promise<sharp.Sharp> {
  const fgPng = await src.clone().ensureAlpha().png().toBuffer();
  const meta = await sharp(fgPng).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const pad = Math.round(Math.max(w, h) * o.paddingPct / 100);
  let W = w + 2 * pad;
  let H = h + 2 * pad;
  const ratio = RATIO[o.aspect];
  if (ratio) { if (W / H > ratio) H = Math.round(W / ratio); else W = Math.round(H * ratio); }
  const radius = Math.round(Math.min(w, h) * o.radiusPct / 100);
  const fg = radius > 0 ? await sharp(fgPng).composite([{ input: roundedMask(w, h, radius), blend: 'dest-in' }]).png().toBuffer() : fgPng;
  let bg: Buffer;
  if (o.kind === 'solid') bg = await sharp({ create: { width: W, height: H, channels: 4, background: o.color } }).png().toBuffer();
  else if (o.kind === 'gradient') bg = await sharp(gradientSvg(W, H, o.gradient, o.angle)).png().toBuffer();
  else bg = await sharp(fgPng).resize(W, H, { fit: 'cover' }).blur(Math.max(20, Math.round(W / 40))).modulate({ brightness: 0.9 }).png().toBuffer();
  const left = Math.round((W - w) / 2);
  const top = Math.round((H - h) / 2);
  const layers: sharp.OverlayOptions[] = [];
  if (o.shadow) layers.push({ input: shadowSvg(W, H, left, top, w, h, radius), left: 0, top: 0 });
  layers.push({ input: fg, left, top });
  return sharp(bg).composite(layers);
}
```
- **Runner:** `materialize(loadImage)` → `composeBackground` → output `jpg` if the source is JPG, otherwise `png`; suffix `backdrop`.
- **Preview** `'background'`: proxy (max 900) → `composeBackground`.

**Spec: `BackgroundPanel.tsx`** (780×600)
- Preview on the left.
- Right column:
  - **Type:** Segmented Gradient / Solid / Blur.
  - **Gradient presets:** 6 swatches. Sunrise `#FFB38A→#FF5A1F`, Ocean `#8EC5FC→#3B6CFF`, Mint `#C3F0D6→#2BB673`, Dusk `#F7CAC9→#7F7FD5`, Silver `#F5F5F5→#D6D6D6`, Night `#434343→#000000`.
  - **Solid:** swatches plus `<input type="color">`.
  - **Padding** 0–30 %, **Corners** 0–20 %, **Shadow** toggle.
  - **Canvas:** Segmented Auto / 1:1 / 4:5 / 16:9 / 9:16.
- Payload `ImageBackgroundOptions`.

**Case:** `image.png` with defaults → png larger than 800×600.

---

## Task 9.6 — Image **Redact**
**Files:** `tools/image/redact.ts`, `panels/image/RedactPanel.tsx` (reuse `RectEditor` over `ImagePreview` `op:'none'`)
```ts
export const runImageRedact: ToolRunFn = async ([file], options, ctx) => {
  const o = withDefaults<ImageRedactOptions>('image.redact', options);
  if (o.regions.length === 0) throw new UserError('Draw at least one box over the area to hide.');
  const base = await materialize(await loadImage(file));
  const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const raw = { width: info.width, height: info.height, channels: info.channels };
  const layers: sharp.OverlayOptions[] = [];
  for (const reg of o.regions) {
    const r = toPixelRect(clampNormRect(reg.rect), info.width, info.height);
    const region = sharp(data, { raw }).extract({ left: r.x, top: r.y, width: r.w, height: r.h });
    let input: Buffer;
    if (reg.style === 'black') input = await sharp({ create: { width: r.w, height: r.h, channels: 4, background: '#000000' } }).png().toBuffer();
    else if (reg.style === 'blur') input = await region.blur(Math.max(12, Math.min(r.w, r.h) / 6)).png().toBuffer();
    else {
      const small = await region.resize(Math.max(1, Math.ceil(r.w / 16)), Math.max(1, Math.ceil(r.h / 16)), { kernel: 'nearest' }).png().toBuffer();
      input = await sharp(small).resize(r.w, r.h, { kernel: 'nearest' }).png().toBuffer();
    }
    layers.push({ input, left: r.x, top: r.y });
  }
  const fmt = sameImageFmt(file.fmt, ctx.caps.heifEnc);
  await saveImageAs(sharp(data, { raw }).composite(layers), fmt, ctx.newOutput({ source: file.path, ext: fmt, suffix: 'redacted' }), 92, ctx, false);
  ctx.note('Metadata removed');
};
```
**Panel:** like video redact without the timeline. Style per box: Blur / Pixelate / Black. Hint "Redaction is permanent and removes photo metadata."

**Case:** a black box `{x:0,y:0,w:.25,h:.25}` on `photo.jpg` → pixel (5,5) is near black (sum of RGB < 30).

---

## Task 9.7 — Image **Metadata** (read, remove all, remove GPS, edit)
**Files:** `src/main/engines/imageMeta.ts` (pure, + test), `src/main/engines/imageMetaEdit.ts` (piexif), extend `src/main/metadata.ts` (images), `tools/image/metadata.ts`, `panels/image/ImageMetadataPanel.tsx`

**Code: `engines/imageMeta.ts`** (pure; no Node or electron imports)
```ts
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function ascii(buf: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && start + i < buf.length; i++) s += String.fromCharCode(buf[start + i]);
  return s;
}

/** Lossless: drop EXIF/XMP (APP1), IPTC (APP13), comments and other APPn segments. Keeps JFIF, Adobe and (optionally) ICC. */
export function stripJpegMetadata(buf: Uint8Array, keepIcc = true): Uint8Array {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Not a JPEG file');
  const parts: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new Error('Corrupt JPEG');
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xda || marker === 0xd9) { parts.push(buf.subarray(i)); return concat(parts); }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const seg = buf.subarray(i, i + 2 + len);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = marker === 0xfe ? false
      : !isApp ? true
      : marker === 0xe0 || marker === 0xee || (marker === 0xe2 && keepIcc && ascii(seg, 4, 12) === 'ICC_PROFILE\0');
    if (keep) parts.push(seg);
    i += 2 + len;
  }
  return concat(parts);
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** Lossless: drop text/EXIF/time chunks from a PNG. */
export function stripPngMetadata(buf: Uint8Array): Uint8Array {
  for (let k = 0; k < 8; k++) if (buf[k] !== PNG_SIG[k]) throw new Error('Not a PNG file');
  const parts: Uint8Array[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf[i] * 0x1000000 + (buf[i + 1] << 16) + (buf[i + 2] << 8) + buf[i + 3];
    const type = ascii(buf, i + 4, 4);
    const end = i + 12 + len;
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return concat(parts);
}
```
**Tests:**
- Build a JPEG byte array by hand: `FFD8`, APP0(`FFE0 0010 'JFIF\0' …`), APP1(`FFE1 0008 'Exif' 00 00`), COM(`FFFE 0005 'hi!'`), `FFDA` + some bytes + `FFD9`. The output contains the APP0 bytes and no `FFE1` or `FFFE` markers.
- A PNG with IHDR, tEXt, IDAT and IEND: the output has no `tEXt`, and IDAT is intact.

**Code: `engines/imageMetaEdit.ts`**
```ts
import piexif from 'piexifjs';

type ExifObj = Record<string, Record<number, unknown> | null | undefined>;

function loadExif(bin: string): ExifObj {
  try { return piexif.load(bin) as ExifObj; } catch { return { '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {}, thumbnail: null }; }
}
function dumpSafe(exif: ExifObj): string {
  const e = { ...exif, thumbnail: null, '1st': {} } as ExifObj;
  if (e.Exif) delete (e.Exif as Record<number, unknown>)[piexif.ExifIFD.MakerNote];   // MakerNotes often break dump()
  return piexif.dump(e);
}

export function jpegRemoveGps(buf: Buffer): Buffer {
  const bin = buf.toString('binary');
  const exif = loadExif(bin);
  exif.GPS = {};
  return Buffer.from(piexif.insert(dumpSafe(exif), bin), 'binary');
}

export function jpegEditFields(buf: Buffer, f: { artist?: string; copyright?: string; description?: string; dateTaken?: string }): Buffer {
  const bin = buf.toString('binary');
  const exif = loadExif(bin);
  const zeroth = (exif['0th'] ??= {}) as Record<number, unknown>;
  const ex = (exif.Exif ??= {}) as Record<number, unknown>;
  if (f.artist !== undefined) zeroth[piexif.ImageIFD.Artist] = f.artist;
  if (f.copyright !== undefined) zeroth[piexif.ImageIFD.Copyright] = f.copyright;
  if (f.description !== undefined) zeroth[piexif.ImageIFD.ImageDescription] = f.description;
  if (f.dateTaken) ex[piexif.ExifIFD.DateTimeOriginal] = f.dateTaken;   // "YYYY:MM:DD HH:MM:SS"
  return Buffer.from(piexif.insert(dumpSafe(exif), bin), 'binary');
}
```
**Read (extend `metadata.ts`).** Use `exifr.parse(path, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false })`, wrapped in `.catch(() => null)`.
- Fields: Camera make, Camera, Lens, Date taken (editable), Exposure, Aperture, ISO, Focal length, Software, Artist (editable), Copyright (editable), Description (editable).
- Location as `lat, lon` (read-only) and `hasGps: true`.
- Always include the 4 editable fields, empty if missing.
- In the `meta:read` handler, route `category === 'image'` here.

**Runner:**
- **remove-all**
  - JPG → `stripJpegMetadata`.
  - PNG → `stripPngMetadata`.
  - Others → `saveImageAs(loadImage(file), sameFmt, out, 95, ctx, false)`.
  - Suffix `clean`.
- **remove-gps**
  - JPG → `jpegRemoveGps`.
  - Others → re-encode with `withExif({ IFD0: { Artist, Copyright, ImageDescription } })` from the exifr values (no GPS).
  - Suffix `nogps`.
- **edit**
  - JPG → `jpegEditFields`.
  - Others → re-encode with `withExif` containing the new fields.
  - Suffix `meta`.
  - Convert `dateTaken` from the `<input type="datetime-local">` value to `YYYY:MM:DD HH:MM:SS`.

**Spec: `ImageMetadataPanel.tsx`** (460×640)
- Read-only table of the EXIF fields. A red "Location" chip when `hasGps`.
- **Action:** Segmented "Remove all" / "Remove location" / "Edit".
- Edit fields (Artist, Copyright, Description, Date taken) are shown only in Edit.
- Note "JPEG and PNG are cleaned without re-compressing."
- Supports multiple files: the table shows the first file, and the apply label reads "Clean 12 images".

**Fixture `gps.jpg`:**
```ts
'gps.jpg': async (out, dir) => {
  const jpg = await sharp(await ensureFixture(dir, 'image.png')).flatten({ background: '#fff' }).jpeg().toBuffer();
  const exif = { '0th': { [piexif.ImageIFD.Artist]: 'Tester' }, Exif: {}, GPS: {
    [piexif.GPSIFD.GPSLatitudeRef]: 'N', [piexif.GPSIFD.GPSLatitude]: [[21, 1], [1, 1], [3000, 100]],
    [piexif.GPSIFD.GPSLongitudeRef]: 'E', [piexif.GPSIFD.GPSLongitude]: [[105, 1], [51, 1], [0, 1]] } };
  await fs.promises.writeFile(out, Buffer.from(piexif.insert(piexif.dump(exif), jpg.toString('binary')), 'binary'));
},
```
**Cases:**
- remove-all → `exifr.parse(out)` has no `Artist` and no `latitude`.
- remove-gps → `Artist === 'Tester'` and no `latitude`.
- edit `{artist:'New'}` → `Artist === 'New'`.

---

## Task 9.8 — Image **Collage**
**Files:** `src/shared/collageLayout.ts` (+ test), `src/main/engines/imageCollage.ts`, `tools/image/collage.ts`, add `'collage'` to `previewImage`, `panels/image/CollagePanel.tsx`

**Code: `shared/collageLayout.ts`**
```ts
export interface Cell { x: number; y: number; w: number; h: number }
export type CollageLayout = 'grid' | 'row' | 'column' | 'featured';

export function collageCells(n: number, layout: CollageLayout, width: number, gap: number): { width: number; height: number; cells: Cell[] } {
  const W = Math.round(width);
  const idx = Array.from({ length: n }, (_, i) => i);
  if (layout === 'row') {
    const cw = (W - gap * (n + 1)) / n;
    return { width: W, height: Math.round(cw + 2 * gap), cells: idx.map((i) => ({ x: gap + i * (cw + gap), y: gap, w: cw, h: cw })) };
  }
  if (layout === 'column') {
    const cw = W - 2 * gap;
    const ch = cw * 0.75;
    return { width: W, height: Math.round(n * ch + (n + 1) * gap), cells: idx.map((i) => ({ x: gap, y: gap + i * (ch + gap), w: cw, h: ch })) };
  }
  if (layout === 'featured' && n >= 2) {
    const bigW = (W - 3 * gap) * (2 / 3);
    const smallW = W - 3 * gap - bigW;
    const H = Math.round(bigW * 0.75 + 2 * gap);
    const rest = n - 1;
    const sh = (H - (rest + 1) * gap) / rest;
    return {
      width: W, height: H,
      cells: [{ x: gap, y: gap, w: bigW, h: H - 2 * gap }, ...idx.slice(1).map((i) => ({ x: 2 * gap + bigW, y: gap + (i - 1) * (sh + gap), w: smallW, h: sh }))]
    };
  }
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cw = (W - gap * (cols + 1)) / cols;
  return {
    width: W, height: Math.round(rows * cw + (rows + 1) * gap),
    cells: idx.map((i) => ({ x: gap + (i % cols) * (cw + gap), y: gap + Math.floor(i / cols) * (cw + gap), w: cw, h: cw }))
  };
}
```
**Tests:**
- grid n=4, W=1000, gap=0 → 1000×1000 with cells of 500.
- row n=3, gap=10 → 3 cells, all with y=10.
- featured n=3 → the first cell's width is about 2× the others'.

**Engine `composeCollage(files, o)`.** Sequential, to save memory. For each cell:
1. `loadImage(file).resize(round w, round h, { fit: o.fit === 'cover' ? 'cover' : 'contain', position: o.fit === 'cover' ? sharp.strategy.attention : 'centre', background: o.background })`.
2. Round the corners with the `dest-in` mask from 9.5 when `radius > 0`.
3. Composite onto `sharp({ create: { width, height, channels: 4, background: o.background } })`.

Output JPEG (quality 90), named after the first image with suffix `collage`.
**Preview** `'collage'`: the same with `o.width = 800`, using `paths` from the request.

**Spec: `CollagePanel.tsx`** (840×620)
- Left: preview.
- Right:
  - **Layout** Segmented Grid / Row / Column / Featured.
  - `ReorderList` of images.
  - **Gap** 0–40.
  - **Corners** 0–40.
  - **Background** swatches.
  - **Width** Select 1080 / 2048 / 4096.
  - **Fit** Segmented "Fill (crop)" / "Fit (whole image)".

**Case:** collage of `[image.png, photo.jpg, image.webp]` in grid → a JPEG output 2048 wide.

---

## Task 9.9 — **Make PDF** from images
**Files:** `tools/image/pdf.ts`, `panels/image/MakePdfPanel.tsx`

**Runner:**
1. Order the files by `options.order` (or the input order).
2. If `combine`, call `imagesToPdf(all, {pageSize, margin}, ctx.newOutput({ source: first.path, ext: 'pdf' }), …)`.
3. Otherwise produce one PDF per image (newOutput per file).
4. Note "12 pages".

**Spec: `MakePdfPanel.tsx`** (460×620)
- `ReorderList`.
- **Page size:** Segmented Fit image / A4 / Letter.
- **Margins:** Segmented None / Small / Large.
- Toggle **"One PDF for all images"**, default on.

**Case:** `[image.png, photo.jpg]` combined A4 → 2 pages.

---

## Task 9.10 — Image self-test + manual check (Milestone M4)
1. `npm run selftest -- --only=tools.image` → 0 failed.
2. Manual pass in the app with a real phone photo (HEIC if possible):
   - Edit: the preview responds within about 200 ms.
   - Crop with rotation.
   - Compress: the live estimate updates.
   - Backdrop presets.
   - Collage with 4 photos.

---

# Phase 10 — PDF tools (Milestone M5)

## Task 10.1 — `pdfOps` editing functions; **Merge** and **Split**
**Files:** extend `engines/pdfOps.ts`, `tools/pdf/merge.ts`, `tools/pdf/split.ts`, `panels/pdf/MergePanel.tsx` (reuse `ReorderList`), `panels/pdf/SplitPanel.tsx`
```ts
import { degrees, PDFDocument } from 'pdf-lib';
import { UserError } from '../errors';

export async function loadPdf(filePath: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await fs.promises.readFile(filePath), { updateMetadata: false });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'EncryptedPDFError' || /encrypt/i.test(err.message)) throw new UserError('This PDF is password-protected. Remove the password first, then try again.');
    throw new UserError('This PDF could not be opened. It may be damaged.', err.message);
  }
}

export async function extractPages(src: PDFDocument, indexes: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of await doc.copyPages(src, indexes)) doc.addPage(p);
  return doc.save({ useObjectStreams: true });
}

export async function mergePdfs(paths: string[], onProgress: (f: number) => void): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (let i = 0; i < paths.length; i++) {
    const src = await loadPdf(paths[i]);
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
    onProgress((i + 1) / paths.length);
  }
  return merged.save({ useObjectStreams: true });
}

export async function organizePdf(src: PDFDocument, pages: Array<{ src: number; rotate: number }>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, pages.map((p) => p.src));
  copied.forEach((pg, i) => {
    pg.setRotation(degrees((pg.getRotation().angle + pages[i].rotate) % 360));
    doc.addPage(pg);
  });
  return doc.save({ useObjectStreams: true });
}
```
**Split runner.** Build `groups`, then write each group:
- `each` → `[[0],[1],…]`.
- `every` → chunks of N.
- `ranges` → `parsePageRanges(ranges, total)`. Catch `RangeError` → `UserError(err.message)`.
- `extract` → `[flattenRanges(parsePageRanges(ranges, total))]`.

Write with `extractPages`:
- More than one group → `newOutput({ group: 'part', index, total })`.
- Single group → suffix `extract` (or `part` for `every` when it produces 1).

**Spec: `SplitPanel.tsx`** (440×480)
- Segmented "Every page" / "Every N pages" / "Custom ranges" / "Extract pages".
- N stepper.
- Ranges text field with live validation (show the `RangeError` message under it, using `FileInfo.pages`).
- Text "Creates N files".

**Merge:** ordered paths → `mergePdfs` → output named after the first file with suffix `merged`. Note "N pages".

**Cases:**
- Merge `[doc.pdf, doc.pdf]` → 6 pages.
- Split each → 3 outputs of 1 page each.
- Ranges `'1-2,3'` → 2 outputs.
- Extract `'2'` → 1 output of 1 page.
- `'9'` → error matching `/doesn't exist/`.

---

## Task 10.2 — PDF **Organize** (thumbnail grid)
**Files:** `tools/pdf/organize.ts`, `panels/pdf/OrganizePanel.tsx` (**920×700**)

**Runner:** `pages` is empty → UserError "Nothing changed". Otherwise run `organizePdf(loadPdf(file), pages)` with suffix `organized`.

**Panel:**
- Load `api.pdfThumbnails(path, 160)`. Show a progress text while it loads.
- A responsive grid of page cards (thumbnail rotated by CSS `transform: rotate(…)`, page number under it).
- **Selection:** click to select, Ctrl-click (⌘-click on macOS; use `modClick(e)` from `lib/platform.ts`) to toggle, Shift-click for a range.
- **Toolbar:** Rotate left, Rotate right, Delete (disabled if it would delete every page), Select all, Reset.
- **Reorder:** HTML5 drag & drop of cards (internal; `effectAllowed='move'`).
- Payload `{ pages: [{ src: originalIndex, rotate }] }` in the displayed order.
- Apply "Save PDF".

**Case:** `[{src:2,rotate:90},{src:0,rotate:0}]` → 2 pages; page 0 has rotation 90 (`getRotation().angle`).

---

## Task 10.3 — PDF **Pages → Images**
**Files:** `tools/pdf/images.ts`, `panels/pdf/PdfImagesPanel.tsx`

**Runner:**
1. `indexes = flattenRanges(parsePageRanges(o.ranges, total))`.
2. `pdfToImages(file.path, file.path, o.format, o.dpi, o.quality/100, ctx, indexes)`.

**Panel** (420×460)
- **Format** Segmented PNG / JPG.
- **Resolution** Segmented 72 / 150 / 300 / 600 DPI, plus the hint "300 DPI ≈ print quality".
- **Pages** field (placeholder "All pages — or e.g. 1-3, 5").
- JPG quality slider.

**Case:** `{format:'png', dpi:72, ranges:'1'}` → 1 output, 612 px wide.

---

## Task 10.4 — PDF **Compress**
**Files:** `src/main/engines/pdfCompress.ts`, `tools/pdf/compress.ts`, `panels/pdf/PdfCompressPanel.tsx`
```ts
import { PDFArray, PDFName, PDFNumber, PDFRawStream, type PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { throwIfAborted } from '../errors';

const LEVELS = { light: { maxSide: 3000, quality: 82 }, balanced: { maxSide: 2000, quality: 70 }, strong: { maxSide: 1400, quality: 55 } } as const;

/** Re-encode embedded JPEG (DCT) images smaller. Returns how many images changed. CMYK and odd images are left alone. */
export async function recompressPdfImages(doc: PDFDocument, level: keyof typeof LEVELS, onProgress: (f: number) => void, signal: AbortSignal): Promise<number> {
  const { maxSide, quality } = LEVELS[level];
  const objs = doc.context.enumerateIndirectObjects();
  let changed = 0;
  for (let k = 0; k < objs.length; k++) {
    throwIfAborted(signal);
    const [ref, obj] = objs[k];
    onProgress(k / objs.length);
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const filter = dict.get(PDFName.of('Filter'));
    const isDct = filter === PDFName.of('DCTDecode') || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === PDFName.of('DCTDecode'));
    if (!isDct || dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceCMYK') || dict.get(PDFName.of('Decode'))) continue;
    try {
      const input = Buffer.from(obj.contents);
      if ((await sharp(input).metadata()).space === 'cmyk') continue;
      const out = await sharp(input).resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      if (out.data.length >= input.length * 0.9) continue;
      const nd = dict.clone(doc.context);
      nd.set(PDFName.of('Width'), PDFNumber.of(out.info.width));
      nd.set(PDFName.of('Height'), PDFNumber.of(out.info.height));
      nd.set(PDFName.of('ColorSpace'), PDFName.of(out.info.channels === 1 ? 'DeviceGray' : 'DeviceRGB'));
      nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      nd.delete(PDFName.of('DecodeParms'));
      nd.set(PDFName.of('Length'), PDFNumber.of(out.data.length));
      doc.context.assign(ref, PDFRawStream.of(nd, out.data));
      changed++;
    } catch {
      /* image sharp cannot read → leave untouched */
    }
  }
  return changed;
}
```
**Add to `pdfOps.ts`:** `pageImagesToPdf(pages: Array<{ jpeg: Buffer; widthPt: number; heightPt: number }>)`. Each page is created at `[widthPt, heightPt]` with the JPEG drawn full-page.

**Runner:**
- `light|balanced|strong`:
  1. `doc = loadPdf` → `recompressPdfImages`.
  2. `bytes = doc.save({ useObjectStreams: true })`.
  3. If `bytes.length >= size*0.98` → `dropOutput` + note "Already optimized — no smaller file was made". Otherwise write it with suffix `compressed` and note the saving.
- `max`: render every page with `pdfRenderPage` (110 DPI JPEG, q 0.6) → `pageImagesToPdf` → write, with the note "Pages were converted to images (text is no longer selectable)".

**Panel** (440×460)
- Segmented Light / Balanced / Strong / Max.
- A description per level.
- For Max, a warning chip: "Text will no longer be selectable."

**Cases:**
- `balanced` on `doc.pdf` → the job succeeds (0 or 1 outputs). If there is 1, it has 3 pages.
- `max` → 1 output with 3 pages.

---

## Task 10.5 — PDF **OCR** (text or searchable PDF)
**Files:** extend `engines/ocr.ts` with `ocrPages`, `tools/pdf/ocr.ts`, `panels/pdf/OcrPanel.tsx`
```ts
export async function ocrPages(pdfPath: string, ctx: JobContext, langs: string[], pageIndexes: number[], wantPdf: boolean): Promise<{ text: string; pdfs: Buffer[] }> {
  return withPdf(pdfPath, (doc) => withOcrWorker(langs, async (worker) => {
    const texts: string[] = [];
    const pdfs: Buffer[] = [];
    for (let k = 0; k < pageIndexes.length; k++) {
      throwIfAborted(ctx.signal);
      const png = await pdfRenderPage(doc.id, pageIndexes[k], { dpi: 300, mime: 'image/png' });
      const r = await recognize(worker, png, wantPdf);
      texts.push(`--- Page ${pageIndexes[k] + 1} ---\n${r.text.trim()}`);
      if (r.pdf) pdfs.push(r.pdf);
      ctx.progress((k + 1) / pageIndexes.length, `Reading page ${pageIndexes[k] + 1} of ${doc.pages}`);
    }
    return { text: texts.join('\n\n') + '\n', pdfs };
  }));
}
```
**Runner:**
- Languages = `o.languages ∩ caps.ocrLanguages`; fall back to `['eng']`.
- Pages from `ranges`.
- Output `txt` → write the text with suffix `ocr`.
- Output `pdf` → merge the per-page PDFs with pdf-lib (`copyPages` from each) → suffix `searchable`.
- If tesseract returns no PDF data (version difference), throw `ToolError('This OCR engine version cannot write PDFs', '')` and note in PROGRESS.md that only TXT works.

**Panel** (420×460)
- **Languages:** checkboxes from `caps.ocrLanguages` (labels: eng → English, vie → Tiếng Việt).
- **Output:** Segmented "Text file (.txt)" / "Searchable PDF".
- **Pages** field.
- Note "Reading takes about 2–5 s per page."

**Cases** (skip without eng):
- `scan.pdf` → txt contains `KABOOKS`.
- `scan.pdf` → pdf has 1 page.

---

## Task 10.6 — PDF **Word** export (tool version)
**Files:** `tools/pdf/word.ts`, `panels/pdf/WordPanel.tsx` (reuse the `DocModeCard` content in a tool panel)

**Runner:** `await convertPdf(file, 'docx', { docMode: o.mode, ocr: o.ocr }, ctx)`. Export `convertPdf` from `converters/pdf.ts` if it is not already exported.

**Case:** `doc.pdf` → docx.

---

## Task 10.7 — PDF **Metadata**
**Files:** extend `metadata.ts` (`kind:'pdf'`), `tools/pdf/metadata.ts`, `panels/pdf/PdfMetadataPanel.tsx`

**Read:** `loadPdf` → fields:
- Title, Author, Subject, Keywords (editable).
- Creator, Producer, Created, Modified, Pages (read-only).

**Runner:**
- **removeAll:** `const clean = await PDFDocument.create({ updateMetadata: false })`, copy all pages, save, suffix `clean`. Note "Bookmarks and form fields are not kept when removing all metadata."
- **Otherwise:** `doc.setTitle/setAuthor/setSubject/setKeywords(split by comma)/setModificationDate(new Date())` → save, suffix `meta`.

**Panel:** fields + "Remove all metadata" toggle (440×560).

**Cases:**
- Title "New Title" → `getTitle() === 'New Title'`.
- removeAll → `getTitle()` is `undefined`.

---

## Task 10.8 — Subtitle **Shift timing** tool + PDF self-test (Milestone M5)
**Files:** `tools/subtitle/shift.ts`, `panels/subtitle/ShiftPanel.tsx`

**Runner:**
1. `parseSubtitles(decodeText(file))` → `shiftCues(cues, offsetMs/1000)`.
2. Write the same format (srt with BOM / vtt) with suffix `shifted`.

**Panel** (420×380)
- Offset slider −10…+10 s (step 0.05).
- Buttons −0.5 s / +0.5 s.
- Number field (ms).
- Note "Positive = subtitles appear later."

**Cases:** shift `subs.srt` by +1000 ms → the first cue starts at `00:00:02,000`.

**Milestone:** `npm run selftest -- --only=tools.pdf` and `--only=tools.subtitle` → 0 failed.

# Phase 11 — Desktop integration for Windows, macOS and Linux (Milestone M6)

| Task | Windows | macOS | Linux |
|---|---|---|---|
| 11.1 Files from the OS (argv / `open-file`) + single instance | ✓ | ✓ | ✓ |
| 11.2 Explorer "Send to" | ✓ | — | — |
| 11.3 Explorer right-click verb | ✓ | — | — |
| 11.4 Icons, tray / menu bar, login item, wiring | ✓ | ✓ | ✓ |
| 11.5 Global drag via `uiohook-napi` | ✓ | — | X11 only |
| 11.6 Overlay drag mode (renderer) | ✓ | ✓ | ✓ |
| 11.7 Swift drag helper (Tangerine-style) | — | ✓ | — |
| 11.8 Finder Open With, Dock, menu-bar mode, vibrancy | — | ✓ | — |
| 11.9 Nautilus script, Dolphin service menu | — | — | ✓ |
| 11.10 M6 acceptance per OS | ✓ | ✓ | ✓ |

## Task 11.1 — Files from the OS (argv on Windows/Linux, `open-file` on macOS) + single instance
**Files:** `src/main/integrations/argv.ts`, edit `src/main/index.ts`

> **macOS difference:** files opened from Finder ("Open With", Dock-icon drop, `open -a Kabooks file`) do **not** arrive in `argv`. They arrive as `app.on('open-file')` events, possibly **before** `ready`, so the handler must be registered at the top of `index.ts`.
```ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathKey } from '../util';

let pending: string[] = [];
let timer: NodeJS.Timeout | null = null;

/** Existing file/folder paths from argv (ignores flags, the exe, and in dev the project folder). */
export function filesFromArgv(argv: string[]): string[] {
  const appKey = pathKey(app.getAppPath());
  const exeKey = pathKey(process.execPath);
  return argv.slice(1).filter((a) => {
    if (!a || a.startsWith('-') || a.startsWith('psn_')) return false;    // macOS may pass -psn_… process serial numbers
    const key = pathKey(a);
    if (key === exeKey || key === appKey) return false;
    if (!app.isPackaged && key.startsWith(appKey + path.sep)) return false;
    return fs.existsSync(path.resolve(a));
  });
}

/** Explorer may start one process per selected file: batch everything that arrives within 350 ms. */
export function queueFiles(files: string[], open: (paths: string[]) => void): void {
  if (files.length === 0) return;
  pending.push(...files);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const batch = [...new Set(pending)];
    pending = [];
    timer = null;
    open(batch);
  }, 350);
}
```
**Edit `index.ts`:**
- Near the top, **before** `requestSingleInstanceLock()`:
  ```ts
  let resolveStarted: () => void = () => undefined;
  const started = new Promise<void>((r) => { resolveStarted = r; });
  let launchedWithFiles = false;
  const openFromOs = (paths: string[]): void => { void started.then(() => openOverlay(paths, 'convert', 'argv')); };

  // macOS: Finder "Open With", Dock drop, `open -a Kabooks file` (can fire before 'ready')
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    launchedWithFiles = true;
    queueFiles([filePath], openFromOs);
  });
  ```
- Inside the `else` branch, next to the other `app.on` calls:
  ```ts
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv);
    if (files.length) queueFiles(files, openFromOs);
    else showMainWindow();
  });
  ```
- In `whenReady`:
  ```ts
  const initial = filesFromArgv(process.argv);
  createMainWindow(initial.length === 0 && !launchedWithFiles && !process.argv.includes('--hidden'));
  ```
  and after `createOverlayWindow()`:
  ```ts
  resolveStarted();
  queueFiles(initial, openFromOs);
  ```

**Verify:**
1. Build, then run Kabooks with a file **outside** the project folder. The overlay appears without the main window.
   - **Windows:** `npx electron . "C:\path\to\some.mp4"`
   - **Linux:** `npx electron . ~/Videos/some.mp4`
   - **macOS:** `npx electron . ~/Movies/some.mp4`. The `open-file` path is tested with the packaged app in Task 11.8.
2. While it runs, execute the same command again with another file. The wheel updates in the running instance.

---

## Task 11.2 — [Windows] Explorer "Send to"
**Files:** `src/main/integrations/sendTo.ts`
```ts
import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const lnk = (): string => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Kabooks.lnk');

export function setSendTo(enabled: boolean): boolean {
  if (process.platform !== 'win32') return false;
  if (!enabled) {
    if (fs.existsSync(lnk())) fs.unlinkSync(lnk());
    return true;
  }
  return shell.writeShortcutLink(lnk(), 'create', {
    target: process.execPath,
    args: app.isPackaged ? '' : `"${app.getAppPath()}"`,
    description: 'Convert with Kabooks',
    icon: process.execPath,
    iconIndex: 0
  });
}
```
**Verify:** call `setSendTo(true)` temporarily from `index.ts` (or wait for Settings in 12.2). Right-click a file → Send to → Kabooks → the wheel opens.

---

## Task 11.3 — [Windows] Right-click "Convert with Kabooks" (per-user registry)
**Files:** `src/main/integrations/contextMenu.ts`
```ts
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const KEY = 'HKCU\\Software\\Classes\\*\\shell\\Kabooks';

export async function setContextMenu(enabled: boolean): Promise<void> {
  if (process.platform !== 'win32') return;
  if (!enabled) {
    await run('reg', ['delete', KEY, '/f'], { windowsHide: true }).catch(() => undefined);
    return;
  }
  const exe = process.execPath;
  const command = app.isPackaged ? `"${exe}" "%1"` : `"${exe}" "${app.getAppPath()}" "%1"`;
  await run('reg', ['add', KEY, '/ve', '/d', 'Convert with Kabooks', '/f'], { windowsHide: true });
  await run('reg', ['add', KEY, '/v', 'Icon', '/d', exe, '/f'], { windowsHide: true });
  await run('reg', ['add', KEY, '/v', 'MultiSelectModel', '/d', 'Player', '/f'], { windowsHide: true });
  await run('reg', ['add', `${KEY}\\command`, '/ve', '/d', command, '/f'], { windowsHide: true });
}
```
**Verify:**
1. Run `reg query "HKCU\Software\Classes\*\shell\Kabooks\command"`. It shows the command with correct quotes.
2. In Explorer, right-click 3 files → **Show more options** → "Convert with Kabooks" → one wheel with 3 files appears (debounce from 11.1).

---

## Task 11.4 — Icons, tray / menu bar, launch at login, integration wiring (all OSes)
**Files:**
- `scripts/make-icons.mjs` (Appendix F) and the script `"icons": "node scripts/make-icons.mjs"`. Run it once and commit:
  - `build/icon.png` (1024)
  - `resources/tray.png`
  - `resources/trayTemplate.png`, `resources/trayTemplate@2x.png`
- `src/main/integrations/tray.ts`, `src/main/integrations/loginItem.ts`, `src/main/integrations/index.ts`
- edit `index.ts`
```ts
// tray.ts — Windows/Linux: system tray · macOS: menu bar (template image tinted by the system)
import { app, Menu, nativeImage, Tray } from 'electron';
import { setTrayActive } from '../appState';
import { isMac, trayIconPath } from '../paths';
import { showMainWindow } from '../windows/mainWindow';

let tray: Tray | null = null;

export function createTray(): void {
  if (tray) return;
  const image = nativeImage.createFromPath(trayIconPath());      // macOS picks trayTemplate@2x.png automatically
  if (isMac) image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Kabooks — drop files to convert');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Kabooks', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Quit Kabooks', click: () => app.quit() }
  ]));
  if (!isMac) tray.on('click', () => showMainWindow());          // macOS: click opens the menu (convention)
  setTrayActive(true);
}

/** macOS only: hide/show the Dock icon (menu-bar-only mode, like many utilities). */
export function setDockVisible(visible: boolean): void {
  if (!isMac || !app.dock) return;
  if (visible) void app.dock.show(); else app.dock.hide();
}
```
```ts
// loginItem.ts — Windows/macOS: OS login items · Linux: ~/.config/autostart/kabooks.desktop
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isLinux } from '../paths';

/** The command that starts this app (AppImage path when running as AppImage). */
export function selfCommand(): string[] {
  if (process.env.APPIMAGE) return [process.env.APPIMAGE];
  return app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()];
}

export function setLoginItem(enabled: boolean): void {
  if (!isLinux) {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
    return;
  }
  const file = path.join(os.homedir(), '.config', 'autostart', 'kabooks.desktop');
  if (!enabled) { fs.rmSync(file, { force: true }); return; }
  const exec = [...selfCommand(), '--hidden'].map((p) => `"${p}"`).join(' ');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Kabooks\nExec=${exec}\nX-GNOME-Autostart-enabled=true\nNoDisplay=false\n`);
}
```
```ts
// integrations/index.ts
import type { Settings } from '@shared/types';
import { getCapabilities } from '../capabilities';
import { isLinux, isMac, isWin } from '../paths';
import { setContextMenu } from './contextMenu';                 // Windows (Task 11.3)
import { startGlobalDrag, stopGlobalDrag } from './globalDrag';  // Windows + Linux-X11 (Task 11.5; create a stub now)
import { setLinuxFileManagerMenus } from './linuxFileManagers'; // Linux (Task 11.9; create a stub now)
import { startMacDragHelper, stopMacDragHelper } from './macDragHelper'; // macOS (Task 11.7; create a stub now)
import { setLoginItem } from './loginItem';
import { setSendTo } from './sendTo';                            // Windows (Task 11.2)
import { setDockVisible } from './tray';

/** At startup (prev undefined) only turn ON what is enabled; afterwards apply differences. */
export function applyIntegrations(s: Settings, prev?: Settings): void {
  const changed = (k: keyof Settings): boolean => (prev ? s[k] !== prev[k] : s[k] === true);
  if (isWin && changed('sendToMenu')) setSendTo(s.sendToMenu);
  if (changed('contextMenu')) {
    if (isWin) void setContextMenu(s.contextMenu);
    if (isLinux) setLinuxFileManagerMenus(s.contextMenu);
  }
  if (changed('launchAtLogin')) setLoginItem(s.launchAtLogin);
  if (isMac && (!prev || s.showInDock !== prev.showInDock)) setDockVisible(s.showInDock);
  if (changed('globalDragWheel')) {
    const how = getCapabilities().globalDrag;
    if (how === 'mac-helper') { if (s.globalDragWheel) startMacDragHelper(); else stopMacDragHelper(); }
    if (how === 'hook') { if (s.globalDragWheel) startGlobalDrag(); else stopGlobalDrag(); }
  }
}
```
**Edit `index.ts`:**
- After the windows are created:
  ```ts
  createTray();
  applyIntegrations(getSettings());
  ```
- Extend the settings listener:
  ```ts
  onSettingsChanged((s, prev) => { …; applyIntegrations(s, prev); })
  ```

**Verify (on your OS):**
- **Windows/Linux:**
  - Closing the main window hides it to the tray (with `closeToTray` on).
  - The tray menu's Quit exits the app, and no Kabooks/Electron process remains.
  - **Linux GNOME** needs the "AppIndicator" extension to show tray icons. Without it the icon is invisible, but launching Kabooks again shows the window (second instance).
- **macOS:**
  - A monochrome wheel icon appears in the menu bar and adapts to light/dark menu bars.
  - Closing the window keeps the app running. ⌘Q and the menu-bar "Quit" quit.
  - `setSettings({ showInDock: false })` hides the Dock icon; `true` shows it again.
- Toggle `launchAtLogin` on, then check:
  - Windows: Task Manager → Startup apps.
  - macOS: System Settings → General → Login Items.
  - Linux: `~/.config/autostart/kabooks.desktop` exists.

---

## Task 11.5 — [Windows, Linux-X11] Global "drag + Shift" wheel via `uiohook-napi` + shared overlay drag API
**Files:** `src/main/integrations/globalDrag.ts`, additions to `windows/overlayWindow.ts` (shared with macOS, Task 11.7), IPC `overlay:dropped`

> `applyIntegrations` only calls `startGlobalDrag()` when `caps.globalDrag === 'hook'`. That means Windows, or Linux on X11. It is **never** called on macOS (the Swift helper is used there) or on Wayland, where global hooks are impossible.
```ts
// globalDrag.ts
import { screen } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import { log } from '../log';
import { overlayDragEnd, overlayDragMode, overlayDragStart } from '../windows/overlayWindow';

let running = false;
let down: { x: number; y: number } | null = null;
let dragging = false;
let shift = false;
let alt = false;
let shown = false;

function update(): void {
  const mode = alt ? 'tools' : 'convert';
  if (dragging && shift && !shown) { shown = true; overlayDragStart(mode, screen.getCursorScreenPoint()); }
  else if (shown && dragging) overlayDragMode(mode);
}

export function startGlobalDrag(): void {
  if (running) return;
  running = true;
  uIOhook.on('mousedown', (e) => { if (e.button === 1) { down = { x: e.x, y: e.y }; dragging = false; } });
  uIOhook.on('mousemove', (e) => {
    if (down && !dragging && Math.hypot(e.x - down.x, e.y - down.y) > 12) { dragging = true; update(); }
  });
  uIOhook.on('mouseup', (e) => {
    if (e.button !== 1) return;
    down = null;
    dragging = false;
    if (shown) { shown = false; overlayDragEnd(); }
  });
  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shift = true;
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) alt = true;
    update();
  });
  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) shift = false;
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) alt = false;
    update();
  });
  uIOhook.start();
  log.info('Global drag wheel started');
}

export function stopGlobalDrag(): void {
  if (!running) return;
  uIOhook.removeAllListeners();
  uIOhook.stop();
  running = false;
  log.info('Global drag wheel stopped');
}
```
**Add to `overlayWindow.ts`:**
```ts
let dragHideTimer: NodeJS.Timeout | null = null;
let dropReceived = false;

/** `files` is only known on macOS (Swift helper reads the drag pasteboard); elsewhere the renderer uses MIME types. */
export function overlayDragStart(mode: WheelMode, at: Point, files?: FileInfo[]): void {
  if (!win) return;
  dropReceived = false;
  anchor = at;
  place({ width: WHEEL_STAGE.width, height: WHEEL_STAGE.height, anchor: 'wheel' });
  win.webContents.send(IPC.evOverlayDrag, { active: true, mode, files } satisfies DragState);
  win.showInactive();                         // do not steal focus from Explorer/Finder mid-drag
}

/** macOS: deep info (thumbnails) for the dragged files arrives a moment later. */
export function overlayDragFiles(mode: WheelMode, files: FileInfo[]): void {
  win?.webContents.send(IPC.evOverlayDrag, { active: true, mode, files } satisfies DragState);
}
export function overlayDragMode(mode: WheelMode): void {
  win?.webContents.send(IPC.evOverlayDrag, { active: true, mode });
}
export function overlayDragEnd(): void {
  if (dragHideTimer) clearTimeout(dragHideTimer);
  dragHideTimer = setTimeout(() => {      // the HTML drop event can arrive a little after the mouse-up hook
    if (!dropReceived) { win?.webContents.send(IPC.evOverlayDrag, { active: false, mode: 'convert' }); hideOverlay(); }
  }, 600);
}
export async function overlayDropped(paths: string[]): Promise<FileInfo[]> {
  dropReceived = true;
  if (dragHideTimer) clearTimeout(dragHideTimer);
  win?.focus();
  const files = await inspectFiles(paths, true);
  return files;
}
```
Register `ipcMain.handle(IPC.overlayDropped, (_e, paths) => overlayDropped(strings(paths, 'paths')))` in `ipc.ts`.

> **Known limits** (put them in the Settings description too):
> - Windows blocks global hooks from seeing input to programs running **as administrator**.
> - Linux: X11 only. `uiohook-napi` needs `libxtst6` / `libXtst` installed.
> - The wheel only appears while Kabooks is running (tray / menu bar).

---

## Task 11.6 — Global drag wheel: overlay renderer (drag mode)
**Files:** `overlay/store.ts`, `OverlayApp.tsx`, `overlay/stages/WheelStage.tsx`

**Store additions:**
- `dragFmts: Array<Fmt | null>`
- `startDrag(mode)` → `{ dragging: true, files: [], mode, stage: { name: 'wheel' }, active: null, dragFmts: [] }`
- `setDragFmts(fmts)`
- `dropFinished(files)` → `{ files, dragging: false }`
- `endDrag()` → `{ dragging: false }`

**OverlayApp:**
- Subscribe to `api.onOverlayDrag((s) => s.active ? (useOverlay.getState().dragging ? setMode(s.mode) : startDrag(s.mode)) : endDrag())`. If `caps` is null, fetch it once with `api.getCapabilities()`.
- **macOS:** when `s.files` is present, also call `setDragFiles(s.files)`. Add this store action; it sets `files` while `dragging` stays true. The wheel is then built from the **real files**, and the hub shows the real thumbnail during the drag, like `shortcut-open-choose-crop.png`.
- The root `.overlay` div also handles `onDragOver` (`preventDefault`, `dropEffect='copy'`) and `onDrop`. A drop outside the wheel behaves like a drop on the hub.

**WheelStage in drag mode** (when `dragging` is true):
- If the store already has real `files` (macOS helper), use them; skip the MIME logic below.
- Otherwise build pseudo-files from the MIME types:
  ```ts
  dragFmts.map((fmt) => ({ path: '', name: '', base: '', ext: '', fmt, category: fmt ? categoryOf(fmt) : null, size: 0 }))
  ```
  - If any `fmt` is `null` (unknown type) **or** there are no items, show the empty wheel with hub text **"Drop to choose"**.
  - Otherwise show `buildWheel(pseudo, mode, caps)`.
- Pass `onDragTypes={(dt) => setDragFmts(fmtsFromDragTypes(dt))}`.
- Pass `onDropFiles={async (dt, hit) => { … }}`:
  1. `const paths = pathsFromDataTransfer(dt)`.
  2. `const before = currentModel`.
  3. `const files = await api.overlayDropped(paths)`.
  4. `dropFinished(files)`.
  5. `const after = buildWheel(files, mode, caps)`.
  6. If `typeof hit === 'number'` and `after.items[hit]?.key === before.items[hit]?.key`, call `pick(hit, false)` with the **real** files. Otherwise stay on the wheel so the user can click.

**Verify (manual, Windows or Linux-X11; macOS is verified in Task 11.7):**
1. Enable the global drag wheel through DevTools: `await window.kabooks.setSettings({ globalDragWheel: true })`.
2. Drag a JPG from Explorer/Nautilus, press Shift → the wheel appears under the cursor with image formats.
3. Drop on **PNG** → the conversion runs and the PNG appears next to the original. **The original JPG must still exist** (copy, not move).
4. Repeat with Shift+Alt → the Tools ring; drop on Compress → the Compress panel opens.
5. Drag without Shift → no wheel.
6. Press Shift, then release the mouse over empty desktop → the wheel disappears within about 0.6 s.

**Done when:** the steps pass on your OS. Commit.

---

## Task 11.7 — [macOS] Swift drag helper: the Tangerine-style gesture
**Goal:** on macOS, while the user drags files in Finder (or any app) and holds **⇧** (convert) or **⇧⌥** (tools), show the wheel under the cursor **with the real dragged files** (thumbnail + valid formats) **before** the drop. No Accessibility or Input Monitoring permission is needed.

**How it works.** A small Swift command-line tool (`kabooks-drag-helper`) polls at 60 Hz using public AppKit APIs:
- `NSEvent.pressedMouseButtons` → whether the left button is down;
- `NSEvent.modifierFlags` → whether ⇧ and ⌥ are held;
- `NSPasteboard(name: .drag).changeCount` → whether a *new* drag started.

When a drag is active and ⇧ is pressed, it reads the file URLs from the drag pasteboard **once** and prints JSON lines to stdout. The Electron main process spawns it and feeds the overlay through the same `overlayDragStart/overlayDragEnd` API as Task 11.5.

**Files:** `native/mac/DragHelper.swift`, `scripts/build-mac-helper.mjs`, the `package.json` script `"build:mac-helper": "node scripts/build-mac-helper.mjs"`, `src/main/integrations/macDragHelper.ts`

**Code: `native/mac/DragHelper.swift`**
```swift
// kabooks-drag-helper — prints JSON lines describing global file drags + modifier keys.
// Build: swiftc -O -target arm64-apple-macos12 -o kabooks-drag-helper DragHelper.swift  (x86_64 for Intel)
import AppKit
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)          // line-buffered so Node receives each event immediately

func emit(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
}

let dragBoard = NSPasteboard(name: .drag)
var lastChange = dragBoard.changeCount
var mouseDown = false
var dragActive = false          // a NEW drag pasteboard was written while the button is down
var filesSent = false
var lastShift = false
var lastAlt = false

func readDraggedFiles() -> [String] {
    let opts: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
    let urls = dragBoard.readObjects(forClasses: [NSURL.self], options: opts) as? [URL] ?? []
    return urls.map { $0.path }
}

let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { _ in
    let buttons = NSEvent.pressedMouseButtons
    let flags = NSEvent.modifierFlags
    let shift = flags.contains(.shift)
    let alt = flags.contains(.option)
    let down = (buttons & 1) == 1

    if down && !mouseDown { mouseDown = true; dragActive = false; filesSent = false; lastChange = dragBoard.changeCount }
    if down && !dragActive && dragBoard.changeCount != lastChange {
        dragActive = true                                   // something new is being dragged
        emit(["t": "drag"])
    }
    if dragActive && (shift != lastShift || alt != lastAlt) {
        emit(["t": "mods", "shift": shift, "alt": alt])
    }
    if dragActive && shift && !filesSent {
        filesSent = true                                    // read contents only when the user shows intent (⇧)
        emit(["t": "files", "paths": readDraggedFiles()])
    }
    if !down && mouseDown {
        mouseDown = false
        if dragActive { emit(["t": "up"]) }
        dragActive = false
    }
    lastShift = shift
    lastAlt = alt
}
RunLoop.main.add(timer, forMode: .common)

// Exit when the parent (Electron) closes our stdin.
FileHandle.standardInput.readabilityHandler = { h in if h.availableData.isEmpty { exit(0) } }
emit(["t": "ready"])
RunLoop.main.run()
```

**Code: `scripts/build-mac-helper.mjs`** (macOS only; no-op elsewhere)
```js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (process.platform !== 'darwin') { console.log('build-mac-helper: not macOS, skipped'); process.exit(0); }
const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'native', 'mac', 'DragHelper.swift');
for (const [arch, triple] of [['arm64', 'arm64-apple-macos12'], ['x64', 'x86_64-apple-macos12']]) {
  const outDir = path.join(root, 'resources', 'bin', `darwin-${arch}`);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'kabooks-drag-helper');
  execFileSync('swiftc', ['-O', '-swift-version', '5', '-target', triple, '-o', out, src], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--sign', '-', out]);   // ad-hoc; electron-builder re-signs with your Developer ID
  console.log('built', out);
}
```
Also add `"postfetch-binaries": "node scripts/build-mac-helper.mjs"` so `npm run fetch-binaries` builds the helper on a Mac.

**Code: `src/main/integrations/macDragHelper.ts`**
```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { screen } from 'electron';
import type { WheelMode } from '@shared/types';
import { inspectFiles } from '../inspect';
import { log } from '../log';
import { macDragHelperPath } from '../paths';
import { overlayDragEnd, overlayDragFiles, overlayDragMode, overlayDragStart } from '../windows/overlayWindow';

let child: ChildProcess | null = null;
let shown = false;
let alt = false;
const mode = (): WheelMode => (alt ? 'tools' : 'convert');

async function onEvent(ev: { t: string; shift?: boolean; alt?: boolean; paths?: string[] }): Promise<void> {
  if (ev.t === 'drag') { alt = false; return; }
  if (ev.t === 'mods') {
    alt = !!ev.alt;
    if (shown) overlayDragMode(mode());
    return;
  }
  if (ev.t === 'files') {
    const paths = ev.paths ?? [];
    const basic = paths.length ? await inspectFiles(paths, false) : undefined;   // instant: formats
    shown = true;
    overlayDragStart(mode(), screen.getCursorScreenPoint(), basic);             // basic === undefined → "Drop to choose"
    if (basic?.length) overlayDragFiles(mode(), await inspectFiles(paths, true)); // then thumbnails
    return;
  }
  if (ev.t === 'up' && shown) { shown = false; overlayDragEnd(); }
}

export function startMacDragHelper(): void {
  if (child || process.platform !== 'darwin') return;
  child = spawn(macDragHelperPath(), [], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  child.stdout?.on('data', (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) { try { void onEvent(JSON.parse(line)); } catch { /* ignore malformed */ } }
  });
  child.on('exit', (code) => { log.warn('drag helper exited', code); child = null; });
  log.info('macOS drag helper started');
}

export function stopMacDragHelper(): void {
  child?.stdin?.end();          // helper exits when stdin closes
  child?.kill();
  child = null;
}
```

**Verify (on a Mac):**
1. Run `npm run fetch-binaries` (this builds the helper). `resources/bin/darwin-<arch>/kabooks-drag-helper` exists.
2. Run the helper manually: `./resources/bin/darwin-arm64/kabooks-drag-helper`. Drag a file in Finder and press ⇧. You see lines such as `{"t":"drag"}`, `{"t":"mods",…}` and `{"t":"files","paths":["/Users/…/photo.jpg"]}`. Release → `{"t":"up"}`. Ctrl-C to stop.
3. In the app (`npm run dev`):
   1. `await window.kabooks.setSettings({ globalDragWheel: true })`.
   2. Drag a video in Finder and press ⇧ → the wheel appears under the cursor showing **video formats and the video's thumbnail** in the hub before you drop.
   3. Press ⌥ as well → the Tools ring.
   4. Drop on a slice → the job runs / the panel opens.
   5. **The original file stays in place.**
4. **macOS privacy check:** if macOS shows a "Kabooks would like to access … pasteboard" prompt, or `paths` is always empty, record the macOS version in PROGRESS.md. The wheel must still work, with "Drop to choose" and formats after the drop.
5. No permission prompt for Accessibility/Input Monitoring appears.

---

## Task 11.8 — [macOS] Finder "Open With", Dock drop, menu-bar mode, native vibrancy (optional)
**Files:** `src/main/integrations/macPolish.ts`, edit `windows/overlayWindow.ts`, `electron-builder.yml` (Task 13.1 adds `fileAssociations`)

1. **Open With / Dock drop.**
   - `fileAssociations` with `role: Viewer` and `rank: Alternate` (Task 13.1) make Kabooks appear in Finder's **Open With** menu for every supported extension, **without** becoming the default app.
   - Dropping files on the Dock icon also sends `open-file` (Task 11.1).
2. **Menu-bar mode.** The Settings toggle "Show icon in Dock" (`showInDock`, Task 11.4) is the whole feature. When hidden, the app is reachable from the menu-bar icon.
3. **Native vibrancy behind cards (optional polish).**
   - In `overlayWindow.ts`, export `setOverlayVibrancy(on: boolean)`. It is macOS only:
     - on → `win.setVibrancy('popover')` and `win.setHasShadow(true)`;
     - off → `win.setVibrancy(null)` and `win.setHasShadow(false)`.
   - The renderer requests it through a new IPC (`overlay:vibrancy`, boolean) when entering a **card** stage (options/panel/running/done/error) and turns it off for the wheel. In vibrancy mode, set the margin in `sizes.ts` to 0 for cards, so the window equals the card, and add CSS: `html[data-platform='darwin'].vibrant .panel, html[data-platform='darwin'].vibrant .card { background: color-mix(in srgb, var(--surface) 55%, transparent); box-shadow: none; }`.
   - **If the result looks wrong** (square corners or a flicker), keep it off; the CSS cards already match the design. Record the decision in PROGRESS.md.
4. **Services / Quick Actions:** not in v1 (OUTLINE §15).

**Verify (packaged app on a Mac, after Task 13.2):**
- Finder → right-click a `.mov` → Open With → Kabooks → the wheel appears.
- Dragging 3 images onto the Dock icon → one wheel with 3 files.

---

## Task 11.9 — [Linux] File-manager menus (Nautilus script, Dolphin service menu)
**Files:** `src/main/integrations/linuxFileManagers.ts`
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selfCommand } from './loginItem';

const NAUTILUS = path.join(os.homedir(), '.local', 'share', 'nautilus', 'scripts', 'Convert with Kabooks');
const DOLPHIN = path.join(os.homedir(), '.local', 'share', 'kio', 'servicemenus', 'kabooks.desktop');

/** Settings → "File manager menu" (reuses settings.contextMenu on Linux). */
export function setLinuxFileManagerMenus(enabled: boolean): void {
  if (process.platform !== 'linux') return;
  if (!enabled) { fs.rmSync(NAUTILUS, { force: true }); fs.rmSync(DOLPHIN, { force: true }); return; }
  const cmd = selfCommand().map((p) => `"${p}"`).join(' ');
  // Nautilus (GNOME Files): Scripts submenu; selected files are passed as arguments.
  fs.mkdirSync(path.dirname(NAUTILUS), { recursive: true });
  fs.writeFileSync(NAUTILUS, `#!/bin/sh\nexec ${cmd} "$@"\n`, { mode: 0o755 });
  // Dolphin (KDE): service menu; KF6 requires the file to be executable.
  fs.mkdirSync(path.dirname(DOLPHIN), { recursive: true });
  fs.writeFileSync(DOLPHIN, [
    '[Desktop Entry]', 'Type=Service', 'MimeType=all/allfiles;', 'Actions=convert;', 'X-KDE-Priority=TopLevel', '',
    '[Desktop Action convert]', 'Name=Convert with Kabooks', 'Icon=kabooks', `Exec=${cmd} %F`, ''
  ].join('\n'), { mode: 0o755 });
}
```
**Verify (on Linux):** enable `contextMenu` in Settings (Task 12.2 labels it "File manager menu"), then:
- Nautilus: right-click files → Scripts → Convert with Kabooks.
- Dolphin: right-click → Convert with Kabooks.

Either one opens a single wheel with the selected files.

---

## Task 11.10 — Milestone M6 acceptance (per OS)
Run the checklist for **your** OS and mark the others "Not verified" in PROGRESS.md. CI covers the automated part.

| OS | Must work |
|---|---|
| Windows | Send to; right-click verb (Show more options); tray + close-to-tray; login item; global Shift-drag wheel (formats by type) |
| macOS | Swift helper gesture with the real thumbnail before the drop; ⇧⌥ tools; Open With; Dock drop; menu-bar icon; Dock-icon toggle; ⌘, opens Settings; ⌘Q quits |
| Linux | Open With (packaged .deb, Task 13.1 `mimeTypes`); Nautilus script / Dolphin menu; autostart file; on X11 the global Shift-drag wheel; on Wayland the Settings row explains why it is unavailable |

**Done when:** your OS's row passes. Commit "Milestone M6".

---

# Phase 12 — Views & polish

## Task 12.1 — Formats view (generated, styled like `supported formats.png`)
**Files:** `views/FormatsView.tsx`, `views/views.css`

**Spec**
- H1 "Supported formats" (34 px, weight 500, letter-spacing −0.02em).
- A row per category in `CATEGORY_ORDER`: a grid with columns `180px 1fr auto`, 22 px vertical padding, and a 1 px `--border` top line.
  - Col 1: `CATEGORY_LABEL` (15 px, weight 500).
  - Col 2: format chips (13 px, `--text-2`, gap 18 px):
    - image/audio/video/subtitle: the input formats of that category, in `FORMATS` order (labels).
    - pdf: `PDF →` then the targets.
    - epub: `EPUB ↔ PDF`.
    - text: `TXT →` then the targets.
  - Col 3: `CATEGORY_NOTE` (12 px, `--text-3`).
- Unavailable outputs (`targetAvailable` false) are struck through, with an OS-aware tooltip based on `caps.platform`. Examples:
  - HEIC on Windows: "Needs heif-enc.exe — see README".
  - HEIC on Linux: "Install libheif-examples (apt) or libheif-tools (dnf)".
  - Missing encoders: "FFmpeg missing".

  HEIC is always available on macOS.
- Second section **"Advanced tools"** with the same row style, listing `TOOLS` labels per category. Mark ☆ extras with a small "extra" tag.
- Footer line: "Everything runs on this computer. Engines: FFmpeg {version}, libvips (sharp), pdf.js, pdf-lib, Tesseract{, sips on macOS}."

---

## Task 12.2 — Settings view
**Files:** `views/SettingsView.tsx` (`caps.appVersion` already exists since Task 2.4)

**Spec.** Grouped cards. Each row = label + description on the left, control on the right. Every change calls `api.setSettings(patch)`.

**Rows depend on the OS** (`caps.platform`). Rows that don't apply are **hidden**, not disabled:
| Row | Windows | macOS | Linux |
|---|---|---|---|
| Global drag wheel | ✓ "Drag files anywhere and press Shift (Shift+Alt for tools). Doesn't work over apps running as administrator." | ✓ "Drag files in Finder and press ⇧ (⇧⌥ for tools) — the wheel shows your file before you drop. No special permission needed." | X11: ✓ (Windows text). Wayland: shown **disabled** with "Not possible on Wayland — drop files on the window or use the file-manager menu." (`caps.globalDrag === 'unavailable'`) |
| "Send to" menu | ✓ | — | — |
| Right-click menu (`contextMenu`) | ✓ "Convert with Kabooks (Show more options on Windows 11)" | — | ✓ labelled **"File manager menu"** ("Nautilus Scripts and Dolphin") |
| Keep running in background (`closeToTray`) | "Keep running in the tray" | — (a Mac app always stays in the menu bar) | "Keep running in the tray" |
| Show icon in Dock (`showInDock`) | — | ✓ | — |
| Use hardware video encoding (`hardwareVideo`) | ✓ shows `caps.hwVideo` or "No compatible GPU encoder found" | ✓ "Apple media engine (VideoToolbox)" | ✓ (NVENC only) |
| HEIC output (About) | "Install heif-enc (see README)" when missing | "Built in" | "Install `libheif-examples` (apt) / `libheif-tools` (dnf)" when missing |

| Group | Row | Control |
|---|---|---|
| Output | Save converted files | Segmented "Next to the original" / "In one folder" + "Choose…" button (`api.pickFolder`) and the chosen path |
| Quality | Image quality | Slider 50–100 |
| | Video quality | Segmented High (CRF 20) / Balanced (23) / Small (28) |
| | Audio bitrate | Select 128 / 192 / 256 / 320 kbps |
| | PDF → image resolution | Segmented 150 / 300 / 600 DPI |
| OCR | Languages | Checkboxes from `caps.ocrLanguages` |
| Integrations | Global drag wheel | Toggle + description "Drag files anywhere and press Shift to open the wheel. Uses a global mouse/keyboard hook while Kabooks runs. Doesn't work over apps running as administrator." |
| | "Send to" menu | Toggle |
| | Right-click menu | Toggle ("under Show more options on Windows 11") |
| | Launch at login | Toggle |
| | Keep running in the tray | Toggle (`closeToTray`) |
| Notifications | Notify when finished | Toggle |
| | Open folder when finished | Toggle |
| Performance | Parallel jobs | Segmented 1 / 2 / 3 / 4 |
| | Use hardware video encoding | Toggle (see the OS table above) |
| Appearance | Theme | Segmented System / Light / Dark |
| | High-contrast accent | Toggle |
| | Show icon in Dock (macOS) | Toggle |
| About | Version, platform (`darwin-arm64`…), FFmpeg version, HEIC encoder, OCR languages | Text |
| | "All processing happens on this computer. Nothing is uploaded." | Text |

---

## Task 12.3 — Activity & notifications polish
- `ActivityList`:
  - Group rows as Today / Earlier.
  - Show the output size (`fs.stat` is not available in the renderer, so add `outputBytes?: number` to `JobUpdate`, filled in `queue.ts` after finalize).
  - Add a "Clear" button. It only clears the renderer list.
- Check that notifications appear when the overlay is closed during a long job, and that clicking one reveals the file.

---

## Task 12.4 — Accessibility, dark mode and motion pass
Checklist (fix whatever fails):
1. Every button has an accessible name; icon-only buttons use `IconButton` with `label`.
2. The keyboard alone can complete: drop (via Browse…) → wheel → `→` → Enter → card → Tab to Apply → Enter.
3. Focus rings are visible on every control in both themes.
4. With reduced motion on, the wheel opens without spinning. Where to turn it on:
   - Windows: Settings → Accessibility → Visual effects → Animation effects off.
   - macOS: System Settings → Accessibility → Display → Reduce motion.
   - GNOME: Settings → Accessibility → Reduce Animation.
5. Contrast: `--text-2` on `--surface` ≥ 4.5:1 in both themes (check with any contrast checker; adjust tokens if needed).
6. Dark mode: the wheel, panels, keycaps, sliders, title bar overlay and the transparent overlay all look right.

---

## Task 12.5 — Error message pass
Go through **Appendix C**. For every row, reproduce the situation if easy and confirm that the exact message, or a better one, is shown. Typical reproductions:
- a renamed `.txt` saved as `.mp4`;
- an encrypted PDF (create one in any PDF tool, or skip);
- a read-only output folder.

---

## Task 12.6 — Housekeeping & performance
- **At startup:**
  - delete `cache/proxies` files older than 7 days;
  - delete leftover `kabooks-jobs/*` folders older than 1 day;
  - cap the `waveCache`, `proxyCache` and thumbnail caches (already capped).
- **Measure:**
  - time from drop to wheel visible (must be ≤ 150 ms with basic inspection; log `performance.now()` deltas in dev);
  - a 12 MP JPG → WebP takes ≤ 1.5 s.
- Make sure no `console.log` spam remains in the renderer.

---

## Task 12.7 — Hardware video encoding (Apple media engine · NVENC · Quick Sync · AMF)
**Goal:**
- Use the GPU/media engine for H.264/HEVC when it is verified to work: much faster, especially on Apple Silicon.
- Fall back to `libx264` silently otherwise.

**Files:** `src/main/engines/hwVideo.ts`, edit `capabilities.ts` (call after startup), `engines/ffmpegArgs.ts` (`videoEncodeArgs` gets an optional `hw` parameter), `engines/videoArgs.ts` (`compressPlan`), tests

**Candidates per OS** (first that passes a 1-frame test wins):
| OS | Order |
|---|---|
| macOS | `h264_videotoolbox` |
| Windows | `h264_nvenc` → `h264_qsv` → `h264_amf` |
| Linux | `h264_nvenc` (VAAPI is skipped in v1: it needs device setup) |

```ts
// hwVideo.ts
import { setHardwareVideo, getCapabilities } from '../capabilities';
import { log } from '../log';
import { runFfmpegToBuffer } from './ffmpeg';

const CANDIDATES: Record<string, string[]> = { darwin: ['h264_videotoolbox'], win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'], linux: ['h264_nvenc'] };

/** Test-encode one black frame with each candidate; store the first that works. Runs in the background after startup. */
export async function detectHardwareVideo(): Promise<void> {
  const caps = getCapabilities();
  for (const enc of CANDIDATES[process.platform] ?? []) {
    if (!caps.encoders.includes(enc)) continue;
    try {
      await runFfmpegToBuffer(['-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1', '-frames:v', '1', '-c:v', enc, '-f', 'null', '-']);
      setHardwareVideo(enc);
      log.info('Hardware video encoder OK:', enc);
      return;
    } catch {
      log.info('Hardware video encoder unavailable:', enc);
    }
  }
  setHardwareVideo(null);
}
```
Call `void detectHardwareVideo()` at the end of startup in `index.ts` (do not await it).

**Pure args (add to `ffmpegArgs.ts`, with tests):**
```ts
/** Codec flags for a verified hardware H.264 encoder; quality roughly matches CRF 23. */
export function hwH264Args(encoder: string, crf: number): string[] {
  switch (encoder) {
    case 'h264_videotoolbox': return ['-c:v', 'h264_videotoolbox', '-q:v', String(Math.max(30, Math.min(80, 100 - crf * 1.6))), '-allow_sw', '1', '-pix_fmt', 'yuv420p'];
    case 'h264_nvenc': return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(crf), '-b:v', '0', '-pix_fmt', 'yuv420p'];
    case 'h264_qsv': return ['-c:v', 'h264_qsv', '-global_quality', String(crf), '-pix_fmt', 'nv12'];
    case 'h264_amf': return ['-c:v', 'h264_amf', '-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf), '-pix_fmt', 'yuv420p'];
    default: return ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
  }
}
```
- In `videoEncodeArgs(target, q, f, audio, hw?: string | null)`: for `mp4|mov|mkv`, use `hwH264Args(hw, q.crf)` when `hw` is set, instead of the libx264 flags.
- Callers pass `ctx.settings.hardwareVideo ? ctx.caps.hwVideo : null`.
- `compressPlan` uses hardware only in **quality** mode. Target-size two-pass always uses libx264, because hardware encoders don't do classic two-pass.

**Fallback.** If an FFmpeg run with a hardware encoder fails, retry **once** with `hw = null` and add the note "Hardware encoder failed — used CPU". Implement this in a helper `runWithHwFallback(build: (hw) => string[], …)` in `tools/video/common.ts` and use it in `converters/av.ts` too.

> VideoToolbox's `-q:v` works on Apple Silicon. On Intel Macs it may be ignored, and the default bitrate is used. That's acceptable, or use `-b:v` computed from the resolution if the outputs look too small.

**Tests:**
- `hwH264Args('h264_videotoolbox', 23)` contains `'-q:v'`.
- `videoEncodeArgs('mp4', q, f, 'encode', 'h264_nvenc')` contains `'h264_nvenc'` and not `'libx264'`.

**Verify:**
- On a Mac or a PC with a supported GPU, `getCapabilities().hwVideo` is not null.
- Converting `video.mp4 → mov` with the setting on is noticeably faster, and the output codec is still `h264`.
- With the setting off, `libx264` is used.

---

# Phase 13 — Packaging for Windows, macOS and Linux (Milestone M7)

## Task 13.1 — electron-builder configuration (all three OSes)
**Files:**
- `electron-builder.yml`, `build/installer.nsh`, `build/entitlements.mac.plist`
- `package.json` scripts:
  ```json
  "dist:win": "npm run build && electron-builder --win --x64",
  "dist:mac": "npm run build && electron-builder --mac",
  "dist:linux": "npm run build && electron-builder --linux",
  "dist": "node -e \"const m={win32:'win',darwin:'mac',linux:'linux'};require('child_process').execSync('npm run dist:'+m[process.platform],{stdio:'inherit'})\""
  ```

> **Each OS builds on itself, and macOS builds one architecture per machine** (the `${arch}` of the runner). The reason: `sharp` installs native binaries only for the current OS/arch, and `resources/bin/<platform>-<arch>` must match. CI (Task 13.5) runs all of them.

```yaml
appId: com.kabooks.app
productName: Kabooks
copyright: Copyright © 2026 Kabooks contributors
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json
npmRebuild: false          # sharp / uiohook-napi / tesseract ship prebuilt N-API binaries
asarUnpack:
  - node_modules/sharp/**/*
  - node_modules/@img/**/*
  - node_modules/uiohook-napi/**/*
  - node_modules/tesseract.js/**/*
  - node_modules/tesseract.js-core/**/*
extraResources:            # common to every OS
  - from: resources/tessdata
    to: tessdata
  - from: THIRD_PARTY_NOTICES.md
    to: THIRD_PARTY_NOTICES.md

# ---------- Windows ----------
win:
  icon: build/icon.png
  extraResources:
    - from: resources/bin/win32-x64
      to: bin
    - from: resources/tray.png
      to: tray.png
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  include: build/installer.nsh
portable:
  artifactName: ${productName}-${version}-portable.exe

# ---------- macOS ----------
mac:
  icon: build/icon.png
  category: public.app-category.productivity
  target: [dmg, zip]
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  # identity: '-'          # uncomment for ad-hoc signing when you have no Developer ID (see Task 13.6)
  extraResources:
    - from: resources/bin/darwin-${arch}
      to: bin
    - from: resources/trayTemplate.png
      to: trayTemplate.png
    - from: resources/trayTemplate@2x.png
      to: trayTemplate@2x.png
  fileAssociations:        # Finder "Open With → Kabooks" without stealing the default app
    - { ext: [jpg, jpeg, png, webp, heic, heif, tif, tiff, svg, avif, bmp], name: Image, role: Viewer, rank: Alternate }
    - { ext: [mp3, m4a, wav, flac, ogg, opus, aiff, aif, wma], name: Audio, role: Viewer, rank: Alternate }
    - { ext: [mp4, m4v, mov, mkv, webm, avi, wmv, gif], name: Video, role: Viewer, rank: Alternate }
    - { ext: [pdf, epub, txt, md, srt, vtt], name: Document, role: Viewer, rank: Alternate }
  extendInfo:
    LSMultipleInstancesProhibited: true
dmg:
  sign: false

# ---------- Linux ----------
linux:
  icon: build/icon.png
  category: Utility
  executableName: kabooks
  synopsis: Offline file converter
  target: [AppImage, deb]
  extraResources:
    - from: resources/bin/linux-${arch}
      to: bin
    - from: resources/tray.png
      to: tray.png
  mimeTypes:               # "Open With → Kabooks" in GNOME/KDE (not default)
    - image/jpeg
    - image/png
    - image/webp
    - image/heic
    - image/tiff
    - image/svg+xml
    - image/avif
    - image/bmp
    - audio/mpeg
    - audio/mp4
    - audio/x-wav
    - audio/flac
    - audio/ogg
    - audio/x-aiff
    - audio/x-ms-wma
    - video/mp4
    - video/quicktime
    - video/x-matroska
    - video/webm
    - video/x-msvideo
    - video/x-ms-wmv
    - image/gif
    - application/pdf
    - application/epub+zip
    - text/plain
    - application/x-subrip
    - text/vtt
deb:
  depends: [libgtk-3-0, libnss3, libxss1, libxtst6, libnotify4, libgbm1, "libasound2 | libasound2t64"]
```
> Windows deliberately has **no** `fileAssociations`, so the installer never changes default apps. Send to / right-click (Tasks 11.2–11.3) are used instead.

**`build/installer.nsh`** (Windows: clean the per-user integrations on uninstall):
```nsh
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Kabooks"
  Delete "$APPDATA\Microsoft\Windows\SendTo\Kabooks.lnk"
!macroend
```
**`build/entitlements.mac.plist`** (hardened runtime for Electron + spawned FFmpeg/helper):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
```

---

## Task 13.2 — Build and self-test the packaged app (on your OS)
A packaged app writes its self-test report to `<temp>/kabooks-selftest/report.json`. It must show **0 failed**.

| OS | Build | Run the packaged self-test | Report |
|---|---|---|---|
| Windows | `npm run dist:win` → `dist/Kabooks Setup 0.1.0.exe`, `…-portable.exe`, `dist/win-unpacked/` | `& ".\dist\win-unpacked\Kabooks.exe" --selftest` (wait for exit) | `$env:TEMP\kabooks-selftest\report.json` |
| macOS | `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac` → `dist/Kabooks-0.1.0-arm64.dmg` (or x64) + zip, `dist/mac-arm64/Kabooks.app` | `./dist/mac-arm64/Kabooks.app/Contents/MacOS/Kabooks --selftest` | `$TMPDIR/kabooks-selftest/report.json` |
| Linux | `npm run dist:linux` → `dist/Kabooks-0.1.0.AppImage`, `dist/kabooks_0.1.0_amd64.deb`, `dist/linux-unpacked/` | `./dist/linux-unpacked/kabooks --selftest` (headless: `xvfb-run -a ./dist/linux-unpacked/kabooks --selftest --no-sandbox`) | `/tmp/kabooks-selftest/report.json` |

Also check that the bundled tools run from inside the package:
- **macOS:** `codesign --verify --deep dist/mac-arm64/Kabooks.app` prints nothing. Spawning `Contents/Resources/bin/ffmpeg` works, because the self-test covers it.
- **Linux:** `ls -l dist/linux-unpacked/resources/bin/` shows `ffmpeg` and `ffprobe` as executable (`-rwxr-xr-x`).

Typical packaged-only failures and fixes are in **Appendix D**: sharp not found, tesseract worker path, blank window, unsigned helper, Linux sandbox.

---

## Task 13.3 — Third-party notices
**File:** `THIRD_PARTY_NOTICES.md` (shipped via `extraResources`; link it from Settings → About)

| Component | Licence | Note |
|---|---|---|
| Electron / Chromium | MIT / BSD-style | |
| FFmpeg (gyan.dev essentials on Windows; Martin Riedl builds on macOS/Linux) | **GPL** (includes x264/x265) | Include `LICENSE-ffmpeg.txt`; offer source on request, or switch to LGPL builds before public distribution |
| kabooks-drag-helper (macOS) | our code | |
| sharp / libvips | Apache-2.0 / LGPL-3.0 | |
| heic-decode / libheif | ISC / LGPL-3.0 | |
| heif-enc (optional) | LGPL-3.0 + x265 GPL-2.0 | only if bundled |
| pdf.js | Apache-2.0 | |
| pdf-lib | MIT | |
| docx | MIT | |
| JSZip | MIT (dual MIT/GPLv3) | |
| fast-xml-parser | MIT | |
| exifr | MIT | |
| piexifjs | MIT | |
| imagetracerjs | Unlicense | |
| tesseract.js + traineddata | Apache-2.0 | |
| uiohook-napi | MIT | |
| React, zustand | MIT | |
| lucide-react | ISC | |
| Inter font | SIL OFL 1.1 | |

---

## Task 13.4 — Release checklist (per OS)
For every OS you can test:
1. **Offline test:** disconnect the network, install the package, then convert one file of every category. Everything must work.
2. **Temp folder** (`<temp>/kabooks-jobs`) is empty after jobs finish.

Then:
| OS | Extra checks |
|---|---|
| Windows | Clean user account: first launch, Send to, right-click menu, tray, launch at login. Uninstall → the right-click entry and the Send to shortcut are gone, and no Kabooks process remains. SmartScreen warns about an unsigned build; this is expected. |
| macOS | Install from the DMG into /Applications. First launch: unsigned/ad-hoc builds need **System Settings → Privacy & Security → Open Anyway** (macOS 15+) or right-click → Open (older). Signed and notarized builds open directly. Then: menu-bar icon, ⇧-drag from Finder shows the real thumbnail, Open With, Dock drop, HEIC output (sips), hardware encoding (`hwVideo = h264_videotoolbox`). Apple Silicon **and** Intel if possible. |
| Linux | `.deb`: `sudo apt install ./dist/kabooks_*.deb` → app menu entry, Open With, Nautilus/Dolphin menu, tray (GNOME needs AppIndicator), autostart. AppImage: `chmod +x` then run. On Ubuntu 24.04+ it may need `--no-sandbox` or an AppArmor profile (Appendix D). X11: global Shift-drag wheel. Wayland: the Settings row explains why it is unavailable. |

Tag `v0.1.0` when all **tested** rows pass, and write in PROGRESS.md which OSes were tested by hand and which only by CI.

---

## Task 13.5 — CI: build and self-test on all three OSes (GitHub Actions)
**Files:** `.github/workflows/build.yml`
```yaml
name: build
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: windows-latest, dist: 'dist:win' }
          - { os: macos-15, dist: 'dist:mac' }          # Apple Silicon (arm64)
          - { os: macos-15-intel, dist: 'dist:mac' }    # Intel (x64); GitHub supports this label until Aug 2027
          - { os: ubuntu-22.04, dist: 'dist:linux' }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Linux libraries
        if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y xvfb libgtk-3-0 libnss3 libxss1 libxtst6 libnotify4 libgbm1 libheif-examples
      - run: npm ci
      - run: npm run fetch-binaries        # also builds the macOS drag helper on macOS runners
      - run: npm run check-binaries
      - run: npm run typecheck
      - run: npm test
      - name: Self-test
        if: runner.os != 'Linux'
        run: npm run selftest
      - name: Self-test (Linux, headless)
        if: runner.os == 'Linux'
        run: xvfb-run -a npm run selftest -- --no-sandbox
      - name: Package
        run: npm run ${{ matrix.dist }}
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: false     # unsigned CI builds; see Task 13.6 for signing
      - uses: actions/upload-artifact@v4
        with:
          name: kabooks-${{ matrix.os }}
          path: |
            dist/*.exe
            dist/*.dmg
            dist/*.zip
            dist/*.AppImage
            dist/*.deb
            .selftest/report.json
          if-no-files-found: ignore
```
**Verify:** push to GitHub (create a private repo if needed). All four jobs go green, and the artifacts contain an installer for each OS and the self-test reports. If a job fails, open its log; the self-test prints `FAIL <case> — <reason>`.

> The workflow needs network access only at build time (npm, binaries). The built app is offline.

---

## Task 13.6 — (Optional) Code signing & notarization
Only needed for public distribution. Without it, the app still works; users just see one OS warning on first launch.

| OS | What you need | How |
|---|---|---|
| macOS | Apple Developer Program ($99/year): a "Developer ID Application" certificate + an app-specific password | Set the env vars `CSC_LINK` (base64 .p12), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, then set `mac.notarize: true` in `electron-builder.yml`. electron-builder signs **every** Mach-O inside the app, including `bin/ffmpeg`, `bin/ffprobe` and `bin/kabooks-drag-helper`, then notarizes and staples. |
| macOS (no account) | nothing | Build ad-hoc signed: `npx electron-builder --mac -c.mac.identity=- -c.directories.output="$HOME/alohamora-build/dist"` (or uncomment `identity: '-'` in `electron-builder.yml`). electron-builder 26 accepts `-` and seals the whole bundle (verified on Apple Silicon: `codesign --verify --deep --strict` passes and the packaged self-test is 122/0/1). **Do not use `CSC_IDENTITY_AUTO_DISCOVERY=false` alone**: it skips signing and leaves an invalid signature on the renamed app (macOS then says "is damaged"). Build outside iCloud-synced folders (see Appendix D). Users open the app via right-click → Open or Privacy & Security → Open Anyway. |
| Windows | an OV/EV code-signing certificate or Azure Trusted Signing | `CSC_LINK`/`CSC_KEY_PASSWORD`, or electron-builder's `azureSignOptions`. Removes the SmartScreen warning once reputation builds. |
| Linux | nothing | AppImage/.deb are not signed by convention. |

In CI, store the secrets as GitHub Actions secrets and remove `CSC_IDENTITY_AUTO_DISCOVERY: false` for release builds. Note that the macOS CI jobs currently use `CSC_IDENTITY_AUTO_DISCOVERY: false`, which produces macOS artifacts with an invalid signature; for downloadable CI builds pass `-c.mac.identity=-` (ad-hoc) or real signing secrets instead.

---

# Appendix A — FFmpeg cookbook (human-readable reference)
These are the commands the arg builders produce. Use them to debug by hand. `IN`/`OUT` are paths; `-y -hide_banner -nostdin -loglevel error -progress pipe:1` is always prepended.

| Operation | Command |
|---|---|
| Probe | `ffprobe -v error -print_format json -show_format -show_streams IN` |
| Remux (copy) | `-i IN -map 0:v:0 -map 0:a? -c copy -movflags +faststart OUT.mp4` |
| → MP4/MOV/MKV | `-i IN -map 0:v:0 -map 0:a:0? -vf scale=trunc(iw/2)*2:trunc(ih/2)*2 -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart OUT` |
| → WebM | `… -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 -pix_fmt yuv420p -c:a libopus -b:a 160k OUT.webm` |
| → AVI | `… -c:v mpeg4 -q:v 4 -vtag xvid -c:a libmp3lame -q:a 3 OUT.avi` |
| → WMV | `… -c:v wmv2 -b:v 3000k -c:a wmav2 -b:a 192k OUT.wmv` |
| → GIF | `-i IN -map 0:v:0 -vf "fps=12,scale='min(480,iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -an OUT.gif` |
| → MP3 (audio) | `-i IN -map 0:a:0 -vn -map_metadata 0 -c:a libmp3lame -q:a 2 -id3v2_version 3 OUT.mp3` |
| → M4A / WAV / FLAC / OGG / Opus / AIFF / WMA | `-c:a aac -b:a 192k` / `pcm_s16le` / `flac -compression_level 5` / `libvorbis -q:a 5` / `libopus -b:a 160k -ar 48000` / `pcm_s16be` / `wmav2 -b:a 192k` |
| Compress video | `-i IN -map 0:v:0 -vf scale=1280:720,scale=trunc(iw/2)*2:trunc(ih/2)*2 -c:v libx264 -preset medium -crf 24 -pix_fmt yuv420p -map 0:a:0 -c:a aac -b:a 128k -movflags +faststart OUT` |
| Two-pass size | pass 1: `… -b:v 1237k -pass 1 -passlogfile LOG -an -f null -`; pass 2: `… -b:v 1237k -pass 2 -passlogfile LOG -map 0:a:0 -c:a aac -b:a 128k OUT` |
| Trim fast | `-ss 12.000 -i IN -t 5.000 -map 0:v? -map 0:a? -c copy -avoid_negative_ts make_zero OUT` |
| Trim precise | `-ss 12.000 -i IN -t 5.000 -map 0:v:0 -map 0:a:0? -vf scale=trunc(iw/2)*2:trunc(ih/2)*2 -c:v libx264 -crf 20 … OUT` |
| Crop | `-i IN -map 0:v:0 -map 0:a:0? -vf crop=640:360:100:50,scale=trunc(iw/2)*2:trunc(ih/2)*2 -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a copy OUT` |
| Speed ×2 | `-i IN -filter_complex "[0:v:0]setpts=PTS/2.0000,scale=…[v];[0:a:0]atempo=2.0000[a]" -map [v] -map [a] …` |
| Mute | `-i IN -map 0:v -c copy -an OUT` |
| Snapshot | `-ss 3.200 -i IN -frames:v 1 OUT.png` |
| Frames every 5 s | `-i IN -vf fps=1/5 DIR/f-%05d.png` |
| Redact (blur + box) | `-i IN -filter_complex "[0:v:0]split=2[b0][c0];[c0]crop=200:100:50:60,gblur=sigma=17[r0];[b0][r0]overlay=50:60[v0];[v0]drawbox=x=10:y=10:w=80:h=40:color=black@1:t=fill:enable='between(t,1.000,3.000)'[v1];[v1]scale=…[vout]" -map [vout] -map 0:a:0? … -map_metadata -1 OUT` |
| Metadata | `-i IN -map 0 -c copy -map_metadata 0 -metadata title="Hello" -movflags +faststart+use_metadata_tags OUT` |
| Remove metadata | `-i IN -map 0 -c copy -map_metadata -1 -map_chapters -1 -fflags +bitexact OUT` |
| Join (copy) | `-f concat -safe 0 -i list.txt -map 0:v? -map 0:a? -c copy OUT` (list lines: `file 'C:/x/a.mp4'`) |
| Normalize clip for join | `-i IN [-f lavfi -t D -i anullsrc=channel_layout=stereo:sample_rate=48000] -map 0:v:0 -map 0:a:0 -vf scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30 -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2 OUT` |
| Loudnorm pass 1 | `-i IN -map 0:a:0 -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -` (log level info; JSON at the end of stderr) |
| Loudnorm pass 2 | `-af loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=…:measured_TP=…:measured_LRA=…:measured_thresh=…:offset=…:linear=true -ar 44100 …` |
| Audio fades | `-af afade=t=in:st=0:d=0.5,afade=t=out:st=4.5:d=0.5` |
| Channels | mono `-ac 1` · left `-af pan=mono|c0=c0` · swap `-af pan=stereo|c0=c1|c1=c0` |
| Waveform PNG | `-i IN -filter_complex "[0:a:0]aformat=channel_layouts=mono,showwavespic=s=1920x480:colors=0xFF5A1F[fg];color=c=0xFFFFFF:s=1920x480[bg];[bg][fg]overlay=format=auto" -frames:v 1 OUT.png` |
| Spectrogram | `-i IN -lavfi showspectrumpic=s=1920x1080:legend=1 OUT.png` |
| Bleep | `-i IN -filter_complex "[0:a:0]aformat=channel_layouts=stereo,volume=volume=0:enable='between(t,1,2)'[m];sine=frequency=1000:sample_rate=44100,aformat=channel_layouts=stereo,volume=volume=0.35,volume=volume=0:enable='not(between(t,1,2))'[t];[m][t]amix=inputs=2:duration=first:normalize=0[out]" -map [out] …` |
| Cover art (MP3) | `-i IN -i cover.jpg -map 0:a:0 -map 1:0 -c:a copy -c:v copy -disposition:v:0 attached_pic -id3v2_version 3 OUT.mp3` |
| Join audio | `-i A -i B -filter_complex "[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0];[1:a:0]…[a1];[a0][a1]concat=n=2:v=0:a=1[out]" -map [out] …` |
| Preview proxy | `-i IN -map 0:v:0 -map 0:a:0? -vf "scale=-2:'min(ih,480)'" -c:v libx264 -preset ultrafast -crf 28 -g 15 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart OUT.mp4` |
| Hardware H.264 (macOS) | `… -c:v h264_videotoolbox -q:v 63 -allow_sw 1 -pix_fmt yuv420p …` |
| Hardware H.264 (NVIDIA) | `… -c:v h264_nvenc -preset p5 -rc vbr -cq 23 -b:v 0 -pix_fmt yuv420p …` |
| Hardware H.264 (Intel / AMD) | `… -c:v h264_qsv -global_quality 23 -pix_fmt nv12 …` / `… -c:v h264_amf -rc cqp -qp_i 23 -qp_p 23 …` |
| HEIC output (macOS) | `sips -s format heic -s formatOptions 85 in.png --out out.heic` (not FFmpeg) |
| HEIC output (Windows/Linux) | `heif-enc -q 85 -o out.heic in.png` (not FFmpeg) |
| Frame for preview | `-ss T -i IN -frames:v 1 -vf "scale='min(960,iw)':-2" -f image2pipe -c:v mjpeg -q:v 4 pipe:1` |
| Waveform for UI | `-i IN -filter_complex "aformat=channel_layouts=mono,showwavespic=s=800x96:colors=0x8A8A8A" -frames:v 1 -f image2pipe -c:v png pipe:1` |

---

# Appendix B — EPUB templates (`src/main/engines/epubTemplates.ts`)
```ts
import { escapeXml } from '@shared/text';

export const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

export const STYLE_CSS = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.25; }
p { margin: 0 0 0.8em; text-align: justify; }
ul { margin: 0 0 0.8em 1.2em; }`;

export function chapterXhtml(title: string, body: string, lang: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;
}

export function fixedPageXhtml(title: string, img: string, w: number, h: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><meta name="viewport" content="width=${w}, height=${h}"/>
<style>html,body{margin:0;padding:0}img{display:block;width:${w}px;height:${h}px}</style></head>
<body><img src="${escapeXml(img)}" alt="${escapeXml(title)}"/></body>
</html>`;
}

export function navXhtml(title: string, items: Array<{ href: string; title: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${items.map((i) => `<li><a href="${escapeXml(i.href)}">${escapeXml(i.title)}</a></li>`).join('\n')}
</ol></nav></body>
</html>`;
}

export interface OpfInput {
  title: string; author?: string; lang: string; id: string; fixed: boolean;
  items: Array<{ id: string; href: string; type: string }>;
  images: Array<{ id: string; href: string; type: string }>;
}

export function opfXml(o: OpfInput): string {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    ...(o.fixed ? [] : ['<item id="css" href="style.css" media-type="text/css"/>']),
    ...o.items.map((i) => `<item id="${i.id}" href="${escapeXml(i.href)}" media-type="${i.type}"/>`),
    ...o.images.map((i) => `<item id="${i.id}" href="${escapeXml(i.href)}" media-type="${i.type}"/>`)
  ].join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(o.lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${o.id}</dc:identifier>
    <dc:title>${escapeXml(o.title)}</dc:title>
    <dc:language>${escapeXml(o.lang)}</dc:language>
    ${o.author ? `<dc:creator>${escapeXml(o.author)}</dc:creator>` : ''}
    <meta property="dcterms:modified">${modified}</meta>
    ${o.fixed ? '<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">none</meta>' : ''}
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${o.items.map((i) => `<itemref idref="${i.id}"/>`).join('\n    ')}
  </spine>
</package>`;
}
```
Rules:
1. `mimetype` must be the **first** zip entry and **stored** (not compressed). `buildReflowEpub`/`buildFixedEpub` already do this.
2. Every file in the zip except `mimetype`, `META-INF/*` and the OPF itself must be listed in the manifest.
3. All text goes through `escapeXml`.

---

# Appendix C — Error-message catalogue
| Situation | Message shown (title) | Where |
|---|---|---|
| File is not what its extension says / damaged media | "This file looks damaged, or it is not really the format its name says." | `friendlyFfmpegError` |
| Video → audio, but there is no audio track | "<name> has no audio track." | `convertAv` |
| Mute a video without audio | "<name> has no audio to remove." | video mute |
| Encrypted PDF | "This PDF is password-protected. Remove the password first, then try again." | `pdfOpen`, `loadPdf` |
| Damaged PDF | "This PDF could not be opened. It may be damaged." | same |
| Scanned PDF with OCR off | "This PDF has no text layer (it looks scanned). Turn on OCR to extract the text." | `pdfToBlocks` |
| No OCR data | "No OCR language data found. Run \"npm run fetch-binaries\"." | `withOcrWorker` |
| HEIC output without an encoder (Windows without heif-enc.exe, Linux without libheif tools) | "HEIC output is not available on this computer (see the Formats page)." | `convertImage`, `encodeHeic` |
| Unreadable image | "Kabooks couldn't read this image. It may be damaged." | `loadImage` |
| Bad page range | the `RangeError` text, e.g. "Page 12 doesn't exist (this PDF has 10 pages)" | split / images / OCR |
| Crop with nothing selected | "Move the crop handles first — the whole frame is selected." | crop |
| Redact without boxes | "Draw at least one box over the area to hide." | redact |
| Compress target too small | "<n> MB is too small for a <duration> video. Try at least <m> MB." | video compress |
| Compressed file not smaller | Done card note: "Already well compressed — no smaller file was made." | compress tools |
| Silent audio for normalize | "This file is silent." | normalize |
| Mono file for left/right/swap | "This file is mono." | channels |
| Permission denied writing | "Kabooks can't read or write this file. Close it in other apps and try again." | `friendlyFfmpegError`, `finalize` (map `EPERM`/`EACCES` to this) |
| Disk full | "The disk is full." | same (map `ENOSPC`) |
| Mixed file kinds in tools ring | Hub/caption: "Mixed file types — drop files of one kind to see tools" | `buildWheel` |
| Unsupported file | "This file type isn't supported yet" | `buildWheel` |
| Anything else | "Something went wrong while processing this file." + Details | `toUserMessage` |

---

# Appendix D — Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `npm install` fails on sharp | `npm install --include=optional sharp`. Make sure Node is x64. |
| Packaged app: "Could not load the sharp module" | `asarUnpack` must include `node_modules/sharp/**/*` **and** `node_modules/@img/**/*`. |
| `window.kabooks is undefined` | The preload path is wrong (`.js` vs `.mjs`; see Task 0.4), or the preload threw. Open DevTools (F12) and check the console. |
| Blank window in production | Check `rendererDir()` = `out/renderer`, and that the `app://` handler is registered **after** ready while `registerSchemes()` ran **before** ready, in a single call. |
| "Expected a JavaScript module script but the server responded with MIME type text/plain" | `mimeFor` must map `js`/`mjs` → `text/javascript` in `protocol.ts`. |
| pdf.js "Setting up fake worker failed" | Import the worker with `?url` (Task 6.6) and check the CSP has `worker-src 'self' blob:`. |
| pdf.js warns about standard fonts / CMaps | `npm run build` must print "pdf.js assets copied" (the pre-script). |
| "@vitejs/plugin-react can't detect preamble" | There must be **no** CSP `<meta>` in `index.html` (the CSP comes from the `app://` header). |
| FFmpeg not found / every AV job fails | Run `npm run fetch-binaries`, then `npm run check-binaries`. The folder must be `resources/bin/<platform>-<arch>` for **your** machine (e.g. `darwin-arm64`, not `darwin-x64`, on Apple Silicon). |
| `EBUSY` / `EPERM` when cleaning temp | `sharp.cache(false)` must be set (in `index.ts`). Make sure FFmpeg was killed on cancel. `rm` uses `maxRetries`. |
| Dropping a file navigates the window to the file | The global `dragover`/`drop` `preventDefault` in `main.tsx` is missing. |
| The original file disappeared after a Shift-drag | Some code set `dropEffect = 'move'`. It must always be `'copy'`. |
| Overlay has a black/white box instead of transparency | `transparent: true`, `backgroundColor: '#00000000'`, and CSS `html[data-view='overlay'] body { background: transparent }`. |
| Overlay opened from Send To has no keyboard focus | Windows' foreground-lock rule; one click focuses it. Acceptable. |
| Global drag wheel never appears | Is the setting on? Is the log line "Global drag wheel started" there? Hooks cannot see admin windows. Try dragging from a normal Explorer window. |
| Notifications don't show | `app.setAppUserModelId('com.kabooks.app')` must run early. Check Windows Focus Assist / Do Not Disturb. |
| Packaged OCR fails "Cannot find module …worker-script…" | `asarUnpack` both tesseract packages; the `workerPath` option in `withOcrWorker` (Task 6.12). |
| `ERR_REQUIRE_ESM` in main | An ESM-only dependency was added. Replace it, or load it with `await import()`. |
| "width not divisible by 2" | Use `EVEN_SCALE` or `toPixelRect(..., true)`. |
| Video preview cannot seek | kfile Range handling (Task 3.1); the proxy is used for non-H.264 sources. |
| `Cannot find namespace 'JSX'` | Remove explicit `JSX.Element` return types (React 19 types). |
| electron-builder tries to compile native modules | `npmRebuild: false` in `electron-builder.yml`. |
| Right-click entry missing on Windows 11 | It is in **Show more options** (classic menu). This is expected for registry verbs. |
| A self-test is flaky on timing (fast trim) | Fast trims cut at keyframes; the case uses a wide tolerance on purpose. |
| **macOS:** `ffmpeg` "killed: 9" / "cannot be opened because the developer cannot be verified" | The binary lost its signature or has the quarantine flag. Run `xattr -d com.apple.quarantine <file>` and `codesign --force --sign - <file>`; `fetch-binaries` does this automatically. |
| **macOS:** `npm install` installed x64 packages on Apple Silicon | Node runs under Rosetta. Install the arm64 Node (`node -p process.arch` must print `arm64`), delete `node_modules`, run `npm ci`. |
| **macOS:** drag helper never reports files | Run the helper by hand (Task 11.7 Verify step 2). If `paths` is empty on a new macOS version, the pasteboard-privacy rules changed: keep the "Drop to choose" fallback and note the macOS version. |
| **macOS:** global wheel doesn't show over a full-screen app | Check `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })` in `overlayWindow.ts`. |
| **macOS:** ⌘C / ⌘V don't work in text fields | The application menu with `{ role: 'editMenu' }` is missing (`appMenu.ts`). |
| **macOS:** packaged app is "damaged and can't be opened" | It was modified after signing, or its signature is invalid. A build made with only `CSC_IDENTITY_AUTO_DISCOVERY=false` has an invalid signature (`codesign --verify --deep --strict <app>` fails with "code has no resources but signature indicates they must be present"). Rebuild with `-c.mac.identity=-` (ad-hoc) or sign and notarize (Task 13.6). |
| **macOS:** `codesign` / electron-builder fails with "resource fork, Finder information, or similar detritus not allowed" | The project is in an iCloud-synced folder (`~/Desktop`, `~/Documents`); the file provider adds `com.apple.FinderInfo` / `com.apple.fileprovider.fpfs#P` attributes to the build output. Build into a folder outside iCloud: `-c.directories.output="$HOME/alohamora-build/dist"` (verified to fix it). Moving the project out of the synced folder should work too (not tried). |
| **macOS:** `node: command not found`, `brew: command not found` | No Node installed. Install Node 22+ for arm64 (nodejs.org installer, nvm, fnm or Homebrew). A tarball from nodejs.org unpacked to `~/.local` also works if you add its `bin` folder to `PATH`. |
| **macOS:** `npm run fetch-binaries` fails with `ConnectTimeoutError` for ffmpeg.martin-riedl.de | The download host timed out. Run the command again: finished downloads are cached in `.cache/downloads`. (Do not test the URL with `curl -I`: the host answers HEAD requests with 404 although GET works.) |
| **macOS:** `node_modules/electron/dist` and `node_modules/electron/path.txt` are missing after `npm install` | The Electron binary was not downloaded (seen on a fresh Apple Silicon install; cause not investigated). Run `node node_modules/electron/install.js`; it downloads the binary and writes `path.txt`. |
| **Linux:** "The SUID sandbox helper binary was found, but is not configured correctly" | Ubuntu 23.10+ restricts unprivileged user namespaces (AppArmor). Options: install the `.deb` (it sets up `chrome-sandbox`); for dev run `sudo chown root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox`; or start with `--no-sandbox` (dev/CI only). |
| **Linux:** the overlay has a black box around the wheel | No compositor, or transparency is disabled. `enable-transparent-visuals` must be set before `ready` (`index.ts`). On X11 without a compositor, transparency is impossible: the wheel still works. Optionally add `html[data-platform='linux'] .overlay { background: var(--bg); border-radius: 28px }` as a fallback. |
| **Linux:** tray icon invisible (GNOME) | GNOME needs the "AppIndicator and KStatusNotifierItem Support" extension. Kabooks still works: launching it again opens the window. |
| **Linux:** global wheel unavailable | Wayland session (`echo $XDG_SESSION_TYPE`). Global hooks are impossible there by design. Use the window drop or the file-manager menu, or log in with "GNOME on Xorg". |
| **Linux:** `uiohook-napi` fails to load | Install `libxtst6` (Debian/Ubuntu) / `libXtst` (Fedora). |
| **Linux:** HEIC slice missing | `sudo apt install libheif-examples` (or `dnf install libheif-tools`), then restart Kabooks. |
| Generated PDFs use an ugly fallback font on Linux | Install common fonts: `sudo apt install fonts-dejavu fonts-noto-core`. The stacks in `fontStack()` try them. |
| Hardware encoder chosen but jobs fail | `runWithHwFallback` must retry with the CPU (Task 12.7). Turn off "Use hardware video encoding" to confirm. |

---

# Appendix E — `PROGRESS.md` template
```markdown
# Kabooks — progress log
Legend: [x] done · [~] partial (see notes) · [ ] todo
Blocked: (write here if something blocks you)

## Phase 0 — Scaffold
- [ ] 0.1 Repo init
- [ ] 0.2 package.json & deps
- [ ] 0.3 TS / electron-vite / Vitest config
- [ ] 0.4 Hello window
- [ ] 0.5 Vitest smoke
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
```

---

# Appendix F — App icon (`scripts/make-icons.mjs`)
```js
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const polar = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [256 + r * Math.cos(a), 256 + r * Math.sin(a)]; };

function slice(i, n, ro, ri, gapDeg) {
  const span = 360 / n;
  const a0 = i * span - span / 2 + gapDeg;
  const a1 = a0 + span - 2 * gapDeg;
  const [x1, y1] = polar(ro, a0); const [x2, y2] = polar(ro, a1);
  const [x3, y3] = polar(ri, a1); const [x4, y4] = polar(ri, a0);
  return `M${x1} ${y1} A${ro} ${ro} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 0 0 ${x4} ${y4} Z`;
}

const n = 8;
const slices = Array.from({ length: n }, (_, i) =>
  `<path d="${slice(i, n, 226, 96, 2.2)}" fill="${i === 3 ? '#FF5A1F' : '#FBFBFA'}"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`
  + `<circle cx="256" cy="256" r="252" fill="#E2E2E0"/>${slices}<circle cx="256" cy="256" r="78" fill="#FFFFFF"/></svg>`;

// macOS menu-bar "template" glyph: black shapes + alpha only (the system tints it for light/dark menu bars).
const glyphSlices = Array.from({ length: n }, (_, i) =>
  `<path d="${slice(i, n, 240, 110, 4)}" fill="#000" fill-opacity="${i === 3 ? 1 : 0.55}"/>`).join('');
const glyph = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${glyphSlices}</svg>`;

fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'resources'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.svg'), svg);
// 1024 px source: electron-builder derives .ico (Windows), .icns (macOS) and the Linux icon set from it.
await sharp(Buffer.from(svg), { density: 144 }).resize(1024, 1024).png().toFile(path.join(root, 'build', 'icon.png'));
await sharp(Buffer.from(svg)).resize(32, 32).png().toFile(path.join(root, 'resources', 'tray.png'));               // Windows/Linux tray
await sharp(Buffer.from(glyph)).resize(18, 18).png().toFile(path.join(root, 'resources', 'trayTemplate.png'));     // macOS @1x
await sharp(Buffer.from(glyph)).resize(36, 36).png().toFile(path.join(root, 'resources', 'trayTemplate@2x.png'));  // macOS @2x
console.log('Icons written: build/icon.png (1024), resources/tray.png, resources/trayTemplate(@2x).png');
```
The icon is a light wheel of 8 slices with one orange slice (the "picked" one) and a white hub, the same visual language as the app. On macOS the menu-bar version is a monochrome template glyph of the same wheel. The highlighted slice is opaque and the others semi-transparent, which matches native menu-bar icons.

