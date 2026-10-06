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
