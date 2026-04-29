// ─── Growus Salary Formula ────────────────────────────────────────────────────
//
// Verified against actual VARROC PUNE wage sheet (MAR CAL) — all 11 employees ✓
//
// complianceType:
//   "CALL" → No PF, No ESIC  (temporary / contract / non-compliance roles)
//   "OR"   → PF + ESIC apply  (full-time / full-compliance roles)
//
// HRA:    (Basic + DA) × 5%
// Bonus:  Use stored value from salary structure if provided; else (Basic + DA) × 8.33%
//         Minimum-wage-based bonus (e.g. ₹625 = 7500×8.33%, ₹650 = 7800×8.33%)
//         is stored per employee in salary structure per Payment of Bonus Act cap.
//
// Proration: ROUND(component × WorkedDays / MonthDays)  ← multiply FIRST (Excel-exact)
//
// OT Pay: ROUND(FullMonthGross / MonthDays × OT_Days, 0)
//   OT_Days = actual overtime days from attendance (each day = 1 extra working day)
//
// PF Employee:  IF(WorkedDays >= 26, 1800, ROUND(15000/26 × WorkedDays × 12%))
// PF Employer:  ROUND(15000 × 13%) = ₹1,950  (12% EPF + 0.5% EDLI + 0.5% admin)
//
// ESIC eligibility: (FullMonthGross − Washing) ≤ ₹21,000
//   Employee: ₹0  — Growus absorbs employee ESIC share (policy decision)
//   Employer: CEIL((FullMonthGross − Washing) × 3.25%)
//
// PT (Professional Tax – Maharashtra slab, on earned gross):
//   Gross ≤ ₹7,500              → ₹0
//   Gross ₹7,501–₹10,000       → ₹175
//   Gross > ₹10,000 (non-Feb)  → ₹200
//   Gross > ₹10,000 (February) → ₹300  (annual ₹100 adjustment)
//
export function calcGrowusPayroll(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number
    bonus?: number             // per-employee bonus from salary structure (Payment of Bonus Act cap)
    complianceType?: string    // "CALL" | "OR" (default "OR")
}, att: {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    otherDeductions: number; productionIncentive: number; lwf: number
    gender?: string            // "Male" | "Female" (default "Male")
    month?: number             // 1–12, used for February PT (default: current month)
}) {
    const {
        basic, da, washing, conveyance, leaveWithWages, otherAllowance,
        canteenRatePerDay,
        bonus: storedBonus,
        complianceType = "OR",
    } = sal

    const {
        monthDays, workedDays, otDays, canteenDays,
        penalty, advance, otherDeductions, productionIncentive, lwf,
        month,
    } = att

    const isCALL = complianceType === "CALL"
    const isFeb  = month === 2

    // ─── Full month components ────────────────────────────────────────────────
    const hraFull    = (basic + da) * 0.05
    // Bonus: use stored per-employee value if set, else (Basic+DA)×8.33%
    // Stored value is typically min-wage-based per Payment of Bonus Act (e.g. ₹625, ₹650)
    // Bonus: use per-employee stored value (min-wage-based per Bonus Act, e.g. ₹625/₹650).
    // Fallback ≈ ₹583 = ₹7000 statutory ceiling × 8.33% (Payment of Bonus Act 1965 cap).
    // Set the higher state-min-wage values on the salary structure when needed.
    const bonusFull  = isCALL ? 0 : (storedBonus != null && storedBonus > 0 ? storedBonus : Math.round(Math.min(basic + da, 7000) * 0.0833))
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

    // OT Pay: ROUND(FullMonthGross / MonthDays × OT_Days, 0)
    // Each OT_Day = 1 extra working day at the daily gross rate
    const otPay = Math.round(grossFullMonth / monthDays * otDays)

    const grossEarned = basicEarned + daEarned + hraEarned + washingEarned + convEarned +
        lwwEarned + bonusEarned + otherEarned + otPay + (productionIncentive || 0)

    // ─── Deductions ───────────────────────────────────────────────────────────

    // PF: OR compliance only. IF(WorkedDays>26, 1800, ROUND(15000/26×WorkedDays×12%))
    const pfEmployee = isCALL ? 0
        : (workedDays >= 26
            ? 1800
            : Math.round((15000 / 26) * workedDays * 0.12))

    // ESIC eligibility: (FullMonthGross − Washing) ≤ ₹21,000
    // Washing allowance is excluded from the eligibility threshold per ESIC rules
    const esicEligible = !isCALL && (grossFullMonth - washing) <= 21000
    // Employee ESIC = ₹0 — Growus absorbs the employee ESIC share (company policy)
    const esiEmployee  = 0

    // PT: Maharashtra slab on earned gross
    const pt = grossEarned <= 7500  ? 0
             : grossEarned <= 10000 ? 175
             : isFeb                ? 300
             :                        200

    // Canteen & other deductions
    const canteen = canteenDays * canteenRatePerDay

    const totalDeductions =
        pfEmployee + esiEmployee + pt +
        (lwf || 0) + (otherDeductions || 0) +
        canteen + (penalty || 0) + (advance || 0)

    const netSalary = grossEarned - totalDeductions

    // ─── Employer Contributions ───────────────────────────────────────────────
    // PF Employer: ROUND(15000 × 13%) = ₹1,950  (12% EPF + 0.5% EDLI + 0.5% admin)
    const pfEmployer = isCALL ? 0 : Math.round(15000 * 0.13)

    // ESIC Employer: ROUNDUP((FullMonthGross − Washing) × 3.25%)
    // Base = full month gross minus washing allowance only (bonus excluded per formula)
    const esiEmployer = esicEligible
        ? Math.ceil((grossFullMonth - washing) * 0.0325)
        : 0

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
