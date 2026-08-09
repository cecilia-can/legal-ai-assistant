"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { loginAction, type AuthFormState } from "@/lib/auth/actions";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import type { OAuthProviderId } from "@/lib/auth/oauth";

function fieldError(errors: string[] | undefined) {
  return errors?.[0] ?? null;
}

export function LoginForm({ oauthProviders = [] }: { oauthProviders?: OAuthProviderId[] }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const oauthError = searchParams.get("error");
  const linkToken = searchParams.get("linkToken");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    loginAction,
    {},
  );

  return (
    <AuthFormShell
      title="登录"
      subtitle="使用邮箱和密码访问你的法律 AI 助手"
      footer={
        <>
          还没有账号？{" "}
          <Link href="/register" className="text-primary hover:underline">
            立即注册
          </Link>
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        {state.message ? (
          <InlineError message={state.message} />
        ) : null}

        {oauthError === "OAuthAccountNotLinked" ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <p>该邮箱已经注册过账号，请先验证原账号后绑定第三方登录。</p>
            {linkToken ? (
              <Link
                href={`/login/link?token=${encodeURIComponent(linkToken)}`}
                className="mt-2 inline-block font-medium underline"
              >
                验证并绑定当前账号
              </Link>
            ) : null}
          </div>
        ) : null}

        {oauthError === "OAuthLinkUnavailable" ? (
          <InlineError message="暂时无法创建账号绑定流程，请稍后重试或使用邮箱密码登录。" />
        ) : null}

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
          {pending ? "登录中…" : "登录"}
        </Button>
      </form>
      <OAuthButtons providers={oauthProviders} callbackUrl={callbackUrl} />
    </AuthFormShell>
  );
}
