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
  await send('', 600);
  // 1. /provider -> select anthropic
  await send('/provider'); await send(KEY.enter, 400); await send('', 300);
  // anthropic is 2nd item after openai
  await send(KEY.down, 200); await send(KEY.down, 200);
  await send(KEY.enter, 400); await send('', 300);
  await send('sk-ant-test-12345', 300);
  await send(KEY.enter, 600); await send('', 600);
  // 2. /model -> search for claude -> select
  await send('/model'); await send(KEY.enter, 400); await send('', 400);
  await send('claude', 300);
  await send(KEY.enter, 400); await send('', 400);
  const s = strip(out);
  const providerSet = s.includes('provider → Anthropic') || s.includes('provider → anthropic');
  const modelSet = s.includes('model → claude') || s.includes('model → claude-');
  console.log('PROVIDER_SET=' + providerSet);
  console.log('MODEL_SET=' + modelSet);
  console.log('---TAIL---');
  console.log(s.slice(-500).replace(/\n{2,}/g, '\n'));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); console.log(strip(out).slice(-700)); child.kill(); process.exit(1); }, 15000);