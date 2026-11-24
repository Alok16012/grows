"use client"

// My Learning → My skills: the levels on the skill matrix (from courses and
// on-the-job sign-offs). Hidden when the person has none yet.
import { useEffect, useState } from "react"

const LEVELS = ["Not trained", "Theory done", "Under supervision", "Independent", "Can train others"]
const TONE = ["bg-[var(--surface2)] text-[var(--text3)]", "bg-[#fef3c7] text-[#92400e]", "bg-[#e3ebff] text-[#2f5be0]", "bg-[#dcfce7] text-[#166534]", "bg-[#166534] text-white"]

export default function MySkills() {
    const [rows, setRows] = useState<{ level: number; skill: { code: string; name: string } }[]>([])
    useEffect(() => { fetch("/api/lms/learn/skills").then(r => r.ok ? r.json() : null).then(d => setRows(d?.skills ?? [])).catch(() => {}) }, [])
    if (!rows.length) return null
    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4">
            <p className="text-[14px] font-semibold text-[var(--text)] mb-2">My skills</p>
            <div className="flex flex-wrap gap-2">
                {rows.map(r => (
                    <span key={r.skill.code} className="inline-flex items-center gap-2 h-8 pl-1 pr-3 rounded-full border border-[var(--border)] text-[12.5px]" title={LEVELS[r.level]}>
                        <span className={`h-6 w-6 rounded-full font-mono text-[11.5px] font-semibold flex items-center justify-center ${TONE[r.level]}`}>{r.level}</span>
                        {r.skill.name}
                    </span>
                ))}
            </div>
            <p className="text-[11px] text-[var(--text3)] mt-2">0 not trained · 1 theory done · 2 under supervision · 3 independent · 4 can train others</p>
        </div>
    )
}
