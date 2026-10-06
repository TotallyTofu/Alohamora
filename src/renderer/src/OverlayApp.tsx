import { useEffect } from 'react';
import { api } from './lib/api';
import { pathsFromDataTransfer } from './lib/dnd';
import { sizeForStage } from './overlay/sizes';
import { useOverlay, type Stage } from './overlay/store';
import { DoneStage } from './overlay/stages/DoneStage';
import { ErrorStage } from './overlay/stages/ErrorStage';
import { OptionsStage } from './overlay/stages/OptionsStage';
import { PanelStage } from './overlay/stages/PanelStage';
import { RunningStage } from './overlay/stages/RunningStage';
import { WheelStage } from './overlay/stages/WheelStage';
import './overlay/overlay.css';

const AUTO_CLOSE_ON_BLUR: Stage['name'][] = ['wheel', 'running', 'done', 'error'];

function StageView({ stage }: { stage: Stage }) {
  switch (stage.name) {
    case 'empty': return null;
    case 'wheel': return <WheelStage />;
    case 'options': return <div className="overlay__center"><OptionsStage target={stage.target} /></div>;
    case 'panel': return <div className="overlay__center"><PanelStage toolId={stage.toolId} /></div>;
    case 'running': return <div className="overlay__center"><RunningStage jobId={stage.jobId} /></div>;
    case 'done': return <div className="overlay__center"><DoneStage job={stage.job} /></div>;
    case 'error': return <div className="overlay__center"><ErrorStage message={stage.message} details={stage.details} /></div>;
  }
}

/** A drop on the empty part of the overlay behaves like a drop on the hub. Wheel drops are handled (and prevented) by the wheel. */
function dropOutsideWheel(dt: DataTransfer): void {
  const paths = pathsFromDataTransfer(dt);
  if (paths.length === 0) return;
  void api.overlayDropped(paths).then((files) => useOverlay.getState().dropFinished(files));
}

export function OverlayApp() {
  const stage = useOverlay((s) => s.stage);
  const files = useOverlay((s) => s.files);

  useEffect(() => {
    const offs = [
      api.onOverlayInit((p) => useOverlay.getState().init(p)),
      api.onOverlayFiles((files) => useOverlay.getState().mergeFiles(files)),
      api.onOverlayDrag((s) => {
        const st = useOverlay.getState();
        if (!s.active) { st.endDrag(); return; }
        if (!st.caps) void api.getCapabilities().then((caps) => useOverlay.setState({ caps }));
        if (st.dragging) st.setMode(s.mode); else st.startDrag(s.mode);
        if (s.files) st.setDragFiles(s.files);
      })
    ];
    const onBlur = (): void => {
      const s = useOverlay.getState();
      if (!s.dragging && AUTO_CLOSE_ON_BLUR.includes(s.stage.name)) void api.closeOverlay();
    };
    window.addEventListener('blur', onBlur);
    return () => { offs.forEach((o) => o()); window.removeEventListener('blur', onBlur); };
  }, []);

  const catKey = files.map((f) => f.category).join(",");   // deep-inspection updates must not re-place the window
  useEffect(() => { void api.resizeOverlay(sizeForStage(stage, useOverlay.getState().files)); }, [stage, catKey]);

  return (
    <div className="overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget && stage.name === 'wheel' && !useOverlay.getState().dragging) void api.closeOverlay(); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}   // never 'move': the original must stay
      onDrop={(e) => { if (!e.defaultPrevented) { e.preventDefault(); dropOutsideWheel(e.dataTransfer); } }}>
      <StageView stage={stage} />
    </div>
  );
}
