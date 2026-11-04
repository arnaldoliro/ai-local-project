-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "summarized_until" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT;
