"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { Session } from "next-auth";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  const pathname = usePathname();
  // Knowledge pages use server-side API authorization and have no useSession consumer.
  if (pathname === "/knowledge-bases" || pathname.startsWith("/knowledge-bases/")) {
    return <>{children}</>;
  }
  return <SessionProvider session={session} refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
