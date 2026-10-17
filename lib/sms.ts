// Outbound SMS for login OTPs.
//
// Pick a provider with SMS_PROVIDER. Indian transactional SMS needs DLT
// registration (company entity + sender ID + approved template) before any
// provider will deliver, so this stays "not configured" until that is done.
//
//   SMS_PROVIDER=msg91     MSG91_AUTH_KEY, MSG91_TEMPLATE_ID (OTP template with ##OTP##)
//   SMS_PROVIDER=fast2sms  FAST2SMS_API_KEY (uses the "otp" route)
//   SMS_PROVIDER=console   prints the OTP to the server log — development only
//
// With nothing set, development behaves like "console" and production reports
// SMS as unavailable, so the login page hides OTP instead of sending into a void.

type Provider = "msg91" | "fast2sms" | "console"

function provider(): Provider | null {
    const p = (process.env.SMS_PROVIDER || "").toLowerCase()
    if (p === "msg91" && process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) return "msg91"
    if (p === "fast2sms" && process.env.FAST2SMS_API_KEY) return "fast2sms"
    if (p === "console" || (!p && process.env.NODE_ENV !== "production")) return "console"
    return null
}

export function smsConfigured(): boolean {
    return provider() !== null
}

/** Sends `code` to a 10-digit Indian mobile number. Returns false if it could not be sent. */
export async function sendOtpSms(mobile10: string, code: string): Promise<boolean> {
    const p = provider()
    if (!p || !/^\d{10}$/.test(mobile10)) return false

    try {
        if (p === "console") {
            console.log(`[SMS:console] OTP for ******${mobile10.slice(-4)} is ${code}`)
            return true
        }
        if (p === "msg91") {
            const url = new URL("https://control.msg91.com/api/v5/otp")
            url.searchParams.set("template_id", process.env.MSG91_TEMPLATE_ID!)
            url.searchParams.set("mobile", `91${mobile10}`)
            url.searchParams.set("otp", code)
            const res = await fetch(url, { method: "POST", headers: { authkey: process.env.MSG91_AUTH_KEY!, "Content-Type": "application/json" } })
            const body = await res.json().catch(() => ({})) as { type?: string }
            if (!res.ok || body.type === "error") {
                console.error("[SMS:msg91] send failed", res.status, body)
                return false
            }
            return true
        }
        // fast2sms
        const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
            method: "POST",
            headers: { authorization: process.env.FAST2SMS_API_KEY!, "Content-Type": "application/json" },
            body: JSON.stringify({ route: "otp", variables_values: code, numbers: mobile10 }),
        })
        const body = await res.json().catch(() => ({})) as { return?: boolean; message?: unknown }
        if (!res.ok || body.return === false) {
            console.error("[SMS:fast2sms] send failed", res.status, body)
            return false
        }
        return true
    } catch (err) {
        console.error(`[SMS:${p}] send error`, err)
        return false
    }
}
