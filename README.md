# MagicDraw AI

Realtime sketch-to-image playground. Gambar garis sederhana di kanvas, lalu FLUX.2 [klein] Realtime mengubahnya menjadi visual jadi melalui WebSocket.

## Fitur

- Realtime sketch → AI image
- Brush, eraser, undo, redo, clear
- Preset Realistic, Cinematic, Architecture, 3D, Anime, Watercolor
- Prompt opsional — AI tetap bisa mencoba menebak objek dari sketsa
- Kontrol consistency, inference steps, dan interpolasi frame
- Export sketsa dan hasil AI
- Responsif untuk desktop + HP
- `FAL_KEY` tidak pernah dikirim ke browser; frontend mendapat short-lived realtime token

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local
```

Isi `.env.local`:

```env
FAL_KEY=your_fal_key_here
```

Lalu:

```bash
npm run dev
```

Buka `http://localhost:3000`.

## Deploy ke Vercel

1. Upload project ke GitHub.
2. Import repository di Vercel.
3. Tambahkan Environment Variable `FAL_KEY`.
4. Deploy.

Tidak perlu database untuk versi MVP ini.

## Model realtime

Default: `fal-ai/flux-2/klein/realtime`.

Kanvas internal menggunakan 704×704 dan dikirim sebagai JPEG quality 0.5 agar cocok untuk jalur realtime model dan payload tetap ringan.

## Pengembangan berikutnya

- Infinite canvas sungguhan (pan/zoom + multi-object)
- Selection / transform object
- Color hints / regional prompt
- Reference image
- History/gallery menggunakan IndexedDB atau Supabase
- Layer system
- Magic fill / inpaint
- Object lock agar elemen yang sudah jadi tidak berubah saat stroke baru ditambahkan
- User auth + credit / quota
