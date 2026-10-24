"use client"
// One DWM report — fill it (employee) or approve / return it (reviewer).
import { ReportScreen } from "../../_components/ReportScreen"

export default function ReportPage({ params, searchParams }: { params: { id: string }; searchParams?: { from?: string } }) {
    const back = searchParams?.from === "review"
        ? { href: "/performance/hub/review", label: "Review Queue" }
        : searchParams?.from === "team"
            ? { href: "/performance/hub/team", label: "Team Dashboard" }
            : { href: "/performance/hub/reports", label: "My DWM Reports" }
    return <ReportScreen key={params.id} id={params.id} back={back} />
}
