-- Performance Hub: KRA/KPI templates (versioned), data registers, employee
-- template assignments, Daily/Weekly/Monthly KPI reports with approval, and
-- their activity trail.
--
-- Everything lives in NEW tables (no new Employee / User / PerformanceReview
-- columns) so deploying the code before this SQL runs cannot break anything:
-- until these tables exist every /api/perf-hub route answers 503.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel), so
-- every statement is idempotent and safe to paste into the Supabase SQL editor
-- and re-run. Same SQL lives in scripts/perf-hub.sql.

CREATE TABLE IF NOT EXISTS "PerfTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleLabel" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "familyId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfTemplateKra" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PerfTemplateKra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfTemplateKpi" (
    "id" TEXT NOT NULL,
    "kraId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "frequency" TEXT NOT NULL,
    "measurable" TEXT,
    "valueType" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'HIGHER',
    "target" DOUBLE PRECISION NOT NULL,
    "targetLabel" TEXT,
    "weightage" DOUBLE PRECISION NOT NULL,
    "rollup" TEXT NOT NULL DEFAULT 'AVG',
    "greenAt" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "amberAt" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "registerId" TEXT,
    "registerMode" TEXT,
    "valueField" TEXT,
    "numeratorField" TEXT,
    "denominatorField" TEXT,
    "aggregate" TEXT,
    "systemMetric" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PerfTemplateKpi_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfRegister" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfRegister_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfRegisterEntry" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "values" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfRegisterEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateFamilyId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfReport" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "score" DOUBLE PRECISION,
    "submittedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfReportValue" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "actual" DOUBLE PRECISION,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "achievementPct" DOUBLE PRECISION,
    "rag" TEXT,
    "remark" TEXT,
    "evidenceUrl" TEXT,
    CONSTRAINT "PerfReportValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfReportActivity" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfReportActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PerfTemplate_familyId_idx" ON "PerfTemplate"("familyId");
CREATE INDEX IF NOT EXISTS "PerfTemplate_status_idx" ON "PerfTemplate"("status");
CREATE INDEX IF NOT EXISTS "PerfTemplateKra_templateId_idx" ON "PerfTemplateKra"("templateId");
CREATE INDEX IF NOT EXISTS "PerfTemplateKpi_kraId_idx" ON "PerfTemplateKpi"("kraId");
CREATE INDEX IF NOT EXISTS "PerfTemplateKpi_templateId_idx" ON "PerfTemplateKpi"("templateId");
CREATE INDEX IF NOT EXISTS "PerfTemplateKpi_registerId_idx" ON "PerfTemplateKpi"("registerId");
CREATE INDEX IF NOT EXISTS "PerfRegisterEntry_registerId_employeeId_date_idx" ON "PerfRegisterEntry"("registerId", "employeeId", "date");
CREATE INDEX IF NOT EXISTS "PerfRegisterEntry_employeeId_idx" ON "PerfRegisterEntry"("employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "PerfAssignment_employeeId_key" ON "PerfAssignment"("employeeId");
CREATE INDEX IF NOT EXISTS "PerfAssignment_templateFamilyId_idx" ON "PerfAssignment"("templateFamilyId");
CREATE INDEX IF NOT EXISTS "PerfAssignment_reviewerUserId_idx" ON "PerfAssignment"("reviewerUserId");
CREATE INDEX IF NOT EXISTS "PerfReport_templateId_idx" ON "PerfReport"("templateId");
CREATE INDEX IF NOT EXISTS "PerfReport_status_idx" ON "PerfReport"("status");
CREATE INDEX IF NOT EXISTS "PerfReport_periodStart_idx" ON "PerfReport"("periodStart");
CREATE UNIQUE INDEX IF NOT EXISTS "PerfReport_employeeId_frequency_periodStart_key" ON "PerfReport"("employeeId", "frequency", "periodStart");
CREATE INDEX IF NOT EXISTS "PerfReportValue_kpiId_idx" ON "PerfReportValue"("kpiId");
CREATE UNIQUE INDEX IF NOT EXISTS "PerfReportValue_reportId_kpiId_key" ON "PerfReportValue"("reportId", "kpiId");
CREATE INDEX IF NOT EXISTS "PerfReportActivity_reportId_idx" ON "PerfReportActivity"("reportId");

DO $$ BEGIN
    ALTER TABLE "PerfTemplateKra" ADD CONSTRAINT "PerfTemplateKra_templateId_fkey"
        FOREIGN KEY ("templateId") REFERENCES "PerfTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfTemplateKpi" ADD CONSTRAINT "PerfTemplateKpi_kraId_fkey"
        FOREIGN KEY ("kraId") REFERENCES "PerfTemplateKra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfTemplateKpi" ADD CONSTRAINT "PerfTemplateKpi_templateId_fkey"
        FOREIGN KEY ("templateId") REFERENCES "PerfTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfTemplateKpi" ADD CONSTRAINT "PerfTemplateKpi_registerId_fkey"
        FOREIGN KEY ("registerId") REFERENCES "PerfRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfRegisterEntry" ADD CONSTRAINT "PerfRegisterEntry_registerId_fkey"
        FOREIGN KEY ("registerId") REFERENCES "PerfRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfRegisterEntry" ADD CONSTRAINT "PerfRegisterEntry_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfAssignment" ADD CONSTRAINT "PerfAssignment_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfAssignment" ADD CONSTRAINT "PerfAssignment_reviewerUserId_fkey"
        FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfReport" ADD CONSTRAINT "PerfReport_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfReport" ADD CONSTRAINT "PerfReport_templateId_fkey"
        FOREIGN KEY ("templateId") REFERENCES "PerfTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfReportValue" ADD CONSTRAINT "PerfReportValue_reportId_fkey"
        FOREIGN KEY ("reportId") REFERENCES "PerfReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfReportValue" ADD CONSTRAINT "PerfReportValue_kpiId_fkey"
        FOREIGN KEY ("kpiId") REFERENCES "PerfTemplateKpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PerfReportActivity" ADD CONSTRAINT "PerfReportActivity_reportId_fkey"
        FOREIGN KEY ("reportId") REFERENCES "PerfReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The app connects as "postgres". When this script is run by another role (e.g.
-- grows_local via DIRECT_URL) that role owns the tables, so grant the app full
-- access — otherwise it can read but every write fails with "permission denied".
GRANT ALL ON TABLE "PerfAssignment", "PerfRegister", "PerfRegisterEntry", "PerfReport", "PerfReportActivity", "PerfReportValue", "PerfTemplate", "PerfTemplateKpi", "PerfTemplateKra" TO postgres;
