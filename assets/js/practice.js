/* ODH Listening · practice page */
(function () {
  'use strict';

  const SETS = window.ODH_SETS || {};
  const params = new URLSearchParams(location.search);
  const setId = SETS[params.get('set')] ? params.get('set') : Object.keys(SETS)[0];
  const S = SETS[setId];
  if (!S) {
    document.body.innerHTML = '<div class="empty-state">数据未载入</div>';
    return;
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const audio = $('#audio');
  const storeKey = 'odh.answer.' + setId;

  const state = {
    filter: 'full',          // full | A | B | C
    part: S.parts[0],        // active part object
    q: null,                 // active question
    mode: 'study',           // study | quiz
    answers: loadAnswers(),
    submitted: localStorage.getItem('odh.submitted.' + setId) === '1',
    follow: true,
    mark: true,
    zh: false,
    bounds: false,
    ansQueue: false,
    loopSent: false,
    ab: { a: null, b: null },
    segment: null,
    segmentOwner: null,
    currentSent: null,
  };

  function loadAnswers() {
    try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch (e) { return {}; }
  }
  function saveAnswers() { localStorage.setItem(storeKey, JSON.stringify(state.answers)); }

  /* ------------------------------ helpers ------------------------------ */
  const fmt = t => {
    t = Math.max(0, Math.floor(t || 0));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  };

  function allParts() {
    return state.filter === 'full' ? S.parts : S.parts.filter(p => p.section === state.filter);
  }
  function allQuestions() {
    return allParts().flatMap(p => p.questions.map(q => ({ q, part: p })));
  }
  function partOfNo(no) {
    return S.parts.find(p => no >= p.qFrom && no <= p.qTo);
  }
  function sentences(part) {
    return part.paragraphs.flatMap(pa => pa.sentences);
  }
  function answerRanges(part) {
    return part.questions.map(q => ({
      q,
      start: (q.evidenceStart != null ? q.evidenceStart : q.evidenceSentence),
      end: (q.evidenceEnd != null ? q.evidenceEnd : q.evidenceSentence),
    }));
  }
  function curRange() {
    if (state.filter === 'full') return { start: 0, end: audio.duration || S.duration || 9999 };
    const ps = S.parts.filter(p => p.section === state.filter);
    return { start: ps[0].start, end: ps[ps.length - 1].end };
  }
  function boundsRange() {
    return { start: state.part.start, end: state.part.end };
  }
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 1800);
  }

  /* ------------------------------ render: nav ------------------------------ */
  function renderNav() {
    const box = $('#nav-holder');
    const tabs = `
      <div class="nav-section">
        <h4>范围</h4>
        <div class="filters">
          <button class="ghost-btn ${state.filter === 'full' ? 'on' : ''}" data-filter="full">整卷</button>
          ${S.sections.map(sec => `<button class="ghost-btn ${state.filter === sec.key ? 'on' : ''}" data-filter="${sec.key}">${sec.name}</button>`).join('')}
        </div>
      </div>`;
    let list = '<div class="nav-section"><h4>篇目</h4><div class="partlist">';
    allParts().forEach((p, i) => {
      const type = p.section === 'A' ? '长对话' : (p.section === 'B' ? '听力篇章' : '讲座/讲话');
      list += `<button class="part-item ${state.part === p ? 'on' : ''}" data-part="${p.qFrom}">
        <span class="dot"></span><span class="nm">${p.section}${i + 1} · ${type}</span>
        <span class="qs">Q${p.qFrom}–${p.qTo}</span></button>`;
    });
    list += '</div></div>';
    box.innerHTML = tabs + list;
    $('#left-count').textContent = allQuestions().length + ' 题';
  }

  /* ------------------------------ render: questions ------------------------------ */
  function renderQuestions() {
    const box = $('#qlist');
    let html = '';
    allParts().forEach(p => {
      html += `<div style="font-size:11px;letter-spacing:1.2px;color:var(--muted);padding:8px 4px 2px">SECTION ${p.section} · Q${p.qFrom}–${p.qTo}</div>`;
      p.questions.forEach(q => {
        const sel = state.answers[q.no];
        const okTag = state.submitted
          ? (sel === q.answerKey ? '<span class="tag ok">正确</span>' : (sel ? '<span class="tag bad">错误</span>' : '<span class="tag">未答</span>'))
          : (sel ? `<span class="tag ans">已选 ${sel}</span>` : '');
        const opts = q.options.map(o => {
          let cls = 'opt';
          if (state.mode === 'study') {
            if (o.key === q.answerKey) cls += ' right';
            else if (sel === o.key) cls += ' wrong';
          } else {
            if (sel === o.key) cls += ' sel';
            if (state.submitted && o.key === q.answerKey) cls += ' right';
            if (state.submitted && sel === o.key && sel !== q.answerKey) cls += ' wrong';
          }
          return `<button class="${cls}" data-opt="${o.key}" data-q="${q.no}"><span class="k">${o.key}</span><span>${o.text}</span></button>`;
        }).join('');
        html += `<div class="qcard ${state.q && state.q.no === q.no ? 'on' : ''} ${state.mode === 'study' && state.q && state.q.no === q.no ? 'open' : ''}" data-q="${q.no}" data-part="${p.qFrom}">
          <div class="qtop"><span class="qnum">${q.no}</span><span class="qstem">${q.stem}</span></div>
          <div class="opts">${opts}</div>
          <div class="qfoot">${state.mode === 'study' ? `<span class="tag ans">答案 ${q.answerKey}</span><span class="tag">${q.answerType || ''}</span>` : okTag}
          <button class="jump" data-jump="${q.no}">定位音频 ◷</button></div>
        </div>`;
      });
    });
    box.innerHTML = html || '<div class="empty">本范围暂无题目</div>';
  }

  /* ------------------------------ render: transcript ------------------------------ */
  function renderTranscript() {
    if (state.mode === 'quiz') { $('#transcript').style.display = 'none'; $('#quiz-view').style.display = 'block'; return; }
    $('#transcript').style.display = 'block';
    $('#quiz-view').style.display = 'none';
    refreshUnknownWords();

    const parts = allParts();
    const totalQ = allQuestions();

    let html = '';
    parts.forEach((p, pi) => {
      const ranges = answerRanges(p);
      const type = p.section === 'A' ? '长对话' : (p.section === 'B' ? '听力篇章' : '讲座/讲话');
      html += `<div class="part-block" data-part="${p.qFrom}">
        <div style="display:flex;align-items:center;gap:10px;margin:6px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--line)">
          <span style="font-size:11px;letter-spacing:1.4px;color:var(--muted);font-weight:700">SECTION ${p.section} · ${type} ${pi + 1}</span>
          <span style="font-size:11.5px;color:var(--muted)">Q${p.qFrom}–${p.qTo} · ${fmt(p.start)}</span>
          <button class="ghost-btn" style="margin-left:auto" data-playpart="${p.qFrom}">播放本篇</button>
        </div>`;
      p.paragraphs.forEach(pa => {
        html += `<div class="para" data-part="${p.qFrom}" data-para="${pa.n}">`;
        html += `<p class="en">${pa.speaker ? `<span class="speaker ${pa.speaker}">${pa.speaker}</span><button class="speaker-play" data-play-para="${p.qFrom}:${pa.n}" title="播放 ${pa.speaker} 这段发言" aria-label="播放 ${pa.speaker} 这段发言"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.5 2.4l9.5 5.6-9.5 5.6z"/></svg></button>` : ''}`;
        pa.sentences.forEach(s => {
          const inRange = state.mark && ranges.some(r => s.i >= r.start && s.i <= r.end);
          const badges = state.mark ? ranges.filter(r => r.end === s.i).map(r => r.q) : [];
          html += `<span class="sent ${inRange ? 'answer' : ''}" data-sid="${p.qFrom}:${s.i}" data-start="${s.start}" data-end="${s.end}">` + tokenize(s.text);
          if (badges.length) {
            html += badges.map(q => `<button class="qbadge" data-jump="${q.no}" title="${q.stem}">Q${q.no} · ${q.answerKey}</button>`).join('');
          }
          html += '</span> ';
        });
        html += '</p>';
        if (pa.zh) html += `<p class="zh">${escapeHtml(pa.zh)}</p>`;
        html += '</div>';
      });
      html += '</div>';
    });
    $('#transcript').innerHTML = html;
    syncSegmentUI();
  }

  let unknownWords = new Set();
  function refreshUnknownWords() {
    const u = unknownStore();
    unknownWords = new Set(Object.keys(u).filter(k => !(u[k] && u[k].known)));
  }
  function isUnknownToken(key) {
    if (unknownWords.has(key)) return true;
    for (const c of lemmaCandidates(key)) if (unknownWords.has(c)) return true;
    return false;
  }
  function refreshWordMarks() {
    $$('.word').forEach(el => el.classList.toggle('is-unknown', isUnknownToken(el.dataset.w)));
  }
  function tokenize(text) {
    return escapeHtml(text).replace(/([A-Za-z][A-Za-z'’-]*)/g, m => {
      const key = m.toLowerCase().replace(/’/g, "'");
      return `<span class="word${isUnknownToken(key) ? ' is-unknown' : ''}" data-w="${key}">${m}</span>`;
    });
  }
  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ------------------------------ render: quiz ------------------------------ */
  function renderQuiz() {
    const box = $('#quiz-view');
    const parts = allParts();
    const total = allQuestions();

    let html = '';
    if (state.submitted) {
      const done = total.filter(x => state.answers[x.q.no]);
      const right = total.filter(x => state.answers[x.q.no] === x.q.answerKey);
      const acc = done.length ? Math.round(right.length / done.length * 100) : 0;
      html += `<div class="score-card">
        <div><div class="big">${right.length}<span style="font-size:16px;opacity:.7">/${total.length}</span></div>
        <div class="txt">正确率 ${acc}% · 已作答 ${done.length} 题</div></div>
        <div class="spacer"></div>
        <button id="to-study">进入原文精听 →</button>
        <button id="to-review">错题本</button>
        <button id="reset-quiz">重做</button>
      </div>`;
    } else {
      html += `<div class="quiz-note"><b>作答说明</b>：每题只听一遍，选完后点下方“提交答案”。提交后可切到精听模式，答案会在原文里直接标出。</div>`;
    }
    parts.forEach((p, pi) => {
      const type = p.section === 'A' ? '长对话' : (p.section === 'B' ? '听力篇章' : '讲座/讲话');
      html += `<div class="quiz-part"><h3>Section ${p.section} · ${type} ${pi + 1}</h3>
        <div class="sub">第 ${p.qFrom}–${p.qTo} 题 · ${fmt(p.start)} 开始</div>`;
      p.questions.forEach(q => {
        const sel = state.answers[q.no];
        html += `<div class="qrow" data-q="${q.no}"><div class="line"><span class="no">${q.no}.</span><span class="txt">${q.stem}</span></div><div class="opt-grid">`;
        q.options.forEach(o => {
          let cls = 'opt';
          if (sel === o.key) cls += ' sel';
          if (state.submitted && o.key === q.answerKey) cls += ' right';
          if (state.submitted && sel === o.key && sel !== q.answerKey) cls += ' wrong';
          html += `<button class="${cls}" data-opt="${o.key}" data-q="${q.no}"><span class="k">${o.key}</span><span>${o.text}</span></button>`;
        });
        html += '</div></div>';
      });
      html += '</div>';
    });
    if (!state.submitted) {
      html += `<div class="quiz-actions"><button class="pill primary" id="submit-quiz">提交答案</button>
        <span class="hint">已答 ${allQuestions().filter(x => state.answers[x.q.no]).length} / ${total.length}</span></div>`;
    }
    box.innerHTML = html;
  }

  /* ------------------------------ render: analysis ------------------------------ */
  function renderAnalysis() {
    const q = state.q;
    if (!q) {
      $('#analysis').innerHTML = '<div class="empty">点击左侧任意题目，这里会显示该题的答案定位与解析。</div>';
      $('#an-count').textContent = '';
      return;
    }
    $('#an-count').textContent = 'Q' + q.no;
    if (state.mode === 'quiz' && !state.submitted) {
      $('#analysis').innerHTML = `<div class="a-q">${q.stem}</div><div class="a-zh">${q.stemZh || ''}</div>
        <div class="empty">答题模式下先不显示答案与解析。<br>提交答案后再进入精听模式，就能看到原文里的答案定位。</div>`;
      return;
    }
    const part = partOfNo(q.no);
    const ss = sentences(part);
    const from = (q.evidenceStart != null ? q.evidenceStart : q.evidenceSentence);
    const to = (q.evidenceEnd != null ? q.evidenceEnd : from);
    const ev = ss[from];
    const evText = ss.slice(from, to + 1).map(s => s.text).join(' ');
    $('#analysis').innerHTML = `
      <div class="a-q">${q.stem}</div>
      <div class="a-zh">${q.stemZh || ''}</div>
      <div class="a-answer">
        <span class="letter">${q.answerKey}</span>
        <span class="txt">${q.answerText}${q.answerType ? `<br><span style="opacity:.7">${q.answerType}</span>` : ''}</span>
        <button class="ghost-btn play" data-jump="${q.no}">▶ 播放答案句</button>
      </div>
      <div class="block">
        <h5>原文定位 · ${q.evidencePara || ''} ${ev ? '@' + fmt(ev.start) : ''}</h5>
        <div class="ev-en">${tokenize(evText || q.evidenceEn)}</div>
        <div class="ev-zh">${escapeHtml(q.evidenceZh || '')}</div>
      </div>
      ${q.signal ? `<div class="block"><h5>答案信号</h5><p>${escapeHtml(q.signal)}</p></div>` : ''}
      ${q.sub ? `<div class="block"><h5>同义替换</h5><p>${escapeHtml(q.sub)}</p></div>` : ''}
      ${q.exclude ? `<details class="excl"><summary>错项排除</summary><div class="excl-body">${escapeHtml(q.exclude)}</div></details>` : ''}
    `;
  }

  /* ------------------------------ player ------------------------------ */
  function setupAudio() {
    audio.src = S.audio;
    $('#t-dur').textContent = fmt(S.duration || 0);
  }

  function renderMarkers() {
    const dur = audio.duration || S.duration || 1;
    let html = '';
    S.parts.forEach(p => {
      html += `<div class="marker" style="left:${(p.start / dur) * 100}%" title="Q${p.qFrom} 开始"></div>`;
    });
    if (state.mark) {
      S.parts.forEach(p => p.questions.forEach(q => {
        const ss = sentences(p);
        const ev = ss[q.evidenceStart != null ? q.evidenceStart : q.evidenceSentence];
        if (ev) html += `<div class="marker ans" style="left:${(ev.start / dur) * 100}%" title="Q${q.no} 答案"></div>`;
      }));
    }
    if (state.ab.a != null) html += `<div class="marker ab" style="left:${(state.ab.a / dur) * 100}%" title="A 点 ${fmt(state.ab.a)}"></div>`;
    if (state.ab.b != null) html += `<div class="marker ab" style="left:${(state.ab.b / dur) * 100}%" title="B 点 ${fmt(state.ab.b)}"></div>`;
    $('#markers').innerHTML = html;
  }

  function setPlaying(on) {
    const btn = $('#btn-play');
    btn.innerHTML = on
      ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2.5" width="3.6" height="11"/><rect x="9.4" y="2.5" width="3.6" height="11"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5l9 5.5-9 5.5z"/></svg>';
  }

  function syncSegmentUI() {
    $$('.speaker-play').forEach(btn => btn.classList.toggle('on', btn.dataset.playPara === state.segmentOwner));
  }
  function clearSegment() {
    if (!state.segment && !state.segmentOwner) return;
    state.segment = null;
    state.segmentOwner = null;
    syncSegmentUI();
  }
  function playParagraph(partNo, paraNo) {
    const p = S.parts.find(x => x.qFrom === partNo);
    if (!p) return;
    const pa = p.paragraphs.find(x => x.n === paraNo);
    if (!pa) return;
    const ss = pa.sentences.filter(s => Number.isFinite(s.start) && Number.isFinite(s.end));
    if (!ss.length) return;
    const start = Math.max(0, ss[0].start - 0.06);
    const end = ss[ss.length - 1].end + 0.08;
    if (state.ansQueue) { state.ansQueue = false; ansToken++; $('#btn-ansplay').classList.remove('on'); }
    if (state.loopSent) setLoopSent(false);
    clearAB();
    state.part = p;
    renderNav();
    seek(start);
    state.segment = { start, end };
    state.segmentOwner = p.qFrom + ':' + pa.n;
    syncSegmentUI();
    audio.play().catch(() => {});
    toast(`播放 ${pa.speaker || ''} 这段发言 · ${fmt(start)} – ${fmt(end)}`);
  }

  let pendingSeek = null;
  function seek(t) {
    clearSegment();
    if (!audio.duration) { pendingSeek = t; updateHighlight(true); return; }
    audio.currentTime = Math.min(Math.max(0, t), audio.duration);
    pendingSeek = null;
    updateProgress();
    updateHighlight(true);
  }

  function updateProgress() {
    const dur = audio.duration || S.duration || 1;
    const pct = (audio.currentTime / dur) * 100;
    $('#fill').style.width = pct + '%';
    $('#knob').style.left = pct + '%';
    if (audio.buffered.length) {
      const end = audio.buffered.end(audio.buffered.length - 1);
      $('#buf').style.width = (end / dur) * 100 + '%';
    }
    $('#t-cur').textContent = fmt(audio.currentTime);
  }

  /* ------------------------------ sentence transport ------------------------------ */
  let loopGuardUntil = 0;

  function sentenceList() {
    return allParts().flatMap(p => sentences(p));
  }

  function stepSentence(dir) {
    const list = sentenceList();
    if (!list.length) return;
    const curStart = state.currentSent ? parseFloat(state.currentSent.dataset.start) : audio.currentTime;
    if (dir > 0) {
      const next = list.find(s => s.start > curStart + 0.01);
      if (next) seek(next.start + 0.08);
    } else {
      let prev = null;
      for (const s of list) {
        if (s.start < curStart - 0.01) prev = s;
        else break;
      }
      seek(prev ? prev.start + 0.08 : 0);
    }
  }

  function syncTransportUI() {
    const loopBtn = $('#btn-sent-loop'), abBtn = $('#btn-ab');
    if (!loopBtn || !abBtn) return;
    loopBtn.classList.toggle('on', state.loopSent);
    const a = state.ab.a, b = state.ab.b;
    abBtn.classList.toggle('on', b != null);
    abBtn.classList.toggle('half', a != null && b == null);
    abBtn.textContent = b != null ? 'A-B' : (a != null ? 'A' : 'A-B');
    abBtn.title = b != null
      ? `A ${fmt(a)} · B ${fmt(b)}，再点关闭`
      : (a != null ? `A ${fmt(a)}，播到 B 点后再点` : 'A-B 复读（B）');
  }

  function setLoopSent(on) {
    state.loopSent = !!on;
    if (state.loopSent) {
      clearSegment();
      state.ab = { a: null, b: null };
      state.ansQueue = false;
      ansToken++;
      const ansBtn = $('#btn-ansplay');
      if (ansBtn) ansBtn.classList.remove('on');
    }
    renderMarkers();
    syncTransportUI();
  }

  function clearAB() {
    if (state.ab.a == null && state.ab.b == null) return;
    state.ab = { a: null, b: null };
    renderMarkers();
    syncTransportUI();
  }

  function stepAB() {
    clearSegment();
    const a = state.ab.a, b = state.ab.b, t = audio.currentTime;
    if (b != null) {
      state.ab = { a: null, b: null };
      toast('已关闭 AB 复读');
    } else if (a == null) {
      state.ab.a = t;
      state.loopSent = false;
      toast('A 点已设 ' + fmt(t) + '，播到 B 点后再点 A-B');
    } else if (t <= a + 0.4) {
      state.ab = { a: null, b: null };
      renderMarkers();
      syncTransportUI();
      toast('已取消 A 点');
      return;
    } else {
      state.ab.b = t;
      state.loopSent = false;
      toast('AB 复读：' + fmt(a) + ' – ' + fmt(t));
    }
    renderMarkers();
    syncTransportUI();
  }

  function transportTick() {
    if (state.segment) {
      const end = state.segment.end;
      if (Number.isFinite(end) && audio.currentTime >= end - 0.03) {
        state.segment = null;
        state.segmentOwner = null;
        audio.pause();
        syncSegmentUI();
        updateProgress();
      }
      return;
    }
    if (state.loopSent) {
      if (Date.now() < loopGuardUntil) return;
      const el = state.currentSent;
      if (!el) return;
      const start = parseFloat(el.dataset.start), end = parseFloat(el.dataset.end);
      if (Number.isFinite(start) && Number.isFinite(end) && audio.currentTime >= end - 0.04) {
        loopGuardUntil = Date.now() + 300;
        seek(start + 0.1);
      }
      return;
    }
    const { a, b } = state.ab;
    if (a != null && b != null && audio.currentTime >= b - 0.04) seek(a);
  }

  function findSentence(t) {
    let best = null;
    for (const p of allParts()) {
      for (const s of sentences(p)) {
        if (s.start <= t + 0.001 && (!best || s.start >= best.s.start)) best = { s, p };
      }
    }
    return best;
  }

  let lastUserScroll = 0;
  let lastSentId = '';
  let autoScrollUntil = 0;
  ['wheel', 'touchmove'].forEach(ev => window.addEventListener(ev, () => { lastUserScroll = Date.now(); }, { passive: true }));

  function scrollToSentence(el) {
    const pane = document.getElementById('center');
    if (!pane || !el) return;
    const pr = pane.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const target = pane.scrollTop + (er.top - pr.top) - pane.clientHeight * 0.36;
    autoScrollUntil = Date.now() + 1400;
    pane.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    $('#btn-follow-back').classList.remove('on');
  }

  function updateFollowPill() {
    const pill = $('#btn-follow-back');
    const el = state.currentSent;
    const pane = document.getElementById('center');
    if (!el || !pane || state.mode === 'quiz' || !state.follow) { pill.classList.remove('on'); return; }
    const pr = pane.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const visible = er.bottom > pr.top + 20 && er.top < pr.bottom - 20;
    pill.classList.toggle('on', !visible && document.contains(el));
  }

  function updateHighlight(forceScroll) {
    const hit = findSentence(audio.currentTime);
    if (!hit) return;
    const el = document.querySelector(`.sent[data-sid="${hit.p.qFrom}:${hit.s.i}"]`);
    if (!el) return;
    if (state.currentSent && state.currentSent !== el) state.currentSent.classList.remove('current');
    el.classList.add('current');
    state.currentSent = el;
    const sid = hit.p.qFrom + ':' + hit.s.i;
    const changed = sid !== lastSentId;
    lastSentId = sid;
    const quiet = Date.now() - lastUserScroll > 6000;
    if (state.follow && quiet && (forceScroll || changed)) {
      scrollToSentence(el);
    } else {
      updateFollowPill();
    }
    // keep active part in sync
    if (state.filter === 'full' && hit.p !== state.part) {
      state.part = hit.p;
      renderNav();
    }
  }

  function jumpToQuestion(no, play) {
    const q = findQuestion(no);
    if (!q) return;
    const part = partOfNo(no);
    state.part = part;
    clearAB();
    const ss = sentences(part);
    const from = (q.evidenceStart != null ? q.evidenceStart : q.evidenceSentence);
    const ev = ss[from];
    if (!ev) return;
    if (state.mode === 'quiz') { state.mode = 'study'; syncModeUI(); }
    seek(Math.max(0, ev.start - 0.4));
    const el = document.querySelector(`.sent[data-sid="${part.qFrom}:${from}"]`);
    if (el) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    state.q = q;
    renderQuestions();
    renderAnalysis();
    renderNav();
    if (play) audio.play();
  }

  function findQuestion(no) {
    for (const p of S.parts) for (const q of p.questions) if (q.no === no) return q;
    return null;
  }

  /* ------------------------------ answer playlist ------------------------------ */
  let ansToken = 0;
  async function playAnswerQueue() {
    const token = ++ansToken;
    const list = allQuestions().map(x => x.q);
    for (const q of list) {
      if (token !== ansToken || !state.ansQueue) return;
      const part = partOfNo(q.no);
      const ss = sentences(part);
      const from = (q.evidenceStart != null ? q.evidenceStart : q.evidenceSentence);
      const to = (q.evidenceEnd != null ? q.evidenceEnd : from);
      const ev = ss[from];
      const evEnd = ss[to];
      if (ev) {
        seek(Math.max(0, ev.start - 0.4));
        await audio.play().catch(() => {});
        state.q = q;
        renderQuestions();
        renderAnalysis();
        await waitUntil(audio, Math.min((evEnd ? evEnd.end : ev.end) + 0.3, audio.duration || ev.end), token);
        await sleep(1100);
      }
    }
    if (token === ansToken) {
      state.ansQueue = false;
      $('#btn-ansplay').classList.remove('on');
      toast('答案连播结束');
    }
  }
  function waitUntil(el, t, token) {
    return new Promise(res => {
      const h = () => {
        if (token !== ansToken) { el.removeEventListener('timeupdate', h); res(); return; }
        if (el.currentTime >= t) { el.removeEventListener('timeupdate', h); el.pause(); res(); }
      };
      el.addEventListener('timeupdate', h);
      h();
    });
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ------------------------------ word popover ------------------------------ */
  const pop = $('#pop');
  let popWord = '', popAnchor = null, popCtx = null;
  const WORDS = window.ODH_WORDS || {};
  const UNKNOWN_KEY = 'odh.unknown.v1';
  const cache = {
    get(w) { try { return JSON.parse(localStorage.getItem('odh.word.' + w) || 'null'); } catch (e) { return null; } },
    set(w, v) { try { localStorage.setItem('odh.word.' + w, JSON.stringify(v)); } catch (e) {} }
  };

  function unknownStore() {
    try { return JSON.parse(localStorage.getItem(UNKNOWN_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveUnknown(o) {
    localStorage.setItem(UNKNOWN_KEY, JSON.stringify(o));
    document.dispatchEvent(new CustomEvent('odh-unknown-change'));
  }
  const IRREG = {
    am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    has: 'have', had: 'have', having: 'have',
    does: 'do', did: 'do', done: 'do', doing: 'do',
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
    const key = word.toLowerCase();
    for (const cand of lemmaCandidates(key)) {
      if (WORDS[cand]) return { base: cand, entry: WORDS[cand], exact: cand === key };
    }
    return null;
  }
  function rankSenses(entry, zh) {
    const list = (entry.m || []).map((m, i) => ({ pos: m[0] || '', cn: m[1] || '', i }));
    if (!zh) return list;
    return list.map(s => {
      let score = 0;
      const parts = s.cn.split(/[；;，,、/]/).map(x => x.trim()).filter(Boolean);
      parts.forEach(p => {
        if (p.length >= 2 && zh.includes(p)) score += p.length * 2;
        else {
          const chars = Array.from(p).filter(ch => /[\u4e00-\u9fa5]/.test(ch));
          score += chars.filter(ch => zh.includes(ch)).length * 0.4;
        }
      });
      return { ...s, score };
    }).sort((a, b) => b.score - a.score);
  }

  function popoverPosition(rect, below) {
    const w = pop.offsetWidth || 330, h = pop.offsetHeight || 180;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
    let top = below ? rect.bottom + 10 : rect.top - h - 10;
    if (top < 8) { below = true; top = rect.bottom + 10; }
    if (top + h > window.innerHeight - 8) { below = false; top = Math.max(8, rect.top - h - 10); }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.classList.toggle('below', below);
    pop.style.setProperty('--arrow-x', (rect.left + rect.width / 2 - left) + 'px');
  }

  function openPop(word, rect, ctx) {
    popWord = word;
    popAnchor = rect;
    popCtx = ctx || {};
    pop.classList.add('on');
    const off = offlineLookup(word);
    const shown = off ? off.entry.w : word;
    const rec = unknownStore()[off ? off.base : word.toLowerCase()];
    const count = rec ? rec.count : 0;
    pop.innerHTML = `<div class="pop-head">
        <h4>${escapeHtml(shown)}${off && !off.exact ? `<span class="lemma">原形 · ${escapeHtml(off.base)}</span>` : ''}<span class="ph" id="pop-ph">${off ? escapeHtml(off.entry.p || '') : ''}</span></h4>
        <div class="pop-actions">
          <button class="mo ${count ? 'on' : ''}" id="pop-mo" title="不认识，加入生词库">陌${count ? `<span class="n">${count}</span>` : ''}</button>
          <button class="spk" id="pop-spk" title="发音">🔊</button>
          <button class="close" id="pop-close" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="zh" id="pop-zh">${off ? renderSenses(off.entry, ctx && ctx.zh) : '<div class="skeleton" style="width:60%"></div>'}</div>
      <div class="defs" id="pop-def"></div>
      <div class="online" id="pop-online"><div class="state">${off ? '正在补充英文释义…' : '正在查询在线词典…'}</div></div>
      ${ctx && ctx.sentence ? `<div class="ctx">${highlightWord(ctx.sentence, word)}</div>` : ''}`;
    popoverPosition(rect, false);
    $('#pop-close', pop).onclick = closePop;
    $('#pop-spk', pop).onclick = () => speak(shown);
    $('#pop-mo', pop).onclick = () => addUnknown(off ? off.base : word.toLowerCase(), off);
    lookupOnline(word, off, ctx);
  }

  function renderSenses(entry, zh) {
    const ranked = rankSenses(entry, zh);
    if (!ranked.length) return '<span class="state">离线词库无释义</span>';
    const top = ranked.slice(0, 2);
    const rest = ranked.slice(2);
    let html = '<div class="top-senses">' + top.map(s => `<div class="sense"><span class="pos">${escapeHtml(s.pos)}</span>${escapeHtml(s.cn)}</div>`).join('') + '</div>';
    if (zh) html += '<div class="rank-note">已按当前段落译文排序，其余释义保留在下方</div>';
    if (rest.length) {
      html += '<div class="more">其他释义</div><ul class="more-list">' + rest.map(s => `<li><span class="pos">${escapeHtml(s.pos)}</span>${escapeHtml(s.cn)}</li>`).join('') + '</ul>';
    }
    return html;
  }

  function addUnknown(word, off) {
    const store = unknownStore();
    const rec = store[word] || { count: 0, sets: [], lastAt: 0, sample: null, known: false };
    rec.sets = rec.sets || [];
    if (rec.sets.includes(setId)) {
      if (rec.known) {
        rec.known = false;
        saveUnknown(store);
        unknownWords.add(word);
        refreshWordMarks();
        toast('已重新标记为不认识');
      } else {
        toast('本篇已记录过这个词');
      }
      return;
    }
    rec.count += 1;
    rec.sets.push(setId);
    rec.lastAt = Date.now();
    rec.known = false;
    rec.sample = {
      set: setId,
      part: popCtx.part != null ? popCtx.part : null,
      sid: popCtx.sid != null ? popCtx.sid : null,
      sentence: popCtx.sentence || '',
      zh: popCtx.zh || '',
    };
    store[word] = rec;
    saveUnknown(store);
    unknownWords.add(word);
    refreshWordMarks();
    const btn = $('#pop-mo');
    if (btn) {
      btn.classList.add('on');
      btn.innerHTML = `陌<span class="n">${rec.count}</span>`;
    }
    toast('已加入生词库 · 不认识 ' + rec.count + ' 次');
  }

  function highlightWord(sentence, word) {
    return tokenize(sentence).replace(new RegExp(`data-w="${word.replace(/'/g, "\\'")}"`, 'gi'), `data-w="${word}" style="color:var(--gold);font-weight:700"`);
  }

  async function lookupOnline(word, off, ctx) {
    const cached = cache.get(word.toLowerCase());
    if (cached) { renderOnline(cached, off); return; }
    const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
    const req = url => Promise.race([
      fetch(url).then(r => r.ok ? r.json() : null),
      timeout(8000),
    ]);
    const jobs = [req('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(off ? off.base : word))];
    if (!off) jobs.push(req('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=en%7Czh-CN'));
    const [d, z] = await Promise.allSettled(jobs);
    if (popWord !== word) return;
    const dict = d.status === 'fulfilled' ? d.value : null;
    const zh = z && z.status === 'fulfilled' && z.value ? (z.value.responseData || {}).translatedText : '';
    const cleanZh = zh && zh.trim().toLowerCase() !== word.toLowerCase() ? zh : '';
    const out = { word: off ? off.base : word, phonetic: '', audio: '', zh: cleanZh, defs: [] };
    if (Array.isArray(dict) && dict[0]) {
      out.phonetic = dict[0].phonetic || (dict[0].phonetics || []).find(p => p.text)?.text || '';
      out.audio = (dict[0].phonetics || []).find(p => p.audio)?.audio || '';
      (dict[0].meanings || []).slice(0, 3).forEach(m => {
        (m.definitions || []).slice(0, 2).forEach(dd => out.defs.push({ pos: m.partOfSpeech, text: dd.definition }));
      });
    }
    cache.set(word.toLowerCase(), out);
    renderOnline(out, off);
  }

  function renderOnline(d, off) {
    if (!pop || popWord === '') return;
    if (d.phonetic && !$('#pop-ph', pop).textContent) $('#pop-ph', pop).textContent = d.phonetic;
    if (!off && d.zh) {
      $('#pop-zh', pop).innerHTML = `<div class="sense">${escapeHtml(d.zh)}</div><div class="rank-note">离线词库未收录，以上为在线翻译</div>`;
    } else if (!off && !d.defs.length) {
      $('#pop-zh', pop).innerHTML = '<span class="state">离线词库未收录，在线词典也没有返回释义</span>';
    } else if (!off) {
      $('#pop-zh', pop).innerHTML = '<span class="state">在线词典未返回中文翻译，可参考下方英文释义</span>';
    }
    const box = $('#pop-online', pop);
    if (!box) return;
    if (!d.defs.length && !(d.zh)) {
      box.innerHTML = '<div class="state">在线词典暂未返回结果，可稍后重试</div>';
    } else {
      box.innerHTML = `<div class="more">英文释义 · 在线</div><ul class="more-list">${d.defs.slice(0, 4).map(x => `<li><span class="pos">${escapeHtml(x.pos || '')}</span>${escapeHtml(x.text)}</li>`).join('')}</ul>`;
    }
    pop._audio = d.audio;
    if (popAnchor) popoverPosition(popAnchor, false);
  }

  function speak(word) {
    if (pop._audio) { new Audio(pop._audio).play().catch(() => {}); return; }
    if (window.ODHSpeech) { ODHSpeech.speak(word, { rate: 0.9 }); return; }
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = 0.9;
      speechSynthesis.speak(u);
    }
  }
  function closePop() { pop.classList.remove('on'); popWord = ''; popCtx = null; }

  /* ------------------------------ mode / UI sync ------------------------------ */
  function updateHeader() {
    const parts = allParts();
    const total = allQuestions();
    if (state.mode === 'quiz') {
      $('#part-title').textContent = state.filter === 'full' ? '整卷答题' : ('Section ' + state.filter + ' 答题');
      $('#part-meta').textContent = `${total.length} 题 · 选完后提交查看得分`;
    } else {
      $('#part-title').textContent = state.filter === 'full' ? '整卷原文' : ('Section ' + state.filter + ' 原文');
      $('#part-meta').textContent = `${parts.length} 篇 · ${total.length} 题 · 点击句子跳转，双击连播`;
    }
  }

  function syncModeUI() {
    $$('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
    document.body.classList.toggle('show-zh', state.zh);
    $('#btn-zh').classList.toggle('on', state.zh);
    $('#btn-mark').classList.toggle('on', state.mark);
    $('#btn-follow').classList.toggle('on', state.follow);
    $('#btn-bounds').classList.toggle('on', state.bounds);
    $('#btn-ansplay').classList.toggle('on', state.ansQueue);
    renderTranscript();
    renderQuiz();
    renderQuestions();
    renderAnalysis();
    renderMarkers();
    updateHeader();
  }

  function closeOverlays() {
    document.body.classList.remove('show-nav', 'show-panel');
  }

  function goBack() {
    if (document.body.classList.contains('show-nav') || document.body.classList.contains('show-panel')) {
      closeOverlays();
      return;
    }
    if (document.body.classList.contains('focus')) {
      exitFocus();
      return;
    }
    if (state.mode === 'quiz') {
      state.mode = 'study';
      syncModeUI();
      return;
    }
    if (state.q) {
      state.q = null;
      renderQuestions();
      renderAnalysis();
      return;
    }
    if (history.length > 1) history.back();
    else location.href = 'index.html';
  }

  function setFilter(f) {
    state.filter = f;
    closeOverlays();
    clearAB();
    const ps = allParts();
    state.part = ps[0];
    const keep = state.q && state.q.no >= ps[0].qFrom && state.q.no <= ps[ps.length - 1].qTo;
    state.q = keep ? state.q : ps[0].questions[0];
    renderNav();
    syncModeUI();
    if (state.filter !== 'full') {
      const r = curRange();
      seek(r.start);
    }
  }

  /* ------------------------------ events ------------------------------ */
  $('#mode-seg').addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    state.mode = b.dataset.mode;
    syncModeUI();
  });

  $('.shell').addEventListener('click', e => {
    const jump = e.target.closest('[data-jump]');
    if (jump) { e.preventDefault(); jumpToQuestion(+jump.dataset.jump, true); return; }

    const playPart = e.target.closest('[data-playpart]');
    if (playPart) {
      const p = S.parts.find(x => x.qFrom === +playPart.dataset.playpart);
      clearAB();
      seek(p.start);
      state.part = p;
      renderNav();
      audio.play();
      return;
    }

    const opt = e.target.closest('.opt');
    if (opt) {
      if (state.submitted) return;
      const q = findQuestion(+opt.dataset.q);
      state.answers[q.no] = opt.dataset.opt;
      saveAnswers();
      state.q = q;
      renderQuestions();
      renderQuiz();
      renderAnalysis();
      return;
    }

    const qcard = e.target.closest('.qcard');
    if (qcard) {
      const q = findQuestion(+qcard.dataset.q);
      state.q = q;
      const p = partOfNo(q.no);
      state.part = p;
      renderQuestions();
      renderAnalysis();
      renderNav();
      closeOverlays();
      return;
    }

    const qrow = e.target.closest('.qrow');
    if (qrow) {
      state.q = findQuestion(+qrow.dataset.q);
      state.part = partOfNo(state.q.no);
      renderNav();
      renderAnalysis();
      closeOverlays();
    }
  });

  $('.shell').addEventListener('click', e => {
    const partBtn = e.target.closest('[data-part].part-item');
    if (partBtn) {
      const p = S.parts.find(x => x.qFrom === +partBtn.dataset.part);
      clearAB();
      state.part = p;
      seek(p.start);
      renderNav();
      closeOverlays();
    }
    const filterBtn = e.target.closest('[data-filter]');
    if (filterBtn) setFilter(filterBtn.dataset.filter);
    if (e.target.id === 'submit-quiz') {
      state.submitted = true;
      localStorage.setItem('odh.submitted.' + setId, '1');
      renderQuiz();
      toast('已提交，可切换精听模式查看原文标注');
    }
    if (e.target.id === 'to-study') { state.mode = 'study'; syncModeUI(); }
    if (e.target.id === 'to-review') location.href = 'review.html';
    if (e.target.id === 'reset-quiz') {
      state.answers = {}; state.submitted = false;
      saveAnswers(); localStorage.removeItem('odh.submitted.' + setId);
      try {
        const fixed = JSON.parse(localStorage.getItem('odh.fixed.v1') || '{}');
        Object.keys(fixed).forEach(k => { if (k.startsWith(setId + ':')) delete fixed[k]; });
        localStorage.setItem('odh.fixed.v1', JSON.stringify(fixed));
      } catch (err) {}
      renderQuiz(); renderQuestions();
    }
  });

  // transcript interactions
  $('#transcript').addEventListener('click', e => {
    const playPara = e.target.closest('[data-play-para]');
    if (playPara) {
      e.stopPropagation();
      const [pno, pn] = playPara.dataset.playPara.split(':').map(Number);
      playParagraph(pno, pn);
      return;
    }
    const w = e.target.closest('.word');
    if (w) {
      e.stopPropagation();
      const sent = w.closest('.sent');
      const sText = sent ? sent.dataset.sid : '';
      let sentenceText = '', zhText = '', partNo = null, sid = null;
      if (sText) {
        const [pno, si] = sText.split(':').map(Number);
        partNo = pno;
        sid = si;
        const p = S.parts.find(x => x.qFrom === pno);
        sentenceText = sentences(p)[si]?.text || '';
        const para = sent.closest('.para');
        zhText = para && para.querySelector('.zh') ? para.querySelector('.zh').textContent : '';
      }
      openPop(w.dataset.w, w.getBoundingClientRect(), {
        sentence: sentenceText, zh: zhText, part: partNo, sid: sid,
      });
      return;
    }
    const badge = e.target.closest('.qbadge');
    if (badge) { e.stopPropagation(); jumpToQuestion(+badge.dataset.jump, true); return; }
    const sent = e.target.closest('.sent');
    if (sent) {
      seek(parseFloat(sent.dataset.start));
    }
  });
  $('#transcript').addEventListener('dblclick', e => {
    const sent = e.target.closest('.sent');
    if (sent) { seek(parseFloat(sent.dataset.start)); audio.play(); }
  });

  $('#btn-play').addEventListener('click', () => {
    if (audio.paused) audio.play(); else audio.pause();
  });
  $('#btn-back').addEventListener('click', () => seek(audio.currentTime - 10));
  $('#btn-fwd').addEventListener('click', () => seek(audio.currentTime + 10));
  $('#btn-prev-sent').addEventListener('click', () => stepSentence(-1));
  $('#btn-next-sent').addEventListener('click', () => stepSentence(1));
  $('#btn-sent-loop').addEventListener('click', () => {
    setLoopSent(!state.loopSent);
    toast(state.loopSent ? '单句循环已开启' : '单句循环已关闭');
  });
  $('#btn-ab').addEventListener('click', stepAB);

  $('#track').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - r.left) / r.width;
    seek(pct * (audio.duration || S.duration || 0));
  });

  $('#rate').addEventListener('click', e => {
    const b = e.target.closest('button[data-r]');
    if (!b) return;
    audio.playbackRate = parseFloat(b.dataset.r);
    $$('#rate button').forEach(x => x.classList.toggle('on', x === b));
  });

  $('#btn-zh').addEventListener('click', () => { state.zh = !state.zh; document.body.classList.toggle('show-zh', state.zh); $('#btn-zh').classList.toggle('on', state.zh); });
  $('#btn-mark').addEventListener('click', () => { state.mark = !state.mark; $('#btn-mark').classList.toggle('on', state.mark); renderTranscript(); renderMarkers(); });
  $('#btn-follow').addEventListener('click', () => {
    state.follow = !state.follow;
    $('#btn-follow').classList.toggle('on', state.follow);
    if (state.follow && state.currentSent) scrollToSentence(state.currentSent);
    else updateFollowPill();
  });
  $('#btn-follow-back').addEventListener('click', () => {
    state.follow = true;
    $('#btn-follow').classList.add('on');
    lastUserScroll = 0;
    if (state.currentSent) scrollToSentence(state.currentSent);
  });
  document.getElementById('center').addEventListener('scroll', () => {
    if (Date.now() < autoScrollUntil) return;
    lastUserScroll = Date.now();
    updateFollowPill();
  }, { passive: true });
  $('#btn-bounds').addEventListener('click', () => { state.bounds = !state.bounds; $('#btn-bounds').classList.toggle('on', state.bounds); });
  $('#btn-ansplay').addEventListener('click', () => {
    state.ansQueue = !state.ansQueue;
    $('#btn-ansplay').classList.toggle('on', state.ansQueue);
    if (state.ansQueue) {
      if (state.loopSent) setLoopSent(false);
      clearAB();
      if (state.mode === 'quiz') { state.mode = 'study'; syncModeUI(); }
      playAnswerQueue();
    } else ansToken++;
  });

  function enterFocus() {
    document.body.classList.add('focus');
    syncBackLabel();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }
  function exitFocus() {
    document.body.classList.remove('focus');
    syncBackLabel();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  function syncBackLabel() {
    const focused = document.body.classList.contains('focus');
    $('#btn-go-back').innerHTML = focused ? '←<span class="hide-sm"> 退出专注</span>' : '←<span class="hide-sm"> 返回</span>';
  }
  $('#btn-focus').addEventListener('click', enterFocus);
  $('#btn-focus-exit').addEventListener('click', exitFocus);
  $('#btn-go-back').addEventListener('click', goBack);
  $('#btn-pane-back').addEventListener('click', goBack);
  $('#btn-nav-back').addEventListener('click', goBack);
  $('#btn-nav').addEventListener('click', () => document.body.classList.toggle('show-nav'));
  $('#btn-panel').addEventListener('click', () => document.body.classList.toggle('show-panel'));

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('focus')) {
      document.body.classList.remove('focus');
      syncBackLabel();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeOverlays(); closePop(); if (document.body.classList.contains('focus')) exitFocus(); }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) {
      e.preventDefault();
      if (audio.paused) audio.play(); else audio.pause();
    }
    if (e.key === 'f' || e.key === 'F') enterFocus();
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepSentence(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepSentence(1); }
      if (e.key === 'l' || e.key === 'L') { setLoopSent(!state.loopSent); toast(state.loopSent ? '单句循环已开启' : '单句循环已关闭'); }
      if (e.key === 'b' || e.key === 'B') stepAB();
    }
  });

  audio.addEventListener('timeupdate', () => {
    updateProgress();
    updateHighlight();
    transportTick();
    if (state.bounds) {
      const r = boundsRange();
      if (audio.currentTime >= r.end - 0.05) { audio.pause(); seek(r.end - 0.05); }
      if (audio.currentTime < r.start - 0.05 && !audio.paused) seek(r.start);
    }
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('seeked', () => {
    updateProgress();
    updateHighlight(true);
  });
  audio.addEventListener('loadedmetadata', () => {
    $('#t-dur').textContent = fmt(audio.duration);
    renderMarkers();
    if (pendingSeek != null) {
      audio.currentTime = Math.min(Math.max(0, pendingSeek), audio.duration);
      pendingSeek = null;
      updateProgress();
      updateHighlight(true);
    }
  });
  audio.addEventListener('error', () => toast('音频载入失败，请确认 assets/audio 下的文件存在'));

  document.addEventListener('click', e => {
    if (!e.target.closest('#pop') && !e.target.closest('.word')) closePop();
    if (document.body.classList.contains('show-nav') && !e.target.closest('.pane.left') && !e.target.closest('#btn-nav')) {
      document.body.classList.remove('show-nav');
    }
    if (document.body.classList.contains('show-panel') && !e.target.closest('.pane.right') && !e.target.closest('#btn-panel')) {
      document.body.classList.remove('show-panel');
    }
  });
  window.addEventListener('resize', () => { if (pop.classList.contains('on')) closePop(); });

  /* ------------------------------ boot ------------------------------ */
  $('#crumb-title').textContent = S.title;
  $('.brand small').textContent = 'ENGLISH LISTENING';
  setupAudio();
  syncBackLabel();
  renderNav();
  state.q = S.parts[0].questions[0];
  if (location.hash === '#quiz') state.mode = 'quiz';
  syncModeUI();
  syncTransportUI();
  setPlaying(false);
  const qParam = parseInt(params.get('q'), 10);
  if (qParam && findQuestion(qParam)) jumpToQuestion(qParam, false);
  if (state.filter !== 'full') seek(curRange().start);
})();
