import type { KabooksApi } from '../shared/ipc';

declare global {
  interface Window { kabooks: KabooksApi }
}
export {};
