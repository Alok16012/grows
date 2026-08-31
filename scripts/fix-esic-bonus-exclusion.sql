-- Fix ESIC wage base: Bonus must stay IN, only Washing + Conveyance come out.
--
--   ESIC wages = Earned Gross − Washing − Conveyance
--
-- The code default now ships excludeBonus = false, but a company that has ever
-- opened Payroll → Calculation Settings has the OLD value frozen into the
-- AppSetting row, and the stored JSON always wins over the code default.
-- This patches that row in place, leaving every other tuned rule untouched.
--
-- Prod migrations aren't run automatically on this project, so apply this by
-- hand in the Supabase SQL editor. Idempotent — safe to run more than once.

-- 1. Inspect what is stored right now (run this first).
SELECT
    key,
    value::jsonb -> 'esic' ->> 'eligibilityLimit'   AS eligibility_limit,
    value::jsonb -> 'esic' ->> 'excludeWashing'     AS exclude_washing,
    value::jsonb -> 'esic' ->> 'excludeConveyance'  AS exclude_conveyance,
    value::jsonb -> 'esic' ->> 'excludeBonus'       AS exclude_bonus,
    "updatedAt"
FROM "AppSetting"
WHERE key = 'payrollRules';

-- 2. Bonus back INTO the ESIC base; Washing/Conveyance stay excluded.
UPDATE "AppSetting"
SET value = jsonb_set(
                jsonb_set(
                    jsonb_set(value::jsonb, '{esic,excludeBonus}',      'false', true),
                    '{esic,excludeWashing}',    'true', true),
                '{esic,excludeConveyance}', 'true', true
            )::text,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE key = 'payrollRules';

-- 3. Verify — expect exclude_bonus = false, the other two = true.
SELECT
    value::jsonb -> 'esic' ->> 'excludeWashing'     AS exclude_washing,
    value::jsonb -> 'esic' ->> 'excludeConveyance'  AS exclude_conveyance,
    value::jsonb -> 'esic' ->> 'excludeBonus'       AS exclude_bonus
FROM "AppSetting"
WHERE key = 'payrollRules';

-- NOTE: this only changes FUTURE calculations. Payroll rows already saved keep
-- the ESIC they were computed with — unlock the run and recalculate the month
-- to push the corrected figures onto the existing wage sheet.
