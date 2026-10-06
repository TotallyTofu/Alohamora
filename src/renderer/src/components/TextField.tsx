export function TextField(p: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; type?: 'text' | 'number' }) {
  return <input className="textfield" type={p.type ?? 'text'} value={p.value} placeholder={p.placeholder} aria-label={p.label} onChange={(e) => p.onChange(e.target.value)} />;
}
