import type { AiosBridge } from '../../electron/preload';

declare global {
  interface Window {
    aios?: AiosBridge;
  }
}

export {};
