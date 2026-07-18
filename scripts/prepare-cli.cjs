/* Resilient CLI builder for the npm `prepare` lifecycle hook.
   Builds dist-cli/aios.cjs via build-cli.cjs but never fails the
   install — if esbuild or the toolchain is unavailable, we just
   warn and let the install continue. Run `npm run cli` manually
   afterwards to force a build. */

const { spawnSync } = require('child_process');
const path = require('path');

const res = spawnSync('node', [path.join(__dirname, 'build-cli.cjs')], {
  stdio: 'inherit',
});

if (res.status !== 0) {
  console.warn('[aios] CLI build skipped — run `npm run cli` to build dist-cli/aios.cjs.');
}
