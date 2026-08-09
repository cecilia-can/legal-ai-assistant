import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";

export type OAuthProviderId = "github" | "google";

type OAuthProviderStatus = {
  id: OAuthProviderId;
  configured: boolean;
  partial: boolean;
};

const providerEnv: Record<OAuthProviderId, readonly [string, string]> = {
  github: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"],
  google: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
};

export function getOAuthProviderStatus(): OAuthProviderStatus[] {
  return (Object.keys(providerEnv) as OAuthProviderId[]).map((id) => {
    const [clientIdKey, clientSecretKey] = providerEnv[id];
    const hasClientId = Boolean(process.env[clientIdKey]?.trim());
    const hasClientSecret = Boolean(process.env[clientSecretKey]?.trim());
    return {
      id,
      configured: hasClientId && hasClientSecret,
      partial: hasClientId !== hasClientSecret,
    };
  });
}

export function getConfiguredOAuthProviders(): OAuthProviderId[] {
  return getOAuthProviderStatus()
    .filter((provider) => provider.configured)
    .map((provider) => provider.id);
}

export function getOAuthProviders(): Provider[] {
  const providers: Provider[] = [];

  for (const provider of getOAuthProviderStatus()) {
    if (provider.partial) {
      console.warn(
        `[auth] ${provider.id} OAuth is partially configured; both client ID and secret are required.`,
      );
      continue;
    }
    if (!provider.configured) continue;

    if (provider.id === "github") {
      providers.push(
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID!,
          clientSecret: process.env.AUTH_GITHUB_SECRET!,
          allowDangerousEmailAccountLinking: false,
        }),
      );
    } else {
      providers.push(
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          allowDangerousEmailAccountLinking: false,
        }),
      );
    }
  }

  return providers;
}
