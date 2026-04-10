// ─── Growus Salary Formula (from Internal Calculation.xlsx) ───────────────────
export function calcGrowusPayroll(sal: {
    basic: number; da: number; washing: number; conveyance: number
    leaveWithWages: number; otherAllowance: number
    otRatePerHour: number; canteenRatePerDay: number
}, att: {
    monthDays: number; workedDays: number; otDays: number
    canteenDays: number; penalty: number; advance: number
    otherDeductions: number; productionIncentive: number; lwf: number
}) {
    const { basic, da, washing, conveyance, leaveWithWages, otherAllowance, otRatePerHour, canteenRatePerDay } = sal
    const { monthDays, workedDays, otDays, canteenDays, penalty, advance, otherDeductions, productionIncentive, lwf } = att

    // Full month components
    const hraFull = (basic + da) * 0.05
    const bonusFull = 7000 / 12

    const grossFullMonth = basic + da + hraFull + washing + conveyance + leaveWithWages + bonusFull + otherAllowance

    // Prorated earned (ROUND to 0 decimal)
    const r = (x: number) => Math.round(x / monthDays * workedDays)
    const basicEarned   = r(basic)
    const daEarned      = r(da)
    const hraEarned     = r(hraFull)
    const washingEarned = r(washing)
    const convEarned    = r(conveyance)
    const lwwEarned     = r(leaveWithWages)
    const bonusEarned   = r(bonusFull)
    const otherEarned   = r(otherAllowance)

    // OT pay: ROUND(170 × OT_DAYS × 4, 0)
    const otPay = Math.round(otRatePerHour * otDays * 4)

    const grossEarned = basicEarned + daEarned + hraEarned + washingEarned + convEarned +
        lwwEarned + bonusEarned + otherEarned + otPay + (productionIncentive || 0)

    // ─── Deductions ───────────────────────────────────────────────────────────
    // PF: IF(workedDays>26, 1800, ROUND(15000/26*workedDays*12%, 0))
    const pfEmployee = workedDays > 26
        ? 1800
        : Math.round((15000 / 26) * workedDays * 0.12)

    // ESIC: ROUNDUP((grossEarned - washingEarned - bonusEarned) * 0.75%, 0)
    const esiEmployee = Math.ceil((grossEarned - washingEarned - bonusEarned) * 0.0075)

    // PT slab (Maharashtra)
    const pt = grossEarned > 10000 ? 200 : (grossEarned > 7500 ? 175 : 0)

    // Canteen
    const canteen = canteenDays * canteenRatePerDay

    const totalDeductions = pfEmployee + esiEmployee + pt + (lwf || 0) + (otherDeductions || 0) + canteen + (penalty || 0) + (advance || 0)
    const netSalary = grossEarned - totalDeductions

    // ─── Employer Contributions ───────────────────────────────────────────────
    // Employer PF = 15000 * 13% = 1950 (fixed)
    const pfEmployer = Math.round(15000 * 0.13)

    // Employer ESIC: ROUNDUP((grossFullMonth - washing - bonusFull) * 3.25%, 0)
    const esiEmployer = Math.ceil((grossFullMonth - washing - bonusFull) * 0.0325)

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
