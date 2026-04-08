
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const templates = [
  // --- QUALITY INSPECTOR ---
  { role: "INSPECTION_BOY", kraTitle: "Inspection Accuracy", kpiTitle: "No. of inspections/day", targetHint: "15", weightage: 25 },
  { role: "INSPECTION_BOY", kraTitle: "Inspection Accuracy", kpiTitle: "Error rate (%)", targetHint: "2", weightage: 25 },
  { role: "INSPECTION_BOY", kraTitle: "Report Submission", kpiTitle: "Report submission TAT (Hrs)", targetHint: "2", weightage: 25 },
  { role: "INSPECTION_BOY", kraTitle: "Defect Detection", kpiTitle: "Rejection detection %", targetHint: "5", weightage: 25 },

  // --- QUALITY SUPERVISOR (Using MANAGER role for now or specific designation) ---
  { role: "MANAGER", kraTitle: "Team Productivity", kpiTitle: "Team output (Total Inspections)", targetHint: "100", weightage: 30 },
  { role: "MANAGER", kraTitle: "Quality Control", kpiTitle: "Defect rate across team (%)", targetHint: "3", weightage: 30 },
  { role: "MANAGER", kraTitle: "Client Satisfaction", kpiTitle: "Client complaints", targetHint: "0", weightage: 20 },
  { role: "MANAGER", kraTitle: "On-time reporting", kpiTitle: "On-time reporting %", targetHint: "95", weightage: 20 },

  // --- HR RECRUITER ---
  { role: "ADMIN", kraTitle: "Hiring", kpiTitle: "No. of joinings per month", targetHint: "10", weightage: 40 },
  { role: "ADMIN", kraTitle: "Hiring", kpiTitle: "Conversion ratio (Interview to Joining)", targetHint: "20", weightage: 20 },
  { role: "ADMIN", kraTitle: "Hiring", kpiTitle: "Time to hire (Days)", targetHint: "15", weightage: 20 },
  { role: "ADMIN", kraTitle: "Pipeline efficiency", kpiTitle: "Offer acceptance rate (%)", targetHint: "80", weightage: 20 },

  // --- HR EXECUTIVE ---
  { role: "ADMIN", kraTitle: "Employee Management", kpiTitle: "Onboarding completion %", targetHint: "100", weightage: 30 },
  { role: "ADMIN", kraTitle: "Documentation", kpiTitle: "Document accuracy (%)", targetHint: "98", weightage: 30 },
  { role: "ADMIN", kraTitle: "Engagement", kpiTitle: "Employee retention rate (%)", targetHint: "90", weightage: 20 },
  { role: "ADMIN", kraTitle: "Engagement", kpiTitle: "Query resolution time (Hrs)", targetHint: "24", weightage: 20 },

  // --- PAYROLL MANAGER ---
  { role: "ADMIN", kraTitle: "Payroll Accuracy", kpiTitle: "Payroll error %", targetHint: "0", weightage: 40 },
  { role: "ADMIN", kraTitle: "Payroll Accuracy", kpiTitle: "On-time salary %", targetHint: "100", weightage: 30 },
  { role: "ADMIN", kraTitle: "Compliance", kpiTitle: "Compliance filing accuracy (%)", targetHint: "100", weightage: 20 },
  { role: "ADMIN", kraTitle: "Compliance", kpiTitle: "Audit issues identified", targetHint: "0", weightage: 10 },
];

async function main() {
  console.log('Seeding KPI Templates...');
  for (const t of templates) {
    await prisma.kPITemplate.create({
      data: t
    });
  }
  console.log('Seeding completed.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
