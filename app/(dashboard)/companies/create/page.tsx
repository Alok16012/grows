
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Loader2 } from "lucide-react"

export default function CreateCompanyPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        const formData = new FormData(e.currentTarget)
        const data = {
            name: formData.get("name"),
            address: formData.get("address"),
            contactPerson: formData.get("contactPerson"),
            contactPhone: formData.get("contactPhone"),
            logoUrl: formData.get("logoUrl"),
        }

        try {
            const res = await fetch("/api/companies", {
                method: "POST",
                body: JSON.stringify(data),
                headers: { "Content-Type": "application/json" },
            })

            if (!res.ok) {
                throw new Error("Failed to create company")
            }

            router.push("/companies")
            router.refresh()
        } catch (err) {
            setError("Something went wrong. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    const inputClasses = "w-full p-[10px_14px] bg-[var(--surface2)] border border-[var(--border)] rounded-[9px] text-[13px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--text3)] focus:border-[var(--accent)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,158,110,0.08)]"

    return (
        <div className="min-h-[calc(100vh-54px)] bg-[var(--bg)] py-[28px] px-[24px]">
            <div className="max-w-[520px] mx-auto w-full">
                {/* Header Row */}
                <div className="flex items-center gap-[14px] mb-[28px]">
                    <Link
                        href="/companies"
                        className="w-[32px] h-[32px] bg-white border border-[var(--border)] rounded-[8px] flex items-center justify-center shrink-0 hover:bg-[var(--surface2)] transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4 text-[var(--text2)]" />
                    </Link>
                    <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[var(--text)]">
                        Create Company
                    </h1>
                </div>

                {/* Form Card */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-[28px] shadow-none">
                    <form onSubmit={handleSubmit}>
                        {/* Card Header */}
                        <div className="mb-[24px]">
                            <h2 className="text-[16px] font-semibold text-[var(--text)] mb-1">
                                Company Details
                            </h2>
                            <p className="text-[13px] text-[var(--text2)] leading-[1.5]">
                                Enter the information for the new company.
                            </p>
                        </div>

                        <div className="flex flex-col gap-[18px]">
                            {error && (
                                <div className="p-3 text-[13px] text-[var(--red)] bg-[var(--red-light)] border border-[#fca5a5] rounded-[9px]">
                                    {error}
                                </div>
                            )}

                            {/* Field: Name */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="name" className="text-[13px] font-medium text-[var(--text)] block">
                                    Company Name <span className="text-[var(--red)] ml-[2px]">*</span>
                                </label>
                                <input
                                    id="name"
                                    name="name"
                                    required
                                    placeholder="Acme Corp"
                                    className={inputClasses}
                                />
                            </div>

                            {/* Field: Address */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="address" className="text-[13px] font-medium text-[var(--text)] block">
                                    Address
                                </label>
                                <input
                                    id="address"
                                    name="address"
                                    placeholder="123 Business St, City"
                                    className={inputClasses}
                                />
                            </div>

                            {/* Two-Column Row: Contact Info */}
                            <div className="grid grid-cols-2 gap-[14px]">
                                <div className="flex flex-col gap-[6px]">
                                    <label htmlFor="contactPerson" className="text-[13px] font-medium text-[var(--text)] block">
                                        Contact Person
                                    </label>
                                    <input
                                        id="contactPerson"
                                        name="contactPerson"
                                        placeholder="John Doe"
                                        className={inputClasses}
                                    />
                                </div>
                                <div className="flex flex-col gap-[6px]">
                                    <label htmlFor="contactPhone" className="text-[13px] font-medium text-[var(--text)] block">
                                        Contact Phone
                                    </label>
                                    <input
                                        id="contactPhone"
                                        name="contactPhone"
                                        placeholder="+1 234 567 890"
                                        className={inputClasses}
                                    />
                                </div>
                            </div>

                            {/* Field: Logo URL */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="logoUrl" className="text-[13px] font-medium text-[var(--text)] block">
                                    Logo URL
                                </label>
                                <input
                                    id="logoUrl"
                                    name="logoUrl"
                                    placeholder="https://..."
                                    className={inputClasses}
                                />
                            </div>

                            {/* Divider & Actions */}
                            <div className="border-t border-[var(--border)] mt-[8px] pt-[20px] flex justify-end gap-[10px]">
                                <Link
                                    href="/companies"
                                    className="inline-flex items-center justify-center bg-white border border-[var(--border)] text-[var(--text2)] px-[20px] py-[9px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="inline-flex items-center justify-center bg-[var(--accent)] text-white border-0 px-[20px] py-[9px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:bg-[#158a5e] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Company
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
