// Data contoh (demo) yang deterministik. Semua angka fiktif, hanya untuk mencoba dashboard.
const db = require('./db');
const Calc = require('../shared/calc');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const TITLES = [
  'Urutan manasik umroh hari pertama', '5 kesalahan umum jamaah baru', 'Tips memilih paket umroh untuk orang tua',
  'Checklist perlengkapan umroh 35+', 'Cerita jamaah: umroh bersama keluarga', 'Beda umroh reguler dan plus wisata',
  'Doa saat melihat Kaaba', 'Tanya jawab visa umroh', 'Persiapan fisik sebelum berangkat', 'Wisata halal Turki 9 hari',
  'Tips hemat tanpa mengurangi kenyamanan', 'Panduan miqot untuk pemula', 'Cara menjaga stamina saat tawaf',
  'Kenali travel umroh resmi', 'Yang sering ditanyakan soal cicilan umroh', 'Rute wisata Muslim Jepang',
  'Perlengkapan kesehatan jamaah lansia', 'Jadwal keberangkatan terdekat', 'Mitos dan fakta umroh', 'Tips mengurus paspor'
];
const BASE = { Reel: 6200, Carousel: 2900, Image: 1500 };

function seed(projectId, today) {
  const r = rng(20261124 + projectId);
  const posts = [];
  let i = 0;
  for (let ago = 1; ago <= 100; ago += 2 + Math.floor(r() * 2)) {
    const t = r(); const type = t < 0.4 ? 'Reel' : t < 0.75 ? 'Carousel' : 'Image';
    const factor = 0.45 + r() * 1.9;
    const fresh = ago < 3 ? 0.35 + ago * 0.2 : 1;
    const reach = Math.round(BASE[type] * factor * fresh);
    const views = Math.round(reach * (1.15 + r() * 0.5));
    const likes = Math.round(reach * (0.025 + r() * 0.035));
    const comments = Math.round(likes * (0.03 + r() * 0.07));
    const saves = Math.round(reach * (0.006 + r() * 0.014));
    const shares = Math.round(reach * (0.003 + r() * 0.009));
    let p = { title: TITLES[i % TITLES.length], type, date: Calc.addDays(today, -ago), views, reach, likes, comments, saves, shares,
      interactions: likes + comments + saves + shares };
    if (i % 7 === 3) p.interactions = null;            // total kosong -> dihitung dari 4 komponen
    if (ago > 85) { p.reach = null; p.interactions = null; } // data lama belum lengkap
    if (i === 5) { p.shares = 0; p.interactions = p.likes + p.comments + p.saves; } // contoh nol valid
    posts.push(p); i++;
  }
  db.tx(() => {
    db.run("DELETE FROM posts WHERE project_id=? AND source='demo'", projectId);
    db.run("DELETE FROM snapshots WHERE project_id=? AND source='demo'", projectId);
    posts.forEach((p, k) => db.run(
      'INSERT INTO posts (project_id,source,ext_id,title,type,date,url,views,reach,likes,comments,saves,shares,interactions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      projectId, 'demo', 'demo-' + k, p.title, p.type, p.date, null, p.views, p.reach, p.likes, p.comments, p.saves, p.shares, p.interactions));
    let f = 7640;
    for (let ago = 70; ago >= 0; ago -= 7) { f += Math.round(30 + r() * 50); db.run('INSERT INTO snapshots (project_id,source,date,followers) VALUES (?,?,?,?)', projectId, 'demo', Calc.addDays(today, -ago), f); }
  });
}
module.exports = { seed };
