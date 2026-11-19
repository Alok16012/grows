-- Clear passwords that older versions stored as readable text.
--
-- "User"."plainPassword" held a copy of each password in plain text. Nothing
-- reads it any more (every write path sets it to NULL and the admin APIs
-- strip it), but 928 old values were still in the table, readable by anyone
-- with database access or a database backup.
--
-- Sign-in is unaffected: it checks the bcrypt hash in "password", OTP and
-- MPIN, never this column. Irreversible: the plain values are gone for good,
-- which is the point. Safe to re-run.

UPDATE "User" SET "plainPassword" = NULL WHERE "plainPassword" IS NOT NULL;
