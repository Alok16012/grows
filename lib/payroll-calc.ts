// ─── Growus Salary Formula ────────────────────────────────────────────────────
//
// Verified against actual VARROC PUNE wage sheet (MAR CAL) — all 11 employees ✓
//
// Every statutory rate, ceiling and slab below comes from a PayrollRules
// object (lib/payroll-rules.ts). DEFAULT_PAYROLL_RULES reproduces the verified
// sheet exactly; companies can override rates from Payroll → Calculation
// Settings, and the server passes the stored rules in.
//
// complianceType:
//   "CALL" → No PF, No ESIC  (temporary / contract / non-compliance roles)
//   "OR"   → PF + ESIC apply  (full-time / full-compliance roles)
//
// HRA / Bonus: manual values from the salary structure — no auto-calculation.
//
// Proration: ROUND(component × WorkedDays / MonthDays)  ← multiply FIRST (Excel-exact)
//
// OT Pay: ROUND(otRatePerHour × hoursPerDay × OT_Days, 0)
//   Default hoursPerDay = 4 (e.g. ₹170/hr × 4 = ₹680/day)
//   The rate per hour follows the site's OT rule (Calculation Settings → OT rule
//   by site; rules editable there): ticked salary parts ÷ days ÷ hours ×
//   multiplier, e.g. (Basic+DA) ÷ 26 ÷ 8 × 2, or a fixed rate (blank = the
//   employee's own). No site / no rule → the default rule, which out of the box
//   is the employee's own rate (as before).
//
// The rules passed in must be the ones for the payroll month — callers use
// rulesForPeriod(rules, month, year), which applies the 1 Oct 2026 revision.
//
// PF Employee:  pfBase = min(Basic + DA, wage ceiling)
//               Up to Sep 2026: ceiling ₹15,000 → max ₹1,800.
//               From Oct 2026:  ceiling ₹25,000 → max ₹3,000; below it 12% of actual.
//               Default: full PF regardless of worked days; optional proration rule.
// PF Employer (all on pfBase):
//   EPS 8.33% + EPF diff 3.67% + EDLI 0.50% + admin 0.50%  (≈ 13%)
//
// ESIC eligibility (full month)  [₹25,000 for Handicap]:
//   Up to Sep 2026: Structure Gross ≤ ₹21,000
//   From Oct 2026:  Basic + DA ≤ ₹21,000 (₹21,001 and above → no ESIC)
//   ESIC wages = EarnedGross − Washing − Conveyance  (OT and Bonus included)
//   Employee CEIL(0.75%), Employer CEIL(3.25%)
//
// PT (Maharashtra slab on earned gross): ≤7,500 → 0; ≤10,000 → 175; above →
//   200 (300 in February). Female employees exempt up to ₹25,000.
//
import { DEFAULT_PAYROLL_RULES, PayrollRules, computePt, esicEligibilityBase, esicChargeAmount, employerPfBase, roundAmt, esicWagesOf, otRatePerHourFor, otRuleFor } from "./payroll-rules"

export function calcGrowusPayroll(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number
    hra?: number               // manual HRA from salary structure (no auto-calc)
    bonus?: number             // per-employee bonus from salary structure (Payment of Bonus Act cap)
    complianceType?: string    // "CALL" | "OR" (default "OR")
    isHandicap?: boolean       // ESIC eligibility limit: ₹25,000 for handicap, ₹21,000 otherwise
    // Per-employee switches (Employee Master → Basic Info, lib/employee-statutory).
    // Absent = applicable, so every caller that doesn't pass them is unchanged.
    pfApplicable?: boolean      // false → no PF at all (employee or employer)
    pensionApplicable?: boolean // false → employer EPS 8.33% goes to EPF instead (same total)
    esicApplicable?: boolean    // false → no ESIC (employee or employer)
    siteId?: string | null      // the site the pay is for — picks its OT rule
    employeeId?: string | null  // for a "Manual OT — rate per employee" rule
}, att: {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    /** Manual canteen deduction. null/undefined → canteenDays × rate. */
    canteenAmount?: number | null
    otherDeductions: number; productionIncentive: number; lwf: number
    /** "Manual OT — monthly amount" rule: the ₹ OT typed for this month. null → OT days × rate. */
    otAmount?: number | null
    gender?: string            // "Male" | "Female" (default "Male")
    month?: number             // 1–12, used for February PT (default: current month)
}, rules: PayrollRules = DEFAULT_PAYROLL_RULES) {
    const {
        basic, da, washing, conveyance, leaveWithWages, otherAllowance,
        otRatePerHour, canteenRatePerDay,
        hra: storedHra,
        bonus: storedBonus,
        complianceType = "OR",
        isHandicap = false,
        pfApplicable = true,
        pensionApplicable = true,
        esicApplicable = true,
    } = sal

    const {
        monthDays, workedDays, otDays, canteenDays, canteenAmount,
        penalty, advance, otherDeductions, productionIncentive, lwf,
        month,
        gender,
    } = att

    const isCALL    = complianceType === "CALL"
    const isFeb     = month === 2
    const isFemale  = gender?.toLowerCase() === "female"

    // ─── Full month components ────────────────────────────────────────────────
    // HRA: use manually stored value from salary structure (no auto-calculation)
    // Contract (CALL) staff get HRA / Bonus only if Calculation Settings says so.
    const hraFull    = isCALL && !rules.call.hra ? 0 : (storedHra != null && storedHra >= 0 ? storedHra : 0)
    // Bonus: use manually stored value from salary structure (no auto-calculation)
    const bonusFull  = isCALL && !rules.call.bonus ? 0 : (storedBonus != null && storedBonus > 0 ? storedBonus : 0)
    const grossFullMonth = basic + da + hraFull + washing + conveyance + leaveWithWages + bonusFull + otherAllowance

    // ─── Prorated earned (ROUND to 0 decimal) ─────────────────────────────────
    // IMPORTANT: multiply first, then divide (matches Excel order — avoids floating-point drift)
    // Rounded to the rupee or kept to the paise, and each allowance either cut
    // by days worked or paid in full — all per Calculation Settings.
    const rnd = (x: number) => rules.pay.roundEarned ? Math.round(x) : Math.round(x * 100) / 100
    const r = (x: number, full = false) => full ? rnd(x) : rnd(x * workedDays / monthDays)
    const fm = rules.pay.fullMonth
    const basicEarned   = r(basic)
    const daEarned      = r(da)
    const hraEarned     = r(hraFull, fm.hra)
    const washingEarned = r(washing, fm.washing)
    const convEarned    = r(conveyance, fm.conveyance)
    const lwwEarned     = r(leaveWithWages, fm.leaveWithWages)
    const bonusEarned   = r(bonusFull, fm.bonus)
    const otherEarned   = r(otherAllowance, fm.otherAllowance)

    // OT Pay: ROUND(otRatePerHour × hoursPerDay × OT_Days, 0)
    const otRate = otRatePerHourFor(rules.ot, sal.siteId,
        { basic, da, hra: hraFull, washing, conveyance, leaveWithWages, bonus: bonusFull, otherAllowance }, otRatePerHour, sal.employeeId)
    const manualAmount = otRuleFor(rules.ot, sal.siteId).formula?.kind === "MANUAL_AMOUNT"
        && att.otAmount != null && Number.isFinite(att.otAmount) ? att.otAmount : null
    const otPay = manualAmount !== null ? Math.round(manualAmount) : Math.round(otRate * rules.ot.hoursPerDay * otDays)

    const grossEarned = basicEarned + daEarned + hraEarned + washingEarned + convEarned +
        lwwEarned + bonusEarned + otherEarned + otPay + (productionIncentive || 0)

    // ─── Deductions ───────────────────────────────────────────────────────────

    // Percentage application is ALWAYS multiply-first (x × pct / 100), the
    // same Excel-exact order as proration — dividing the pct first drifts a
    // ulp and flips .5 rounding boundaries (e.g. 5000 × 8.33%).
    const pctOf  = (x: number, pct: number) => Math.round(x * pct / 100)

    // PF base = min(EARNED Basic + DA, wage ceiling).
    // Below the ceiling → 12% of actual; at or above → 12% of the ceiling
    // (₹1,800 on ₹15,000; ₹3,000 on ₹25,000 from Oct 2026).
    // Default: full PF regardless of worked days; optional proration rule.
    const pfApplies  = rules.pf.enabled && (!isCALL || rules.call.pf) && pfApplicable !== false
    const pfBase     = Math.min(basicEarned + daEarned, rules.pf.wageCeiling)
    const pfProrated = rules.pf.prorateEmployee && workedDays < rules.pf.prorationThresholdDays
    const pfEmployee = !pfApplies ? 0 : pfProrated
        ? roundAmt(pfBase / rules.pf.prorationThresholdDays * workedDays * rules.pf.employeePct / 100, rules.rounding.pf)
        : roundAmt(pfBase * rules.pf.employeePct / 100, rules.rounding.pf)

    // ESIC eligibility: a full-month figure ≤ limit — structure gross, or
    // Basic + DA from Oct 2026 (rules.esic.eligibilityBasis).
    // Contribution base = EarnedGross minus excluded components (OT included)
    const esicLimit    = isHandicap ? rules.esic.handicapLimit : rules.esic.eligibilityLimit
    const esicWages    = esicWagesOf(rules.esic, { gross: grossEarned, washing: washingEarned, conveyance: convEarned, bonus: bonusEarned, ot: otPay, incentive: productionIncentive || 0 })
    // Eligibility on the full-month structure or on what was earned (settings).
    const esicBase     = esicEligibilityBase(rules.esic, { basic, da, gross: grossFullMonth }, { basic: basicEarned, da: daEarned, gross: grossEarned })
    // Charged on ESIC wages, or on earned Basic + DA (settings).
    const esicCharge   = esicChargeAmount(rules.esic, { esicWages, basicDa: basicEarned + daEarned })
    const esicEligible = rules.esic.enabled && (!isCALL || rules.call.esic) && esicApplicable !== false && esicBase <= esicLimit
    const esiEmployee  = esicEligible ? roundAmt(esicCharge * rules.esic.employeePct / 100, rules.rounding.esic) : 0

    // PT: slab on EARNED gross, but the female limit on the full-month
    // STRUCTURE gross — two different figures on purpose, see computePt.
    const pt = computePt(grossEarned, rules.pt, {
        isFebruary: isFeb,
        isFemale,
        isCall: isCALL,
        femaleExemptBasis: rules.pt.femaleExemptOn === "earned" ? grossEarned : grossFullMonth,
    })

    // Canteen & other deductions
    // A typed amount wins over days × rate. Checked against null rather than
    // falsiness so an explicit 0 ("no canteen this month") isn't silently
    // replaced by a stale day count.
    const canteenManual = canteenAmount ?? null
    const canteen = canteenManual !== null && Number.isFinite(canteenManual)
        ? canteenManual
        : canteenDays * canteenRatePerDay

    const totalDeductions =
        pfEmployee + esiEmployee + pt +
        (lwf || 0) + (otherDeductions || 0) +
        canteen + (penalty || 0) + (advance || 0)

    const netSalary = grossEarned - totalDeductions

    // ─── Employer Contributions ───────────────────────────────────────────────
    // Employer PF — 4 components on Basic + DA up to the employer ceiling
    // (the employee's ceiling unless Calculation Settings sets another).
    const erBase      = employerPfBase(rules.pf, basicEarned + daEarned)
    // Not in the pension scheme: no EPS, and the remainder line below then puts
    // the whole employer share into EPF — the total employer PF is unchanged.
    const eps         = !pfApplies || pensionApplicable === false ? 0 : pctOf(erBase, rules.pf.employer.epsPct)
    // EPF employer is the REMAINDER of the combined EPS+EPF share, not an
    // independently rounded 3.67%. EPFO computes the 12% employer share and
    // subtracts EPS from it, so EPS + EPF must come to exactly ROUND(12%) —
    // rounding each rate separately breaks that on 3,746 of the 15,000
    // possible bases (verified by sweep), the remainder form on none.
    // At the ₹15,000 ceiling, which is where most staff here sit:
    //   independent → ROUND(1249.5)=1250 + ROUND(550.5)=551      → ₹1,951
    //   remainder   → 1800 − 1250 = 550                          → ₹1,950  ✓
    const epfEmployer = !pfApplies ? 0
        : pctOf(erBase, rules.pf.employer.epsPct + rules.pf.employer.epfPct) - eps
    const edli        = !pfApplies ? 0 : pctOf(erBase, rules.pf.employer.edliPct)
    const epfAdmin    = !pfApplies ? 0 : pctOf(erBase, rules.pf.employer.adminPct)
    const pfEmployer  = eps + epfEmployer + edli + epfAdmin

    // ESIC Employer: CEIL(esicWages × employer %)
    const esiEmployer = esicEligible ? roundAmt(esicCharge * rules.esic.employerPct / 100, rules.rounding.esic) : 0

    const ctc = grossFullMonth + pfEmployer + esiEmployer

    return {
        // Full month (rate/structure)
        basicFull: basic, daFull: da, hraFull, washingFull: washing,
        conveyanceFull: conveyance, lwwFull: leaveWithWages, bonusFull,
        otherFull: otherAllowance, grossFullMonth,
        // Earned (prorated)
        basicSalary: basicEarned, da: daEarned, hra: hraEarned,
        washing: washingEarned, conveyance: convEarned, lwwEarned,
        bonus: bonusEarned, allowances: otherEarned,
        otDays, overtimePay: otPay, productionIncentive: productionIncentive || 0,
        grossSalary: grossEarned,
        // Deductions
        pfEmployee, esiEmployee, pfEmployer, esiEmployer,
        pt, lwf: lwf || 0, canteenDays, canteen, canteenAmount: canteenManual,
        penalty: penalty || 0, advance: advance || 0,
        otherDeductions: otherDeductions || 0,
        totalDeductions, netSalary, ctc,
    }
}

// ─── Full-month cost preview ─────────────────────────────────────────────────
// Structure screens (Salary Master, Setup, Compliance Master) show what a
// full 26/26 month costs: gross, statutory deductions, employer contributions
// and CTC — with zero attendance-driven inputs. One shared helper so every
// preview matches the engine exactly instead of re-implementing the formula.

export function calcFullMonthCosts(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    hra?: number; bonus?: number
    complianceType?: string
    isHandicap?: boolean
}, opts: { gender?: string } = {}, rules: PayrollRules = DEFAULT_PAYROLL_RULES) {
    return calcGrowusPayroll(
        { ...sal, otRatePerHour: 0, canteenRatePerDay: 0 },
        {
            monthDays: 26, workedDays: 26,
            otDays: 0, canteenDays: 0,
            penalty: 0, advance: 0, otherDeductions: 0,
            productionIncentive: 0, lwf: 0,
            gender: opts.gender ?? "Male",
            month: 1, // standard month — previews never show the February PT special
        },
        rules
    )
}
