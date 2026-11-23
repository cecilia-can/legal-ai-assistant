import type { Metadata, Viewport } from "next";
import { auth } from "@/auth";
import { Providers } from "./providers";
import "./globals.css";
import "./markdown.css";
import "highlight.js/styles/github.min.css";

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
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
