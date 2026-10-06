export interface ProbeVideo {
  codec: string; width: number; height: number; displayWidth: number; displayHeight: number;
  fps: number; pixFmt: string; rotation: number;
}
export interface ProbeAudio { codec: string; sampleRate: number; channels: number; bitRate: number }
export interface ProbeResult {
  durationSec: number; formatName: string; bitRate: number;
  video: ProbeVideo | null; audio: ProbeAudio | null; hasCover: boolean; tags: Record<string, string>;
}

export function parseEncoderList(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith('------'));
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) names.push(parts[1]);
  }
  return names;
}

export function parseRate(r: string | undefined): number {
  if (!r) return 0;
  const [a, b] = r.split('/').map(Number);
  if (!b) return Number.isFinite(a) ? a : 0;
  return a / b;
}

interface RawStream {
  codec_type?: string; codec_name?: string; width?: number; height?: number;
  avg_frame_rate?: string; r_frame_rate?: string; pix_fmt?: string;
  sample_rate?: string; channels?: number; bit_rate?: string; duration?: string;
  disposition?: { attached_pic?: number }; tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}
interface RawFormat { duration?: string; format_name?: string; bit_rate?: string; tags?: Record<string, string> }

export function parseProbeJson(json: string): ProbeResult {
  const data = JSON.parse(json) as { streams?: RawStream[]; format?: RawFormat };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const hasCover = streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic === 1);
  const a = streams.find((s) => s.codec_type === 'audio');
  let video: ProbeVideo | null = null;
  if (v && v.width && v.height) {
    const rot = Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0) || 0;
    const swap = Math.abs(rot) % 180 === 90;
    const fps = parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate);
    video = {
      codec: v.codec_name ?? '', width: v.width, height: v.height,
      displayWidth: swap ? v.height : v.width, displayHeight: swap ? v.width : v.height,
      fps: fps > 0 && fps < 1000 ? fps : 0, pixFmt: v.pix_fmt ?? '', rotation: rot
    };
  }
  const audio: ProbeAudio | null = a
    ? { codec: a.codec_name ?? '', sampleRate: Number(a.sample_rate ?? 0), channels: a.channels ?? 0, bitRate: Number(a.bit_rate ?? 0) }
    : null;
  const f = data.format ?? {};
  const durations = [Number(f.duration), ...streams.map((s) => Number(s.duration))].filter((d) => Number.isFinite(d) && d > 0);
  const tags: Record<string, string> = {};
  for (const [k, val] of Object.entries(f.tags ?? {})) tags[k.toLowerCase()] = String(val);
  return { durationSec: durations[0] ?? 0, formatName: f.format_name ?? '', bitRate: Number(f.bit_rate ?? 0), video, audio, hasCover, tags };
}

/** Map FFmpeg stderr to a plain-English message (see Appendix C). */
export function friendlyFfmpegError(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes('invalid data found when processing input') || s.includes('moov atom not found')) return 'This file looks damaged, or it is not really the format its name says.';
  if (s.includes('matches no streams') || s.includes('does not contain any stream')) return 'This file has no usable audio or video for this action.';
  if (s.includes('permission denied')) return "Kabooks can't read or write this file. Close it in other apps and try again.";
  if (s.includes('no space left')) return 'The disk is full.';
  if (s.includes('unknown encoder') || s.includes('encoder not found')) return 'This FFmpeg build is missing an encoder needed for this format.';
  if (s.includes('not divisible by 2')) return 'The encoder needs an even width and height.';
  return 'FFmpeg could not process this file.';
}
