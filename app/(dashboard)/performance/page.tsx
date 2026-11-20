import { redirect } from "next/navigation"

// Performance now lives in one place, the hub (/performance/hub), with
// appraisals as one of its sections. This keeps the sidebar link and old
// notification links (/performance?id=<review>) working.
export default function PerformanceIndex({ searchParams }: { searchParams: { id?: string } }) {
    if (searchParams?.id) redirect(`/performance/hub/appraisals?id=${encodeURIComponent(searchParams.id)}`)
    redirect("/performance/hub")
}
