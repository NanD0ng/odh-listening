/* 通用点词弹层：离线词库 + 在线释义 + 发音 + 生词本 */
(function () {
  const WORDS = window.ODH_WORDS || {};
  const UNKNOWN_KEY = 'odh.unknown.v1';
  const IRREG = {
    am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    has: 'have', had: 'have', having: 'have', does: 'do', did: 'do', done: 'do', doing: 'do',
    went: 'go', gone: 'go', said: 'say', made: 'make', took: 'take', taken: 'take',
    came: 'come', got: 'get', gotten: 'get', saw: 'see', seen: 'see', knew: 'know', known: 'know',
    thought: 'think', told: 'tell', found: 'find', gave: 'give', given: 'give', felt: 'feel',
    became: 'become', brought: 'bring', bought: 'buy', held: 'hold', wrote: 'write', written: 'write',
    stood: 'stand', heard: 'hear', kept: 'keep', began: 'begin', begun: 'begin', ran: 'run',
    paid: 'pay', met: 'meet', sent: 'send', built: 'build', understood: 'understand', won: 'win',
    lost: 'lose', fell: 'fall', fallen: 'fall', spent: 'spend', grew: 'grow', grown: 'grow',
    drew: 'draw', drawn: 'draw', broke: 'break', broken: 'break', chose: 'choose', chosen: 'choose',
    drove: 'drive', driven: 'drive', ate: 'eat', eaten: 'eat', drank: 'drink', drunk: 'drink',
    sang: 'sing', sung: 'sing', swam: 'swim', swum: 'swim', threw: 'throw', thrown: 'throw',
    flew: 'fly', flown: 'fly', slept: 'sleep', taught: 'teach', caught: 'catch', fought: 'fight',
    sought: 'seek', sold: 'sell', shot: 'shoot', shut: 'shut', struck: 'strike', led: 'lead',
    dealt: 'deal', meant: 'mean', rose: 'rise', risen: 'rise', lain: 'lie', laid: 'lay',
    better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  };

  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  let toastEl = null, toastTimer = 0;
  window.ODHToast = function (msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2200);
  };
  function lemmaCandidates(w) {
    const out = [];
    const add = x => { if (x && x.length > 1 && !out.includes(x)) out.push(x); };
    add(w);
    add(IRREG[w]);
    if (w.endsWith("'s")) add(w.slice(0, -2));
    if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
    if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
    if (w.endsWith('es')) add(w.slice(0, -2));
    if (w.endsWith('s')) add(w.slice(0, -1));
    if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
    if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); }
    if (w.endsWith('ly')) add(w.slice(0, -2));
    if (w.endsWith('er')) add(w.slice(0, -2));
    if (w.endsWith('est')) add(w.slice(0, -3));
    if (/([^aeiou])\1(ed|ing|er|est)$/.test(w)) add(w.replace(/([^aeiou])\1(ed|ing|er|est)$/, '$1'));
    return out;
  }
  function offlineLookup(word) {
    const key = String(word || '').toLowerCase();
    for (const cand of lemmaCandidates(key)) {
      if (WORDS[cand]) return { base: cand, entry: WORDS[cand], exact: cand === key };
    }
    return null;
  }
  function unknownStore() {
    try { return JSON.parse(localStorage.getItem(UNKNOWN_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveUnknown(o) {
    localStorage.setItem(UNKNOWN_KEY, JSON.stringify(o));
    document.dispatchEvent(new CustomEvent('odh-unknown-change'));
  }
  let unknownWords = new Set();
  function refreshUnknown() {
    const u = unknownStore();
    unknownWords = new Set(Object.keys(u).filter(k => !(u[k] && u[k].known)));
  }
  function isUnknownToken(key) {
    if (unknownWords.has(key)) return true;
    for (const c of lemmaCandidates(key)) if (unknownWords.has(c)) return true;
    return false;
  }
  function refreshMarks() {
    refreshUnknown();
    document.querySelectorAll('.word').forEach(el => {
      el.classList.toggle('is-unknown', isUnknownToken(el.dataset.w));
    });
  }
  function tokenize(text) {
    const h = escapeHtml(text);
    return h.replace(/([A-Za-z][A-Za-z'’-]*)/g, m => {
      const key = m.toLowerCase().replace(/’/g, "'");
      return `<span class="word${isUnknownToken(key) ? ' is-unknown' : ''}" data-w="${key}">${m}</span>`;
    });
  }

  /* popover */
  let pop, popWord = '', popCtx = null;
  function ensurePop() {
    if (pop) return;
    pop = document.createElement('div');
    pop.className = 'pop';
    pop.id = 'word-pop';
    document.body.appendChild(pop);
    document.addEventListener('click', e => {
      if (pop.classList.contains('on') && !pop.contains(e.target) && !e.target.closest('.word')) closePop();
    });
    window.addEventListener('resize', closePop);
    window.addEventListener('scroll', closePop, true);
  }
  function closePop() {
    if (!pop) return;
    pop.classList.remove('on');
    popWord = '';
  }
  function position(rect) {
    const w = pop.offsetWidth || 330, h = pop.offsetHeight || 200;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
    let top = rect.top - h - 10;
    const below = top < 8;
    if (below) top = rect.bottom + 10;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 10);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.classList.toggle('below', below);
    pop.style.setProperty('--arrow-x', (rect.left + rect.width / 2 - left) + 'px');
  }
  function rankSenses(entry) {
    return (entry.m || []).map(m => ({ pos: m[0] || '', cn: m[1] || '' }));
  }
  function renderSenses(entry) {
    const list = rankSenses(entry);
    if (!list.length) return '<span class="state">离线词库无释义</span>';
    return '<div class="top-senses">' + list.map(s => `<div class="sense"><span class="pos">${escapeHtml(s.pos)}</span>${escapeHtml(s.cn)}</div>`).join('') + '</div>';
  }
  function cacheGet(w) { try { return JSON.parse(localStorage.getItem('odh.word.' + w) || 'null'); } catch (e) { return null; } }
  function cacheSet(w, v) { try { localStorage.setItem('odh.word.' + w, JSON.stringify(v)); } catch (e) {} }

  function speak(word) {
    if (window.ODHSpeech) { ODHSpeech.speak(word, { rate: 0.9 }); return; }
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = .9;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function openPop(word, rect, ctx) {
    ensurePop();
    popWord = word;
    popCtx = ctx || {};
    const lookup = offlineLookup(word);
    const off = lookup || (popCtx.entry ? { base: word, entry: popCtx.entry, exact: true } : null);
    const shown = off ? off.entry.w : word;
    const rec = unknownStore()[off ? off.base : word.toLowerCase()];
    const count = rec ? rec.count : 0;
    pop.innerHTML = `<div class="pop-head">
        <h4>${escapeHtml(shown)}${off && !off.exact ? `<span class="lemma">原形 · ${escapeHtml(off.base)}</span>` : ''}<span class="ph">${off ? escapeHtml(off.entry.p || '') : ''}</span></h4>
        <div class="pop-actions">
          <button class="mo ${count ? 'on' : ''}" id="pop-mo" title="不认识，加入生词库">陌${count ? `<span class="n">${count}</span>` : ''}</button>
          <button class="spk" id="pop-spk" title="发音">🔊</button>
          <button class="close" id="pop-close" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="zh">${off ? renderSenses(off.entry) : '<div class="skeleton" style="width:60%"></div>'}</div>
      <div class="defs" id="pop-def"></div>
      <div class="online" id="pop-online"><div class="state">${off ? '正在补充英文释义…' : '正在查询在线词典…'}</div></div>
      ${ctx && ctx.sentence ? `<div class="ctx">${tokenize(ctx.sentence).replace(new RegExp('data-w="' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'g'), 'style="color:var(--gold);font-weight:700"')}</div>` : ''}`;
    position(rect);
    pop.classList.add('on');
    pop.querySelector('#pop-close').onclick = closePop;
    pop.querySelector('#pop-spk').onclick = () => speak(shown);
    pop.querySelector('#pop-mo').onclick = () => addUnknown(off ? off.base : word.toLowerCase());
    lookupOnline(off ? off.base : word, off);
  }

  function addUnknown(word) {
    const store = unknownStore();
    const rec = store[word] || { count: 0, sets: [], lastAt: 0, sample: null, known: false };
    rec.sets = rec.sets || [];
    const setId = popCtx.setId || '';
    if (rec.sets.includes(setId)) {
      if (!rec.known) {
        if (window.ODHToast) ODHToast('本篇已记录过这个词');
        return;
      }
      rec.known = false;
      saveUnknown(store);
      refreshMarks();
      if (window.ODHToast) ODHToast('已重新标记为不认识');
      return;
    }
    rec.count += 1;
    rec.sets.push(setId);
    rec.lastAt = Date.now();
    rec.known = false;
    rec.src = rec.src || popCtx.src || 'reading';
    rec.sample = { set: setId, sentence: popCtx.sentence || '', zh: popCtx.zh || '', part: popCtx.part || '' };
    store[word] = rec;
    saveUnknown(store);
    refreshMarks();
    const btn = pop.querySelector('#pop-mo');
    if (btn) { btn.classList.add('on'); btn.innerHTML = '陌<span class="n">' + rec.count + '</span>'; }
    if (window.ODHToast) ODHToast('已加入生词库 · 不认识 ' + rec.count + ' 次');
  }

  async function lookupOnline(word, off) {
    const cached = cacheGet(word);
    if (cached) { renderOnline(cached); return; }
    const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
    const req = url => Promise.race([fetch(url).then(r => r.ok ? r.json() : null), timeout(8000)]);
    const jobs = [req('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(off ? off.base : word))];
    if (!off) jobs.push(req('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=en%7Czh-CN'));
    const [d, z] = await Promise.allSettled(jobs);
    if (popWord !== word) return;
    const dict = d.status === 'fulfilled' ? d.value : null;
    const zh = z && z.status === 'fulfilled' && z.value ? (z.value.responseData || {}).translatedText : '';
    const cleanZh = zh && zh.trim().toLowerCase() !== word.toLowerCase() ? zh : '';
    const out = { word: off ? off.base : word, phonetic: '', audio: '', zh: cleanZh, defs: [] };
    if (Array.isArray(dict) && dict[0]) {
      out.phonetic = dict[0].phonetic || '';
      for (const m of (dict[0].meanings || []).slice(0, 3)) {
        out.defs.push({ pos: m.partOfSpeech || '', en: (m.definitions || []).slice(0, 2).map(x => x.definition).join(' ') });
      }
    }
    cacheSet(word, out);
    renderOnline(out);
  }
  function renderOnline(o) {
    if (!pop) return;
    const zhBox = pop.querySelector('.zh');
    if (o.zh && zhBox && !zhBox.querySelector('.sense')) zhBox.innerHTML = '<div class="sense">' + escapeHtml(o.zh) + '</div>';
    const defs = pop.querySelector('#pop-def');
    if (defs) {
      defs.innerHTML = (o.defs || []).map(d => `<div><span class="pos">${escapeHtml(d.pos)}</span>${escapeHtml(d.en)}</div>`).join('');
    }
    const online = pop.querySelector('#pop-online');
    if (online) online.remove();
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('.word[data-w]');
    if (!el) return;
    if (el.closest('label')) e.preventDefault();
    e.stopPropagation();
    const holder = el.closest('[data-sentence]');
    openPop(el.dataset.w, el.getBoundingClientRect(), {
      sentence: holder ? holder.getAttribute('data-sentence') : '',
      setId: el.dataset.set || (window.ODH_PAGE_CTX && ODH_PAGE_CTX.setId) || '',
      part: el.dataset.part || (window.ODH_PAGE_CTX && ODH_PAGE_CTX.part) || '',
      src: (window.ODH_PAGE_CTX && ODH_PAGE_CTX.src) || 'reading',
      entry: el.dataset.zh ? { w: el.dataset.w, p: '', m: [[el.dataset.pos || '', el.dataset.zh]] } : null,
    });
  });
  document.addEventListener('odh-unknown-change', () => { try { refreshMarks(); } catch (e) {} });

  window.ODHWordPop = {
    tokenize,
    refreshMarks,
    openPop,
    closePop,
    speak,
    offlineLookup,
    isUnknownToken,
    lemmaCandidates,
  };
  refreshUnknown();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshMarks);
  else refreshMarks();
})();
