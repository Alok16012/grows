// Outbound SMS for login OTPs.
//
// Pick a provider with SMS_PROVIDER. Indian transactional SMS needs DLT
// registration (company entity + sender ID + approved template) before any
// provider will deliver, so this stays "not configured" until that is done.
//
//   SMS_PROVIDER=http      SMS_HTTP_URL — any bulk-SMS gateway's "send" URL with
//                          placeholders: {mobile} (10 digits), {mobile91}
//                          (91 + 10 digits), {message} (full DLT text), {otp}.
//                          Put the gateway's API key, sender ID (GROWUS) and DLT
//                          template ID straight into the URL. Example:
//                          https://gateway.example/send?key=XXX&sender=GROWUS&to={mobile91}&text={message}&dlt_template_id=1107...
//                          SMS_HTTP_SUCCESS (optional) — a regex the response
//                          body must match to count as sent, for gateways that
//                          answer with status codes rather than words (e.g.
//                          SendSMSBox returns "000" on success, "007" for a bad
//                          login) — set SMS_HTTP_SUCCESS=^000 there.
//   SMS_PROVIDER=msg91     MSG91_AUTH_KEY, MSG91_TEMPLATE_ID (OTP template with ##OTP##)
//   SMS_PROVIDER=fast2sms  FAST2SMS_API_KEY (uses the "otp" route)
//   SMS_PROVIDER=console   prints the OTP to the server log — development only
//
// The message text must match the DLT-approved template character for
// character or operators drop it. Default is the approved "GROWUS_Login_OTP"
// template; override with SMS_OTP_TEXT (use {otp} where the code goes).
//
// With nothing set, development behaves like "console" and production reports
// SMS as unavailable, so the login page hides OTP instead of sending into a void.

type Provider = "http" | "msg91" | "fast2sms" | "console"

// DLT template "GROWUS_Login_OTP" (Service Implicit, approved on the STPL portal).
const DEFAULT_OTP_TEXT = "Your OTP for GROWUS login is {otp}. It is valid for 10 minutes. Do not share it with anyone."

export function otpMessage(code: string): string {
    return (process.env.SMS_OTP_TEXT || DEFAULT_OTP_TEXT).replace("{otp}", code)
}

function provider(): Provider | null {
    const p = (process.env.SMS_PROVIDER || "").toLowerCase()
    if (p === "http" && process.env.SMS_HTTP_URL) return "http"
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
        if (p === "http") {
            const url = process.env.SMS_HTTP_URL!
                .replaceAll("{mobile91}", `91${mobile10}`)
                .replaceAll("{mobile}", mobile10)
                .replaceAll("{otp}", code)
                .replaceAll("{message}", encodeURIComponent(otpMessage(code)))
            const res = await fetch(url, { method: "GET" })
            const text = await res.text().catch(() => "")
            // Gateways differ wildly in how they report errors; a non-2xx or an
            // obvious "error"/"fail" in the body is treated as not sent. When
            // SMS_HTTP_SUCCESS is set, the body must match it instead.
            const okPattern = process.env.SMS_HTTP_SUCCESS
            const failed = okPattern
                ? !new RegExp(okPattern, "i").test(text.trim())
                : /\b(error|fail(ed|ure)?|invalid)\b/i.test(text)
            if (!res.ok || failed) {
                console.error("[SMS:http] send failed", res.status, text.slice(0, 300))
                return false
            }
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
