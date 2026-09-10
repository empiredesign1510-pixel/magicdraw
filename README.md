# MagicDraw AI — Realtime Fix

MagicDraw AI adalah kanvas sketch-to-image realtime berbasis Next.js + fal.ai FLUX.2 [klein] Realtime.

## Fix penting versi ini

- Memakai endpoint token realtime fal.ai terbaru: `https://rest.fal.ai/tokens/realtime`
- Token dibatasi ke endpoint penuh `fal-ai/flux-2/klein/realtime`
- Menggunakan `duration` dan response `{ token }` sesuai API realtime terbaru
- Error autentikasi/koneksi sekarang tampil di panel AI Result
- Parser hasil mendukung raw image bytes, base64, dan URL
- Endpoint GET `/api/fal/realtime-token` dapat dipakai untuk mengecek apakah `FAL_KEY` sudah tersedia di server tanpa membocorkan key

## Vercel

Tambahkan environment variable berikut di Project → Settings → Environment Variables:

```env
FAL_KEY=your_fal_key_here
```

Aktifkan minimal untuk Production dan Preview, lalu Redeploy.

Setelah deploy, buka:

```text
https://DOMAIN-ANDA.vercel.app/api/fal/realtime-token
```

Respons yang benar:

```json
{
  "ok": true,
  "falKeyConfigured": true,
  "model": "fal-ai/flux-2/klein/realtime"
}
```

Jika `falKeyConfigured` bernilai `false`, isi `FAL_KEY` di Vercel lalu redeploy.
