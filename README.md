# Leksis

Ruang kelas digital untuk guru dan siswa. React + Vite (build otomatis oleh Vercel), Supabase untuk Auth, database, dan RLS. Bisa dipasang sebagai PWA. Semua dikelola dari HP: GitHub → Supabase → Vercel.

## Struktur

```
index.html            halaman dasar + tag favicon/manifest
package.json          dependency (Vercel yang menjalankan npm install)
vite.config.js        konfigurasi build
vercel.json           routing SPA (refresh aman) + header keamanan + CSP
supabase.sql          database dasar (kelas, tugas, ujian) — jalankan PERTAMA
supabase-sekolah.sql  platform sekolah, absensi, ujian aman, branding — jalankan KEDUA
.env.example          nama environment variable
.gitignore
main.jsx  App.jsx     titik masuk + daftar halaman/route
auth.jsx  supabase.js sesi login, klien Supabase
ui.jsx  styles.css    komponen kecil bersama + seluruh CSS
theme.jsx guard.jsx   tema/branding dinamis, komponen <ExamGuard>
pages/                Auth, Dashboard, Classes, Content, Exams, ExamRoom,
                      School (admin), Branding, Academic (jadwal/absensi/ortu), Account
public/               disalin Vite apa adanya ke root situs:
  favicon.ico  favicon.svg  manifest.webmanifest  sw.js
  icons/              icon-16 … icon-512 + 2 maskable
```

`public/` satu-satunya folder tambahan: Vite hanya menyalin file statis (favicon, manifest, sw.js, ikon) ke root situs dari folder ini, sehingga alamatnya tetap `/favicon.ico`, `/sw.js`, `/icons/…`.

## 1. Memasukkan file ke GitHub dari HP

1. Buat repository baru, branch `main`.
2. File teks: **Add file → Create new file**, ketik path lengkap di kolom nama (mis. `pages/Auth.jsx`; tanda `/` otomatis membuat folder), tempel isinya, **Commit changes** langsung ke `main`.
3. File biner (`public/favicon.ico` dan semua PNG di `public/icons/`): gunakan **Add file → Upload files** dari unduhan HP. Agar folder `public/icons/` ada, buat dulu file `public/icons/.gitkeep` (isi satu karakter), buka foldernya di GitHub, lalu Upload files.
4. Jangan commit file `.env`. Key hanya dimasukkan di Vercel.

## 2. Setup Supabase (browser HP)

1. Supabase Dashboard → proyek Anda → **SQL Editor → New query** → tempel seluruh isi `supabase.sql` → **Run**. Aman dijalankan ulang.
2. **Authentication → URL Configuration**: isi *Site URL* dengan alamat Vercel (mis. `https://leksis.vercel.app`) dan tambahkan `https://leksis.vercel.app/**` di *Redirect URLs*. Tanpa ini tautan konfirmasi email dan reset kata sandi tidak kembali ke aplikasi.
3. **Authentication → Providers → Email**: biarkan *Confirm email* aktif untuk produksi (nonaktifkan sementara jika hanya mencoba).
4. **Project Settings → API Keys**: salin **Publishable key** (`sb_publishable_…`). Jangan pernah memakai secret / service_role key di aplikasi ini.

Cek RLS aktif (opsional), jalankan di SQL Editor — semua baris harus `true`:
`select tablename, rowsecurity from pg_tables where schemaname = 'public';`

## 3. Vercel

1. **Add New → Project** → impor repository GitHub.
2. Framework otomatis terdeteksi Vite (build `npm run build`, output `dist`). Tidak perlu diubah.
3. **Environment Variables** (Production, Preview, Development):
   - `VITE_SUPABASE_URL` = `https://zzlhzijogydcyphnnifw.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key dari langkah 2.4
4. **Deploy**. Setiap commit ke `main` otomatis deploy ulang. Jika mengubah environment variable, lakukan **Redeploy**.
5. Alamat Vercel final → masukkan ke Site URL Supabase (langkah 2.2).

## 4. Cara kerja singkat

- Daftar memilih peran **guru** atau **siswa** (disimpan di tabel `profiles`, tidak bisa diubah sendiri setelahnya).
- Guru: buat kelas (kode 6 karakter dibuat server) → materi, tugas, ujian → soal (4 jenis) → publikasikan → periksa hasil, nilai essay, atur kapan nilai tampil.
- Siswa: gabung dengan kode → kerjakan → lihat nilai bila sudah ditampilkan guru.
- Ujian: jawaban disimpan ke server setiap dijawab (refresh tidak menghilangkan jawaban). Batas waktu dan jumlah percobaan dijaga **server**, bukan hanya tampilan. Pilihan ganda, benar/salah, dan jawaban singkat dinilai otomatis di server; essay dinilai guru.

## 5. Ringkasan keamanan

- RLS aktif di 12 tabel. Siswa **tidak punya** hak tulis langsung ke `submissions`, `answers`, `grades` — hanya lewat fungsi server (`start_exam`, `save_answer`, `submit_exam`, `submit_assignment`, `join_class`) yang memeriksa pemilik, peran, jadwal, dan batas waktu.
- Kunci jawaban ada di tabel terpisah `answer_keys`; siswa baru bisa membacanya setelah ujian ditutup (+2 menit), nilai diizinkan tampil, dan ia sudah mengumpulkan. Soal baru terbaca siswa setelah ia memulai pengerjaan.
- Nilai hanya bisa diubah guru kelas terkait lewat `grade_answer`, `grade_submission`, `release_grade`.
- Kolom `role` tidak dapat diubah user (hak update hanya untuk `full_name`).
- Fungsi internal penilaian (`_finalize`, `_recalc_grade`) tidak dapat dipanggil dari aplikasi.
- Frontend hanya memakai URL + publishable key. Teks pengguna dirender sebagai teks (tanpa `dangerouslySetInnerHTML`); tautan dibatasi `http(s)` di database dan di tampilan.
- `vercel.json` memasang CSP ketat (hanya domain sendiri + Supabase), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Service worker hanya menyimpan cache aset milik sendiri; permintaan ke Supabase tidak pernah disentuh.

## 6. Yang perlu Anda ketahui / atur

- **Daftar sebagai guru terbuka untuk siapa saja.** Belum ada verifikasi guru. Jika perlu dibatasi, ubah `handle_new_user` di `supabase.sql` agar semua akun baru menjadi `siswa` dan naikkan peran guru manual dari Table Editor.
- **Email Supabase bawaan dibatasi jumlahnya per jam.** Untuk dipakai banyak pengguna, pasang SMTP sendiri di Authentication → SMTP Settings.
- `join_class` belum dibatasi laju percobaan kode. Kode 6 karakter dengan 32 simbol (≈1 miliar kombinasi) cukup untuk kelas biasa; pertimbangkan pembatasan jika dipakai luas.
- Siswa yang sudah bergabung bisa melihat kode kelasnya (di database); tampilan hanya menunjukkannya ke guru. Buat kode baru dari Edit kelas jika tersebar.
- Mengubah soal setelah ada siswa yang mengerjakan dapat memengaruhi jawaban/nilai lama (aplikasi memberi peringatan).
- Materi berupa teks + tautan. Unggah file (Supabase Storage) belum disertakan.
- Mode offline hanya membuka kerangka aplikasi; data tetap butuh internet.
- Tidak ada fitur hapus akun dari aplikasi (butuh service role di server).
- Untuk memaksa semua perangkat membuang cache lama, naikkan `VERSION` di `public/sw.js`.


---

# Versi 2: platform sekolah, ujian aman, branding

## Urutan setup (tambahan)

1. SQL Editor: jalankan `supabase.sql` (jika belum), lalu **`supabase-sekolah.sql`**. Keduanya aman dijalankan ulang. Akun lama otomatis menjadi `teacher`/`student`.
2. **Database → Extensions → pg_cron**: aktifkan agar ujian yang waktunya habis dikumpulkan otomatis tiap menit (tanpanya, pengumpulan terjadi saat siswa/guru membuka ujian lagi).
3. Bucket `school-assets` (baca publik, maks. 2 MB, png/jpeg/webp) dibuat oleh SQL. Cek di Storage.
4. Jadikan diri Anda **super admin** (pemilik platform) sekali saja, di SQL Editor:
   `update public.profiles set role = 'super_admin' where id = (select id from auth.users where email = 'EMAIL-ANDA');`
   Lalu masuk ulang. Super admin mengatur branding default sekolah baru; **tidak** bisa membaca data kelas/nilai sekolah.
5. Env var tidak berubah. Redeploy Vercel setelah file baru di-commit (CSP kini mengizinkan gambar dari Supabase Storage).

## Peran & alur

| Peran | Cara masuk | Bisa |
|---|---|---|
| Admin sekolah | Daftar → "Admin sekolah" + nama sekolah (membuat sekolah baru) | Semua di sekolahnya: kelas, guru pengampu, tahun ajaran, mapel, jadwal, pengguna, kode undangan, branding |
| Guru | Daftar "Guru" (+ kode guru dari sekolah) | CRUD kelas yang diajar, materi/tugas/ujian, absensi, jadwal, log ujian |
| Siswa | Daftar "Siswa" (+ kode siswa) lalu kode kelas | Belajar, mengerjakan, jadwal, kehadiran, nilai bila dirilis |
| Orang tua | Daftar "Orang tua" lalu masukkan **kode orang tua** dari Profil anak | Hanya-baca: kelas, kehadiran, nilai yang dirilis |
| Super admin | Hanya lewat SQL (langkah 4) | Daftar sekolah, branding default |

Data antar-sekolah terpisah: kelas mewarisi sekolah gurunya, siswa tidak bisa masuk kelas sekolah lain, dan semua tabel dilindungi RLS. Guru tanpa kode sekolah tetap bisa memakai Leksis mandiri (data pribadi, tanpa sekolah).

## Ujian aman (di server)

- **Tanpa Edge Function**: semua logika ada di fungsi Postgres (`start_exam`, `get_exam_questions`, `save_answer`, `exam_ping`, `log_event`, `submit_exam`). Kunci jawaban ada di tabel terpisah dan tidak pernah dikirim. Jawaban benar/salah baru dinilai saat dikumpulkan, jadi siswa tidak bisa "mencoba sampai benar".
- **Acak soal & opsi per siswa**: deterministik (md5 dari siswa+ujian+soal), disimpan di `question_order`/`option_orders`, konsisten walau refresh. Kunci dipetakan ke ID pilihan, bukan huruf A/B/C/D.
- **Timer dari server**: sisa waktu dihitung server, dikirim ulang tiap simpan jawaban dan detak 15 detik. Setelah batas + 30 detik, simpan jawaban ditolak.
- **Simpan otomatis**: pilihan langsung, teks 2 detik setelah berhenti mengetik. Refresh aman (tekan Lanjutkan).
- **Sesi tunggal**: setiap mulai/lanjut membuat token baru; tab/perangkat lama otomatis terkunci. Perangkat berbeda dicatat sebagai pelanggaran `multiple_device`. (Realtime tidak diperlukan; pengecekan terjadi tiap ≤15 detik.)
- **Rate limit** di database: simpan jawaban 90/menit, log 120/menit, ambil soal 30/menit, gabung kelas/sekolah 10/menit.
- **IP & user-agent** disimpan saat mulai. Perubahan IP hanya dicatat (wajar di jaringan seluler); perubahan user-agent dicatat sebagai pelanggaran.
- **Log & risiko**: guru membuka Ujian → *Log & pelanggaran* (timeline per siswa + skor Rendah/Sedang/Tinggi).

## Limitasi anti-curang (jujur)

`<ExamGuard>` hanya mengontrol apa yang bisa dikontrol browser, dan semuanya best-effort:

- **Tangkapan layar HP** (Power+Volume), kamera/HP kedua, rekaman layar eksternal, AI di perangkat lain: **tidak bisa dideteksi**. Untuk blokir screenshot Android sungguhan perlu aplikasi native (Capacitor + FLAG_SECURE).
- PrintScreen/Win+Shift+S sering ditangkap OS sehingga tidak sampai ke halaman. Ctrl+W/T/N **tidak bisa** diblokir browser (hanya konfirmasi tutup tab).
- Deteksi DevTools hanya perkiraan: bisa salah (sidebar browser) dan tidak berlaku di HP.
- Layar penuh tidak didukung iPhone (dilewati) dan harus dimulai dari klik tombol (karena itu ada layar "Mulai").
- Di HP, notifikasi/telepon memicu "blur" dan keyboard mengubah tinggi layar. Karena itu: keluar halaman <3 detik diabaikan, tinggi diabaikan saat mengetik, dan **default tidak ada kumpul otomatis** (guru bisa mengaturnya per ujian, mis. 3 pelanggaran).
- Watermark (Nama - NIS - waktu) membantu melacak kebocoran, tapi tidak mencegahnya.
- Copy/paste/klik kanan diblokir di luar kolom isian; paste hanya boleh di essay.

## Branding

- Admin sekolah: **Sekolah → Branding sekolah** (`/admin/settings/branding`): nama tampilan, slogan, logo, favicon, banner (+posisi), latar login, pesan sambutan, warna (pemilih + hex, dicek kontras), font, mode terang/gelap/ikuti perangkat, kontak, media sosial, footer; pratinjau langsung, pratinjau di seluruh aplikasi, reset ke default, kirim tautan atur ulang kata sandi.
- Halaman masuk berbranding: `/sekolah/<alamat>` (alamat bisa diubah admin).
- Perubahan dicatat di tabel `audit_log` (siapa, kapan, field apa, nilai lama/baru).
- Keputusan desain: **tanpa `custom_css`** (CSS bisa dipakai menyamarkan tampilan dan DOMPurify tidak membersihkan CSS), **tanpa SVG** pada unggahan, dan **font bawaan perangkat** (4 pilihan) agar tidak menambah unduhan dan CSP tetap ketat. Gambar disajikan apa adanya dari Supabase Storage (transformasi/resize otomatis Supabase butuh paket berbayar).
- Batas 10 unggahan/menit hanya diterapkan di tampilan (Storage tidak bisa dibatasi dari Postgres).
- Ikon PWA dan nama aplikasi terpasang tetap "Leksis" (manifest statis tidak bisa per sekolah).

## Belum teruji

Seluruh versi 2 ditulis dan diperiksa sintaks/impor-nya, tetapi **belum dijalankan** di Supabase/Vercel sungguhan. Jika ada error saat menjalankan SQL atau membuka halaman, kirim pesan/screenshot-nya.
