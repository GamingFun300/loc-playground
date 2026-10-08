#!/usr/bin/env node
/* Экспорт:
   en.json (source) + meta.json -> export/strings.csv
   Запуск: node scripts/export.js                         */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const en = read('locales/en.json');
const meta = fs.existsSync(path.join(root, 'meta.json'))
  ? read('meta.json') : {};

const header = [
  'key',
  'source_en',
  'context',
  'max_length',
  'placeholders',
  'translation_ru',
  'translation_zh',
];
const rows = [header];

for (const key of Object.keys(en)) {
  const m = meta[key] || {};
  rows.push([
    key,
    en[key],
    m.context || '',
    m.max_length ? JSON.stringify(m.max_length) : '',
    (m.placeholders || []).join(' '),
    '',
    '',
  ]);
}

const esc = v => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const outDir = path.join(root, 'export');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'strings.csv');
fs.writeFileSync(outPath, rows.map(r => r.map(esc).join(',')).join('\n'), 'utf8');

console.log(`Экспортировано ${rows.length - 1} строк -> export/strings.csv`);