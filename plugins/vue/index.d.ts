import type { Plugin } from 'vite';

export interface UirefVueOptions {
  enabled?: boolean | ((id: string) => boolean);
  cwd?: string;
}

export default function uirefVuePlugin(options?: UirefVueOptions): Plugin;
