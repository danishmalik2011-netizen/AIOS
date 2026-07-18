const pty = require('node-pty');
const { execSync } = require('child_process');
const nodePath = execSync('where node').toString().trim().split('\r\n')[0];
const child = pty.spawn(nodePath, ['dist-cli/aios.cjs'], {
  name: 'xterm-color', cols: 100, rows: 30, cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: '1', TERM: 'xterm' },
});
let out = '';
const KEY = { enter: '\r' };
function send(s, d = 400) { return new Promise((r) => setTimeout(() => { child.write(s); r(); }, d)); }
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
child.onData((d) => { out += d; });
(async () => {
  await send('', 600);
  // Test: /provider -> select first provider -> enter key -> /model -> select first model
  await send('/provider'); await send(KEY.enter, 300); await send('', 300);
  await send(KEY.enter, 300); await send('', 300); // select first provider
  await send('test-key-123', 200);
  await send(KEY.enter, 500); await send('', 500);
  await send('/model'); await send(KEY.enter, 300); await send('', 300);
  await send(KEY.enter, 300); await send('', 300); // select first model
  const s = strip(out);
  console.log('=== RESULT ===');
  if (s.includes('provider →') && s.includes('model →')) {
    console.log('SUCCESS: Full flow works');
  } else {
    console.log('FAILED: Missing selections');
  }
  console.log(s.slice(-400));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); child.kill(); process.exit(1); }, 10000);