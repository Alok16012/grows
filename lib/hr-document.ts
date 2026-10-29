// Shared helpers for HR document generation (single + bulk issue + PDF).

import { COMPANY } from "@/lib/company"

export function generateDocNumber() {
    const y = new Date().getFullYear()
    const r = Math.floor(1000 + Math.random() * 9000)
    return `DOC-${y}-${r}`
}

export function fillTemplate(template: string, vars: Record<string, string>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// Employee shape needed to populate template variables.
type DocEmployee = {
    firstName: string
    lastName: string | null
    employeeId: string
    designation: string | null
    dateOfJoining: Date | null
    basicSalary: number | null
    employeeSalary?: { ctcMonthly: number } | null
    department?: { name: string | null } | null
    branch?: { company?: { name: string | null } | null } | null
}

// {{salary}} in letters: the monthly CTC from the Salary Structure Master —
// the salary HR actually maintains. Employee.basicSalary is no longer edited
// (Edit Employee dropped it), so for most staff it was 0 or stale and letters
// went out with a blank or wrong amount. It stays only as the fallback for
// someone with no structure yet.
export function docSalary(employee: Pick<DocEmployee, "basicSalary" | "employeeSalary">): string {
    const ctc = employee.employeeSalary?.ctcMonthly ?? 0
    if (ctc > 0) return String(Math.round(ctc))
    return employee.basicSalary ? employee.basicSalary.toString() : ""
}

export function buildDocVars(employee: DocEmployee, effectiveDate?: Date | null): Record<string, string> {
    const d = effectiveDate ?? new Date()
    return {
        employee_name: `${employee.firstName} ${employee.lastName || ""}`.trim(),
        employee_id: employee.employeeId,
        designation: employee.designation || "",
        department: employee.department?.name || "",
        joining_date: employee.dateOfJoining ? new Date(employee.dateOfJoining).toLocaleDateString("en-IN") : "",
        salary: docSalary(employee),
        company_name: employee.branch?.company?.name || COMPANY.legalName,
        effective_date: d.toLocaleDateString("en-IN"),
        date: new Date().toLocaleDateString("en-IN"),
    }
}
