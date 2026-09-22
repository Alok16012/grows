import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import * as XLSX from "xlsx"
import { buildEmployeeWhere, employeeFiltersFromParams, type EmployeeFilters } from "@/lib/employee-filter"

// Ordered column list for the employee export. "Basic Salary" is only included
// for users allowed to see salary. The Employees page column picker mirrors this.
// NOTE: kept local (not exported) — a Next.js route file may only export the
// HTTP handlers + route config, otherwise the production build fails.
const EXPORT_COLUMNS = [
    "Employee ID", "First Name", "Middle Name", "Last Name", "Name As Per Aadhar",
    "Father's Name", "Phone", "Email", "Designation", "Branch", "Department",
    "Employment Type", "Basic Salary", "Status", "Date of Joining", "City",
    "Blood Group", "UAN", "PF No", "ESI No", "Aadhar No", "PAN No", "Labour Card No",
    "Contract From", "Contractor Code", "Work Order Number",
    "Bank Name", "Bank Branch", "Bank IFSC", "Bank Account",
] as const

type EmpWithRels = Awaited<ReturnType<typeof loadEmployees>>[number]

function loadEmployees(where: Record<string, unknown>) {
    return prisma.employee.findMany({
        where,
        include: { branch: { select: { name: true } }, department: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
    })
}

function buildRow(e: EmpWithRels): Record<string, string | number> {
    return {
        "Employee ID": e.employeeId,
        "First Name": e.firstName,
        "Middle Name": e.middleName ?? "",
        "Last Name": e.lastName ?? "",
        "Name As Per Aadhar": e.nameAsPerAadhar ?? "",
        "Father's Name": e.fathersName ?? "",
        "Phone": e.phone,
        "Email": e.email ?? "",
        "Designation": e.designation ?? "",
        "Branch": e.branch?.name ?? "",
        "Department": e.department?.name ?? "",
        "Employment Type": e.employmentType,
        "Basic Salary": e.basicSalary,
        "Status": e.status,
        "Date of Joining": e.dateOfJoining ? new Date(e.dateOfJoining).toISOString().split("T")[0] : "",
        "City": e.city ?? "",
        "Blood Group": e.bloodGroup ?? "",
        "UAN": e.uan ?? "",
        "PF No": e.pfNumber ?? "",
        "ESI No": e.esiNumber ?? "",
        "Aadhar No": e.aadharNumber ?? "",
        "PAN No": e.panNumber ?? "",
        "Labour Card No": e.labourCardNo ?? "",
        "Contract From": e.contractFrom ? new Date(e.contractFrom).toISOString().split("T")[0] : "",
        "Contractor Code": e.contractorCode ?? "",
        "Work Order Number": e.workOrderNumber ?? "",
        "Bank Name": e.bankName ?? "",
        "Bank Branch": e.bankBranch ?? "",
        "Bank IFSC": e.bankIFSC ?? "",
        "Bank Account": e.bankAccountNumber ?? "",
    }
}

async function buildWorkbook(opts: {
    ids?: string[]
    cols?: string[]
    filters?: EmployeeFilters
    canViewSalary: boolean
}) {
    // Ticked rows win: an explicit selection is the most specific thing the
    // user can say. Otherwise export exactly what the current filters select —
    // the status tab (All / Active / Resigned / …), department, site and
    // search. This used to be `{}`, so choosing the Active tab and hitting
    // Export still returned every employee in the table, RESIGNED rows and
    // PENDING-xxxx onboarding records included.
    const where = opts.ids && opts.ids.length
        ? { id: { in: opts.ids } }
        : buildEmployeeWhere(opts.filters ?? {})
    const employees = await loadEmployees(where)

    // Resolve which columns to include, honouring the order + salary permission.
    let columns = (opts.cols && opts.cols.length)
        ? EXPORT_COLUMNS.filter(c => opts.cols!.includes(c))
        : [...EXPORT_COLUMNS]
    if (!opts.canViewSalary) columns = columns.filter(c => c !== "Basic Salary")

    const rows = employees.map(e => {
        const full = buildRow(e)
        const picked: Record<string, string | number> = {}
        for (const c of columns) picked[c] = full[c] ?? ""
        return picked
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns })
    XLSX.utils.book_append_sheet(wb, ws, "Employees")
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

function fileResponse(buf: Buffer) {
    const today = new Date().toISOString().split("T")[0]
    return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="employees_export_${today}.xlsx"`,
        },
    })
}

// GET — all columns, filtered by the same query params the list accepts
// (?status=ACTIVE&siteId=…). No params means everyone bar onboarding, which is
// what the All tab shows.
export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const canViewSalary = checkAccess(session, [], "employees.viewSalary")
    const { searchParams } = new URL(req.url)
    const buf = await buildWorkbook({ filters: employeeFiltersFromParams(searchParams), canViewSalary })
    return fileResponse(buf)
}

// POST — export a chosen set of rows (ids) and/or columns (cols).
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "employees.view")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const canViewSalary = checkAccess(session, [], "employees.viewSalary")
    const body = await req.json().catch(() => ({}))
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : undefined
    const cols = Array.isArray(body?.cols) ? body.cols.filter((x: unknown) => typeof x === "string") : undefined
    // Sent by the Employees page so the file matches the tab and dropdowns on
    // screen. Ignored when `ids` names an explicit selection.
    const filters: EmployeeFilters = {
        branchId:       typeof body?.branchId       === "string" ? body.branchId       : null,
        departmentId:   typeof body?.departmentId   === "string" ? body.departmentId   : null,
        siteId:         typeof body?.siteId         === "string" ? body.siteId         : null,
        status:         typeof body?.status         === "string" ? body.status         : null,
        search:         typeof body?.search         === "string" ? body.search         : null,
        employmentType: typeof body?.employmentType === "string" ? body.employmentType : null,
    }
    const buf = await buildWorkbook({ ids, cols, filters, canViewSalary })
    return fileResponse(buf)
}
