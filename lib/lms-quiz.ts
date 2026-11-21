import prisma from "@/lib/prisma"

// Question bank: when a quiz has more questions than "Questions per attempt"
// (LMS → Settings), each attempt gets a random set. The set is picked with a
// seed (enrolment + attempt number), so the server recomputes exactly what
// the learner saw when it marks the attempt — nothing extra is stored.

/** Small deterministic PRNG (mulberry32) from a string seed. */
function rng(seed: string) {
    let h = 1779033703 ^ seed.length
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
    let a = h >>> 0
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function shuffle<T>(list: T[], seed: string): T[] {
    const r = rng(seed), out = [...list]
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
    return out
}

/** The attempt number the learner is on now (1-based), counted from the current enrolment. */
export async function currentAttemptNo(quizId: string, employeeId: string, enrolledAt: Date): Promise<number> {
    return (await prisma.quizAttempt.count({ where: { quizId, employeeId, startedAt: { gte: enrolledAt } } })) + 1
}

/**
 * The questions for one attempt. perAttempt 0 (or ≥ bank size) = all, in the
 * course's order; otherwise a random set in random order. Options are shuffled
 * too when asked.
 */
export function questionsForAttempt<Q extends { id: string; options: O[] }, O extends { id: string }>(
    questions: Q[], opts: { perAttempt: number; shuffleOptions: boolean; seed: string },
): Q[] {
    const pick = opts.perAttempt > 0 && opts.perAttempt < questions.length
        ? shuffle(questions, opts.seed).slice(0, opts.perAttempt)
        : questions
    return opts.shuffleOptions ? pick.map(q => ({ ...q, options: shuffle(q.options, `${opts.seed}:${q.id}`) })) : pick
}

export const attemptSeed = (enrollmentId: string, attemptNo: number) => `${enrollmentId}#${attemptNo}`
