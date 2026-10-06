import type { FileInfo, ToolId } from '@shared/types';
import type { JobContext } from '../jobs/context';
import { runVideoCompress } from './video/compress';
import { runVideoCrop } from './video/crop';
import { runVideoJoin } from './video/join';
import { runVideoMetadata } from './video/metadata';
import { runVideoMute } from './video/mute';
import { runVideoRedact } from './video/redact';
import { runVideoSnapshot } from './video/snapshot';
import { runVideoSpeed } from './video/speed';
import { runVideoSplit } from './video/split';
import { runVideoTrim } from './video/trim';

export type ToolRunFn = (files: FileInfo[], options: Record<string, unknown>, ctx: JobContext) => Promise<void>;

/** One runner per tool. Later phases add the audio, image, PDF and subtitle tools here. */
export const TOOL_RUNNERS: Partial<Record<ToolId, ToolRunFn>> = {
  'video.compress': runVideoCompress,
  'video.metadata': runVideoMetadata,
  'video.mute': runVideoMute,
  'video.trim': runVideoTrim,
  'video.crop': runVideoCrop,
  'video.speed': runVideoSpeed,
  'video.snapshot': runVideoSnapshot,
  'video.split': runVideoSplit,
  'video.redact': runVideoRedact,
  'video.join': runVideoJoin
};
