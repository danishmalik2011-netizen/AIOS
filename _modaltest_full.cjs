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
  // Open /provider
  await send('/provider'); await send(KEY.enter, 500); await send('', 300);
  await send(KEY.enter, 500); await send('', 300); // submit /provider
  // Select anthropic (move down from ollama->openai->google->deepseek->mistral->meta->xai->groq->cohere->openrouter->together->... anthropic is first)
  await send(KEY.up, 200); await send(KEY.enter, 400); await send('', 300);
  // Enter key
  await send('sk-ant-test-12345', 300);
  await send(KEY.enter, 600); await send('', 500);
  // Open /model
  await send('/model'); await send(KEY.enter, 500); await send('', 300);
  await send(KEY.enter, 500); await send('', 300);
  // Select a model (first one)
  await send(KEY.enter, 400); await send('', 400);
  const s = strip(out);
  console.log('=== FINAL ===');
  console.log(s.slice(-1200));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); console.log(strip(out).slice(-1500)); child.kill(); process.exit(1); }, 18000);