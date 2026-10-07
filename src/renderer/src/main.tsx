import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/global.css';
import './components/components.css';
import './components/editors.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { OverlayApp } from './OverlayApp';
import { windowLabel } from './lib/api';
import { getPlatform } from './lib/platform';
import { initSound } from './lib/sound';
import { initTheme } from './lib/theme';

// Both windows load index.html; the window label decides the view ("main" or "overlay").
const view = windowLabel() === 'overlay' ? 'overlay' : 'main';
document.documentElement.dataset.view = view;
document.documentElement.dataset.platform = getPlatform();   // CSS: html[data-platform='darwin'] …
// Files are dropped through Tauri's native handler; never let the webview open a dropped file itself.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
void initTheme();
void initSound();
createRoot(document.getElementById('root') as HTMLElement).render(view === 'overlay' ? <OverlayApp /> : <App />);
