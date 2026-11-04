-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "memory_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "embedded_at" TIMESTAMP(3),
ADD COLUMN     "memories" JSONB;

-- CreateTable
CREATE TABLE "memory_chunks" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memory_chunks_conversation_id_idx" ON "memory_chunks"("conversation_id");

-- CreateIndex
CREATE INDEX "memory_chunks_message_id_idx" ON "memory_chunks"("message_id");

-- AddForeignKey
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
