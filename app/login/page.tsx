import { Suspense } from "react"
import { otpAvailable, MPIN_LENGTH } from "@/lib/login-security"
import LoginForm from "./LoginForm"

// Rendered per request so the OTP tab follows the SMS settings of the running
// server (they're environment variables, not build-time constants).
export const dynamic = "force-dynamic"

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm otpEnabled={otpAvailable()} mpinLength={MPIN_LENGTH} />
        </Suspense>
    )
}
