# QA Activity Tracker — Design Specification

**Version:** 2.0  
**Status:** Prototype complete, including Section Templates and MRD-driven dates (see section 9)  
**Source of truth:** `qa-activity-tracker/` in the workspace root  
**Evidence base:** `20261012_EPMP_Swimlanes_v1.pptx` (100 slides, 46 activity blueprints across PP, MPP, Pilot/SOP phases)

---

## 1. Purpose and Personas

### 1.1 System Purpose

The QA Activity Tracker is a configurable tool for tracking and reporting new-parts development QA activities in an automotive setting. A **QA Activity** is a defined checklist item (e.g. "PP #10 Sheet metal part accuracy status") that applies to a set of parts, involves one or more personas in filling-in and validating fields, and has planned dates that are calculated per part from the model's milestone MRDs (see section 9). The system's core value is that a non-technical Admin can define any activity—its fields, sources, and approval flow—without writing code, and the resulting workspace form and dashboard are generated automatically.

### 1.2 Personas and Colours

The system models ten roles derived from the deck's swimlane diagrams. Each role has a colour token used consistently in chips, avatars, and source badges.

| Persona ID | Label | Role | Colour token | Hex |
|---|---|---|---|---|
| `Admin` | Admin | Creates and publishes activity definitions | `--color-persona-admin` | `#22c55e` (green) |
| `PIC` | PIC | Person-In-Charge: enters PIC fields, validates vendor submissions | `--color-persona-pic` | `#c4b5fd` (lavender) |
| `Vendor` | Vendor | Supplier: enters vendor fields, submits for validation | `--color-persona-vendor` | `#f97316` (orange) |
| `SIC` | SIC | Section-In-Charge: reviews entries, monitors section dashboards | `--color-persona-sic` | `#a78bfa` |
| `DPM` | DPM | Department Planning Manager: tracks completion, escalates overdue | `--color-persona-dpm` | `#6366f1` |
| `DDVM` | DDVM | Deputy DVM: monitors pilot readiness | `--color-persona-ddvm` | `#8b5cf6` |
| `DVM` | DVM | Design-Validation Manager: gate approval | `--color-persona-dvm` | `#7c3aed` |
| `ModelCoordinator` | Model Coordinator | Enters models and milestone MRD dates | `--color-persona-mc` | `#0891b2` |
| `SectionAdmin` | Section Admin | Builds the section template (activity + milestone + MRD offsets); fixed to NP1 in the prototype | `--color-persona-sa` | `#d97706` |

The active persona is stored in Zustand (`usePersonaStore`) and persisted to `localStorage` under key `qa-tracker-persona`. All permission checks throughout the app read from this store, not from a server session.

---

## 2. Information Architecture and Navigation

### 2.1 Route Map

```mermaid
graph LR
    Home[/ Home] --> Activities[/activities Activities list]
    Home --> Builder[/builder Builder landing]
    Home --> Dashboards[/dashboards Dashboards]
    Home --> Models[/models Models and MRDs]
    Home --> Template[/template Section Template]
    Home --> Settings[/settings Settings]
    Home --> MyWork[/mywork My Work – Vendor, PIC, SIC, DPM]
    MyWork --> Grid[/mywork/:activityId/:milestoneId Entry or validation grid]
    Activities --> Workspace[/activities/:templateRowId Workspace – part list]
    Workspace --> PartDrawer([Part detail drawer])
    Builder --> Wizard[/builder/:id Builder wizard]
    Wizard --> Step1[Basics]
    Wizard --> Step2[Fields]
    Wizard --> Step3[Flow]
    Wizard --> Step4[Review & Publish]
```

### 2.2 Navigation Shell

The app shell (`AppLayout.tsx`) has a collapsible left navigation (icons only when collapsed) and a top header. The header contains the app title, a "Prototype" badge, and the persona switcher. The left nav is role-gated: Home, Activities and Dashboards for everyone; Models & MRDs for Model Coordinator and Admin; Section Template for Section Admin and Admin; Builder and Settings for Admin. A skip-to-main-content link is present for keyboard navigation.

### 2.3 Persona Switcher

The persona switcher renders all persona chips inline. Clicking a chip immediately updates the Zustand store and re-renders the entire application—inbox, activity lists, part forms, and dashboards all react to the new persona without a page reload. The Home page also provides a card-grid of all personas for quick switching with role descriptions.

---

## 3. The Activity Definition Model

### 3.1 Core Types (from `src/domain/index.ts`)

```
ActivityDefinition            (no phase, no planned dates – see section 9)
├── id, name
├── scope (NewPart | ECN | Both)
├── ownerPersona (PersonaId)
├── description?
├── published? (false = draft; undefined/true = published)
├── fields: FieldDefinition[]
└── flow: ApprovalFlow

FieldDefinition
├── key, label
├── type (text | longText | number | percent | date | yesNo
│         | dropdown | multiSelect | file | flag | button | derived)
├── options? (for dropdown/multiSelect)
├── mandatory: boolean
├── enteredBy: PersonaId | 'System'
├── source: FieldSource
│     manual | calculated | upload | dropdown | mapping
│     | mail | enovia | sap | edoc | regapp
├── validatedBy: PersonaId | null
├── showOnDashboard: boolean
├── kpiRole?: status | date | count | percentage | category | null
├── showInPartList?: boolean    (Admin: extra column in the Workspace part list)
├── showInDrillList?: boolean   (Admin: extra column in the dashboard "View parts" list)
└── conditionalRules?: ConditionalRule[]

ApprovalFlow
└── steps: ApprovalStep[]
       stepIndex, role (PersonaId), label,
       allowedOutcomes: (Approve | Edit | Send back | Submit)[]
```

### 3.2 Worked Example — PP #10: Sheet Metal Part Accuracy Status

This activity (seed id `pp-10`, slides 22–23 of the deck) demonstrates the most complex pattern:

| Field | Type | Entered by | Source | Validated by | Dashboard |
|---|---|---|---|---|---|
| Applicable parts | dropdown (Y/N) | Vendor | manual | PIC | ✓ (category) |
| Applicable parts count | number | System | calculated | — | ✓ (count) |
| Inspection completed | dropdown (Y/N) | Vendor | manual | PIC | ✓ (status) |
| Accuracy target | text | System | calculated | — | — |
| Accuracy achieved (%) | percent | Vendor | manual | PIC | ✓ (percentage) |
| Not-achieved reason | longText | Vendor | manual | PIC | — |
| Evidence attachment | file | Vendor | upload | PIC | — |
| Target date for accuracy | date | Vendor | manual | PIC | — |
| Action plan | longText | Vendor | manual | PIC | — |
| Action result | dropdown (OK/NG/Deviation) | Vendor | manual | PIC | ✓ (category) |
| E-Doc number | text | PIC | manual | — | ✓ |
| Deviation status | text | System | edoc | — | ✓ |

**Conditional rules implemented:**
- `not_achieved_reason`, `target_date_accuracy`, `action_plan`, `action_result` are hidden unless `accuracy_achieved < 100`. When shown, they become mandatory.
- `e_doc_number` is hidden unless `action_result === 'Deviation'`. When shown, it becomes mandatory.
- `deviation_status` is hidden unless `e_doc_number` is non-empty; it is fetched from E-Doc.

**Accuracy bands** (from deck slide 22):
- 100% — on track
- 90–99% — at risk (triggers action plan)
- < 90% — critical (triggers action plan and deviation check)

**Dashboard widgets auto-generated for this activity:**
- KPI tiles: Total parts, Approved %, Overdue count, Awaiting validation
- Donut: RYG distribution
- Donut: New Part vs ECN split
- Band chart (`gauge` widget): `accuracy_achieved` split into three bands
- Stacked bar: `action_result` breakdown by vendor
- Table: outstanding parts with issues

---

## 4. Screen-by-Screen UX

### 4.1 Home Page

**Purpose:** Overview and quick-action hub.

**Key sections:**
1. **Hero banner** — current persona, role title, task description, "Demo tour" button, and a direct nav link for the persona's primary action.
2. **Persona entry points** — all personas as clickable cards with colour dots and role descriptions. Clicking switches the active persona immediately. Active persona shows a checkmark.
3. **Stats tiles** — four summary counts: Activities, Overdue, Awaiting Validation, Approved.
4. **Waiting for My Action inbox** — dynamically scans all entries:
   - Vendor: entries in Draft or Sent-back state with vendor fields.
   - PIC/SIC/DPM: entries in Submitted state with fields they validate.
   - Items sorted red → yellow → green; max 10 shown.
   - Clicking any row navigates to the activity workspace.
5. **Recent Activities** — last 4 published activities with completion progress bars.
6. **Milestone Overview** — horizontal stacked RYG bars, one row per milestone, scoped to the persona. Awaiting-MRD items are shown grey.
7. **Demo data controls** — Reset button with a confirmation step restores all seed data.

### 4.2 Activities List (`/activities`)

**Purpose:** Browse and manage all published activity definitions.

**Key interactions:**
- Filter by milestone, section, and free-text search; the list shows template rows (activity + milestone) scoped to the persona. Admin also gets an "Activity library" table. The `?q=` param pre-fills the search (with accessible `aria-label` attributes on all inputs).
- Clicking an activity name navigates to the workspace.
- Admin persona sees Edit (→ builder wizard) and Delete actions.
- **Delete retires; it does not erase.** Delete sets a `retired` flag on the activity after a confirm step. The activity leaves the Activity library, cannot be picked for a new Section Template row (and its rows cannot be duplicated), and `/builder/:id` shows "no longer available". Its existing template rows, entries, history and dashboard are untouched, so the Workspace, My Work, grids, Dashboards, Applicability and who-did-what log keep working for it. There is no restore. *Assumption, not confirmed with the client:* nothing is purged when the last row of a retired activity is removed; the definition stays in the store.
- Any persona can Duplicate an activity (creates a draft copy).
- Empty state when filters match nothing: friendly illustration and message.

### 4.3 Activity Builder (`/builder` and `/builder/:id`)

**Purpose:** No-code wizard for Admins to define activity definitions.

**Four-step wizard:**

**Step 1 — Basics:** Name, scope (New Part / ECN / Both), description, owner persona. There are no date or phase inputs; Section Admins set timing in the Section Template.

**Step 2 — Fields:** Table of fields. Each field row has type, label, options (for dropdowns), mandatory toggle, entered-by persona, source type, validated-by persona, conditional rule list, dashboard/KPI role toggles, and two list-column checkboxes, **Part list** and **Drill-down** (see 4.4 and 4.5; disabled for file and button fields, which have no useful text). For fetched sources (ENOVIA/SAP/E-Doc/Regulatory App) an attribute picker shows available attributes from the mock catalogue (`src/mock/attributeCatalogue.ts`, 21 entries). Drag-to-reorder and section grouping are supported.

**Step 3 — Flow:** Visual approval flow editor. Templates available: "Vendor → PIC validation", "PIC only", "System only". Each step shows role, label, and allowed outcomes. Outcomes drive the `transitionEntry` engine function.

**Step 4 — Review:** Summary of all choices. Validation messages for common errors (empty name, date range issues, fetched field with no system). Publish button calls `publishDraft()` which promotes the draft to the activities list and auto-generates a default dashboard.

**Live preview panel:** Right-side panel renders the workspace form and auto-dashboard in real time from the draft definition. Uses the same `FieldRenderer` registry and `generateDashboardConfig` engine function used by the production screens.

**Auto-save:** Every wizard change calls `saveDraft()` automatically. Drafts persist across page refreshes via Zustand `persist`.

### 4.4 Activity Workspace (`/activities/:templateRowId`)

**Purpose:** Part-level data entry and validation per activity.

**Part list table:** One row per in-scope part for the template row (PIC/Section Admin see NP1 parts only; Vendor sees Minda Industries parts only; a row outside the role's scope shows "Not available for your role"). Columns: checkbox, Part No, Part Name, Model, Vendor, Dept, planned start/end (calculated), Type, **one column per field the Admin ticked as "Part list" in the Builder (Fields step)**, Status, RYG, Open. A field column shows the value as the entry grid does (Yes/No, percent, dates), `n/a` where a conditional rule hides the field, and "—" for a part with no entry or marked Not applicable; long text is cut off in the cell with the full text on hover. With no field ticked the table is unchanged. `?part=<partNo>` opens that part's form directly (used by the dashboards' View parts list); closing the form removes it, and a part the role may not see is ignored. Parts whose milestone MRD is blank show "Awaiting MRD" and a grey RYG. Filters: Model, Vendor, Type, Status, RYG. Filters are URL-search-param driven (`useSearchParams`) so dashboard drill-downs can link directly to a filtered view. Bulk-select with "Mark Applicable" bulk action.

**Part detail drawer:** Full-screen right-side panel with two tabs — Form and History.

- **Form tab:** All fields rendered by the FieldRenderer registry. Field visibility and mandatory rules are computed on every keystroke by `evaluateConditionalRules()`. Calculated fields (`source === 'calculated'` or `enteredBy === 'System'`) are always read-only; their values are kept up-to-date via `evaluateCalculatedFields()`.
- Persona permissions: a field is editable only when `field.enteredBy === currentPersona` and the entry state allows editing (Draft or Sent-back for Vendor; always for PIC-owned fields). Fetched fields show a `SourceBadge`, a Refresh button, a "last fetched" timestamp, and a `⚠ Not available` fallback when the mock fetcher fails.
- **Workflow actions:** Vendor sees "Save draft" and "Submit". PIC/SIC/DPM sees "✓ Approve", "✎ Edit", "↩ Send back" (with a comment modal) when the entry is in Submitted state. All actions route through `transitionEntryState()` in the store.
- **History tab:** `HistoryTimeline` renders `entry.history` entries sorted newest-first. Each entry shows a coloured persona avatar, action label with colour-coded icon, ISO timestamp, and quoted comment.

**Deviation popup:** Auto-triggers when an actual date field exceeds `part.mrd` and the current persona is PIC. PIC enters an E-Doc number, clicks "Fetch status" (calls `fetchFromEdoc`), sees the deviation outcome, and saves to the entry.

**RYG summary:** Displayed in the activity header. Counts of Green/Yellow/Red parts are computed live from all applicable parts using `calculateRYG()`.

### 4.5 Dashboards (`/dashboards`)

**Purpose:** Auto-generated and reconfigurable dashboards per activity plus a cross-activity phase overview.

**Default dashboard generation:** `generateDashboardConfig(activityDefinition)` in `src/engine/index.ts` maps each field's `kpiRole` to a widget type:
- `status` → donut chart
- `percentage` → gauge/band chart
- `count` → KPI tile
- `date` → KPI tile or trend line
- `category` → stacked bar

Common widgets added for every activity: KPI tiles for total parts / completion % / overdue / awaiting validation; RYG donut; New Part vs ECN donut.

**Widget registry (`WidgetRegistry.tsx`):** Nine types: `kpi`, `donut`, `stackedBar`, `barCategory`, `trend`, `table`, `gauge`, `heatMap` and `chart` (the general, Admin-configured chart, drawn by `ChartWidget.tsx`). Adding a new type requires one entry in the registry and no screen changes. *Known gap, existing before this work:* the `table` ("Part List Table") widget has no data source in the engine, so it always shows "No outstanding items"; the View parts list below is the way to see parts.

**Global filters:** Milestone, Section, Model, Vendor, Type, Date range, plus the filters a chart click can set: Status, RYG, Department, Activity and activity-field values (`GlobalFilters`). Section and Vendor are locked to the persona's fixed scope where one exists. All filters are applied once, in `getFilteredData()` (the date range, section and milestone while building the rows; status, RYG and field values once an instance exists), so every widget recalculates together.

**Edit mode:** Toggle shows the react-grid-layout drag handles and a right-side properties panel. A widget palette lets users add new widgets, including **+ Custom chart**. Properties panel lets users change title, chart type, data binding (picking from the activity's fields), grouping, and colours. Who may edit is unchanged: Admin, SIC and DPM; every other role views and drills.

**Custom charts (the Admin builds the chart from the activity's data):** four choices, all in the properties panel (`ChartControls.tsx`):
- **What to measure:** count of parts, completion rate (%), overdue (RYG Red), awaiting validation (Submitted), or the average / sum of a number or percent field. Average and sum are disabled ("no number fields here") on dashboards without such a field; in the seed data that is pp-10, mpp-1 and pilot-12.
- **Group by:** Status, RYG, Model, Department, Vendor, Section, Milestone, New Part / ECN (all dashboards), Activity (Overview only), and, on an activity dashboard, that activity's dropdown, yes/no, date (grouped by month) and number/percent (grouped into the bands <90%, 90-99%, 100%) fields. Text, long-text, file, button and flag fields are not offered.
- **Show as:** bar, stacked bar, donut, table or KPI tile (the overall value). Only the drawing changes; the numbers are the same.
- **Split each bar by** (stacked bar only): any other grouping. Split is available for count, overdue and awaiting validation, because those are sums of parts; it is not offered for completion rate or average/sum, which are one number per bar.

The engine catalogue (`CHART_MEASURES`, `chartDimensions`, `chartMeasureFields`) lists exactly the valid choices, and `applyChartChange` repairs a chart when a change invalidates another choice (for example switching from average to completion rate drops the field and the split). The suggested title ("Completion rate by Model") follows the choices until the Admin edits it. A chart bar equals the matching KPI tile for the same filter, because the measures reuse the tile rules (`completionPct`, RYG Red, Submitted). Groups with no data are not drawn; an average group with no numbers shows "—"; empty field values form a visible "Not entered" group.

**Default charts:** every generated dashboard (each activity and the Overview) includes **Completion rate by Model** and **Completion rate by Department**, which is the Model / Department comparison. These are ordinary custom charts and can be edited, changed or removed. "Reset to Auto Layout" restores them.

**Named views:** Users can save a named layout snapshot, switch between named views from a dropdown, and reset to the auto-generated default. Drill filters are not saved in a view.

**Drill-down (in place):** clicking a bar, slice, stacked segment, table row, gauge band, KPI tile or heat-map cell **filters the dashboard where it stands**; it no longer navigates away. It works on the Overview and on activity dashboards.
- **Chips:** a "Filtered by" bar lists every active filter (the dropdown filters too), each with a ✕, and a "Clear all" (which keeps the date range). Successive clicks narrow further; a click on a filter that is already set replaces it. The bar is hidden when nothing is filtered. Section and Vendor filters that are locked by the role have no chip because they cannot be removed. Switching dashboard keeps the dropdown filters and clears the click-only ones and the milestone.
- **One set of names:** `normaliseDrill` (`dashboard/drill.ts`) turns every widget's click into the engine's keys, replacing the earlier mismatches ("Not Started" vs `NotStarted`, "Sent Back" vs "Sent back", "Awaiting MRD" vs `Grey`, "Not applicable" vs `NA`).
- **What each click filters to:** KPI tiles: Overdue = RYG Red, Awaiting validation = Submitted, Completion rate = Approved, Not applicable, Awaiting MRD (Total parts and custom Count/Average/Sum tiles have no filter of their own and are not clickable). RYG, type and state donuts and the stacked bars: that value (a stacked segment filters group + stack). Field donuts, category bars and gauge bands: that value of the field (the empty bucket is "Not entered"). Heat-map cell: activity + RYG. Custom chart: its group, plus its split.
- **Counting rule:** a Not-applicable part is its own bucket (`NA`) and is not also counted under its entry state. The state donut follows this rule, matching the stacked bars; before this work it counted such a part twice.
- **View parts:** while a filter is active, a list under the chips shows the matching parts (same filters and persona scope as the charts): Part No., Part Name, Activity (Overview only), Milestone, Section, Model, Dept, then the fields the Admin ticked as **Drill-down** for that activity (activity dashboards only; the Overview shows the standard columns because its rows come from different activities), Status, RYG and **Open →**, which opens that part's form in the Workspace (`/activities/:row?part=`). The first 25 rows are shown with the total and a "Show all" toggle. "Part list" and "Drill-down" ticks are independent.

**Assumptions, not confirmed with the client:**
- Department values are shown as stored. The mock data mixes categories (`A`, `AR`, `F`, `G`) with functions (`Electrical`, `Body`, `Engine`, `Chassis`, `Interior`), so a Department chart has both kinds of bar. No regrouping is done.
- The new default charts reach existing browsers through a persisted-data version bump (store `version` 5 to 6), which clears saved demo data once. In a real system a saved layout would be migrated or the defaults offered to Admin.
- Who may edit dashboards stays Admin, SIC and DPM.
- Date fields group by month; percent and number fields group into three bands; text fields are not groupable.
- Seed activities have both list-column ticks set on the fields that already had a dashboard role (22 fields), so the lists show something useful; Admin can change them.

**Overview heat map:** Cross-activity heatmap with activities on the Y-axis and Green/Yellow/Red/Grey (Awaiting MRD) counts on the X-axis. Stacked bars can group by vendor, model, department, milestone or section. Cells are clickable.

---

## 5. Approval Flow and RYG Rules

### 5.1 Approval State Machine

```
Draft ──[Vendor submits]──► Submitted
Submitted ──[PIC approves]──► Approved
Submitted ──[PIC edits field]──► Draft        (reopen for vendor to re-read)
Submitted ──[PIC sends back with comment]──► Sent back
Sent back ──[Vendor resubmits]──► Submitted
```

The state machine is implemented in `transitionEntry()` in `src/engine/index.ts`. The function checks that the persona performing the action is authorised by the flow step, then advances `currentStepIndex`, updates `validationState`, and appends to `entry.history`. The store's `transitionEntryState()` wraps this and persists.

### 5.2 RYG Calculation Rules (from slide 5 of the deck)

```
calculateRYG(resolvedDates, validationState, currentDate):
  if milestone MRD is blank          → Grey (Awaiting MRD, no RYG)
  if validationState === 'Approved'  → Green
  if currentDate > resolved end      → Red
  if (resolved end - currentDate) ≤ 7d → Yellow
  otherwise                          → Green
```

The 7-day Yellow window is the deck's stated rule. The function is a pure function testable without React. A console test suite runs on every page load (visible in the browser DevTools console) to verify boundary cases.

---

## 6. Integration Approach

### 6.1 How Mock Fetchers Map to Real Systems

The four mock fetchers in `src/mock/index.ts` simulate asynchronous lookups with a 500 ms delay and a 15 % random failure rate:

| Fetcher | Real system | Attribute examples used |
|---|---|---|
| `fetchFromEnovia(partNo)` | ENOVIA (CAD/PLM) | `drawing_status`, `classification`, `drawing_rev` |
| `fetchFromSap(partNo)` | SAP (ERP) | `part_category`, `smir_upload_status`, `spec_meeting_status` |
| `fetchFromEdoc(docNo)` | E-Doc (deviation management) | `deviation_status`, `deviation_approved`, `e_doc_closure_date` |
| `fetchFromRegApp(partNo)` | Regulatory App | `regulatory_cert_status`, `homologation_required` |

Each fetcher returns `{ ok: boolean; data: Record<string, any> }`. The UI in `PartDetailDrawer.tsx` maps each field's `source` value to the correct fetcher, shows a SourceBadge with the system name, and handles the `ok: false` case with a graceful "Not available" fallback and an option to enter the value manually (following the yellow note in slide 2 of the deck).

### 6.2 What a Real Adapter Would Need

To wire a real ENOVIA integration:
1. Replace `fetchFromEnovia()` with an `async` function that calls the real ENOVIA REST API (or a backend-for-frontend proxy) and maps API response fields to the same key names used in `attributeCatalogue.ts`.
2. Add authentication (token injection or OAuth flow) in the proxy layer — not in the React client.
3. Update the mock `AttributeCatalogueEntry` items for ENOVIA to use the real attribute key names so the field designer shows them correctly.
4. The `FieldDefinition.source === 'enovia'` convention, the SourceBadge rendering, the Refresh button, and the "last fetched" timestamp all remain unchanged.

The same pattern applies for SAP, E-Doc, and Regulatory App. The separation between field definition (domain) and fetch mechanics (mock/real adapter) is deliberate; the UI layer has zero knowledge of API URLs.

---

## 7. Design System Tokens

All tokens are CSS custom properties defined under `@theme {}` in `src/index.css` (Tailwind v4 CSS-first configuration).

**Look and feel:** the prototype follows the EPMP rapid prototype (`EPMP_RapidPrototype (1).html`): Inter 13px-dense UI, indigo sidebar (`#2d3394`) with pill navigation and EPMP logos, white 12px-radius cards on a peach-to-lavender page gradient, pale-blue table headers (`#edf3ff`), pill tab strips, bordered status badges with a leading dot, a gradient hero card, and the EPMP status palette. Section 7.2 and 7.3 values below are the EPMP values; 7.1 persona colours are unchanged.

### 7.1 Persona Colours

```css
--color-persona-pic:    #c4b5fd;  /* lavender  – from deck slide 2 legend */
--color-persona-vendor: #f97316;  /* orange    */
--color-persona-system: #3b82f6;  /* blue      */
--color-persona-admin:  #22c55e;  /* green     */
--color-persona-sic:    #a78bfa;
--color-persona-dpm:    #6366f1;
--color-persona-ddvm:   #8b5cf6;
--color-persona-dvm:    #7c3aed;
--color-persona-mc:     #0891b2;
```

### 7.2 RYG Colours

```css
--color-ryg-red:    #ef4444;  /* delayed     */
--color-ryg-yellow: #f59e0b;  /* at risk     */
--color-ryg-green:  #10b981;  /* completed   */
--color-ryg-grey:   #c6cdd9;  /* not started */
--color-on-track:   #3b82f6;
```

### 7.3 Surface / Border / Text

```css
--color-surface:    #f8f9fc;
--color-border:     #e8ebf1;
--color-text:       #101828;
--color-muted:      #667085;
--color-primary:    #2153f5;  /* alias: --color-accent */
--color-secondary:  #eff6ff;
--color-table-head: #edf3ff;
--color-nav-bg:     #2d3394;
--color-nav-active: #245bff;  /* active item gradient #245bff → #2d3394 */
```

### 7.4 Typography

Font stack: `Inter, -apple-system, Segoe UI, Roboto, sans-serif`.
Root size 15px so Tailwind `text-sm` ≈ 13px (EPMP body size). Page titles 23–25px semibold; all headings `font-semibold`.

### 7.5 Shared Components

Located in `src/components/` and re-exported from `src/components/index.ts`.

| Component | Purpose |
|---|---|
| `PersonaChip` | Coloured badge with persona label |
| `SourceBadge` | Shows field source system (ENOVIA, SAP, E-Doc, etc.) |
| `StatusPill` | Draft / Submitted / Sent back / Approved / Overdue |
| `RygDot` | Coloured circle with accessible title |
| `Card` | EPMP card (12px radius) with optional title, actions slot and `flush` mode for tables |
| `PageHeader` | EPMP breadcrumb + title + description + actions |
| `Button` | Primary / Secondary / Ghost / Danger variants, sm/md/lg sizes |
| `Modal` | Accessible dialog with Escape-key close, backdrop click close |
| `Drawer` | Full-height right-side panel |
| `Tabs` | Accessible tab bar |
| `FieldRenderer` | Registry-keyed form field; separate `editor` and `preview` renderers |

---

## 8. Open Questions and Next Steps toward Production

### 8.1 Open Questions (carried from the plan)

1. **Real attribute names in ENOVIA/SAP/E-Doc.** The mock catalogue uses plausible names. The real API attribute keys need to be confirmed with the systems team before the field designer can show real attributes.
2. **Management/Gate lane.** The deck's swimlane diagrams include a "Management" row on some activities. It is unclear whether this is a formal gate (a new `ApprovalStep` with a manager role) or an informational view. If formal, an additional persona and flow step are needed.
3. **Pending user/senior feedback notes.** Slide 1 notes "User and Seniors Feedbacks inclusion pending". These should be reviewed and incorporated into the activity definitions before any production use.
4. **Mizenboshi and client-specific terminology.** Several deck slides use terms specific to the client's process (Mizenboshi, SMIR, OTOP). Definitions need to be confirmed with users and added to the activity descriptions.

### 8.2 Next Steps toward Production

| Area | Work required |
|---|---|
| **Authentication** | Replace persona switcher with real SSO/JWT login; derive `currentPersona` from the token's role claim |
| **Backend** | Add a REST or GraphQL API for activities, entries, parts, and dashboards; remove Zustand `persist` and replace with API calls |
| **Real integrations** | Implement proxy adapters for ENOVIA, SAP, E-Doc, Regulatory App; replace mock fetchers |
| **Notification / email** | The deck notes email-based field capture (`source: mail`). Wire transation events to an email service |
| **File attachments** | Replace mock file upload with a real object store (S3, ENOVIA DMS, or SharePoint) |
| **Multi-tenancy / project scope** | Activities are currently global. Add a "Project" or "Model" scope so data is separated by vehicle programme |
| **Testing** | Add unit tests for pure engine functions (`calculateRYG`, `evaluateConditionalRules`, `transitionEntry`) and integration tests for the builder wizard |
| **Performance** | With large part lists (thousands of rows), virtualise the part list table (react-virtual or TanStack Virtual) |
| **Accessibility audit** | Full WCAG 2.1 AA audit; ensure all custom components pass axe-core |
| **i18n** | Japanese and other locale support if required for the client's team |

---

*Specification grounded in: `src/domain/index.ts`, `src/engine/index.ts`, `src/mock/index.ts`, `src/store/qaStore.ts`, and feature pages in `src/features/`.*

---

## 9. Section Templates and MRD-driven Dates

### 9.1 Ownership chain

| Who | Owns | Screen |
|---|---|---|
| Model Coordinator | Models and up to nine milestone MRD dates per model | `/models` |
| Admin | Activity definitions (fields and flow only, no dates); sections and milestone lists | `/builder`, `/settings` |
| Section Admin (one per section) | Template rows for that section | `/template` |
| PIC / Vendor | Filling and validating parts; see only items tagged to them | `/activities`, `/activities/:templateRowId` |

Parts (mock ingestion) carry model, vendor, PIC and a section (NP1–NP6, configurable). Identity is role-only: PIC, SIC and Section Admin are fixed to NP1, Vendor to Minda Industries (`getPersonaScope` in `src/store/personaStore.ts`).

### 9.2 Entities (from `src/domain/index.ts`)

```
MilestoneDef  { id, label, mandatory }        PP, MPP, Pilot, SOP mandatory; Jig, Kani, Weld, Engine, Assembly optional
Section       { id, label }                   NP1..NP6
ModelRecord   { name, mrds: {milestoneId: YYYY-MM-DD} }   a missing key = blank MRD
TemplateRow   { id, section, activityId, milestoneId, startOffset, endOffset }
              id = tpl-<section>-<activityId>-<milestoneId>
```

The same activity may appear under several milestones in one section (one row each). An entry belongs to one template row and one part: `entry-<templateRowId>-<partNo>`.

### 9.3 Date-resolution rule

```
MRD    = model.mrds[row.milestoneId]
if MRD is blank → Awaiting MRD (no dates, grey RYG)
start  = MRD + row.startOffset   (calendar days)
end    = MRD + row.endOffset
```

Offsets are written `MRD±X` (e.g. `PP-23` to `PP-4`). Dates are recalculated on every read, so editing an MRD or an offset moves every affected part immediately. This is implemented by `resolveInstanceDates` in `src/engine/index.ts`; `getFilteredData` yields one instance per part x template row.

### 9.4 Rules and assumptions

- Mandatory milestones (PP, MPP, Pilot, SOP) must have an MRD on every model and cannot be removed in Settings. A non-blocking warning appears when entered MRDs are out of chronological order.
- Template editing changes offsets only; to change an activity or milestone, duplicate the row and remove the old one.
- Deleting an activity, milestone, or section cascades to its template rows and entries.
- Assumed, not confirmed with the client: sections and milestone lists are maintained by Admin; there is no per-part date override; every template row applies to every part in its section.
- The demo "today" is fixed at 2026-10-15 (`DEMO_TODAY` in `src/features/scope.ts`) so seeded RYG states are stable. Baleno's MRDs are deliberately late so some NP1 items are Red.
- The persisted store version is bumped whenever the seed shape changes (currently 4); older local data is dropped on load.

### 9.5 PIC assignment and traceability

- **Source:** `PartRecord.pic` is the PIC ingested from SAP. It can be blank ("Unassigned").
- **Override:** SIC (and Admin) assign a PIC on `/pics` with a name, a type (Temporary or Permanent), an effective-from date and an optional reason. Each assignment is stored as a `PicAssignment` and never edited or deleted.
- **Resolution rule:** `getPicOn(part, assignments, date)` returns the latest assignment with `effectiveFrom <= date` (ties go to the later `assignedAt`), else the SAP PIC. A new assignment therefore replaces the previous PIC from its own date forward. Temporary versus Permanent is a label only; a Temporary PIC stays in force until replaced.
- **Who did what:** PIC actions on an entry are stamped with `HistoryLog.actorName`, the part's PIC on the action date. History without a stamp is attributed by date through the same rule (`buildActivityLog`). Work done by a temporary PIC therefore stays credited to them after a handover, and the new PIC only owns the remaining activities.
- **Report:** `/pics` has two tabs, Assignments and Who did what. The report has an actions-by-person summary and a filterable log (person, part) with time, role, action, activity, milestone and part.
- **Demo data:** part 84701-M55R10 has no SAP PIC; Karan Mehta covers it as Temporary from 1 Oct and Deepa Nair takes over as Permanent from 14 Oct. Part 35320-M68P00 is left unassigned.
- **Assumptions, not confirmed:** PIC identity is a free-text name (a real build would use SAP user ids); the persona is still role-only, so the "current PIC" shown is the part's PIC on the demo date rather than a logged-in user; SIC is fixed to NP1 like PIC, so it can assign PICs for NP1 parts only.

### 9.6 Part-level applicability (Not applicable)

- **Why:** a Section Admin applies an activity to every part in the section. Only the PIC knows which individual parts it does not fit (for example a plastic part on a sheet-metal activity).
- **Admin flag:** `ActivityDefinition.allowNotApplicable` (Builder, Basics step: "Allow PIC to mark parts Not applicable"; default off). Only activities with the flag show any marking control. The Activity library shows a "Part N/A allowed" column.
- **Marker:** `ActivityEntry.notApplicable = { reason?, by, byRole, at }`. The entry is created if the part has none yet. Marking and reversing append a `HistoryLog` line ("Marked Not applicable" / "Marked applicable again") with the actor name (the part's PIC for PIC actions), date and the optional reason.
- **Who can act:** only the PIC can mark (and only where the flag is on). PIC, SIC and Admin can reverse. The store action `setNotApplicable` enforces this itself, so every screen shares one rule.
- **Effect on an instance:** `getFilteredData` sets `ryg: 'NA'` and `notApplicable: true`. A Not-applicable part has no RYG, is never overdue, is not in any inbox, and takes precedence over Awaiting MRD. Its form is read-only and submit/validate are hidden until reversed.
- **Counts:** Not applicable is its own bucket next to Green, Yellow, Red and Awaiting MRD (donuts, stacked bars, heat-map "N/A" column, KPI `notApplicableCount`). Completion % is approved ÷ (total − Not applicable) (`completionPct`). The trend chart skips these parts.
- **If Admin turns the flag off later:** existing marks stay and can be reversed; only new marking is blocked.
- **Screens:**
  - Workspace: Applicability filter (`?applicability=applicable|na`), a bulk bar ("Mark Not applicable (n)" / "Mark applicable again (n)") with one optional reason, and a drawer banner showing who, when and why.
  - `/applicability` (PIC, SIC, Admin): matrix of parts (rows) by eligible activities (columns). Ticks are staged, then applied together with one optional reason; column and row toggles; filters for search, model, vendor and milestone; "—" where the activity does not apply to that part's section or type.
  - Dashboards: the Not-applicable bucket is a filter (status `NA`), and clicking it filters the dashboard in place and lists the parts in View parts (section 4.5).
  - Who did what: the marking lines appear with name and reason; an "Applicability changes only" filter isolates them.
- **Demo data:** see the README (Seed Data).
- **Assumptions, not confirmed with the client:** only the PIC may mark; completion excludes Not-applicable parts; a PIC may reverse after Approved; existing marks stay when the flag is turned off.

### 9.7 Efficient entry and validation (My Work, grids, CSV export, AI import placeholder)

- **Why:** the part form is one drawer per part per activity. A Vendor with many parts, or a PIC working through a section, needs to update many parts at different stages quickly.
- **My Work (`/mywork`):** Vendor, PIC, SIC and DPM (nav item, Home inbox link, Activities button). It groups instances by activity under a milestone, combined across sections, ordered by sent-back first, then worst RYG, then earliest end date. A role "enters first" for an activity when the first approval step belongs to the role and the role has at least one non-calculated field (`roleEntersFirst`). So the Vendor queue is pp-2, pp-10, mpp-1 and pilot-12; the PIC "To enter" queue is pp-1 and pilot-15; the "To validate" tab (PIC; the only view for SIC and DPM) lists Submitted items whose current step belongs to the role (`isWaitingForRole`). Not-applicable parts never appear.
- **Entry grid (`/mywork/:activityId/:milestoneId`):**
  - Rows are the role's in-scope parts for that activity and milestone, across sections; `?section=` pre-filters. Columns are context (part, model, section, due date with RYG, state), the fields the role enters, calculated fields (read-only), and a Row column.
  - Rules are not re-implemented: `gridModel.ts` calls `evaluateCalculatedFields` and `evaluateConditionalRules` and the shared `canPersonaEdit` (in `scope.ts`) per row. A hidden field shows `n/a`; a field that a rule makes mandatory is amber until filled; Submitted, Approved and Not-applicable rows are read-only with the reason.
  - Bulk aids: row selection, "Fill column" for the selected rows, per-column copy-down, Enter / Shift+Enter to move down / up a column.
  - **Save drafts** calls `updateEntryValues` for rows with edits and does not require mandatory fields. **Submit** (per row or "Submit all ready") calls `updateEntryValues` and then `transitionEntryState('Submit')`, only for rows that are open, have a value, and have no mandatory field empty. Incomplete rows are untouched and listed with the missing fields; nothing is partially submitted. A Vendor submit moves the entry to the PIC step as before.
  - File fields are not edited in the grid; the cell opens the part form (after saving that row's edits).
- **Import with AI (placeholder):** `AiImportPanel` gives a drop zone (any file type) and a paste box, role-aware wording, and the safety rules. Import only reports what was picked and that AI mapping is not part of this prototype. `AiReviewIllustration` is a modal marked "Illustration only" with fixed sample rows (source text, part, field, current, proposed, confidence, accept / edit / reject), a confidence threshold, a skipped list, a live "AI-filled" flag that clears on edit, and a tick box that gates **Confirm and submit** and **Edit and submit**; **Save as draft** is always available. No button saves or submits. Full behaviour is specified in `../user-stories.md` (AI-1, AI-2).
- **Validation grid (`?mode=validate`):**
  - Lists Submitted rows whose current approval step belongs to the role. `gridModel.ts` runs in `'validate'` mode: a row is "ready" when no visible mandatory field of the validating role's own is empty (`validatingRole`), and the lock reason is lifted for rows waiting on the role.
  - The role's own fields are editable in the row and saved with `updateEntryValues` ("Save PIC edits"); other roles' columns are read-only and labelled "(vendor)" or "(system)".
  - **Approve selected** uses `splitApprovable`: ready rows get `transitionEntryState('Approve')`, rows with required PIC fields empty are skipped and listed. **Send back selected** requires a written reason, recorded in each row's history. A confirm dialog precedes both; nothing is pre-ticked. A SIC or DPM cannot approve a row whose required PIC fields are empty.
- **CSV export:** `gridExport.ts` builds CSV from the rows shown (section filter and Hide locked apply) with the same columns as the table; `csv.ts` quotes, prefixes `'` to cells starting `= + - @`, and the download adds a UTF-8 BOM. File name: `activity_milestone_role_mode_date.csv`. One-way; no `.xlsx`, no new dependency.
- **Assumptions, not confirmed with the client:** the validation grid is for Submitted rows waiting on the role; bulk Approve is stricter than the part form (it skips rows with empty required PIC fields); bulk Send back needs a reason; SIC and DPM validate only; export is CSV and one-way, and the AI placeholder is the only import path; AI never proposes approve, edit or send-back decisions.

