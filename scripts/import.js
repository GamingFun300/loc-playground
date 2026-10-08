#!/usr/bin/env node
/* Импорт export/strings.csv -> locales/<lang>.json с валидацией.
   Запуск: node scripts/import.js ru
           node scripts/import.js zh-Hans

   Колонка перевода выбирается по lang:
     ru       -> translation_ru
     zh-Hans  -> translation_zh
                                                                   */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const lang = process.argv[2];
if (!lang) {
  console.error('Использование: node scripts/import.js <lang>');
  console.error('  lang: ru | zh-Hans');
  process.exit(1);
}

const COL_BY_LANG = { ru: 'translation_ru', 'zh-Hans': 'translation_zh' };
const colName = COL_BY_LANG[lang];
if (!colName) {
  console.error(`Неизвестный язык: ${lang}. Ожидается ru или zh-Hans.`);
  process.exit(1);
}

const csvPath = path.join(root, 'export', 'strings.csv');
if (!fs.existsSync(csvPath)) {
  console.error(`Не найден ${csvPath}. Сначала запусти export.js.`);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const header = rows.shift();
const col = Object.fromEntries(header.map((h, i) => [h, i]));
if (col[colName] === undefined) {
  console.error(`В CSV нет колонки ${colName}. Перегенерируй export.js.`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const out = {};

for (const row of rows) {
  const key = (row[col.key] || '').trim();
  if (!key) continue;

  const source = row[col.source_en] || '';
  const translation = (row[col[colName]] || '').trim();

  if (!translation) {
    warnings.push(`Нет перевода: ${key}`);
    out[key] = `[TODO: ${key}]`;
    continue;
  }

  const srcPh = placeholders(source);
  const trPh = placeholders(translation);

  for (const p of srcPh) if (!trPh.includes(p))
    errors.push(`Потерян плейсхолдер {${p}} в ключе: ${key}`);
  for (const p of trPh) if (!srcPh.includes(p))
    errors.push(`Лишний плейсхолдер {${p}} в ключе: ${key}`);

  out[key] = translation;
}

if (errors.length) {
  console.error('ОШИБКИ:');
  for (const e of errors) console.error('  ' + e);
  console.error('Файл локали не перезаписан. Правь CSV и запусти снова.');
  process.exit(2);
}

if (warnings.length) {
  console.warn('ПРЕДУПРЕЖДЕНИЯ:');
  for (const w of warnings) console.warn('  ' + w);
}

const outPath = path.join(root, `locales/${lang}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Импортировано ${Object.keys(out).length} строк -> locales/${lang}.json`);

function placeholders(s) {
  return [...new Set((s.match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1)))];
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',')  { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* skip */ }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}