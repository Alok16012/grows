"use client"

import { usePathname, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Check, ChevronLeft } from "lucide-react"

// Guided setup flow for the INSPECTIONS module. Each step is still its own
// independent page (reachable from the sidebar), but this rail ties them into
// an ordered wizard: click any step to jump, or use Back/Next to go stepwise.
// New flow: Site → Project → Assignment. "Groups" was removed — managers &
// inspectors are now added directly at the Project level.
const STEPS = [
    { label: "Sites", href: "/sites" },
    { label: "Projects", href: "/projects" },
    { label: "Assignments", href: "/assignments" },
    { label: "Field Tasks", href: "/field" },
]

export function InspectionStepper() {
    const pathname = usePathname()
    const router = useRouter()
    const { data: session } = useSession()

    // Setup flow is for managers/admins — hide for inspectors & clients.
    const role = session?.user?.role
    if (role === "INSPECTION_BOY" || role === "CLIENT") return null

    const currentIndex = STEPS.findIndex(
        (s) => pathname === s.href || pathname.startsWith(s.href + "/")
    )
    if (currentIndex === -1) return null

    const go = (i: number) => {
        if (i < 0 || i > STEPS.length - 1) return
        router.push(STEPS[i].href)
    }

    return (
        <div className="px-4 pt-4 lg:px-0 lg:pt-0">
            <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-[14px_18px]">
                <div className="flex items-center justify-between mb-[12px]">
                    <span className="text-[12px] font-[600] text-[#1a1a18]">
                        Inspection Setup — Step {currentIndex + 1} of {STEPS.length}: {STEPS[currentIndex].label}
                    </span>
                    <span className="text-[11px] font-[500] text-[#9e9b95]">
                        {Math.round((currentIndex / (STEPS.length - 1)) * 100)}%
                    </span>
                </div>

                <div className="flex items-center overflow-x-auto pb-[2px]">
                    {STEPS.map((s, i) => {
                        const isDone = i < currentIndex
                        const isActive = i === currentIndex
                        return (
                            <div key={s.href} className="flex items-center flex-1 last:flex-none min-w-fit">
                                <button
                                    type="button"
                                    onClick={() => go(i)}
                                    className="flex flex-col items-center gap-[5px] shrink-0 focus:outline-none group"
                                >
                                    <span className={`flex items-center justify-center w-[26px] h-[26px] rounded-full text-[12px] font-[700] border-[1.5px] transition-colors ${isActive
                                        ? "bg-[#1a9e6e] border-[#1a9e6e] text-white"
                                        : isDone
                                            ? "bg-[#e8f7f1] border-[#1a9e6e] text-[#0d6b4a]"
                                            : "bg-white border-[#e8e6e1] text-[#9e9b95] group-hover:border-[#1a9e6e]"
                                        }`}>
                                        {isDone ? <Check className="h-[14px] w-[14px]" strokeWidth={3} /> : i + 1}
                                    </span>
                                    <span className={`text-[10.5px] font-[500] whitespace-nowrap ${isActive ? "text-[#1a1a18]" : "text-[#9e9b95]"}`}>
                                        {s.label}
                                    </span>
                                </button>
                                {i < STEPS.length - 1 && (
                                    <span className={`h-[2px] flex-1 min-w-[20px] mx-[6px] mb-[18px] rounded-full transition-colors ${i < currentIndex ? "bg-[#1a9e6e]" : "bg-[#e8e6e1]"}`} />
                                )}
                            </div>
                        )
                    })}
                </div>

                <div className="flex items-center justify-between gap-[10px] mt-[12px] pt-[12px] border-t border-[#e8e6e1]">
                    <button
                        onClick={() => go(currentIndex - 1)}
                        disabled={currentIndex === 0}
                        className="inline-flex items-center gap-[4px] bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[12.5px] font-[500] px-[14px] py-[7px] hover:bg-[#f9f8f5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-[14px] w-[14px]" /> Back
                    </button>
                    <button
                        onClick={() => go(currentIndex + 1)}
                        disabled={currentIndex === STEPS.length - 1}
                        className="inline-flex items-center gap-[4px] bg-[#1a9e6e] text-white rounded-[9px] text-[12.5px] font-[500] px-[16px] py-[7px] hover:bg-[#158a5e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                        Next <ChevronLeft className="h-[14px] w-[14px] rotate-180" />
                    </button>
                </div>
            </div>
        </div>
    )
}
