import "server-only";

import { cache } from "react";
import { auth } from "@/auth";

export const getSession = cache(async () => auth());

export async function getOptionalSession(): Promise<{ userId: string } | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return { userId: session.user.id };
}

export async function verifySession(): Promise<{ userId: string }> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return { userId: session.user.id };
}
