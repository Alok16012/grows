const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const pId = await prisma.project.findFirst()
    const uId = await prisma.user.findFirst({ where: { role: 'MANAGER' } })
    const adminId = await prisma.user.findFirst({ where: { role: 'ADMIN' } })

    if (!pId || !uId || !adminId) return console.log('missing data')

    try {
        console.log('Inserting', pId.id, uId.id, adminId.id)
        const res = await prisma.projectManager.upsert({
            where: { projectId_managerId: { projectId: pId.id, managerId: uId.id } },
            create: { projectId: pId.id, managerId: uId.id, assignedBy: adminId.id },
            update: {}
        })
        console.log('Success:', res)
    } catch (e) {
        console.error('Error:', e.message)
        console.error(e)
    }
}

main().finally(() => prisma.$disconnect())
