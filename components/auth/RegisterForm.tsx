"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { registerAction, type AuthFormState } from "@/lib/auth/actions";

function fieldError(errors: string[] | undefined) {
  return errors?.[0] ?? null;
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    registerAction,
    {},
  );

  return (
    <AuthFormShell
      title="注册"
      subtitle="创建账号以保存你的法律咨询会话"
      footer={
        <>
          已有账号？{" "}
          <Link href="/login" className="text-primary hover:underline">
            去登录
          </Link>
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4">
        {state.message ? (
          <InlineError message={state.message} />
        ) : null}

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">姓名</span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {fieldError(state.errors?.name) ? (
            <span className="text-destructive">{fieldError(state.errors?.name)}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">邮箱</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {fieldError(state.errors?.email) ? (
            <span className="text-destructive">{fieldError(state.errors?.email)}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">密码</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {fieldError(state.errors?.password) ? (
            <span className="text-destructive">
              {fieldError(state.errors?.password)}
            </span>
          ) : null}
          <span className="text-xs text-muted">至少 8 位，需包含字母与数字。</span>
        </label>

        <Button type="submit" className="mt-2 w-full" disabled={pending}>
          {pending ? "注册中…" : "注册并登录"}
        </Button>
      </form>
    </AuthFormShell>
  );
}
