// bump-sw-version.mjs
// Run before deploying: node bump-sw-version.mjs
// VoltType is a static HTML site — no build step, so run this manually before wrangler deploy.
// Cloudflare Pages sets CF_PAGES_COMMIT_SHA; locally falls back to git SHA.

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

const sha = (() => {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: root }).trim(); }
  catch { return String(Date.now()); }
})();

// Patch website/sw.js CACHE_NAME
const swPath = join(root, 'website', 'sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'volttype-[^']*'/, `const CACHE_NAME = 'volttype-${sha}'`);
writeFileSync(swPath, sw, 'utf8');
console.log(`[bump-sw-version] CACHE_NAME set to volttype-${sha}`);
