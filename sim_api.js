const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    // Simulate the GET /api/groups logic
    const companies = await prisma.company.findMany({
        include: {
            projects: {
                include: {
                    assignments: {
                        include: {
                            inspectionBoy: {
                                select: { id: true, name: true, email: true }
                            }
                        }
                    }
                }
            }
        }
    })

    let projectManagers = []
    try {
        projectManagers = await prisma.projectManager.findMany({
            include: {
                manager: {
                    select: { id: true, name: true, email: true }
                }
            }
        })
    } catch (e) {
        console.log("Error fetching projectManagers:", e.message)
    }

    const grouped = companies.map(company => ({
        id: company.id,
        name: company.name,
        projects: company.projects.map(project => {
            const inspectors = project.assignments
                .filter(a => a.inspectionBoy)
                .map(a => ({
                    ...a.inspectionBoy,
                    assignmentId: a.id
                }))

            const managers = projectManagers
                .filter(pm => pm.projectId === project.id)
                .map(pm => pm.manager)

            return {
                id: project.id,
                name: project.name,
                managers,
                inspectors
            }
        })
    })).filter(c => c.projects.length > 0)

    console.log(JSON.stringify(grouped, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
