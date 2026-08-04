"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function UserMenu() {
  const { data: session, status, update } = useSession();
  const [hasSynced, setHasSynced] = useState(() => Boolean(session?.user));

  useEffect(() => {
    if (session?.user) {
      setHasSynced(true);
      return;
    }

    if (hasSynced) {
      return;
    }

    let cancelled = false;

    void update().finally(() => {
      if (!cancelled) {
        setHasSynced(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session?.user, update, hasSynced]);

  if (status === "loading" || (!session?.user && !hasSynced)) {
    return (
      <div className="border-t border-border px-4 py-3">
        <p className="text-xs text-muted">加载用户信息…</p>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const label = session.user.email ?? session.user.name ?? "已登录用户";

  return (
    <div className="border-t border-border px-4 py-3">
      <p className="truncate text-sm font-medium text-foreground" title={label}>
        {label}
      </p>
      <Button
        type="button"
        variant="secondary"
        className="mt-3 w-full justify-center gap-2"
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        退出登录
      </Button>
    </div>
  );
}
