# 📈 BGY (Beli Ga Ya?) - Mesin Valuasi Saham AI

Aplikasi web intelijen pintar (_intelligent web app_) untuk membedah data fundamental dan sentimen analisis saham-saham di Bursa Efek Indonesia (IDX). Aplikasi ini menggabungkan kekuatan pencarian internet _real-time_ dari **Google Gemini** dan klasifikasi Natural Language Processing (NLP) dari **Hugging Face** untuk memberikan wawasan investasi pragmatic hanya dalam hitungan detik.

---

## ✨ Fitur Utama

1. **Auto-Suggest Emiten Saham:** Daftar tarik-turun (dropdown) prediktif untuk berbagai saham unggulan Indonesia (seperti BBCA, TLKM, GOTO, dll).
2. **Ekstraksi Metrik Fundamental Cerdas:** Menemukan Harga Pasar (Market Price), *Book Value per Share* (BVPS), dan P/BV ratio secara instan.
3. **Penilaian Fair/Over/Undervalued Otomatis:** Memberikan indikator status harga saham berdasarkan rentang P/BV ratio.
4. **Sintesis Logika AI (Analisis Kualitatif):** Gemini menghasilkan paragraf wawasan yang merangkum poin positif, perbandingan sektor, dan risiko.
5. **Klasifikasi Sentimen Bahasa Indonesia:** Model AI NLP tersendiri turun tangan untuk mengevaluasi teks analitis dan melabelinya sebagai sentimen **Positif**, **Netral**, atau **Negatif** (lengkap dengan persentase _confidence score_).
6. **Antarmuka Finansial Modern (Fancy Green):** UI bertema mode gelap dengan aksen hijau zamrud elegan (Emerald 500) yang merepresentasikan pertumbuhan dan finansial.

---

## 🛠️ Tumpukan Teknologi (Tech Stack)

*   **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons.
*   **Backend / Proxy:** Node.js, Express.js (sebagai jembatan aman untuk menghindari kendala antarkomunikasi *CORS* pada Hugging Face).
*   **AI Engine 1 (Data & Analisis):** `@google/genai` (Model: `gemini-3-flash-preview` dengan kolam data `googleSearch` Grounding).
*   **AI Engine 2 (Sentimen NLP):** `@huggingface/inference` (Model: `mdhugol/indonesia-bert-sentiment-classification`).
*   **Lingkungan & Build:** `dotenv`, `tsx` (untuk server kompilasi typescript).

---

## 🧠 Rahasia di Balik Layar: Bagaimana Kami Mendapatkan nilai BVPS dan P/BV?

Salah satu tantangan membuat aplikasi finansial gratis adalah bahwa API data saham terstruktur dari bursa asli (seperti Bloomberg atau IDX) berbiaya sangat mahal. Aplikasi kita menggunakan pendekatan mutakhir untuk mengatasi ini: **Google Search Grounding Reasoning.**

Berikut adalah tahapan AI mendapatkan angka-angka akurat tersebut:

1. **Formulasi Perintah (Prompt Engineering):** Saat pengguna memasukkan sandi "BBCA", aplikasi menanamkan prompt tersembunyi berbunyi: _"Bertindaklah sebagai data engineer. Cari data saham fundamental terkini untuk BBCA.JK di internet. Cari Harga Saham, Book Value per Share (BVPS), dan P/BV ratio."_
2. **Koneksi Internet Real-Time (Web Scraping Aktif):** Berkat ekstensi `tools: [{ googleSearch: {} }]`, Gemini tidak menjawab menggunakan ingatan basis datanya yang lawas. Model akan otomatis meluncur ke internet detik itu juga, membaca situs seperti CNBC Indonesia, Stockbit, atau IDNFinancials, dan menarik angka terbarunya.
3. **Penalaran Matematika (Fallback Calculation):** Kita tidak bisa terus mengandalkan artikel berita yang mencantumkan "PBV". Oleh karena itu, kita memberikan instruksi cerdas di prompt: _"Jika Anda tidak menemukan ratio P/BV, hitung sendiri menggunakan rumus: **Harga Saat Ini / BVPS**"_. Jika AI menemukan Harga BBCA = Rp 10.000 dan BVPS = Rp 2.000, AI akan membaginya sendiri dan menyimpulkan = 5.0x.
4. **Pembungkusan Parsing (Strict JSON):** Respon tersebut dipaksa dicitrakan keluar sebagai `Valid JSON` mentah. Format data inilah yang kemudian ditangkap kode React kita, dan diubah secara visual menjadi _Card_ Antarmuka (kotak UI) elegan di layar pengguna.

---

## 🚀 Instalasi & Cara Penggunaan

### 📦 Prasyarat
- **Node.js** v18+ dan **npm** (sudah terpasang di mesin Anda)
- **Akun Google** (untuk mendapatkan Gemini API Key gratis di [Google AI Studio](https://aistudio.google.com))
- **Akun Hugging Face** (gratis, untuk mendapatkan HF_TOKEN di [huggingface.co](https://huggingface.co/settings/tokens))

### ⚙️ Langkah-Langkah Instalasi

#### 1. Persiapkan Ruang Kerja
Clone repositori atau ekstrak folder aplikasi, kemudian buka terminal di folder root project:
```bash
cd BeliGaYa-
```

#### 2. Instalasi Semua Package Dependensi
Jalankan perintah berikut untuk mengunduh dan memasang semua paket yang diperlukan:
```bash
npm install
```

#### 3. Konfigurasi Environment Variables
Buat file `.env` di root folder project (sejajar dengan `package.json`):
```env
# .env
GEMINI_API_KEY="AIzaSy...masukkan_kunci_gemini_anda_di_sini"
HF_TOKEN="hf_...masukkan_token_huggingface_anda_di_sini"
```

**Cara mendapatkan kunci:**
- **GEMINI_API_KEY:** Buka https://aistudio.google.com → "Get API Key" → Copy key dan paste di `.env`
- **HF_TOKEN:** Buka https://huggingface.co/settings/tokens → "New token" (read-only) → Copy dan paste di `.env`

> ⚠️ **Penting:** Jangan commit file `.env` ke Git. File ini sudah terdaftar di `.gitignore`.

#### 4. Jalankan Aplikasi Development
```bash
npm run dev
```

Setelah command ini berjalan, Anda akan melihat:
```
➜  Local:   http://localhost:5173/
➜  Server:  http://localhost:3000/
```

Buka browser dan akses **`http://localhost:5173/`** untuk melihat aplikasi.

---

### 📖 Cara Menggunakan Aplikasi

#### 1. **Masukkan Kode Saham**
   - Ketikkan kode saham di kolom pencarian (misal: `BBCA`, `TLKM`, `GOTO`).
   - Aplikasi akan menampilkan saran saham otomatis (dropdown).
   - Pilih salah satu dari daftar atau tekan **Enter**.

#### 2. **Tunggu Proses Analisis**
   - Sistem akan mencari data fundamental terkini ke internet (Market Price, BVPS, P/BV ratio).
   - Proses ini memakan waktu **5-15 detik** tergantung kecepatan internet dan ketersediaan Gemini API.
   - Anda akan melihat loading message dan progress bar.

#### 3. **Baca Hasil Analisis**
   Setelah selesai, Anda akan melihat **3 bagian utama:**
   
   - **📊 Metrik Fundamental:** Harga, BVPS, P/BV ratio, dan penilaian valuasi (Fair/Undervalued/Overvalued).
   - **🏢 Sektor:** Industri/sektor saham tersebut.
   - **📈 AI Logic Synthesis:** Analisis kualitatif mendalam dari Gemini AI + **Sentiment Analysis** dari model NLP Hugging Face.

#### 4. **Interpretasi Sentiment Analysis**
   Hasil sentiment muncul di kanan atas bagian analisis, dengan format:
   
   - **🟢 Positive (Bullish):** Analisis menunjukkan prospek menguntungkan, pertumbuhan positif, atau potensi kenaikan harga.
   - **🔵 Neutral (Hold):** Analisis menunjukkan kondisi stabil, prospek seimbang, atau faktor positif & negatif bertemu.
   - **🔴 Negative (Bearish):** Analisis menunjukkan risiko tinggi, peringatan downside, atau prospek kurang menguntungkan.
   
   Angka persentase (%) menunjukkan **confidence score** dari model AI (semakin tinggi = semakin yakin model).

#### 5. **Analisis Lanjutan**
   Baca dengan seksama:
   - **Interpretasi:** Kesimpulan valuasi (Fair/Over/Undervalued).
   - **Perbandingan Sektor:** Performa relatif dengan sektor yang sama.
   - **Faktor Positif:** Alasan mengapa saham ini bisa naik.
   - **Pertimbangan Risiko:** Alasan mengapa Anda harus hati-hati.
   - **Kesimpulan Pragmatis:** Rekomendasi umum berdasarkan data.

---

### ⚙️ Build untuk Production
```bash
npm run build
```
Output akan tersimpan di folder `dist/`. File ini siap di-deploy ke server hosting Anda.
