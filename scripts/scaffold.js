#!/usr/bin/env node
/* Создаёт locales/<lang>.json с [TODO: <key>] на основе en.json.
   Запуск: node scripts/scaffold.js zh-Hans                            */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const lang = process.argv[2];
if (!lang) {
  console.error('Использование: node scripts/scaffold.js <lang>');
  process.exit(1);
}

const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8'));
const out = {};
for (const key of Object.keys(en)) out[key] = `[TODO: ${key}]`;

const p = path.join(root, `locales/${lang}.json`);
fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Создан ${p} (${Object.keys(out).length} ключей)`);