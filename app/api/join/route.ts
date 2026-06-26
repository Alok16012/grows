import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import crypto from "crypto"

// Public route — returns site + HR lists so the /join form can render
// the Work Site and Assigned HR dropdowns without needing a session.
export async function GET() {
    try {
        const [sites, hrUsers] = await Promise.all([
            prisma.site.findMany({
                where: { isActive: true },
                select: { id: true, name: true, code: true },
                orderBy: { name: "asc" },
            }),
            prisma.user.findMany({
                where: {
                    isActive: true,
                    // Only HR people belong in the "Select your HR contact" list —
                    // not every role that happens to have recruitment.view (Ops
                    // Manager, Payroll, MIS, etc.). Match the HR_MANAGER system role
                    // and any active custom role whose name contains "HR"
                    // (HR Recruiter, HR Executive, HR Manager…).
                    OR: [
                        { role: "HR_MANAGER" },
                        { customRole: { is: { isActive: true, name: { contains: "HR", mode: "insensitive" } } } },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    customRole: { select: { name: true } },
                },
                orderBy: { name: "asc" },
            }),
        ])
        return NextResponse.json({ sites, hrUsers })
    } catch (error) {
        console.error("[JOIN_GET]", error)
        return NextResponse.json({ sites: [], hrUsers: [] }, { status: 200 })
    }
}

const DEFAULT_TASKS = [
    { title: "Collect Aadhar Card",           category: "Documents",   order: 1 },
    { title: "Collect PAN Card",              category: "Documents",   order: 2 },
    { title: "Collect Bank Details",          category: "Documents",   order: 3 },
    { title: "Collect Passport Photo",        category: "Documents",   order: 4 },
    { title: "Sign Offer Letter",             category: "Documents",   order: 5 },
    { title: "Sign NDA / Agreement",          category: "Documents",   order: 6 },
    { title: "Issue ID Card",                 category: "Welcome Kit", order: 7 },
    { title: "Issue Uniform",                 category: "Welcome Kit", order: 8 },
    { title: "Site/Location Briefing",        category: "Orientation", order: 9 },
    { title: "Safety Training",               category: "Training",    order: 10 },
    { title: "Role & Responsibility Briefing",category: "Orientation", order: 11 },
    { title: "Add to Attendance System",      category: "IT Setup",    order: 12 },
    { title: "PF Registration",               category: "Compliance",  order: 13 },
    { title: "ESI Registration",              category: "Compliance",  order: 14 },
]

// Public route — no auth required
// POST /api/join — creates an Employee (ONBOARDING status) + OnboardingRecord from external form
export async function POST(req: Request) {
    try {
        const body = await req.json()

        const {
            firstName, lastName, middleName,
            phone, email, designation,
            dateOfJoining,
            photo,
            // Personal
            dateOfBirth, gender, bloodGroup, fathersName, maritalStatus,
            // Current address
            address, city, state, pincode,
            // Permanent address
            permanentAddress, permanentCity, permanentState, permanentPincode,
            // Emergency
            emergencyContact1Name, emergencyContact1Phone,
            emergencyContact2Name, emergencyContact2Phone,
            // KYC
            aadharNumber, panNumber,
            // Bank
            bankAccountNumber, bankIFSC, bankName, bankBranch,
            // Employment
            employmentType, nationality, religion,
            // Site + HR assignment (NEW)
            siteId, hrId,
            // Safety (declared by employee)
            safetyGoggles, safetyGloves, safetyHelmet,
            safetyMask, safetyJacket, safetyEarMuffs, safetyShoes,
        } = body

        if (!firstName?.trim() || !lastName?.trim() || !phone?.trim()) {
            return NextResponse.json(
                { error: "First name, last name and phone are required" },
                { status: 400 }
            )
        }

        if (!/^[6-9]\d{9}$/.test(phone.replace(/\s/g, ""))) {
            return NextResponse.json({ error: "Enter a valid 10-digit phone number" }, { status: 400 })
        }

        // Check if phone or email already exists
        if (email?.trim()) {
            const byEmail = await prisma.employee.findFirst({ where: { email: email.trim() } })
            if (byEmail) return NextResponse.json({ error: "This email is already registered" }, { status: 409 })
        }
        const byPhone = await prisma.employee.findFirst({ where: { phone: phone.trim() } })
        if (byPhone) return NextResponse.json({ error: "This phone number is already registered" }, { status: 409 })

        // Auto-generate unique employeeId: EXT-YYYYMMDD-XXXX
        const today = new Date()
        const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`
        const randPart = crypto.randomInt(1000, 9999)
        const employeeId = `EXT-${datePart}-${randPart}`

        // Generate onboarding token for the external form link
        const onboardingToken = crypto.randomUUID().replace(/-/g, "")

        // Create employee
        const employee = await prisma.employee.create({
            data: {
                employeeId,
                firstName:  firstName.trim(),
                lastName:   lastName.trim(),
                middleName: middleName?.trim() || null,
                phone:      phone.trim(),
                email:      email?.trim() || null,
                designation: designation?.trim() || null,
                dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : null,
                dateOfBirth:   dateOfBirth   ? new Date(dateOfBirth)   : null,
                gender:          gender          || null,
                bloodGroup:      bloodGroup      || null,
                fathersName:     fathersName     || null,
                maritalStatus:   maritalStatus   || null,
                address:         address         || null,
                city:            city            || null,
                state:           state           || null,
                pincode:         pincode         || null,
                permanentAddress:  permanentAddress  || null,
                permanentCity:     permanentCity     || null,
                permanentState:    permanentState    || null,
                permanentPincode:  permanentPincode  || null,
                emergencyContact1Name:  emergencyContact1Name  || null,
                emergencyContact1Phone: emergencyContact1Phone || null,
                emergencyContact2Name:  emergencyContact2Name  || null,
                emergencyContact2Phone: emergencyContact2Phone || null,
                aadharNumber:     aadharNumber     || null,
                panNumber:        panNumber        || null,
                bankAccountNumber: bankAccountNumber || null,
                bankIFSC:          bankIFSC          || null,
                bankName:          bankName          || null,
                bankBranch:        bankBranch        || null,
                // employmentType is non-nullable in the schema with a default —
                // only set when provided, otherwise let the default apply.
                ...(employmentType ? { employmentType } : {}),
                nationality:       nationality       || null,
                religion:          religion          || null,
                // HR assignment from self-registration form
                managerId:         hrId              || null,
                // Safety equipment declared by employee
                safetyGoggles:  !!safetyGoggles,
                safetyGloves:   !!safetyGloves,
                safetyHelmet:   !!safetyHelmet,
                safetyMask:     !!safetyMask,
                safetyJacket:   !!safetyJacket,
                safetyEarMuffs: !!safetyEarMuffs,
                safetyShoes:    !!safetyShoes,
                status:            "ONBOARDING",
                onboardingToken,
                photo:             photo || null,
            },
        })

        // Also create a Lead in ON_SITE_JOINED status so the candidate
        // appears in the Recruitment kanban — even though they bypassed
        // the apply form and went straight through external onboarding.
        try {
            const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } })
            if (adminUser) {
                const candidateName = [firstName.trim(), middleName?.trim(), lastName.trim()].filter(Boolean).join(" ")
                await prisma.lead.create({
                    data: {
                        candidateName,
                        phone:    phone.trim(),
                        email:    email?.trim() || null,
                        city:     city || null,
                        position: designation?.trim() || "Not Specified",
                        gender:   gender || null,
                        profileUrl: photo || null,
                        source:   "External Onboarding",
                        status:   "ON_SITE_JOINED" as any,
                        priority: "MEDIUM",
                        score:    "WARM",
                        siteId:   siteId || null,
                        createdBy: adminUser.id,
                        convertedEmployeeId: employee.id,
                    } as any,
                })
            }
        } catch (leadErr) {
            // Non-fatal — employee is already created, lead is a nice-to-have for HR visibility
            console.error("[JOIN_POST] lead-mirror failed:", leadErr)
        }

        // If a site was selected, create an active Deployment for the new employee
        if (siteId) {
            await prisma.deployment.create({
                data: {
                    employeeId: employee.id,
                    siteId,
                    startDate: new Date(),
                    isActive: true,
                },
            }).catch(err => {
                console.error("[JOIN_POST_DEPLOYMENT]", err)
            })
        }

        // Create onboarding record with default tasks
        await prisma.onboardingRecord.create({
            data: {
                employeeId: employee.id,
                status: "IN_PROGRESS",
                startedAt: new Date(),
                tasks: {
                    create: DEFAULT_TASKS.map(t => ({
                        employeeId: employee.id,
                        title: t.title,
                        category: t.category,
                        order: t.order,
                        status: "PENDING" as const,
                        isRequired: true,
                    })),
                },
            },
        })

        return NextResponse.json({
            success: true,
            employeeId,
            onboardingToken,
            employeeDbId: employee.id,
            message: "Onboarding form submitted successfully",
        })
    } catch (error: any) {
        console.error("[JOIN_POST]", error)
        return NextResponse.json(
            { error: "Internal Error", message: error.message },
            { status: 500 }
        )
    }
}
