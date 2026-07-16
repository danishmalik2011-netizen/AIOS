import { readFileSync, writeFileSync } from 'node:fs';

const OLD = '1.1.16';
const NEW = '1.1.17';

const files = [
  { path: 'package.json', edits: [[`"version": "${OLD}"`, `"version": "${NEW}"`]] },
  {
    path: 'landing/app.js',
    edits: [[`'AIOS_Setup_${OLD}'`, `'AIOS_Setup_${NEW}'`]],
  },
  {
    path: 'landing/index.html',
    edits: [
      [`AIOS%20Setup%20${OLD}.exe`, `AIOS%20Setup%20${NEW}.exe`],
      [`AIOS Setup ${OLD}`, `AIOS Setup ${NEW}`],
      [
        `What's new in ${OLD} — polished chat bubbles, searchable provider/model dropdowns, one-click command approval, an Auto-Access trust mode, collapsible sidebar, smart conversation titles, and high-end agent avatars.`,
        `What's new in ${NEW} — tooltips are now readable across every theme (fixed dark-on-dark text in light themes), plus polished chat bubbles, searchable provider/model dropdowns, one-click command approval, an Auto-Access trust mode, collapsible sidebar, and high-end agent avatars.`,
      ],
    ],
  },
];

for (const { path, edits } of files) {
  let content = readFileSync(path, 'utf8');
  for (const [from, to] of edits) {
    if (!content.includes(from)) {
      throw new Error(`Pattern not found in ${path}:\n${from}`);
    }
    content = content.split(from).join(to);
  }
  writeFileSync(path, content);
  console.log(`Updated ${path}`);
}
console.log(`Version bump ${OLD} -> ${NEW} complete.`);
