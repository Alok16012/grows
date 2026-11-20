// Files that go with a message (WhatsApp document header, email attachment),
// made at send time from the message's refType / refId so nothing heavy is
// stored in the queue.

import { renderInspectionReport } from "@/lib/inspection-report-pdf"

export type CommAttachment = { filename: string; content: Buffer; contentType?: string }

type Builder = (refId: string) => Promise<CommAttachment | null>

const BUILDERS: Record<string, { refType: string; build: Builder }> = {
    // The approved inspection report (only while it is still approved).
    inspection_report: { refType: "Inspection", build: async id => { const r = await renderInspectionReport(id); return r ? { ...r, contentType: "application/pdf" } : null } },
}

export async function buildAttachment(event: string, refType: string | null, refId: string | null): Promise<CommAttachment | null> {
    const b = BUILDERS[event]
    if (!b || !refId || refType !== b.refType) return null
    try { return await b.build(refId) } catch (e) { console.error("[COMM_ATTACHMENT]", event, e); return null }
}
