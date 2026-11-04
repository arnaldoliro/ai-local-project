-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
