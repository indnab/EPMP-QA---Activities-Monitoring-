# QA Activity Tracker — Prototype

A clickable front-end prototype for tracking and reporting new-parts development QA activities in an automotive setting. Built with React + TypeScript + Vite; all data is in-memory/localStorage — no backend is required.

---

## Quick Start

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later

### Install and run

```bash
# From the workspace root:
cd qa-activity-tracker
npm install
npm run dev
```

The app starts at **http://localhost:5173**.

### Build for production

```bash
npm run build
```

Output goes to `dist/`. The build also runs `tsc -b` (TypeScript type-check). Both must pass with zero errors.

### Preview the production build

```bash
npm run preview
```

---

## Reset Demo Data

All changes you make in the app (builder definitions, entry values, dashboard layouts) are stored in the browser's `localStorage` under the key `qa-tracker-store`.

**To reset to the original seed data**, open the Home page and use the "Reset demo data" button at the bottom of the page. This is equivalent to clearing the `qa-tracker-store` key from localStorage and reloading.

You can also reset from the browser DevTools:
```js
localStorage.removeItem('qa-tracker-store')
location.reload()
```

---

## Project Structure

```
qa-activity-tracker/
├── public/                  # Static assets
├── src/
│   ├── domain/
│   │   └── index.ts         # TypeScript types: ActivityDefinition, FieldDefinition,
│   │                        #   ApprovalFlow, ActivityEntry, PartRecord, Widget,
│   │                        #   ModelRecord, MilestoneDef, Section, TemplateRow, ...
│   ├── engine/
│   │   └── index.ts         # Pure functions (no UI): resolveInstanceDates, calculateRYG, evaluateConditionalRules,
│   │                        #   evaluateCalculatedFields, transitionEntry,
│   │                        #   generateDashboardConfig, aggregateWidgetData
│   ├── mock/
│   │   ├── index.ts         # 6 seed activities, 25 mock parts, 6 seed entries,
│   │   │                    #   mock fetchers for ENOVIA / SAP / E-Doc / Regulatory App
│   │   └── attributeCatalogue.ts  # 21 fetched-field attributes for the builder
│   ├── store/
│   │   ├── personaStore.ts  # Zustand: active persona (persisted to localStorage)
│   │   ├── qaStore.ts       # Zustand: activities, entries, dashboards, drafts
│   │   └── index.ts         # Re-export
│   ├── components/          # Shared UI: PersonaChip, SourceBadge, StatusPill, RygDot,
│   │   │                    #   Card, Button, Modal, Drawer, Tabs, FieldRenderer
│   │   └── index.ts         # Barrel export
│   ├── features/
│   │   ├── AppLayout.tsx    # Shell: header + left nav + <Outlet>
│   │   ├── home/
│   │   │   ├── HomePage.tsx    # Persona entry points, inbox, milestone overview, demo tour button
│   │   │   └── DemoTour.tsx    # 16-entry guided tour (MRDs → template → PIC/N-A/Vendor → My Work/grid/AI import/validation → dashboard)
│   │   ├── mywork/
│   │   │   ├── workQueue.ts          # Pure logic: who enters first, open/waiting, groups, counts
│   │   │   ├── MyWorkPage.tsx        # Vendor/PIC/SIC/DPM worklist grouped by activity + milestone
│   │   │   ├── MyWorkGridPage.tsx    # Entry and validation grid: many parts of one activity; save, submit, approve, send back, CSV
│   │   │   ├── gridModel.ts          # Per-row rules (calculated, conditional, edit rights) via the engine; entry and validate modes
│   │   │   ├── gridExport.ts         # Rows shown -> CSV text and file name (same columns as the table)
│   │   │   ├── csv.ts                # CSV quoting, formula-injection prefix, browser download
│   │   │   ├── GridCell.tsx          # Compact cell editors by field type
│   │   │   ├── AiImportPanel.tsx     # Upload/paste entry point (placeholder, no AI)
│   │   │   └── AiReviewIllustration.tsx  # "Illustration only" review-and-confirm screen
│   │   ├── models/
│   │   │   └── ModelsPage.tsx      # Model Coordinator: models + milestone MRDs
│   │   ├── templates/
│   │   │   └── SectionTemplatePage.tsx  # Section Admin: activity + milestone + MRD offsets
│   │   ├── pics/
│   │   │   └── PicsPage.tsx        # SIC/Admin: assign temporary/permanent PICs; who-did-what report
│   │   ├── applicability/
│   │   │   └── ApplicabilityMatrixPage.tsx  # PIC/SIC/Admin: parts x activities matrix to mark Not applicable
│   │   ├── settings/
│   │   │   └── SettingsPage.tsx    # Admin: sections and milestone lists
│   │   ├── scope.ts         # Role scope helpers, DEMO_TODAY, date/offset formatters
│   │   ├── activities/
│   │   │   └── ActivitiesPage.tsx  # Activity list with filters + actions
│   │   ├── builder/
│   │   │   ├── BuilderPage.tsx     # Draft list
│   │   │   ├── BuilderWizard.tsx   # 4-step wizard shell
│   │   │   ├── steps/
│   │   │   │   ├── BasicsStep.tsx
│   │   │   │   ├── FieldsStep.tsx
│   │   │   │   ├── FlowStep.tsx
│   │   │   │   └── ReviewStep.tsx
│   │   │   └── LivePreviewPanel.tsx  # Right-side real-time preview
│   │   ├── listColumns.ts          # Admin-ticked field columns for the part lists
│   │   ├── workspace/
│   │   │   ├── WorkspacePage.tsx    # Part list table with filters
│   │   │   ├── PartDetailDrawer.tsx # Form + history drawer
│   │   │   ├── DeviationPopup.tsx   # E-Doc fetch popup
│   │   │   └── HistoryTimeline.tsx  # Audit timeline
│   │   └── dashboard/
│   │       ├── DashboardsPage.tsx   # react-grid-layout dashboard + configurator, filter chips
│   │       ├── WidgetRegistry.tsx   # 9 widget types (kpi, donut, stackedBar, ..., chart)
│   │       ├── ChartWidget.tsx      # general chart: bar, stacked bar, donut, table, KPI tile
│   │       ├── ChartControls.tsx    # properties-panel controls of a custom chart
│   │       ├── chartEditor.ts       # chart defaults, valid-choice repair, suggested title
│   │       ├── drill.ts             # click -> filters, chips, scope lock
│   │       └── DrillPartsList.tsx   # "View parts" list under the chips
│   ├── App.tsx              # Routes
│   ├── main.tsx             # React root
│   └── index.css            # Tailwind v4 @theme tokens + base styles
├── design-spec.md           # Design specification (personas, IA, UX, integration)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## How to Use the Demo Tour

Click the **▶ Demo tour** button on the Home page. The tour is a 16-entry overlay (a welcome, 14 numbered steps, and a closing entry) that follows the date chain and then the Vendor, PIC, SIC and DPM work flow:

1. Introduces MRD-driven dates.
2. Switches to **Model Coordinator** and opens **Models & MRDs** — mandatory vs optional milestones, "Awaiting MRD".
3. Switches to **Admin** and opens the **Builder** — fields and flow only, no dates.
4. Shows the **Builder wizard** for PP #10.
5. Switches to **Section Admin** and opens the **Section Template** — milestone + MRD±X offsets.
6. Switches to **PIC** (fixed to NP1) on the PP #10 workspace — calculated dates and RYG per part.
7. Switches to **PIC** on the **Applicability** matrix — marking parts Not applicable.
8. Switches to **Vendor** (fixed to Minda Industries) — only Minda parts are visible.
9. **Vendor: My Work** — the worklist grouped by activity and milestone.
10. **Vendor: entry grid** — many parts in one table; save drafts and submit ready rows.
11. **Import with AI (placeholder)** — the upload/paste entry point and the review step illustration.
12. **PIC: entry grid** — the same table for PIC fields, with Download CSV.
13. **PIC: validation grid** — approve or send back many Vendor submissions at once.
14. **SIC and DPM: validate only** — My Work with the validation grid, no entry.
15. Switches back to **Admin** and opens **Dashboards** — filters, the Completion-rate-by-Model/Department charts, click-to-filter chips and the View parts list; **Edit Layout** and **+ Custom chart** to build your own.
16. Returns to Home.

**Keyboard controls during the tour:**
- `→ Arrow Right` — next step
- `← Arrow Left` — previous step
- `Escape` — skip tour

The tour can be launched multiple times. Closing with "Skip tour" or "Done" does not change any data.

---

## My Work, Entry and Validation Grids, CSV and AI Import

- **My Work** (`/mywork`, Vendor, PIC, SIC and DPM): every part waiting for the signed-in role, grouped by activity under a milestone across sections. The PIC also has a "To validate" tab; the SIC and DPM see "To validate" only. Items sent back come first.
- **Entry grid** (`/mywork/:activityId/:milestoneId`, optional `?section=`): one row per part, one column per field the role enters. Fill a column for selected rows, copy a value down, press Enter to move down a column. Calculated cells update as you type; cells that a rule makes required turn amber. Save drafts keeps partial work; Submit works per row or for all complete rows, and incomplete rows are listed with what is missing and are not submitted. Attachments are added in the part form. The grid uses the same engine functions and edit-rights rule as the part form.
- **Import with AI** is a **placeholder**: an upload/paste entry point and an "Illustration only" review screen. No AI runs, nothing is read, and nothing changes. The intended behaviour is in `../user-stories.md` (AI-1 and AI-2).
- **Validation grid** (same route with `?mode=validate`, opened from "To validate" cards): lists Submitted rows waiting for the role. The PIC's own fields (for example `e_doc_number`, `mail_status`) can be typed and saved with "Save PIC edits". **Approve selected** skips rows whose required PIC fields are empty and lists them; **Send back selected** needs a written reason that goes into each row's history. Nothing is pre-ticked. SIC and DPM get the same grid with no editable columns and cannot approve a row whose required PIC fields are empty. Per-row Approve and the part form remain available.
- **Download CSV** (both grids): exports the rows shown with the table's columns, values as on screen. Quoted for commas, quotes and line breaks; cells starting with `=`, `+`, `-` or `@` get a leading `'`; UTF-8 with BOM. It is one-way: files are not read back. There is no `.xlsx` export.
- Not covered: reading files or any AI; the only import path is the AI placeholder.

---

## Dashboards: custom charts, drill-down and list columns

- **Custom charts** (Admin, SIC, DPM: *Edit Layout* then *+ Custom chart*): pick what to measure (count, completion rate, overdue, awaiting validation, or the average/sum of a number or percent field), how to group (Status, RYG, Model, Department, Vendor, Section, Milestone, type, Activity on the Overview, and on an activity dashboard that activity's dropdown, yes/no, date and number fields), how to show it (bar, stacked bar, donut, table, KPI tile) and, for a stacked bar, what to split by. Only valid choices are offered. Every dashboard ships with **Completion rate by Model** and **by Department**; *Reset to Auto Layout* restores them.
- **Drill-down:** click any chart element and the dashboard filters in place. A "Filtered by" bar shows each filter as a chip with a ✕ and a "Clear all". Under it, **View parts** lists the matching parts; **Open →** opens the part's form in the Workspace. Locked filters (PIC and Section Admin: NP1; Vendor: Minda Industries) stay locked and have no chip.
- **List columns:** in the Builder's Fields step each field has **Part list** (extra column in the Workspace table) and **Drill-down** (extra column in View parts on that activity's dashboard) checkboxes. File and button fields cannot be columns. The seed activities have both ticked on their dashboard fields.
- **Reset:** this feature raised the saved-data version, so the first load after updating clears any saved demo data once (the new default charts then appear). Details and assumptions are in `design-spec.md` section 4.5.

---

## Seed Data

Six activities are seeded (Admin-defined fields and flow only; no dates):

| ID | Activity | Key patterns |
|---|---|---|
| `pp-1` | Parts drawing confirmation in IBOM | PIC-only, conditional target date |
| `pp-2` | Spec meeting confirmation | ENOVIA/SAP fetched fields, vendor dates |
| `pp-10` | Sheet metal part accuracy status | Accuracy %, E-Doc deviation, New Part vs ECN split |
| `mpp-1` | OTOP status | Calculated OTOP status, deviation pop-up |
| `pilot-12` | SOP readiness (A/AR/F parts) | Large vendor form, mandatory attachment |
| `pilot-15` | Part updation in SMIR system | SAP-only fetch, no vendor input |

Also seeded:
- **Models:** Swift, Brezza, Baleno, Grand Vitara, Fronx, Dzire, all with the four mandatory MRDs; optional milestones are partly blank to demonstrate "Awaiting MRD". Baleno is deliberately late.
- **Milestones:** PP, MPP, Pilot, SOP (mandatory), Jig, Kani, Weld, Engine, Assembly. **Sections:** NP1–NP6.
- **Parts:** 25 across the sections (12 in NP1, 3 of those from Minda Industries), each with a vendor and PIC.
- **Section Template:** NP1 has six rows, e.g. pp-10 at `PP-23` to `PP+7`. NP3, NP4 and NP5 each have the four Vendor-facing rows (pp-2, pp-10, mpp-1, pilot-12) so Minda has work across sections. These rows are deliberate demo data and stay. NP2 and NP6 have no template, so their parts show nothing until a Section Admin adds rows.
- **Part applicability:** `pp-10`, `pilot-12` and `pilot-15` allow the PIC to mark parts Not applicable. On `pp-10`, NP1 parts 95100-M82P10 (with a reason) and 34100-M72V00 are marked; on `pilot-15`, 35120-M68P00 was marked and then reversed by the SIC, so the history shows both lines.
- **Vendor and PIC work:** Minda has 7 parts and 18 activity instances across NP1, NP3, NP4 and NP5, in mixed stages (not started, draft, sent back, submitted, approved), so My Work shows 24 open items in 4 groups. The NP1 PIC has 21 items to enter (pp-1 and pilot-15) and 6 to validate.
- **Entries:** seeded in varied states (Draft, Submitted, Sent back, Approved, overdue). The demo "today" is fixed at 2026-10-15.

---|---|---|---|
| `pp-1` | PP | Parts drawing confirmation in IBOM | PIC-only, conditional target date, calculated MRD offset |
| `pp-2` | PP | Spec meeting confirmation | ENOVIA/SAP fetched fields, vendor dates, RYG |
| `pp-10` | PP | Sheet metal part accuracy status | Accuracy %, E-Doc deviation, New Part vs ECN split |
| `mpp-1` | MPP | OTOP status | Calculated OTOP status, deviation pop-up |
| `pilot-12` | Pilot/SOP | SOP readiness (A/AR/F parts) | Large vendor form, mandatory attachment |
| `pilot-15` | Pilot/SOP | Part updation in SMIR system | SAP-only fetch, no vendor input |

The mock part list has 25 parts across 6 models (Swift, Brezza, Baleno, Grand Vitara, Fronx, Dzire), 6 vendors, 9 department values (the data mixes categories such as A, AR, F, G with functions such as Electrical, Body, Engine), and a mix of New Part and ECN types. Entries are seeded in varied states (Draft, Submitted, Sent back, Approved, overdue) so dashboards and the inbox look alive on first load.

---

## Tech Stack

| Concern | Library / Version |
|---|---|
| Build | Vite 8 + TypeScript 6 |
| UI | React 19 |
| Routing | React Router v7 |
| State | Zustand 5 with `persist` |
| Styling | Tailwind CSS v4 (CSS-first, no config file); look and feel ported from `EPMP_RapidPrototype (1).html` (Inter, indigo sidebar, EPMP status palette) |
| Charts | Recharts 3 |
| Dashboard grid | react-grid-layout 2 |
| Lint | oxlint |

---

## Design Reference

See [`design-spec.md`](./design-spec.md) for:
- Purpose and all personas with colour tokens
- Information architecture and route map (Mermaid diagram)
- The Activity Definition model and a full worked example (PP #10)
- Screen-by-screen UX notes for Builder, Workspace, Dashboard
- Approval flow state machine and RYG rules
- Integration approach (how mock fetchers map to ENOVIA/SAP/E-Doc/Regulatory App)
- Design system tokens
- Open questions and next steps toward a production build

## Documentation and tools

- `docs/EPMP_QA_Tracker_User_Manual.pdf` — user manual and screen sign-off document (capabilities, screens, and the 46 activities with their fields).
- `tools/gen_blueprints.py` — regenerates `src/mock/activityBlueprints.ts` from the client field-validation Excel (the Excel itself is not in this repository). Run: `python3 tools/gen_blueprints.py "<excel>.xlsx" src/mock/activityBlueprints.ts tools/gen_blueprints.review.txt`.
- `tools/gen_blueprints.review.txt` — rows where the generator had to make an assumption.
