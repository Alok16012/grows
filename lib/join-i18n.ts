// Join form in Hindi and Marathi. Keys are the English text shown on the form;
// anything missing falls back to English. Client-safe.

export const JOIN_LANGS = { en: "English", hi: "हिन्दी", mr: "मराठी" } as const
export type JoinLang = keyof typeof JOIN_LANGS

const D: Record<string, { hi: string; mr: string }> = {
    // Header, steps, buttons
    "Employee Onboarding Form": { hi: "कर्मचारी जॉइनिंग फॉर्म", mr: "कर्मचारी जॉइनिंग फॉर्म" },
    "Fill in your details carefully. Fields marked": { hi: "अपनी जानकारी ध्यान से भरें।", mr: "तुमची माहिती काळजीपूर्वक भरा." },
    "are required.": { hi: "वाले खाने ज़रूरी हैं।", mr: "असलेली माहिती आवश्यक आहे." },
    "Personal": { hi: "व्यक्तिगत", mr: "वैयक्तिक" },
    "Employment": { hi: "नौकरी", mr: "नोकरी" },
    "Bank & Compliance": { hi: "बैंक व पीएफ/ईएसआईसी", mr: "बँक व पीएफ/ईएसआयसी" },
    "Documents": { hi: "दस्तावेज़", mr: "कागदपत्रे" },
    "Policies": { hi: "नीतियाँ", mr: "धोरणे" },
    "Back": { hi: "पीछे", mr: "मागे" },
    "Next": { hi: "आगे", mr: "पुढे" },
    "Submit": { hi: "जमा करें", mr: "सबमिट करा" },
    "Save & continue": { hi: "सेव करें और आगे बढ़ें", mr: "सेव्ह करा आणि पुढे जा" },
    "Saving…": { hi: "सेव हो रहा है…", mr: "सेव्ह होत आहे…" },
    "Required": { hi: "ज़रूरी है", mr: "आवश्यक आहे" },
    "Language": { hi: "भाषा", mr: "भाषा" },
    // Sections
    "Posting & Assignment": { hi: "पोस्टिंग और एचआर", mr: "पोस्टिंग आणि एचआर" },
    "Basic Info": { hi: "मूल जानकारी", mr: "मूलभूत माहिती" },
    "Contact": { hi: "संपर्क", mr: "संपर्क" },
    "Current Address": { hi: "वर्तमान पता", mr: "सध्याचा पत्ता" },
    "Permanent Address": { hi: "स्थायी पता", mr: "कायमचा पत्ता" },
    "Emergency Contacts": { hi: "आपातकालीन संपर्क", mr: "आपत्कालीन संपर्क" },
    "Job Details": { hi: "नौकरी की जानकारी", mr: "नोकरीची माहिती" },
    "Bank Details": { hi: "बैंक की जानकारी", mr: "बँकेची माहिती" },
    "KYC Documents": { hi: "केवाईसी जानकारी", mr: "केवायसी माहिती" },
    "PF & ESIC": { hi: "पीएफ और ईएसआईसी", mr: "पीएफ आणि ईएसआयसी" },
    "Upload Documents": { hi: "दस्तावेज़ अपलोड करें", mr: "कागदपत्रे अपलोड करा" },
    "Review Before Saving": { hi: "सेव करने से पहले जाँच लें", mr: "सेव्ह करण्यापूर्वी तपासा" },
    // Fields
    "Work Site": { hi: "काम की साइट", mr: "कामाची साइट" },
    "Assigned HR / Manager": { hi: "एचआर / मैनेजर", mr: "एचआर / मॅनेजर" },
    "First Name": { hi: "पहला नाम", mr: "पहिले नाव" },
    "Middle Name": { hi: "बीच का नाम", mr: "मधले नाव" },
    "Last Name": { hi: "उपनाम", mr: "आडनाव" },
    "Gender": { hi: "लिंग", mr: "लिंग" },
    "Date of Birth": { hi: "जन्म तिथि", mr: "जन्मतारीख" },
    "Blood Group": { hi: "ब्लड ग्रुप", mr: "रक्तगट" },
    "Marital Status": { hi: "वैवाहिक स्थिति", mr: "वैवाहिक स्थिती" },
    "Father's Name": { hi: "पिता का नाम", mr: "वडिलांचे नाव" },
    "Nationality": { hi: "राष्ट्रीयता", mr: "राष्ट्रीयत्व" },
    "Religion": { hi: "धर्म", mr: "धर्म" },
    "Caste": { hi: "जाति", mr: "जात" },
    "Name as per Aadhaar": { hi: "आधार के अनुसार नाम", mr: "आधारप्रमाणे नाव" },
    "Mobile Number": { hi: "मोबाइल नंबर", mr: "मोबाईल नंबर" },
    "Email Address": { hi: "ईमेल", mr: "ईमेल" },
    "Alternate Phone": { hi: "दूसरा फ़ोन नंबर", mr: "दुसरा फोन नंबर" },
    "Street Address": { hi: "पता (मकान, गली)", mr: "पत्ता (घर, गल्ली)" },
    "City": { hi: "शहर", mr: "शहर" },
    "State": { hi: "राज्य", mr: "राज्य" },
    "PIN Code": { hi: "पिन कोड", mr: "पिन कोड" },
    "Primary Contact Name": { hi: "संपर्क व्यक्ति का नाम", mr: "संपर्क व्यक्तीचे नाव" },
    "Primary Contact Phone": { hi: "संपर्क व्यक्ति का फ़ोन", mr: "संपर्क व्यक्तीचा फोन" },
    "Designation / Role": { hi: "पद", mr: "पद" },
    "Date of Joining": { hi: "जॉइनिंग की तारीख", mr: "रुजू होण्याची तारीख" },
    "Employment Type": { hi: "नौकरी का प्रकार", mr: "नोकरीचा प्रकार" },
    "Bank Name": { hi: "बैंक का नाम", mr: "बँकेचे नाव" },
    "Branch Name": { hi: "शाखा", mr: "शाखा" },
    "Account Number": { hi: "खाता नंबर", mr: "खाते क्रमांक" },
    "IFSC Code": { hi: "आईएफएससी कोड", mr: "आयएफएससी कोड" },
    "Aadhar Number": { hi: "आधार नंबर", mr: "आधार क्रमांक" },
    "PAN Number": { hi: "पैन नंबर", mr: "पॅन क्रमांक" },
    "UAN Number": { hi: "यूएएन नंबर", mr: "यूएएन क्रमांक" },
    "PF Number": { hi: "पीएफ नंबर", mr: "पीएफ क्रमांक" },
    "ESIC Number": { hi: "ईएसआईसी नंबर", mr: "ईएसआयसी क्रमांक" },
    // Documents
    "Aadhar Card": { hi: "आधार कार्ड", mr: "आधार कार्ड" },
    "PAN Card": { hi: "पैन कार्ड", mr: "पॅन कार्ड" },
    "Passport Size Photo": { hi: "पासपोर्ट साइज़ फ़ोटो", mr: "पासपोर्ट साइझ फोटो" },
    "Bank Passbook / Cancelled Cheque": { hi: "बैंक पासबुक / कैंसल चेक", mr: "बँक पासबुक / रद्द केलेला चेक" },
    "Any Other Document": { hi: "कोई अन्य दस्तावेज़", mr: "इतर कोणतेही कागदपत्र" },
}

export function tr(lang: JoinLang, s: string): string {
    if (lang === "en") return s
    return D[s]?.[lang] ?? s
}
