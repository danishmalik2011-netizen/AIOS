const pty = require('node-pty');
const { execSync } = require('child_process');
const nodePath = execSync('where node').toString().trim().split('\r\n')[0];
const child = pty.spawn(nodePath, ['dist-cli/aios.cjs'], {
  name: 'xterm-color', cols: 120, rows: 50, cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: '1', TERM: 'xterm' },
});
let out = '';
const KEY = { enter: '\r', down: '\x1b[B', up: '\x1b[A' };
function send(s, d = 300) { return new Promise((r) => setTimeout(() => { child.write(s); r(); }, d)); }
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
child.onData((d) => { out += d; });
(async () => {
  await send('', 600);
  await send('/provider'); await send(KEY.enter, 400); await send('', 400);
  const s1 = strip(out);
  console.log('---AFTER /provider OPEN---');
  console.log(s1.slice(-500).replace(/\n{2,}/g, '\n'));
  // select anthropic (2nd provider after openai)
  await send(KEY.down, 200); await send(KEY.down, 200); await send(KEY.enter, 400); await send('', 300);
  const s2 = strip(out);
  console.log('---AFTER PROVIDER SELECT---');
  console.log(s2.slice(-500).replace(/\n{2,}/g, '\n'));
  // type fake key
  await send('sk-ant-test-12345', 300);
  await send(KEY.enter, 600); await send('', 600);
  const s3 = strip(out);
  console.log('---AFTER KEY---');
  console.log(s3.slice(-600).replace(/\n{2,}/g, '\n'));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); console.log(strip(out).slice(-800)); child.kill(); process.exit(1); }, 12000);