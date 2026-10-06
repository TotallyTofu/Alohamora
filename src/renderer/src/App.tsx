import { useEffect, useState } from 'react';
import { Logo } from './components/Logo';
import { api } from './lib/api';
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
        <div className="brand"><Logo size={26} />Alohamora</div>
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
