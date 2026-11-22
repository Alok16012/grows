// Tasks module — shared constants and settings. Client-safe.

export const PRIORITIES = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" } as const
export type Priority = keyof typeof PRIORITIES
export const TASK_STATUS = { TODO: "To do", IN_PROGRESS: "In progress", AWAITING_APPROVAL: "Waiting for approval", DONE: "Done", CANCELLED: "Cancelled" } as const
export type TaskStatus = keyof typeof TASK_STATUS
export const OPEN_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "AWAITING_APPROVAL"]

export type TaskSettings = {
    /** Anyone who can sign in may assign tasks (off = only the Tasks → Create permission). */
    anyoneCanAssign: boolean
    /** New tasks need the assigner's approval when marked done, unless changed on the task. */
    defaultNeedsApproval: boolean
    /** Remind the assignee this many hours before the due time (0 = off). */
    remindHoursBefore: number
    /** Remind about overdue tasks at most once per this many hours (0 = off). */
    overdueRemindEveryHours: number
    /** Also tell the person who assigned it when a task goes overdue. */
    notifyAssignerOnOverdue: boolean
}
export const DEFAULT_TASK_SETTINGS: TaskSettings = { anyoneCanAssign: false, defaultNeedsApproval: false, remindHoursBefore: 24, overdueRemindEveryHours: 24, notifyAssignerOnOverdue: true }

export function sanitizeTaskSettings(v: any): TaskSettings {
    const d = DEFAULT_TASK_SETTINGS
    const b = (x: unknown, def: boolean) => typeof x === "boolean" ? x : def
    const n = (x: unknown, def: number) => { const k = Math.round(Number(x)); return x !== null && x !== "" && x !== undefined && Number.isFinite(k) ? Math.max(0, Math.min(720, k)) : def }
    return {
        anyoneCanAssign: b(v?.anyoneCanAssign, d.anyoneCanAssign), defaultNeedsApproval: b(v?.defaultNeedsApproval, d.defaultNeedsApproval),
        remindHoursBefore: n(v?.remindHoursBefore, d.remindHoursBefore), overdueRemindEveryHours: n(v?.overdueRemindEveryHours, d.overdueRemindEveryHours),
        notifyAssignerOnOverdue: b(v?.notifyAssignerOnOverdue, d.notifyAssignerOnOverdue),
    }
}

export type Attachment = { name: string; url: string }
