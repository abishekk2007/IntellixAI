-- CreateEnum
CREATE TYPE "KnowledgeEntityType" AS ENUM ('PERSON', 'ORGANIZATION', 'PROJECT', 'TASK', 'DATE', 'TECHNOLOGY', 'TOPIC', 'LOCATION', 'DOCUMENT');

-- CreateTable
CREATE TABLE "KnowledgeEntity" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "type" "KnowledgeEntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntitySource" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "chunkId" UUID,
    "excerpt" TEXT,
    "pageNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeEntitySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRelation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sourceEntityId" UUID NOT NULL,
    "targetEntityId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "documentId" UUID,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeEntity_workspaceId_normalized_type_key" ON "KnowledgeEntity"("workspaceId", "normalized", "type");
CREATE INDEX "KnowledgeEntity_workspaceId_idx" ON "KnowledgeEntity"("workspaceId");
CREATE INDEX "KnowledgeEntity_workspaceId_type_idx" ON "KnowledgeEntity"("workspaceId", "type");
CREATE INDEX "KnowledgeEntity_workspaceId_normalized_idx" ON "KnowledgeEntity"("workspaceId", "normalized");
CREATE UNIQUE INDEX "KnowledgeEntitySource_entityId_documentId_chunkId_key" ON "KnowledgeEntitySource"("entityId", "documentId", "chunkId");
CREATE INDEX "KnowledgeEntitySource_workspaceId_documentId_idx" ON "KnowledgeEntitySource"("workspaceId", "documentId");
CREATE INDEX "KnowledgeEntitySource_workspaceId_entityId_idx" ON "KnowledgeEntitySource"("workspaceId", "entityId");
CREATE UNIQUE INDEX "KnowledgeRelation_workspaceId_sourceEntityId_targetEntityId_type_documentId_key" ON "KnowledgeRelation"("workspaceId", "sourceEntityId", "targetEntityId", "type", "documentId");
CREATE INDEX "KnowledgeRelation_workspaceId_sourceEntityId_idx" ON "KnowledgeRelation"("workspaceId", "sourceEntityId");
CREATE INDEX "KnowledgeRelation_workspaceId_targetEntityId_idx" ON "KnowledgeRelation"("workspaceId", "targetEntityId");
CREATE INDEX "KnowledgeRelation_workspaceId_type_idx" ON "KnowledgeRelation"("workspaceId", "type");

ALTER TABLE "KnowledgeEntity" ADD CONSTRAINT "KnowledgeEntity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEntitySource" ADD CONSTRAINT "KnowledgeEntitySource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEntitySource" ADD CONSTRAINT "KnowledgeEntitySource_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "KnowledgeEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEntitySource" ADD CONSTRAINT "KnowledgeEntitySource_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEntitySource" ADD CONSTRAINT "KnowledgeEntitySource_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "KnowledgeEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "KnowledgeEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
