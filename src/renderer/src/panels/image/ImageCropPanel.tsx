import { CropPanel } from '../common/CropPanel';
import type { ToolPanelProps } from '..';

export function ImageCropPanel(p: ToolPanelProps) {
  return <CropPanel {...p} kind="image" title="Crop Image" height={720} />;
}
