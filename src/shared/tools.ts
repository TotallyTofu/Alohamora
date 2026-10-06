import type { Category, ToolId } from './types';

export interface ToolMeta {
  id: ToolId;
  category: Category;
  label: string;          // wheel label
  icon: string;           // key in renderer Icon map
  description: string;
  minInputs: number;
  maxInputs: number;
  perFile: boolean;       // true = run once per input file
  suffix: string;         // output name suffix ("" = none)
  instant?: boolean;      // true = no options card, start immediately
  extra?: boolean;        // ☆ optional/suggested tool
}

const M = (t: ToolMeta): ToolMeta => t;

/** Order inside each category = wheel order (clockwise from 12 o'clock). */
export const TOOLS: ToolMeta[] = [
  // ---- video (order matches clean UI.png) ----
  M({ id: 'video.compress', category: 'video', label: 'Compress', icon: 'compress', description: 'Smaller file, good quality', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'compressed' }),
  M({ id: 'video.metadata', category: 'video', label: 'Metadata', icon: 'tag', description: 'View, edit or remove tags', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'meta' }),
  M({ id: 'video.mute', category: 'video', label: 'Mute', icon: 'mute', description: 'Remove the audio track', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'muted', instant: true }),
  M({ id: 'video.trim', category: 'video', label: 'Trim', icon: 'scissors', description: 'Keep one part', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'trimmed' }),
  M({ id: 'video.crop', category: 'video', label: 'Crop', icon: 'crop', description: 'Crop the frame', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'cropped' }),
  M({ id: 'video.speed', category: 'video', label: 'Speed', icon: 'gauge', description: 'Faster or slower', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'speed' }),
  M({ id: 'video.snapshot', category: 'video', label: 'Snapshot', icon: 'camera', description: 'Save a frame', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'frame' }),
  M({ id: 'video.split', category: 'video', label: 'Split', icon: 'film', description: 'Cut into parts', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'part' }),
  M({ id: 'video.redact', category: 'video', label: 'Redact', icon: 'eyeOff', description: 'Blur or hide areas', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'redacted' }),
  M({ id: 'video.join', category: 'video', label: 'Join', icon: 'join', description: 'Combine clips', minInputs: 2, maxInputs: 50, perFile: false, suffix: 'joined' }),
  // ---- audio ----
  M({ id: 'audio.compress', category: 'audio', label: 'Compress', icon: 'compress', description: 'Lower bitrate', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'compressed' }),
  M({ id: 'audio.normalize', category: 'audio', label: 'Normalize', icon: 'normalize', description: 'Even loudness', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'normalized' }),
  M({ id: 'audio.trim', category: 'audio', label: 'Trim', icon: 'scissors', description: 'Keep one part', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'trimmed' }),
  M({ id: 'audio.channels', category: 'audio', label: 'Channels', icon: 'channels', description: 'Mono, stereo, swap', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'channels' }),
  M({ id: 'audio.visualize', category: 'audio', label: 'Visualize', icon: 'waveform', description: 'Waveform or spectrogram', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'waveform' }),
  M({ id: 'audio.bleep', category: 'audio', label: 'Bleep', icon: 'bleep', description: 'Censor parts', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'bleeped' }),
  M({ id: 'audio.metadata', category: 'audio', label: 'Metadata', icon: 'tag', description: 'Tags and cover art', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'meta' }),
  M({ id: 'audio.join', category: 'audio', label: 'Join', icon: 'join', description: 'Combine files', minInputs: 2, maxInputs: 50, perFile: false, suffix: 'joined', extra: true }),
  // ---- image ----
  M({ id: 'image.compress', category: 'image', label: 'Compress', icon: 'compress', description: 'Smaller file', minInputs: 1, maxInputs: 200, perFile: true, suffix: 'compressed' }),
  M({ id: 'image.resize', category: 'image', label: 'Resize', icon: 'resize', description: 'Change dimensions', minInputs: 1, maxInputs: 200, perFile: true, suffix: 'resized', extra: true }),
  M({ id: 'image.crop', category: 'image', label: 'Crop', icon: 'crop', description: 'Crop, rotate, flip', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'cropped' }),
  M({ id: 'image.edit', category: 'image', label: 'Edit', icon: 'sliders', description: 'Exposure, color, effects', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'edited' }),
  M({ id: 'image.background', category: 'image', label: 'Backdrop', icon: 'frame', description: 'Add a background', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'backdrop' }),
  M({ id: 'image.redact', category: 'image', label: 'Redact', icon: 'eyeOff', description: 'Hide parts', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'redacted' }),
  M({ id: 'image.metadata', category: 'image', label: 'Metadata', icon: 'tag', description: 'EXIF, GPS', minInputs: 1, maxInputs: 200, perFile: true, suffix: 'clean' }),
  M({ id: 'image.collage', category: 'image', label: 'Collage', icon: 'grid', description: 'Combine images', minInputs: 2, maxInputs: 30, perFile: false, suffix: 'collage' }),
  M({ id: 'image.pdf', category: 'image', label: 'Make PDF', icon: 'filePdf', description: 'Images to one PDF', minInputs: 1, maxInputs: 500, perFile: false, suffix: '' }),
  // ---- pdf ----
  M({ id: 'pdf.compress', category: 'pdf', label: 'Compress', icon: 'compress', description: 'Smaller PDF', minInputs: 1, maxInputs: 50, perFile: true, suffix: 'compressed' }),
  M({ id: 'pdf.merge', category: 'pdf', label: 'Merge', icon: 'join', description: 'Combine PDFs', minInputs: 2, maxInputs: 100, perFile: false, suffix: 'merged' }),
  M({ id: 'pdf.split', category: 'pdf', label: 'Split', icon: 'split', description: 'Split pages', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'part' }),
  M({ id: 'pdf.organize', category: 'pdf', label: 'Organize', icon: 'grid', description: 'Reorder, rotate, delete', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'organized' }),
  M({ id: 'pdf.images', category: 'pdf', label: 'Images', icon: 'images', description: 'Pages as images', minInputs: 1, maxInputs: 20, perFile: true, suffix: 'pages' }),
  M({ id: 'pdf.ocr', category: 'pdf', label: 'OCR', icon: 'scanText', description: 'Extract text', minInputs: 1, maxInputs: 20, perFile: true, suffix: 'ocr' }),
  M({ id: 'pdf.word', category: 'pdf', label: 'Word', icon: 'fileWord', description: 'Export to DOCX', minInputs: 1, maxInputs: 20, perFile: true, suffix: '' }),
  M({ id: 'pdf.metadata', category: 'pdf', label: 'Metadata', icon: 'tag', description: 'Title, author…', minInputs: 1, maxInputs: 1, perFile: true, suffix: 'meta' }),
  // ---- subtitles ----
  M({ id: 'subtitle.shift', category: 'subtitle', label: 'Shift', icon: 'clock', description: 'Fix timing', minInputs: 1, maxInputs: 20, perFile: true, suffix: 'shifted', extra: true })
];

export function toolMeta(id: ToolId): ToolMeta {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tool ${id}`);
  return t;
}

export function toolsFor(category: Category, count: number): ToolMeta[] {
  return TOOLS.filter((t) => t.category === category && count >= t.minInputs && count <= t.maxInputs);
}
