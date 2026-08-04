import { auth } from "@/auth";
import { jsonError } from "@/lib/api/api-response";

type RequireApiSessionResult =
  | { userId: string; error: null }
  | { userId: null; error: ReturnType<typeof jsonError> };

export async function requireApiSession(): Promise<RequireApiSessionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      userId: null,
      error: jsonError("请先登录。", 401),
    };
  }

  return {
    userId: session.user.id,
    error: null,
  };
}
