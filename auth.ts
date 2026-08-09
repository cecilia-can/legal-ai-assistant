import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import authConfig from "@/auth.config";
import { prisma } from "@/lib/db";
import { createOAuthLinkIntent } from "@/lib/auth/oauth-link";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user?.password) {
          return null;
        }

        const valid = await compare(parsed.data.password, user.password);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, user }) {
      if (!account || account.provider === "credentials" || !user.email) {
        return true;
      }

      const linkedAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
      });
      if (linkedAccount) return true;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { id: true },
      });
      if (existingUser && existingUser.id !== user.id) {
        try {
          const linkToken = await createOAuthLinkIntent({
            userId: existingUser.id,
            email: user.email,
            account,
          });

          return `/login?error=OAuthAccountNotLinked&linkToken=${encodeURIComponent(linkToken)}`;
        } catch (error) {
          console.error("OAuth account linking intent creation failed:", error);
          return "/login?error=OAuthLinkUnavailable";
        }
      }
      return true;
    },
  },
});
