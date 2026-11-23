// My Onboarding is now the "My Details" tab of My Profile. Old links still work.
import { redirect } from "next/navigation"

export default function OldSelfOnboardingPage() {
    redirect("/profile?tab=details")
}
