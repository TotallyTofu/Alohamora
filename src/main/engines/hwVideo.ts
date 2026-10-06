import { getCapabilities, setHardwareVideo } from '../capabilities';
import { log } from '../log';
import { runFfmpegToBuffer } from './ffmpeg';

const CANDIDATES: Record<string, string[]> = { darwin: ['h264_videotoolbox'], win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'], linux: ['h264_nvenc'] };

/** Test-encode one black frame with each candidate; store the first that works. Runs in the background after startup. */
export async function detectHardwareVideo(): Promise<void> {
  const caps = getCapabilities();
  for (const enc of CANDIDATES[process.platform] ?? []) {
    if (!caps.encoders.includes(enc)) continue;
    try {
      await runFfmpegToBuffer(['-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1', '-frames:v', '1', '-c:v', enc, '-f', 'null', '-']);
      setHardwareVideo(enc);
      log.info('Hardware video encoder OK:', enc);
      return;
    } catch {
      log.info('Hardware video encoder unavailable:', enc);
    }
  }
  setHardwareVideo(null);
}
