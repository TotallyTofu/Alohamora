import { useEffect, useState } from 'react';
import {
  CATEGORY_LABEL, CATEGORY_NOTE, CATEGORY_ORDER, CONVERT_TARGETS, FORMATS, targetAvailable
} from '@shared/formats';
import { TOOLS } from '@shared/tools';
import type { Capabilities, Category, Fmt } from '@shared/types';
import { api } from '../lib/api';

/** Why an output format is unavailable, phrased for the current OS. */
function whyMissing(fmt: Fmt, cat: Category, caps: Capabilities): string {
  if (fmt === 'heic' && cat === 'image') {
    return caps.platform === 'linux'
      ? 'Install libheif-examples (apt) or libheif-tools (dnf)'
      : 'Needs heif-enc.exe — see README';
  }
  return caps.ffmpeg ? 'This FFmpeg build is missing an encoder for it' : 'FFmpeg missing';
}

function Chip({ fmt, cat, caps }: { fmt: Fmt; cat: Category; caps: Capabilities | null }) {
  const ok = !caps || targetAvailable(fmt, cat, caps);
  return (
    <span className={`fmt-chip${ok ? '' : ' is-off'}`} title={ok || !caps ? undefined : whyMissing(fmt, cat, caps)}>
      {FORMATS[fmt].label}
    </span>
  );
}

function FormatChips({ cat, caps }: { cat: Category; caps: Capabilities | null }) {
  if (cat === 'epub') return <span className="fmt-chip">EPUB ↔ PDF</span>;
  if (cat === 'pdf' || cat === 'text') {
    return (
      <>
        <span className="fmt-chip fmt-chip--lead">{cat === 'pdf' ? 'PDF' : 'TXT'} →</span>
        {CONVERT_TARGETS[cat].map((f) => <Chip key={f} fmt={f} cat={cat} caps={caps} />)}
      </>
    );
  }
  const inputs = Object.values(FORMATS).filter((f) => f.category === cat && f.input).map((f) => f.fmt);
  return <>{inputs.map((f) => <Chip key={f} fmt={f} cat={cat} caps={caps} />)}</>;
}

function version(caps: Capabilities | null): string {
  const m = /version\s+(\S+)/.exec(caps?.ffmpegVersion ?? '');
  return m ? m[1].replace(/-.*/, '') : 'not found';
}

export function FormatsView() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => { void api.getCapabilities().then(setCaps); }, []);
  const toolCats = CATEGORY_ORDER.filter((c) => TOOLS.some((t) => t.category === c));

  return (
    <div className="formats">
      <h1 className="formats__title">Supported formats</h1>
      <section aria-label="Formats">
        {CATEGORY_ORDER.map((cat) => (
          <div key={cat} className="formats__row">
            <h2 className="formats__cat">{CATEGORY_LABEL[cat]}</h2>
            <div className="formats__chips"><FormatChips cat={cat} caps={caps} /></div>
            <p className="formats__note">{CATEGORY_NOTE[cat]}</p>
          </div>
        ))}
      </section>

      <h1 className="formats__title formats__title--sub">Advanced tools</h1>
      <section aria-label="Tools">
        {toolCats.map((cat) => (
          <div key={cat} className="formats__row">
            <h2 className="formats__cat">{CATEGORY_LABEL[cat]}</h2>
            <div className="formats__chips">
              {TOOLS.filter((t) => t.category === cat).map((t) => (
                <span key={t.id} className="fmt-chip" title={t.description}>
                  {t.label}{t.extra && <small className="fmt-tag">extra</small>}
                </span>
              ))}
            </div>
            <span />
          </div>
        ))}
      </section>

      <p className="formats__footer">
        Everything runs on this computer. Engines: FFmpeg {version(caps)}, libvips (sharp), pdf.js, pdf-lib, Tesseract
        {caps?.platform === 'darwin' ? ', sips' : ''}.
      </p>
    </div>
  );
}
