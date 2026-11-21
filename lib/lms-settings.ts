import prisma from "@/lib/prisma"

// LMS settings (Training (LMS) → Settings). Assignment, reminder, escalation
// and retraining rules live here — nothing about them is fixed in code.

export type LmsSettings = {
    autoAssign: {
        /** Every night, enrol everyone who matches a course's assignment rules and isn't enrolled yet. */
        nightly: boolean
        /** Also enrol right away when an employee is added, or their designation / site changes. */
        onChange: boolean
    }
    defaults: {
        /** Days to finish a course when its rule has no due days. */
        dueDays: number
        /** Pass mark and attempts for new courses. */
        passingScore: number
        maxAttempts: number
    }
    reminders: {
        /** Remind the learner this many days before the due date (and the day before). 0 = off. */
        beforeDays: number
        /** While overdue, remind the learner every N days. 0 = off. */
        overdueEveryDays: number
        /** Tell HR / the manager once a course is this many days overdue. 0 = off. */
        escalateAfterDays: number
        escalateTo: "hr" | "manager" | "both"
    }
    quiz: {
        /** Question bank: each attempt draws this many random questions. 0 = all questions. */
        questionsPerAttempt: number
        /** Show answer options in a random order. */
        shuffleOptions: boolean
    }
    skills: {
        /** Level a linked skill reaches when its course is passed (theory). */
        courseLevel: number
        /** "Multiskilled" = at least this many skills at this level or above. */
        multiskillMinLevel: number
        multiskillMinSkills: number
        /** A person's skill levels count as "updated" if reviewed within this many days. */
        reviewEveryDays: number
    }
    retraining: {
        /** Courses with a validity period re-enrol the person before the certificate expires. */
        enabled: boolean
        /** How many days before expiry the refresher is assigned. */
        beforeDays: number
    }
}

export const DEFAULT_LMS_SETTINGS: LmsSettings = {
    autoAssign: { nightly: true, onChange: true },
    defaults: { dueDays: 14, passingScore: 70, maxAttempts: 3 },
    reminders: { beforeDays: 3, overdueEveryDays: 3, escalateAfterDays: 7, escalateTo: "hr" },
    quiz: { questionsPerAttempt: 0, shuffleOptions: true },
    skills: { courseLevel: 1, multiskillMinLevel: 3, multiskillMinSkills: 2, reviewEveryDays: 90 },
    retraining: { enabled: true, beforeDays: 15 },
}

const KEY = "lmsSettings"
const num = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d)

export function sanitizeLmsSettings(v: any): LmsSettings {
    const d = DEFAULT_LMS_SETTINGS
    const a = v?.autoAssign ?? {}, df = v?.defaults ?? {}, r = v?.reminders ?? {}, rt = v?.retraining ?? {}, sk = v?.skills ?? {}, qz = v?.quiz ?? {}
    return {
        autoAssign: { nightly: bool(a.nightly, d.autoAssign.nightly), onChange: bool(a.onChange, d.autoAssign.onChange) },
        defaults: {
            dueDays: num(df.dueDays, d.defaults.dueDays, 1, 365),
            passingScore: num(df.passingScore, d.defaults.passingScore, 1, 100),
            maxAttempts: num(df.maxAttempts, d.defaults.maxAttempts, 0, 20),
        },
        reminders: {
            beforeDays: num(r.beforeDays, d.reminders.beforeDays, 0, 60),
            overdueEveryDays: num(r.overdueEveryDays, d.reminders.overdueEveryDays, 0, 60),
            escalateAfterDays: num(r.escalateAfterDays, d.reminders.escalateAfterDays, 0, 180),
            escalateTo: r.escalateTo === "manager" || r.escalateTo === "both" || r.escalateTo === "hr" ? r.escalateTo : d.reminders.escalateTo,
        },
        quiz: { questionsPerAttempt: num(qz.questionsPerAttempt, d.quiz.questionsPerAttempt, 0, 100), shuffleOptions: bool(qz.shuffleOptions, d.quiz.shuffleOptions) },
        skills: {
            courseLevel: num(sk.courseLevel, d.skills.courseLevel, 1, 4),
            multiskillMinLevel: num(sk.multiskillMinLevel, d.skills.multiskillMinLevel, 1, 4),
            multiskillMinSkills: num(sk.multiskillMinSkills, d.skills.multiskillMinSkills, 2, 20),
            reviewEveryDays: num(sk.reviewEveryDays, d.skills.reviewEveryDays, 7, 730),
        },
        retraining: { enabled: bool(rt.enabled, d.retraining.enabled), beforeDays: num(rt.beforeDays, d.retraining.beforeDays, 0, 180) },
    }
}

export async function getLmsSettings(): Promise<LmsSettings> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
        return row ? sanitizeLmsSettings(JSON.parse(row.value)) : DEFAULT_LMS_SETTINGS
    } catch {
        return DEFAULT_LMS_SETTINGS
    }
}

export async function saveLmsSettings(v: unknown, updatedBy?: string | null): Promise<LmsSettings> {
    const next = sanitizeLmsSettings(v)
    const value = JSON.stringify(next)
    await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy: updatedBy ?? null }, update: { value, updatedBy: updatedBy ?? null } })
    return next
}
