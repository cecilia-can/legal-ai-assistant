import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const testName = `__change21_verification_${Date.now()}`;

async function main() {
  const before = {
    users: await prisma.user.count(),
    conversations: await prisma.conversation.count(),
  };

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    throw new Error("At least one existing user is required for tenant verification");
  }

  const systemKnowledgeBase = await prisma.knowledgeBase.create({
    data: {
      name: `${testName}_system`,
      scope: "system",
    },
  });

  const userKnowledgeBase = await prisma.knowledgeBase.create({
    data: {
      name: `${testName}_user`,
      scope: "user",
      ownerId: user.id,
    },
  });

  const document = await prisma.document.create({
    data: {
      knowledgeBaseId: userKnowledgeBase.id,
      uploadedByUserId: user.id,
      originalFilename: "verification.txt",
      title: "Change 2.1 verification",
      sourceIdentifier: testName,
      sourceType: "txt",
      category: "verification",
      contentHash: testName,
      status: "normalized",
    },
  });

  const chunk = await prisma.documentChunk.create({
    data: {
      documentId: document.id,
      ordinal: 0,
      text: "Change 2.1 pgvector verification chunk.",
      sectionPath: "verification",
      locator: { page: 1, article: "test" },
      contentHash: testName,
      chunkStrategyVersion: "verification-v1",
    },
  });

  const embedding = await prisma.embedding.create({
    data: {
      chunkId: chunk.id,
      model: "verification-model",
      dimensions: 2,
      contentHash: testName,
    },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE "Embedding" SET "vector" = $1::vector WHERE "id" = $2`,
    "[0.1,0.2]",
    embedding.id,
  );

  const loaded = await prisma.document.findUniqueOrThrow({
    where: { id: document.id },
    include: { chunks: { include: { embeddings: true } } },
  });

  const vectorResult = await prisma.$queryRawUnsafe<Array<{ dimensions: number }>>(
    `SELECT vector_dims("vector") AS dimensions FROM "Embedding" WHERE "id" = $1`,
    embedding.id,
  );

  if (loaded.chunks.length !== 1 || loaded.chunks[0]?.embeddings.length !== 1) {
    throw new Error("Document -> chunk -> embedding relation verification failed");
  }

  if (vectorResult[0]?.dimensions !== 2) {
    throw new Error("pgvector dimension verification failed");
  }

  await prisma.knowledgeBase.delete({ where: { id: systemKnowledgeBase.id } });
  await prisma.knowledgeBase.delete({ where: { id: userKnowledgeBase.id } });

  const after = {
    users: await prisma.user.count(),
    conversations: await prisma.conversation.count(),
  };

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Existing tenant data changed: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        relations: "KnowledgeBase -> Document -> DocumentChunk -> Embedding",
        vectorDimensions: vectorResult[0]?.dimensions,
        existingDataPreserved: true,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
