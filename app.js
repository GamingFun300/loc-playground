/* ---------- Конфиг ---------- */
const LOCALES = [
  { code: 'en',       label: 'English' },
  { code: 'ru',       label: 'Русский' },
  { code: 'zh-Hans',  label: '简体中文' },
];
const DEFAULT_LANG = 'en';

/* ---------- Состояние ---------- */
const state = {
  lang: DEFAULT_LANG,
  strings: {},
  meta: {},
  screen: 'start',      // 'start' | 'play' | 'win'
  player: { name: '', gender: 'male' },
  hasKey: false,
  hasCoins: false,
  chestCoins: 5,
  chestOpened: false,
  tableExamined: false, // осмотрели стол — увидели блеск
  glintSeen: false,     // присмотрелись — поняли, что это ключ
  doorOpen: false,
  log: [],
  queue: [],
  inDialogue: false,
};

const debug = { keys: false, pseudo: false, overflow: false };

/* ---------- Утилиты DOM ---------- */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/* ---------- i18n ---------- */
const PSEUDO_MAP = {
  a:'á',b:'ƀ',c:'ç',d:'ð',e:'é',f:'ƒ',g:'ĝ',h:'ĥ',i:'í',j:'ĵ',k:'ķ',l:'ĺ',m:'ɱ',
  n:'ñ',o:'ó',p:'þ',q:'q',r:'ŕ',s:'š',t:'ţ',u:'ú',v:'ṽ',w:'ŵ',x:'ẋ',y:'ý',z:'ž',
  A:'Á',B:'Ɓ',C:'Ç',D:'Ð',E:'É',F:'Ƒ',G:'Ĝ',H:'Ĥ',I:'Í',J:'Ĵ',K:'Ķ',L:'Ĺ',M:'Ṁ',
  N:'Ñ',O:'Ó',P:'Þ',Q:'Q',R:'Ŕ',S:'Š',T:'Ţ',U:'Ú',V:'Ṽ',W:'Ŵ',X:'Ẋ',Y:'Ý',Z:'Ž',
};

function pseudo(str) {
  const mapped = str.replace(/[a-zA-Z]/g, ch => PSEUDO_MAP[ch] || ch);
  const pad = '~'.repeat(Math.ceil(str.length * 0.35));
  return `⟦${mapped}${pad}⟧`;
}

function interpolate(str, params) {
  return str.replace(/\{(\w+)\}/g, (m, k) =>
    params[k] !== undefined ? String(params[k]) : m
  );
}

function resolveString(key, count) {
  if (count !== undefined) {
    const cat = new Intl.PluralRules(state.lang).select(count);
    for (const cand of [`${key}.${cat}`, `${key}.other`, key]) {
      if (state.strings[cand] !== undefined) return state.strings[cand];
    }
    return undefined;
  }
  return state.strings[key];
}

function t(key, params = {}, count) {
  if (debug.keys) return key;
  const raw = resolveString(key, count);
  if (raw === undefined) {
    console.warn('[i18n] missing key:', key, 'lang:', state.lang);
    return key;
  }
  let out = interpolate(raw, params);
  if (debug.pseudo && state.lang !== 'zh-Hans') out = pseudo(out);
  return out;
}

/* ---------- Загрузка локали ---------- */
async function loadLocale(code) {
  const res = await fetch(`locales/${code}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for locales/${code}.json`);
  state.strings = await res.json();
  state.lang = code;
  document.documentElement.lang = code;
  localStorage.setItem('lang', code);
}

async function switchLang(code) {
  try {
    await loadLocale(code);
    render();
  } catch (e) {
    console.error(e);
    alert(`Не удалось загрузить ${code}: ${e.message}`);
  }
}

/* ---------- Лог ----------
   Храним ключ + параметры. Рендер — через t() на текущем языке. */

function pushLog(entry) {
  state.log.push(entry);
  if (state.log.length > 200) state.log.shift();
}

const logNarr   = (key, params)             => ({ kind: 'narr',  key, params });
const logMsg    = (key, params, count)      => ({ kind: 'msg',   key, params, count });
const logDialog = (speakerKey, key, params) => ({ kind: 'dialogue', speakerKey, key, params });
const logDivider = ()                       => ({ kind: 'divider' });

/* ---------- Очередь реплик ----------
   startSequence(entries, { immediate }) :
     immediate = false — первая реплика сразу, остальные по кнопке «Продолжить»;
     immediate = true  — все реплики сразу (для вступительного текста).
   Между группами реплик ставится визуальный разделитель. */

function startSequence(entries, { immediate = false } = {}) {
  if (!entries || entries.length === 0) return;

  // Разделитель перед новой группой, если лог не пуст.
  if (state.log.length > 0 && state.log[state.log.length - 1].kind !== 'divider') {
    pushLog(logDivider());
  }

  if (immediate) {
    for (const e of entries) pushLog(e);
    state.queue = [];
    state.inDialogue = false;
  } else {
    state.queue = entries.slice(1);
    state.inDialogue = state.queue.length > 0;
    pushLog(entries[0]);
  }
  render();
}

function advanceDialogue() {
  if (state.queue.length === 0) return;
  pushLog(state.queue.shift());
  if (state.queue.length === 0) state.inDialogue = false;
  render();
}

/* ---------- Игровые действия ---------- */
function startGame() {
  state.screen = 'play';
  state.log = [];
  state.queue = [];
  state.inDialogue = false;
  state.hasKey = false;
  state.hasCoins = false;
  state.chestOpened = false;
  state.tableExamined = false;
  state.glintSeen = false;
  state.doorOpen = false;

  /* Вступительный текст — все 4 строки сразу. */
  startSequence([
    logNarr(`narr.intro.${state.player.gender}`),
    logNarr('narr.table'),
    logNarr('narr.chest'),
    logNarr('narr.door'),
  ], { immediate: true });
}

function restart() {
  state.screen = 'start';
  state.log = [];
  state.queue = [];
  state.inDialogue = false;
  render();
}

function actTalkGuard() {
  const g = state.player.gender;
  startSequence([
    logDialog('npc.guard', `dialogue.guard.greet.${g}`),
    logDialog('npc.guard', 'dialogue.guard.why'),
    logDialog('npc.guard', 'dialogue.guard.key_hint'),
    logDialog('npc.guard', 'dialogue.guard.farewell'),
  ]);
}

function actTalkMerchant() {
  startSequence([
    logDialog('npc.merchant', 'dialogue.merchant.greet'),
    logDialog('npc.merchant', 'dialogue.merchant.key_pun'),
    logDialog('npc.merchant', 'dialogue.merchant.door_key'),
    logDialog('npc.merchant', 'dialogue.merchant.farewell'),
  ]);
}

function actExamineTable() {
  if (state.tableExamined) return;
  state.tableExamined = true;
  startSequence([logNarr('narr.table')]);
}

function actLookCloser() {
  if (state.glintSeen) return;
  state.glintSeen = true;
  startSequence([logNarr('narr.glint_revealed')]);
}

function actTakeKey() {
  if (state.hasKey) return;
  state.hasKey = true;
  startSequence([{
    kind: 'msg',
    key: `msg.pickup.${state.player.gender}`,
    itemKey: 'item.old_key.name',
  }]);
}

function actExamineChest() {
  if (!state.chestOpened) {
    state.chestOpened = true;
    startSequence([
      logNarr('narr.chest'),
      logMsg('msg.chest_opened'),
    ]);
  } else if (state.hasCoins) {
    startSequence([logMsg('hint.chest_empty')]);
  } else {
    startSequence([logNarr('narr.chest')]);
  }
}

function actTakeCoins() {
  if (!state.chestOpened || state.hasCoins) return;
  state.hasCoins = true;
  startSequence([logMsg('msg.coins', { amount: state.chestCoins }, state.chestCoins)]);
}

function useKey() {
  if (!state.hasKey || state.doorOpen) return;
  state.doorOpen = true;
  state.screen = 'win';
  render();
}

function actOpenDoor() {
  if (state.hasKey) return useKey();
  startSequence([logMsg('hint.key_needed')]);
}

function flipCoin() {
  /* 49% орёл, 49% решка, 2% ребро (пасхалка). */
  const r = Math.random();
  let key;
  if (r < 0.02)      key = 'msg.coin_edge';
  else if (r < 0.51) key = 'msg.coin_heads';
  else               key = 'msg.coin_tails';
  startSequence([logMsg(key)]);
}

function useItem(itemId) {
  if (itemId === 'coins') flipCoin();
}

/* ---------- Рендер ---------- */
function renderLangBar() {
  const select = el('select', { class: 'lang-select',
    onchange: e => switchLang(e.target.value) });
  for (const l of LOCALES) {
    const opt = el('option', { value: l.code, text: l.label });
    if (l.code === state.lang) opt.selected = true;
    select.appendChild(opt);
  }
  return el('div', { class: 'lang-bar' },
    el('span', { class: 'lang-label', text: t('ui.lang.label') }),
    select
  );
}

function renderStart() {
  const wrap = el('div', { class: 'screen screen-start' });
  wrap.appendChild(el('h1', { class: 'title', text: t('ui.title') }));

  const nameInput = el('input', {
    type: 'text', class: 'input', maxlength: '16',
    value: state.player.name, placeholder: t('ui.default_name'),
  });

  let gender = state.player.gender;
  const mBtn = el('button', { class: 'choice', text: t('ui.gender_male'),
    onclick: () => { gender = 'male'; sync(); } });
  const fBtn = el('button', { class: 'choice', text: t('ui.gender_female'),
    onclick: () => { gender = 'female'; sync(); } });
  const sync = () => {
    mBtn.classList.toggle('active', gender === 'male');
    fBtn.classList.toggle('active', gender === 'female');
  };
  sync();

  wrap.appendChild(el('label', { class: 'field' },
    el('span', { class: 'field-label', text: t('ui.name_prompt') }),
    nameInput
  ));
  wrap.appendChild(el('label', { class: 'field' },
    el('span', { class: 'field-label', text: t('ui.gender_prompt') }),
    el('div', { class: 'choice-row' }, mBtn, fBtn)
  ));

  wrap.appendChild(el('button', {
    class: 'primary', text: t('ui.start_button'),
    onclick: () => {
      state.player.name = nameInput.value.trim() || t('ui.default_name');
      state.player.gender = gender;
      startGame();
    },
  }));

  wrap.appendChild(renderLangBar());
  return wrap;
}

function renderEntry(entry) {
  if (entry.kind === 'divider') {
    return el('hr', { class: 'entry-divider' });
  }

  const params = { ...(entry.params || {}) };
  if (entry.itemKey) params.item = t(entry.itemKey);

  if (entry.kind === 'dialogue') {
    return el('div', { class: 'entry dialogue' },
      el('div', { class: 'speaker', text: t(entry.speakerKey) }),
      el('p',   { class: 'line',    text: t(entry.key, params, entry.count) })
    );
  }
  const cls = entry.kind === 'narr' ? 'entry narr'
            : entry.kind === 'msg'  ? 'entry msg'
            : 'entry';
  return el('p', { class: cls, text: t(entry.key, params, entry.count) });
}

function renderInventory() {
  const box = el('aside', { class: 'inventory' });
  box.appendChild(el('h2', { text: t('ui.inventory_title') }));

  const list = el('ul', { class: 'inv-list' });
  let any = false;

  if (state.hasKey) {
    any = true;
    list.appendChild(el('li', { class: 'inv-item' },
      el('div', { class: 'inv-name' },
        el('strong', { text: t('item.old_key.name') })
      ),
      el('div', { class: 'inv-desc', text: t('item.old_key.desc') })
    ));
  }

  if (state.hasCoins) {
    any = true;
    const coinsName = t('item.coins.name', { amount: state.chestCoins }, state.chestCoins);
    list.appendChild(el('li', { class: 'inv-item' },
      el('div', { class: 'inv-name' },
        el('strong', { text: coinsName }),
        el('button', {
          class: 'mini', text: t('ui.use_button'),
          dataset: { key: 'ui.use_button' },
          onclick: () => useItem('coins'),
        })
      )
    ));
  }

  if (!any) list.appendChild(el('li', { class: 'inv-empty', text: t('ui.inventory_empty') }));

  box.appendChild(list);
  return box;
}

function renderActions() {
  if (state.inDialogue) {
    return el('div', { class: 'actions' },
      el('button', {
        class: 'action action-continue',
        text: t('ui.continue'),
        dataset: { key: 'ui.continue' },
        onclick: advanceDialogue,
      })
    );
  }

  const bar = el('div', { class: 'actions' });
  const add = (key, fn) => bar.appendChild(el('button', {
    class: 'action', text: t(key), dataset: { key }, onclick: fn,
  }));

  add('action.talk_guard', actTalkGuard);
  add('action.talk_merchant', actTalkMerchant);

  if (!state.tableExamined) {
    add('action.examine_table', actExamineTable);
  } else if (!state.glintSeen) {
    add('action.look_closer', actLookCloser);
  } else if (!state.hasKey) {
    add('action.take_key', actTakeKey);
  }

  if (!state.chestOpened) {
    add('action.examine_chest', actExamineChest);
  } else if (!state.hasCoins) {
    add('action.take_coins', actTakeCoins);
  }

  add('action.open_door', actOpenDoor);

  return bar;
}

function renderGame() {
  const wrap = el('div', { class: 'screen screen-game' });

  wrap.appendChild(el('header', { class: 'header' },
    el('h1', { class: 'title', text: t('ui.title') }),
    renderLangBar()
  ));

  const log = el('section', { class: 'log' });
  for (let i = 0; i < state.log.length; i++) {
    const node = renderEntry(state.log[i]);
    if (i === state.log.length - 1 && state.log[i].kind !== 'divider') {
      node.classList.add('entry-new');
    }
    log.appendChild(node);
  }

  wrap.appendChild(el('main', { class: 'main' }, log, renderInventory()));
  wrap.appendChild(renderActions());

  if (state.screen === 'win') {
    wrap.appendChild(el('div', { class: 'overlay' },
      el('div', { class: 'overlay-card' },
        el('p', { class: 'win-text', text: t('msg.win', { name: state.player.name }) }),
        el('button', {
          class: 'primary', text: t('ui.restart'), onclick: restart,
        })
      )
    ));
  }

  return wrap;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(state.screen === 'start' ? renderStart() : renderGame());

  const log = app.querySelector('.log');
  if (log) log.scrollTop = log.scrollHeight;

  if (debug.overflow) requestAnimationFrame(markOverflow);
}

function markOverflow() {
  document.querySelectorAll('[data-key]').forEach(node => {
    node.classList.remove('overflow');
    const key = node.dataset.key;
    const m = state.meta[key];
    const text = node.textContent || '';
    let tooLong = false;

    if (m && m.max_length) {
      const max = typeof m.max_length === 'object'
        ? m.max_length[state.lang]
        : m.max_length;
      if (typeof max === 'number' && text.length > max) tooLong = true;
    }

    const clipped = node.scrollWidth > node.clientWidth + 1;
    if (tooLong || clipped) node.classList.add('overflow');
  });
}

/* ---------- Клавиатура ---------- */
document.addEventListener('keydown', e => {
  if (!state.inDialogue) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    advanceDialogue();
  }
});

/* ---------- Инициализация ---------- */
function parseDebugFlags() {
  const d = new URLSearchParams(location.search).get('debug') || '';
  const flags = d.split(',').map(s => s.trim());
  debug.keys     = flags.includes('keys');
  debug.pseudo   = flags.includes('pseudo');
  debug.overflow = flags.includes('overflow');
}

async function init() {
  parseDebugFlags();

  const params = new URLSearchParams(location.search);
  const urlLang = params.get('lang');
  const saved = localStorage.getItem('lang');
  const known = c => LOCALES.some(l => l.code === c);
  const code = (urlLang && known(urlLang)) ? urlLang
             : (saved && known(saved)) ? saved
             : DEFAULT_LANG;

  try {
    state.meta = await (await fetch('meta.json')).json();
  } catch { state.meta = {}; }

  try {
    await loadLocale(code);
  } catch (e) {
    document.getElementById('app').innerHTML =
      `<div class="fatal">
        <p>Не удалось загрузить файлы локализации (${e.message}).</p>
        <p>Открой проект через локальный сервер:</p>
        <pre>python3 -m http.server 8000</pre>
        <p>и зайди на <code>http://localhost:8000</code>.</p>
      </div>`;
    return;
  }

  const coinsParam = params.get('coins');
  if (coinsParam !== null) {
    const parsed = parseInt(coinsParam, 10);
    state.chestCoins = Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
  } else {
    /* Случайно 1–10, чтобы каждый заход отличался. */
    state.chestCoins = 1 + Math.floor(Math.random() * 10);
  }

  render();
}

init();