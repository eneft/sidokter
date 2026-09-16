# Panduan Arsitektur Jembatan Sinkronisasi: Google AI Studio ➔ GitHub ➔ Vercel ➔ Firebase Hosting

Dokumen ini menjelaskan rancangan dan langkah-langkah teknis agar seluruh ekosistem aplikasi **SIDOKTER (RSUD Dr. Soegiri Lamongan)** tersinkronisasi secara otomatis mulai dari lingkungan pengembangan (AI Studio), repositori kode (GitHub), hingga hosting produksi (Vercel & Firebase Hosting).

---

## 1. Topologi Arsitektur Sinkronisasi

```
                ┌──────────────────────────────┐
                │   Google AI Studio Build     │
                │   (Development & Iterasi)    │
                └──────────────┬───────────────┘
                               │
                               │ 1. Export to GitHub / Git Push
                               ▼
                ┌──────────────────────────────┐
                │      GitHub Repository       │
                │   (Branch: main / master)    │
                └──────────────┬───────────────┘
                               │
          ┌────────────────────┴────────────────────┐
          │                                         │
          │ 2a. Vercel GitHub App                   │ 2b. GitHub Actions CI/CD
          │     (Webhook push otomatis)             │     (.github/workflows/firebase-deploy.yml)
          ▼                                         ▼
┌───────────────────────────┐             ┌───────────────────────────┐
│          Vercel           │             │      Firebase Hosting     │
│  (Frontend & Serverless)  │             │   (Frontend & Functions)  │
│  sidokter.vercel.app      │             │  sidokter-soegiri.web.app │
└─────────────┬─────────────┘             └─────────────┬─────────────┘
              │                                         │
              └────────────────────┬────────────────────┘
                                   │
                                   │ 3. Akses Data Real-Time Bersama
                                   ▼
                ┌──────────────────────────────────────┐
                │       Firebase Cloud Platform        │
                │  - Project: sidokter-soegiri         │
                │  - Database Firestore:               │
                │    ai-studio-sidokter-1b8a631d...    │
                │  - Cloud Storage:                    │
                │    sidokter-soegiri.firebasestorage  │
                │  - Cloud Functions (asia-southeast2) │
                │    (authApi, storageApi, hierarchyApi)│
                └──────────────────────────────────────┘
```

---

## 2. Empat Pilar Sinkronisasi

### Pilar 1: Google AI Studio ➔ GitHub
- **Fungsi:** Mengirimkan setiap pembaruan kode, fitur, dan logika dari Google AI Studio ke repositori GitHub.
- **Cara Kerja:**
  1. Di panel atas Google AI Studio, buka menu **Settings / Export** (ikon titik tiga atau menu proyek).
  2. Pilih opsi **Export to GitHub**.
  3. Hubungkan akun GitHub Anda dan pilih repositori tujuan (atau buat repositori baru, misalnya `sidokter-soegiri`).
  4. Setiap selesai melakukan perubahan di AI Studio, lakukan Export kembali ke branch `main`.

---

### Pilar 2: GitHub ➔ Vercel (Frontend & Edge Delivery)
- **Fungsi:** Menyediakan hosting global yang cepat dengan dukungan serverless function (`/api/pdf`, `/api/auth`).
- **Cara Kerja:**
  1. Buka [Vercel Dashboard](https://vercel.com) dan klik **Add New Project**.
  2. Pilih repositori GitHub Anda (`sidokter-soegiri`).
  3. Pengaturan Project Vercel:
     - **Framework Preset:** `Vite`
     - **Build Command:** `npm run build`
     - **Output Directory:** `dist`
  4. Tambahkan Environment Variables di Vercel:
     - `FIREBASE_PROJECT_ID`: `sidokter-soegiri`
     - `AUTH_ALLOWED_ORIGIN`: domain Vercel Anda (misal `https://sidokter-soegiri.vercel.app`)
  5. Klik **Deploy**.
  6. **Hasil:** Setiap kali ada commit baru masuk ke branch `main` di GitHub, Vercel akan otomatis mendeteksi dan mempublikasikan versi terbaru dalam hitungan detik. Berkas `vercel.json` sudah dikonfigurasi untuk meneruskan panggilan `/api/storage`, `/api/hierarchy`, dan `/api/auth` langsung ke backend Firebase.

---

### Pilar 3: GitHub ➔ Firebase Hosting & Cloud Functions (CI/CD Otomatis)
- **Fungsi:** Men-deploy frontend ke `sidokter-soegiri.web.app` sekaligus memperbarui Cloud Functions (`asia-southeast2`), aturan keamanan Firestore (`firestore.rules`), dan Storage (`storage.rules`).
- **File Workflow:** `.github/workflows/firebase-deploy.yml` telah dipasang di repositori ini.
- **Langkah Setup Secret di GitHub (Hanya Perlu Dilakukan Sekali):**
  1. Dapatkan token Firebase CLI:
     - Jalankan perintah berikut di komputer / terminal Anda:
       ```bash
       npm install -g firebase-tools
       firebase login:ci
       ```
     - Browser akan terbuka untuk login Google akun Firebase Anda. Setelah sukses, token panjang akan muncul di terminal.
  2. Masuk ke repositori GitHub Anda:
     - Buka tab **Settings** ➔ **Secrets and variables** ➔ **Actions**.
     - Klik **New repository secret**.
     - Masukkan nama: `FIREBASE_TOKEN`
     - Masukkan nilai token yang didapat dari perintah di atas.
     *(Alternatif: Anda juga bisa menggunakan Service Account JSON key dengan nama secret `FIREBASE_SERVICE_ACCOUNT_SIDOKTER_SOEGIRI`)*.
  3. **Hasil:** Setiap ada push ke `main`, GitHub Actions secara otomatis:
     - Menjalankan instalasi dependensi (root & `functions/`).
     - Memverifikasi kode Cloud Functions.
     - Mem-build aplikasi web Vite (`dist`).
     - Menjalankan `firebase deploy --only functions,hosting,firestore,storage`.

---

### Pilar 4: Sinkronisasi Data Antar-Platform (Single Source of Truth)
- **Mengapa data selalu sinkron?**
  Baik pengguna yang mengakses melalui:
  - **Vercel:** `https://sidokter-xxx.vercel.app`
  - **Firebase Hosting:** `https://sidokter-soegiri.web.app`
  - **Google AI Studio Preview:** `https://ais-dev-xxx.run.app`

  Semuanya membaca dan menulis ke instance database yang sama:
  - **Database ID Firestore:** `ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3`
  - **Cloud Storage:** `sidokter-soegiri.firebasestorage.app`
  - **Cloud Functions:** Region `asia-southeast2`

  Jika ada staf mengunggah SOP baru atau Admin mengubah status verifikasi di Vercel, data tersebut langsung muncul seketika di Firebase Hosting dan AI Studio tanpa jeda.

---

## 3. Checklist Verifikasi Kelancaran Pipeline

1. **Uji Export:** Lakukan export dari AI Studio ke GitHub dan pastikan commit baru muncul di tab `Commits` GitHub.
2. **Uji Vercel:** Buka dashboard Vercel, pastikan status deployment hijau (*Ready*).
3. **Uji GitHub Actions:** Buka tab **Actions** di GitHub, pastikan workflow `Deploy to Firebase (Hosting, Functions, Rules)` berjalan sukses (*Success*).
4. **Uji Akses Multi-Domain:**
   - Login ke akun Admin di domain Vercel.
   - Buat atau ubah satu data (misal draft SOP baru).
   - Buka domain Firebase Hosting (`sidokter-soegiri.web.app`), pastikan data yang sama langsung terlihat.
