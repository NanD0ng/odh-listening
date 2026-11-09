/* 阅读做题 / 复盘页逻辑 */
(function () {
  const DATA = (window.ODH_READING && window.ODH_READING.sets) || {};
  const READ_KEY = 'odh.read.v1';
  const params = new URLSearchParams(location.search);
  const setId = params.get('set') || Object.keys(DATA).sort().pop() || '';
  const SET = DATA[setId];
  const initialSec = (params.get('sec') || 'all').toUpperCase();
  const initialMode = params.get('mode') === 'review' ? 'review' : 'practice';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = s => esc(s).replace(/"/g, '&quot;');
  const tokenize = t => (window.ODHWordPop ? ODHWordPop.tokenize(t) : esc(t));

  if (!SET) {
    document.body.innerHTML = '<div style="padding:80px 24px;font-family:sans-serif">没有找到这套阅读数据。<a href="reading.html">返回阅读</a></div>';
    return;
  }

  window.ODH_PAGE_CTX = { setId, src: 'reading' };

  let sec = initialSec;
  if (!['A', 'B', 'C', 'C1', 'C2', 'ALL'].includes(sec)) sec = 'ALL';
  let mode = initialMode;
  const state = { activeBlank: null };

  function readStore() {
    try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeStore(s) {
    try { localStorage.setItem(READ_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function rec(key) {
    return ((readStore()[setId] || {})[key]) || { answers: {}, submitted: false, right: 0, total: 0 };
  }
  function save(key, patch) {
    const all = readStore();
    all[setId] = all[setId] || {};
    const cur = all[setId][key] || { answers: {}, submitted: false };
    all[setId][key] = Object.assign({}, cur, patch, { at: Date.now() });
    writeStore(all);
  }

  function sections() {
    const d = SET;
    if (sec === 'A') return [{ key: 'A', kind: 'A', data: d.A }];
    if (sec === 'B') return [{ key: 'B', kind: 'B', data: d.B }];
    if (sec === 'C1') return [{ key: 'C1', kind: 'C', data: d.C[0] }];
    if (sec === 'C2') return [{ key: 'C2', kind: 'C', data: d.C[1] }];
    if (sec === 'C') return [{ key: 'C1', kind: 'C', data: d.C[0] }, { key: 'C2', kind: 'C', data: d.C[1] }];
    return [
      { key: 'A', kind: 'A', data: d.A },
      { key: 'B', kind: 'B', data: d.B },
      { key: 'C1', kind: 'C', data: d.C[0] },
      { key: 'C2', kind: 'C', data: d.C[1] },
    ];
  }
  function forcedShow(key) { return mode === 'review' || rec(key).submitted; }
  function secLabel(kind, key) {
    if (kind === 'A') return 'Section A · 选词填空';
    if (kind === 'B') return 'Section B · 段落匹配';
    return 'Section C · 仔细阅读' + (key === 'C2' ? '（第二篇）' : '（第一篇）');
  }
  function rangeLabel(kind, data) {
    if (kind === 'A') return '26–35';
    if (kind === 'B') return '36–45';
    return data.questions.length ? data.questions[0].q + '–' + data.questions[data.questions.length - 1].q : '';
  }

  /* ----------------------------- passage render ----------------------------- */
  function renderBlankText(text, key) {
    const d = SET.A;
    const r = rec(key);
    const show = forcedShow(key);
    const full = text.replace(/\[\[\d+\]\]/g, ' ____ ');
    return text.split(/(\[\[\d+\]\])/g).map(part => {
      const m = part.match(/^\[\[(\d+)\]\]$/);
      if (!m) return tokenize(part);
      const q = m[1];
      const val = r.answers[q] || '';
      const correct = d.answers[q] || '';
      if (show) {
        const good = val === correct;
        return `<span class="blank ${val ? (good ? 'ok' : 'bad') : 'none'}" data-q="${q}"><b>${q}</b><em>${val || '—'}</em><i>${good ? '✓ ' + correct : '正确 ' + correct}</i></span>`;
      }
      return `<span class="blank-wrap" data-q="${q}"><span class="blank-no">${q}</span><select class="blank-sel${val ? ' filled' : ''}" data-q="${q}" data-sec="${key}" aria-label="第 ${q} 空"><option value="">选词</option>${d.bank.map(b => `<option value="${b.k}"${val === b.k ? ' selected' : ''}>${b.k}. ${esc(b.w)}</option>`).join('')}</select></span>`;
    }).join('');
  }

  function passage(fullText, cls) {
    return `<div class="passage ${cls || ''}" data-sentence="${attr(fullText)}">${tokenize(fullText)}</div>`;
  }

  function renderLeft() {
    const pane = $('#passage-pane');
    pane.innerHTML = sections().map(s => {
      if (s.kind === 'A') {
        return `<section class="rs" data-sec="${s.key}">
          <div class="rs-head"><span class="rs-k">${s.key}</span><h2>${secLabel('A', s.key)}</h2><span class="rs-r">26–35 · 10 题</span></div>
          ${s.data.passage.map(p => `<div class="passage with-blanks" data-sentence="${attr(p.replace(/\[\[\d+\]\]/g, ' ____ '))}">${renderBlankText(p, s.key)}</div>`).join('')}
        </section>`;
      }
      if (s.kind === 'B') {
        return `<section class="rs" data-sec="${s.key}">
          <div class="rs-head"><span class="rs-k">B</span><h2>${secLabel('B', s.key)}</h2><span class="rs-r">36–45 · 10 题</span></div>
          <h3 class="passage-title">${esc(s.data.title)}</h3>
          <div class="para-list">${s.data.paragraphs.map(p => `<div class="bp"><span class="bp-k">${p.k}</span><div data-sentence="${attr(p.text)}">${tokenize(p.text)}</div></div>`).join('')}</div>
        </section>`;
      }
      return `<section class="rs" data-sec="${s.key}">
        <div class="rs-head"><span class="rs-k">${s.key}</span><h2>${secLabel('C', s.key)}</h2><span class="rs-r">${rangeLabel('C', s.data)} · 5 题</span></div>
        <h3 class="passage-title">${esc(s.data.label || 'Passage')}</h3>
        ${s.data.passage.map(p => passage(p)).join('')}
      </section>`;
    }).join('');
    if (window.ODHWordPop) ODHWordPop.refreshMarks();
  }

  /* ----------------------------- answer render ----------------------------- */
  function scoreBar(key, kind, data) {
    const r = rec(key);
    if (!r.submitted) return '';
    const pct = r.total ? Math.round(r.right / r.total * 100) : 0;
    return `<div class="scorebar"><b>${r.right}/${r.total}</b><span>正确率 ${pct}%</span>
      <button class="mini-btn" data-redo="${key}">重做本节</button></div>`;
  }

  function renderBank(key) {
    const d = SET.A;
    const r = rec(key);
    return `<div class="bank">
      <div class="bank-h"><b>词库 A–O</b><span>点词填入当前空</span></div>
      <div class="bank-grid">${d.bank.map(b => `<button class="bank-chip" data-fill="${b.k}" data-sec="${key}"><i>${b.k}</i><span>${esc(b.w)}</span></button>`).join('')}</div>
      <div class="answer-grid">${Array.from({ length: 10 }, (_, i) => i + 26).map(q => {
        const v = r.answers[q] || '';
        return `<span class="ag${v ? ' on' : ''}" data-jump="${q}">${q}<b>${v || '·'}</b></span>`;
      }).join('')}</div>
    </div>`;
  }

  function renderA(key, data) {
    return `<section class="ans-sec" data-sec="${key}">
      <div class="ans-head"><h3>Section A · 选词填空</h3><span>26–35 题 · 10 空</span></div>
      ${scoreBar(key, 'A', data)}
      ${renderBank(key)}
      <div class="ans-tip">每个词只能用一次。做完后点下方“提交本节”。</div>
      ${!rec(key).submitted ? `<button class="submit-btn" data-submit="${key}">提交本节</button>` : ''}
    </section>`;
  }

  function renderB(key, data) {
    const r = rec(key);
    const show = forcedShow(key);
    const keys = data.paragraphs.map(p => p.k);
    return `<section class="ans-sec" data-sec="${key}">
      <div class="ans-head"><h3>Section B · 段落匹配</h3><span>36–45 题 · 10 题</span></div>
      ${scoreBar(key, 'B', data)}
      <div class="qlist">${data.statements.map(st => {
        const val = r.answers[st.q] || '';
        const good = val && val === st.answer;
        const bad = show && val && val !== st.answer;
        return `<div class="rcard ${show ? (good ? 'ok' : (bad ? 'bad' : '')) : ''}" data-q="${st.q}">
          <div class="qtext" data-sentence="${attr(st.text)}"><b>${st.q}.</b> ${tokenize(st.text)}</div>
          ${show
            ? `<div class="ansline">${val ? '你选 ' + val + ' · ' : ''}正确答案 <b>${st.answer}</b>${bad ? ' · 选错' : ''}</div>`
            : `<select class="letter-sel" data-q="${st.q}" data-sec="${key}"><option value="">选择段落</option>${keys.map(k => `<option value="${k}"${val === k ? ' selected' : ''}>${k}</option>`).join('')}</select>`}
        </div>`;
      }).join('')}</div>
      ${!rec(key).submitted ? `<button class="submit-btn" data-submit="${key}">提交本节</button>` : ''}
    </section>`;
  }

  function renderC(key, data) {
    const r = rec(key);
    const show = forcedShow(key);
    return `<section class="ans-sec" data-sec="${key}">
      <div class="ans-head"><h3>Section C · 仔细阅读</h3><span>${rangeLabel('C', data)} 题 · 5 题</span></div>
      ${scoreBar(key, 'C', data)}
      <div class="qlist">${data.questions.map(q => {
        const val = r.answers[q.q] || '';
        const good = val === q.answer;
        return `<div class="rcard ${show ? (val ? (good ? 'ok' : 'bad') : '') : ''}" data-q="${q.q}">
          <div class="qtext"><b>${q.q}.</b> ${tokenize(q.stem)}</div>
          <div class="ropts">${['A', 'B', 'C', 'D'].map(k => {
            const on = val === k;
            const isAns = show && q.answer === k;
            const cls = show ? (isAns ? 'correct' : (on ? 'wrong' : '')) : (on ? 'on' : '');
            return show
              ? `<div class="ropt ${cls}"><b>${k}</b><span>${tokenize(q.options[k] || '')}</span></div>`
              : `<label class="ropt ${cls}"><input type="radio" name="q${q.q}" value="${k}" data-q="${q.q}" data-sec="${key}"${on ? ' checked' : ''}><b>${k}</b><span>${tokenize(q.options[k] || '')}</span></label>`;
          }).join('')}</div>
          ${show ? `<div class="ansline">正确答案 <b>${q.answer}</b>${val && !good ? ' · 你选 ' + val : ''}</div>` : ''}
        </div>`;
      }).join('')}</div>
      ${!rec(key).submitted ? `<button class="submit-btn" data-submit="${key}">提交本节</button>` : ''}
    </section>`;
  }

  function renderRight() {
    const pane = $('#answer-pane');
    pane.innerHTML = sections().map(s => {
      if (s.kind === 'A') return renderA(s.key, s.data);
      if (s.kind === 'B') return renderB(s.key, s.data);
      return renderC(s.key, s.data);
    }).join('');
    if (window.ODHWordPop) ODHWordPop.refreshMarks();
  }

  function totalStats() {
    const sum = { total: 0, right: 0, done: 0 };
    sections().forEach(s => {
      const r = rec(s.key);
      const total = s.kind === 'A' ? 10 : s.kind === 'B' ? 10 : 5;
      sum.total += total;
      if (r.submitted) { sum.done++; sum.right += r.right || 0; }
    });
    return sum;
  }
  function renderHead() {
    $('#set-title').textContent = SET.title;
    $('#set-sub').textContent = `${SET.date.replace('-', '.')} · 阅读 ${sections().length === 4 ? '整套' : (sec === 'C' ? '两篇仔细阅读' : 'Section ' + sec)}`;
    $$('#sec-tabs a').forEach(a => a.classList.toggle('on', a.dataset.sec.toUpperCase() === sec.toUpperCase()));
    $$('#mode-switch button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    const st = totalStats();
    $('#read-stat').textContent = st.done ? `已判 ${st.done} 节 · 共答对 ${st.right}/${st.total}` : '未判分';
  }

  function rerender() {
    renderHead();
    renderLeft();
    renderRight();
  }

  /* ----------------------------- events ----------------------------- */
  document.addEventListener('change', e => {
    const sel = e.target.closest('select[data-q]');
    if (sel) {
      const key = sel.dataset.sec;
      const q = sel.dataset.q;
      const r = rec(key);
      r.answers[q] = sel.value;
      save(key, { answers: r.answers });
      if (sel.classList.contains('blank-sel')) {
        state.activeBlank = q;
        sel.classList.toggle('filled', !!sel.value);
        const ag = document.querySelector(`.answer-grid .ag[data-jump="${q}"]`);
        if (ag) { ag.classList.toggle('on', !!sel.value); ag.querySelector('b').textContent = sel.value || '·'; }
      }
      return;
    }
    const radio = e.target.closest('input[type=radio][data-q]');
    if (radio) {
      const key = radio.dataset.sec;
      const r = rec(key);
      r.answers[radio.dataset.q] = radio.value;
      save(key, { answers: r.answers });
    }
  });

  document.addEventListener('click', e => {
    const tab = e.target.closest('#sec-tabs a');
    if (tab) {
      e.preventDefault();
      sec = tab.dataset.sec;
      updateURL();
      rerender();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const modeBtn = e.target.closest('#mode-switch button');
    if (modeBtn) {
      mode = modeBtn.dataset.mode;
      updateURL();
      rerender();
      return;
    }
    const chip = e.target.closest('.bank-chip');
    if (chip) {
      const key = chip.dataset.sec;
      const letter = chip.dataset.fill;
      const r = rec(key);
      let q = state.activeBlank;
      if (!q) {
        q = String(Array.from({ length: 10 }, (_, i) => i + 26).find(x => !r.answers[x]) || 26);
      }
      const sel = document.querySelector(`.blank-sel[data-q="${q}"]`);
      if (sel) {
        sel.value = letter;
        sel.classList.add('filled');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const jump = document.querySelector(`.answer-grid .ag[data-jump="${q}"]`);
        if (jump) jump.classList.add('on');
        state.activeBlank = Number(q) < 35 ? String(Number(q) + 1) : null;
        const next = document.querySelector(`.blank-sel[data-q="${state.activeBlank}"]`);
        if (next) next.focus();
      }
      return;
    }
    const jump = e.target.closest('.ag[data-jump]');
    if (jump) {
      const sel = document.querySelector(`.blank-sel[data-q="${jump.dataset.jump}"]`);
      if (sel) { sel.focus(); sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    const submit = e.target.closest('[data-submit]');
    if (submit) {
      const key = submit.dataset.submit;
      submitSection(key);
      return;
    }
    const redo = e.target.closest('[data-redo]');
    if (redo) {
      const key = redo.dataset.redo;
      const all = readStore();
      if (all[setId] && all[setId][key]) delete all[setId][key];
      writeStore(all);
      rerender();
      if (window.ODHToast) ODHToast('已清空本节，可以重做');
      return;
    }
    const blank = e.target.closest('.blank-sel');
    if (blank) state.activeBlank = blank.dataset.q;
  });

  function submitSection(key) {
    const s = sections().find(x => x.key === key);
    if (!s) return;
    const r = rec(key);
    let right = 0, total = 0;
    if (s.kind === 'A') {
      total = 10;
      for (let q = 26; q <= 35; q++) if (r.answers[q] && r.answers[q] === s.data.answers[q]) right++;
    } else if (s.kind === 'B') {
      total = 10;
      s.data.statements.forEach(st => { if (r.answers[st.q] && r.answers[st.q] === st.answer) right++; });
    } else {
      total = s.data.questions.length;
      s.data.questions.forEach(q => { if (r.answers[q.q] && r.answers[q.q] === q.answer) right++; });
    }
    save(key, { submitted: true, right, total, answers: r.answers });
    rerender();
    if (window.ODHToast) ODHToast(`本节 ${right}/${total}，正确率 ${total ? Math.round(right / total * 100) : 0}%`);
  }

  function updateURL() {
    const u = new URL(location.href);
    u.searchParams.set('set', setId);
    u.searchParams.set('sec', sec);
    u.searchParams.set('mode', mode);
    history.replaceState(null, '', u);
  }

  /* header/static */
  const setSelect = $('#set-select');
  if (setSelect) {
    setSelect.innerHTML = Object.keys(DATA).sort().reverse().map(id => `<option value="${id}"${id === setId ? ' selected' : ''}>${DATA[id].title}</option>`).join('');
    setSelect.onchange = () => {
      const u = new URL(location.href);
      u.searchParams.set('set', setSelect.value);
      u.searchParams.set('sec', sec);
      u.searchParams.set('mode', mode);
      location.href = u.toString();
    };
  }
  $('#back-reading').href = 'reading.html';
  $('#prev-set').onclick = () => jumpSet(1);
  $('#next-set').onclick = () => jumpSet(-1);
  function jumpSet(dir) {
    const ids = Object.keys(DATA).sort().reverse();
    const i = ids.indexOf(setId);
    const n = ids[i + dir];
    if (!n) return;
    const u = new URL(location.href);
    u.searchParams.set('set', n);
    location.href = u.toString();
  }
  $('#clear-sec').onclick = () => {
    const all = readStore();
    sections().forEach(s => { if (all[setId]) delete all[setId][s.key]; });
    writeStore(all);
    rerender();
    if (window.ODHToast) ODHToast('已清空本页作答');
  };

  rerender();
})();
