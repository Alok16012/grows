-- Normalise identity, bank and contact fields on existing Employee rows.
--
-- New writes are normalised by the API (lib/validation.ts), but rows created
-- before that still hold values like "1234 5678 9012", "abcde1234f" or
-- "+91 98765-43210". Mixed formats matter because duplicate detection and the
-- login lookup both compare normalised values — an unnormalised row can hide a
-- duplicate, or fail to match at sign-in.
--
-- RUN THE SELECTs FIRST. They show exactly which rows would change and how.
-- Nothing is modified until you run the UPDATEs.
--
-- Safe to re-run: every statement is idempotent.

-- ─── 1. Preview: what would change ──────────────────────────────────────────

SELECT 'aadhaar' AS field, "id", "employeeId", "aadharNumber" AS current,
       regexp_replace("aadharNumber", '[^0-9]', '', 'g') AS normalised
FROM "Employee"
WHERE "aadharNumber" IS NOT NULL
  AND "aadharNumber" <> regexp_replace("aadharNumber", '[^0-9]', '', 'g')

UNION ALL
SELECT 'pan', "id", "employeeId", "panNumber", upper(trim("panNumber"))
FROM "Employee"
WHERE "panNumber" IS NOT NULL
  AND "panNumber" <> upper(trim("panNumber"))

UNION ALL
SELECT 'ifsc', "id", "employeeId", "bankIFSC", upper(trim("bankIFSC"))
FROM "Employee"
WHERE "bankIFSC" IS NOT NULL
  AND "bankIFSC" <> upper(trim("bankIFSC"))

UNION ALL
SELECT 'bank_account', "id", "employeeId", "bankAccountNumber",
       regexp_replace("bankAccountNumber", '[^0-9]', '', 'g')
FROM "Employee"
WHERE "bankAccountNumber" IS NOT NULL
  AND "bankAccountNumber" <> regexp_replace("bankAccountNumber", '[^0-9]', '', 'g')

ORDER BY field, "employeeId";


-- ─── 2. Preview: rows that would become DUPLICATES once normalised ──────────
-- Check this before updating. If anything shows up, two employees are holding
-- the same Aadhaar in different formats and a human needs to decide which is
-- correct — normalising will not merge them, it will just make the clash visible.

SELECT regexp_replace("aadharNumber", '[^0-9]', '', 'g') AS normalised_aadhaar,
       count(*) AS rows,
       string_agg("employeeId", ', ') AS employees
FROM "Employee"
WHERE "aadharNumber" IS NOT NULL AND "aadharNumber" <> ''
GROUP BY 1
HAVING count(*) > 1;


-- ─── 3. Preview: values that are not valid even after normalising ───────────
-- These need correcting by hand; normalising will not fix them.

SELECT "id", "employeeId", "aadharNumber", 'aadhaar not 12 digits' AS problem
FROM "Employee"
WHERE "aadharNumber" IS NOT NULL AND "aadharNumber" <> ''
  AND length(regexp_replace("aadharNumber", '[^0-9]', '', 'g')) <> 12

UNION ALL
SELECT "id", "employeeId", "panNumber", 'PAN not in AAAAA9999A form'
FROM "Employee"
WHERE "panNumber" IS NOT NULL AND "panNumber" <> ''
  AND upper(trim("panNumber")) !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'

UNION ALL
SELECT "id", "employeeId", "bankIFSC", 'IFSC not in AAAA0XXXXXX form'
FROM "Employee"
WHERE "bankIFSC" IS NOT NULL AND "bankIFSC" <> ''
  AND upper(trim("bankIFSC")) !~ '^[A-Z]{4}0[A-Z0-9]{6}$'

UNION ALL
SELECT "id", "employeeId", "phone", 'phone not a 10-digit 6-9 number'
FROM "Employee"
WHERE "phone" IS NOT NULL AND "phone" <> ''
  AND right(regexp_replace("phone", '[^0-9]', '', 'g'), 10) !~ '^[6-9][0-9]{9}$'

ORDER BY problem, "employeeId";


-- ─── 4. Apply ───────────────────────────────────────────────────────────────
-- Only after reviewing 1–3. Run inside a transaction so you can roll back.

-- BEGIN;

-- UPDATE "Employee"
--    SET "aadharNumber" = regexp_replace("aadharNumber", '[^0-9]', '', 'g')
--  WHERE "aadharNumber" IS NOT NULL
--    AND "aadharNumber" <> regexp_replace("aadharNumber", '[^0-9]', '', 'g');

-- UPDATE "Employee"
--    SET "panNumber" = upper(trim("panNumber"))
--  WHERE "panNumber" IS NOT NULL AND "panNumber" <> upper(trim("panNumber"));

-- UPDATE "Employee"
--    SET "bankIFSC" = upper(trim("bankIFSC"))
--  WHERE "bankIFSC" IS NOT NULL AND "bankIFSC" <> upper(trim("bankIFSC"));

-- UPDATE "Employee"
--    SET "bankAccountNumber" = regexp_replace("bankAccountNumber", '[^0-9]', '', 'g')
--  WHERE "bankAccountNumber" IS NOT NULL
--    AND "bankAccountNumber" <> regexp_replace("bankAccountNumber", '[^0-9]', '', 'g');

-- Phone is deliberately left alone: sign-in matches on the last 10 digits
-- (lib/auth.ts), so a stored "+91 " prefix still works, and rewriting the column
-- would touch the field the login path depends on. Fix bad phones individually
-- using query 3 above.

-- COMMIT;
