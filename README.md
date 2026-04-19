# 📈 Saham Analyzer (Mesin Valuasi Saham AI)

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

1. *Clone* repositori / persiapkan ruang kerja.
2. Lakukan instalasi seluruh *package*:
   ```bash
   npm install
   ```
3. Atur *Environment Variables*:
   Buat atau modifikasi salinan file `.env` (atau isi via antarmuka "Secrets" aplikasimu).
   ```env
   GEMINI_API_KEY="AIzaSy...kunci_gemini_anda"
   HF_TOKEN="hf_...kunci_huggingface_anda"
   ```
4. Jalankan Server Development:
   ```bash
   npm run dev
   ```
   Aplikasi dan *Express Proxy server* otomatis berjalan di `http://0.0.0.0:3000`.
