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

export type EcrDownloadResult = { ok: true } | { ok: false; message: string }

export async function downloadEcrTxt(month: number, year: number): Promise<EcrDownloadResult> {
    const res = await fetch(
        `/api/payroll/reports/compliance?month=${month}&year=${year}&type=pf-ecr&format=txt`
    )
    if (!res.ok) {
        const detail = await res.text().catch(() => "")
        return { ok: false, message: detail.trim() || "No data found for this period" }
    }

    const text = await res.text()
    if (!text.trim()) return { ok: false, message: "No data to download" }

    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))
    try {
        const a = document.createElement("a")
        a.href = url
        a.download = `PF_ECR_${MONTHS[month - 1]}_${year}.txt`
        a.click()
    } finally {
        URL.revokeObjectURL(url)
    }
    return { ok: true }
}
