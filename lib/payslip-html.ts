// The official salary slip (Growus letterhead, earnings/deductions table, amount
// in words) — one layout for HR's Payroll → Salary slips and the employee's own
// My Profile → Payslips, so both see exactly the same document.

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"]

/** What one slip needs: a payroll row plus the employee's master details. */
export type SlipRecord = {
    month: number; year: number
    basicSalary: number; da: number; hra: number; washing: number; conveyance: number
    lwwEarned: number; bonus: number; overtimePay: number; grossSalary: number
    allowances?: number | null; productionIncentive?: number | null; tds?: number | null
    pfEmployee: number; esiEmployee: number; pt: number; lwf: number
    canteen: number; advance: number; otherDeductions: number
    totalDeductions: number; netSalary: number
    arrears?: number | null; reimbursement?: number | null
    workingDays: number | null; presentDays: number | null; overtimeHrs?: number | null
    /** Site the month was paid at; falls back to the current posting. */
    siteName?: string | null
    employee: {
        employeeId: string; firstName: string; lastName: string; designation: string | null
        uan?: string | null; pfNumber?: string | null; esiNumber?: string | null
        dateOfBirth?: string | Date | null; dateOfJoining?: string | Date | null
        deployments?: { site: { name: string } }[]
    }
}

export function numToWords(n: number): string {
    if (n===0) return "Zero Only"
    const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"]
    const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]
    const toW = (num: number): string => {
        if (num===0) return ""
        if (num<20) return ones[num]+" "
        if (num<100) return tens[Math.floor(num/10)]+(num%10?" "+ones[num%10]:" ")+" "
        if (num<1000) return ones[Math.floor(num/100)]+" Hundred "+toW(num%100)
        if (num<100000) return toW(Math.floor(num/1000))+"Thousand "+toW(num%1000)
        if (num<10000000) return toW(Math.floor(num/100000))+"Lakh "+toW(num%100000)
        return toW(Math.floor(num/10000000))+"Crore "+toW(num%10000000)
    }
    return "Rupees "+toW(n).trim().replace(/\s+/g," ")+" Only"
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))

export function buildSlipHTML(p: SlipRecord): string {
    const site = p.siteName ?? p.employee.deployments?.[0]?.site?.name ?? ""
    const wDays = p.workingDays ?? 26
    const pDays = p.presentDays ?? wDays
    // Full-month rate of a component, from what was earned for the days paid.
    const rate = (amt: number) => (pDays > 0 ? Math.round(amt * wDays / pDays) : amt)
    const r = (n: number) => Math.round(n).toLocaleString("en-IN")
    // Employee master dates arrive as ISO strings; a missing or unparseable one prints blank.
    const dt = (v: string | Date | null | undefined) => { const t = v ? new Date(v) : null; return t && !isNaN(t.getTime()) ? t.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" }

    // Basic always shows; every other line only when it has an amount, so the
    // slip lists what was actually paid and deducted instead of rows of zeros.
    const earnings = [
        { label: "Basic", rate: rate(p.basicSalary), amt: p.basicSalary, keep: true },
        { label: "DA", rate: rate(p.da), amt: p.da },
        { label: "HRA", rate: rate(p.hra), amt: p.hra },
        { label: "Conveyance allowance", rate: rate(p.conveyance), amt: p.conveyance },
        { label: "Other allowance", rate: rate(p.allowances || 0), amt: p.allowances || 0 },
        { label: "Washing allowance", rate: rate(p.washing), amt: p.washing },
        { label: "Leave with wages", rate: rate(p.lwwEarned), amt: p.lwwEarned },
        { label: "Bonus", rate: rate(p.bonus), amt: p.bonus },
        { label: "Overtime (O.T.)", rate: 0, amt: p.overtimePay },
        { label: "Performance allowance", rate: 0, amt: p.productionIncentive || 0 },
    ].filter(e => e.keep || Math.round(e.amt) !== 0)
    const deductions = [
        { label: "Provident Fund (PF)", amt: p.pfEmployee },
        { label: "ESI", amt: p.esiEmployee },
        { label: "Professional Tax", amt: p.pt },
        { label: "TDS", amt: p.tds || 0 },
        { label: "Labour Welfare Fund", amt: p.lwf },
        { label: "Canteen", amt: p.canteen },
        { label: "Salary advance", amt: p.advance },
        { label: "Other deduction", amt: p.otherDeductions },
    ].filter(d => Math.round(d.amt) !== 0)
    const grossRate = earnings.reduce((s, e) => s + e.rate, 0)
    const extras = [
        ...(p.arrears ? [{ label: "Arrears — earlier months", amt: p.arrears }] : []),
        ...(p.reimbursement ? [{ label: "Expense reimbursement", amt: p.reimbursement }] : []),
    ]
    const lop = Math.max(0, wDays - pDays)

    const info: [string, string][] = [
        ["Employee name", `${p.employee.firstName} ${p.employee.lastName}`],
        ["Employee code", p.employee.employeeId],
        ["Designation", p.employee.designation || "—"],
        ["Site", site || "—"],
        ["Date of joining", dt(p.employee.dateOfJoining)],
        ["Date of birth", dt(p.employee.dateOfBirth)],
        ["UAN", p.employee.uan || "—"],
        ["PF no.", p.employee.pfNumber || "—"],
        ["ESIC no.", p.employee.esiNumber || "—"],
        ["Location", "Pune"],
    ]

    return `<div class="slip">
  <header class="head">
    <img class="logo" src="/logo.png" alt=""/>
    <div class="co">
      <div class="co-name">GROWUS AUTO INDIA PRIVATE LIMITED</div>
      <div class="co-addr">431, Br2, B Wing, 4th Floor, Jai Ganesh Vision, near Akurdi Chowk, Akurdi, Pune, Maharashtra 411035.</div>
    </div>
    <div class="tag"><div class="tag-k">PAYSLIP</div><div class="tag-v">${MONTHS_LONG[p.month - 1]} ${p.year}</div></div>
  </header>

  <section class="info">
    ${info.map(([k, v]) => `<div class="cell"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join("")}
  </section>

  <section class="att">
    <div><span class="k">Working days</span><span class="v">${wDays}</span></div>
    <div><span class="k">Days paid</span><span class="v">${pDays}</span></div>
    <div><span class="k">Loss of pay days</span><span class="v">${lop}</span></div>
    <div><span class="k">OT hours</span><span class="v">${p.overtimeHrs ?? 0}</span></div>
  </section>

  <section class="cols">
    <table class="tbl earn">
      <thead><tr><th>Earnings</th><th class="n">Full rate</th><th class="n">Amount (₹)</th></tr></thead>
      <tbody>${earnings.map(e => `<tr><td>${e.label}</td><td class="n mute">${e.rate > 0 ? r(e.rate) : ""}</td><td class="n">${r(e.amt)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Gross earnings</td><td class="n mute">${r(grossRate)}</td><td class="n">${r(p.grossSalary)}</td></tr></tfoot>
    </table>
    <table class="tbl ded">
      <thead><tr><th>Deductions</th><th class="n">Amount (₹)</th></tr></thead>
      <tbody>${deductions.length ? deductions.map(d => `<tr><td>${d.label}</td><td class="n">${r(d.amt)}</td></tr>`).join("") : `<tr><td class="mute">No deductions</td><td></td></tr>`}</tbody>
      <tfoot><tr><td>Total deductions</td><td class="n">${r(p.totalDeductions)}</td></tr></tfoot>
    </table>
  </section>

  ${extras.length ? `<section class="extras">${extras.map(x => `<div><span>${x.label}</span><b>${x.amt < 0 ? "−" : "+"} ₹${r(Math.abs(x.amt))}</b></div>`).join("")}</section>` : ""}

  <section class="sum">
    <div><span class="k">Gross earnings</span><span class="v">₹${r(p.grossSalary)}</span></div>
    <div class="op">−</div>
    <div><span class="k">Total deductions</span><span class="v">₹${r(p.totalDeductions)}</span></div>
    ${extras.length ? `<div class="op">+</div><div><span class="k">Other credits</span><span class="v">₹${r(extras.reduce((s, x) => s + x.amt, 0))}</span></div>` : ""}
    <div class="op">=</div>
    <div class="net"><span class="k">Net pay</span><span class="v">₹${r(p.netSalary)}</span></div>
  </section>
  <div class="words">Net pay in words: <b>${numToWords(Math.round(p.netSalary))}</b></div>

  <footer class="foot">This is a computer-generated payslip and does not need a signature. · Place: Pune</footer>
</div>`
}

// `autoPrint` off builds the same document for on-screen preview: the
// script at the end is what makes a printed copy open the dialog by itself.
export function slipPageHTML(recs: SlipRecord[], autoPrint = true): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Salary Slips</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#1f2433;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slip{width:740px;margin:18px auto;padding:22px 24px 18px;border:1px solid #dfe3ef;border-radius:10px;page-break-after:always}
.slip:last-child{page-break-after:avoid}
.head{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:2px solid #3d6ff5}
.logo{height:48px;width:auto}
.co{flex:1}.co-name{font-size:16px;font-weight:800;letter-spacing:.3px;color:#14182b}
.co-addr{font-size:10px;color:#555c72;margin-top:3px;line-height:1.4}
.tag{text-align:right;background:#eaf0ff;border-radius:8px;padding:7px 12px}
.tag-k{font-size:9.5px;font-weight:700;letter-spacing:1.5px;color:#2f5be0}.tag-v{font-size:14px;font-weight:800;color:#14182b;margin-top:1px}
.info{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:14px;border:1px solid #e6e9f2;border-radius:8px;overflow:hidden}
.info .cell{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid #eef0f6}
.info .cell:nth-child(odd){border-right:1px solid #eef0f6}
.info .cell:nth-last-child(-n+2){border-bottom:none}
.k{color:#7a8299;font-size:10.5px}.v{font-weight:700;color:#14182b;text-align:right}
.att{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.att div{background:#f6f7fc;border-radius:8px;padding:7px 10px;display:flex;flex-direction:column;gap:2px}
.att .v{text-align:left;font-size:14px}
.cols{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin-top:14px;align-items:start}
.tbl{width:100%;border-collapse:collapse;border:1px solid #e6e9f2;border-radius:8px;overflow:hidden}
.tbl th{font-size:10px;letter-spacing:.6px;text-transform:uppercase;text-align:left;padding:7px 10px;color:#fff}
.earn th{background:#3d6ff5}.ded th{background:#e5566b}
.tbl td{padding:5.5px 10px;border-top:1px solid #eef0f6}
.tbl tbody tr:nth-child(even) td{background:#fafbfe}
.tbl tfoot td{font-weight:800;border-top:1.5px solid #c9cfdf;background:#f3f5fb}
.n{text-align:right;white-space:nowrap}.mute{color:#98a1b5}
.extras{margin-top:10px;border:1px dashed #c9cfdf;border-radius:8px;padding:6px 10px}
.extras div{display:flex;justify-content:space-between;padding:2px 0}
.sum{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;background:#f6f7fc;border-radius:10px}
.sum>div:not(.op){flex:1;display:flex;flex-direction:column;gap:2px}
.sum .v{text-align:left;font-size:14px}
.sum .op{color:#98a1b5;font-size:16px;font-weight:700}
.sum .net{background:#15803d;color:#fff;border-radius:8px;padding:7px 12px}
.sum .net .k{color:#dcfce7}.sum .net .v{color:#fff;font-size:17px}
.words{margin-top:8px;font-size:11px;color:#555c72}.words b{color:#14182b}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid #eef0f6;text-align:center;font-size:9.5px;color:#98a1b5}
@media print{body{margin:0}.slip{width:100%;margin:0;border:none;border-radius:0;padding:0 4px 16px}@page{margin:10mm;size:A4}}
</style></head><body>
${recs.map(p => buildSlipHTML(p)).join("")}
${autoPrint ? "<script>window.onload=()=>window.print()</script>" : ""}</body></html>`
}
