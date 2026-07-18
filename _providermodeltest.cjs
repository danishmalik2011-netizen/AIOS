const pty = require('node-pty');
const { execSync } = require('child_process');
const nodePath = execSync('where node').toString().trim().split('\r\n')[0];
const child = pty.spawn(nodePath, ['dist-cli/aios.cjs'], {
  name: 'xterm-color', cols: 120, rows: 50, cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: '1', TERM: 'xterm' },
});
let out = '';
const KEY = { enter: '\r', down: '\x1b[B', up: '\x1b[A' };
function send(s, d = 300) { return new Promise((resolve) => setTimeout(() => { child.write(s); resolve(); }, d)); }
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
child.onData((d) => { out += d; });
(async () => {
  await send('', 800);
  // 1. Select anthropic provider
  await send('/provider'); await send(KEY.enter, 500); await send('', 300);
  await send(KEY.enter, 500); await send('', 300); // submit
  await send(KEY.up, 200); await send(KEY.enter, 400); await send('', 300); // select anthropic (adjust as needed)
  // Enter key
  await send('sk-ant-test-12345', 300);
  await send(KEY.enter, 600); await send('', 600);
  // 2. Now check models
  await send('/model'); await send(KEY.enter, 500); await send('', 300);
  await send(KEY.enter, 500); await send('', 300);
  const s = strip(out);
  console.log('AFTER MODEL SELECT:');
  console.log(s.slice(-300).replace(/\n{2,}/g, '\n'));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); console.log(strip(out).slice(-500)); child.kill(); process.exit(1); }, 15000);