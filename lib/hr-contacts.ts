import prisma from "@/lib/prisma"

// Shared source of truth for the "Assigned HR / Manager" dropdown shown on the
// public join + onboarding forms.
//
// Who belongs here: active HR staff a new joinee can pick as their contact.
//  - System HR managers (role = HR_MANAGER) — always valid, may not have an
//    employee profile of their own.
//  - HR recruiters/executives (active custom role whose name contains "HR").
//    These ARE staff members, so they must still have a linked employee record.
//    When an HR employee is deleted from the Employee Master, their linked
//    login's `employeeProfile` relation becomes null — this `isNot: null` guard
//    drops those ghosts so deleted employees stop showing in the dropdown.
export async function getHrContacts() {
    return prisma.user.findMany({
        where: {
            isActive: true,
            OR: [
                { role: "HR_MANAGER" },
                {
                    AND: [
                        { customRole: { is: { isActive: true, name: { contains: "HR", mode: "insensitive" } } } },
                        { employeeProfile: { isNot: null } },
                    ],
                },
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
    })
}
