/* Build the AIOS CLI into a single self-contained CommonJS bundle.
   Reuses the app's service layer via the `@` path alias, bundles it
   with esbuild (already present via Vite), and externalises the native
   deps (simple-git, node builtins) so the output runs on plain Node.

   Invoked directly (`npm run cli`) or from `prepare` on install so
   `npm i -g .` / `npm link` always ship a ready `dist-cli/aios.cjs`. */

const esbuild = require('esbuild');
const path = require('path');

async function run() {
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '..', 'src', 'cli', 'index.ts')],
    outfile: path.resolve(__dirname, '..', 'dist-cli', 'aios.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    alias: { '@': path.resolve(__dirname, '..', 'src') },
    external: ['simple-git', 'electron', 'node-pty', 'fsevents'],
    banner: {
      js: "#!/usr/bin/env node\n'use strict';",
    },
    logLevel: 'info',
  });
  console.log('✓ AIOS CLI built → dist-cli/aios.cjs');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
