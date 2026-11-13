/* បង្កើតបញ្ជីប្រយោគសម្រាប់ថតសំឡេង (voice-script.csv)
   របៀបប្រើ៖  node tools/make-voice-script.js
   ក្រោយថតរួច ដាក់ឯកសារ MP3 ឈ្មោះតាម id (ឧ. c01_peter_00.mp3) ក្នុង audio/voice/
   រួចរត់៖   node tools/make-voice-script.js --manifest
   ដើម្បីធ្វើបច្ចុប្បន្នភាព audio/voice/manifest.json ដោយស្វ័យប្រវត្តិ */
const fs = require("fs"), path = require("path");
const D = require("../js/data.js");
const root = path.join(__dirname, "..");
const who = k => k === "narr" ? "អ្នកនិទាន" : k === "teacher" ? "លោកគ្រូ វ៉ាន់ដា" : k === "player" ? "អ្នកលេង" : k === "boss" ? "មេស្រមោល" :
  (D.CHAPTERS.flatMap(c => c.npcs).find(n => n.id === k) || { name: k }).name;
if (process.argv.includes("--manifest")) {
  const dir = path.join(root, "audio", "voice");
  const ids = fs.readdirSync(dir).filter(f => f.endsWith(".mp3")).map(f => f.slice(0, -4)).sort();
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(ids, null, 1));
  console.log("manifest.json: " + ids.length + " ឯកសារ");
} else {
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const rows = ["id,អ្នកនិយាយ,អត្ថបទ"].concat(D.allVoiceLines().map(l => [l.id, who(l.speaker), l.text.replace(/\{name\}/g, "មិត្តអើយ")].map(q).join(",")));
  fs.writeFileSync(path.join(root, "voice-script.csv"), "﻿" + rows.join("\n"));
  console.log("voice-script.csv: " + (rows.length - 1) + " ប្រយោគ");
}
