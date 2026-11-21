// Expense categories as shown to people, in their groups (same names as the
// Expense Claims page). Client-safe.
export const EXPENSE_CATEGORY_GROUPS: { group: string; items: [string, string][] }[] = [
    { group: "Travel", items: [["TRAVEL", "Travel"], ["TRANSPORTATION", "Transportation"], ["FUEL", "Fuel"], ["ACCOMMODATION", "Accommodation / Room Rent"]] },
    { group: "Daily Ops", items: [["FOOD", "Food & Refreshment"], ["HOTEL", "Hotel"], ["MATERIAL", "Material"], ["OFFICE_SUPPLIES", "Office Supplies"], ["OFFICE_CONSUMABLES", "Office Consumables"], ["STATIONERY_PRINTING", "Stationery & Printing"], ["HOUSEKEEPING_CLEANING", "Housekeeping & Cleaning"], ["UTILITY_ELECTRICAL", "Office Utility & Electrical"], ["REPAIR_MAINTENANCE", "Repair & Maintenance"]] },
    { group: "People & HR", items: [["SALARY_WAGES", "Salary & Wages"], ["EMPLOYEE_ADVANCE", "Employee Advance"], ["RECRUITMENT_EXPENSE", "Recruitment Expense"], ["CANDIDATE_EXPENSE", "Candidate Expense"], ["HR_OPERATIONS", "Attendance & HR Operations"], ["SAFETY_PPE", "Safety Shoes & PPE"]] },
    { group: "Business / Client", items: [["CLIENT_PROJECT", "Client / Project Expense"], ["LABOUR", "Labour Expense"], ["INSPECTION_QUALITY", "Inspection & Quality Operations"], ["COMPLIANCE_AUDIT", "Compliance & Audit Expense"], ["CELEBRATION", "Celebration & Employee Engagement"]] },
    { group: "Tech & Admin", items: [["IT_ACCESSORIES", "IT Accessories"], ["COURIER", "Courier Charges"], ["DOCUMENTATION_LEGAL", "Documentation & Legal"], ["MOBILE_RECHARGE", "Mobile Recharge"]] },
    { group: "Other", items: [["MISCELLANEOUS", "Miscellaneous Expense"], ["COMMUNICATION", "Communication"], ["MEDICAL", "Medical"], ["UNIFORM", "Uniform"], ["TRAINING", "Training"], ["OTHER", "Other"]] },
]
const LABELS = new Map(EXPENSE_CATEGORY_GROUPS.flatMap(g => g.items))
export const expenseCategoryLabel = (c: string) => LABELS.get(c) ?? c.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, x => x.toUpperCase())
