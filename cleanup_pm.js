const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    console.log("--- CLEANING UP ORPHANED PROJECT MANAGERS ---")
    const pms = await prisma.projectManager.findMany()

    let deletedCount = 0;
    for (const pm of pms) {
        const project = await prisma.project.findUnique({ where: { id: pm.projectId } })
        const manager = await prisma.user.findUnique({ where: { id: pm.managerId } })

        if (!project || !manager) {
            console.log(`Deleting orphaned record ID: ${pm.id} (Project exists: ${!!project}, Manager exists: ${!!manager})`)
            await prisma.projectManager.delete({ where: { id: pm.id } })
            deletedCount++;
        }
    }

    console.log(`\nDeleted ${deletedCount} orphaned records.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
