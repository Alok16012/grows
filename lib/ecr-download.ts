// Downloads the EPFO ECR upload file.
//
// The ECR is the one compliance "report" that isn't a report: EPFO's portal
// ingests a plain text file of `#~#`-separated fields with no header, so it
// skips the JSON-to-spreadsheet path every other download takes and is served
// pre-formatted by /api/payroll/reports/compliance?format=txt.
//
// Lives here because the compliance panel and the standalone compliance page
// carry duplicate copies of their download logic. The ECR must not become a
// third thing that drifts between them.

const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"]

export type EcrDownloadResult = { ok: true; draft?: number; rows?: number; missingIp?: number } | { ok: false; message: string }

/** ESIC monthly contribution upload (.xls, the portal's MC template). */
export async function downloadEsicEcrXls(month: number, year: number): Promise<EcrDownloadResult> {
    const res = await fetch(`/api/payroll/reports/compliance?month=${month}&year=${year}&type=esic-ecr&includeDraft=1`)
    if (!res.ok) {
        const detail = await res.text().catch(() => "")
        return { ok: false, message: detail.trim() || "No data found for this period" }
    }
    const draft = Number(res.headers.get("X-Payroll-Draft") || 0)
    const rows = Number(res.headers.get("X-Esic-Rows") || 0)
    const missingIp = Number(res.headers.get("X-Esic-Missing-Ip") || 0)
    const url = URL.createObjectURL(await res.blob())
    try {
        const a = document.createElement("a")
        a.href = url
        a.download = `ESIC_ECR_${MONTHS[month - 1]}_${year}${draft ? "_DRAFT" : ""}.xls`
        a.click()
    } finally {
        URL.revokeObjectURL(url)
    }
    return { ok: true, draft, rows, missingIp }
}

export async function downloadEcrTxt(month: number, year: number): Promise<EcrDownloadResult> {
    const res = await fetch(
        `/api/payroll/reports/compliance?month=${month}&year=${year}&type=pf-ecr&format=txt&includeDraft=1`
    )
    if (!res.ok) {
        const detail = await res.text().catch(() => "")
        return { ok: false, message: detail.trim() || "No data found for this period" }
    }

    // Rows not locked yet: the file is marked so it isn't filed by mistake.
    const draft = Number(res.headers.get("X-Payroll-Draft") || 0)
    const text = await res.text()
    if (!text.trim()) return { ok: false, message: "No data to download" }

    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))
    try {
        const a = document.createElement("a")
        a.href = url
        a.download = `PF_ECR_${MONTHS[month - 1]}_${year}${draft ? "_DRAFT" : ""}.txt`
        a.click()
    } finally {
        URL.revokeObjectURL(url)
    }
    return { ok: true, draft }
}
