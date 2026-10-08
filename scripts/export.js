#!/usr/bin/env node
/* Экспорт:
   en.json (source) + meta.json -> export/strings.csv
   Plural-категории генерируются для каждой целевой локали.
   Запуск: node scripts/export.js                               */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const en = read('locales/en.json');
const meta = fs.existsSync(path.join(root, 'meta.json')) ? read('meta.json') : {};

/* Целевые локали. Если добавишь третью — допиши сюда и в app.js. */
const TARGET_LANGS = ['ru', 'zh-Hans'];

const PLURAL_CATS = ['zero', 'one', 'two', 'few', 'many', 'other'];

function splitPlural(key) {
  const parts = key.split('.');
  const last = parts[parts.length - 1];
  if (PLURAL_CATS.includes(last)) {
    return [parts.slice(0, -1).join('.'), last];
  }
  return [key, null];
}

/* Какие категории требует каждая целевая локаль. */
const allRequired = new Set();
for (const lang of TARGET_LANGS) {
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  for (const c of cats) allRequired.add(c);
}

/* meta для ключа. Если для конкретной plural-формы записи нет — берём от базового ключа. */
function metaFor(key) {
  if (meta[key]) return meta[key];
  const [base, suffix] = splitPlural(key);
  if (suffix && meta[base]) return meta[base];
  return {};
}

const header = [
  'key', 'source_en', 'context', 'max_length', 'placeholders',
  'translation_ru', 'translation_zh',
];
const rows = [header];
const emitted = new Set();

function emit(key) {
  if (emitted.has(key)) return;
  emitted.add(key);

  const source = en[key];
  const m = metaFor(key);
  const [base, suffix] = splitPlural(key);

  let context = m.context || '';
  if (source === undefined && suffix) {
    context = context
      ? `[plural: ${suffix}] ${context}`
      : `[plural form "${suffix}" required by target language]`;
  }

  rows.push([
    key,
    source !== undefined ? source : '',
    context,
    m.max_length ? JSON.stringify(m.max_length) : '',
    (m.placeholders || []).join(' '),
    '',
    '',
  ]);
}

for (const key of Object.keys(en)) {
  if (emitted.has(key)) continue;
  const [base, suffix] = splitPlural(key);
  if (suffix) {
    /* Дошли до первой plural-формы этой базы.
       Выдаём все формы, которые нужны хотя бы одной целевой локали. */
    const order = PLURAL_CATS.filter(c => allRequired.has(c) || c === suffix);
    for (const cat of order) emit(`${base}.${cat}`);
  } else {
    emit(key);
  }
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