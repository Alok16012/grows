// Fields whose changes can be held for approval. Client-safe.
export const APPROVABLE_FIELDS: { key: string; label: string }[] = [
    { key: "bankAccountNumber", label: "Bank account" }, { key: "bankIFSC", label: "IFSC" }, { key: "bankName", label: "Bank name" }, { key: "bankBranch", label: "Bank branch" },
    { key: "panNumber", label: "PAN" }, { key: "aadharNumber", label: "Aadhaar" }, { key: "nameAsPerAadhar", label: "Name as per Aadhaar" },
    { key: "uan", label: "UAN" }, { key: "pfNumber", label: "PF number" }, { key: "esiNumber", label: "ESIC number" },
    { key: "firstName", label: "First name" }, { key: "middleName", label: "Middle name" }, { key: "lastName", label: "Last name" },
    { key: "dateOfBirth", label: "Date of birth" }, { key: "fathersName", label: "Father's name" },
    { key: "phone", label: "Mobile" }, { key: "email", label: "Email" },
]
