import { useEffect, useRef, useState } from 'react';

export interface KeyLockProps {
  /** Direction of the highlighted slice in degrees (0 = 12 o'clock, clockwise), or null when nothing is highlighted. */
  angle: number | null;
  /** Changes every time a choice is made; each change plays the "turn the key" twist. */
  turnToken: number;
  size: number;
}

/**
 * The centre of the wheel: a lock plate with a keyhole and a key sticking out of it. The key swings to point at the
 * highlighted slice (always the short way round) and twists when a choice is made.
 * Drawn in a coordinate system centred on the keyhole so rotating a group turns it about the lock.
 */
export function KeyLock({ angle, turnToken, size }: KeyLockProps) {
  const total = useRef(0);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (angle === null) return;
    // Shortest way round, so going from the last slice to the first does not spin the key through 300°.
    const delta = ((((angle - total.current) % 360) + 540) % 360) - 180;
    total.current += delta;
    setRotation(total.current);
  }, [angle]);

  const half = size / 2;
  return (
    <svg className={`keylock${angle !== null ? ' is-active' : ''}`} width={size} height={size} viewBox={`${-half} ${-half} ${size} ${size}`} aria-hidden="true">
      <defs>
        <linearGradient id="alPlate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--plate-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--plate-bottom)' }} />
        </linearGradient>
      </defs>
      {/* the lock: round plate + dark keyhole */}
      <circle className="keylock__plate" r="15.5" fill="url(#alPlate)" />
      <circle className="keylock__ring" r="12" />
      <g className="keylock__hole">
        <circle cx="0" cy="-3.2" r="4.3" />
        <path d="M-2.3 -0.6 L2.3 -0.6 L3.9 8.6 L-3.9 8.6 Z" />
      </g>
      {/* the key: shaft from the keyhole out to a round bow, drawn pointing up and rotated about the lock */}
      <g className="keylock__aim" style={{ transform: `rotate(${rotation}deg)` }}>
        <g key={turnToken} className={turnToken > 0 ? 'keylock__twist' : undefined}>
          <rect className="keylock__shaft" x="-2.5" y="-35" width="5" height="32" rx="2" />
          <rect className="keylock__tooth" x="2.5" y="-28.5" width="4" height="3.6" rx="1" />
          <rect className="keylock__tooth" x="2.5" y="-22" width="4" height="3.6" rx="1" />
          <circle className="keylock__bow" cx="0" cy="-41" r="6.6" />
        </g>
      </g>
    </svg>
  );
}
