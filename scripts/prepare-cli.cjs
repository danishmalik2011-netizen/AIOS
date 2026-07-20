/* Resilient CLI builder for the npm `prepare` lifecycle hook.
   Builds dist-cli/aios.cjs via build-cli.cjs but never fails the
   install — if esbuild or the toolchain is unavailable, we just
   warn and let the install continue. Run `npm run cli` manually
   afterwards to force a build. */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// The CLI is pre-bundled (dist-cli/aios.cjs) and shipped in the npm tarball,
// so a fresh install does NOT need to rebuild it. Only rebuild when the bundle
// is missing (e.g. working from a git checkout) and esbuild is available.
const bundle = path.resolve(__dirname, '..', 'dist-cli', 'aios.cjs');
if (fs.existsSync(bundle)) {
  console.log('[aios] CLI bundle present — skipping prepare build.');
  process.exit(0);
}

const res = spawnSync('node', [path.join(__dirname, 'build-cli.cjs')], {
  stdio: 'inherit',
});

if (res.status !== 0) {
  console.warn('[aios] CLI build skipped — run `npm run cli` to build dist-cli/aios.cjs.');
}
