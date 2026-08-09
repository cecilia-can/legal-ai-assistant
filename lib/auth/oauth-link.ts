import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";

const LINK_INTENT_TTL_MS = 10 * 60 * 1000;

export type OAuthLinkAccountData = {
  provider: string;
  providerAccountId: string;
  type: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
};

export type OAuthLinkIntentResult = {
  email: string;
  provider: string;
};

function hashLinkToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildExpiresAt() {
  return new Date(Date.now() + LINK_INTENT_TTL_MS);
}

export async function createOAuthLinkIntent(input: {
  userId: string;
  email: string;
  account: OAuthLinkAccountData;
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const expires = buildExpiresAt();

  await prisma.oAuthLinkIntent.deleteMany({
    where: {
      OR: [
        { expires: { lt: new Date() } },
        { userId: input.userId, provider: input.account.provider },
      ],
    },
  });

  await prisma.oAuthLinkIntent.create({
    data: {
      tokenHash: hashLinkToken(rawToken),
      userId: input.userId,
      email: input.email,
      provider: input.account.provider,
      providerAccountId: input.account.providerAccountId,
      type: input.account.type,
      refreshToken: input.account.refresh_token ?? null,
      accessToken: input.account.access_token ?? null,
      expiresAt: input.account.expires_at ?? null,
      tokenType: input.account.token_type ?? null,
      scope: input.account.scope ?? null,
      idToken: input.account.id_token ?? null,
      sessionState: input.account.session_state ?? null,
      expires,
    },
  });

  return rawToken;
}

export async function verifyAndConsumeOAuthLinkIntent(input: {
  token: string;
  password: string;
}): Promise<OAuthLinkIntentResult | null> {
  const tokenHash = hashLinkToken(input.token);
  const now = new Date();
  const intent = await prisma.oAuthLinkIntent.findUnique({
    where: { tokenHash },
  });

  if (!intent || intent.usedAt || intent.expires <= now) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: intent.userId },
    select: { id: true, email: true, password: true },
  });

  if (!user?.password || user.email.toLowerCase() !== intent.email.toLowerCase()) {
    return null;
  }

  const passwordMatches = await verifyPassword(input.password, user.password);
  if (!passwordMatches) {
    return null;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.oAuthLinkIntent.updateMany({
        where: {
          id: intent.id,
          tokenHash,
          usedAt: null,
          expires: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new Error("OAuth link intent is no longer valid");
      }

      const existingAccount = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: intent.provider,
            providerAccountId: intent.providerAccountId,
          },
        },
        select: { userId: true },
      });

      if (existingAccount && existingAccount.userId !== intent.userId) {
        throw new Error("OAuth account is already linked to another user");
      }

      if (!existingAccount) {
        await tx.account.create({
          data: {
            userId: intent.userId,
            type: intent.type,
            provider: intent.provider,
            providerAccountId: intent.providerAccountId,
            refresh_token: intent.refreshToken,
            access_token: intent.accessToken,
            expires_at: intent.expiresAt,
            token_type: intent.tokenType,
            scope: intent.scope,
            id_token: intent.idToken,
            session_state: intent.sessionState,
          },
        });
      }
    });
  } catch {
    return null;
  }

  return {
    email: user.email,
    provider: intent.provider,
  };
}
