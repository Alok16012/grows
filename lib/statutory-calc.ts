// Statutory figures per payroll row — EPF / EPS / EDLI wages and contributions,
// ESIC wages. Shared by the compliance reports (ECR, challans, registers) and
// the challan register, so every figure comes from one place.
import { PayrollRules, esicChargeAmount, employerPfBase, esicWagesOf } from "@/lib/payroll-rules"

/** The payroll fields these figures need. */
export type StatRow = {
    pensionApplicable?: boolean
    basicSalary: number
    da: number
    pfEmployee: number
    grossSalary: number
    washing?: number | null
    conveyance?: number | null
    bonus?: number | null
    overtimePay?: number | null
}

/**
 * EPF / EPS / EDLI wages, all three the same figure: earned Basic + DA capped
 * at the statutory ceiling. This used to return Basic + DA uncapped, so anyone
 * earning above ₹15,000 was filed with their real wage — 16,861 and 19,179 in
 * August — against contributions that had been computed on 15,000. The wage and
 * the contribution on the same ECR row disagreed.
 */
export function pfWages(p: StatRow, rules: PayrollRules) {
    // No employee PF (CALL / PF disabled) → no PF wages, so every PF column
    // derived from here (EPS, EPF-ER, EDLI, admin) is 0 for that member too.
    if (!hasPf(p)) return 0
    return Math.min(p.basicSalary + p.da, rules.pf.wageCeiling)
}

/** A PF member this month: the engine deducted employee PF. */
export const hasPf = (p: StatRow) => p.pfEmployee > 0

/** Wages employer PF / EPS were worked out on: Basic + DA up to the employer ceiling. */
export function employerPfWages(p: StatRow, rules: PayrollRules) {
    if (!hasPf(p)) return 0
    return employerPfBase(rules.pf, p.basicSalary + p.da)
}

export function epsContrib(p: StatRow, rules: PayrollRules) {
    // Outside the pension scheme: no EPS. epfEmployerContrib then files the
    // whole 12% employer share as EPF, matching lib/payroll-calc.ts.
    if (p.pensionApplicable === false) return 0
    return Math.round(employerPfWages(p, rules) * rules.pf.employer.epsPct / 100)
}

/** EPS wages: the PF wages, or 0 for a member outside the pension scheme. */
export function epsWages(p: StatRow, rules: PayrollRules) {
    return p.pensionApplicable === false ? 0 : employerPfWages(p, rules)
}

/**
 * The employer's EPF share for the ECR: the 12% employer contribution minus
 * EPS, so the two always add back to exactly the 12%.
 *
 * NOT p.pfEmployer, which is the full cost to the company and includes EDLI
 * and admin charges — those are challan lines of their own, not part of a
 * member's EPF contribution. Filing 1,950 here instead of 550 overstated every
 * capped member by 1,400.
 */
export function epfEmployerContrib(p: StatRow, rules: PayrollRules) {
    const w = employerPfWages(p, rules)
    const share = Math.round(w * (rules.pf.employer.epsPct + rules.pf.employer.epfPct) / 100)
    return Math.max(0, share - epsContrib(p, rules))
}
export function esiWages(p: StatRow, rules: PayrollRules) {
    // Must mirror lib/payroll-calc.ts exactly, conveyance included — a challan
    // that disagrees with the wage sheet is the whole point of this report.
    // Clamp at 0 — excluded components > gross (e.g., zero-day month) was
    // producing negative ESI wages, which EPFO/ESIC validators reject.
    const wages = esicWagesOf(rules.esic, { gross: p.grossSalary, washing: p.washing ?? 0, conveyance: p.conveyance ?? 0, bonus: p.bonus ?? 0, ot: p.overtimePay ?? 0, incentive: (p as any).productionIncentive ?? 0 })
    // Filed on what the % was charged on (Calculation Settings).
    return esicChargeAmount(rules.esic, { esicWages: wages, basicDa: p.basicSalary + p.da })
}
