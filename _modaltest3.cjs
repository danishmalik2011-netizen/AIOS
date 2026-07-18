const pty = require('node-pty');
const { execSync } = require('child_process');
const nodePath = execSync('where node').toString().trim().split('\r\n')[0];
const child = pty.spawn(nodePath, ['dist-cli/aios.cjs'], {
  name: 'xterm-color', cols: 120, rows: 50, cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: '1', TERM: 'xterm' },
});
let out = '';
const KEY = { enter: '\r', up: '\x1b[A', down: '\x1b[B' };
function send(s, d = 300) { return new Promise((r) => setTimeout(() => { child.write(s); r(); }, d)); }
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
child.onData((d) => { out += d; });
(async () => {
  await send('', 800);
  await send('/provider'); await send(KEY.enter, 500); await send('', 500);
  // Move to anthropic (should be near top)
  await send(KEY.down, 200); await send(KEY.down, 200); await send(KEY.down, 200); await send(KEY.down, 200);
  await send(KEY.enter, 500); await send('', 400);
  // Type fake key
  await send('sk-ant-test-12345', 300);
  await send(KEY.enter, 600); await send('', 600);
  const s = strip(out);
  console.log('=== FINAL OUTPUT ===');
  console.log(s.slice(-1000));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); console.log(strip(out).slice(-1000)); child.kill(); process.exit(1); }, 12000);