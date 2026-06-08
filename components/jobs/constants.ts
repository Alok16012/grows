// Shared option sets + types for the internal "Post a job" wizard.

export type ScreeningQuestion = {
    id: string
    question: string
    mandatory: boolean
    type: "text" | "single_choice" | "yes_no"
    options: string[]
    preferredAnswer?: string | null
}

export type JobStatus = "DRAFT" | "PUBLISHED" | "CLOSED"

export type JobPosting = {
    id: string
    title: string
    workExpMin: number | null
    workExpMax: number | null
    freshersAllowed: boolean
    salaryMin: number | null
    salaryMax: number | null
    salaryPeriod: string
    perks: string[]
    department: string | null
    jobRole: string | null
    jobLocation: string | null
    qualifications: string[]
    educationDegree: string | null
    genderPreference: string
    skills: string[]
    candidateIndustry: string | null
    languages: string[]
    screeningQuestions: ScreeningQuestion[] | null
    description: string | null
    companyName: string | null
    employmentType: string | null
    industryType: string | null
    roleCategory: string | null
    openings: number
    allowCalls: boolean
    contactName: string | null
    contactPhone: string | null
    callStartTime: string | null
    callEndTime: string | null
    callDays: string | null
    status: JobStatus
    createdBy: string | null
    creator?: { id: string; name: string } | null
    createdAt: string
    updatedAt: string
}

export const WIZARD_STEPS = [
    "Job details",
    "Candidate preferences",
    "Screening questions",
    "Job description",
    "Communication preferences",
] as const

// Experience dropdown values (years)
export const EXPERIENCE_YEARS = Array.from({ length: 16 }, (_, i) => i) // 0..15

export const QUALIFICATIONS = ["10th Pass", "12th Pass", "Diploma", "ITI", "Graduate", "Post-Graduate"]

export const GENDER_OPTIONS = ["Any", "Male", "Female"]

export const EMPLOYMENT_TYPES = ["Full Time, Permanent", "Full Time, Contract", "Part Time", "Internship"]

export const PERK_SUGGESTIONS = [
    "Health insurance",
    "Food allowance",
    "Provident fund",
    "Office cab/shuttle",
    "Annual bonus",
    "Travel allowance",
    "Mobile/Internet",
    "Overtime pay",
    "Flexible working hours",
    "Laptop",
]

export const LANGUAGE_SUGGESTIONS = [
    "English", "Hindi", "Marathi", "Tamil", "Telugu", "Bengali",
    "Kannada", "Punjabi", "Gujarati", "Malayalam",
]

export const SKILL_SUGGESTIONS = [
    "Recruitment", "Talent Acquisition", "Hiring", "Sourcing", "Bulk Hiring",
    "Staffing", "Consultancy", "IT Recruitment", "Non IT Recruitment", "End To End Recruitment",
]

export const SUGGESTED_QUESTIONS = [
    "What's your expected salary?",
    "Are you comfortable with English?",
    "What kind of job are you comfortable with?",
    "Are you willing to attend in-person interview?",
    "What's your current salary?",
    "What's your notice period?",
]

export const CALL_DAYS_OPTIONS = ["Everyday", "Weekdays (Mon-Fri)", "Weekends (Sat-Sun)"]

export const STATUS_META: Record<JobStatus, { label: string; cls: string }> = {
    DRAFT: { label: "Draft", cls: "bg-amber-100 text-amber-700" },
    PUBLISHED: { label: "Published", cls: "bg-emerald-100 text-emerald-700" },
    CLOSED: { label: "Closed", cls: "bg-gray-200 text-gray-600" },
}

export function formatExperience(min: number | null, max: number | null, freshers: boolean): string {
    if (min == null && max == null) return freshers ? "Freshers" : "Not specified"
    const fmt = (y: number | null) => (y == null ? "" : y === 1 ? "1 yr" : `${y} yrs`)
    if (min != null && max != null) return `${min} - ${max} yrs`
    return fmt(min ?? max)
}

export function formatSalary(min: number | null, max: number | null, period = "month"): string {
    if (min == null && max == null) return "Not disclosed"
    const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`
    const per = period === "month" ? "/month" : period === "year" ? "/year" : ""
    if (min != null && max != null) return `${inr(min)} - ${inr(max)}${per}`
    return `${inr((min ?? max)!)}${per}`
}
