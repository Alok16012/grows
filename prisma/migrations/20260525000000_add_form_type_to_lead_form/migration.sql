-- CreateEnum
CREATE TYPE "LeadFormType" AS ENUM ('RECRUITMENT', 'ON_SITE_JOIN');

-- AlterTable
ALTER TABLE "LeadForm" ADD COLUMN "formType" "LeadFormType" NOT NULL DEFAULT 'RECRUITMENT';
