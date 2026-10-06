/** A row of round colour choices (accent ring on the selected one). */
export function ColorSwatches(p: { value: string; options: string[]; onChange: (c: string) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={p.label}>
      {p.options.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c.toLowerCase() === p.value.toLowerCase()} aria-label={c}
          className={`swatch${c.toLowerCase() === p.value.toLowerCase() ? ' is-on' : ''}`} style={{ background: c }} onClick={() => p.onChange(c)} />
      ))}
    </div>
  );
}
