# Growus Wage Sheet — Column-by-Column Rule Book

> Verified against VARROC PUNE wage sheet (MAR CAL) — all 11 employees ✓  
> Compliance Types: **OR** = Full compliance (PF + ESIC apply) | **CALL** = Contract / No PF / No ESIC

> **Configurable since Aug 2026:** every rate, ceiling and slab below is the
> **default**. Admins can change them from **Payroll → Calculation Settings**
> (stored in AppSetting `payrollRules`; engine: `lib/payroll-rules.ts` +
> `lib/payroll-calc.ts`). This document describes the defaults.

---

## 🟦 EARNINGS (Manual — Stored in Salary Structure)

| Column | Rule | CALL | Notes |
|--------|------|------|-------|
| **BASIC** | Manually entered per employee in salary setup | Same value (no exclusions) | Foundation for all other calculations |
| **DA** (Dearness Allowance) | Manually entered per employee | **₹0** | — |
| **HRA** (House Rent Allowance) | **Manually entered — NO auto-calculation** | **₹0** | Previously was (Basic+DA)×5% — now fully manual |
| **Washing Allowance** | Manually entered per employee | **₹0** | Excluded from ESIC base |
| **Conveyance** | Manually entered per employee | **₹0** | Excluded from ESIC base |
| **LWW** (Leave With Wages) | Manually entered per employee | **₹0** | — |
| **Bonus** | **Manually entered — NO auto-calculation** | **₹0** | Per Payment of Bonus Act. Previously was (Basic+DA)×8.33% — now fully manual. **Included** in ESIC base |
| **Other Allowance** | Manually entered per employee | **₹0** | — |

---

## 🟨 ATTENDANCE / VARIABLES (Entered in Process Payroll)

| Column | Rule | Notes |
|--------|------|-------|
| **Month Days** | Calendar days in the payroll month (e.g. 31 for March) | Used as denominator for proration |
| **Worked Days** | Actual days employee worked that month | Drives all proration; entered manually per employee per run |
| **OT Days** | Number of overtime days | 1 OT Day = 4 extra hours |
| **Canteen Days** | Days employee used canteen facility | Used for canteen deduction |
| **Penalty** | Any manual penalty amount (₹) | Deducted from net |
| **Advance** | Salary advance already given (₹) | Deducted from net |
| **Other Deductions** | Any other manual deduction (₹) | Deducted from net |
| **Production Incentive** | Incentive / bonus for production targets (₹) | Added to earned gross |
| **LWF** (Labour Welfare Fund) | Fixed statutory amount | Maharashtra: ₹6/month (employee), ₹12/month (employer) |

---

## 🟩 CALCULATED EARNINGS (Auto — from formula)

| Column | Formula | Notes |
|--------|---------|-------|
| **Prorated Basic** | `ROUND(Basic × WorkedDays / MonthDays)` | Multiply first, then divide — Excel-exact |
| **Prorated DA** | `ROUND(DA × WorkedDays / MonthDays)` | Same proration rule |
| **Prorated HRA** | `ROUND(HRA × WorkedDays / MonthDays)` | Uses stored HRA — no auto-calc |
| **Prorated Washing** | `ROUND(Washing × WorkedDays / MonthDays)` | — |
| **Prorated Conveyance** | `ROUND(Conveyance × WorkedDays / MonthDays)` | — |
| **Prorated LWW** | `ROUND(LWW × WorkedDays / MonthDays)` | — |
| **Prorated Bonus** | `ROUND(Bonus × WorkedDays / MonthDays)` | Uses stored Bonus — no auto-calc |
| **Prorated Other** | `ROUND(OtherAllowance × WorkedDays / MonthDays)` | — |
| **OT Pay** | `ROUND(OT_Rate_Per_Hour × 4 × OT_Days)` | 1 OT Day = 4 hrs; e.g. ₹170/hr × 4 = ₹680/day |
| **Earned Gross** | Sum of all prorated components + OT Pay + Production Incentive | Base for all deduction calculations |

---

## 🔴 EMPLOYEE DEDUCTIONS (Auto — deducted from salary)

| Column | Formula | Eligibility | CALL |
|--------|---------|-------------|------|
| **PF Employee** | `ROUND(min(Basic + DA, ₹15,000) × 12%)` — **no proration** by default (full PF regardless of worked days; proration below 26 days is an optional setting) | OR compliance only | **₹0** |
| **ESIC Employee** | `CEIL(ESIC_Wages × 0.75%)` | Structure Gross ≤ ₹21,000 (₹25,000 for Handicap) | **₹0** |
| **PT** (Professional Tax) | Maharashtra slab on Earned Gross (see PT slab below). Female employees exempt up to ₹25,000 | All employees (system default charges CALL too — configurable) | default charged |
| **LWF Employee** | Maharashtra: **₹6/month** | All employees | varies |
| **Canteen** | `Canteen_Days × Canteen_Rate_Per_Day` | All employees | same |
| **Penalty** | As entered | — | — |
| **Advance** | As entered | — | — |
| **Other Deductions** | As entered | — | — |

### PT (Professional Tax) Slab — Maharashtra

| Earned Gross | PT Amount |
|-------------|-----------|
| Female, ≤ ₹25,000 **excluding OT** | **₹0** (Maharashtra exemption) |
| ≤ ₹7,500 | **₹0** |
| ₹7,501 – ₹10,000 | **₹175** |
| > ₹10,000 (standard month) | **₹200** |
| > ₹10,000 (February only) | **₹300** ← annual ₹100 adjustment |

> Slabs, the February amount and the female-exemption limit are editable in Payroll → Calculation Settings.
>
> **The female limit is measured on earned gross MINUS overtime**, while the
> slab itself still uses the full earned gross. A woman whose salary sits under
> the limit keeps the exemption in the months she works overtime — otherwise OT
> alone could push her over ₹25,000 and her PT would flip between ₹0 and ₹200
> month to month.

### ESIC Wage Base
```
ESIC Wages = Earned Gross − Washing (prorated) − Conveyance (prorated)
```
> OT Pay and Bonus ARE included. Only Washing and Conveyance are excluded.
> Each exclusion is a toggle in Payroll → Calculation Settings.

---

## 🟥 EMPLOYER CONTRIBUTIONS (Auto — cost to company, NOT deducted from employee)

| Column | Formula | Eligibility | CALL |
|--------|---------|-------------|------|
| **PF Employer** | `pfBase = min(Basic + DA, ₹15,000)`; EPS 8.33% + EPF 3.67% + EDLI 0.50% + Admin 0.50% on pfBase (≈ 13%, each part rounded) | OR compliance only | **₹0** |
| **ESIC Employer** | `CEIL(ESIC_Wages × 3.25%)` | Structure Gross ≤ ₹21,000 | **₹0** |

> PF Employer is **not** a flat ₹1,950: when Basic + DA is below the ₹15,000 ceiling, each of the four parts is computed on the actual Basic + DA.

---

## 🟪 SUMMARY COLUMNS (Auto-calculated)

| Column | Formula |
|--------|---------|
| **Net Salary** | `Earned Gross − Total Deductions` |
| **Total Deductions** | `PF_Emp + ESIC_Emp + PT + LWF + Canteen + Penalty + Advance + Other_Ded` |
| **CTC (Monthly)** | `Structure Gross (Full Month) + PF_Employer + ESIC_Employer` |
| **CTC (Annual)** | `CTC_Monthly × 12` |

---

## 📊 Structure Gross vs Earned Gross

| Term | Meaning | Used For |
|------|---------|---------|
| **Structure Gross** (Full Month) | Sum of all salary components at 100% (Basic+DA+HRA+Washing+Conv+LWW+Bonus+Other) | ESIC eligibility check, CTC calculation |
| **Earned Gross** | Prorated Structure Gross + OT Pay + Production Incentive | Actual payment, deduction calculations, PT slab |

---

## 📋 Excel Import Column Reference

### Salary Structure Template (salary_structure_master.xlsx)
| Excel Column | Field | Type | Notes |
|-------------|-------|------|-------|
| EMP Code | employeeId | Text | Must match system exactly |
| Employee Name | — | Text | Reference only, not imported |
| Designation | — | Text | Reference only, not imported |
| Site | — | Text | Reference only, not imported |
| Basic | basic | Number | Manual entry required |
| DA | da | Number | Manual entry required |
| **HRA** | **hra** | **Number** | **Manual entry — no auto-calc** |
| Washing | washing | Number | Manual entry required |
| Conveyance | conveyance | Number | Manual entry required |
| Leave With Wages | leaveWithWages | Number | Manual entry required |
| Other Allowance | otherAllowance | Number | Manual entry required |
| **Bonus** | **bonus** | **Number** | **Manual entry — no auto-calc** |
| OT Rate Per Hour | otRatePerHour | Number | Default: 170 |
| Canteen Rate Per Day | canteenRatePerDay | Number | Default: 55 |
| Compliance Type | complianceType | OR / CALL | Default: OR |

### Payroll Process Template (Growus_Payroll_MONTH_YEAR.xlsx)
| Excel Column | Field | Type | Notes |
|-------------|-------|------|-------|
| Employee ID | employeeId | Text | Must match system |
| Name | — | Text | Reference only |
| Month Days | monthDays | Number | Calendar days in month |
| Worked Days | workedDays | Number | Actual days worked |
| OT Days | otDays | Number | 1 OT Day = 4 hrs |
| Canteen Days | canteenDays | Number | Days canteen used |
| Penalty | penalty | Number | Default: 0 |
| Advance | advance | Number | Default: 0 |
| Other Deductions | otherDeductions | Number | Default: 0 |
| Production Incentive | productionIncentive | Number | Default: 0 |
| LWF | lwf | Number | Maharashtra: 6 |

---

## ⚙️ Compliance Type Summary

| | **OR** (Full Compliance) | **CALL** (Contract) |
|--|--------------------------|---------------------|
| PF Employee | ✅ Yes | ❌ No |
| PF Employer | ✅ Yes (₹1,950) | ❌ No |
| ESIC Employee | ✅ If gross ≤ ₹21k | ❌ No |
| ESIC Employer | ✅ If gross ≤ ₹21k | ❌ No |
| HRA | ✅ From salary structure | ❌ Always ₹0 |
| Bonus | ✅ From salary structure | ❌ Always ₹0 |
| DA, Washing, etc. | ✅ From salary structure | ❌ Always ₹0 |
| PT | ✅ Yes | ❌ No |

---

*Last updated: August 2026 | Verified against VARROC PUNE MAR CAL wage sheet | Rates configurable via Payroll → Calculation Settings*
