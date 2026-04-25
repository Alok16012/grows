// ─── Growus Salary Formula ────────────────────────────────────────────────────
//
// complianceType:
//   "CALL" → No PF, No ESIC  (temporary / contract / non-compliance roles)
//   "OR"   → PF + ESIC apply  (full-time / full-compliance roles)
//
// PT (Professional Tax – Maharashtra slab, Male only):
//   Gross ≤ ₹7,500  → ₹0
//   Gross ₹7,501–₹10,000 → ₹175
//   Gross > ₹10,000 → ₹200
//   Female → ₹0 always
//
export function calcGrowusPayroll(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number
    bonus?: number             // monthly bonus (default: 7000/12)
    complianceType?: string    // "CALL" | "OR" (default "OR")
}, att: {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    otherDeductions: number; productionIncentive: number; lwf: number
    gender?: string            // "Male" | "Female" (default "Male")
}) {
    const {
        basic, da, washing, conveyance, leaveWithWages, otherAllowance,
        otRatePerHour, canteenRatePerDay,
        bonus,
        complianceType = "OR",
    } = sal

    const {
        monthDays, workedDays, otDays, canteenDays,
        penalty, advance, otherDeductions, productionIncentive, lwf,
        gender = "Male",
    } = att

    const isCALL = complianceType === "CALL"
    const isFemale = gender?.toLowerCase() === "female"

    // ─── Full month components ────────────────────────────────────────────────
    const hraFull   = (basic + da) * 0.05
    const bonusFull = bonus ?? (7000 / 12)
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

    // OT pay: ROUND(rate × OT_DAYS × 4, 0)
    const otPay = Math.round(otRatePerHour * otDays * 4)

    const grossEarned = basicEarned + daEarned + hraEarned + washingEarned + convEarned +
        lwwEarned + bonusEarned + otherEarned + otPay + (productionIncentive || 0)

    // ─── Deductions ───────────────────────────────────────────────────────────

    // PF: only for OR compliance
    // IF(workedDays>26, 1800, ROUND(15000/26*workedDays*12%, 0))
    const pfEmployee = isCALL ? 0
        : (workedDays > 26
            ? 1800
            : Math.round((15000 / 26) * workedDays * 0.12))

    // ESIC: only for OR compliance — no gross ceiling, all OR employees contribute
    // ROUNDUP((grossEarned - washing - bonus) * 0.75%, 0)
    const esiEmployee = isCALL ? 0
        : Math.ceil((grossEarned - washingEarned - bonusEarned) * 0.0075)

    // PT: Maharashtra slab (Male) — Female always exempt
    const pt = isFemale ? 0
        : grossEarned <= 7500  ? 0
        : grossEarned <= 10000 ? 175
        : 200

    // Canteen
    const canteen = canteenDays * canteenRatePerDay

    const totalDeductions =
        pfEmployee + esiEmployee + pt +
        (lwf || 0) + (otherDeductions || 0) +
        canteen + (penalty || 0) + (advance || 0)

    const netSalary = grossEarned - totalDeductions

    // ─── Employer Contributions ───────────────────────────────────────────────
    // Employer PF = 15000 × 13% = 1950 (only OR)
    const pfEmployer = isCALL ? 0 : Math.round(15000 * 0.13)

    // Employer ESIC: 3.25% of (fullGross - washing - bonus), only OR
    const esiEmployer = isCALL ? 0
        : Math.ceil((grossFullMonth - washing - bonusFull) * 0.0325)

    // CTC = fullGross + empPF + empESIC
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
