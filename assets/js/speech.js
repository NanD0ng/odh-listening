/* 更自然的英语发音：优先使用在线真人音色，失败时回退到系统语音 */
(function () {
  const synth = window.speechSynthesis;
  let voice = null;
  let current = null;
  let seq = 0;
  const NATURAL = /(Natural|Neural|Aria|Guy|Jenny|Sonia|Ryan|Libby|Evelyn|Andrew|Emma|Brian|Christopher|Eric|Michelle|Roger|Steffan|Samantha|Ava|Allison|Susan|Tom|Alex)/i;

  function refreshVoice() {
    if (!synth) return;
    const vs = synth.getVoices() || [];
    voice = vs.find(v => /en[-_](US|GB)/i.test(v.lang) && NATURAL.test(v.name))
      || vs.find(v => /en[-_]US/i.test(v.lang) && NATURAL.test(v.name))
      || vs.find(v => /en[-_]US/i.test(v.lang))
      || vs.find(v => /^en/i.test(v.lang))
      || null;
  }
  if (synth) { refreshVoice(); synth.onvoiceschanged = refreshVoice; }

  function stop() {
    if (current) {
      try { current.pause(); current.src = ''; } catch (e) {}
      current = null;
    }
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  function tts(text, rate) {
    if (!synth || !text) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate || 0.92;
      u.pitch = 1.02;
      if (voice) u.voice = voice;
      synth.speak(u);
      return true;
    } catch (e) { return false; }
  }

  function speak(text, opts) {
    text = String(text || '').trim();
    if (!text) return;
    opts = opts || {};
    stop();
    const rate = opts.rate || (text.split(/\s+/).length > 2 ? 0.96 : 0.9);
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      tts(text, rate);
    };
    try {
      const url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text.slice(0, 420)) + '&type=' + (opts.uk ? 1 : 2);
      const a = new Audio();
      current = a;
      a.preload = 'auto';
      a.oncanplay = () => {
        if (current !== a) return;
        a.play().then(() => { settled = true; }).catch(fallback);
      };
      a.onerror = fallback;
      a.onended = () => { if (current === a) current = null; };
      a.src = url;
      a.load();
      setTimeout(() => {
        if (!settled && (!current || current === a) && a.readyState < 2) fallback();
      }, 1400);
    } catch (e) {
      fallback();
    }
  }

  window.ODHSpeech = {
    speak,
    speakWord(w) { speak(w, { rate: 0.9 }); },
    speakSentence(s) { speak(s, { rate: 0.96 }); },
    stop,
    tts,
  };
})();
