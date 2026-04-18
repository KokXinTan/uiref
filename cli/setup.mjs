#!/usr/bin/env node
/**
 * uiref-setup — one-command installer.
 *
 * Run in your project root:
 *   npx @uiref/setup
 *
 * What it does:
 *   1. Detects your framework from package.json (Svelte, React, Vue, Angular).
 *   2. Installs the matching @uiref build plugin via your package manager.
 *   3. Patches your build config to use the plugin.
 *   4. Copies the Claude skill to ~/.claude/skills/uiref/.
 *   5. Creates ~/uiref-inbox/.
 *   6. Prints next steps for the Chrome extension.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
};

const log = (msg) => console.log(msg);
const step = (msg) => console.log(`${C.blue}→${C.reset} ${msg}`);
const ok = (msg) => console.log(`${C.green}✓${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}!${C.reset} ${msg}`);
const err = (msg) => console.log(`${C.red}✗${C.reset} ${msg}`);

log(`${C.bold}${C.purple}uiref-setup${C.reset} — one-command installer\n`);

// ---------------------------------------------------------------------------
// 1. Detect project
// ---------------------------------------------------------------------------
const cwd = process.cwd();
const pkgPath = join(cwd, 'package.json');
if (!existsSync(pkgPath)) {
  err('No package.json found. Run this in your project root.');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

function has(name) { return name in deps; }

let framework = null;
if (has('svelte') || has('@sveltejs/kit')) framework = 'svelte';
else if (has('react') || has('next')) framework = 'react';
else if (has('vue') || has('@vue/core') || has('nuxt')) framework = 'vue';
else if (has('@angular/core')) framework = 'angular';

if (!framework) {
  err('Could not detect framework. Supported: Svelte, React (inc. Next.js), Vue, Angular.');
  process.exit(1);
}

step(`Detected framework: ${C.bold}${framework}${C.reset}`);

// Detect package manager
let pm = 'npm';
if (existsSync(join(cwd, 'pnpm-lock.yaml'))) pm = 'pnpm';
else if (existsSync(join(cwd, 'yarn.lock'))) pm = 'yarn';
else if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) pm = 'bun';
step(`Package manager: ${C.bold}${pm}${C.reset}`);

// ---------------------------------------------------------------------------
// 2. Install plugin
// ---------------------------------------------------------------------------
const pluginName = {
  svelte: '@uiref/svelte',
  react: '@uiref/babel-plugin-react',
  vue: '@uiref/vue',
  angular: '@uiref/angular',
}[framework];

// Prefer local (monorepo) install if running against this repo
const localPluginPath = resolve(REPO_ROOT, 'plugins', framework === 'react' ? 'react' : framework);
const useLocal = existsSync(localPluginPath) && existsSync(join(localPluginPath, 'package.json'));

const installSpec = useLocal ? `file:${localPluginPath}` : pluginName;
step(`Installing ${C.bold}${pluginName}${C.reset}${useLocal ? C.dim + ' (from local repo)' + C.reset : ''}`);

const installCmds = {
  npm: ['npm', ['install', '--save-dev', installSpec]],
  pnpm: ['pnpm', ['add', '-D', installSpec]],
  yarn: ['yarn', ['add', '-D', installSpec]],
  bun: ['bun', ['add', '-D', installSpec]],
};
const [cmd, args] = installCmds[pm];
const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
if (result.status !== 0) {
  err(`Install failed (${cmd} ${args.join(' ')}).`);
  process.exit(1);
}
ok('Plugin installed');

// ---------------------------------------------------------------------------
// 3. Patch config
// ---------------------------------------------------------------------------
function patchFile(path, transform, desc) {
  if (!existsSync(path)) return false;
  const original = readFileSync(path, 'utf8');
  const patched = transform(original);
  if (!patched || patched === original) return false;
  writeFileSync(path, patched, 'utf8');
  ok(`Patched ${C.bold}${path.replace(cwd + '/', '')}${C.reset} (${desc})`);
  return true;
}

if (framework === 'svelte') {
  const sveltePath = join(cwd, 'svelte.config.js');
  const patched = patchFile(sveltePath, (src) => {
    if (src.includes('@uiref/svelte')) return null; // already patched
    // Add import
    let out = src;
    const importRE = /import\s+.*from\s+['"]@sveltejs\/vite-plugin-svelte['"];?/;
    if (importRE.test(out)) {
      out = out.replace(importRE, (m) => `${m}\nimport uiref from '@uiref/svelte';`);
    } else {
      out = `import uiref from '@uiref/svelte';\n${out}`;
    }
    // Update preprocess
    if (/preprocess\s*:\s*\[/.test(out)) {
      out = out.replace(/preprocess\s*:\s*\[/, 'preprocess: [uiref(), ');
    } else if (/preprocess\s*:\s*vitePreprocess\s*\(\s*\)/.test(out)) {
      out = out.replace(/preprocess\s*:\s*vitePreprocess\s*\(\s*\)/, 'preprocess: [uiref(), vitePreprocess()]');
    } else if (/preprocess\s*:\s*[A-Za-z_]+\s*\(\s*\)/.test(out)) {
      out = out.replace(/preprocess\s*:\s*([A-Za-z_]+\s*\(\s*\))/, 'preprocess: [uiref(), $1]');
    } else {
      warn('Could not auto-patch svelte.config.js preprocess. Add uiref() manually.');
      return null;
    }
    return out;
  }, 'added uiref to preprocess array');
  if (!patched) {
    warn('svelte.config.js not updated. If you already have it set up, no action needed. Otherwise add:');
    console.log(`    import uiref from '@uiref/svelte';`);
    console.log(`    // in your config: preprocess: [uiref(), vitePreprocess()]`);
  }
} else if (framework === 'react') {
  const viteCfg = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].map(f => join(cwd, f)).find(existsSync);
  if (viteCfg) {
    patchFile(viteCfg, (src) => {
      if (src.includes('@uiref/babel-plugin-react')) return null;
      if (/react\s*\(\s*\{/.test(src)) {
        // has existing react({...}) options — inject babel.plugins
        return src.replace(
          /react\s*\(\s*\{/,
          `react({ babel: { plugins: ['@uiref/babel-plugin-react'] }, `
        );
      } else if (/react\s*\(\s*\)/.test(src)) {
        return src.replace(
          /react\s*\(\s*\)/,
          `react({ babel: { plugins: ['@uiref/babel-plugin-react'] } })`
        );
      }
      return null;
    }, 'added @uiref/babel-plugin-react to react() babel config');
  } else {
    warn('No vite.config.[jt]s found. For Next.js / CRA see plugins/react/README.md for manual config.');
  }
} else if (framework === 'vue') {
  const viteCfg = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].map(f => join(cwd, f)).find(existsSync);
  if (viteCfg) {
    patchFile(viteCfg, (src) => {
      if (src.includes('@uiref/vue')) return null;
      let out = src;
      const vueImportRE = /import\s+vue\s+from\s+['"]@vitejs\/plugin-vue['"];?/;
      if (vueImportRE.test(out)) {
        out = out.replace(vueImportRE, (m) => `${m}\nimport uirefVue from '@uiref/vue';`);
      } else {
        out = `import uirefVue from '@uiref/vue';\n${out}`;
      }
      if (/plugins\s*:\s*\[\s*vue\s*\(\s*\)/.test(out)) {
        out = out.replace(/plugins\s*:\s*\[\s*vue\s*\(\s*\)/, 'plugins: [uirefVue(), vue()');
      } else {
        warn('Could not auto-patch vite.config plugins. Add uirefVue() before vue() manually.');
        return null;
      }
      return out;
    }, 'added uirefVue() before vue() in plugins array');
  }
} else if (framework === 'angular') {
  warn('Angular has many project shapes. Please integrate @uiref/angular manually — see plugins/angular/README.md.');
}

// ---------------------------------------------------------------------------
// 4. Copy Claude skill
// ---------------------------------------------------------------------------
// Look for SKILL.md in these places, in order:
//   1. ./SKILL.md (bundled next to this script — the published npm package)
//   2. ../skill/SKILL.md (repo layout when run from a local checkout)
const skillCandidates = [
  join(__dirname, 'SKILL.md'),
  join(REPO_ROOT, 'skill', 'SKILL.md'),
];
const skillSrc = skillCandidates.find(existsSync);
const skillDestDir = join(homedir(), '.claude', 'skills', 'uiref');
const skillDest = join(skillDestDir, 'SKILL.md');
if (skillSrc) {
  mkdirSync(skillDestDir, { recursive: true });
  copyFileSync(skillSrc, skillDest);
  ok(`Claude skill installed at ${C.dim}${skillDest}${C.reset}`);
} else {
  warn('Could not find SKILL.md. Download it from https://github.com/KokXinTan/uiref/blob/main/skill/SKILL.md');
  warn(`and copy to ${skillDest}`);
}

// ---------------------------------------------------------------------------
// 5. Create inbox
// ---------------------------------------------------------------------------
const inbox = join(homedir(), 'uiref-inbox');
mkdirSync(inbox, { recursive: true });
ok(`Inbox folder ready: ${C.dim}${inbox}${C.reset}`);

// ---------------------------------------------------------------------------
// 6. Optional dev-mode config hint
// ---------------------------------------------------------------------------
log('');
log(`${C.bold}Optional — for richest capture on your local dev:${C.reset}`);
log('');
log(`Add this snippet to your app's bootstrap (before your app mounts):`);
log('');

const entryHint = {
  svelte: `${C.dim}  // In src/routes/+layout.svelte's <script> or src/app.html${C.reset}`,
  react:  `${C.dim}  // In src/main.tsx, app/layout.tsx, or _app.tsx${C.reset}`,
  vue:    `${C.dim}  // In src/main.ts (before app.mount())${C.reset}`,
  angular:`${C.dim}  // In src/main.ts (before bootstrapApplication())${C.reset}`,
}[framework];
log(entryHint);
log('');
log(`  ${C.dim}if (import.meta.env.DEV) {${C.reset}`);
log(`  ${C.dim}  window.__uirefConfig = {${C.reset}`);
log(`  ${C.dim}    eagerPatch: true,              ${C.reset}${C.dim}// buffer events from page load${C.reset}`);
log(`  ${C.dim}    captureGraphQLOperation: true, ${C.reset}${C.dim}// extract GraphQL opName${C.reset}`);
log(`  ${C.dim}  };${C.reset}`);
log(`  ${C.dim}}${C.reset}`);
log('');
log(`${C.dim}Without this, events (console/errors/network) are only captured after`);
log(`you first activate the picker on a tab. The snippet is dev-gated so it`);
log(`has zero production impact.${C.reset}`);

// ---------------------------------------------------------------------------
// 7. Next steps
// ---------------------------------------------------------------------------
log('');
log(`${C.bold}${C.green}uiref installed.${C.reset} One more step — the Chrome extension:`);
log('');
log('  1. Open chrome://extensions/');
log('  2. Enable Developer mode (top-right)');
log(`  3. Load unpacked → select ${C.bold}${join(REPO_ROOT, 'extension')}${C.reset}`);
log('');
log(`Then restart your dev server, open the page in Chrome, click the ${C.purple}uiref${C.reset} icon`);
log(`and pick an element. Say "fix this" in Claude Code — it'll know exactly which component.`);
log('');
log(`${C.dim}More: https://github.com/KokXinTan/uiref${C.reset}`);
