import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { Providers } from "./providers";
import "./globals.css";
import "./markdown.css";
import "highlight.js/styles/github.min.css";
// 两种Google字体
// Geist Sans: 现代、简洁的字体，适用于标题和正文
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Geist Mono: 等宽字体，适用于代码和 monospace 文本
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "法律 AI 助手",
  description: "Legal AI Assistant — 法律咨询对话界面",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}