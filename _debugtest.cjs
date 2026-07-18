const pty = require('node-pty');
const { execSync } = require('child_process');
const nodePath = execSync('where node').toString().trim().split('\r\n')[0];
const child = pty.spawn(nodePath, ['dist-cli/aios.cjs'], {
  name: 'xterm-color', cols: 120, rows: 50, cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: '1', TERM: 'xterm' },
});
let out = '';
const KEY = { enter: '\r', up: '\x1b[A', down: '\x1b[B' };
function send(s, d = 500) { return new Promise((r) => setTimeout(() => { child.write(s); r(); }, d)); }
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
child.onData((d) => { out += d; });
(async () => {
  await send('', 1000);
  console.log('--- START ---');
  // 1. /provider -> select Anthropic
  await send('/provider'); await send('\r', 600); await send('', 600);
  console.log('Opened /provider modal');
  // Providers page - move to Anthropic (2nd item)
  await send('\x1b[B', 300); await send('', 200);
  console.log('Moved down to Anthropic');
  await send('\r', 600); await send('', 600);
  console.log('Selected Anthropic, waiting for key prompt');
  // Key prompt
  await send('sk-ant-test-12345', 300);
  await send('\r', 800); await send('', 800);
  console.log('Entered key');
  // 2. /model -> search for claude
  await send('/model'); await send('\r', 600); await send('', 600);
  console.log('Opened /model modal');
  // Type claude in search
  await send('claude', 400);
  console.log('Typed claude in search');
  await send('\r', 600); await send('', 600);
  console.log('Pressed enter on first result');
  const s = strip(out);
  console.log('--- FINAL OUTPUT ---');
  console.log(s.slice(-600));
  child.kill(); process.exit(0);
})();
setTimeout(() => { console.log('TIMEOUT'); console.log(strip(out).slice(-800)); child.kill(); process.exit(1); }, 20000);