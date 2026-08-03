# Growus CIMS — Work Summary, 1 August 2026

110 files updated across five releases. Everything below has been applied and
the application builds and type-checks cleanly.

---

## 1. Things that were broken and are now working

**The Attendance module was non-functional.**
The employee list it depends on was always coming back empty, so the daily view
showed "No employees found", the monthly summary was blank, and the employee
dropdown in Mark Attendance had nothing in it — even when attendance records
existed. Bulk Mark was operating on zero employees. The same underlying fault
affected the employee dropdowns in Leaves, Training, Helpdesk, Sites and Payroll
Setup. All are now populated correctly.

**Employee lists were silently capped at 50.**
Several screens asked for up to 500 employees but the server only ever returned
50, with no indication that the rest had been dropped.

**Reports and the global search could blank the screen.**
When either received an error from the server it tried to display the error as
if it were data, which crashed the page. Because the search bar sits in the top
navigation, that crash took down whichever page you were on.

**The Approvals screen showed no site name.**
Managers were approving inspections without seeing which client site the work
belonged to, and searching the approval queue by site name never matched
anything.

**"Approve All" on Expenses did nothing.**
It reported "40 expenses approved" while approving none. Individual approvals
were unaffected.

**A completed exit did not actually offboard anyone.**
Working through the whole exit process and marking it complete only updated the
exit record. The employee stayed Active, kept their site deployment, kept
counting in headcount and payroll, and could still log in. Offboarding had to be
repeated by hand on the employee screen. It now happens automatically on
completion.

**Resigned employees kept their login.**
Only "Terminated" and "Inactive" revoked access; "Resigned" did not.

**Approving a leave marked the employee On Leave permanently.**
The status was applied immediately regardless of the leave's start date, and
nothing ever set it back when the leave ended. Employee status is now derived
from the leave dates, with a nightly job moving people in and out correctly.

**Converting a candidate twice created a duplicate employee.**
Moving an already-converted candidate through the "Joined" stage again created a
second, incomplete employee record and detached the properly onboarded one.

**In Training, learners could not record progress.**
"Mark Done" was blocked by a permission no learner holds, and failed without any
message, so progress bars stayed at zero for everyone.

---

## 2. Data quality

Identity and bank details were being accepted with almost no checking. The
server performed no format validation at all on the employee, candidate
conversion, onboarding and profile screens, so whatever was typed was stored.

Now validated consistently, on both the screen and the server:

| Field | What is now checked |
|---|---|
| Aadhaar | Full UIDAI checksum, not just a 12-digit count. Invented numbers like 123456789012 are rejected. |
| PAN | Correct structure and a valid holder-type character |
| IFSC | Correct bank and branch code structure |
| Bank account | Plausible length, no all-zero values |
| Mobile | 10 digits, valid Indian prefix, placeholder numbers rejected |
| UAN / ESIC / PF | Correct lengths |
| PIN code, Email, Date of birth | Format and plausibility |

Blank values remain acceptable everywhere — no field that was optional has been
made mandatory.

**Four forms were accepting invalid data outright.** The public Join form ran its
check against a section that has no rules, so it always passed. Self-onboarding,
the external KYC form and the employee profile page had no checking at all.

**Excel import had no validation.** A spreadsheet could load hundreds of employees
with unusable Aadhaar, PAN or IFSC values in one action. Rows now fail
individually with a reason.

**Duplicate detection had a gap.** It normalised the value being typed but not the
value already stored, so a record held as "1234 5678 9012" would not be matched
by someone entering "123456789012".

---

## 3. Confidentiality

Several screens returned information to people who should not have had it. Each
was verified in the code before being changed.

- **Employee KYC documents** (Aadhaar, PAN, bank proof) could be opened, marked
  verified, or deleted by any signed-in employee, for any colleague.
- **HR letters** — including termination and salary letters — could be opened by
  any signed-in user, and anyone could mark someone else's letter as
  acknowledged.
- **Salary structures, payslip payments and bank account numbers** were readable
  without any payroll permission.
- **Performance reviews** could be edited by the employee being reviewed: their
  own rating, ranking and increment percentage, with the HR approver's name
  taken from the request rather than the signed-in user.
- **Expense records** — any employee's full year of claims, including amounts and
  receipts, could be retrieved.
- **Helpdesk internal notes** written by agents were being displayed to the person
  who raised the ticket.

Separately, any employee could grant themselves manager-level access through the
employee login screen, which had no permission check.

**Please note:** access rules were tightened so that editing requires an edit
permission, where previously view access was enough. Any custom role that was
relying on that gap — for example marking attendance or approving leave with only
"View" permission — will need the corresponding permission granted explicitly
under **Admin → Roles**. A query is provided to list exactly which roles are
affected.

---

## 4. Payroll accuracy

- Two endpoints could write salary figures calculated from the wrong source,
  inventing allowances and **paying a full month to an employee with no
  attendance recorded**. Both were unused and are now disabled.
- Entering **zero working days** was read as "not entered" and paid a full month.
- The figures previewed on the Salary Setup screen did not match what was saved
  when payroll was processed — professional tax, provident fund and ESIC
  eligibility were each calculated differently. Both now use the same
  calculation.
- A **locked payroll could be silently overwritten**, including months already
  filed against PF/ESI returns. Locked records are now protected individually,
  while still allowing other sites in the same month to be processed.
- The professional tax compliance register had no column for February's higher
  rate, so those employees appeared in no category and the totals did not
  reconcile.
- Employees who had left were still being given payroll records.

---

## 5. Speed

- The Field Check-ins screen was running two database queries per employee. For
  300 staff that is over 600 queries for one page, which also slowed unrelated
  screens. It is now two queries in total.
- Bulk payroll generation ran two queries per employee one after another and was
  exceeding the 30-second limit on larger teams.
- The Employees screen ran nine separate counting queries on every load; now two.
- Recruitment search queried the entire candidate table on every keystroke, with
  no guarantee that results arrived in order. Searching is now settled and
  ordered.
- A 430 KB spreadsheet library was being loaded on 17 screens whether or not it
  was used; it now loads only when exporting or importing.
- Notifications were fetching 50 full records every 30 seconds in every open tab,
  including tabs left in the background.
- Database indexes were added for the employee list, recruitment and field
  check-in lookups.

---

## 6. Mobile

Every one of the 58 dashboard screens was checked at phone width and corrected.

The application had a setting that hid horizontal overflow on small screens,
which concealed the symptom rather than fixing it — content pushed beyond the
screen edge became permanently unreachable. The underlying layout issues were
fixed instead:

- Wide tables (Assets, Payroll Setup, Field, Rule Book, Performance) were cut off
  with no way to scroll to the remaining columns.
- Two-panel screens across Payroll kept a fixed-width side panel, leaving very
  little usable space.
- Tab strips on several screens ran past the edge, making the last tab
  unreachable.
- The Performance review panel was wider than a phone screen.
- Toast messages appeared past the right edge, putting their close button out of
  reach.
- On the Inspection form — used on site — the "Force Save" button rendered
  completely blank on phones.
- Screens sat flush against both edges with no margin; buttons and filters did
  not wrap; some tap targets were too small.

Verified at 375 px (iPhone) with realistic data, including long names and full
job titles.

---

## Action required

These four are configuration changes and cannot be made from the codebase.

1. **Add `CRON_SECRET`** in the hosting environment. The nightly leave-status job
   will not run until it is set — deliberately, so the job cannot be triggered by
   anyone else in the meantime.
2. **Switch the database connection to the pooled connection string.** Each
   request currently opens its own connection.
3. **Review custom roles** under Admin → Roles, per section 3 above.
4. **Run the data clean-up preview** (`scripts/normalize-identity-fields.sql`).
   It only reports what would change until the update statements are enabled, and
   also lists any records whose Aadhaar, PAN or IFSC will not pass the new checks
   so they can be corrected.

---

## Note on verification

Everything above was verified by reading the affected code, and the mobile work
was measured in a browser at phone width against realistic test data.

Two areas were **not** covered and remain unverified:

- **The native mobile application** cannot currently start, for reasons that
  predate this work. It is operating as a wrapper around the website. Deciding
  whether to complete it or retire it is a separate piece of work.
- **Pop-up dialogs** were corrected by inspection rather than by opening each one
  with live data.
