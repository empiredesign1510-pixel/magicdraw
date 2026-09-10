import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MagicDraw AI — Draw it. Watch it become real.",
  description: "Realtime AI sketch-to-image canvas powered by FLUX realtime.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
