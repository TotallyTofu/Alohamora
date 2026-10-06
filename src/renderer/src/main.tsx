import { createRoot } from 'react-dom/client';

const view = new URLSearchParams(window.location.search).get('view') ?? 'main';
document.documentElement.dataset.view = view;
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
createRoot(document.getElementById('root') as HTMLElement).render(
  view === 'overlay' ? <h1 style={{ background: 'white' }}>Overlay</h1> : <h1>Kabooks main</h1>
);
