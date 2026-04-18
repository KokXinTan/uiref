import type { PluginObj } from '@babel/core';

export interface UirefReactOptions {
  /** Whether to run the plugin. Default: true. Gate via your build's NODE_ENV. */
  enabled?: boolean;
  /** Base directory for project-relative file paths. Default: process.cwd(). */
  cwd?: string;
}

declare const uirefReactBabelPlugin: (babel: any, options?: UirefReactOptions) => PluginObj;
export default uirefReactBabelPlugin;
