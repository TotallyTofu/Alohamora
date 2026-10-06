import type { FileInfo, ToolId } from '@shared/types';
import type { JobContext } from '../jobs/context';
import { runAudioBleep } from './audio/bleep';
import { runAudioChannels } from './audio/channels';
import { runAudioCompress } from './audio/compress';
import { runAudioJoin } from './audio/join';
import { runAudioMetadata } from './audio/metadata';
import { runAudioNormalize } from './audio/normalize';
import { runAudioTrim } from './audio/trim';
import { runAudioVisualize } from './audio/visualize';
import { runImageBackground } from './image/background';
import { runImageCollage } from './image/collage';
import { runImageCompress } from './image/compress';
import { runImageCrop } from './image/crop';
import { runImageEdit } from './image/edit';
import { runImageMetadata } from './image/metadata';
import { runImagePdf } from './image/pdf';
import { runImageRedact } from './image/redact';
import { runImageResize } from './image/resize';
import { runPdfCompress } from './pdf/compress';
import { runPdfImages } from './pdf/images';
import { runPdfMerge } from './pdf/merge';
import { runPdfMetadata } from './pdf/metadata';
import { runPdfOcr } from './pdf/ocr';
import { runPdfOrganize } from './pdf/organize';
import { runPdfSplit } from './pdf/split';
import { runPdfWord } from './pdf/word';
import { runSubtitleShift } from './subtitle/shift';
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
  'video.join': runVideoJoin,
  'audio.bleep': runAudioBleep,
  'audio.channels': runAudioChannels,
  'audio.compress': runAudioCompress,
  'audio.join': runAudioJoin,
  'audio.metadata': runAudioMetadata,
  'audio.normalize': runAudioNormalize,
  'audio.trim': runAudioTrim,
  'audio.visualize': runAudioVisualize,
  'image.background': runImageBackground,
  'image.collage': runImageCollage,
  'image.compress': runImageCompress,
  'image.crop': runImageCrop,
  'image.edit': runImageEdit,
  'image.metadata': runImageMetadata,
  'image.pdf': runImagePdf,
  'image.redact': runImageRedact,
  'image.resize': runImageResize,
  'pdf.compress': runPdfCompress,
  'pdf.images': runPdfImages,
  'pdf.merge': runPdfMerge,
  'pdf.metadata': runPdfMetadata,
  'pdf.ocr': runPdfOcr,
  'pdf.organize': runPdfOrganize,
  'pdf.split': runPdfSplit,
  'pdf.word': runPdfWord,
  'subtitle.shift': runSubtitleShift
};
