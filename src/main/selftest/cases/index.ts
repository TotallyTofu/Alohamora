import type { SelfTestCase } from '../types';
import { AV_CASES } from './av';
import { IMAGE_CASES } from './image';
import { PDF_CASES } from './pdf';
import { TEXT_CASES } from './text';
import { VIDEO_TOOL_CASES } from './tools-video';

/** Later tasks import and append their case lists here. */
export const CASES: SelfTestCase[] = [...AV_CASES, ...IMAGE_CASES, ...TEXT_CASES, ...PDF_CASES, ...VIDEO_TOOL_CASES];
