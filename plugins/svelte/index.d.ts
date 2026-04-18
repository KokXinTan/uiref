import type { PreprocessorGroup } from 'svelte/compiler';

export interface UirefSvelteOptions {
  /**
   * Whether to enable the preprocessor. Can be a boolean or a function that receives
   * the filename being processed. Defaults to true when NODE_ENV !== 'production'.
   */
  enabled?: boolean | ((filename?: string) => boolean);

  /**
   * Base directory used to compute project-relative file paths for the data-uiref-file
   * attribute. Defaults to process.cwd().
   */
  cwd?: string;
}

export default function uirefPreprocess(options?: UirefSvelteOptions): PreprocessorGroup;
