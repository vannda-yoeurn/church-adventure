/* =============================================================
   ទំព័របង្កើតសំឡេង (?voices) — Gemini TTS
   - អានឃ្លាទាំងអស់ពី voice-script.csv
   - រំលងឃ្លាដែលមាននៅក្នុង audio/voice/manifest.json រួចហើយ
   - រក្សាទុកសំឡេងដែលបានផលិតក្នុង IndexedDB (បិទ browser ហើយបន្តបាន)
   - Pause / Resume, ព្យាយាមម្តងទៀតពេល Google កំណត់ចំនួន (429)
   - ទាញយក voices.zip = <id>.wav + manifest.json ថ្មី
   ============================================================= */
(() => {
const $ = id => document.getElementById(id);
const kh = n => String(n).replace(/\d/g, d => "០១២៣៤៥៦៧៨៩"[d]);
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/* ---------- ចរិតសំឡេង (speech_metadata) ---------- */
const META_DEFAULT = {
  narr:    { label: "អ្នកនិទាន (Narrator)", voice: "Sulafat", style: "Calm, warm storyteller narrating a historical story, gentle pace" },
  teacher: { label: "លោកគ្រូ វ៉ាន់ដា", voice: "Charon", style: "Kind, wise, gentle older male teacher and pastor, warm and encouraging" },
  player:  { label: "អ្នកលេង", voice: "Puck", style: "Young, curious, energetic youth, bright and sincere" },
  apostle: { label: "សាវក / បិតាព្រះសហគមន៍", voice: "Orus", style: "Strong, mature male voice, steady, reverent and firm" },
  female:  { label: "តួអង្គស្ត្រី", voice: "Kore", style: "Female voice, warm, clear and sincere" },
  boss:    { label: "ពួកស្រមោល (Boss)", voice: "Algenib", style: "Deep, slow, cold and menacing villain voice, dark and echoing" },
  male:    { label: "NPC បុរសផ្សេងៗ", voice: "Iapetus", style: "Ordinary adult male villager, natural conversational tone" }
};
const VOICES = ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];
const APOSTLES = /ពេត្រុស|ប៉ូលីកាប|អ៊ីរេណេ|អាថាណាស|ប៉ាទ្រីក|ហ្វ្រង់ស៊ីស|វីគ្លីហ្វ|ហ៊ូស|លូធើ|កាល់វីន|ទីនដាល|វេស្លេ|ខារី|លោកតា|ព្រះសង្ឃ/;
function defaultCat(spk) {
  if (spk === "អ្នកនិទាន") return "narr";
  if (spk === "លោកគ្រូ វ៉ាន់ដា") return "teacher";
  if (spk === "អ្នកលេង") return "player";
  if (spk === "មេស្រមោល") return "boss";
  if (APOSTLES.test(spk)) return "apostle";
  return "male";
}
const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const meta = Object.assign({}, META_DEFAULT, LS("voices.meta") || {});
const spkCat = LS("voices.spk") || {};
const saveMeta = () => { localStorage.setItem("voices.meta", JSON.stringify(meta)); localStorage.setItem("voices.spk", JSON.stringify(spkCat)); };

/* ---------- IndexedDB ---------- */
let db;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("ca3d-voices", 1); r.onupgradeneeded = () => r.result.createObjectStore("wav"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (mode, fn) => new Promise((res, rej) => { const t = db.transaction("wav", mode); const st = t.objectStore("wav"); const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); });
const dbPut = (id, v) => tx("readwrite", st => st.put(v, id));
const dbAll = () => new Promise(res => { const out = {}; const t = db.transaction("wav"); const c = t.objectStore("wav").openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); }; });
const dbClear = () => tx("readwrite", st => st.clear());

/* ---------- CSV ---------- */
function parseCSV(txt) {
  txt = txt.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.slice(1).filter(r => r[0]).map(r => ({ id: r[0], speaker: r[1], text: r[2] }));
}

/* ---------- WAV ---------- */
function pcmToWav(b64, rate) {
  const bin = atob(b64); const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  const buf = new ArrayBuffer(44 + pcm.length); const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

/* ---------- Gemini TTS ---------- */
async function tts(line) {
  const key = $("key").value.trim(); if (!key) throw { fatal: true, msg: "សូមបញ្ចូល Gemini API Key សិន" };
  const model = $("model").value.trim();
  const cat = spkCat[line.speaker] || defaultCat(line.speaker); const m = meta[cat] || meta.male;
  const prompt = `Read the following text aloud in the Khmer language (ភាសាខ្មែរ), naturally and clearly. Voice direction: ${m.style}. Read only the Khmer text:\n${line.text}`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: m.voice } } } } })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ("HTTP " + r.status);
    if (r.status === 429) {
      const ri = (j.error && j.error.details || []).find(d => d.retryDelay);
      const sec = ri ? parseFloat(ri.retryDelay) : 30;
      throw { retry: true, wait: sec, daily: /per ?day|PerDay|daily/i.test(msg), msg };
    }
    if (r.status === 404 || /not found|not supported/i.test(msg)) throw { fatal: true, msg: "រកមិនឃើញ Model «" + model + "»។ សូមសាកជ្រើស Model ផ្សេង។ (" + msg + ")" };
    if (r.status === 400 && /API key/i.test(msg)) throw { fatal: true, msg: "API Key មិនត្រឹមត្រូវ៖ " + msg };
    if (r.status >= 500) throw { retry: true, wait: 10, msg };
    throw { msg };
  }
  const part = ((j.candidates || [])[0] || {}).content?.parts?.find(p => p.inlineData);
  if (!part) throw { retry: true, wait: 5, msg: "មិនមានសំឡេងក្នុងចម្លើយ" };
  const rate = +((part.inlineData.mimeType || "").match(/rate=(\d+)/) || [0, 24000])[1];
  return { blob: pcmToWav(part.inlineData.data, rate), voice: m.voice, cat };
}

/* ---------- ស្ថានភាព ---------- */
let LINES = [], manifest = new Set(), local = {}, failed = {}, running = false, stopFlag = false, newIds = new Set();
const log = t => { const el = $("log"); el.textContent = `[${new Date().toLocaleTimeString()}] ${t}\n` + el.textContent; };
const status = id => local[id] ? "done" : manifest.has(id) ? "have" : failed[id] ? "fail" : "todo";
const queue = () => LINES.filter(l => !local[l.id] && !($("skip").checked && manifest.has(l.id)));

function renderStats() {
  const total = LINES.length, have = LINES.filter(l => manifest.has(l.id)).length, made = Object.keys(local).length;
  const remain = queue().length, fail = Object.keys(failed).length;
  $("stats").innerHTML = [["សរុប", total], ["មានរួចនៅ GitHub", have], ["បានផលិតក្នុង browser", made], ["នៅសល់", remain], ["បរាជ័យ", fail]].map(([a, b]) => `<div class="stat">${a}<b>${kh(b)}</b></div>`).join("");
  const target = $("skip").checked ? total - have : total;
  $("prog").style.width = (target ? Math.min(100, (target - remain) / target * 100) : 100) + "%";
}
function renderRows() {
  const f = $("filter").value;
  const list = LINES.filter(l => f === "all" || (f === "new" ? newIds.has(l.id) : !manifest.has(l.id)));
  const LBL = { done: "✔ បានផលិត", have: "✔ មានរួច", fail: "✖ បរាជ័យ", todo: "… រង់ចាំ" };
  $("rows").innerHTML = list.map(l => { const s = status(l.id); return `<tr data-id="${l.id}"><td class="id">${l.id}</td><td>${esc(l.speaker)}</td><td>${esc(l.text)}</td><td class="st-${s}">${LBL[s]}${failed[l.id] ? `<div class="small">${esc(failed[l.id])}</div>` : ""}</td>
    <td style="white-space:nowrap">${s === "done" || s === "have" ? `<button data-play="${l.id}">▶</button>` : ""} <button data-redo="${l.id}" title="ផលិតម្តងទៀត">↻</button></td></tr>`; }).join("");
}
function renderMeta() {
  $("meta").innerHTML = Object.entries(meta).map(([k, m]) => `<tr><td>${esc(m.label)}</td><td><select data-mv="${k}">${VOICES.map(v => `<option ${v === m.voice ? "selected" : ""}>${v}</option>`).join("")}</select></td><td><input type="text" data-ms="${k}" value="${esc(m.style)}"></td></tr>`).join("");
  const spks = [...new Set(LINES.map(l => l.speaker))];
  $("spk").innerHTML = spks.map(s => `<tr><td>${esc(s)}</td><td><select data-spk="${esc(s)}">${Object.entries(meta).map(([k, m]) => `<option value="${k}" ${(spkCat[s] || defaultCat(s)) === k ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></td></tr>`).join("");
}
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.mv) { meta[t.dataset.mv].voice = t.value; saveMeta(); }
  if (t.dataset.spk) { spkCat[t.dataset.spk] = t.value; saveMeta(); }
  if (t.id === "filter") renderRows();
  if (t.id === "skip") renderStats();
  if (t.id === "remember" || t.id === "key") { if ($("remember").checked) localStorage.setItem("voices.key", $("key").value); else localStorage.removeItem("voices.key"); }
  if (t.id === "model") localStorage.setItem("voices.model", t.value);
});
document.addEventListener("input", e => { if (e.target.dataset.ms) { meta[e.target.dataset.ms].style = e.target.value; saveMeta(); } });

let player = new Audio();
document.addEventListener("click", async e => {
  const t = e.target;
  if (t.dataset.play) {
    const id = t.dataset.play;
    player.src = local[id] ? URL.createObjectURL(local[id].blob) : "audio/voice/" + id + ".wav"; player.play();
  }
  if (t.dataset.redo) {
    const l = LINES.find(x => x.id === t.dataset.redo); t.disabled = true;
    try { await makeOne(l); } catch (err) { log("✖ " + l.id + " — " + (err.msg || err)); }
    renderRows(); renderStats();
  }
});

async function makeOne(l) {
  const r = await tts(l);
  local[l.id] = { blob: r.blob, text: l.text, speaker: l.speaker, voice: r.voice, date: Date.now() };
  delete failed[l.id];
  await dbPut(l.id, local[l.id]);
  log(`✔ ${l.id} (${r.voice})`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run() {
  if (running) return; running = true; stopFlag = false;
  $("start").disabled = true; $("pause").disabled = false;
  log("ចាប់ផ្តើម… នៅសល់ " + kh(queue().length) + " ឃ្លា");
  while (!stopFlag) {
    const l = queue().find(x => !failed[x.id]) ; if (!l) break;
    try { await makeOne(l); }
    catch (err) {
      if (err.fatal) { log("✖ " + err.msg); break; }
      if (err.retry) {
        if (err.daily) { log("⏸ Google បានកំណត់ចំនួនប្រចាំថ្ងៃហើយ។ សូមបន្តនៅថ្ងៃស្អែក (ចុច ▶ ម្តងទៀត)។"); break; }
        log(`⏳ រង់ចាំ ${Math.ceil(err.wait)} វិនាទី (${err.msg})`); await sleep(err.wait * 1000 + 500); continue;
      }
      failed[l.id] = err.msg || String(err); log("✖ " + l.id + " — " + failed[l.id]);
    }
    renderStats(); renderRows();
    const d = +$("delay").value * 1000; if (d > 0) await sleep(d);
  }
  running = false; $("start").disabled = false; $("pause").disabled = true;
  renderStats(); renderRows();
  if (!queue().length) log("🎉 រួចរាល់! សូមចុច «ទាញយក voices.zip»");
}

async function buildZip(ids, manifestIds, name) {
  const zip = new JSZip();
  ids.forEach(id => zip.file(id + ".wav", local[id].blob));
  zip.file("manifest.json", JSON.stringify([...manifestIds].sort(), null, 1));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
$("zip").onclick = async () => {
  const ids = Object.keys(local).sort(); if (!ids.length) return log("មិនទាន់មានសំឡេងថ្មីទេ");
  await buildZip(ids, new Set([...manifest, ...ids]), "voices.zip"); log("⬇ voices.zip (" + kh(ids.length) + " ឯកសារ)");
};
$("zipParts").onclick = async () => {
  const ids = Object.keys(local).sort(); if (!ids.length) return log("មិនទាន់មានសំឡេងថ្មីទេ");
  const man = new Set(manifest);
  for (let p = 0; p * 90 < ids.length; p++) {
    const part = ids.slice(p * 90, p * 90 + 90); part.forEach(i => man.add(i));
    await buildZip(part, man, `voices-part${p + 1}.zip`); await sleep(800);
  }
  log("⬇ បានទាញយកជាផ្នែករួច");
};
$("start").onclick = run;
$("pause").onclick = () => { stopFlag = true; log("⏸ នឹងផ្អាកក្រោយឃ្លាបច្ចុប្បន្ន"); };
$("test").onclick = async () => {
  const l = queue()[0] || LINES[0]; log("🔈 សាកល្បង " + l.id);
  try { const r = await tts(l); player.src = URL.createObjectURL(r.blob); player.play(); log("✔ សាកល្បងបានជោគជ័យ (" + r.voice + ")"); }
  catch (err) { log("✖ " + (err.msg || err)); }
};
$("clear").onclick = async () => { if (!confirm("លុបសំឡេងទាំងអស់ដែលបានផលិតហើយរក្សាក្នុង browser នេះ?")) return; await dbClear(); local = {}; renderStats(); renderRows(); };

/* ---------- ចាប់ផ្តើម ---------- */
(async () => {
  $("key").value = localStorage.getItem("voices.key") || ""; $("remember").checked = !!$("key").value;
  if (localStorage.getItem("voices.model")) $("model").value = localStorage.getItem("voices.model");
  db = await idb(); local = await dbAll();
  const [csv, man] = await Promise.all([
    fetch("voice-script.csv", { cache: "no-cache" }).then(r => r.text()),
    fetch("audio/voice/manifest.json", { cache: "no-cache" }).then(r => r.json()).catch(() => [])
  ]);
  LINES = parseCSV(csv); manifest = new Set(man);
  LINES.forEach(l => { if (/^(tut_|g_)|_(area|quest|bossp2|bossp3|bossfall|clear)_\d\d$/.test(l.id)) newIds.add(l.id); });
  renderMeta(); renderStats(); renderRows();
  log(`ផ្ទុក ${kh(LINES.length)} ឃ្លា · មានសំឡេងរួច ${kh(manifest.size)} · ក្នុង browser ${kh(Object.keys(local).length)}`);
})();
})();
