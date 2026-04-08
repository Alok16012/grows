"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    GraduationCap, BookOpen, Clock, CheckCircle, PlayCircle,
    ChevronRight, Award, Target, AlertTriangle, X, Loader2,
    ArrowLeft, RotateCcw, Shield, FileText, ExternalLink, ChevronDown, ChevronUp
} from "lucide-react"
import { format } from "date-fns"

type Enrollment = {
    id: string
    courseId: string
    progress: number
    status: string
    score?: number
    completedAt?: string
    certificate?: string
    dueDate?: string
    attempts: number
    course: {
        id: string
        courseCode: string
        title: string
        description?: string
        category: string
        duration: number
        passingScore: number
        modules: {
            id: string
            title: string
            content?: string
            videoUrl?: string
            duration: number
            order: number
        }[]
        quiz?: {
            id: string
            title: string
            passingScore: number
            timeLimit?: number
            maxAttempts: number
            questions: {
                id: string
                question: string
                questionType: string
                options: { id: string; text: string }[]
                points: number
            }[]
        }
    }
}

type QuizAttempt = {
    id: string
    score: number
    passed: boolean
    submittedAt: string
}


type LearnPolicy = {
    id: string
    title: string
    description?: string
    category: string
    fileUrl?: string
    isRequired: boolean
    acknowledged: boolean
    acknowledgedAt?: string
}

const POLICY_CAT_COLORS_LEARN: Record<string, string> = {
    Safety: "#f59e0b", HR: "#8b5cf6", Compliance: "#3b82f6",
    Operations: "#10b981", IT: "#06b6d4", Finance: "#ec4899", Other: "#6b7280"
}

function PoliciesSection() {
    const [policies, setPolicies] = useState<LearnPolicy[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [acknowledging, setAcknowledging] = useState<string | null>(null)

    const fetchPolicies = async () => {
        try {
            const res = await fetch("/api/lms/policies")
            const data = await res.json()
            setPolicies(Array.isArray(data) ? data : [])
        } catch { /* silent */ }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchPolicies() }, [])

    const handleAcknowledge = async (policyId: string) => {
        setAcknowledging(policyId)
        try {
            const res = await fetch(`/api/lms/policies/${policyId}/acknowledge`, { method: "POST" })
            if (!res.ok) { toast.error(await res.text()); return }
            setPolicies(prev => prev.map(p => p.id === policyId ? { ...p, acknowledged: true, acknowledgedAt: new Date().toISOString() } : p))
            toast.success("Policy acknowledged ✓")
        } catch { toast.error("Failed to acknowledge") }
        finally { setAcknowledging(null) }
    }

    if (loading) return null

    const pending = policies.filter(p => !p.acknowledged && p.isRequired)
    const allAcknowledged = policies.filter(p => p.acknowledged)

    if (policies.length === 0) return null

    return (
        <div className={`rounded-[14px] border overflow-hidden ${pending.length > 0 ? "border-amber-300 bg-amber-50" : "border-[var(--border)] bg-[var(--surface)]"}`}>
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center gap-3 px-4 py-3"
            >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${pending.length > 0 ? "bg-amber-200 text-amber-700" : "bg-green-100 text-green-600"}`}>
                    <Shield size={16} />
                </div>
                <div className="flex-1 text-left">
                    <p className={`text-[13px] font-semibold ${pending.length > 0 ? "text-amber-800" : "text-[var(--text)]"}`}>
                        Company Policies & SOPs
                    </p>
                    <p className={`text-[11px] ${pending.length > 0 ? "text-amber-600" : "text-[var(--text3)]"}`}>
                        {pending.length > 0
                            ? `${pending.length} policy${pending.length > 1 ? "s" : ""} pending your acknowledgment`
                            : `All ${allAcknowledged.length} policies acknowledged ✓`}
                    </p>
                </div>
                {pending.length > 0 && (
                    <span className="h-5 min-w-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {pending.length}
                    </span>
                )}
                {expanded ? <ChevronUp size={16} className="text-[var(--text3)] shrink-0" /> : <ChevronDown size={16} className="text-[var(--text3)] shrink-0" />}
            </button>

            {expanded && (
                <div className="border-t border-amber-200 divide-y divide-amber-100">
                    {policies.map(policy => {
                        const catColor = POLICY_CAT_COLORS_LEARN[policy.category] ?? "#6b7280"
                        return (
                            <div key={policy.id} className="px-4 py-3 flex items-start gap-3">
                                <div className="h-8 w-8 rounded-[8px] flex items-center justify-center shrink-0 mt-0.5" style={{ background: catColor + "22" }}>
                                    <FileText size={15} style={{ color: catColor }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-[13px] font-medium text-[var(--text)]">{policy.title}</p>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: catColor + "22", color: catColor }}>{policy.category}</span>
                                    </div>
                                    {policy.description && <p className="text-[11.5px] text-[var(--text3)] line-clamp-2">{policy.description}</p>}
                                    {policy.fileUrl && (
                                        <a href={policy.fileUrl} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] mt-1 hover:underline">
                                            <ExternalLink size={10} /> View Document
                                        </a>
                                    )}
                                </div>
                                <div className="shrink-0">
                                    {policy.acknowledged ? (
                                        <div className="flex items-center gap-1 text-green-600">
                                            <CheckCircle size={14} />
                                            <span className="text-[11px] font-medium">Done</span>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleAcknowledge(policy.id)}
                                            disabled={acknowledging === policy.id}
                                            className="h-8 px-3 text-[12px] bg-[var(--accent)] text-white rounded-[7px] font-medium flex items-center gap-1.5 disabled:opacity-60"
                                        >
                                            {acknowledging === policy.id ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                                            Acknowledge
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

const CATEGORY_COLORS: Record<string, string> = {
    Safety: "#f59e0b",
    Security: "#8b5cf6",
    Compliance: "#3b82f6",
    "Soft Skills": "#ec4899",
    Technical: "#10b981",
    Induction: "#0ea5e9",
    Other: "#6b7280",
}

function ProgressRing({ progress, size = 60, strokeWidth = 6 }: { progress: number; size?: number; strokeWidth?: number }) {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const offset = circumference - (progress / 100) * circumference
    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--border)" strokeWidth={strokeWidth} fill="none" />
            <circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke="var(--accent)" strokeWidth={strokeWidth} fill="none"
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-500"
            />
        </svg>
    )
}

function CourseCard({ enrollment, onClick }: { enrollment: Enrollment; onClick: () => void }) {
    const { course } = enrollment
    const catColor = CATEGORY_COLORS[course.category] || CATEGORY_COLORS["Other"]
    const isCompleted = enrollment.status === "COMPLETED"
    const isOverdue = enrollment.dueDate && new Date(enrollment.dueDate) < new Date() && !isCompleted

    return (
        <div
            onClick={onClick}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden hover:shadow-md hover:border-[var(--accent)] transition-all cursor-pointer"
        >
            <div className="h-2 w-full" style={{ background: catColor }} />
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <span className="font-mono text-[10.5px] text-[var(--text3)]">{course.courseCode}</span>
                        <h3 className="text-[14px] font-semibold text-[var(--text)] mt-0.5 line-clamp-2">{course.title}</h3>
                    </div>
                    <div className="relative shrink-0">
                        <ProgressRing progress={enrollment.progress} />
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[var(--text)]">
                            {enrollment.progress}%
                        </span>
                    </div>
                </div>

                {course.description && (
                    <p className="text-[12px] text-[var(--text3)] mt-2 line-clamp-2">{course.description}</p>
                )}

                <div className="flex items-center gap-3 mt-3 text-[11.5px] text-[var(--text3)]">
                    <span className="flex items-center gap-1"><Clock size={12} /> {course.duration}m</span>
                    <span className="flex items-center gap-1"><BookOpen size={12} /> {course.modules.length} modules</span>
                    {course.quiz && <span className="flex items-center gap-1"><Target size={12} /> Quiz</span>}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                    <div className="flex items-center gap-2">
                        {isCompleted ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10.5px] font-medium">
                                <CheckCircle size={10} /> Completed
                            </span>
                        ) : isOverdue ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10.5px] font-medium">
                                <AlertTriangle size={10} /> Overdue
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[var(--text3)] text-[10.5px] font-medium">
                                In Progress
                            </span>
                        )}
                        {enrollment.score !== undefined && enrollment.score !== null && (
                            <span className="text-[10.5px] text-[var(--text3)]">Score: {enrollment.score}%</span>
                        )}
                    </div>
                    <ChevronRight size={16} className="text-[var(--text3)]" />
                </div>
            </div>
        </div>
    )
}

function QuizTakingModal({ quiz, courseId, enrollmentId, onClose, onComplete }: {
    quiz: Enrollment["course"]["quiz"]
    courseId: string
    enrollmentId: string
    onClose: () => void
    onComplete: (passed: boolean, score: number) => void
}) {
    const [currentQuestion, setCurrentQuestion] = useState(0)
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [timeLeft, setTimeLeft] = useState(quiz?.timeLimit ? quiz.timeLimit * 60 : null)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState<{ score: number; passed: boolean; results: any[] } | null>(null)

    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0) return
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(timer)
                    handleSubmit()
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [quiz?.timeLimit])

    const handleSubmit = async () => {
        setSubmitting(true)
        try {
            const res = await fetch(`/api/lms/courses/${courseId}/quiz/attempts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers }),
            })
            if (!res.ok) { toast.error(await res.text()); return }
            const data = await res.json()
            setResult(data)
            if (data.passed) { onComplete(true, data.score) }
        } catch {
            toast.error("Failed to submit quiz")
        } finally {
            setSubmitting(false)
        }
    }

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m}:${s.toString().padStart(2, "0")}`
    }

    if (!quiz) return null

    if (result) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative bg-[var(--surface)] rounded-[20px] border border-[var(--border)] shadow-2xl w-full max-w-lg p-8 text-center">
                    <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${result.passed ? "bg-green-100" : "bg-red-100"}`}>
                        {result.passed ? (
                            <CheckCircle size={40} className="text-green-600" />
                        ) : (
                            <AlertTriangle size={40} className="text-red-600" />
                        )}
                    </div>
                    <h2 className="text-[20px] font-bold text-[var(--text)] mt-4">
                        {result.passed ? "Congratulations!" : "Not Passed"}
                    </h2>
                    <p className="text-[14px] text-[var(--text3)] mt-2">
                        {result.passed ? "You have successfully completed this quiz." : "You need more preparation. Try again!"}
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-6">
                        <div className="text-center">
                            <p className="text-[32px] font-bold text-[var(--text)]">{result.score}%</p>
                            <p className="text-[11px] text-[var(--text3)]">Your Score</p>
                        </div>
                        <div className="w-px h-12 bg-[var(--border)]" />
                        <div className="text-center">
                            <p className="text-[32px] font-bold text-[var(--text)]">{quiz.passingScore}%</p>
                            <p className="text-[11px] text-[var(--text3)]">Passing Score</p>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-8">
                        {!result.passed && (
                            <button
                                onClick={() => { setResult(null); setAnswers({}); setCurrentQuestion(0) }}
                                className="flex-1 h-11 text-[13px] border border-[var(--border)] rounded-[10px] text-[var(--text2)] hover:bg-[var(--surface2)] flex items-center justify-center gap-2"
                            >
                                <RotateCcw size={14} /> Try Again
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="flex-1 h-11 text-[13px] bg-[var(--accent)] text-white rounded-[10px] font-medium"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const question = quiz.questions[currentQuestion]
    const answeredCount = Object.keys(answers).length
    const progress = (answeredCount / quiz.questions.length) * 100

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-[var(--surface)] rounded-[16px] border border-[var(--border)] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
                    <h2 className="text-[16px] font-semibold text-[var(--text)]">{quiz.title}</h2>
                    <div className="flex items-center gap-3">
                        {timeLeft !== null && (
                            <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium ${timeLeft < 60 ? "bg-red-100 text-red-600" : "bg-[var(--surface2)] text-[var(--text2)]"}`}>
                                <Clock size={14} /> {formatTime(timeLeft)}
                            </span>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface2)] text-[var(--text3)]">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="px-6 py-3 bg-[var(--surface2)] border-b border-[var(--border)] shrink-0">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text3)] mb-1.5">
                        <span>Question {currentQuestion + 1} of {quiz.questions.length}</span>
                        <span>{answeredCount} answered</span>
                    </div>
                    <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <p className="text-[15px] font-medium text-[var(--text)] leading-relaxed">{question.question}</p>
                    <div className="mt-4 space-y-2">
                        {question.options.map((opt, idx) => (
                            <button
                                key={opt.id}
                                onClick={() => setAnswers(prev => ({ ...prev, [question.id]: opt.id }))}
                                className={`w-full p-4 rounded-[10px] border text-left transition-all ${
                                    answers[question.id] === opt.id
                                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]"
                                        : "border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]"
                                }`}
                            >
                                <span className="font-mono text-[11px] mr-3 opacity-60">{String.fromCharCode(65 + idx)}.</span>
                                {opt.text}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] shrink-0">
                    <button
                        onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                        disabled={currentQuestion === 0}
                        className="px-4 py-2 text-[13px] text-[var(--text2)] hover:text-[var(--text)] disabled:opacity-40"
                    >
                        Previous
                    </button>
                    <div className="flex gap-2">
                        {quiz.questions.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentQuestion(idx)}
                                className={`w-7 h-7 rounded-full text-[11px] font-medium transition-colors ${
                                    idx === currentQuestion
                                        ? "bg-[var(--accent)] text-white"
                                        : answers[quiz.questions[idx].id]
                                            ? "bg-green-100 text-green-700"
                                            : "bg-[var(--surface2)] text-[var(--text3)]"
                                }`}
                            >
                                {idx + 1}
                            </button>
                        ))}
                    </div>
                    {currentQuestion < quiz.questions.length - 1 ? (
                        <button
                            onClick={() => setCurrentQuestion(prev => prev + 1)}
                            className="px-4 py-2 text-[13px] bg-[var(--accent)] text-white rounded-[8px]"
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || answeredCount < quiz.questions.length}
                            className="px-4 py-2 text-[13px] bg-green-600 text-white rounded-[8px] disabled:opacity-50 flex items-center gap-2"
                        >
                            {submitting && <Loader2 size={14} className="animate-spin" />}
                            Submit Quiz
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

function CertificateModal({ certificate, courseName, employeeName, onClose }: {
    certificate: string
    courseName: string
    employeeName: string
    onClose: () => void
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-[var(--surface)] rounded-[20px] border border-[var(--border)] shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-gradient-to-br from-[var(--accent)] to-blue-600 p-8 text-center text-white">
                    <Award size={60} className="mx-auto" />
                    <h2 className="text-[24px] font-bold mt-4">Certificate of Completion</h2>
                    <p className="text-white/80 mt-2">This certifies that</p>
                    <p className="text-[22px] font-bold mt-1">{employeeName}</p>
                    <p className="text-white/80 mt-2">has successfully completed</p>
                    <p className="text-[18px] font-semibold mt-1">{courseName}</p>
                </div>
                <div className="p-6 text-center">
                    <p className="text-[11px] text-[var(--text3)] font-mono">{certificate}</p>
                    <p className="text-[11px] text-[var(--text3)] mt-1">Issued on {format(new Date(), "dd MMMM yyyy")}</p>
                    <button
                        onClick={onClose}
                        className="mt-4 h-10 px-6 text-[13px] bg-[var(--surface2)] text-[var(--text2)] rounded-[8px] hover:bg-[var(--border)]"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

function CourseDetailView({ enrollment, onBack, onComplete }: {
    enrollment: Enrollment
    onBack: () => void
    onComplete: () => void
}) {
    const [activeView, setActiveView] = useState<"modules" | "quiz">("modules")
    const [showQuiz, setShowQuiz] = useState(false)
    const [completedModules, setCompletedModules] = useState<Set<string>>(new Set())
    const [showCertificate, setShowCertificate] = useState(false)
    const [updatingProgress, setUpdatingProgress] = useState(false)

    const { course } = enrollment
    const allModulesComplete = completedModules.size === course.modules.length
    const canTakeQuiz = course.quiz && allModulesComplete && enrollment.status !== "COMPLETED"

    const handleModuleComplete = async (moduleId: string) => {
        setUpdatingProgress(true)
        try {
            const newProgress = Math.round(((completedModules.size + 1) / course.modules.length) * 100)
            const res = await fetch(`/api/lms/enrollments/${enrollment.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ progress: newProgress }),
            })
            if (res.ok) {
                setCompletedModules(prev => new Set([...prev, moduleId]))
                toast.success("Module completed!")
            }
        } catch {
            toast.error("Failed to update progress")
        } finally {
            setUpdatingProgress(false)
        }
    }

    return (
        <div className="space-y-6">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-[13px] text-[var(--text2)] hover:text-[var(--text)]"
            >
                <ArrowLeft size={16} /> Back to Courses
            </button>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden">
                <div className="h-2 w-full" style={{ background: CATEGORY_COLORS[course.category] || "#6b7280" }} />
                <div className="p-6">
                    <span className="font-mono text-[11px] text-[var(--text3)]">{course.courseCode}</span>
                    <h2 className="text-[20px] font-bold text-[var(--text)] mt-1">{course.title}</h2>
                    {course.description && (
                        <p className="text-[13px] text-[var(--text3)] mt-2">{course.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-4">
                        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text3)]">
                            <Clock size={14} /> {course.duration} min
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text3)]">
                            <BookOpen size={14} /> {course.modules.length} modules
                        </div>
                        {course.quiz && (
                            <div className="flex items-center gap-1.5 text-[12px] text-[var(--text3)]">
                                <Target size={14} /> {course.quiz.questions.length} questions
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => setActiveView("modules")}
                    className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
                        activeView === "modules" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--text2)] border border-[var(--border)]"
                    }`}
                >
                    Modules ({completedModules.size}/{course.modules.length})
                </button>
                {course.quiz && (
                    <button
                        onClick={() => setActiveView("quiz")}
                        className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
                            activeView === "quiz" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--text2)] border border-[var(--border)]"
                        }`}
                    >
                        Quiz ({course.quiz.questions.length} questions)
                    </button>
                )}
            </div>

            {activeView === "modules" && (
                <div className="space-y-3">
                    {course.modules.map((mod, idx) => {
                        const isComplete = completedModules.has(mod.id) || enrollment.progress >= ((idx + 1) / course.modules.length) * 100
                        return (
                            <div key={mod.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-4">
                                <div className="flex items-start gap-3">
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isComplete ? "bg-green-100 text-green-600" : "bg-[var(--accent)] text-white"}`}>
                                        {isComplete ? <CheckCircle size={16} /> : <span className="text-[12px] font-bold">{idx + 1}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-[14px] font-medium text-[var(--text)]">{mod.title}</h3>
                                        {mod.content && <p className="text-[12px] text-[var(--text3)] mt-1">{mod.content}</p>}
                                        {mod.videoUrl && (
                                            <a href={mod.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] mt-2 hover:underline">
                                                <PlayCircle size={14} /> Watch Video
                                            </a>
                                        )}
                                    </div>
                                    {!isComplete && (
                                        <button
                                            onClick={() => handleModuleComplete(mod.id)}
                                            disabled={updatingProgress}
                                            className="h-8 px-3 text-[12px] bg-[var(--accent)] text-white rounded-[6px] font-medium flex items-center gap-1 disabled:opacity-60"
                                        >
                                            {updatingProgress ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                            Mark Done
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {activeView === "quiz" && course.quiz && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="h-14 w-14 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                            <Target size={28} className="text-[var(--accent)]" />
                        </div>
                        <div>
                            <h3 className="text-[16px] font-semibold text-[var(--text)]">{course.quiz.title}</h3>
                            <p className="text-[12px] text-[var(--text3)]">
                                {course.quiz.questions.length} questions · Pass: {course.quiz.passingScore}% · Max {course.quiz.maxAttempts} attempts
                            </p>
                        </div>
                    </div>
                    {allModulesComplete ? (
                        <button
                            onClick={() => setShowQuiz(true)}
                            className="w-full h-12 bg-[var(--accent)] text-white rounded-[10px] font-medium flex items-center justify-center gap-2"
                        >
                            <PlayCircle size={18} /> Start Quiz
                        </button>
                    ) : (
                        <div className="p-4 rounded-[10px] bg-[var(--surface2)] border border-[var(--border)] text-center">
                            <p className="text-[13px] text-[var(--text3)]">Complete all modules to unlock the quiz</p>
                            <p className="text-[11px] text-[var(--text3)] mt-1">{completedModules.size} of {course.modules.length} modules completed</p>
                        </div>
                    )}
                </div>
            )}

            {enrollment.certificate && (
                <button
                    onClick={() => setShowCertificate(true)}
                    className="w-full h-12 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-[10px] font-medium flex items-center justify-center gap-2"
                >
                    <Award size={18} /> View Certificate
                </button>
            )}

            {showQuiz && course.quiz && (
                <QuizTakingModal
                    quiz={course.quiz}
                    courseId={course.id}
                    enrollmentId={enrollment.id}
                    onClose={() => setShowQuiz(false)}
                    onComplete={(passed, score) => {
                        if (passed) onComplete()
                        setShowQuiz(false)
                    }}
                />
            )}

            {showCertificate && (
                <CertificateModal
                    certificate={enrollment.certificate!}
                    courseName={course.title}
                    employeeName="Employee"
                    onClose={() => setShowCertificate(false)}
                />
            )}
        </div>
    )
}

export default function LearnPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [enrollments, setEnrollments] = useState<Enrollment[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null)

    useEffect(() => {
        if (status === "unauthenticated") router.replace("/login")
    }, [status, router])

    const fetchEnrollments = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/lms/learn/enrollments")
            if (res.ok) {
                const data = await res.json()
                setEnrollments(Array.isArray(data) ? data : [])
            }
        } catch {
            toast.error("Failed to load courses")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchEnrollments() }, [fetchEnrollments])

    const stats = {
        total: enrollments.length,
        inProgress: enrollments.filter(e => e.status === "IN_PROGRESS").length,
        completed: enrollments.filter(e => e.status === "COMPLETED").length,
        overdue: enrollments.filter(e => e.dueDate && new Date(e.dueDate) < new Date() && e.status !== "COMPLETED").length,
    }

    if (selectedEnrollment) {
        return (
            <div className="flex flex-col h-full bg-[var(--surface2)] min-h-0">
                <div className="flex-1 overflow-y-auto p-6">
                    <CourseDetailView
                        enrollment={selectedEnrollment}
                        onBack={() => { setSelectedEnrollment(null); fetchEnrollments() }}
                        onComplete={() => { fetchEnrollments(); setSelectedEnrollment(null) }}
                    />
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-[var(--surface2)] min-h-0">
            <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-5 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-[var(--accent)] rounded-[10px] flex items-center justify-center">
                        <GraduationCap size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-[18px] font-bold text-[var(--text)]">My Learning</h1>
                        <p className="text-[12px] text-[var(--text3)]">Continue your training courses</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Policies acknowledgment banner */}
                <PoliciesSection />

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4 text-center">
                        <p className="text-[24px] font-bold text-[var(--text)]">{stats.total}</p>
                        <p className="text-[11px] text-[var(--text3)]">Enrolled</p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4 text-center">
                        <p className="text-[24px] font-bold text-[var(--text)]">{stats.inProgress}</p>
                        <p className="text-[11px] text-[var(--text3)]">In Progress</p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4 text-center">
                        <p className="text-[24px] font-bold text-green-600">{stats.completed}</p>
                        <p className="text-[11px] text-[var(--text3)]">Completed</p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4 text-center">
                        <p className="text-[24px] font-bold text-red-600">{stats.overdue}</p>
                        <p className="text-[11px] text-[var(--text3)]">Overdue</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                    </div>
                ) : enrollments.length === 0 ? (
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] py-16 text-center">
                        <BookOpen size={40} className="mx-auto text-[var(--text3)] mb-3" />
                        <p className="text-[14px] font-medium text-[var(--text2)]">No courses assigned</p>
                        <p className="text-[12px] text-[var(--text3)] mt-1">You will see your courses here once enrolled</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {enrollments.map(enrollment => (
                            <CourseCard
                                key={enrollment.id}
                                enrollment={enrollment}
                                onClick={() => setSelectedEnrollment(enrollment)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
