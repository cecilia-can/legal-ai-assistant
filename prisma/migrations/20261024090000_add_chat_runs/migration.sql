-- CreateTable
CREATE TABLE "ChatRun" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "assistantMessageId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatRun_userMessageId_key" ON "ChatRun"("userMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRun_assistantMessageId_key" ON "ChatRun"("assistantMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRun_conversationId_clientRequestId_key" ON "ChatRun"("conversationId", "clientRequestId");

-- CreateIndex
CREATE INDEX "ChatRun_conversationId_status_idx" ON "ChatRun"("conversationId", "status");

-- Enforce one active generation per conversation, including concurrent requests.
CREATE UNIQUE INDEX "ChatRun_one_generating_per_conversation" ON "ChatRun"("conversationId") WHERE "status" = 'generating';

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_assistantMessageId_fkey" FOREIGN KEY ("assistantMessageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
