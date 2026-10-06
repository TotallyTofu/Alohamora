export const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
export { formatBytes, formatDuration, formatTimecode } from '@shared/time';
