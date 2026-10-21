# Marketing Tracker Prototype

A clean, minimalist working prototype focused strictly on the marketing workflow:
**Came (Visited) &rarr; Filled Form &rarr; Attended Quiz**.

Contains **zero dummy values** (starts completely clean). Self-contained: it does not
use or link to any files outside this `marketting` folder.

---

## Two views (switch at the top)

### 1. Admin
Full control over the marketing team and every lead.

- **Team management**: add, edit, activate / deactivate and remove marketing members
  (name, email, phone, monthly lead target).
- **Team table**: per-member Came / Form / Quiz counts, conversion %, and progress
  against their monthly target.
- **All leads**: every lead with its stage, owner and date. Reassign a lead to
  another member from the "Assigned To" dropdown, advance its stage, or delete it.
- **Filters**: member (incl. "Unassigned") and date range, plus Daily /
  Week-wise / Month-wise breakdown.
- Removing a member does not delete their leads; they become **Unassigned**.

### 2. Marketing Portal
The view for one marketing member (choose who from **"Signed in as"**).

- Only **their own** leads, metrics, breakdown and monthly target.
- **How I Compare**: their rank and the team average conversion, shown anonymously.
  No other member's name, contact details or leads appear in this view.
- **My Profile**: their own details only (editing is done by the admin).
- Members can add leads (auto-assigned to themselves) and advance their stage.
  Deleting or reassigning leads is admin-only.

---

## Data
Saved in the browser's localStorage:
- `clean_marketing_entries_v2` leads (same key as before, so earlier entries are kept as Unassigned)
- `clean_marketing_members_v1` team members
- `clean_marketing_ui_v1` last view and signed-in member

> Prototype note: the Admin / Portal switch is a front-end toggle with no login. Real
> access control (who may open Admin) needs authentication on a backend.

---

## How to Run
1. Open `marketting/index.html` directly in your browser (double-click).
2. Or use Live Server in VS Code on `marketting/index.html`.

The previous version is kept in `marketting/_backup_original/`.

---

## Admin tabs (left sidebar)
- **Dashboard**: funnel totals + Daily / Week-wise / Month-wise breakdown.
- **Marketing Team**: manage members (+ Add Member lives here).
- **All Leads**: every lead, appointment column, separate Delete column with a
  confirmation step (+ Add Entry lives here). **Export CSV** downloads the leads
  matching the current filters. Click a name to open that person's submitted form.

## Lead details panel (click a name)
The submitted form shown like the real form (Name, Contact number, Email address),
quiz answers with score, appointment, funnel progress, lead info, and a per-lead
**Export** button.

## Forms (quizzes)
Every lead is linked to the form whose link they clicked. The **Forms** tab lists each form
with leads, attempted, qualified, not qualified, booked, showed up and average score.
Click a form to see its funnel, how people answered each question (with the correct answer
marked), every response (filter by result) and **Export Responses** to CSV.

The 3 forms are **demo placeholders**. Replace them in `app.js` at `FORMS` (each form has a
name, status, pass mark and its questions: 4 options + index of the correct one).

## Platform
All leads come from **LinkedIn** only, so there is no source / platform tracking or filter.

## Search
- **Top bar search** (every admin tab): finds team members, forms, help requests and leads.
- **Tab search**: All Leads, Marketing Team, Forms (forms list / a form's responses),
  Help Requests, the Summary member table and the portal's My Leads each have a search box.

## All Time
Every period filter has **All Time**: the date-range filters, the Summary tab
(Daily / Weekly / Monthly / All Time) and the Forms tab.

## Forms performance by period
The Forms tab has **Today / This Week / This Month / All Time**. A form's page also shows a
**Performance Over Time** table with all four periods side by side.

## Help requests
- Members open the **Marketing Portal** with `portal.html` (it opens `index.html#portal`)
  and use **Help & Support → + Raise a Problem**.
- Requests appear in **Admin → Help Requests** (the menu shows how many are still open).
  Admin can reply and set the status (Open / In Progress / Resolved) but cannot raise one.
- Members see admin replies and the status under Help & Support in their portal.
- Prototype note: Admin and portal share data through the browser's local storage, so open
  both in the **same browser**. There is no login yet: the portal's "Signed in as" picker
  stands in for it.
