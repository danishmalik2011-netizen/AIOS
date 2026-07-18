const pty = require('node-pty');
const { execSync } = require('child_process');
const nodePath = execSync('where node').toString().trim().split('\r\n')[0];
const child = pty.spawn(nodePath, ['dist-cli/aios.cjs'], {
  name: 'xterm-color', cols: 120, rows: 50, cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: '1', TERM: 'xterm' },
});
let out = '';
const KEY = { enter: '\r', down: '\x1b[B' };
function send(s, d = 300) { return new Promise((r) => setTimeout(() => { child.write(s); r(); }, d)); }
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
child.onData((d) => { out += d; });
(async () => {
  await send('', 500);
  // 1. /provider -> select anthropic (2nd after openai)
  await send('/provider'); await send(KEY.enter, 500); await send('', 400);
  await send(KEY.down, 200); await send(KEY.down, 200);
  await send(KEY.enter, 500); await send('', 400);
  await send('sk-ant-test-12345', 200);
  await send(KEY.enter, 800); await send('', 800);
  const s1 = strip(out);
  console.log('After provider+key: ' + (s1.includes('provider →') ? 'YES' : 'NO'));
  // 2. /model -> search claude
  await send('/model'); await send(KEY.enter, 500); await send('', 400);
  await send('claude', 300);
  await send(KEY.enter, 500); await send('', 500);
  const s = strip(out);
  console.log('MODEL_SET=' + (s.includes('model → claude') ? 'YES' : 'NO'));
  console.log(s.slice(-300).replace(/\n{2,}/g, '\n'));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); console.log(strip(out).slice(-500)); child.kill(); process.exit(1); }, 20000);