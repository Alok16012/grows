import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

// POST /api/test-login  { input, password }
// Diagnostic endpoint — does NOT create a session. Returns step-by-step
// what would happen during login. Use to debug failed logins.
export async function POST(req: Request) {
    try {
        const { input, password } = await req.json()
        if (!input || !password) {
            return NextResponse.json({ ok: false, reason: "missing_input" }, { status: 400 })
        }

        const trace: any[] = []
        const inputRaw = String(input).trim()
        const inputClean = inputRaw.replace(/@cims\.local$/i, "").trim()
        const inputDigits = inputClean.replace(/\D/g, "").slice(-10)
        const passwordDigits = String(password).replace(/\D/g, "").slice(-10)

        trace.push({ step: "parsed", inputRaw, inputClean, inputDigits, passwordDigits })

        // Step 1: email lookup
        const userByEmail = await prisma.user.findUnique({
            where: { email: inputRaw },
            select: { id: true, email: true, role: true, isActive: true, password: true, name: true }
        })
        trace.push({
            step: "email_lookup",
            found: !!userByEmail,
            email: userByEmail?.email,
            isActive: userByEmail?.isActive,
            hasPassword: !!userByEmail?.password,
        })

        // Step 2: phone lookup via Employee
        let employee: any = null
        if (inputDigits.length === 10) {
            employee = await prisma.employee.findFirst({
                where: { phone: { endsWith: inputDigits } },
                include: {
                    user: {
                        select: { id: true, email: true, role: true, isActive: true, password: true, name: true }
                    }
                }
            })
            trace.push({
                step: "phone_lookup",
                found: !!employee,
                employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
                employeeId: employee?.employeeId,
                phoneStored: employee?.phone,
                hasUserAccount: !!employee?.user,
                userIsActive: employee?.user?.isActive,
                userHasPassword: !!employee?.user?.password,
            })
        }

        // Step 3: employeeId lookup
        if (!employee) {
            employee = await prisma.employee.findFirst({
                where: { employeeId: { equals: inputClean, mode: "insensitive" } },
                include: {
                    user: {
                        select: { id: true, email: true, role: true, isActive: true, password: true, name: true }
                    }
                }
            })
            trace.push({
                step: "employeeId_lookup",
                found: !!employee,
                employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
                hasUserAccount: !!employee?.user,
            })
        }

        // Pick a user
        const user = userByEmail || employee?.user || null
        if (!user) {
            return NextResponse.json({
                ok: false,
                reason: "no_user_found",
                hint: employee ? "Employee exists but has no User account. If password equals phone digits, login will auto-create one." : "No employee or user matches this input.",
                trace,
            })
        }

        // Password compare
        let bcryptOk = false
        let bcryptErr: string | null = null
        try {
            if (user.password) {
                bcryptOk = await bcrypt.compare(password, user.password)
            }
        } catch (e: any) {
            bcryptErr = e.message
        }
        trace.push({ step: "bcrypt_compare", ok: bcryptOk, hadStoredPassword: !!user.password, bcryptErr })

        // Phone-equals-password check
        const empPhoneDigits = employee?.phone ? String(employee.phone).replace(/\D/g, "").slice(-10) : ""
        const passwordIsPhone = empPhoneDigits.length === 10 && passwordDigits === empPhoneDigits
        trace.push({ step: "phone_equals_password", passwordIsPhone, empPhoneDigits, passwordDigits })

        if (!bcryptOk && !passwordIsPhone) {
            return NextResponse.json({
                ok: false,
                reason: "password_mismatch",
                hint: `Stored password hash does not match typed password, AND typed password is not the employee's phone (digits ${empPhoneDigits || "n/a"}). Try password = phone number.`,
                trace,
            })
        }

        if (!user.isActive && !passwordIsPhone) {
            return NextResponse.json({ ok: false, reason: "account_inactive", trace })
        }

        return NextResponse.json({
            ok: true,
            wouldLoginAs: { id: user.id, email: user.email, role: user.role, name: user.name },
            note: passwordIsPhone && !bcryptOk ? "Login will succeed via auto-heal (password=phone)." : "Login will succeed normally.",
            trace,
        })
    } catch (e: any) {
        return NextResponse.json({ ok: false, reason: "server_error", error: e.message }, { status: 500 })
    }
}
