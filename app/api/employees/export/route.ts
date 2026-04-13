import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import * as XLSX from "xlsx"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const employees = await prisma.employee.findMany({
        include: {
            branch: { select: { name: true } },
            department: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
    })

    const rows = employees.map(e => ({
        "Employee ID": e.employeeId,
        "First Name": e.firstName,
        "Middle Name": e.middleName ?? "",
        "Last Name": e.lastName,
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
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, "Employees")

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
    const today = new Date().toISOString().split("T")[0]

    return new NextResponse(buf, {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="employees_export_${today}.xlsx"`,
        },
    })
}
