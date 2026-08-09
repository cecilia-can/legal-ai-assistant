-- CreateTable
CREATE TABLE "OAuthLinkIntent" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "expires" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthLinkIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthLinkIntent_tokenHash_key" ON "OAuthLinkIntent"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthLinkIntent_userId_expires_idx" ON "OAuthLinkIntent"("userId", "expires");

-- CreateIndex
CREATE INDEX "OAuthLinkIntent_expires_idx" ON "OAuthLinkIntent"("expires");

-- AddForeignKey
ALTER TABLE "OAuthLinkIntent" ADD CONSTRAINT "OAuthLinkIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
