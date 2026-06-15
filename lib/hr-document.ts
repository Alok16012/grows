// Shared helpers for HR document generation (single + bulk issue + PDF).

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
    department?: { name: string | null } | null
    branch?: { company?: { name: string | null } | null } | null
}

export function buildDocVars(employee: DocEmployee, effectiveDate?: Date | null): Record<string, string> {
    const d = effectiveDate ?? new Date()
    return {
        employee_name: `${employee.firstName} ${employee.lastName || ""}`.trim(),
        employee_id: employee.employeeId,
        designation: employee.designation || "",
        department: employee.department?.name || "",
        joining_date: employee.dateOfJoining ? new Date(employee.dateOfJoining).toLocaleDateString("en-IN") : "",
        salary: employee.basicSalary?.toString() || "",
        company_name: employee.branch?.company?.name || "Growus Auto India Pvt. Ltd.",
        effective_date: d.toLocaleDateString("en-IN"),
        date: new Date().toLocaleDateString("en-IN"),
    }
}
