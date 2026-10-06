import type { Fmt } from '@shared/types';
import type { ProbeResult } from './ffmpegParse';

export interface MediaFacts {
  durationSec: number;
  container: string;
  hasVideo: boolean;
  hasAudio: boolean;
  hasCover: boolean;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;       // display size (after rotation)
  height?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
}

export interface Quality { crf: number; audioKbps: number }

export function toFacts(p: ProbeResult): MediaFacts {
  return {
    durationSec: p.durationSec, container: p.formatName, hasVideo: !!p.video, hasAudio: !!p.audio, hasCover: p.hasCover,
    videoCodec: p.video?.codec, audioCodec: p.audio?.codec, width: p.video?.displayWidth, height: p.video?.displayHeight,
    fps: p.video?.fps, sampleRate: p.audio?.sampleRate, channels: p.audio?.channels
  };
}

/** Codecs each container can hold as-is (names as ffprobe reports them). */
const COPY_OK: Partial<Record<Fmt, { video: string[]; audio: string[] }>> = {
  mp4: { video: ['h264', 'hevc', 'av1', 'mpeg4'], audio: ['aac', 'mp3', 'alac', 'opus', 'ac3'] },
  mov: { video: ['h264', 'hevc', 'mpeg4', 'prores', 'mjpeg'], audio: ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le'] },
  mkv: { video: ['h264', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg4', 'mpeg2video', 'theora'], audio: ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3', 'eac3', 'dts', 'alac', 'pcm_s16le'] },
  webm: { video: ['vp8', 'vp9', 'av1'], audio: ['opus', 'vorbis'] },
  avi: { video: ['mpeg4', 'mjpeg', 'msmpeg4v3'], audio: ['mp3', 'ac3', 'pcm_s16le'] },
  wmv: { video: ['wmv1', 'wmv2', 'wmv3', 'vc1'], audio: ['wmav1', 'wmav2', 'wmapro'] }
};

/** True when streams can be copied into `target` without re-encoding (instant & lossless). */
export function canRemux(f: MediaFacts, target: Fmt): boolean {
  const rule = COPY_OK[target];
  if (!rule || !f.hasVideo) return false;
  if (!f.videoCodec || !rule.video.includes(f.videoCodec)) return false;
  if (f.hasAudio && (!f.audioCodec || !rule.audio.includes(f.audioCodec))) return false;
  return true;
}

export const EVEN_SCALE = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

export interface GifOptions { width: number; fps: number }

/** The -vf value: extra filters + even-size guard, or the GIF palette chain. */
export function videoFilter(target: Fmt, filters: string[], gif: GifOptions = { width: 480, fps: 12 }): string {
  if (target === 'gif') {
    const scale = gif.width > 0 ? `scale='min(${gif.width},iw)':-1:flags=lanczos` : 'scale=iw:ih';
    return [...filters, `fps=${gif.fps}`, scale,
      'split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'].join(',');
  }
  return [...filters, EVEN_SCALE].join(',');
}

export function wmvBitrate(f: MediaFacts): string {
  const px = (f.width ?? 1280) * (f.height ?? 720);
  if (px <= 640 * 480) return '1500k';
  if (px <= 1280 * 720) return '3000k';
  if (px <= 1920 * 1080) return '6000k';
  return '12000k';
}

function videoAudioCodec(target: Fmt, q: Quality): string[] {
  if (target === 'webm') return ['-c:a', 'libopus', '-b:a', `${Math.min(q.audioKbps, 160)}k`];
  if (target === 'avi') return ['-c:a', 'libmp3lame', '-q:a', '3'];
  if (target === 'wmv') return ['-c:a', 'wmav2', '-b:a', '192k'];
  return ['-c:a', 'aac', '-b:a', `${q.audioKbps}k`];
}

/** Codec flags to encode INTO `target`. No -i, -vf, -map or output path. */
export function videoEncodeArgs(target: Fmt, q: Quality, f: MediaFacts, audio: 'encode' | 'copy' | 'none' = 'encode'): string[] {
  const a: string[] = [];
  switch (target) {
    case 'mp4': case 'mov': case 'mkv':
      a.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(q.crf), '-pix_fmt', 'yuv420p');
      break;
    case 'webm':
      a.push('-c:v', 'libvpx-vp9', '-crf', String(Math.min(63, q.crf + 9)), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p');
      break;
    case 'avi':
      a.push('-c:v', 'mpeg4', '-q:v', '4', '-vtag', 'xvid');
      break;
    case 'wmv':
      a.push('-c:v', 'wmv2', '-b:v', wmvBitrate(f));
      break;
    case 'gif':
      break;
    default:
      throw new Error(`No video encoder for ${target}`);
  }
  if (target === 'gif' || audio === 'none' || !f.hasAudio) a.push('-an');
  else if (audio === 'copy') a.push('-c:a', 'copy');
  else a.push(...videoAudioCodec(target, q));
  if (target === 'mp4' || target === 'mov') a.push('-movflags', '+faststart');
  return a;
}

/** Codec flags for an audio-only output. */
export function audioCodecArgs(target: Fmt, q: Quality, f: MediaFacts): string[] {
  const a: string[] = [];
  switch (target) {
    case 'mp3': a.push('-c:a', 'libmp3lame', '-q:a', '2'); break;
    case 'm4a': a.push('-c:a', 'aac', '-b:a', `${q.audioKbps}k`); break;
    case 'wav': a.push('-c:a', 'pcm_s16le'); break;
    case 'flac': a.push('-c:a', 'flac', '-compression_level', '5'); break;
    case 'ogg': a.push('-c:a', 'libvorbis', '-q:a', '5'); break;
    case 'opus': a.push('-c:a', 'libopus', '-b:a', `${Math.min(q.audioKbps, 160)}k`, '-ar', '48000'); break;
    case 'aiff': a.push('-c:a', 'pcm_s16be'); break;
    case 'wma': a.push('-c:a', 'wmav2', '-b:a', `${Math.min(q.audioKbps, 192)}k`); break;
    default: throw new Error(`No audio encoder for ${target}`);
  }
  const sr = f.sampleRate ?? 0;
  if ((target === 'mp3' || target === 'wma' || target === 'm4a') && sr > 48000) a.push('-ar', '48000');
  if ((target === 'mp3' || target === 'wma') && (f.channels ?? 2) > 2) a.push('-ac', '2');
  if (target === 'mp3') a.push('-id3v2_version', '3');
  if (target === 'm4a') a.push('-movflags', '+faststart');
  return a;
}

export function audioConvertArgs(input: string, output: string, f: MediaFacts, target: Fmt, q: Quality, keepCover: boolean): string[] {
  const cover = keepCover && f.hasCover && (target === 'mp3' || target === 'm4a' || target === 'flac');
  return [
    '-i', input, '-map', '0:a:0',
    ...(cover ? ['-map', '0:v:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic'] : ['-vn']),
    '-map_metadata', '0',
    ...audioCodecArgs(target, q, f),
    output
  ];
}

export function videoConvertArgs(input: string, output: string, f: MediaFacts, target: Fmt, q: Quality, gif?: GifOptions): string[] {
  if (target === 'mp3') return audioConvertArgs(input, output, f, 'mp3', q, false);
  if (canRemux(f, target)) {
    const a = ['-i', input, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy'];
    if (target === 'mp4' || target === 'mov') {
      a.push('-movflags', '+faststart');
      if (f.videoCodec === 'hevc') a.push('-tag:v', 'hvc1');
    }
    return [...a, output];
  }
  const maps = target === 'gif' ? ['-map', '0:v:0'] : ['-map', '0:v:0', '-map', '0:a:0?'];
  return ['-i', input, ...maps, '-vf', videoFilter(target, [], gif), ...videoEncodeArgs(target, q, f), output];
}
