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
