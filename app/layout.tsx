import type { Metadata } from "next";
import "./globals.css";

// デザイン: Zen Old Mincho(見出し・朱印) × IBM Plex Sans JP(本文)
// × IBM Plex Mono(ラベル)。Google Fontsから読み込み、和文フォールバック
// (Hiragino / Yu)はlib/theme.tsのフォントスタックで担保する。

export const metadata: Metadata = {
  title: "一気 IKKI — AIキャリアエージェント",
  description:
    "AIと10分話すだけで、キャリアの棚卸しから職務経歴書、一次面接までが終わる。あなたの言葉が、そのまま選考データになる。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Routerのroot layoutは全ページ共通のためこの警告は該当しない */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@500;700&family=IBM+Plex+Sans+JP:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
