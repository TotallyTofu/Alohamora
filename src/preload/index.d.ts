import type { AlohamoraApi } from '../shared/ipc';

declare global {
  interface Window { alohamora: AlohamoraApi }
}
export {};
