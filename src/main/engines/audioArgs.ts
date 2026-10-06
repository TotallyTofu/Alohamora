import type { AudioBleepOptions, AudioChannelsOptions, AudioCompressOptions, AudioNormalizeOptions, AudioTrimOptions, AudioVisualizeOptions, MediaMetadataOptions } from '@shared/toolOptions';
import type { Fmt } from '@shared/types';
import { audioCodecArgs, type MediaFacts, type Quality } from './ffmpegArgs';

const t3 = (s: number): string => s.toFixed(3);
const LOSSLESS: Fmt[] = ['wav', 'flac', 'aiff'];

export function compressOutFmt(input: Fmt, choice: AudioCompressOptions['format']): Fmt {
  if (choice !== 'keep') return choice;
  return LOSSLESS.includes(input) ? 'mp3' : input;
}

export function compressAudioArgs(input: string, output: string, o: AudioCompressOptions, outFmt: Fmt): string[] {
  const k = `${o.bitrateKbps}k`;
  const codec: Partial<Record<Fmt, string[]>> = {
    mp3: ['-c:a', 'libmp3lame', '-b:a', k], m4a: ['-c:a', 'aac', '-b:a', k, '-movflags', '+faststart'],
    opus: ['-c:a', 'libopus', '-b:a', k, '-ar', '48000'], ogg: ['-c:a', 'libvorbis', '-b:a', k], wma: ['-c:a', 'wmav2', '-b:a', k]
  };
  const c = codec[outFmt];
  if (!c) throw new Error(`Cannot compress to ${outFmt}`);
  return ['-i', input, '-map', '0:a:0', '-vn', '-map_metadata', '0', ...c, ...(o.mono ? ['-ac', '1'] : []), output];
}

export function loudnormPass1(input: string, o: AudioNormalizeOptions): string[] {
  return ['-i', input, '-map', '0:a:0', '-af', `loudnorm=I=${o.target}:TP=${o.truePeak}:LRA=11:print_format=json`, '-f', 'null', '-'];
}

export interface LoudnormStats { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }

export function parseLoudnorm(stderr: string): LoudnormStats | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(stderr.slice(start, end + 1)) as LoudnormStats; } catch { return null; }
}

export function loudnormPass2(input: string, output: string, f: MediaFacts, o: AudioNormalizeOptions, s: LoudnormStats, fmt: Fmt, q: Quality): string[] {
  const af = `loudnorm=I=${o.target}:TP=${o.truePeak}:LRA=11:measured_I=${s.input_i}:measured_TP=${s.input_tp}`
    + `:measured_LRA=${s.input_lra}:measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true:print_format=summary`;
  // -ar BEFORE codec args so a codec-required rate (e.g. Opus 48 kHz) wins. loudnorm upsamples to 192 kHz otherwise.
  return ['-i', input, '-map', '0:a:0', '-vn', '-map_metadata', '0', '-af', af, '-ar', String(f.sampleRate || 48000), ...audioCodecArgs(fmt, q, f), output];
}

export function trimAudioArgs(input: string, output: string, f: MediaFacts, o: AudioTrimOptions, fmt: Fmt, q: Quality): string[] {
  const end = o.endSec > 0 ? Math.min(o.endSec, f.durationSec) : f.durationSec;
  const d = Math.max(0.05, end - o.startSec);
  const fades: string[] = [];
  if (o.fadeInSec > 0) fades.push(`afade=t=in:st=0:d=${t3(o.fadeInSec)}`);
  if (o.fadeOutSec > 0) fades.push(`afade=t=out:st=${t3(Math.max(0, d - o.fadeOutSec))}:d=${t3(o.fadeOutSec)}`);
  const a = ['-ss', t3(o.startSec), '-i', input, '-t', t3(d), '-map', '0:a:0', '-vn', '-map_metadata', '0'];
  if (fades.length) a.push('-af', fades.join(','), ...audioCodecArgs(fmt, q, f));
  else a.push('-c:a', 'copy');
  a.push(output);
  return a;
}

const CHANNEL_ARGS: Record<AudioChannelsOptions['mode'], string[]> = {
  mono: ['-ac', '1'], stereo: ['-ac', '2'],
  left: ['-af', 'pan=mono|c0=c0'], right: ['-af', 'pan=mono|c0=c1'], swap: ['-af', 'pan=stereo|c0=c1|c1=c0']
};

export function channelsArgs(input: string, output: string, f: MediaFacts, mode: AudioChannelsOptions['mode'], fmt: Fmt, q: Quality): string[] {
  // channel args AFTER codec args so they win over the codec's automatic "-ac 2"
  return ['-i', input, '-map', '0:a:0', '-vn', '-map_metadata', '0', ...audioCodecArgs(fmt, q, f), ...CHANNEL_ARGS[mode], output];
}

export function visualizeArgs(input: string, output: string, o: AudioVisualizeOptions): string[] {
  const W = Math.round(o.width / 2) * 2;
  const H = Math.round(o.height / 2) * 2;
  const color = o.color.replace('#', '0x');
  const bg = o.background.replace('#', '0x');
  if (o.kind === 'waveform-png') {
    return ['-i', input, '-filter_complex', `[0:a:0]aformat=channel_layouts=mono,showwavespic=s=${W}x${H}:colors=${color}[fg];color=c=${bg}:s=${W}x${H}[bg];[bg][fg]overlay=format=auto`, '-frames:v', '1', output];
  }
  if (o.kind === 'spectrogram-png') return ['-i', input, '-lavfi', `showspectrumpic=s=${W}x${H}:legend=1`, output];
  return ['-i', input, '-filter_complex',
    `[0:a:0]showwaves=s=${W}x${H}:mode=cline:rate=30:colors=${color},format=rgba[fg];color=c=${bg}:s=${W}x${H}:r=30[bg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output];
}

export function bleepArgs(input: string, output: string, f: MediaFacts, o: AudioBleepOptions, fmt: Fmt, q: Quality): string[] {
  const expr = o.ranges.map((r) => `between(t,${t3(r.startSec)},${t3(r.endSec)})`).join('+');
  const layout = (f.channels ?? 2) >= 2 ? 'stereo' : 'mono';
  const sr = f.sampleRate || 44100;
  const graph = o.sound === 'silence'
    ? `[0:a:0]volume=volume=0:enable='${expr}'[out]`
    : `[0:a:0]aformat=channel_layouts=${layout},volume=volume=0:enable='${expr}'[m];`
      + `sine=frequency=${o.frequency}:sample_rate=${sr},aformat=channel_layouts=${layout},volume=volume=0.35,volume=volume=0:enable='not(${expr})'[t];`
      + `[m][t]amix=inputs=2:duration=first:normalize=0[out]`;
  return ['-i', input, '-filter_complex', graph, '-map', '[out]', '-map_metadata', '0', ...audioCodecArgs(fmt, q, f), output];
}

export function audioMetadataArgs(input: string, output: string, o: MediaMetadataOptions, fmt: Fmt, hasCover: boolean, coverJpg: string | null): string[] {
  const coverOk = fmt === 'mp3' || fmt === 'm4a' || fmt === 'flac';
  const a = ['-i', input, ...(coverJpg && coverOk ? ['-i', coverJpg] : []), '-map', '0:a:0'];
  if (coverJpg && coverOk) a.push('-map', '1:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  else if (hasCover && coverOk && !o.removeCover && !o.removeAll) a.push('-map', '0:v:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  a.push('-c:a', 'copy', '-map_metadata', o.removeAll ? '-1' : '0');
  for (const [k, v] of Object.entries(o.tags)) a.push('-metadata', `${k}=${v}`);
  if (fmt === 'mp3') a.push('-id3v2_version', '3', '-write_id3v1', '1');
  if (fmt === 'm4a') a.push('-movflags', '+faststart');
  a.push(output);
  return a;
}

export function joinAudioArgs(inputs: string[], output: string, fmt: Fmt, q: Quality, f: MediaFacts): string[] {
  const ins = inputs.flatMap((p) => ['-i', p]);
  const pre = inputs.map((_, i) => `[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`).join(';');
  const cat = `${inputs.map((_, i) => `[a${i}]`).join('')}concat=n=${inputs.length}:v=0:a=1[out]`;
  return [...ins, '-filter_complex', `${pre};${cat}`, '-map', '[out]', ...audioCodecArgs(fmt, q, { ...f, sampleRate: 48000, channels: 2 }), output];
}
