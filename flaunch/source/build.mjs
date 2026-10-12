import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const output = resolve(sourceDir, '..', 'flaunch-sdk.js');

await build({
  entryPoints: [resolve(sourceDir, 'flaunch-entry.mjs')],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  outfile: output,
  logLevel: 'info',
});

console.log(`Built ${output}`);
