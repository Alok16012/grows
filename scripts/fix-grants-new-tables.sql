-- Fix: the app (Vercel connects as role "postgres") could READ but not WRITE the
-- tables created by scripts/asset-workflow.sql, scripts/perf-hub.sql and
-- scripts/policy-signoff.sql.
--
-- Why: those scripts were run through the local DIRECT_URL, which logs in as
-- role "grows_local", so grows_local owns the new tables and nobody else was
-- granted anything. "postgres" can still read them (it is a member of
-- pg_read_all_data) but every INSERT / UPDATE failed with "permission denied",
-- which the app reported as "Internal Error".
--
-- Run this AS grows_local (the owner), e.g.
--   psql "$DIRECT_URL" -f scripts/fix-grants-new-tables.sql
-- It only adds privileges (same ones the older tables already have) and is
-- safe to run more than once. Undo with REVOKE if ever needed.

GRANT ALL ON TABLE
    "AssetAuditLog", "AssetIssue", "AssetMeta", "AssetRequest", "AssetRequestItem", "AssetStockTxn",
    "PerfAssignment", "PerfRegister", "PerfRegisterEntry", "PerfReport", "PerfReportActivity",
    "PerfReportValue", "PerfTemplate", "PerfTemplateKpi", "PerfTemplateKra",
    "SignoffAck", "SignoffAudit", "SignoffPolicy", "SignoffPolicyDesignation", "SignoffPolicyVersion"
TO postgres;

GRANT EXECUTE ON FUNCTION signoff_block_change(), signoff_block_signed_ack_update() TO postgres;

-- Anything grows_local creates from now on is usable by the app straight away.
ALTER DEFAULT PRIVILEGES FOR ROLE grows_local IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE grows_local IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE grows_local IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres;
