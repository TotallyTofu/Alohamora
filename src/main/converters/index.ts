import type { ConvertOptions } from '@shared/toolOptions';
import type { Category, FileInfo, Fmt } from '@shared/types';
import type { JobContext } from '../jobs/context';

export type ConvertFn = (file: FileInfo, target: Fmt, opts: ConvertOptions, ctx: JobContext) => Promise<void>;

/** One converter per input category. Later tasks add entries here. */
export const CONVERTERS: Partial<Record<Category, ConvertFn>> = {};
