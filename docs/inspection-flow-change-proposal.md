# Inspection Module — Flow Change Proposal

_Status: Awaiting client approval_

## New Flow

**Site → Project → Assignment**

### 1. Site (top level)
A Site is created/selected first. It represents the physical location.

### 2. Project (under a Site)
Each Project is created under a Site. The **"Add Manager & Inspector"** feature
stays at this stage — Managers and Inspectors are added directly at the Project
level (no change to how it works).

### 3. Assignment
Assignments are created from a Site's projects, with the access options below.

---

## Assignment — Access Options

When creating an assignment, the user selects a **Site**, then chooses how much
access to grant:

### Option A — Whole Site (all projects)
- The assignment covers **all Projects** under that Site.
- **Future projects are auto-included:** if a new Project is added to that Site
  later, it automatically becomes part of this assignment — no need to re-assign.

### Option B — Specific Projects (checkboxes)
- The Site's projects are shown with **checkboxes**.
- The user ticks only the projects they want; access is limited to those
  **selected projects only**.
- Multiple projects can be selected.

---

## Removed
- The **Groups** feature is removed entirely (from the flow and as a concept).
  Its old role — bundling a Project with its Managers/Inspectors — now lives
  **inside the Project**, since Managers and Inspectors are added at the Project
  level.

## Kept (no change)
- **Add Managers & Inspectors** — retained, now at the **Project** stage.
- **Assignments** remain the final step, with the access options above.

---

## Summary
Flow becomes **Site → Project → Assignment**. **Groups is removed.**
Manager/Inspector add stays at the **Project level**. At **Assignment**, the user
picks a Site and grants access to either **all its projects (future ones
auto-included)** or **specific projects selected via checkboxes**.
