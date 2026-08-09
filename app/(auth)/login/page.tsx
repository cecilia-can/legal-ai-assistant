import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { getConfiguredOAuthProviders } from "@/lib/auth/oauth";

export default function LoginPage() {
  const oauthProviders = getConfiguredOAuthProviders();
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted">加载中…</p>}>
      <LoginForm oauthProviders={oauthProviders} />
    </Suspense>
  );
}
