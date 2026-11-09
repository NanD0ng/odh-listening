/* 汉译英：本地评分 + 可选 OpenAI 兼容 API 精评 */
const DATA = (window.ODH_READING && window.ODH_READING.sets) || {};
const SYN = window.ODH_TRANSYN || {};
const WORDS = window.ODH_WORDS || {};
const WORD_KEYS = Object.keys(WORDS);
const TR_KEY = 'odh.translate.v1';
const AI_KEY = 'odh.ai.v1';
const params = new URLSearchParams(location.search);
const setId = params.get('set') || '';
const mode = params.get('mode') === 'review' ? 'review' : 'practice';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = s => esc(s).replace(/"/g, '&quot;');
const tokenize = t => (window.ODHWordPop ? ODHWordPop.tokenize(t) : esc(t));
const lemma = w => (window.ODHWordPop ? ODHWordPop.lemmaCandidates(w) : [w]);

const SET = setId ? DATA[setId] : null;
const lv = document.getElementById('list-view');
const ev = document.getElementById('editor-view');
if (lv) lv.hidden = !!setId;
if (ev) ev.hidden = !setId;
if (!setId) {
  renderList();
} else if (!SET || !SET.translation) {
  document.body.innerHTML = '<div style="padding:80px 24px;font-family:sans-serif">没有找到这套翻译数据。<a href="translate.html">返回翻译题库</a></div>';
} else {
  window.ODH_PAGE_CTX = { setId, src: 'translate' };
  renderEditor();
}

/* ============================== list ============================== */
function renderList() {
  const ids = Object.keys(DATA).sort((a, b) => b.localeCompare(a));
  const years = [...new Set(ids.map(x => x.split('-')[0]))].sort().reverse();
  let year = 'all';
  const store = trStore();
  function render() {
    $('#tr-years').innerHTML = `<button data-y="all" class="${year === 'all' ? 'on' : ''}">全部</button>` +
      years.map(y => `<button data-y="${y}" class="${year === y ? 'on' : ''}">${y}</button>`).join('');
    const list = ids.filter(id => year === 'all' || id.startsWith(year + '-'));
    $('#tr-list').innerHTML = list.map(id => {
      const d = DATA[id];
      const t = d.translation;
      const rec = store[id] || {};
      const st = rec.submitted ? `<span class="st done">${rec.local ? rec.local.total : '—'} 分 · 已批改</span>`
        : rec.text ? '<span class="st part">有草稿</span>' : '<span class="st">未翻译</span>';
      return `<article class="tr-card">
        <div class="tc-top"><span class="date">${d.date.replace('-', '.')}</span><h3>六级汉译英</h3><span class="setno">第 ${d.set} 套</span></div>
        <div class="tc-prompt">${esc(t.prompt.slice(0, 90))}${t.prompt.length > 90 ? '…' : ''}</div>
        <div class="tc-foot">${st}
          <a class="pill primary" href="translate.html?set=${encodeURIComponent(id)}">开始翻译</a>
          <a class="pill" href="translate.html?set=${encodeURIComponent(id)}&mode=review">对照参考</a>
          <span class="muted">${t.prompt.length} 字</span>
        </div>
      </article>`;
    }).join('') || '<div class="empty-card">这个年份还没有翻译题。</div>';
  }
  $('#tr-years').addEventListener('click', e => {
    const b = e.target.closest('button[data-y]');
    if (!b) return;
    year = b.dataset.y; render();
  });
  const n = ids.length;
  $('#tr-n').textContent = n;
  $('#tr-n2').textContent = n;
  render();
}

/* ============================== editor ============================== */
function renderEditor() {
  const d = SET, t = d.translation;
  const store = trStore();
  const rec = store[setId] || {};
  document.title = d.title + ' · 翻译 · ODH';
  $('#set-title').textContent = d.title;
  $('#set-sub').textContent = `${d.date.replace('-', '.')} · Part IV 汉译英 · 中文 ${t.prompt.length} 字`;
  const sel = $('#tr-set');
  const ids = Object.keys(DATA).sort((a, b) => b.localeCompare(a));
  sel.innerHTML = ids.map(id => `<option value="${id}"${id === setId ? ' selected' : ''}>${DATA[id].title}</option>`).join('');
  sel.onchange = () => location.href = 'translate.html?set=' + encodeURIComponent(sel.value);

  $('#prompt-text').textContent = t.prompt;
  $('#prompt-len').textContent = t.prompt.length + ' 字';
  const ta = $('#answer');
  ta.value = rec.text || '';
  const updateCount = () => {
    const n = countWords(ta.value);
    $('#word-count').textContent = n + ' words';
    $('#save-state').textContent = '';
  };
  ta.addEventListener('input', () => {
    updateCount();
    clearTimeout(ta._timer);
    $('#save-state').textContent = '正在保存…';
    ta._timer = setTimeout(() => {
      saveDraft(ta.value);
      $('#save-state').textContent = '草稿已保存';
      setTimeout(() => { if ($('#save-state')) $('#save-state').textContent = ''; }, 1600);
    }, 700);
  });
  updateCount();
  $('#save-draft').onclick = () => { saveDraft(ta.value); ODHToast('草稿已保存'); };
  $('#submit-tr').onclick = () => {
    const text = ta.value.trim();
    if (countWords(text) < 20) { ODHToast('至少写 20 个英文单词再提交'); ta.focus(); return; }
    const local = scoreTranslation(text, t.reference);
    saveRecord({ text, submitted: true, local, at: Date.now() });
    renderResult(local);
    showRef(true);
    ODHToast('已批改：' + local.total + ' 分');
  };
  $('#show-ref').onclick = () => showRef($('#ref-panel').classList.contains('hide'));
  $('#reset-tr').onclick = () => {
    if (!confirm('清空这份译文和批改结果？')) return;
    const s = trStore(); delete s[setId]; saveTr(s);
    ta.value = ''; updateCount(); renderResult(null); $('#ref-panel').classList.add('hide');
    ODHToast('已清空');
  };
  $('#prev-set').onclick = () => jump(-1);
  $('#next-set').onclick = () => jump(1);
  function jump(dir) { const i = ids.indexOf(setId); const n = ids[i + dir]; if (n) location.href = 'translate.html?set=' + encodeURIComponent(n); }

  renderRef(t.reference);
  if (rec.submitted) renderResult(rec.local);
  else if (rec.text && mode === 'review') renderResult(scoreTranslation(rec.text, t.reference));
  if (mode === 'review') showRef(true);
}

function showRef(on) {
  const p = $('#ref-panel');
  if (!p) return;
  p.classList.toggle('hide', !on);
  $('#show-ref').textContent = on ? '收起参考译文' : '对照参考译文';
}

function renderRef(ref) {
  $('#ref-en').innerHTML = `<div class="ref-en" data-sentence="${attr(ref)}">${tokenize(ref)}</div>`;
  if (window.ODHWordPop) ODHWordPop.refreshMarks();
}

/* ============================== scoring ============================== */
const STOP = new Set(('a an the and or but if nor so than that this these those of to in on at by for with from as is are was were be been being am do does did doing have has had having will would shall should can could may might must not no nor too very more most much many some any all both each few little other such own same just also only even still yet already ever never about into over after before between during without within across through against among per via i you he she it we they me him her us them my your his its our their who whom which what when where why how there here now then today yesterday tomorrow one two three four five six seven eight nine ten').split(' '));

function countWords(text) {
  const m = String(text || '').match(/[A-Za-z][A-Za-z'’-]*/g);
  return m ? m.length : 0;
}
function wordsOf(text) {
  const m = String(text || '').toLowerCase().match(/[a-z][a-z'’-]*/g);
  return m || [];
}
function contentWords(text) {
  return wordsOf(text).filter(w => w.length > 3 && !STOP.has(w));
}
function userLemmaSet(tokens) {
  const s = new Set();
  tokens.forEach(w => { s.add(w); lemma(w).forEach(x => s.add(x)); });
  return s;
}
function refHit(rw, userSet) {
  for (const c of [rw].concat(lemma(rw))) if (userSet.has(c)) return true;
  for (const syn of (SYN[rw] || [])) {
    for (const c of [syn].concat(lemma(syn))) if (userSet.has(c)) return true;
  }
  return false;
}
function splitSentences(ref) {
  return String(ref).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}
function closestWord(w) {
  if (w.length < 4) return '';
  let best = '', bd = 3;
  for (const k of WORD_KEYS) {
    if (k[0] !== w[0]) continue;
    const d = editDistance(w, k);
    if (d < bd) { bd = d; best = k; if (d === 1) break; }
  }
  return best;
}

function scoreTranslation(user, ref) {
  const uWords = wordsOf(user);
  const userSet = userLemmaSet(uWords);
  const refWords = contentWords(ref);
  const uniqRef = [...new Set(refWords)];
  const hitWords = uniqRef.filter(w => refHit(w, userSet));
  const missing = uniqRef.filter(w => !refHit(w, userSet));
  const semantic = uniqRef.length ? Math.round(hitWords.length / uniqRef.length * 100) : 0;

  const issues = [];
  const grammarIssues = [];
  const raw = String(user || '');
  if (/[\u4e00-\u9fa5]/.test(raw)) grammarIssues.push('译文里还留有中文，需要全部译成英文。');
  if (raw.trim() && !/[.!?]["')\]]?$/.test(raw.trim())) grammarIssues.push('全文末尾缺少句号或问号。');
  const sents = raw.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  sents.forEach((s, i) => {
    if (/^[a-z]/.test(s)) grammarIssues.push(`第 ${i + 1} 句开头没有大写。`);
    if (/\b(\w+)\s+\1\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句有重复单词 "${s.match(/\b(\w+)\s+\1\b/i)[0]}"。`);
    if (/\ba\s+(?:[aeio]|u[nm]i|\buser|unique|uniform|union|european)/i.test(s) && !/\ba\s+(?:university|unique|union|uniform|user|usual|european|one|once)\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句 "a" 后面接元音开头词，应改为 "an"。`);
    if (/\ban\s+[^aeiou\s]/i.test(s) && !/\ban\s+(?:hour|honest|honor|honour|heir)\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句 "an" 后面接辅音开头词，应改为 "a"。`);
    if (/\bthere\s+have\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句 "there have" 应为 "there are / there is"。`);
    if (/\bpeople\s+(is|was)\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句 people 是复数，应搭配 are / were。`);
    if (/\bmore\s+better\b|\bmost\s+easiest\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句比较级重复，例如 more better。`);
    if (/\bdiscuss\s+about\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句 discuss 后面不加 about。`);
    if (/\bin\s+the\s+contrary\b/i.test(s)) grammarIssues.push(`第 ${i + 1} 句应为 on the contrary。`);
  });

  const proper = new Set();
  String(raw).match(/\b[A-Z][A-Za-z'-]+\b/g)?.forEach(w => {
    if (raw.indexOf(w) > 0) proper.add(w.toLowerCase());
  });
  const unknown = [];
  const seenUnknown = new Set();
  uWords.forEach(w => {
    if (w.length < 3 || STOP.has(w) || proper.has(w)) return;
    if (userSet.has(w)) return;
    if (seenUnknown.has(w)) return;
    const base = lemma(w).find(x => WORDS[x]);
    if (base) return;
    seenUnknown.add(w);
    const close = closestWord(w);
    unknown.push({ w, close });
  });
  unknown.forEach(x => {
    issues.push({ type: '用词', msg: x.close ? `"${x.w}" 不在词库中，可能是 "${x.close}" 的拼写错误。` : `"${x.w}" 不是常见英文词，请检查拼写或用词。` });
  });
  grammarIssues.forEach(msg => issues.push({ type: '语法', msg }));
  if (missing.length) {
    issues.push({ type: '语义', msg: '这些参考关键词没有在译文中出现：' + missing.slice(0, 10).map(w => '"' + w + '"').join('、') + (missing.length > 10 ? ` 等 ${missing.length} 个` : '') + '。' });
  }

  const refN = countWords(ref);
  const uN = uWords.length;
  const ratio = refN ? uN / refN : 0;
  let lengthScore = 100;
  if (ratio < 0.65) lengthScore = Math.max(20, Math.round(ratio / 0.65 * 100));
  else if (ratio > 1.7) lengthScore = Math.max(40, Math.round(100 - (ratio - 1.7) * 40));
  if (uN < 40) issues.push({ type: '完整度', msg: `译文只有 ${uN} 词，六级段落翻译通常需要 100–180 词。` });

  const grammar = Math.max(0, 100 - grammarIssues.length * 8);
  const wordChoice = Math.max(0, 100 - unknown.length * 8 - missing.length * 1.5);
  const semanticScore = Math.max(0, Math.min(100, semantic + (ratio > .6 && ratio < 1.6 ? 0 : -5)));
  const total = Math.round(semanticScore * .4 + wordChoice * .25 + grammar * .25 + lengthScore * .1);

  const coverage = splitSentences(ref).map((s, i) => {
    const rw = [...new Set(contentWords(s))];
    if (rw.length < 2) return null;
    const hit = rw.filter(w => refHit(w, userSet)).length;
    return { i: i + 1, pct: Math.round(hit / rw.length * 100), n: rw.length };
  }).filter(Boolean);

  return {
    total, semantic: semanticScore, wordChoice, grammar, length: lengthScore,
    words: uN, refWords: refN, issues: issues.slice(0, 12),
    missing: missing.slice(0, 12), coverage,
  };
}

/* ============================== result ============================== */
function renderResult(r) {
  const box = $('#result');
  if (!r) { box.innerHTML = ''; return; }
  const grade = r.total >= 85 ? '优秀' : r.total >= 70 ? '良好' : r.total >= 55 ? '及格' : '需要加强';
  const dim = (name, v) => `<div class="dim"><span>${name}</span><div class="bar"><i style="width:${v}%"></i></div><b>${v}</b></div>`;
  box.innerHTML = `<div class="res-card">
    <div class="res-top">
      <div class="res-score"><b>${r.total}</b><span>/ 100</span></div>
      <div class="res-grade"><strong>${grade}</strong><span>本地规则评分 · ${r.words} 词</span></div>
    </div>
    <div class="dims">
      ${dim('语义覆盖', r.semantic)}
      ${dim('用词准确', r.wordChoice)}
      ${dim('语法', r.grammar)}
      ${dim('完整度', r.length)}
    </div>
    ${r.coverage && r.coverage.length ? `<div class="cov"><h5>逐句意思覆盖</h5>${r.coverage.map(c => `<div class="cov-row"><span>第 ${c.i} 句</span><div class="bar sm"><i style="width:${c.pct}%"></i></div><b>${c.pct}%</b></div>`).join('')}</div>` : ''}
    ${r.issues.length ? `<div class="issues"><h5>需要修改</h5>${r.issues.map(x => `<div class="issue ${x.type === '语法' ? 'g' : x.type === '语义' ? 'm' : 'w'}"><span>${x.type}</span>${esc(x.msg)}</div>`).join('')}</div>` : '<div class="good">没有发现明显问题，表达比较稳。</div>'}
    <div class="ai-row">
      <button class="ai-btn" id="ai-review">AI 精评（可选）</button>
      <span id="ai-state" class="ai-state">${aiCfg().key ? '已配置 API · 会结合参考译文给出更细的语义判断' : '未配置 API · 先填自己的大模型 Key 才能用 AI'}</span>
    </div>
    <div id="ai-result"></div>
  </div>`;
  $('#ai-review').onclick = () => runAI(r);
}
let aiRunning = false;
async function runAI(local) {
  if (aiRunning) return;
  const cfg = aiCfg();
  if (!cfg.key) { openAI(); return; }
  aiRunning = true;
  $('#ai-state').textContent = 'AI 正在批改…';
  $('#ai-review').disabled = true;
  try {
    const res = await callAI(cfg, $('#answer').value.trim(), SET.translation.reference);
    $('#ai-result').innerHTML = renderAI(res);
    saveRecord({ ai: res });
    $('#ai-state').textContent = 'AI 精评完成';
  } catch (e) {
    $('#ai-state').textContent = 'AI 调用失败：' + (e.message || e);
  } finally {
    aiRunning = false;
    const b = $('#ai-review'); if (b) b.disabled = false;
  }
}
function renderAI(a) {
  return `<div class="ai-box">
    <div class="ai-head"><b>AI 精评</b><span>${a.total != null ? a.total + ' 分' : ''}</span></div>
    ${a.revised ? `<div class="ai-rev"><h5>参考改写</h5><p>${esc(a.revised)}</p></div>` : ''}
    ${(a.issues || []).length ? `<div class="issues">${a.issues.map(x => `<div class="issue g"><span>${esc(x.type || '问题')}</span>${esc(x.msg || x)}</div>`).join('')}</div>` : ''}
    ${(a.suggestions || []).length ? `<ul class="ai-list">${a.suggestions.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/* ============================== AI ============================== */
function aiCfg() {
  try { return JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function openAI() {
  const cfg = aiCfg();
  $('#ai-base').value = cfg.base || 'https://api.deepseek.com/v1';
  $('#ai-model').value = cfg.model || 'deepseek-chat';
  $('#ai-key').value = cfg.key || '';
  $('#ai-modal').classList.add('on');
}
async function callAI(cfg, text, ref) {
  const base = String(cfg.base || '').replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  const prompt = `你是大学英语六级（CET6）汉译英阅卷老师。请根据中文原文、参考译文和学生译文，判断语法错误、用词/拼写错误，以及意思是否与原文相近。
只输出 JSON，不要输出其它文字。格式：
{"total":0-100,"meaning":0-100,"grammar":0-100,"wordChoice":0-100,"issues":[{"type":"语法|用词|语义","msg":"具体问题与修改建议"}],"suggestions":["改进建议"],"revised":"一段更地道的参考改写"}
中文原文：${SET.translation.prompt}
参考译文：${ref}
学生译文：${text}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
    body: JSON.stringify({
      model: cfg.model || 'deepseek-chat',
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你是严谨的四六级翻译阅卷老师，按语义、语法、用词三个维度评分。' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + (t ? ' · ' + t.slice(0, 120) : ''));
  }
  const j = await r.json();
  let content = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
  content = String(content).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = content.indexOf('{'), b = content.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('返回内容不是 JSON');
  return JSON.parse(content.slice(a, b + 1));
}

/* ============================== storage ============================== */
function trStore() { try { return JSON.parse(localStorage.getItem(TR_KEY) || '{}'); } catch (e) { return {}; } }
function saveTr(s) { try { localStorage.setItem(TR_KEY, JSON.stringify(s)); } catch (e) {} }
function saveDraft(text) {
  const s = trStore();
  s[setId] = Object.assign({}, s[setId] || {}, { text, at: Date.now() });
  saveTr(s);
}
function saveRecord(patch) {
  const s = trStore();
  s[setId] = Object.assign({}, s[setId] || {}, patch, { at: Date.now() });
  saveTr(s);
}

/* settings modal events */
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('ai-modal');
  if (!modal) return;
  document.getElementById('ai-close').onclick = () => modal.classList.remove('on');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('on'); });
  document.getElementById('ai-save').onclick = () => {
    const cfg = {
      base: document.getElementById('ai-base').value.trim() || 'https://api.deepseek.com/v1',
      model: document.getElementById('ai-model').value.trim() || 'deepseek-chat',
      key: document.getElementById('ai-key').value.trim(),
    };
    localStorage.setItem(AI_KEY, JSON.stringify(cfg));
    modal.classList.remove('on');
    ODHToast('AI 设置已保存到本机');
    if (document.getElementById('ai-state')) {
      document.getElementById('ai-state').textContent = cfg.key ? '已配置 API · 点“AI 精评”开始' : '未配置 API';
    }
  };
  document.getElementById('ai-clear').onclick = () => {
    localStorage.removeItem(AI_KEY);
    modal.classList.remove('on');
    ODHToast('已清除 API 设置');
  };
});
