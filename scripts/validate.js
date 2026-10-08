#!/usr/bin/env node
/* Проверка целостности локалей.
   Использование:
     node scripts/validate.js          # проверить все целевые локали
     node scripts/validate.js --fix    # показать, что можно дописать

   Что проверяется:
   - все ключи из en.json присутствуют в целевых локалях;
   - нет лишних ключей, которых нет в en.json;
   - плейсхолдеры в переводе совпадают с источником;
   - для plural-баз есть все категории, которые требует целевой язык. */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const TARGET_LANGS = ['ru', 'zh-Hans'];
const PLURAL_CATS = ['zero', 'one', 'two', 'few', 'many', 'other'];

function load(file) {
  const p = path.join(root, 'locales', file);
  if (!fs.existsSync(p)) {
    console.error(`Не найден ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function placeholders(s) {
  return [...new Set((s.match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1)))].sort();
}

const en = load('en.json');
const enKeys = new Set(Object.keys(en));

const problems = [];

for (const lang of TARGET_LANGS) {
  const target = load(`${lang}.json`);
  const targetKeys = new Set(Object.keys(target));

  /* 1. Пропущенные ключи. */
  for (const k of enKeys) {
    if (!targetKeys.has(k)) {
      problems.push(`[${lang}] отсутствует ключ: ${k}`);
    }
  }

  /* 2. Лишние ключи. */
  for (const k of targetKeys) {
    if (!enKeys.has(k)) {
      problems.push(`[${lang}] лишний ключ: ${k}`);
    }
  }

  /* 3. Плейсхолдеры. */
  for (const k of enKeys) {
    if (!targetKeys.has(k)) continue;
    const srcPh = placeholders(en[k]);
    const trPh  = placeholders(target[k]);
    for (const p of srcPh) if (!trPh.includes(p))
      problems.push(`[${lang}] потерян плейсхолдер {${p}} в ключе: ${k}`);
    for (const p of trPh) if (!srcPh.includes(p))
      problems.push(`[${lang}] лишний плейсхолдер {${p}} в ключе: ${k}`);
  }

  /* 4. Plural-категории.
     Извлекаем базы plural-ключей из en.json и проверяем, что для
     каждой есть все формы, требуемые целевым языком. */
  const required = new Set(new Intl.PluralRules(lang).resolvedOptions().pluralCategories);
  const bases = new Set();
  for (const k of enKeys) {
    const parts = k.split('.');
    if (PLURAL_CATS.includes(parts[parts.length - 1])) {
      bases.add(parts.slice(0, -1).join('.'));
    }
  }
  for (const base of bases) {
    for (const cat of required) {
      const key = `${base}.${cat}`;
      if (!(key in target)) {
        problems.push(`[${lang}] отсутствует plural-категория "${cat}": ${key}`);
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`OK. Проверено локалей: ${TARGET_LANGS.length}.`);
  process.exit(0);
}

console.error(`Найдено проблем: ${problems.length}`);
for (const p of problems) console.error('  ' + p);
process.exit(1);