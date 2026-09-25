import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCLiveSubtitles — синхронные тексты для SoundCloud",
  description:
    "Бесплатные синхронные тексты песен для треков SoundCloud. Нет текста — напиши и размечь его тапами сам.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b10" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f9" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="page">
          <header className="masthead">
            <Link href="/" className="wordmark">
              SCLive<span>Subtitles</span>
            </Link>
            <span className="tagline">синхронные тексты для SoundCloud</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
