import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ImagePreviewRequest, ImagePreviewResult } from '@shared/types';
import { api } from '../lib/api';

export interface ImagePreviewProps {
  request: ImagePreviewRequest;
  /** Overlays (CropBox / RectEditor) placed exactly over the picture. */
  children?: ReactNode;
  maxHeight?: number;
  onLoaded?: (r: ImagePreviewResult) => void;
  /** Adds a "Hold to compare" button that shows the untouched image while pressed. */
  compare?: boolean;
}

/** Debounced server-rendered preview. Keeps the previous picture on screen until the next one arrives. */
export function ImagePreview({ request, children, maxHeight = 360, onLoaded, compare = false }: ImagePreviewProps) {
  const [shown, setShown] = useState<ImagePreviewResult | null>(null);
  const [original, setOriginal] = useState<ImagePreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const counter = useRef(0);
  const key = JSON.stringify(request);

  useEffect(() => {
    const id = ++counter.current;
    setLoading(true);
    const t = setTimeout(() => {
      void api.previewImage(request)
        .then((r) => { if (id === counter.current) { setShown(r); setLoading(false); onLoaded?.(r); } })
        .catch(() => { if (id === counter.current) setLoading(false); });
    }, 120);
    return () => clearTimeout(t);
  }, [key]);

  const press = (on: boolean): void => {
    setComparing(on);
    if (on && !original) {
      void api.previewImage({ op: 'none', path: request.path, maxSide: request.maxSide }).then(setOriginal).catch(() => undefined);
    }
  };

  const r = shown ? shown.width / shown.height : 4 / 3;
  const src = comparing && original ? original.dataUrl : shown?.dataUrl;
  return (
    <div className="imgprev">
      <div className="imgprev__frame" style={{ aspectRatio: String(r), width: `min(100%, ${Math.round(maxHeight * r)}px)` }}>
        {src && <img className="imgprev__img" src={src} alt="" draggable={false} />}
        {!comparing && <div className="imgprev__overlay">{children}</div>}
        {loading && <span className="spinner imgprev__spin" aria-label="Updating preview" />}
      </div>
      {compare && (
        <button type="button" className="btn btn--soft imgprev__compare"
          onPointerDown={() => press(true)} onPointerUp={() => press(false)} onPointerLeave={() => press(false)}>
          Hold to compare
        </button>
      )}
    </div>
  );
}
