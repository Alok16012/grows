import { redirect } from "next/navigation"

// The hub opens on the employee's own DWM reports.
export default function PerformanceHubIndex() {
    redirect("/performance/hub/reports")
}
