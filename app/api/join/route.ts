import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getHrContacts } from "@/lib/hr-contacts"
import { designationOptions, onboardingPolicyMap } from "@/lib/policy-admin"
import { designationKey } from "@/lib/policy-text"
import {
    collectErrors, validationResponse,
    validatePhone, validateEmail, validateAadhaar, validatePAN,
    validateIFSC, validateBankAccount, validatePincode, validateUAN,
    validateESIC, validateDateOfBirth, validateJoiningAge, validatePFNumber,
    normalizePhone, normalizeUpper, digitsOnly,
} from "@/lib/validation"
import crypto from "crypto"
import { getJoinSettings, findJoinMatch, alertBlockedJoin, alertNewJoiner, DUPLICATE_MESSAGE } from "@/lib/join-server"
import { findLink, linkState, bumpLink } from "@/lib/join-links"
import { JOIN_OPTIONAL_FIELDS, JOIN_DOCS, type JoinDoc } from "@/lib/join-settings"
import { isPhotoDoc } from "@/lib/employee-photo"
import { recordSiteChange, actorOf } from "@/lib/site-history"
import { offerPrefill, findLeadForJoin } from "@/lib/recruitment-server"

// Public route — returns site + HR lists so the /join form can render
// the Work Site and Assigned HR dropdowns without needing a session, and the
// designations for the Designation / Role dropdown. Designations come from the
// same list the policy editor maps policies to, each with how many Onboarding
// policies the joiner will sign for it (names only, never staff counts).
export async function GET(req: Request) {
    try {
        // `ref` = the user id embedded in a personalized "Share Join Link". When
        // present we resolve that person's name so the form can pre-fill and lock
        // the HR contact — the candidate (and HR) don't pick it manually.
        const sp = new URL(req.url).searchParams
        // `l` = a Join link (Onboarding → Join links): its recruiter becomes the
        // HR contact, and its site / designation / type are filled in and locked.
        const link = await findLink(sp.get("l")).catch(() => null)
        if (link) bumpLink(link.id, "opens")
        // `o` = a candidate's personal offer link (Recruitment → Make offer).
        const offer = !link && sp.get("o") ? await offerPrefill(String(sp.get("o"))).catch(() => null) : null
        const ref = link?.recruiterId ?? offer?.hrId ?? sp.get("ref")

        const [sites, hrUsers, referrer, designations] = await Promise.all([
            prisma.site.findMany({
                where: { isActive: true },
                select: { id: true, name: true, code: true },
                orderBy: { name: "asc" },
            }),
            getHrContacts(),
            ref
                ? prisma.user.findUnique({
                    where: { id: ref },
                    select: { id: true, name: true, role: true, customRole: { select: { name: true } } },
                }).catch(() => null)
                : Promise.resolve(null),
            // A failure here must not take the sites / HR dropdowns down with it.
            Promise.all([designationOptions(), onboardingPolicyMap()])
                .then(([opts, map]) => opts.map(o => ({
                    designation: o.designation,
                    onboardingPolicies: map.forAll + (map.byKey.get(designationKey(o.designation)) ?? 0),
                })))
                .catch(e => { console.error("[JOIN_GET designations]", e); return [] }),
        ])
        const state = link ? linkState(link) : null
        const form = (await getJoinSettings().catch(() => null))?.form ?? null
        return NextResponse.json({
            sites, hrUsers, referrer, designations, form,
            link: link ? { code: link.code, siteId: link.siteId, designation: link.designation, employmentType: link.employmentType, closed: state && !state.ok ? state.reason : null } : null,
            offer,
        })
    } catch (error) {
        console.error("[JOIN_GET]", error)
        return NextResponse.json({ sites: [], hrUsers: [], referrer: null, designations: [] }, { status: 200 })
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
            phone, email,
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
            // PF / ESIC (flows into the Employee record after onboarding)
            uan, pfNumber, esiNumber, labourCardNo,
            // Bank
            bankAccountNumber, bankIFSC, bankName, bankBranch,
            // Employment
            nationality, religion, caste, nameAsPerAadhar, alternatePhone,
            // Site + HR assignment (NEW)
            // Safety (declared by employee)
            joinLink, offerToken,
        } = body
        let { siteId, hrId, designation, employmentType } = body
        // A Join link decides the recruiter, and the site / designation / type it fixes.
        const link = joinLink ? await findLink(joinLink) : null
        if (joinLink && !link) return NextResponse.json({ error: "This joining link is not valid. Please ask HR for a new link." }, { status: 410 })
        if (!link && offerToken && !hrId) { const o = await offerPrefill(String(offerToken)).catch(() => null); if (o?.hrId) hrId = o.hrId; if (o?.siteId && !siteId) siteId = o.siteId }
        if (link) {
            const st = linkState(link)
            if (!st.ok) return NextResponse.json({ error: st.reason }, { status: 410 })
            hrId = link.recruiterId
            if (link.siteId) siteId = link.siteId
            if (link.designation) designation = link.designation
            if (link.employmentType) employmentType = link.employmentType
        }

        if (!firstName?.trim() || !lastName?.trim() || !phone?.trim()) {
            return NextResponse.json(
                { error: "First name, last name and phone are required" },
                { status: 400 }
            )
        }

        // Public endpoint — the form's own checks are advisory only, so every
        // field is re-validated here with the shared rules.
        const errors = collectErrors({
            phone: validatePhone(phone),
            alternatePhone: validatePhone(alternatePhone),
            email: validateEmail(email),
            dateOfBirth: validateDateOfBirth(dateOfBirth),
            // Under-18 employment is not allowed.
            dateOfJoining: validateJoiningAge(dateOfBirth, dateOfJoining),
            pincode: validatePincode(pincode),
            permanentPincode: validatePincode(permanentPincode),
            emergencyContact1Phone: validatePhone(emergencyContact1Phone),
            emergencyContact2Phone: validatePhone(emergencyContact2Phone),
            aadharNumber: validateAadhaar(aadharNumber),
            panNumber: validatePAN(panNumber),
            bankAccountNumber: validateBankAccount(bankAccountNumber),
            bankIFSC: validateIFSC(bankIFSC),
            uan: validateUAN(uan),
            pfNumber: validatePFNumber(pfNumber),
            esiNumber: validateESIC(esiNumber),
        })
        // The join form reads `data.message || data.error` off the JSON body.
        if (errors) return NextResponse.json(validationResponse(errors), { status: 400 })

        // Optional fields HR made required (Join links → Form settings), and PAN
        // when it is switched to optional.
        const joinSettings = await getJoinSettings()
        for (const k of joinSettings.form.required) {
            const v = k === "permanentAddress" && body.sameAsCurrent ? "same" : body[k]
            if (!String(v ?? "").trim()) return NextResponse.json({ error: `${JOIN_OPTIONAL_FIELDS[k]} is required` }, { status: 400 })
        }

        // Store and dedupe on the same canonical form of the number.
        const normalizedPhone = normalizePhone(phone)

        // Already on record? Mobile and email always (they are the login); Aadhaar /
        // PAN / bank / UAN per Join link settings — the duplicates cleaned up in Nov
        // 2026 came in because only mobile/email were checked. The message is the
        // same whoever matched (a public form reveals nothing about the record);
        // HR is told, and an ex-employee coming back becomes a rejoin request.
        // Documents come WITH the form (uploaded first by the page). The record used
        // to be created first and the files sent after, so a failed upload or a
        // closed tab left a candidate with no KYC on file — and they re-registered,
        // which is how duplicate records appeared. Now no record is made unless
        // every required document is here.
        const DOC_TYPES = new Set(["AADHAAR", "PAN", "PHOTO", "BANK_DETAILS", "OTHER", "RESUME", "CERTIFICATE"])
        const okUrl = (u: string) => /^sb:\/\//.test(u) || /^https:\/\/[\w.-]+\.supabase\.co\//.test(u) || /^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/.test(u)
        const documents: { type: string; fileName: string; fileUrl: string }[] = (Array.isArray(body.documents) ? body.documents : [])
            .filter((d: any) => d && typeof d.type === "string" && typeof d.fileUrl === "string" && DOC_TYPES.has(d.type.toUpperCase()) && okUrl(d.fileUrl))
            .slice(0, 12)
            .map((d: any) => ({ type: String(d.type).toUpperCase(), fileName: String(d.fileName || d.type).slice(0, 200), fileUrl: String(d.fileUrl) }))
        const missingDocs = joinSettings.form.docs.filter((t: JoinDoc) => !documents.some(d => d.type === t))
        if (missingDocs.length) return NextResponse.json({ error: `Upload required documents: ${missingDocs.map(t => JOIN_DOCS[t]).join(", ")}. If this page was open for a long time, refresh it and try again.`, missingDocs }, { status: 400 })

        const match = await findJoinMatch({ phone: normalizedPhone, email, aadharNumber, panNumber, bankAccountNumber, uan }, joinSettings)
        if (match) {
            await alertBlockedJoin(match, { firstName, lastName, phone: normalizedPhone, designation, siteId, dateOfJoining, hrId }, joinSettings).catch(e => console.error("[JOIN_ALERT_BLOCKED]", e))
            if (link) bumpLink(link.id, "blocked")
            return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 })
        }

        // Generate onboarding token for the external form link
        const onboardingToken = crypto.randomUUID().replace(/-/g, "")

        // Self-registered candidates are PENDING approval — they don't get a real
        // EMP-NNNN code until their onboarding is approved (a real code is assigned
        // then). Until then they carry a temporary PENDING-xxxx placeholder so all
        // approved employees share one consistent EMP-NNNN format.
        const employeeId = `PENDING-${onboardingToken.slice(0, 10).toUpperCase()}`

        // Create employee
        const employee = await prisma.employee.create({
            data: {
                employeeId,
                firstName:  firstName.trim(),
                lastName:   lastName.trim(),
                middleName: middleName?.trim() || null,
                phone:      normalizedPhone,
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
                aadharNumber:     aadharNumber ? digitsOnly(aadharNumber)  : null,
                panNumber:        panNumber    ? normalizeUpper(panNumber) : null,
                uan:              uan              || null,
                pfNumber:         pfNumber         || null,
                labourCardNo:     labourCardNo     || null,
                esiNumber:        esiNumber        || null,
                bankAccountNumber: bankAccountNumber || null,
                bankIFSC:          bankIFSC ? normalizeUpper(bankIFSC) : null,
                bankName:          bankName          || null,
                bankBranch:        bankBranch        || null,
                // employmentType is non-nullable in the schema with a default —
                // only set when provided, otherwise let the default apply.
                ...(employmentType ? { employmentType } : {}),
                nationality:       nationality       || null,
                religion:          religion          || null,
                caste:             caste             || null,
                nameAsPerAadhar:   nameAsPerAadhar   || null,
                alternatePhone:    alternatePhone ? normalizePhone(alternatePhone) : null,
                // HR assignment from self-registration form
                managerId:         hrId              || null,
                // Safety equipment declared by employee
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
            // Owner = the recruiter whose link was used (hrId), so the lead shows
            // up in THAT recruiter's Recruitment pipeline. Falls back to an admin
            // if there's no valid recruiter, so the lead is always created.
            let ownerId: string | null = adminUser?.id ?? null
            if (hrId) {
                const rec = await prisma.user.findUnique({ where: { id: hrId }, select: { id: true } })
                if (rec) ownerId = rec.id
            }
            const existingLeadId = await findLeadForJoin(offerToken ? String(offerToken) : null, normalizedPhone).catch(() => null)
            if (existingLeadId) {
                const prevLead = await prisma.lead.findUnique({ where: { id: existingLeadId }, select: { assignedTo: true, createdBy: true, siteId: true } })
                await prisma.lead.update({ where: { id: existingLeadId }, data: { status: "ON_SITE_JOINED" as any, stageChangedAt: new Date(), convertedEmployeeId: employee.id, siteId: siteId || prevLead?.siteId || null, assignedTo: prevLead?.assignedTo ?? ownerId } })
                await prisma.leadActivity.create({ data: { leadId: existingLeadId, userId: prevLead?.assignedTo ?? prevLead?.createdBy ?? ownerId!, type: "status_change", content: `Filled the joining form${offerToken ? " (offer link)" : ""} — now an employee` } }).catch(() => {})
            } else if (ownerId) {
                const candidateName = [firstName.trim(), middleName?.trim(), lastName.trim()].filter(Boolean).join(" ")
                await prisma.lead.create({
                    data: {
                        candidateName,
                        phone:    normalizedPhone,
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
                        createdBy: ownerId,
                        assignedTo: ownerId,
                        convertedEmployeeId: employee.id,
                        formSlug: link?.code ?? null,
                        stageChangedAt: new Date(),
                    } as any,
                })
            }
        } catch (leadErr) {
            // Non-fatal — employee is already created, lead is a nice-to-have for HR visibility
            console.error("[JOIN_POST] lead-mirror failed:", leadErr)
        }

        // Save the documents now; without them the record must not stay.
        try {
            const seen = new Set<string>()
            const rows = documents.filter(d => d.type === "OTHER" || (!seen.has(d.type) && !!seen.add(d.type)))
            await prisma.employeeDocument.createMany({ data: rows.map(d => ({ employeeId: employee.id, type: d.type, fileName: d.fileName, fileUrl: d.fileUrl, status: "PENDING" })) })
            const photoDoc = rows.find(d => isPhotoDoc(d.type, d.fileName))
            if (photoDoc && !photo) await prisma.employee.update({ where: { id: employee.id }, data: { photo: photoDoc.fileUrl } }).catch(() => {})
        } catch (docErr) {
            console.error("[JOIN_POST] documents failed — removing the record", docErr)
            await prisma.lead.deleteMany({ where: { convertedEmployeeId: employee.id } as any }).catch(() => {})
            await prisma.employee.delete({ where: { id: employee.id } }).catch(() => {})
            return NextResponse.json({ error: "Your documents could not be saved. Nothing was submitted — please try again." }, { status: 500 })
        }

        recordSiteChange({
            action: "employee.create", employeeId: employee.id, source: "Join link",
            joiningDate: employee.dateOfJoining, siteId: siteId || null, req,
        })

        // If a site was selected, create an active Deployment for the new employee
        if (siteId) {
            const posted = await prisma.deployment.create({
                data: {
                    employeeId: employee.id,
                    siteId,
                    startDate: new Date(),
                    isActive: true,
                },
            }).catch(err => {
                console.error("[JOIN_POST_DEPLOYMENT]", err)
                return null
            })
            if (posted) recordSiteChange({ action: "deployment.assign", employeeId: employee.id, siteId, startDate: posted.startDate, source: "Join link", req })
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

        if (link) await bumpLink(link.id, "submits")
        await alertNewJoiner({ name: [firstName.trim(), middleName?.trim(), lastName.trim()].filter(Boolean).join(" "), designation, siteId, hrId }, joinSettings).catch(e => console.error("[JOIN_ALERT_NEW]", e))

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
