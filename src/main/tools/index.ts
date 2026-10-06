import type { FileInfo, ToolId } from '@shared/types';
import type { JobContext } from '../jobs/context';

export type ToolRunFn = (files: FileInfo[], options: Record<string, unknown>, ctx: JobContext) => Promise<void>;

/** Later tasks add entries here, e.g. 'video.compress': runVideoCompress. */
export const TOOL_RUNNERS: Partial<Record<ToolId, ToolRunFn>> = {};
