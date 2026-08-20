# Login & Account Security — Proposal

**Project:** CIMS (Growus Auto) · **Prepared:** 19 August 2026
**Scope:** how users sign in, how they recover access, and how accounts are protected.

---

## 1. How sign-in works today

| Item | Current behaviour |
|---|---|
| Login ID | The employee's 10-digit mobile number |
| Default password | **The same mobile number** |
| Password change | Available under Profile → Change Password (minimum 6 characters) |
| Forgot password | **Does not exist.** HR has to reset it manually |
| OTP / two-factor | Not available |
| Failed-login limit | **None.** Passwords can be guessed without limit |
| Session length | 30 days |
| Password storage | Hashed (bcrypt) — **but also stored in readable form** for the admin screen |

### Why this needs attention

1. **The user ID and the password are the same number.** Anyone who knows an employee's mobile number knows both halves of their login until that person voluntarily changes their password. Mobile numbers are not secret — they are on WhatsApp, on gate registers, and shared between colleagues.

2. **Readable passwords are stored in the database.** A column keeps the plain password so the admin "Employee Logins" screen can display it. Anyone who obtains a database copy obtains every password. Passwords should never be readable by anyone, including administrators.

3. **There is no limit on failed attempts.** An automated script can try thousands of number combinations against the login page without being slowed down or blocked.

4. **There is no self-service recovery.** Every forgotten password becomes an HR ticket, and the reset is communicated over WhatsApp or verbally — which is both slow and insecure.

---

## 2. What we propose to build

### Phase 1 — Close the open risks (foundation)

Nothing below needs a new vendor or budget. This phase must come first: adding OTP on top of readable passwords would not make the system secure.

| # | Item | What changes for users |
|---|---|---|
| 1.1 | **Stop storing readable passwords.** Remove the plain-text column and the "view password" feature. Administrators will be able to *reset* a password, never to *see* one. | Admin screen shows "Reset password" instead of the password itself |
| 1.2 | **Random first-time passwords.** New employees get a randomly generated password instead of their mobile number, delivered by SMS. | Nothing to remember from a colleague — the password arrives on their phone |
| 1.3 | **Force a password change on first login.** | User sets their own password before reaching the dashboard |
| 1.4 | **Password rules.** Minimum 8 characters, and the password cannot be the user's own mobile number or employee code. | Slightly stricter when choosing a password |
| 1.5 | **Rate limiting and lockout.** After 5 failed attempts the account is paused for 15 minutes. | Legitimate users are unaffected; guessing becomes impractical |
| 1.6 | **Login activity record.** Every successful and failed login is recorded with time and device. | Invisible day to day; used for investigation |

**Estimated effort:** 2 weeks

---

### Phase 2 — Forgot Password with SMS OTP

The recovery flow employees will actually use.

**How it will work**

1. User taps **Forgot Password** on the login screen.
2. User enters their registered mobile number.
3. System sends a **6-digit OTP** valid for **10 minutes**.
4. User enters the OTP.
5. User sets a new password.
6. All existing sessions for that account are signed out.

**Protections built into the flow**

- Maximum **5 OTP requests per number per hour**, and **3 wrong OTP attempts** before the code is cancelled.
- The screen shows the same confirmation whether or not the number is registered, so the page cannot be used to discover who works here.
- OTPs are stored hashed and are single-use.
- HR is notified when a password is reset.

**Estimated effort:** 2 weeks (after the SMS account is live)

---

### Phase 3 — OTP at login (optional, decide later)

Once Phase 2 works, the same OTP mechanism can be used at sign-in:

- **Option A — OTP for everyone at every login.** Most secure, most friction, highest SMS cost.
- **Option B — OTP only for administrators and payroll users.** Protects the accounts that matter most.
- **Option C — OTP only on a new device.** Familiar phone or laptop signs in normally; a new one asks for OTP. Best balance of security and convenience.

**Our recommendation: Option C**, with Option B as a simpler starting point.

**Estimated effort:** 1–2 weeks

---

### Phase 4 — Ongoing account hygiene

| Item | Purpose |
|---|---|
| Automatic sign-out of employees who leave | Already partly in place; to be completed |
| Session expiry reduced from 30 days to 7 | Limits damage from an unattended device |
| "Sign out of all devices" button | User control after losing a phone |
| Password expiry every 90 days for admin accounts | Optional — decide based on preference |

**Estimated effort:** 1 week

---

## 3. What we need from the client

### 3.1 SMS provider account (required for Phase 2)

An SMS account must be opened in the company's name. We recommend an Indian provider such as **MSG91**, **Gupshup**, or **Fast2SMS**.

**Important — Indian regulation:** transactional SMS in India requires **DLT registration** with TRAI before any message can be delivered. This involves:

- Registering the company as a **Principal Entity** (needs GST / company documents)
- Registering a **Sender ID** (a 6-letter code such as `GROWUS`)
- Registering the **message template** — the exact wording of the OTP message

**This process typically takes 1–2 weeks and cannot be shortened by us.** It should be started immediately, in parallel with Phase 1, or it will delay Phase 2.

**Expected cost:** approximately ₹0.15–0.25 per SMS. For an estimated 200–400 password resets per month, this is roughly **₹100 per month**. If OTP-at-every-login is chosen later (Phase 3, Option A), volume rises to roughly 15,000 messages per month — approximately **₹3,000 per month**.

### 3.2 Decisions required

| Decision | Options | Our recommendation |
|---|---|---|
| Recovery channel | SMS only / SMS + Email | **SMS only** — not every worker has email on file |
| OTP at login (Phase 3) | Everyone / Admins only / New device only | **New device only** |
| Session length | 30 days / 7 days / 1 day | **7 days** |
| Existing passwords | Leave as-is / force everyone to reset once | **Force one reset** — most are still the mobile number |

### 3.3 One-time cleanup

Because the current default password is the employee's mobile number, most accounts still use it. Once Phase 1 is live, we recommend a **single forced password reset for all users**, communicated in advance so the support load is expected.

---

## 4. Suggested sequence

| Week | Work | Depends on |
|---|---|---|
| 1–2 | Phase 1 — close open risks | — |
| 1–2 | *(client, in parallel)* Open SMS account, begin DLT registration | Client |
| 3–4 | Phase 2 — Forgot Password with OTP | DLT approval |
| 5 | Forced password reset for all users | Phase 1 + 2 |
| 6–7 | Phase 3 — OTP at login *(if chosen)* | Phase 2 |
| 8 | Phase 4 — session and account hygiene | — |

**Total: approximately 6–8 weeks**, of which Phase 1 (2 weeks) delivers the largest security improvement and does not depend on the client or on any vendor.

---

## 5. Summary

The single most important point: **today, knowing an employee's mobile number is usually enough to sign in as them.** Phase 1 ends that, and does not require any purchase or approval. Phase 2 gives employees a way to recover their own account without going through HR.

We recommend approving Phase 1 to begin immediately, and starting the DLT registration in parallel so that Phase 2 is not held up.
