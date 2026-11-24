# Sosmed Konsultan Ventour — v0.3.0

Dashboard monitoring Instagram untuk satu atau beberapa brand: ringkasan, performa konten, kompetitor, tren,
content planner, laporan PDF, eksperimen, dan lead WhatsApp. Satu aplikasi, tanpa bolak-balik Meta Business Suite dan Google Sheets.

## Status versi

Rilis fondasi v0.3.0 hasil evaluasi baseline v0.2 dan paket Claude. Database saat ini SQLite lokal; Supabase/PostgreSQL belum terpasang. Baca `AUDIT-V0.3.md` dan `CHANGELOG-V0.3.md` sebelum menjalankan.

## Menjalankan (Windows PowerShell)
```powershell
cd sosmed-konsultan-ventour
.\scripts\run.ps1          # npm install otomatis, lalu start
```
Atau manual: `npm install` lalu `npm start`. Buka http://localhost:3000.
Mac/Linux: `./scripts/run.sh`.

**Syarat:** Node.js 22.13 atau lebih baru (memakai `node:sqlite` bawaan, tanpa kompilasi native).

## Android Studio
Pilih **File > Open** lalu buka folder ini. Edit file seperti biasa; jalankan lewat tab **Terminal** (`npm start`).
Plugin Node.js dan JavaScript membantu penyorotan kode. Struktur:

- `server/` backend Express (auth, API, klien Meta, SQLite)
- `shared/calc.js` rumus ER, periode, CSV, insight (dipakai server dan browser, jadi angkanya sama)
- `public/` tampilan (HTML, CSS, JS tanpa build step)
- `test/` tes otomatis (`npm test`)

## Pemakaian pertama
1. Buka aplikasi, **buat akun pertama** (pendaftaran lalu ditutup; buka lagi dengan `ALLOW_REGISTER=true`).
2. Project awal sudah berisi data **Demo** (fiktif) supaya semua fitur bisa dicoba.
3. **Sumber data > Impor CSV** untuk memakai data nyata (template tersedia), atau sambungkan Meta.
4. Isi **Pengaturan** (username IG, nomor WhatsApp format `6281234567890`).

## CSV
Kolom: `title,type,date,views,reach,likes,comments,saves,shares,interactions` (opsional `url`), tanggal `YYYY-MM-DD`.
Sel kosong = data belum tersedia (tampil "–"). Angka `0` = nol yang valid. Pemisah koma atau titik koma.

## Menyambungkan Meta (Instagram API with Facebook Login)
Panduan lengkap ada di menu **Sumber data**. Ringkas:
1. Akun IG Professional terhubung ke Facebook Page.
2. Buat Meta App, tambahkan akun Facebook lo sebagai role di App.
3. Graph API Explorer: buat User Access Token dengan izin `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`.
4. Tempel token di Sumber data. Token dienkripsi (AES-256-GCM) di server dan tidak pernah dikirim balik ke browser.

Kunci enkripsi: `APP_SECRET` (64 hex) atau dibuat otomatis di `data/.secret`. **Backup folder `data/`** (database + kunci); tanpa kunci, token tersimpan tidak bisa dibaca dan harus dimasukkan ulang.

## Hosting
Fitur publish bawaan chat hanya untuk halaman statis, sedangkan aplikasi ini butuh server. Pilihan:
- **Lokal** (paling sederhana, data tetap di laptop lo).
- **Docker** di VPS/Render/Railway/Fly: `docker build -t sosmed .` lalu jalankan dengan volume ke `/data` dan HTTPS di depannya.
  Set `APP_SECRET`, `COOKIE_SECURE=true`, dan biarkan `ALLOW_REGISTER=false`.
- Tanpa volume persisten, database hilang saat container diganti.

## Keamanan
Panggilan Meta hanya dari server; token lewat header (bukan URL); pesan error disaring dari token; cookie sesi HttpOnly + SameSite;
semua data per akun login; header CSP; ekspor CSV aman dari formula injection; batas percobaan login.
