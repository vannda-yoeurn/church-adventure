/* =============================================================
   ប្រព័ន្ធសំឡេង — ភ្លេង សំឡេងធម្មជាតិ សំឡេងប្រតិកម្ម និងសំឡេងនិយាយ
   ភ្លេង និងសំឡេងធម្មជាតិទាំងអស់ ត្រូវបានបង្កើតដោយកូដ (Web Audio)
   ដូច្នេះមិនចាំបាច់មានឯកសារសំឡេងទេ។
   សំឡេងនិយាយជាភាសាខ្មែរ៖ ដាក់ឯកសារ MP3 នៅក្នុង audio/voice/
   ហើយសរសេរ id របស់វានៅក្នុង audio/voice/manifest.json
   ============================================================= */
const Sound = (() => {
  let ctx = null, master, musicBus, ambBus, sfxBus, noiseBuf = null;
  const vol = { master: 0.9, music: 0.55, ambient: 0.6, sfx: 0.8, voice: 1 };
  let voiceMode = "auto";              // auto | file | tts | off
  let manifest = new Set();
  let currentVoice = null;

  /* ---------- ចាប់ផ្តើម (ត្រូវហៅក្រោយការចុចដំបូង) ---------- */
  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ctx.createGain(); master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(comp);
    ambBus = ctx.createGain(); ambBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    // សំឡេងរំខាន (noise) សម្រាប់ខ្យល់ ទឹក និងស្គរ
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;           // brown-ish
      d[i] = w * 0.5 + last * 3;
    }
    applyVolumes();
    fetch("audio/voice/manifest.json").then(r => r.ok ? r.json() : []).then(a => {
      if (Array.isArray(a)) manifest = new Set(a);
    }).catch(() => {});
  }

  function setVolumes(v) { Object.assign(vol, v); applyVolumes(); }
  function setVoiceMode(m) { voiceMode = m; }
  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(vol.master, t, 0.05);
    musicBus.gain.setTargetAtTime(vol.music * 0.5, t, 0.05);
    ambBus.gain.setTargetAtTime(vol.ambient * 0.6, t, 0.05);
    sfxBus.gain.setTargetAtTime(vol.sfx * 0.7, t, 0.05);
    if (currentVoice && currentVoice.volume !== undefined) currentVoice.volume = vol.voice;
  }

  /* ---------- ឧបករណ៍ភ្លេង ---------- */
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function env(g, t, a, peak, d, sus, r, len) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
    g.gain.setValueAtTime(Math.max(sus, 0.0001), t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + r);
  }

  // រនាត (mallet) — សំឡេងស្រដៀងរនាតឯក
  function mallet(n, t, len, v, bus) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o2.type = "sine";
    o.frequency.value = midi(n); o2.frequency.value = midi(n) * 3.98;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    o2.connect(g2); g2.connect(g); o.connect(g); g.connect(bus);
    env(g, t, 0.004, v, 0.25, v * 0.15, 0.4, Math.min(len, 0.3));
    o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
  }
  // ខ្លុយ (flute) — មានរំញ័របន្តិច
  function flute(n, t, len, v, bus) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = "triangle"; o.frequency.value = midi(n);
    lfo.frequency.value = 5; lg.gain.value = midi(n) * 0.008;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2200;
    o.connect(f); f.connect(g); g.connect(bus);
    env(g, t, 0.08, v, 0.2, v * 0.7, 0.25, len);
    o.start(t); lfo.start(t); o.stop(t + len + 0.4); lfo.stop(t + len + 0.4);
  }
  // ផ្ទៃខាងក្រោយ (pad)
  function pad(notes, t, len, v, bus) {
    notes.forEach(n => {
      [-6, 6].forEach(det => {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = "sawtooth"; o.frequency.value = midi(n); o.detune.value = det;
        f.type = "lowpass"; f.frequency.value = 900; f.Q.value = 0.5;
        o.connect(f); f.connect(g); g.connect(bus);
        env(g, t, len * 0.3, v / notes.length, len * 0.3, v / notes.length * 0.8, len * 0.3, len * 0.7);
        o.start(t); o.stop(t + len + 0.2);
      });
    });
  }
  function bass(n, t, len, v, bus) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "triangle"; o.frequency.value = midi(n);
    f.type = "lowpass"; f.frequency.value = 600;
    o.connect(f); f.connect(g); g.connect(bus);
    env(g, t, 0.01, v, 0.1, v * 0.6, 0.1, len);
    o.start(t); o.stop(t + len + 0.3);
  }
  function kick(t, v, bus) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.3);
  }
  function noiseHit(t, v, freq, dur, type, bus) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type || "highpass"; f.frequency.value = freq;
    s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // ស្គរដៃ (សំឡេងស្រដៀងស្គរខ្មែរ)
  function drum(t, v, bus, low) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(low ? 110 : 220, t);
    o.frequency.exponentialRampToValueAtTime(low ? 70 : 150, t + 0.12);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.start(t); o.stop(t + 0.25);
  }

  /* ---------- ភ្លេងតាមអារម្មណ៍ ---------- */
  // សំឡេងក្នុងបទ pentatonic (ស្រដៀងបទភ្លេងខ្មែរ)
  const SONGS = {
    title:   { bpm: 66, root: 62, scale: [0, 2, 4, 7, 9], chords: [[0, 7, 12], [-3, 4, 9], [-7, 0, 5], [-5, 2, 7]], lead: "flute", density: 0.55, drums: 0 },
    map:     { bpm: 80, root: 65, scale: [0, 2, 4, 7, 9], chords: [[0, 7, 12], [5, 9, 12], [-3, 4, 9], [-5, 2, 7]], lead: "mallet", density: 0.6, drums: 1 },
    calm:    { bpm: 72, root: 60, scale: [0, 2, 4, 7, 9], chords: [[0, 7, 12], [-3, 4, 9], [5, 9, 12], [-5, 2, 7]], lead: "mallet", density: 0.4, drums: 0 },
    dark:    { bpm: 60, root: 57, scale: [0, 3, 5, 7, 10], chords: [[0, 7, 15], [-4, 3, 8], [-2, 5, 10], [-5, 2, 7]], lead: "flute", density: 0.3, drums: 0 },
    tense:   { bpm: 88, root: 57, scale: [0, 3, 5, 7, 10], chords: [[0, 7, 12], [-2, 5, 10], [-4, 3, 8], [-5, 2, 7]], lead: "mallet", density: 0.45, drums: 1 },
    battle:  { bpm: 138, root: 57, scale: [0, 3, 5, 7, 10], chords: [[0, 7, 12], [-4, 3, 8], [-2, 5, 10], [-5, 2, 7]], lead: "mallet", density: 0.85, drums: 2 },
    boss:    { bpm: 150, root: 55, scale: [0, 1, 5, 7, 8], chords: [[0, 7, 12], [1, 8, 13], [-4, 3, 8], [-5, 2, 7]], lead: "mallet", density: 0.9, drums: 2 },
    ending:  { bpm: 70, root: 62, scale: [0, 2, 4, 7, 9], chords: [[0, 7, 12], [5, 9, 12], [-3, 4, 9], [7, 11, 14]], lead: "flute", density: 0.5, drums: 0 }
  };

  let seq = null;
  function seededMelody(song, seed) {
    let s = seed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const bars = 8, steps = bars * 8, mel = [];
    let deg = 5;
    for (let i = 0; i < steps; i++) {
      if (rnd() < song.density * (i % 2 === 0 ? 1 : 0.6)) {
        deg += Math.floor(rnd() * 5) - 2;
        deg = Math.max(0, Math.min(10, deg));
        mel.push(deg);
      } else mel.push(null);
    }
    // ការបញ្ចប់ឃ្លានីមួយៗនៅលើសំឡេងគោល
    mel[steps - 8] = 5; mel[31] = null; mel[32] = 5;
    return mel;
  }
  const degToNote = (song, d) => song.root + 12 + song.scale[d % 5] + 12 * Math.floor(d / 5) - 12;

  function playMusic(name) {
    if (!ctx) return;
    if (seq && seq.name === name) return;
    stopMusic();
    const song = SONGS[name]; if (!song) return;
    const bus = ctx.createGain(); bus.connect(musicBus);
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    const mel = seededMelody(song, name.length * 977 + song.bpm);
    const stepDur = 60 / song.bpm / 2;          // ប្រាំបីភាគ
    let step = 0, next = ctx.currentTime + 0.1;
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.2) {
        const bar = Math.floor(step / 8) % song.chords.length, inBar = step % 8;
        const ch = song.chords[bar];
        if (inBar === 0) {
          pad(ch.map(c => song.root + c), next, stepDur * 8, 0.22, bus);
          bass(song.root - 12 + ch[0], next, stepDur * 3, 0.35, bus);
        }
        if (song.drums && inBar === 4) bass(song.root - 12 + ch[0] + 7, next, stepDur * 2, 0.25, bus);
        if (song.drums === 2) {
          if (inBar % 4 === 0) kick(next, 0.6, bus);
          if (inBar % 4 === 2) noiseHit(next, 0.25, 1800, 0.12, "bandpass", bus);
          noiseHit(next, 0.06, 7000, 0.04, "highpass", bus);
          if (inBar % 2 === 1) bass(song.root - 12 + ch[0], next, stepDur * 0.8, 0.3, bus);
        } else if (song.drums === 1) {
          if (inBar === 0 || inBar === 5) drum(next, 0.35, bus, true);
          if (inBar === 3 || inBar === 7) drum(next, 0.18, bus, false);
        }
        const d = mel[step % mel.length];
        if (d !== null) {
          const n = degToNote(song, d);
          if (song.lead === "flute") flute(n, next, stepDur * 1.8, 0.16, bus);
          else mallet(n, next, stepDur, 0.22, bus);
        }
        next += stepDur; step++;
      }
    }, 40);
    seq = { name, timer, bus };
  }
  function stopMusic() {
    if (!seq) return;
    clearInterval(seq.timer);
    const b = seq.bus, t = ctx.currentTime;
    b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t);
    b.gain.linearRampToValueAtTime(0.0001, t + 0.8);
    setTimeout(() => b.disconnect(), 1200);
    seq = null;
  }
  // ភ្លេងជ័យជម្នះ (លេងម្តង)
  function fanfare() {
    if (!ctx) return;
    stopMusic();
    const t = ctx.currentTime + 0.05, bus = musicBus;
    const notes = [62, 66, 69, 74, 69, 74, 78, 81];
    notes.forEach((n, i) => mallet(n, t + i * 0.13, 0.3, 0.3, bus));
    pad([62, 66, 69, 74], t + 1.05, 2.2, 0.35, bus);
    flute(81, t + 1.05, 1.6, 0.2, bus);
    [0, 0.26, 0.52, 1.05].forEach(d => drum(t + d, 0.4, bus, true));
  }

  /* ---------- សំឡេងធម្មជាតិ ---------- */
  let amb = [];
  function loopNoise(filterType, freq, q, gainV, lfoRate, lfoDepth, bus) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gainV;
    s.connect(f); f.connect(g); g.connect(bus);
    const nodes = [s];
    if (lfoRate) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = lfoRate; lg.gain.value = lfoDepth;
      l.connect(lg); lg.connect(g.gain); l.start(); nodes.push(l);
    }
    s.start();
    return { stop: () => nodes.forEach(n => { try { n.stop(); } catch (e) {} }) };
  }
  function repeating(fn, minGap, maxGap) {
    let alive = true, to;
    const go = () => { if (!alive) return; fn(ctx.currentTime + 0.02); to = setTimeout(go, (minGap + Math.random() * (maxGap - minGap)) * 1000); };
    to = setTimeout(go, Math.random() * minGap * 1000);
    return { stop: () => { alive = false; clearTimeout(to); } };
  }
  function chirp(t, bus, base) {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), st = t + i * (0.08 + Math.random() * 0.06);
      const f0 = base + Math.random() * 1500;
      o.frequency.setValueAtTime(f0, st);
      o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.8), st + 0.07);
      o.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(0.08, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
      o.start(st); o.stop(st + 0.12);
    }
  }
  function tone(t, bus, f, dur, v, type) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  const AMB = {
    wind:     b => loopNoise("bandpass", 500, 0.6, 0.25, 0.08, 0.18, b),
    water:    b => loopNoise("bandpass", 1300, 1.2, 0.12, 3.3, 0.08, b),
    waves:    b => loopNoise("lowpass", 700, 0.7, 0.3, 0.12, 0.28, b),
    crowd:    b => loopNoise("bandpass", 450, 2, 0.12, 0.3, 0.05, b),
    birds:    b => repeating(t => chirp(t, b, 2600), 1.5, 5),
    jungle:   b => { const a = repeating(t => chirp(t, b, 1800), 0.8, 3);
                     const c = repeating(t => { tone(t, b, 520, 0.35, 0.08); tone(t + 0.45, b, 440, 0.4, 0.08); }, 6, 12);
                     return { stop: () => { a.stop(); c.stop(); } }; },
    owl:      b => repeating(t => { tone(t, b, 380, 0.45, 0.1); tone(t + 0.6, b, 360, 0.7, 0.1); }, 7, 14),
    crickets: b => repeating(t => { for (let i = 0; i < 6; i++) tone(t + i * 0.06, b, 4400, 0.04, 0.03); }, 0.4, 1.2),
    frogs:    b => repeating(t => { const n = 2 + Math.floor(Math.random() * 3);
                     for (let i = 0; i < n; i++) { const o = tone(t + i * 0.18, b, 140 + Math.random() * 60, 0.12, 0.09, "square"); } }, 1, 3.5),
    bells:    b => repeating(t => { [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(t, b, 330 * m, 3 - i * 0.5, 0.05 / (i + 1))); }, 12, 22),
    crows:    b => repeating(t => { for (let i = 0; i < 2; i++) { const o = tone(t + i * 0.3, b, 620, 0.22, 0.05, "sawtooth"); o.frequency.exponentialRampToValueAtTime(380, t + i * 0.3 + 0.2); } }, 6, 15)
  };
  function setAmbient(list) {
    if (!ctx) return;
    stopAmbient();
    const bus = ctx.createGain(); bus.connect(ambBus);
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    amb = (list || []).filter(k => AMB[k]).map(k => AMB[k](bus));
    amb.bus = bus;
  }
  function stopAmbient() {
    if (!ctx) return;
    amb.forEach(a => a.stop());
    if (amb.bus) { const b = amb.bus; b.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5); setTimeout(() => b.disconnect(), 800); }
    amb = [];
  }

  /* ---------- សំឡេងប្រតិកម្ម (SFX) ---------- */
  function sfx(name) {
    if (!ctx) return;
    const t = ctx.currentTime + 0.01, b = sfxBus;
    switch (name) {
      case "select": tone(t, b, 880, 0.08, 0.15, "triangle"); break;
      case "talk":   tone(t, b, 660, 0.05, 0.08, "triangle"); break;
      case "pickup": [72, 76, 79, 84].forEach((n, i) => mallet(n, t + i * 0.07, 0.2, 0.3, b)); break;
      case "correct": mallet(76, t, 0.2, 0.3, b); mallet(83, t + 0.1, 0.3, 0.3, b); break;
      case "wrong":  tone(t, b, 180, 0.35, 0.2, "sawtooth"); break;
      case "hit":    noiseHit(t, 0.5, 1200, 0.15, "bandpass", b); tone(t, b, 300, 0.12, 0.2, "square"); break;
      case "hurt":   tone(t, b, 200, 0.25, 0.25, "sawtooth"); noiseHit(t, 0.3, 400, 0.2, "lowpass", b); break;
      case "heal":   [67, 71, 74, 79].forEach((n, i) => flute(n, t + i * 0.09, 0.3, 0.12, b)); break;
      case "shield": tone(t, b, 520, 0.4, 0.12, "triangle"); tone(t, b, 780, 0.4, 0.08, "sine"); break;
      case "gate":   [60, 64, 67, 72, 76].forEach((n, i) => mallet(n, t + i * 0.1, 0.4, 0.3, b)); break;
      case "levelup": [67, 71, 74, 79, 83, 86].forEach((n, i) => mallet(n, t + i * 0.08, 0.3, 0.3, b)); break;
      case "encounter": tone(t, b, 220, 0.5, 0.2, "sawtooth"); tone(t + 0.15, b, 233, 0.5, 0.2, "sawtooth"); break;
      case "defeat": [64, 60, 57, 52].forEach((n, i) => flute(n, t + i * 0.25, 0.4, 0.15, b)); break;
    }
  }

  /* ---------- សំឡេងនិយាយជាភាសាខ្មែរ ---------- */
  let kmVoice = null;
  function findKhmerVoice() {
    if (!("speechSynthesis" in window)) return null;
    const vs = speechSynthesis.getVoices();
    return vs.find(v => /^km/i.test(v.lang)) || null;
  }
  if ("speechSynthesis" in window) {
    kmVoice = findKhmerVoice();
    speechSynthesis.onvoiceschanged = () => { kmVoice = findKhmerVoice(); };
  }
  function hasTTS() { return !!kmVoice; }

  function duck(on) {
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(vol.music * (on ? 0.18 : 0.5), ctx.currentTime, 0.2);
  }
  function stopVoice() {
    if (currentVoice) { try { currentVoice.pause(); } catch (e) {} currentVoice = null; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    duck(false);
  }
  // id = លេខសម្គាល់ប្រយោគ (ឧ. c01_intro_02)
  function speak(id, text, speaker) {
    stopVoice();
    if (voiceMode === "off" || vol.voice <= 0) return;
    if ((voiceMode === "auto" || voiceMode === "file") && manifest.has(id)) {
      const a = new Audio("audio/voice/" + id + ".mp3");
      a.volume = vol.voice; currentVoice = a; duck(true);
      a.onended = () => duck(false);
      a.play().catch(() => duck(false));
      return;
    }
    if ((voiceMode === "auto" || voiceMode === "tts") && kmVoice) {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = kmVoice; u.lang = kmVoice.lang; u.volume = vol.voice;
      u.rate = 0.95;
      u.pitch = speaker === "teacher" ? 0.85 : speaker === "player" ? 1.15 : speaker === "narr" ? 1 : 0.95 + (speaker.length % 5) * 0.06;
      duck(true); u.onend = () => duck(false);
      speechSynthesis.speak(u);
    }
  }

  return { init, setVolumes, setVoiceMode, playMusic, stopMusic, fanfare, setAmbient, stopAmbient, sfx, speak, stopVoice, hasTTS,
           voiceFileCount: () => manifest.size };
})();
