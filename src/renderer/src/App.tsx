import { useEffect, useState } from 'react';
import { CaptionButtons } from './components/CaptionButtons';
import { Logo } from './components/Logo';
import { api } from './lib/api';
import { getPlatform } from './lib/platform';
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
  useEffect(() => api.onNavigate(setTab), []);    // macOS ⌘, → Settings
  useEffect(() => { void api.uiReady(); }, []);   // first render done: the backend shows the window now (no white flash)
  return (
    <div className="app">
      {/* data-tauri-drag-region: dragging the empty title bar moves the window; double-click maximizes. */}
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region><Logo size={26} />Alohamora</div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {getPlatform() === 'win32' && <CaptionButtons />}
      </header>
      <main className="app__content">
        {tab === 'convert' ? <HomeView /> : tab === 'formats' ? <FormatsView /> : <SettingsView />}
      </main>
    </div>
  );
}
