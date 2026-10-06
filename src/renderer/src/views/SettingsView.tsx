import { useEffect, useState, type ReactNode } from 'react';
import type { Capabilities, Settings } from '@shared/types';
import { Button } from '../components/Button';
import { Row } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { Select } from '../components/Select';
import { Slider } from '../components/Slider';
import { Toggle } from '../components/Toggle';
import { api } from '../lib/api';

const LANG_LABEL: Record<string, string> = { eng: 'English', vie: 'Tiếng Việt' };
const CRF_PRESETS = [{ value: 20, label: 'High' }, { value: 23, label: 'Balanced' }, { value: 28, label: 'Small' }];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings__group" aria-label={title}>
      <h2 className="settings__heading">{title}</h2>
      <div className="settings__card">{children}</div>
    </section>
  );
}

function hwDescription(caps: Capabilities): string {
  if (caps.platform === 'darwin') return 'Apple media engine (VideoToolbox)';
  if (caps.hwVideo) return `Using ${caps.hwVideo}`;
  return 'No compatible GPU encoder found';
}

function dragDescription(caps: Capabilities): string {
  if (caps.platform === 'darwin') {
    return 'Drag files in Finder and press ⇧ (⇧⌥ for tools) — the wheel shows your file before you drop. No special permission needed.';
  }
  if (caps.globalDrag === 'unavailable') return 'Not possible on Wayland — drop files on the window or use the file-manager menu.';
  return "Drag files anywhere and press Shift (Shift+Alt for tools). Uses a global mouse/keyboard hook while Alohamora runs. Doesn't work over apps running as administrator.";
}

function heicText(caps: Capabilities): string {
  if (caps.heifEnc) return caps.platform === 'darwin' ? 'Built in (sips)' : 'Available (heif-enc)';
  return caps.platform === 'linux' ? 'Install libheif-examples (apt) / libheif-tools (dnf)' : 'Install heif-enc (see README)';
}

export function SettingsView() {
  const [s, setS] = useState<Settings | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);

  useEffect(() => {
    void api.getSettings().then(setS);
    void api.getCapabilities().then(setCaps);
    return api.onSettings(setS);
  }, []);
  if (!s || !caps) return <div className="settings"><p className="card-note">Loading…</p></div>;

  const set = (patch: Partial<Settings>): void => { void api.setSettings(patch).then(setS); };
  const mac = caps.platform === 'darwin';
  const win = caps.platform === 'win32';
  const linux = caps.platform === 'linux';
  const choose = async (): Promise<void> => {
    const dir = await api.pickFolder();
    if (dir) set({ outputMode: 'custom-folder', customOutputDir: dir });
  };
  const toggleLang = (l: string): void => {
    const next = s.ocrLanguages.includes(l) ? s.ocrLanguages.filter((x) => x !== l) : [...s.ocrLanguages, l];
    if (next.length) set({ ocrLanguages: next });
  };

  return (
    <div className="settings">
      <h1 className="settings__title">Settings</h1>

      <Group title="Output">
        <Row label="Save converted files">
          <Segmented<Settings['outputMode']> label="Where to save" value={s.outputMode} onChange={(v) => set({ outputMode: v })}
            options={[{ value: 'same-folder', label: 'Next to the original' }, { value: 'custom-folder', label: 'In one folder' }]} />
          {s.outputMode === 'custom-folder' && <Button variant="soft" onClick={() => void choose()}>Choose…</Button>}
        </Row>
        {s.outputMode === 'custom-folder' && <p className="settings__path">{s.customOutputDir ?? 'No folder chosen yet'}</p>}
      </Group>

      <Group title="Quality">
        <Slider label="Images" value={s.imageQuality} min={50} max={100} onChange={(v) => set({ imageQuality: v })} />
        <Row label="Video quality">
          <Segmented<number> label="Video quality" value={s.videoCrf} onChange={(v) => set({ videoCrf: v })} options={CRF_PRESETS} />
        </Row>
        <Row label="Audio bitrate">
          <Select<string> label="Audio bitrate" value={String(s.audioBitrateKbps)} onChange={(v) => set({ audioBitrateKbps: Number(v) })}
            options={[128, 192, 256, 320].map((v) => ({ value: String(v), label: `${v} kbps` }))} />
        </Row>
        <Row label="PDF → image resolution">
          <Segmented<number> label="PDF image resolution" value={s.pdfDpi} onChange={(v) => set({ pdfDpi: v })}
            options={[150, 300, 600].map((v) => ({ value: v, label: `${v} DPI` }))} />
        </Row>
      </Group>

      <Group title="Reading scanned pages (OCR)">
        <Row label="Languages">
          <div className="checks">
            {caps.ocrLanguages.length === 0 && <span className="card-note">No OCR data found</span>}
            {caps.ocrLanguages.map((l) => (
              <label key={l} className="check"><input type="checkbox" checked={s.ocrLanguages.includes(l)} onChange={() => toggleLang(l)} />{LANG_LABEL[l] ?? l}</label>
            ))}
          </div>
        </Row>
      </Group>

      <Group title="Integrations">
        <Row label="Global drag wheel" hint={dragDescription(caps)}>
          <Toggle label="Global drag wheel" checked={s.globalDragWheel && caps.globalDrag !== 'unavailable'} onChange={(v) => set({ globalDragWheel: v })} disabled={caps.globalDrag === 'unavailable'} />
        </Row>
        {win && <Row label="“Send to” menu" hint="Adds Alohamora to Explorer's Send to menu."><Toggle label="Send to menu" checked={s.sendToMenu} onChange={(v) => set({ sendToMenu: v })} /></Row>}
        {(win || linux) && (
          <Row label={linux ? 'File manager menu' : 'Right-click menu'}
            hint={linux ? 'Nautilus Scripts and Dolphin: “Convert with Alohamora”.' : '“Convert with Alohamora” (under Show more options on Windows 11).'}>
            <Toggle label={linux ? 'File manager menu' : 'Right-click menu'} checked={s.contextMenu} onChange={(v) => set({ contextMenu: v })} />
          </Row>
        )}
        <Row label="Launch at login"><Toggle label="Launch at login" checked={s.launchAtLogin} onChange={(v) => set({ launchAtLogin: v })} /></Row>
        {!mac && <Row label="Keep running in the tray" hint="Closing the window keeps Alohamora in the tray."><Toggle label="Keep running in the tray" checked={s.closeToTray} onChange={(v) => set({ closeToTray: v })} /></Row>}
      </Group>

      <Group title="Notifications">
        <Row label="Notify when finished"><Toggle label="Notify when finished" checked={s.notifyWhenDone} onChange={(v) => set({ notifyWhenDone: v })} /></Row>
        <Row label="Open folder when finished"><Toggle label="Open folder when finished" checked={s.revealWhenDone} onChange={(v) => set({ revealWhenDone: v })} /></Row>
      </Group>

      <Group title="Performance">
        <Row label="Parallel jobs">
          <Segmented<number> label="Parallel jobs" value={s.maxConcurrentJobs} onChange={(v) => set({ maxConcurrentJobs: v })}
            options={[1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} />
        </Row>
        <Row label="Use hardware video encoding" hint={hwDescription(caps)}>
          <Toggle label="Use hardware video encoding" checked={s.hardwareVideo} onChange={(v) => set({ hardwareVideo: v })} />
        </Row>
      </Group>

      <Group title="Appearance">
        <Row label="Theme">
          <Segmented<Settings['theme']> label="Theme" value={s.theme} onChange={(v) => set({ theme: v })}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Row>
        <Row label="Sound effects" hint="A key turns as you move between choices and clicks like a lock when you pick one.">
          <Toggle label="Sound effects" checked={s.sounds} onChange={(v) => set({ sounds: v })} />
        </Row>
        <Row label="High-contrast accent"><Toggle label="High-contrast accent" checked={s.highContrastAccent} onChange={(v) => set({ highContrastAccent: v })} /></Row>
        {mac && <Row label="Show icon in Dock"><Toggle label="Show icon in Dock" checked={s.showInDock} onChange={(v) => set({ showInDock: v })} /></Row>}
      </Group>

      <Group title="About">
        <div className="ro-row"><span>Version</span><span>{caps.appVersion}</span></div>
        <div className="ro-row"><span>Platform</span><span>{caps.platform}-{caps.arch}</span></div>
        <div className="ro-row"><span>FFmpeg</span><span title={caps.ffmpegVersion}>{caps.ffmpeg ? caps.ffmpegVersion.replace(/^ffmpeg version\s+/, '').split(' ')[0] : 'not found'}</span></div>
        <div className="ro-row"><span>HEIC output</span><span>{heicText(caps)}</span></div>
        <div className="ro-row"><span>OCR languages</span><span>{caps.ocrLanguages.map((l) => LANG_LABEL[l] ?? l).join(', ') || 'none'}</span></div>
        <Row label="Open-source licences"><Button variant="soft" onClick={() => void api.openNotices()}>Third-party notices</Button></Row>
        <p className="card-note">All processing happens on this computer. Nothing is uploaded.</p>
      </Group>
    </div>
  );
}
