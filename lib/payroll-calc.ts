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
//
// PF Employee:  pfBase = min(Basic + DA, wage ceiling ₹15,000)
//               ≤ ₹15,000 → 12% of actual. > ₹15,000 → ₹1,800 fixed.
//               Default: full PF regardless of worked days; optional proration rule.
// PF Employer (all on pfBase):
//   EPS 8.33% + EPF diff 3.67% + EDLI 0.50% + admin 0.50%  (≈ 13%)
//
// ESIC eligibility: Structure Gross ≤ ₹21,000  [₹25,000 for Handicap]
//   ESIC wages = EarnedGross − Washing − Conveyance  (OT and Bonus included)
//   Employee CEIL(0.75%), Employer CEIL(3.25%)
//
// PT (Maharashtra slab on earned gross): ≤7,500 → 0; ≤10,000 → 175; above →
//   200 (300 in February). Female employees exempt up to ₹25,000.
//
import { DEFAULT_PAYROLL_RULES, PayrollRules, computePt } from "./payroll-rules"

export function calcGrowusPayroll(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number
    hra?: number               // manual HRA from salary structure (no auto-calc)
    bonus?: number             // per-employee bonus from salary structure (Payment of Bonus Act cap)
    complianceType?: string    // "CALL" | "OR" (default "OR")
    isHandicap?: boolean       // ESIC eligibility limit: ₹25,000 for handicap, ₹21,000 otherwise
}, att: {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    otherDeductions: number; productionIncentive: number; lwf: number
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
    } = sal

    const {
        monthDays, workedDays, otDays, canteenDays,
        penalty, advance, otherDeductions, productionIncentive, lwf,
        month,
        gender,
    } = att

    const isCALL    = complianceType === "CALL"
    const isFeb     = month === 2
    const isFemale  = gender?.toLowerCase() === "female"

    // ─── Full month components ────────────────────────────────────────────────
    // HRA: use manually stored value from salary structure (no auto-calculation)
    const hraFull    = isCALL ? 0 : (storedHra != null && storedHra >= 0 ? storedHra : 0)
    // Bonus: use manually stored value from salary structure (no auto-calculation)
    const bonusFull  = isCALL ? 0 : (storedBonus != null && storedBonus > 0 ? storedBonus : 0)
    const grossFullMonth = basic + da + hraFull + washing + conveyance + leaveWithWages + bonusFull + otherAllowance

    // ─── Prorated earned (ROUND to 0 decimal) ─────────────────────────────────
    // IMPORTANT: multiply first, then divide (matches Excel order — avoids floating-point drift)
    const r = (x: number) => Math.round(x * workedDays / monthDays)
    const basicEarned   = r(basic)
    const daEarned      = r(da)
    const hraEarned     = r(hraFull)
    const washingEarned = r(washing)
    const convEarned    = r(conveyance)
    const lwwEarned     = r(leaveWithWages)
    const bonusEarned   = r(bonusFull)
    const otherEarned   = r(otherAllowance)

    // OT Pay: ROUND(otRatePerHour × hoursPerDay × OT_Days, 0)
    const otPay = Math.round(otRatePerHour * rules.ot.hoursPerDay * otDays)

    const grossEarned = basicEarned + daEarned + hraEarned + washingEarned + convEarned +
        lwwEarned + bonusEarned + otherEarned + otPay + (productionIncentive || 0)

    // ─── Deductions ───────────────────────────────────────────────────────────

    // Percentage application is ALWAYS multiply-first (x × pct / 100), the
    // same Excel-exact order as proration — dividing the pct first drifts a
    // ulp and flips .5 rounding boundaries (e.g. 5000 × 8.33%).
    const pctOf  = (x: number, pct: number) => Math.round(x * pct / 100)
    const pctCeil = (x: number, pct: number) => Math.ceil(x * pct / 100)

    // PF base = min(EARNED Basic + DA, wage ceiling ₹15,000).
    // ≤ ₹15,000 → 12% of actual. > ₹15,000 → ₹1,800 fixed.
    // Default: full PF regardless of worked days; optional proration rule.
    const pfApplies  = rules.pf.enabled && !isCALL
    const pfBase     = Math.min(basicEarned + daEarned, rules.pf.wageCeiling)
    const pfProrated = rules.pf.prorateEmployee && workedDays < rules.pf.prorationThresholdDays
    const pfEmployee = !pfApplies ? 0 : pfProrated
        ? Math.round(pfBase / rules.pf.prorationThresholdDays * workedDays * rules.pf.employeePct / 100)
        : pctOf(pfBase, rules.pf.employeePct)

    // ESIC eligibility: full-month structure gross ≤ limit
    // Contribution base = EarnedGross minus excluded components (OT included)
    const esicLimit    = isHandicap ? rules.esic.handicapLimit : rules.esic.eligibilityLimit
    const esicWages    = grossEarned
        - (rules.esic.excludeWashing ? washingEarned : 0)
        - (rules.esic.excludeConveyance ? convEarned : 0)
        - (rules.esic.excludeBonus ? bonusEarned : 0)
    const esicEligible = rules.esic.enabled && !isCALL && grossFullMonth <= esicLimit
    const esiEmployee  = esicEligible ? pctCeil(esicWages, rules.esic.employeePct) : 0

    // PT: slab on earned gross (February top-slab override, female exemption)
    const pt = computePt(grossEarned, rules.pt, { isFebruary: isFeb, isFemale, isCall: isCALL })

    // Canteen & other deductions
    const canteen = canteenDays * canteenRatePerDay

    const totalDeductions =
        pfEmployee + esiEmployee + pt +
        (lwf || 0) + (otherDeductions || 0) +
        canteen + (penalty || 0) + (advance || 0)

    const netSalary = grossEarned - totalDeductions

    // ─── Employer Contributions ───────────────────────────────────────────────
    // Employer PF — 4 components on pfBase = Basic + DA (no ceiling)
    const eps         = !pfApplies ? 0 : pctOf(pfBase, rules.pf.employer.epsPct)
    const epfEmployer = !pfApplies ? 0 : pctOf(pfBase, rules.pf.employer.epfPct)
    const edli        = !pfApplies ? 0 : pctOf(pfBase, rules.pf.employer.edliPct)
    const epfAdmin    = !pfApplies ? 0 : pctOf(pfBase, rules.pf.employer.adminPct)
    const pfEmployer  = eps + epfEmployer + edli + epfAdmin

    // ESIC Employer: CEIL(esicWages × employer %)
    const esiEmployer = esicEligible ? pctCeil(esicWages, rules.esic.employerPct) : 0

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
        pt, lwf: lwf || 0, canteenDays, canteen,
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
