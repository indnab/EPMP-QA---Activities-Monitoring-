#!/usr/bin/env python3
"""
Generate src/mock/activityBlueprints.ts from "QA Activity Builder Field Validations.xlsx".

Reads the single sheet (Trial | Activity | Field | Values / format | Remarks | Entered by | Source),
forward-fills Trial and Activity, and maps every row onto the app's FieldDefinition via the existing DSL
(f()/blueprint()). Rows the rules had to guess on are written to tools/gen_blueprints.review.txt.
"""
import re, sys, json, collections
import openpyxl

XLSX = sys.argv[1]
OUT_TS = sys.argv[2]
OUT_REVIEW = sys.argv[3]

# ── helpers ──────────────────────────────────────────────────────────────────
def clean(c):
    return "" if c is None else str(c).replace('\r', '').strip()

def one_line(s):
    return re.sub(r'\s+', ' ', s.replace('\n', ' ')).strip()

def snake(label):
    s = label.lower()
    s = re.sub(r'\*+', '', s)
    s = re.sub(r'\(.*?\)', ' ', s)          # drop parentheticals for the key
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    s = s[:48] or 'field'
    return ('f_' + s) if s[0].isdigit() else s

TRIAL_PREFIX = {'PP': 'pp', 'MPP': 'mpp', 'Pilot/SOP': 'pilot'}

# Stable activity ids. The app's seed entries, template rows, engine rules and client dashboards key off these,
# so ids are preserved from the previous blueprint set (matched by trial + activity name) instead of being
# renumbered positionally. Genuinely new activities get fresh ids.
STABLE_IDS = {
    ('PP', 'Parts drawing confirmation in IBOM'): 'pp-1',
    ('PP', 'Spec meeting confirmation – OE & accessory parts'): 'pp-2',
    ('PP', 'SOR sharing and confirmation of SOR points'): 'pp-3',
    ('PP', 'Tier-2 compilation (Red and New assessment check)'): 'pp-4',
    ('PP', 'New Tier-2 assessment confirmation'): 'pp-5',
    ('PP', 'Newness confirmation – Mizenboshi status'): 'pp-6a',
    ('PP', 'Newness confirmation – Process benchmarking status'): 'pp-6b',
    ('PP', 'DMU data study status (ECR status)'): 'pp-7',
    ('PP', 'SES NR status (drawing study + ECR initiation)'): 'pp-8',
    ('PP', 'OT status'): 'pp-9',
    ('PP', 'Sheet metal part accuracy status'): 'pp-10',
    ('PP', 'Part inspection with deviation status'): 'pp-11',
    ('PP', 'MISP approval & uploading status'): 'pp-12',
    ('PP', 'Lab testing status'): 'pp-13',
    ('PP', 'BCF status (Body Checking Fixture)'): 'pp-14',
    ('PP', 'Colour parts check – Testing'): 'pp-15a',
    ('PP', 'Colour parts check – Colour comparison'): 'pp-15b',
    ('PP', 'Parts list with deviations & special parts list'): 'pp-16',
    ('MPP', 'OTOP status'): 'mpp-1',
    ('MPP', 'PP Hinkai trial closure status – QAND & Production'): 'mpp-5',
    ('MPP', 'SOR adherence confirmation (Div Head deviation via E-Doc)'): 'mpp-6',
    ('MPP', 'Lab testing status'): 'mpp-7',
    ('MPP', 'Process audit status'): 'mpp-8',
    ('MPP', 'Process capability (critical parameters)'): 'mpp-9',
    ('MPP', 'Homologation marking confirmation'): 'mpp-10',
    ('MPP', 'Set part / semi-finished part status'): 'mpp-11',
    ('MPP', 'MISP revision status'): 'mpp-12',
    ('MPP', 'Spare kit part status'): 'mpp-13',
    ('MPP', 'Parts list with deviations & special parts list'): 'mpp-14',
    ('Pilot/SOP', 'OTOP status (ECN cases)'): 'pilot-1',
    ('Pilot/SOP', 'Sheet metal part accuracy status'): 'pilot-2',
    ('Pilot/SOP', 'Part inspection with deviation status (ECN cases)'): 'pilot-3',
    ('Pilot/SOP', 'MISP revision status'): 'pilot-17',               # NEW in the Excel
    ('Pilot/SOP', 'MPP Hinkai trial closure status – QAND & Production'): 'pilot-4',
    ('Pilot/SOP', 'BCF status (Body Checking Fixture)'): 'pilot-5',
    ('Pilot/SOP', 'PPVT confirmation'): 'pilot-6',
    ('Pilot/SOP', 'PPAP file approval status'): 'pilot-7',
    ('Pilot/SOP', 'Lab testing status'): 'pilot-8',
    ('Pilot/SOP', 'Homologation marking confirmation (camera inspection)'): 'pilot-9',
    ('Pilot/SOP', 'List of limit samples for applicable parts'): 'pilot-10',
    ('Pilot/SOP', 'IFM mail initiation and checklist completion'): 'pilot-11',
    ('Pilot/SOP', 'SOP Readiness Confirmation from Supplier'): 'pilot-12',   # was "Are you ready? (SOP readiness)"
    ('Pilot/SOP', 'Part updation in Regulatory App'): 'pilot-14',
    ('Pilot/SOP', 'Part updation in SMIR system'): 'pilot-15',
    ('Pilot/SOP', 'Part updation in CPM portal'): 'pilot-16',
    ('Pilot/SOP', 'PPVT confirmation – Vendor PPVT details'): 'pilot-18',   # NEW in the Excel
}


# ── type inference ───────────────────────────────────────────────────────────
PROTECT = ["N/A", "A/AR"]   # tokens whose "/" is part of the value, not a separator
def split_options(txt):
    """Options separated by newlines, ' / ', ' | ', or ' · '. Returns list or None if it doesn't look like options."""
    raw = txt.replace('\r', '')
    for tok in PROTECT: raw = raw.replace(tok, tok.replace('/', '\u2044'))
    # strip a leading instruction line ("Drop down ...:", "For NG case, choose one or multiple:")
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    if len(lines) >= 2 and (lines[0].endswith(':') or lines[0].lower().startswith(('drop', 'for ng'))):
        lines = lines[1:]
    if len(lines) >= 2:
        parts = lines
    else:
        t = one_line(raw)
        t = re.sub(r'^(Drop ?down( along with Remarks \(free text\) \))?:?\s*)', '', t, flags=re.I)
        t = t.split('\u00b7')[0] if t.count('\u00b7') == 1 and '/' not in t else t
        t = re.sub(r'\(.*?\)', '', t)
        parts = [p for p in re.split(r'\s*/\s*|\s*\|\s*|\s*,\s*|\s+\u00b7\s+', t)]
    parts = [re.sub(r'\s+', ' ', p).strip(' .,;').replace('\u2044', '/') for p in parts]
    parts = [p for p in parts if p]
    seen_o = set(); parts = [p for p in parts if not (p in seen_o or seen_o.add(p))]   # drop duplicate options
    return parts if len(parts) >= 2 else None

YESNO = re.compile(r'^(y\s*/\s*n|yes\s*/\s*no)(\b|$)', re.I)

def infer(values, remarks, label):
    """Return (type, options|None, note|None)."""
    raw_values = values
    v = one_line(values)
    r = one_line(remarks).lower()
    vl = v.lower()

    if '(table field' in vl:
        return 'text', None, None  # grouped into one table field by the caller
    if not v:
        # blank format: guess from the label
        L = label.lower()
        if 'date' in L: return 'date', None, 'blank format; guessed date from label'
        if any(w in L for w in ('count', 'number of', 'total', 'no. of')): return 'number', None, 'blank format; guessed number from label'
        return 'text', None, 'blank format; defaulted to text'
    if YESNO.match(v): return 'yesNo', None, None
    if vl.startswith('drop'):
        o = split_options(raw_values)
        if o: return 'dropdown', o, None
    if vl.startswith('file'): return 'file', None, None
    if vl.startswith('flag'): return 'flag', None, None
    if 'choose one or multiple' in vl:
        opts = split_options(raw_values)
        return 'multiSelect', opts, None if opts else 'multiSelect without parsable options'
    if vl.startswith('date') or vl in ('target date',) or vl.startswith('date '):
        return 'date', None, None
    if vl in ('number', 'count') or vl.startswith('count') or vl.startswith('number'): return 'number', None, None
    if vl in ('%', 'percent', 'percentage', '1', '100%') or 'percent' in vl: return 'percent', None, None
    if vl.startswith('text') or vl in ('remarks', 'remark', 'details', 'description', 'free text') or vl.startswith('free text'):
        return ('longText' if any(w in vl or w in re.split(r'\s[–-]\s', label.lower())[-1] for w in ('remark', 'detail', 'description', 'observation', 'reason', 'action')) else 'text'), None, None
    if vl in ('same as above', 'same as pp - count', 'activity list') or vl.startswith('same as'):
        return 'text', None, f'format "{v}" is a reference; defaulted to text'
    opts = split_options(raw_values)
    if opts:
        return 'dropdown', opts, None
    return 'text', None, f'unrecognised format "{v}"; defaulted to text'

# ── persona / source mapping ─────────────────────────────────────────────────
def map_entered_by(eb):
    e = one_line(eb).lower()
    if not e: return 'PIC', 'blank "Entered by"; defaulted to PIC'
    if e.startswith('admin') or 'super admin' in e: return 'Admin', None
    if e.startswith('system'): return 'System', None
    if 'vendor' in e and 'pic' in e: return 'Vendor', 'Vendor & PIC both enter; modelled as Vendor entry + PIC validation'
    if e.startswith('vendor'): return 'Vendor', None
    if e.startswith('pic'): return 'PIC', None
    if 'option' in e:
        # e.g. "Option1 - PIC / Option 2 - Bot (Via IBOM)": first option is the human-entry path
        if 'pic' in e: return 'PIC', 'Option-style Entered by; modelled as PIC (alternate path is system)'
        return 'System', 'Option-style Entered by; modelled as System'
    return 'PIC', f'unrecognised Entered by "{eb}"; defaulted to PIC'

def map_source(src, entered_by):
    s = one_line(src).lower()
    if not s: return ('manual' if entered_by != 'System' else 'calculated'), None
    if 'calculated' in s or 'from source activity' in s or 'auto' in s and 'fetch' not in s: return 'calculated', None
    if 'enovia' in s: return 'enovia', None
    if 'sap' in s: return 'sap', None
    if 'e-doc' in s or 'edoc' in s: return 'edoc', None
    if 'lms' in s or 'ibom' in s or 'bot' in s or 'colour master' in s: return 'mapping', None
    if 'upload' in s: return 'upload', None
    if 'dropdown' in s or 'admin' in s: return 'dropdown', None
    if 'regulatory' in s: return 'regapp', None
    if 'part intake' in s or 'manual' in s or 'form' in s: return 'manual', None
    return 'manual', f'unrecognised Source "{src}"; defaulted to manual'


# Targeted overrides where the spreadsheet's "Values / format" is a rule/description rather than a type.
# (trial, activity-substring, label-substring) -> dict(t=..., src=..., by=..., o=[...])
OVERRIDES = [
    ('PP', 'Spec meeting', 'Spec Meeting Not Applicable', dict(t='flag', src='calculated')),
    ('PP', 'Spec meeting', 'Data Update Pending', dict(t='flag', src='calculated')),
    ('PP', 'Sheet metal part accuracy', 'OK parameters', dict(t='number')),
    ('PP', 'Sheet metal part accuracy', 'Accuracy %', dict(t='percent')),
    ('PP', 'Sheet metal part accuracy', 'Sheet Metal Applicability', dict(t='yesNo')),
    ('Pilot/SOP', 'Sheet metal part accuracy', 'Accuracy target', dict(t='percent', src='calculated')),
    ('Pilot/SOP', 'Sheet metal part accuracy', 'Accuracy achieved', dict(t='percent')),
    ('Pilot/SOP', 'Sheet metal part accuracy', 'Deviation / closure status',
        dict(t='dropdown', o=['Accept', 'Pending', 'Reject', 'Open', 'Closed'])),
    ('MPP', 'OTOP status', 'Non OTOP Breakup', dict(t='dropdown', o=['Tool Not Ready', 'Process Not Ready', 'Tool & Process Not Ready'])),
    ('Pilot/SOP', 'PPVT confirmation – Vendor PPVT', 'SC', dict(by='Vendor')),
]
def apply_override(trial, act, label, ftype, opts, eb, srcm):
    for t, a, l, d in OVERRIDES:
        if t == trial and a.lower() in act.lower() and l.lower() in label.lower():
            return d.get('t', ftype), d.get('o', opts), d.get('by', eb), d.get('src', srcm)
    return ftype, opts, eb, srcm



# ── Extended overrides (exact label '=…' or substring '~…'; activity is a substring match) ─────────────────
# Keys: t=type, o=options, by=entered by, src=source, cols=table columns, label=display label, skip=drop the row.
def C(key, label, typ, opts=None, eb=None): return dict(key=key, label=label, type=typ, options=opts, eb=eb)
REASON_DELAY = ['SC approval pending', 'SC approved, vendor implementation pending', 'All approvals in, delay by vendor']
OVERRIDES2 = [
    ('Pilot/SOP', 'PPVT confirmation', '=PPVT MSIL Scope Planned Date Actual Date', dict(t='text', label='PPVT MSIL scope – planned / actual date (if not completed)')),
    ('PP', 'Tier-2 compilation', '=Tier-2 status', dict(t='dropdown', o=['R', 'Y', 'G'])),
    ('PP', 'Process benchmarking', '=Newness type', dict(t='dropdown', o=['New Technology / New Design', 'New Vendor', 'Existing vendor New part category', 'New Process', 'New Plant', 'New Material', 'Localization', 'Others'])),
    ('PP', 'OT status', '=Tool Cutting Status', dict(o=['Started', 'Completed'])),
    ('PP', 'OT status', '=Tool Assembly Status', dict(o=['Started', 'Completed'])),
    ('PP', 'OT status', '=Tool Trial Status', dict(t='dropdown', o=['Done', 'Pending'], by='System', src='calculated')),
    ('PP', 'Lab testing', '=Retest log', dict(t='longText')),
    ('PP', 'Parts list with deviations', '=Deviation list', dict(t='longText')),
    ('MPP', 'Parts list with deviations', '=Deviation list', dict(t='longText')),
    ('MPP', 'PP Hinkai', '=Hinkai Details', dict(t='longText')),
    ('MPP', 'PP Hinkai', '=Attachment', dict(t='file')),
    ('MPP', 'PP Hinkai', '=Hinkai Assigned to Vendor', dict(o=['Replied by vendor', 'Pending for reply by vendor'], src='calculated')),
    ('MPP', 'PP Hinkai', '=Count of overdue', dict(t='number', src='calculated')),
    ('Pilot/SOP', 'MPP Hinkai', '=Count of overdue', dict(t='number', src='calculated')),
    ('MPP', 'SOR adherence', '=Agree', dict(t='number', src='calculated')),
    ('MPP', 'SOR adherence', '=Disagreed', dict(t='number', src='calculated')),
    ('MPP', 'SOR adherence', '=Implemented break-up', dict(skip='section heading with truncated value ("Agreed ·"); covered by the two Implemented count fields')),
    ('MPP', 'Process audit', '=Audit completed / pending', dict(t='dropdown', o=['Completed', 'Pending'], src='calculated')),
    ('MPP', 'Homologation', '=Reason for delay', dict(o=REASON_DELAY)),
    ('Pilot/SOP', 'Homologation', '=Reason for delay', dict(o=REASON_DELAY)),
    ('Pilot/SOP', 'PPAP file', '=PPAP applicability', dict(t='yesNo', src='calculated')),
    ('Pilot/SOP', 'Regulatory App', '=Applicability', dict(t='yesNo', src='calculated')),
    ('Pilot/SOP', 'IFM mail', '=If N, readiness remark', dict(t='table', label='If N – readiness details', cols=[
        C('header', 'Header', 'dropdown', ['Man', 'Material', 'Method', 'Machine'], 'PIC'),
        C('remarks', 'Remarks', 'longText', None, 'PIC'),
        C('action_plan', 'Action plan', 'longText', None, 'Vendor'),
        C('target_date', 'Target date', 'date', None, 'Vendor')])),
    ('Pilot/SOP', 'PPVT confirmation', '=PPVT NG Reason', dict(t='table', label='PPVT NG reason details', cols=[
        C('reason_category', 'Reason category', 'dropdown', ['Capacity', 'Quality', 'Both']),
        C('concern', 'Concern', 'longText'), C('capacity_observed', 'Capacity observed', 'number'),
        C('shortage_per_day', 'Shortage per day', 'number'), C('rejection_pct', 'Rejection %', 'number'),
        C('action_plan', 'Action plan', 'longText'), C('target_date', 'Target date', 'date')])),
    ('Pilot/SOP', 'Vendor PPVT details', '=PIC', dict(t='text', by='System')),
    ('Pilot/SOP', 'Vendor PPVT details', '=Part No', dict(t='text', by='System')),
    ('Pilot/SOP', 'Vendor PPVT details', '=VENDOR', dict(t='text', by='System', label='Vendor')),
    ('Pilot/SOP', 'Vendor PPVT details', '=PPVT OK / NG Details', dict(t='dropdown', o=['OK', 'NG'], label='PPVT OK / NG')),
    ('Pilot/SOP', 'Vendor PPVT details', '=Capacity NG Action Plan', dict(t='longText')),
    ('Pilot/SOP', 'Vendor PPVT details', '=Quality NG Action Plan', dict(t='longText')),
    ('Pilot/SOP', 'Vendor PPVT details', '~Current Status', dict(t='longText')),
    ('Pilot/SOP', 'Vendor PPVT details', '=Capacity NG Countermeasure Category', dict(t='text')),
    ('Pilot/SOP', 'Vendor PPVT details', '=Quality NG Concern Category', dict(t='text')),
    ('Pilot/SOP', 'Vendor PPVT details', '=Broad Quality Countermeasure Category', dict(t='text')),
    ('Pilot/SOP', 'SOP Readiness', '=Part category', dict(o=['A', 'AR', 'A/AR', 'G', 'F'])),
    ('Pilot/SOP', 'SOP Readiness', '~Shelf Life Details', dict(t='longText')),
    ('Pilot/SOP', 'SOP Readiness', '~Non-usable Parts Disposal', dict(t='longText')),
    ('Pilot/SOP', 'SOP Readiness', '~Tool Readiness Remarks', dict(t='longText')),
]
def find_override2(trial, act, label):
    for t, a, l, d in OVERRIDES2:
        if t != trial or a.lower() not in act.lower(): continue
        if l.startswith('=') and l[1:].lower() == label.lower(): return d
        if l.startswith('~') and l[1:].lower() in label.lower(): return d
    return {}
# Rows the sheet says should be "multi line rows in table format" -> one table field each.
TABLE_GROUPS = [
    ('PP', 'DMU data study', 'dmu_observations_table', 'DMU observations (multi-row)', [
        ('Observation Status', 'Observation status', 'dropdown', ['Open', 'Close', 'Reject']),
        ('Open (Target Date)', 'Open – target date', 'date', None),
        ('Closed (Accept/ Reject)', 'Closed – accept / reject', 'dropdown', ['Accept', 'Reject']),
        ('Reject Reason', 'Reject reason', 'longText', None)]),
    ('PP', 'Process benchmarking', 'observations_table', 'Observations (multi-row)', [
        ('Observations', 'Observation', 'dropdown', ['Agree', 'Disagree']),
        ('Target Date for implementation for agreed items', 'Target date for implementation (agreed items)', 'date', None),
        ('Implemented/ Not Implementd', 'Implemented / Not implemented', 'dropdown', ['Implemented', 'Not implemented'])]),
]
TABLE_LABELS = {'SOR sharing': 'SOR points table', 'Process capability': 'Critical parameter details table'}
DEDUPE = {('MPP', 'Lab testing status', x) for x in ('deviation raised (pop-up)', 'e-doc number', 'deviation approval status')}   # block listed twice in the sheet
# Display-label normalisation: sentence case for generic words; same option sets are written in one canonical order.
LOWER_WORDS = {'Status', 'Date', 'Dates', 'Type', 'Category', 'Count', 'Details', 'Remark', 'Remarks', 'Reason', 'Score',
               'Plan', 'Number', 'Name', 'Code', 'Input', 'Information', 'Evidence', 'Attachment', 'Observation',
               'Observations', 'Result', 'Action', 'Verification', 'Approval', 'Submission', 'Testing', 'Issue', 'Table'}
PROPER = {'No', 'Hinkai', 'Mizenboshi', 'Enovia', 'ENOVIA', 'Tier', 'Annexure', 'Poka-yoke', 'Re-PPVT', 'E-Doc', 'Colour'}
TYPOS = [('Bechmarking', 'Benchmarking'), ('Implementd', 'Implemented'), ('diagreed', 'disagreed'), ('Testings', 'Testing'),
         ('Assembly Status Planned End Date', 'Assembly Planned End Date'), ('NON OT', 'Non-OT'), ('PART NAME', 'Part name'), ('VENDOR', 'Vendor')]
def normalize_label(label):
    for a, b in TYPOS: label = label.replace(a, b)
    """Sentence case: capitalise the first word of each ' – ' segment / bracket, lower-case other Title Case words
    (acronyms, hyphenated names, numbers and proper nouns are left alone)."""
    label = re.sub(r'\(\s+', '(', re.sub(r'\s+\)', ')', re.sub(r'\s+', ' ', label))).strip()
    out = []; start = True
    for w in label.split(' '):
        if w in ('–', '-', '/', '&'):
            out.append(w); start = (w == '–'); continue
        core = w.lstrip('(')
        keep = (not core) or core.isupper() or any(c.isdigit() for c in core) or '-' in core or '/' in core or core in PROPER
        if start or keep or not core[0].isupper():
            nw = w
            if start and core:
                i = len(w) - len(core); nw = w[:i] + core[:1].upper() + core[1:]
        else:
            i = len(w) - len(core); nw = w[:i] + core[:1].lower() + core[1:]
        out.append(nw)
        start = w.startswith('(') and False
    return ' '.join(out)
CANON_OPTS = [
    ['Approved', 'Pending', 'Rejected'],
    ['Approved', 'Pending', 'Rejected', 'In progress'],
]
def canon_options(opts):
    if not opts: return opts
    for c in CANON_OPTS:
        if sorted(opts) == sorted(c): return list(c)
    return opts
# Presentation flags carried forward from the previous blueprint set (not part of the spreadsheet).
# (activityId, fieldKey) -> dash (show on dashboard) / list (show in part list)
FLAGS = json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'blueprint_flags.json')))

# ── main ─────────────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb.worksheets[0]
rows = []
trial = act = None
for r in ws.iter_rows(min_row=2, values_only=True):
    if not any(c is not None for c in r): continue
    t, a, f, v, rem, eb, src = [clean(c) for c in r[:7]]
    if t: trial = t
    if a: act = a
    if not f: continue
    rows.append(dict(trial=trial, activity=act, field=f, values=v, remarks=rem, eb=eb, src=src))

# Group by (trial, activity) preserving order
groups = collections.OrderedDict()
for r in rows:
    groups.setdefault((r['trial'], r['activity']), []).append(r)

review = []
counters = collections.defaultdict(int)
activities = []
for (trial, act), frs in groups.items():
    prefix = TRIAL_PREFIX.get(trial, snake(trial))
    counters[prefix] += 1
    act_id = STABLE_IDS.get((trial, act))
    if act_id is None:
        act_id = f"{prefix}-{100 + counters[prefix]}"
        review.append(f"[{trial} | {act}] NOT in STABLE_IDS; assigned provisional id {act_id}")
    # NB: the activity id must be unique; mpp/pilot numbering is positional within the trial.
    # de-duplicate rows that the sheet repeats under the same activity (keep first position, last definition)
    uniq = []; pos = {}
    for fr in frs:
        lk = re.sub(r'\*+$', '', fr['field']).strip().lower()
        if (trial, act, lk) in DEDUPE and lk in pos:
            uniq[pos[lk]] = fr
            review.append(f"[{trial} | {act}] {lk}: repeated in the sheet; merged into one field")
            continue
        pos[lk] = len(uniq); uniq.append(fr)
    frs = uniq
    groups_here = [g for g in TABLE_GROUPS if g[0] == trial and g[1].lower() in act.lower()]
    grp_rows = {}
    seen = collections.Counter()
    fields = []
    table_cols = []          # rows tagged "(Table Field N)" become columns of ONE table field
    table_anchor = None      # index in `fields` where the table field should appear
    for fr in frs:
        lab0 = re.sub(r'\*+$', '', fr['field']).strip()
        grp = next((g for g in groups_here if lab0.lower() in [x[0].lower() for x in g[4]]), None)
        if grp is not None:
            ceb, _n = map_entered_by(fr['eb'])
            spec = next(x for x in grp[4] if x[0].lower() == lab0.lower())
            if grp[2] not in grp_rows:
                grp_rows[grp[2]] = dict(anchor=len(fields), cols=[], eb=ceb, grp=grp)
            grp_rows[grp[2]]['cols'].append(dict(key=snake(spec[1]), label=spec[1], type=spec[2], options=spec[3], eb=ceb))
            continue
        mt = re.search(r'\(table field\s*(\d+)\)', fr['values'], re.I) or re.search(r'\(table field\s*(\d+)\)', fr['field'], re.I)
        if mt:
            ctype, copts, _ = infer(re.sub(r'\(table field\s*\d+\)', '', fr['values'], flags=re.I), fr['remarks'], fr['field'])
            if ctype not in ('text', 'longText', 'number', 'date', 'dropdown'): ctype = 'text'
            ceb, _n = map_entered_by(fr['eb'])
            clab = normalize_label(one_line(re.sub(r'\(table field\s*\d+\)', '', re.sub(r'\*+$', '', fr['field']), flags=re.I)).strip())
            col = dict(key=snake(clab), label=clab, type=ctype, options=copts, eb=ceb)
            table_cols.append((int(mt.group(1)), col, fr))
            if table_anchor is None: table_anchor = len(fields)
            continue
        label = one_line(re.sub(r'\*+$', '', fr['field']).strip())
        if 'table row per point' in fr['values'].lower():
            review.append(f"[{trial} | {act}] {label}: 'table row per point' row folded into the details table (skipped as a scalar)")
            continue
        key = snake(label)
        seen[key] += 1
        if seen[key] > 1: key = f"{key}_{seen[key]}"
        ftype, opts, note1 = infer(fr['values'], fr['remarks'], label)
        eb, note2 = map_entered_by(fr['eb'])
        srcm, note3 = map_source(fr['src'], eb)
        ftype, opts, eb, srcm = apply_override(trial, act, label, ftype, opts, eb, srcm)
        ov = find_override2(trial, act, label)
        if ov.get('skip'):
            review.append(f"[{trial} | {act}] {label}: dropped - {ov['skip']}")
            continue
        ftype = ov.get('t', ftype); opts = ov.get('o', opts); eb = ov.get('by', eb); srcm = ov.get('src', srcm)
        if ftype not in ('dropdown', 'multiSelect'): opts = None if 'o' not in ov else opts
        opts = canon_options(opts)
        disp = ov.get('label') or ('Deviation approval status' if label.lower() == 'deviation status' else normalize_label(label))
        mandatory = fr['field'].rstrip().endswith('*') and not fr['field'].rstrip().endswith('**')
        vendor_entered_validated = (eb == 'Vendor') or ('vendor' in fr['eb'].lower() and 'pic' in fr['eb'].lower())
        fields.append(dict(k=key, l=disp, t=ftype, o=opts, by=eb, src=srcm, val=vendor_entered_validated, req=mandatory,
                           vals=one_line(fr['values']), rem=one_line(fr['remarks']), cols=ov.get('cols')))
        for n in (note1, note2, note3):
            if n: review.append(f"[{trial} | {act}] {label}: {n}")
    for tkey, gr in sorted(grp_rows.items(), key=lambda kv: -kv[1]['anchor']):
        g = gr['grp']
        fields.insert(gr['anchor'], dict(k=tkey, l=g[3], t='table', o=None, by=gr['eb'], src='manual', val=(gr['eb'] == 'Vendor'), req=False,
                                         vals='table', rem='', cols=gr['cols']))
        review.append(f"[{trial} | {act}] grouped {len(gr['cols'])} rows ('multi line rows in table format') into table field '{g[3]}'")
    if table_cols:
        table_cols.sort(key=lambda x: x[0])
        first_fr = table_cols[0][2]
        eb, _n = map_entered_by(first_fr['eb'])
        tfield = dict(k='details_table', l=next((v for k, v in TABLE_LABELS.items() if k.lower() in act.lower()), 'Details table'),
                      t='table', o=None, by=eb, src='manual', val=(eb == 'Vendor'), req=False,
                      vals='table', rem='', cols=[c for _, c, _fr in table_cols])
        fields.insert(table_anchor if table_anchor is not None else len(fields), tfield)
        review.append(f"[{trial} | {act}] grouped {len(table_cols)} '(Table Field N)' rows into one table field with {len(table_cols)} columns")
    # Fields that share a label inside one activity get distinct, meaningful labels.
    orig = [fd['l'].lower() for fd in fields]
    cnt = collections.Counter(orig)
    anchor = None
    for i, fd in enumerate(fields):
        lab = orig[i]
        if cnt[lab] <= 1:
            anchor = fd['l']; continue
        adj = (i > 0 and orig[i - 1] == lab) or (i + 1 < len(fields) and orig[i + 1] == lab)
        if adj:
            v = fd.get('vals', '').lower()
            desc = 'target date' if ('target' in v or fd['t'] == 'date') else 'remarks' if 'remark' in v else 'details' if 'detail' in v else 'status' if fd['t'] in ('dropdown', 'yesNo') else 'details'
            base = re.sub(r'\s+with target date', '', fd['l'], flags=re.I)
            new = base if (desc in ('remarks', 'details') and base.lower().rstrip('s').endswith(desc.rstrip('s'))) else f"{base} – {desc}"
            if desc == 'target date' and not base.lower().endswith('target date'): new = f"{base} – target date"
        else:
            new = f"{anchor} – {fd['l']}" if anchor else fd['l']
        review.append(f"[{trial} | {act}] repeated label '{fd['l']}' renamed '{new}'")
        fd['l'] = new
    for fd in fields:
        fl = FLAGS.get(f"{act_id}|{fd['k']}")
        if fl:
            fd['dash'] = fl.get('dash', False); fd['list'] = fl.get('list', False)
    activities.append(dict(id=act_id, trial=trial, name=act, fields=fields))

# ── emit TypeScript (existing DSL) ───────────────────────────────────────────
def ts(s): return json.dumps(s, ensure_ascii=False)

def emit_field(f):
    parts = [f"k: {ts(f['k'])}", f"l: {ts(f['l'])}"]
    if f['t'] != 'text': parts.append(f"t: {ts(f['t'])}")
    if f['o']: parts.append(f"o: {json.dumps(f['o'], ensure_ascii=False)}")
    parts.append(f"by: {ts(f['by'])}")
    if f['src'] != 'manual': parts.append(f"src: {ts(f['src'])}")
    if f.get('cols'):
        cols = ", ".join(
            "{ key: %s, label: %s, type: %s%s%s }" % (
                ts(c['key']), ts(c['label']), ts(c['type']),
                (", options: " + json.dumps(c['options'], ensure_ascii=False)) if c.get('options') else "",
                (", enteredBy: " + ts(c['eb'])) if c.get('eb') and c['eb'] != f['by'] else "")
            for c in f['cols'])
        parts.append("cols: [" + cols + "]")
    if f['val']: parts.append("val: true")
    if f['req']: parts.append("req: true")
    if f.get('dash'): parts.append("dash: true")
    if f.get('list'): parts.append("list: true")
    return "      { " + ", ".join(parts) + " }"

by_trial = collections.OrderedDict()
for a in activities: by_trial.setdefault(a['trial'], []).append(a)

lines = []
lines.append("""/**
 * AUTO-GENERATED by tools/gen_blueprints.py from "QA Activity Builder Field Validations.xlsx".
 * Do not hand-edit the field lists below — change the spreadsheet and regenerate. Rows the generator had to
 * guess on are listed in tools/gen_blueprints.review.txt.
 * PP01–PP05, PP10, PP11 are then overridden by the hand-maintained src/mock/ppFieldConfig.ts (JSON export).
 *
 * Trial -> prefix: PP -> pp-N, MPP -> mpp-N, Pilot/SOP -> pilot-N (N = order within the trial in the sheet).
 */
import type { ActivityDefinition, FieldDefinition, FieldType, FieldSource, TableColumn, ApprovalFlow, ConditionalRule } from '../domain'
import type { PersonaId } from '../store/personaStore'
import { PP_FIELD_CONFIG } from './ppFieldConfig'

type Enter = PersonaId | 'System'

/** Terse field spec. */
interface FSpec {
  k: string            // key
  l: string            // label
  t?: FieldType        // type (default text)
  o?: string[]         // options (dropdown/multiSelect)
  cols?: TableColumn[] // table columns
  by?: Enter           // enteredBy (default PIC)
  src?: FieldSource    // source (default manual)
  val?: boolean        // validatedBy PIC
  req?: boolean        // mandatory
  dash?: boolean       // showOnDashboard
  list?: boolean       // showInPartList
  rules?: ConditionalRule[] // show/hide/mandatory rules (set by ./ppFieldConfig overlay)
}

function f(s: FSpec): FieldDefinition {
  return {
    key: s.k,
    label: s.l,
    type: s.t ?? 'text',
    options: s.o,
    columns: s.cols,
    mandatory: s.req ?? false,
    enteredBy: s.by ?? 'PIC',
    source: s.src ?? 'manual',
    validatedBy: s.val ? 'PIC' : null,
    showOnDashboard: s.dash ?? false,
    showInPartList: s.list || undefined,
    conditionalRules: s.rules
  }
}

/** Vendor→PIC two-step flow (used when any field is vendor-entered / PIC-validated). */
const FLOW_VENDOR_PIC: ApprovalFlow = {
  steps: [
    { stepIndex: 0, role: 'Vendor', label: 'Vendor Entry', allowedOutcomes: ['Submit'] },
    { stepIndex: 1, role: 'PIC', label: 'PIC Validation', allowedOutcomes: ['Approve', 'Edit', 'Send back'] }
  ]
}
/** PIC-only single-step flow (no vendor entry). */
const FLOW_PIC: ApprovalFlow = {
  steps: [{ stepIndex: 0, role: 'PIC', label: 'PIC Confirmation', allowedOutcomes: ['Approve', 'Edit'] }]
}

interface BSpec {
  id: string
  name: string
  fields: FSpec[]
  owner?: PersonaId
  scope?: 'NewPart' | 'ECN' | 'Both'
  na?: boolean          // allowNotApplicable
  vendorTimeline?: boolean
  desc?: string
}

function blueprint(b: BSpec): ActivityDefinition {
  // PP fields configured from the rapid-prototype export win over the generated list (see ./ppFieldConfig).
  const cfg = PP_FIELD_CONFIG[b.id]
  const specs = cfg?.fields ?? [...b.fields, ...(cfg?.append ?? [])]
  const fields = specs.map(f)
  const anyVendor = fields.some((x) => x.enteredBy === 'Vendor' || x.validatedBy === 'PIC')
  return {
    id: b.id,
    name: b.name,
    scope: b.scope ?? 'Both',
    ownerPersona: b.owner ?? 'PIC',
    description: b.desc,
    allowNotApplicable: b.na ?? true,
    allowVendorPlannedTimeline: (cfg?.vendorTimeline ?? b.vendorTimeline) || undefined,
    // Prebuilt activities use the standard deviation approval chain: PIC → SIC → DPM.
    deviationFlow: ['PIC', 'SIC', 'DPM'],
    published: true,
    fields,
    flow: anyVendor ? FLOW_VENDOR_PIC : FLOW_PIC
  }
}
""")

export_names = {'PP': 'PP_BLUEPRINTS', 'MPP': 'MPP_BLUEPRINTS', 'Pilot/SOP': 'PILOT_BLUEPRINTS'}
for trial, acts in by_trial.items():
    name = export_names.get(trial, snake(trial).upper() + '_BLUEPRINTS')
    lines.append(f"// ── {trial} ({len(acts)} activities) " + "─" * 40)
    lines.append(f"export const {name}: ActivityDefinition[] = [")
    for i, a in enumerate(acts):
        scope = ", scope: 'ECN'" if 'ECN cases' in a['name'] else ""
        vt = ", vendorTimeline: true" if any(x in a['name'].lower() for x in ('spec meeting', 'ot status', 'otop status')) else ""
        lines.append("  blueprint({")
        lines.append(f"    id: {ts(a['id'])}, name: {ts(a['name'])}{scope}{vt},")
        lines.append("    fields: [")
        lines.append(",\n".join(emit_field(f) for f in a['fields']))
        lines.append("    ]")
        lines.append("  })" + ("," if i < len(acts) - 1 else ""))
    lines.append("]\n")

lines.append("export const ALL_BLUEPRINTS: ActivityDefinition[] = [\n  ...PP_BLUEPRINTS,\n  ...MPP_BLUEPRINTS,\n  ...PILOT_BLUEPRINTS\n]\n")

open(OUT_TS, 'w', encoding='utf-8').write("\n".join(lines))

hdr = f"{len(review)} rows needed a guess/assumption (of {len(rows)} total).\n\n"
open(OUT_REVIEW, 'w', encoding='utf-8').write(hdr + "\n".join(review) + "\n")

print(f"activities: {len(activities)}  fields: {sum(len(a['fields']) for a in activities)}  review items: {len(review)}")
for trial, acts in by_trial.items(): print(f"  {trial}: {len(acts)} activities")
