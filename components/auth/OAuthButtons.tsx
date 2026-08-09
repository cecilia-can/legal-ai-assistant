"use client";

import { useActionState } from "react";
import { InlineError } from "@/components/ui/InlineError";
import { Button } from "@/components/ui/Button";
import { oauthSignInAction, type AuthFormState } from "@/lib/auth/actions";
import type { OAuthProviderId } from "@/lib/auth/oauth";

const labels: Record<OAuthProviderId, string> = {
  github: "使用 GitHub 登录",
  google: "使用 Google 登录",
};

function OAuthButton({ provider, callbackUrl }: { provider: OAuthProviderId; callbackUrl: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(oauthSignInAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
        {pending ? "跳转中…" : labels[provider]}
      </Button>
      {state.message ? <InlineError message={state.message} /> : null}
    </form>
  );
}

export function OAuthButtons({ providers, callbackUrl }: { providers: OAuthProviderId[]; callbackUrl: string }) {
  if (providers.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      {providers.map((provider) => <OAuthButton key={provider} provider={provider} callbackUrl={callbackUrl} />)}
    </div>
  );
}
