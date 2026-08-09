"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import {
  linkOAuthAccountAction,
  type AuthFormState,
} from "@/lib/auth/actions";

function fieldError(errors: string[] | undefined) {
  return errors?.[0] ?? null;
}

export function LinkOAuthForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    linkOAuthAccountAction,
    {},
  );

  return (
    <AuthFormShell
      title="绑定第三方账号"
      subtitle="验证已有账号后，将当前 GitHub 或 Google 账号绑定到它"
      footer={
        <Link href="/login" className="text-primary hover:underline">
          返回邮箱密码登录
        </Link>
      }
    >
      {!token ? (
        <InlineError message="绑定链接无效，请重新使用 GitHub 或 Google 登录。" />
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />

          {state.message ? <InlineError message={state.message} /> : null}

          <p className="text-sm text-muted">
            请输入原邮箱账号的密码。验证成功后，系统会自动完成绑定并进入问答平台。
          </p>

          <label className="flex flex-col gap-2 text-sm">
            <span className="font-medium text-foreground">原账号密码</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {fieldError(state.errors?.password) ? (
              <span className="text-destructive">
                {fieldError(state.errors?.password)}
              </span>
            ) : null}
          </label>

          <Button type="submit" className="mt-2 w-full" disabled={pending}>
            {pending ? "验证并绑定中…" : "验证并绑定"}
          </Button>
        </form>
      )}
    </AuthFormShell>
  );
}
