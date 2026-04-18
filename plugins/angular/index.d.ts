import type { Plugin } from 'vite';

export interface UirefAngularOptions {
  enabled?: boolean | ((id: string) => boolean);
  cwd?: string;
}

export default function uirefAngularPlugin(options?: UirefAngularOptions): Plugin;
