// Files that go with a message (WhatsApp document header, email attachment),
// made at send time from the message's refType / refId so nothing heavy is
// stored in the queue. Phase 2 adds the inspection report PDF here.

export type CommAttachment = { filename: string; content: Buffer; contentType?: string }

type Builder = (refId: string) => Promise<CommAttachment | null>

const BUILDERS: Record<string, { refType: string; build: Builder }> = {
    // inspection_report: { refType: "Inspection", build: async id => … }  (Phase 2)
}

export async function buildAttachment(event: string, refType: string | null, refId: string | null): Promise<CommAttachment | null> {
    const b = BUILDERS[event]
    if (!b || !refId || refType !== b.refType) return null
    try { return await b.build(refId) } catch (e) { console.error("[COMM_ATTACHMENT]", event, e); return null }
}
