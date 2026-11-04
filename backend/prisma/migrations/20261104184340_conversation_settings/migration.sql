-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "model" TEXT,
ADD COLUMN     "system_prompt" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION;
