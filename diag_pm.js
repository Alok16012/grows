const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    console.log("--- PROJECT MANAGERS RAW ---")
    const pms = await prisma.projectManager.findMany()

    if (pms.length === 0) {
        console.log("No ProjectManager records found.")
    } else {
        for (const pm of pms) {
            console.log(`ID: ${pm.id}`)
            console.log(`ProjectID: ${pm.projectId}`)
            console.log(`ManagerID: ${pm.managerId}`)

            const project = await prisma.project.findUnique({ where: { id: pm.projectId } })
            const manager = await prisma.user.findUnique({ where: { id: pm.managerId } })

            console.log(`Project exists: ${!!project} (${project ? project.name : 'N/A'})`)
            console.log(`Manager exists: ${!!manager} (${manager ? manager.name + ' ' + manager.role : 'N/A'})`)
            console.log("---")
        }
    }

    console.log("\n--- MANAGERS LIST ---")
    const managers = await prisma.user.findMany({ where: { role: 'MANAGER' } })
    managers.forEach(m => console.log(`${m.name} (${m.id})`))
}

main().catch(console.error).finally(() => prisma.$disconnect())
