import type { Metadata } from "next"
import Link from "next/link"
import { COMPANY } from "@/lib/company"

// Terms of Use and Privacy Notice — public (no sign-in), linked from the
// sidebar footer and the login page.
//
// Version 1.0, reviewed and confirmed by the Admin on 13 Nov 2026 from the
// v0.2 revised draft. Every factual statement was checked against the app:
// sign-in lockout (lib/login-security), location read only on punch in/out,
// site check-in and when an inspection form opens (no background tracking),
// optional religion/caste/blood group fields, hosting in Tokyo, Japan
// (Supabase ap-northeast-1, Vercel hnd1), and the append-only audit log.
//
// Grievance contact: fill these in when the company names its officer. Until
// then the notice points people to HR and the in-app Helpdesk, which exist.
const GRIEVANCE = {
    name: "",          // e.g. "Priya Sharma"
    designation: "",   // e.g. "Head – Human Resources"
    email: "",
    phone: "",
    address: "",       // registered office
}
const VERSION = "1.0"
const EFFECTIVE = "13 November 2026"

export const metadata: Metadata = {
    title: `Terms of Use and Privacy Notice · ${COMPANY.name}`,
    description: `How ${COMPANY.name} may be used and how ${COMPANY.legalName} handles personal data in it.`,
}

type Item = readonly [id: string, title: string]
const PART_A: Item[] = [
    ["about", "About Growus ERP"],
    ["access", "Eligibility and authorised access"],
    ["security-account", "Account security and sign-in"],
    ["use", "Acceptable use"],
    ["suspension", "Suspension and termination of access"],
]
const PART_B: Item[] = [
    ["purpose", "Purpose of this privacy notice"],
    ["data", "Personal data we collect"],
    ["why", "Why we use personal data"],
    ["location", "Location and camera"],
    ["sharing", "Sharing of personal data"],
    ["storage", "Data storage and security"],
    ["retention", "Data retention and deletion"],
    ["rights", "Your rights"],
    ["changes", "Changes to this notice"],
    ["contact", "Contact and grievance redressal"],
]
const ALL = [...PART_A, ...PART_B]

function Section({ id, children }: { id: string; children: React.ReactNode }) {
    const n = ALL.findIndex(([k]) => k === id) + 1
    const title = ALL[n - 1][1]
    return (
        <section id={id} className="scroll-mt-24 space-y-3">
            <h3 className="text-[17px] font-bold text-[#0a1f4f]">{n}. {title}</h3>
            <div className="space-y-3 text-[14.5px] leading-[1.7] text-slate-700">{children}</div>
        </section>
    )
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <h4 className="text-[14.5px] font-semibold text-slate-900">{title}</h4>
            {children}
        </div>
    )
}

function Bullets({ items }: { items: React.ReactNode[] }) {
    return <ul className="list-disc pl-5 space-y-1.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
}

function PartHeading({ letter, title }: { letter: string; title: string }) {
    return (
        <div className="pt-2 border-t border-slate-200">
            <p className="text-[11px] font-bold tracking-[1.2px] uppercase text-[#1f4fd8]">Part {letter}</p>
            <h2 className="text-[21px] font-bold text-[#0a1f4f]">{title}</h2>
        </div>
    )
}

export default function TermsPage() {
    const org = COMPANY.legalName
    const g = GRIEVANCE
    return (
        <div className="min-h-screen bg-[#f4f6fb]">
            {/* Header in the sidebar's sapphire */}
            <header className="bg-[linear-gradient(180deg,#0c2459_0%,#0a1f4f_100%)] text-white">
                <div className="mx-auto max-w-[880px] px-4 sm:px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2.5">
                        <span className="h-9 w-9 rounded-[10px] bg-white text-[#0a1f4f] flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 3h18v18H3z" />
                                <path d="M18 9h-6v6h6v-3h-3" />
                            </svg>
                        </span>
                        <span className="text-[17px] font-bold">{COMPANY.shortName} <span className="text-[#93b8ff]">{COMPANY.nameSuffix}</span></span>
                    </Link>
                    <Link href="/" className="text-[13px] font-medium text-white/80 hover:text-white">Back to the app →</Link>
                </div>
            </header>

            <main className="mx-auto max-w-[880px] px-4 sm:px-6 py-8 sm:py-10">
                <article className="rounded-[16px] bg-white border border-slate-200 shadow-[0_1px_2px_rgba(15,23,41,0.04)] px-5 py-7 sm:px-10 sm:py-10 space-y-9">
                    <div className="space-y-3">
                        <h1 className="text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] text-[#0a1f4f]">Terms of Use and Privacy Notice</h1>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13.5px]">
                            <dt className="text-slate-500">Company</dt><dd className="text-slate-800">{org}</dd>
                            <dt className="text-slate-500">Product</dt><dd className="text-slate-800">{COMPANY.name} — web application and mobile application</dd>
                            <dt className="text-slate-500">Version</dt><dd className="text-slate-800">{VERSION}</dd>
                            <dt className="text-slate-500">Effective</dt><dd className="text-slate-800">{EFFECTIVE}</dd>
                        </dl>
                    </div>

                    <nav aria-label="Contents" className="rounded-[12px] bg-[#f4f6fb] px-5 py-4 space-y-3">
                        <p className="text-[11px] font-bold tracking-[1px] uppercase text-slate-500">Contents</p>
                        {([["A", "Terms of Use", PART_A, 0], ["B", "Privacy Notice", PART_B, PART_A.length]] as const).map(([letter, title, items, offset]) => (
                            <div key={letter}>
                                <p className="text-[12.5px] font-semibold text-slate-700 mb-1">Part {letter} — {title}</p>
                                <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[14px]">
                                    {items.map(([id, t], i) => (
                                        <li key={id}><a href={`#${id}`} className="text-[#1f4fd8] hover:underline">{offset + i + 1}. {t}</a></li>
                                    ))}
                                </ol>
                            </div>
                        ))}
                    </nav>

                    {/* ───────────── PART A ───────────── */}
                    <PartHeading letter="A" title="Terms of Use" />

                    <Section id="about">
                        <p>
                            {COMPANY.name} (&quot;the platform&quot;) is operated by {org} (&quot;the Company&quot;, &quot;we&quot;, &quot;us&quot;).
                            It supports the Company&apos;s operations, including:
                        </p>
                        <Bullets items={[
                            "human resource management;",
                            "employee onboarding and documentation;",
                            "attendance and leave management;",
                            "payroll and employee records;",
                            "site and workforce management;",
                            "quality inspections and reporting;",
                            "helpdesk and internal communication.",
                        ]} />
                        <p>
                            These Terms of Use apply to everyone the Company authorises to use the platform: employees,
                            field staff, candidates and authorised client contacts. By signing in or using a link the
                            Company has sent you, you agree to them.
                        </p>
                    </Section>

                    <Section id="access">
                        <p>Access is restricted to people the Company has authorised, and each user can use only the features and information their role allows.</p>
                        <Bullets items={[
                            "Employees use their own account only. Never share your login or use someone else's.",
                            "Candidates may use a joining link only to submit their own information.",
                            "Clients may view only the inspection reports shared with them.",
                            "Don't access information outside your responsibilities, even if the platform lets you open it. Report it to HR instead.",
                        ]} />
                    </Section>

                    <Section id="security-account">
                        <p>You sign in with your registered mobile number or employee code, using a one-time password (OTP), your MPIN or a password.</p>
                        <Bullets items={[
                            <><b>Keep your OTP, MPIN and password confidential.</b> The Company will never ask you for them.</>,
                            "After 5 wrong passwords or MPINs, your account is locked for 15 minutes.",
                            "An OTP stops working after 3 wrong attempts. Request a new one.",
                            "Administrators may reset, suspend or switch off an account when necessary.",
                            "Report a lost phone, a suspected misuse of your account or a leaked password to HR or the system administrator straight away.",
                            "Sign out after using a shared or public device.",
                        ]} />
                    </Section>

                    <Section id="use">
                        <Sub title="You agree to:">
                            <Bullets items={[
                                "use the platform only for authorised Company work;",
                                "access only the information your responsibilities require;",
                                "enter accurate and truthful information;",
                                "report incorrect records and suspected security incidents;",
                                "protect confidential Company and employee information;",
                                "follow the Company's policies and security instructions.",
                            ]} />
                        </Sub>
                        <Sub title="You must not:">
                            <Bullets items={[
                                "use another person's account;",
                                "copy, download, photograph, forward or disclose personal information, including exported files, without authorisation;",
                                "try to get round access controls;",
                                "change, damage or interfere with the platform;",
                                "upload unlawful, malicious or unauthorised content;",
                                "use the platform for personal or unauthorised commercial purposes.",
                            ]} />
                        </Sub>
                        <p>Breaking these terms may lead to your access being restricted, an investigation, or disciplinary action under the Company&apos;s policies and the law.</p>
                    </Section>

                    <Section id="suspension">
                        <p>The Company may suspend, restrict or switch off an account when:</p>
                        <Bullets items={[
                            "employment or engagement ends;",
                            "unauthorised access is suspected;",
                            "there is a security incident;",
                            "Company policies are breached;",
                            "administrative or operational needs require it.",
                        ]} />
                        <p>When an employee leaves, their login is switched off as part of the exit. Switching off access does not delete the person&apos;s records; they are kept as described in section 12.</p>
                    </Section>

                    {/* ───────────── PART B ───────────── */}
                    <PartHeading letter="B" title="Privacy Notice" />

                    <Section id="purpose">
                        <p>This notice explains how {org} collects, uses, stores, shares and protects personal data through {COMPANY.name}. It applies to employees, field staff and site personnel, job candidates and new joiners, and client contacts who open shared inspection reports.</p>
                        <p>The Company processes personal data in line with applicable Indian law, including the Digital Personal Data Protection Act, 2023 and the rules under it as their provisions come into force, and the Information Technology Act, 2000.</p>
                    </Section>

                    <Section id="data">
                        <p>Depending on your relationship with the Company and the features you use, the platform processes:</p>
                        <Sub title="7.1 Identity and contact">
                            <Bullets items={["full name and name as per Aadhaar;", "date of birth, gender and marital status;", "mobile number and email address;", "present and permanent address;", "photograph;", "emergency contacts and father's name."]} />
                        </Sub>
                        <Sub title="7.2 Employment">
                            <Bullets items={["employee code, designation and department;", "joining, leaving and contract dates;", "site postings and work location;", "attendance, working hours, overtime and leave;", "performance and training records;", "employment status and exit details."]} />
                        </Sub>
                        <Sub title="7.3 Payroll and financial">
                            <Bullets items={["salary structure, payroll records and payslips;", "bank name, branch, IFSC and account number;", "statutory deductions;", "advances and expense claims;", "full and final settlement."]} />
                        </Sub>
                        <Sub title="7.4 Government and statutory">
                            <Bullets items={["PAN and Aadhaar number;", "UAN and PF number;", "ESIC number;", "labour card and other labour-law registration details."]} />
                        </Sub>
                        <Sub title="7.5 Documents you or HR upload">
                            <Bullets items={["identity and address proofs;", "educational certificates;", "joining documents, appointment and offer letters, and other HR letters;", "declarations and other documents needed for HR or statutory purposes."]} />
                        </Sub>
                        <Sub title="7.6 Operational and inspection">
                            <Bullets items={["attendance punches and site check-ins, with location (see section 9);", "inspection reports and photographs;", "helpdesk tickets;", "other work records."]} />
                        </Sub>
                        <Sub title="7.7 Technical">
                            <Bullets items={["sign-in times and sign-in method;", "IP address and device or browser details for sign-ins, policy sign-offs and recorded actions;", "the audit log of important actions (see section 11)."]} />
                        </Sub>
                        <Sub title="7.8 Policy acknowledgements">
                            <Bullets items={["whether and when you read and accepted a policy;", "the name you typed or the signature you drew;", "the IP address and device used."]} />
                        </Sub>
                        <Sub title="7.9 Optional details">
                            <p>Religion, caste and blood group are <b>optional</b>. You may leave them blank, and leaving them blank does not affect your employment or pay. Blood group helps in a medical emergency at site.</p>
                        </Sub>
                        <p>We collect only what is reasonably needed for the purposes in section 8 or required by law.</p>
                    </Section>

                    <Section id="why">
                        <ol className="list-decimal pl-5 space-y-1.5">
                            <li>Recruitment, onboarding and employment administration.</li>
                            <li>Keeping employee and workforce records.</li>
                            <li>Attendance, leave and site management.</li>
                            <li>Salary processing and payments to employees.</li>
                            <li>Statutory compliance, including PF, ESIC, professional tax, labour welfare fund, income tax and labour-law registers.</li>
                            <li>Communicating with employees, including in emergencies.</li>
                            <li>Quality inspections and operational reporting.</li>
                            <li>Sharing relevant inspection reports with authorised clients.</li>
                            <li>Platform security, sign-in and access management.</li>
                            <li>Investigating suspected misuse and keeping audit records.</li>
                            <li>Resolving requests, complaints and helpdesk tickets.</li>
                        </ol>
                        <p>
                            Most of this processing is needed for your employment and for the Company&apos;s legal
                            obligations, and is carried out on those grounds rather than on consent. Where the Company
                            relies on consent, for example for optional details, it asks for it clearly and you may
                            withdraw it. We do not sell personal data or use it for advertising.
                        </p>
                    </Section>

                    <Section id="location">
                        <Sub title="Location is recorded only when you:">
                            <Bullets items={["punch in or out for attendance;", "check in at a site;", "open an inspection form."]} />
                        </Sub>
                        <p>It is read once at that moment. <b>The platform does not track your location in the background or between these actions.</b></p>
                        <Sub title="The camera is used for:">
                            <Bullets items={["inspection photographs;", "profile photographs;", "photographing documents you upload."]} />
                        </Sub>
                        <p>
                            Your phone or browser asks your permission before the platform can use location or the
                            camera. If you refuse location, attendance and inspections are still recorded, without a
                            location. If you can&apos;t use the camera, ask HR how to submit a photo or document another way.
                        </p>
                    </Section>

                    <Section id="sharing">
                        <Sub title="10.1 Inside the Company">
                            <p>HR, payroll, management, site administrators and other authorised staff see information according to their role. Salary, Aadhaar, PAN, UAN and bank details are shown only to roles that need them and are hidden from other users. You can see your own record in My Profile.</p>
                        </Sub>
                        <Sub title="10.2 Service providers">
                            <p>The Company uses providers to run the platform:</p>
                            <Bullets items={["Supabase: database and file storage;", "Vercel: application hosting;", "an SMS provider: sign-in codes;", "email and WhatsApp providers, when these are switched on."]} />
                            <p>They process data only to provide their service to the Company, under contracts covering confidentiality and security.</p>
                        </Sub>
                        <Sub title="10.3 Government and regulators">
                            <p>Information is disclosed to government or regulatory authorities where the law requires it, for example EPFO, ESIC and tax filings.</p>
                        </Sub>
                        <Sub title="10.4 Clients">
                            <p>Authorised clients see the inspection reports shared with them. They do not get access to employee HR, payroll, bank or other confidential employment records.</p>
                        </Sub>
                    </Section>

                    <Section id="storage">
                        <Sub title="Where data is stored">
                            <Bullets items={[
                                "Database and uploaded files: Supabase, Tokyo, Japan.",
                                "Application: Vercel, Tokyo, Japan.",
                            ]} />
                            <p>This means personal data is stored outside India. The Company does this in line with Indian law on transferring personal data abroad, and will move it if the law requires.</p>
                        </Sub>
                        <Sub title="How it is protected">
                            <Bullets items={[
                                "All connections are encrypted (HTTPS/TLS).",
                                "Access is controlled by role, and sensitive fields are hidden from roles that don't need them.",
                                "Sign-in is protected by OTP, MPIN or password, with automatic lockout after repeated wrong attempts.",
                                "An audit log records sign-ins, refused access, changes to users and roles, site postings and exports containing sensitive data. Entries cannot be edited or deleted.",
                            ]} />
                            <p>No system can guarantee complete security. If a personal data breach occurs, the Company will act on it and inform the people affected and the authorities as the law requires.</p>
                        </Sub>
                    </Section>

                    <Section id="retention">
                        <p>Personal data is kept only as long as needed for the purposes in section 8, or as long as the law requires, whichever is longer. Then it is securely deleted or anonymised, unless it is needed for an ongoing claim or investigation.</p>
                        <div className="overflow-x-auto rounded-[12px] border border-slate-200">
                            <table className="w-full text-[13.5px]">
                                <thead className="bg-[#f4f6fb] text-left text-slate-600">
                                    <tr><th className="px-4 py-2.5 font-semibold">Record</th><th className="px-4 py-2.5 font-semibold">Kept for</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {[
                                        ["Employee HR records", "During employment, then as long as labour and employment law requires"],
                                        ["Payroll and salary records", "As long as wage, labour and income-tax law requires"],
                                        ["PF and ESIC records", "As long as the EPF and ESI laws require"],
                                        ["KYC and identity documents", "During employment, then only as long as needed for statutory records and claims"],
                                        ["Attendance and leave records", "As long as wage and labour law requires"],
                                        ["Inspection reports and photographs", "As long as the client contract and quality records require"],
                                        ["Candidates who did not join", "Only as long as needed for the recruitment, then deleted"],
                                        ["Audit and security logs", "As long as needed for security and investigations, and as the law requires"],
                                        ["Reports shared with clients", "As agreed with the client"],
                                    ].map(([r, k]) => (
                                        <tr key={r}><td className="px-4 py-2.5 font-medium text-slate-800 align-top">{r}</td><td className="px-4 py-2.5 text-slate-600">{k}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    <Section id="rights">
                        <p>Subject to the law, you may:</p>
                        <Bullets items={[
                            "ask what personal data the Company processes about you (much of it is in My Profile);",
                            "ask for inaccurate or incomplete data to be corrected, completed or updated;",
                            "ask for data to be erased where the law allows;",
                            "withdraw consent where processing is based on consent;",
                            "nominate someone to exercise your rights if you die or are unable to;",
                            "raise a grievance about how your data is handled.",
                        ]} />
                        <p>The Company may keep information where the law requires it or another lawful ground applies. If your grievance isn&apos;t resolved, you may approach the Data Protection Board of India under the applicable procedure.</p>
                    </Section>

                    <Section id="changes">
                        <p>The Company may update this notice when the law, the platform&apos;s features, our data processing or our service providers change. The current version and its effective date are always shown at the top of this page. Important changes will be announced in the platform, and you may be asked to read and accept them.</p>
                    </Section>

                    <Section id="contact">
                        <p>For privacy questions, correction requests or grievances, contact:</p>
                        <div className="rounded-[12px] border border-slate-200 bg-[#f8fafc] px-4 py-3 text-[14px] space-y-1">
                            <p><b>{org}</b></p>
                            {g.name
                                ? <p>Grievance Officer: {g.name}{g.designation ? `, ${g.designation}` : ""}</p>
                                : <p>Grievance Officer: the Human Resources Department</p>}
                            {g.email && <p>Email: <a href={`mailto:${g.email}`} className="text-[#1f4fd8] hover:underline">{g.email}</a></p>}
                            {g.phone && <p>Phone: {g.phone}</p>}
                            {g.address && <p>Registered office: {g.address}</p>}
                            <p className="text-slate-600">You can also raise a ticket in the platform&apos;s <b>Helpdesk</b>.</p>
                        </div>
                        <p>For sign-in, account access or technical problems, contact your HR department or system administrator.</p>
                    </Section>
                </article>

                <p className="mt-6 text-center text-[12.5px] text-slate-500">
                    © {org.replace(/\.$/, "")}. All rights reserved. · {COMPANY.name} · Version {VERSION}, effective {EFFECTIVE} · <Link href="/" className="text-[#1f4fd8] hover:underline">Back to the app</Link>
                </p>
            </main>
        </div>
    )
}
