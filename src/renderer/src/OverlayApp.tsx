import { useEffect } from 'react';
import { api } from './lib/api';
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

export function OverlayApp() {
  const stage = useOverlay((s) => s.stage);
  const files = useOverlay((s) => s.files);

  useEffect(() => {
    const offs = [
      api.onOverlayInit((p) => useOverlay.getState().init(p)),
      api.onOverlayFiles((files) => useOverlay.getState().mergeFiles(files))
    ];
    const onBlur = (): void => { if (AUTO_CLOSE_ON_BLUR.includes(useOverlay.getState().stage.name)) void api.closeOverlay(); };
    window.addEventListener('blur', onBlur);
    return () => { offs.forEach((o) => o()); window.removeEventListener('blur', onBlur); };
  }, []);

  const catKey = files.map((f) => f.category).join(",");   // deep-inspection updates must not re-place the window
  useEffect(() => { void api.resizeOverlay(sizeForStage(stage, useOverlay.getState().files)); }, [stage, catKey]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && stage.name === 'wheel') void api.closeOverlay(); }}>
      <StageView stage={stage} />
    </div>
  );
}
