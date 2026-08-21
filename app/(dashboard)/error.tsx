"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AlertCircle, Home } from "lucide-react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const router = useRouter()

    useEffect(() => {
        console.error("[ERROR_BOUNDARY]", error)
    }, [error])

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 text-center" role="alert" aria-live="assertive">
            <div className="flex flex-col items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-[var(--red-light)] flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-[var(--red)]" aria-hidden="true" />
                </div>
                <h2 className="text-xl font-semibold text-[var(--text)]">Something went wrong</h2>
                <p className="text-[var(--text3)] text-sm max-w-sm">
                    {error.message || "An unexpected error occurred. Please try again."}
                </p>
                {error.digest && (
                    <p className="text-[10px] text-[var(--text3)] font-mono">Ref: {error.digest}</p>
                )}
            </div>
            <div className="flex items-center gap-3">
                <Button onClick={() => reset()} className="gap-2">
                    <span>Try again</span>
                </Button>
                <Button variant="outline" onClick={() => router.push("/dashboard")} className="gap-2">
                    <Home size={15} aria-hidden="true" />
                    <span>Go to Dashboard</span>
                </Button>
            </div>
        </div>
    )
}
