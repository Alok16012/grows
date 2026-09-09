// The EPFO ECR upload file format.
//
// Kept separate from the compliance route so it can be exercised without a
// database: the route works out the statutory figures (see pfWages,
// epsContrib, epfEmployerContrib, ncpDays there), this owns how they're
// written to the file EPFO's portal ingests.

export const ECR_DELIMITER = "#~#"

/** One member's already-computed ECR figures. Amounts may carry decimals. */
export type EcrMember = {
    uan: string
    name: string
    grossWages: number
    /** Capped Basic + DA. Filed as EPF, EPS and EDLI wages alike. */
    pfWages: number
    epfEmployee: number
    epsContribution: number
    epfEmployer: number
    ncpDays: number
}

/**
 * One line per member, eleven `#~#`-separated fields, no header. The field
 * order is fixed by EPFO and must not be rearranged:
 *
 *   UAN, Member Name, Gross Wages, EPF Wages, EPS Wages, EDLI Wages,
 *   EPF Contribution (EE), EPS Contribution, EPF Contribution (ER),
 *   NCP Days, Refund of Advances
 */
export function ecrLine(m: EcrMember): string {
    // Whole rupees throughout — the portal rejects decimals, and gross and the
    // wage figures are Floats that routinely carry them.
    const wages = Math.round(m.pfWages)
    // A name carrying the delimiter or a newline would split one member across
    // fields or lines and corrupt every row after it.
    const name = m.name.replace(/[\r\n]+/g, " ").split(ECR_DELIMITER).join(" ")
    return [
        m.uan,
        name,
        Math.round(m.grossWages),
        wages,
        wages,
        wages,
        Math.round(m.epfEmployee),
        Math.round(m.epsContribution),
        Math.round(m.epfEmployer),
        // Always a number, including zero. The August reference file left this
        // field empty when nobody had lost days, but the portal rejects the
        // blank — `#~##~#0` errors, `#~#0#~#0` is accepted.
        Math.round(m.ncpDays),
        0, // Refund of advances — not tracked, always nil
    ].join(ECR_DELIMITER)
}

/** LF separated, no trailing newline, matching EPFO's own sample files. */
export const buildEcrText = (members: EcrMember[]): string =>
    members.map(ecrLine).join("\n")
