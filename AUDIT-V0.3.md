# Audit & keputusan penggabungan — Sosmed Konsultan Ventour v0.3

Tanggal audit: 24 November 2026

## Keputusan arsitektur

- Kode modular dari paket Claude dijadikan basis utama v0.3: `server/`, `public/`, `shared/`, `test/`.
- Fitur inti yang sebelumnya disepakati pada baseline v0.2 dipertahankan melalui implementasi kandidat Claude: Meta Instagram Insights, Business Discovery, Google Trends RSS Indonesia, CSV, dashboard, kalender/ide, eksperimen, WhatsApp inquiry, dan laporan cetak.
- Rumus kalkulasi bersama di `shared/calc.js` menjadi sumber tunggal untuk server dan browser.
- Penyimpanan v0.3 saat ini adalah SQLite (`node:sqlite`), BUKAN Supabase. Integrasi Supabase belum dikerjakan dan tidak boleh dianggap tersedia.
- Data demo bersifat fiktif dan harus tetap diberi label Demo. Data kosong (`null`) tidak boleh ditampilkan sebagai nol.

## Yang lebih baik dibanding baseline v0.2

1. Pemisahan concern frontend, backend, kalkulasi, dan integrasi Meta.
2. Penyimpanan relasional SQLite dengan foreign key dan indeks.
3. Akun login, sesi tersimpan sebagai hash, data project dibatasi berdasarkan user.
4. Token Meta dienkripsi AES-GCM di server; tidak dikirim kembali ke browser.
5. Proteksi request berbasis header X-Requested-With, CSP, cookie HttpOnly/SameSite, dan pembatasan percobaan login (lihat implementasi server).
6. CSV dengan perlakuan sel kosong vs angka nol dan mitigasi formula injection pada ekspor.
7. Pengujian unit kalkulasi tersedia dan berhasil dijalankan pada audit ini.

## Batasan yang wajib diketahui

- Node.js minimum 22.13 karena memakai `node:sqlite` bawaan.
- Backend memerlukan dependency Express; instalasi dependency belum berhasil pada lingkungan audit karena proses `npm ci` timeout. Karena itu tes API belum dapat dinyatakan lulus.
- Tes `shared/calc.js` berhasil: 12/12.
- Tes Meta live, Business Discovery live, dan Google Trends RSS memerlukan akses jaringan serta kredensial/izin yang sah; belum dibuktikan pada audit ini.
- Database SQLite cocok untuk pengembangan lokal atau satu instance dengan persistent volume. Untuk multi-instance/hosting terkelola, target berikutnya adalah migrasi PostgreSQL Supabase.
- Belum ada migrasi data otomatis dari `private-data.json` v0.2. Jangan menghapus atau menimpa folder/data v0.2 sebelum proses migrasi dibuat dan diuji.
- Demo seed berisi angka fiktif. Hapus/reset demo atau impor data nyata sebelum membuat keputusan bisnis.

## Gerbang sebelum produksi

- [ ] Install dependencies berhasil (`npm ci`).
- [ ] Seluruh tes API dan kalkulasi lulus (`npm test`).
- [ ] Uji login, logout, reset sesi, pembatasan akses antar-user.
- [ ] Uji CSV malformed, formula injection, dan import duplikat.
- [ ] Uji token Meta valid, invalid, expired, permission kurang, dan revoke.
- [ ] Verifikasi versi Graph API dan permission berdasarkan Meta App aktual.
- [ ] Uji backup/restore SQLite dan persistent volume.
- [ ] Migrasi Supabase PostgreSQL + RLS + pemisahan secret server-side.
- [ ] HTTPS, secure cookie, secret management, backup terjadwal, logging aman, dan rate limiting produksi.

## Cara menjalankan

Lihat `README.md`. Gunakan Node.js 22.13 atau lebih baru. Jalankan `npm ci`, lalu `npm test`, kemudian `npm start`.
