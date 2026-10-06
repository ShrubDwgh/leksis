# Leksis

Ruang kelas digital untuk guru dan siswa. React + Vite (build otomatis oleh Vercel), Supabase untuk Auth, database, dan RLS. Bisa dipasang sebagai PWA. Semua dikelola dari HP: GitHub → Supabase → Vercel.

## Struktur

```
index.html            halaman dasar + tag favicon/manifest
package.json          dependency (Vercel yang menjalankan npm install)
vite.config.js        konfigurasi build
vercel.json           routing SPA (refresh aman) + header keamanan + CSP
supabase.sql          seluruh database, RLS, dan fungsi server
.env.example          nama environment variable
.gitignore
main.jsx  App.jsx     titik masuk + daftar halaman/route
auth.jsx  supabase.js sesi login, klien Supabase
ui.jsx  styles.css    komponen kecil bersama + seluruh CSS
pages/                Auth, Dashboard, Classes, Content, Exams, Account
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
