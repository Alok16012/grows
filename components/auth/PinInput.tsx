"use client"

import { useEffect, useRef } from "react"

// Row of single-digit boxes for an MPIN or OTP. Typing advances, Backspace
// goes back, and pasting (or SMS autofill) a whole code fills every box.
// `onComplete` fires once all boxes are filled.
export function PinInput({
    length, value, onChange, onComplete, masked = false, autoFocus = false, disabled = false, invalid = false, label,
    autoComplete = "off",
}: {
    length: number
    value: string
    onChange: (v: string) => void
    onComplete?: (v: string) => void
    masked?: boolean
    autoFocus?: boolean
    disabled?: boolean
    invalid?: boolean
    label: string
    autoComplete?: "off" | "one-time-code"
}) {
    const refs = useRef<(HTMLInputElement | null)[]>([])

    useEffect(() => {
        if (autoFocus) refs.current[0]?.focus()
    }, [autoFocus])

    // Clearing the value from outside (e.g. after a wrong attempt) refocuses the first box.
    useEffect(() => {
        if (value === "" && !disabled && autoFocus) refs.current[0]?.focus()
    }, [value, disabled, autoFocus])

    // The value is always a contiguous run of digits, so writing at box `i`
    // (clamped to the first empty box) keeps it gap-free.
    const setAt = (i: number, digits: string) => {
        const at = Math.min(i, value.length)
        const next = (value.slice(0, at) + digits + value.slice(at + digits.length)).slice(0, length)
        onChange(next)
        refs.current[Math.min(at + digits.length, length - 1)]?.focus()
        if (next.length === length) onComplete?.(next)
    }

    return (
        <div className="flex justify-center gap-2.5 sm:gap-3" role="group" aria-label={label}>
            {Array.from({ length }).map((_, i) => (
                <input
                    key={i}
                    ref={el => { refs.current[i] = el }}
                    type={masked ? "password" : "text"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={i === 0 ? autoComplete : "off"}
                    aria-label={`${label} digit ${i + 1}`}
                    maxLength={length}
                    disabled={disabled}
                    value={value[i] ?? ""}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => {
                        const digits = e.target.value.replace(/\D/g, "")
                        if (!digits) {
                            onChange(value.slice(0, i) + value.slice(i + 1))
                            return
                        }
                        // Typing over a filled box gives "old+new" — keep the new
                        // digit. Anything longer is a paste or SMS autofill.
                        setAt(i, value[i] && digits.length === 2 ? digits.slice(-1) : digits)
                    }}
                    onKeyDown={e => {
                        if (e.key === "Backspace" && !value[i] && i > 0) {
                            e.preventDefault()
                            onChange(value.slice(0, i - 1))
                            refs.current[i - 1]?.focus()
                        } else if (e.key === "ArrowLeft" && i > 0) {
                            refs.current[i - 1]?.focus()
                        } else if (e.key === "ArrowRight" && i < length - 1) {
                            refs.current[i + 1]?.focus()
                        }
                    }}
                    onPaste={e => {
                        const digits = e.clipboardData.getData("text").replace(/\D/g, "")
                        if (digits) {
                            e.preventDefault()
                            setAt(0, digits.slice(0, length))
                        }
                    }}
                    className={`w-12 h-14 sm:w-[52px] sm:h-[58px] text-center text-[22px] font-bold rounded-[14px] border-2 bg-[var(--surface2)] text-[var(--text)] outline-none transition-all
                        focus:bg-white focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_rgba(11,92,255,0.12)]
                        disabled:opacity-60
                        ${invalid ? "border-[var(--red)] bg-[var(--red-light)]" : value[i] ? "border-[var(--border2)] bg-white" : "border-[var(--border)]"}`}
                />
            ))}
        </div>
    )
}
