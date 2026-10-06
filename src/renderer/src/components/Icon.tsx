import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine, AudioLines, AudioWaveform, Ban, BookOpen, Camera, Captions, Check, ChevronLeft, ChevronsUpDown,
  Clock, Combine, Crop, ExternalLink, EyeOff, File, FileText, FileType2, Film, FlipHorizontal2, FlipVertical2,
  FolderOpen, Frame, Gauge, GripVertical, Image, Images, LayoutGrid, Maximize2, Music, Pause, Play, Plus,
  RotateCcw, RotateCw, Scaling, ScanText, Scissors, Shrink, SlidersHorizontal, Split, StepBack, StepForward, Tag, Trash2, TriangleAlert,
  Video, VolumeX, Waves, X
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  compress: Shrink, tag: Tag, mute: VolumeX, scissors: Scissors, crop: Crop, gauge: Gauge, camera: Camera,
  film: Film, eyeOff: EyeOff, join: Combine, normalize: Waves, channels: AudioLines, waveform: AudioWaveform,
  bleep: Ban, resize: Scaling, sliders: SlidersHorizontal, frame: Frame, grid: LayoutGrid, filePdf: FileText,
  split: Split, images: Images, scanText: ScanText, fileWord: FileType2, clock: Clock,
  image: Image, video: Video, audio: Music, pdf: FileText, epub: BookOpen, text: FileText, subtitle: Captions, file: File,
  close: X, back: ChevronLeft, check: Check, alert: TriangleAlert, folder: FolderOpen, open: ExternalLink,
  drop: ArrowDownToLine, rotateLeft: RotateCcw, rotateRight: RotateCw, flipH: FlipHorizontal2, flipV: FlipVertical2,
  expand: Maximize2, plus: Plus, trash: Trash2, grip: GripVertical, play: Play, pause: Pause, chevrons: ChevronsUpDown,
  stepBack: StepBack, stepForward: StepForward
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? ICONS.file;
  return <C size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}
