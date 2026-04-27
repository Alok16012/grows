// ─── Growus Salary Formula ────────────────────────────────────────────────────
//
// complianceType:
//   "CALL" → No PF, No ESIC  (temporary / contract / non-compliance roles)
//   "OR"   → PF + ESIC apply  (full-time / full-compliance roles)
//
// PT (Professional Tax – Maharashtra slab):
//   Gross ≤ ₹7,500              → ₹0
//   Gross ₹7,501–₹10,000       → ₹175
//   Gross > ₹10,000 (non-Feb)  → ₹200
//   Gross > ₹10,000 (February) → ₹300  (annual ₹100 adjustment)
//
// ESIC:
//   Applicable only when FULL MONTH gross rate ≤ ₹21,000 (not prorated earned)
//   Employee: 0.75%   Employer: 3.25%  of (earned gross − washing − bonus)
//
// Bonus: 8.33% of (Basic + DA) — statutory bonus formula
//
// OT: otDays from attendance = OT hours directly (no ×4 multiplier)
//     OT Pay = otDays × otRatePerHour
//
export function calcGrowusPayroll(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number
    bonus?: number             // ignored — always calculated as (basic+da)×8.33%
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
        otRatePerHour, canteenRatePerDay,
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
    // Bonus = 8.33% of (Basic + DA) — statutory formula; CALL employees get ₹0
    const bonusFull  = isCALL ? 0 : (basic + da) * 0.0833
    const grossFullMonth = basic + da + hraFull + washing + conveyance + leaveWithWages + bonusFull + otherAllowance

    // ─── Prorated earned (ROUND to 0 decimal) ─────────────────────────────────
    const r = (x: number) => Math.round(x / monthDays * workedDays)
    const basicEarned   = r(basic)
    const daEarned      = r(da)
    const hraEarned     = r(hraFull)
    const washingEarned = r(washing)
    const convEarned    = r(conveyance)
    const lwwEarned     = r(leaveWithWages)
    const bonusEarned   = r(bonusFull)
    const otherEarned   = r(otherAllowance)

    // OT pay: otDays = OT hours from attendance (1 OT day = 1 OT hour, no ×4)
    const otPay = Math.round(otRatePerHour * otDays)

    const grossEarned = basicEarned + daEarned + hraEarned + washingEarned + convEarned +
        lwwEarned + bonusEarned + otherEarned + otPay + (productionIncentive || 0)

    // ─── Deductions ───────────────────────────────────────────────────────────

    // PF: OR compliance only. ROUND(15000/26 × workedDays × 12%, 0), cap ₹1,800
    const pfEmployee = isCALL ? 0
        : (workedDays >= 26
            ? 1800
            : Math.round((15000 / 26) * workedDays * 0.12))

    // ESIC eligibility: based on FULL MONTH gross rate (not earned amount)
    // An employee is covered if their monthly wage rate is ≤ ₹21,000
    const esicEligible  = !isCALL && grossFullMonth <= 21000
    const esicBase      = grossEarned - washingEarned - bonusEarned
    const esiEmployee   = esicEligible ? Math.ceil(esicBase * 0.0075) : 0

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
    // Employer PF: 13% of ₹15,000 = ₹1,950 (12% EPF/EPS + 0.5% EDLI + 0.5% admin)
    const pfEmployer = isCALL ? 0 : Math.round(15000 * 0.13)

    // Employer ESIC: 3.25% of (fullGross − washing − bonus), based on full month rate
    const esiEmployer = esicEligible
        ? Math.ceil((grossFullMonth - washing - bonusFull) * 0.0325)
        : 0

    const ctc = grossFullMonth + pfEmployer + esiEmployer

    return {
        // Full month
        basicFull: basic, daFull: da, hraFull, washingFull: washing,
        conveyanceFull: conveyance, lwwFull: leaveWithWages, bonusFull,
        otherFull: otherAllowance, grossFullMonth,
        // Earned
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
