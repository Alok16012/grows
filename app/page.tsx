
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/login")
  } else {
    // Redirect to respective dashboard
    const role = session.user.role

    // Custom-role users get the universal permission-driven dashboard —
    // it renders exactly the widgets their permissions allow.
    if (role !== "ADMIN" && (session.user as any).customRoleName) {
      redirect("/dashboard")
    }

    switch (role) {
      case "ADMIN":
        redirect("/admin")
      case "MANAGER":
        redirect("/manager")
      case "HR_MANAGER":
        redirect("/employees")
      case "INSPECTION_BOY":
        redirect("/inspection")
      default:
        // Unknown role — fall back to a safe page instead of bouncing to /login
        redirect("/profile")
    }
  }
}
