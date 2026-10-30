import { redirect } from "next/navigation"

// The old standalone payroll step page. Payroll is now run from the one-month
// hub at /payroll (attendance, wage sheet, Lock / Unlock month, reports,
// payslips), which locks and unlocks the month in one place only — so this
// address just sends old links and bookmarks there.
export default function Page() {
    redirect("/payroll")
}
