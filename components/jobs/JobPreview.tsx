"use client"

import { Briefcase, MapPin, IndianRupee, Users } from "lucide-react"
import { JobPosting, formatExperience, formatSalary } from "./constants"

// Candidate-facing preview of a job posting (mirrors the final wizard screen).
export function JobPreview({ job }: { job: Partial<JobPosting> }) {
    const skills = job.skills || []
    const languages = job.languages || []
    const perks = job.perks || []

    return (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[var(--border)]">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-[var(--text)] truncate">
                            {job.title || "Job title"}
                        </h2>
                        <p className="text-sm text-[var(--accent-text)] mt-0.5">
                            {job.companyName || "Growus Auto India"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[13px] text-[var(--text2)]">
                            <span className="inline-flex items-center gap-1">
                                <Briefcase size={14} />
                                {formatExperience(job.workExpMin ?? null, job.workExpMax ?? null, !!job.freshersAllowed)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <IndianRupee size={14} />
                                {formatSalary(job.salaryMin ?? null, job.salaryMax ?? null, job.salaryPeriod)}
                            </span>
                            {job.jobLocation && (
                                <span className="inline-flex items-center gap-1">
                                    <MapPin size={14} />
                                    {job.jobLocation}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center font-bold text-lg">
                        {(job.companyName || "G").charAt(0).toUpperCase()}
                    </div>
                </div>
                <div className="flex items-center gap-4 mt-4 text-[12px] text-[var(--text3)]">
                    <span className="inline-flex items-center gap-1">
                        <Users size={13} /> Openings: <b className="text-[var(--text2)]">{job.openings ?? 1}</b>
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 text-[13px] text-[var(--text2)]">
                {job.description && (
                    <Section title="Job description">
                        <div className="whitespace-pre-wrap leading-relaxed">{job.description}</div>
                    </Section>
                )}

                {perks.length > 0 && (
                    <Section title="Perks and benefits">
                        <p className="text-[var(--accent-text)]">{perks.join(", ")}</p>
                    </Section>
                )}

                <div className="space-y-1.5">
                    {job.jobRole && <KV k="Role" v={job.jobRole} />}
                    {job.industryType && <KV k="Industry Type" v={job.industryType} />}
                    {job.department && <KV k="Department" v={job.department} />}
                    {job.employmentType && <KV k="Employment Type" v={job.employmentType} />}
                    {job.roleCategory && <KV k="Role Category" v={job.roleCategory} />}
                    {job.genderPreference && job.genderPreference !== "Any" && (
                        <KV k="Gender Preference" v={job.genderPreference} />
                    )}
                </div>

                {(job.qualifications?.length || job.educationDegree) && (
                    <Section title="Education">
                        {job.qualifications?.length ? (
                            <KV k="UG" v={job.qualifications.join(", ")} />
                        ) : null}
                        {job.educationDegree && <KV k="Degree" v={job.educationDegree} />}
                    </Section>
                )}

                {skills.length > 0 && (
                    <Section title="Key Skills">
                        <div className="flex flex-wrap gap-2 mt-1">
                            {skills.map((s) => (
                                <span key={s} className="px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--text2)]">
                                    {s}
                                </span>
                            ))}
                        </div>
                    </Section>
                )}

                {languages.length > 0 && (
                    <Section title="Languages">
                        <div className="flex flex-wrap gap-2 mt-1">
                            {languages.map((l) => (
                                <span key={l} className="px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--text2)]">
                                    {l}
                                </span>
                            ))}
                        </div>
                    </Section>
                )}

                {Array.isArray(job.screeningQuestions) && job.screeningQuestions.length > 0 && (
                    <Section title="Screening questions">
                        <ol className="list-decimal pl-5 space-y-1">
                            {job.screeningQuestions.map((q) => (
                                <li key={q.id}>
                                    {q.question}
                                    {q.mandatory && <span className="text-[var(--text3)]"> (Mandatory)</span>}
                                </li>
                            ))}
                        </ol>
                    </Section>
                )}
            </div>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-[13px] font-semibold text-[var(--text)] mb-1.5">{title}</h3>
            {children}
        </div>
    )
}

function KV({ k, v }: { k: string; v: string }) {
    return (
        <p>
            <span className="font-semibold text-[var(--text)]">{k}:</span>{" "}
            <span className="text-[var(--accent-text)]">{v}</span>
        </p>
    )
}
