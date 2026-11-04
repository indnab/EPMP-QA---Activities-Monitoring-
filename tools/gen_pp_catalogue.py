"""Generates qa-activity-tracker/src/mock/ppCatalogueFields.ts from epmp-activity-fields-export.json.
Covers every PP activity in `catalogue`; PP01-PP05, PP10, PP11 are overridden by the hand-configured
`purposeBuilt` definitions in src/mock/ppFieldConfig.ts. Usage: python3 gen_pp_catalogue.py <json> <out.ts>"""
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
DASH = {'PP06': 'pbObservationStatus', 'PP07': 'dmuCompleted', 'PP08': 'sesEcrRaised', 'PP09': 'otToolTrialStatus',
        'PP12': 'mispStatus', 'PP13': 'testStatus', 'PP14': 'bcfStatus', 'PP15': 'colorCompStatus', 'PP16': 'deviationAutoFetch'}
def fix(s):  # repair mojibake / dashes
    for a, b in (('ΓÇö', '—'), ('ΓÇô', '–'), ('ΓåÆ', '→')):
        s = (s or '').replace(a, b)
    return s
YN = 'yesNo'
STATUS_LAB = ['Under testing', 'OK', 'NG', 'Reference', 'Request rejected']
# Text fields in the JSON that are really Yes/No or pick-lists: (type, options)
CHOICES = {
    'mispApproved': (YN, None), 'mispPending': (YN, None), 'mispSharedVendor': (YN, None),
    'dmuCompleted': (YN, None), 'dmuPending': (YN, None), 'labApplicability': (YN, None),
    'bcfApplicable': (YN, None), 'colorApplicable': (YN, None), 'otDeviationRequired': (YN, None),
    'retestPlanned': (YN, None), 'mizenNewnesType': ('dropdown', ['New Technology', 'New Process', 'New Material', 'New Design', 'Others']),
    'mizenboshiItemStatus': ('dropdown', ['Pending', 'Accepted', 'Rejected by Engineering']),
    'pbNewnessType': ('dropdown', ['New Tech. / New Design', 'New Vendor', 'Existing vendor New part category', 'New Process', 'New Plant', 'New Material', 'Localization', 'Others']),
    'otToolGoAheadStatus': ('dropdown', ['Pending', 'Received']),
    'otToolCuttingStatus': ('dropdown', ['Not started', 'Started', 'Completed']),
    'otToolAssemblyStatus': ('dropdown', ['Not started', 'Started', 'Completed']),
    'otToolTrialStatus': ('dropdown', ['Pending', 'Done']),
    'otEDocStatus': ('dropdown', ['Pending', 'In progress', 'Approved', 'Rejected']),
    'mispStatus': ('dropdown', ['Pending approval', 'Approved']),
    'testStatus': ('dropdown', STATUS_LAB), 'colorTestStatus': ('dropdown', STATUS_LAB), 'retestStatus': ('dropdown', STATUS_LAB),
    'retestSampleSubmit': ('dropdown', ['Submitted', 'Not submitted']),
    'closureStatus': ('dropdown', ['Open', 'Closed']),
}
# Field source / owner overrides (client SAP field list) and visibility rules ("if applicable = Y").
SRC_OVERRIDE = {'pbNewnessType': ('sap', 'System')}
def only_when(dep, val): return {'dependsOn': dep, 'operator': 'notEquals', 'value': val, 'action': 'hide'}
RULES = {'pbNewnessType': [only_when('pbApplicable', 'Y')], 'mizenNewnesType': [only_when('mizenboshiApplicable', 'Y')]}
def spec(aid, f):
    fid = f['fieldId']
    if fid == 'status': return None            # the app tracks status itself (RYG + workflow state)
    owner = f.get('owner', 'PIC'); lab = fix(f['label'])
    by = {'PIC': 'PIC', 'VENDOR': 'Vendor', 'SYSTEM': 'System'}.get(owner, 'PIC')
    dt = f['dataType']; opts = f.get('options')
    t = 'text'
    if dt == 'number': t = 'number'
    elif dt == 'date': t = 'date'
    elif dt == 'textarea': t = 'longText'
    elif dt == 'select':
        t = 'yesNo' if opts == ['Y', 'N'] else 'dropdown'
    if t == 'text' and 'Applicable / Not Applicable' in lab: t = 'yesNo'
    if t == 'text' and fid in CHOICES: t, opts = CHOICES[fid]
    src = 'manual'; st = f.get('sourceType'); ss = f.get('sourceSystem')
    if st == 'EPMP_DERIVED': src = 'calculated'
    elif st == 'EXTERNAL_SYSTEM': src = 'edoc' if ss == 'EXT' else 'mapping'
    o = {'k': fid, 'l': lab, 't': t, 'by': by}
    if t == 'dropdown': o['o'] = opts
    if src != 'manual': o['src'] = src
    if by == 'Vendor': o['val'] = True
    if f.get('mandatory'): o['req'] = True
    if fid in SRC_OVERRIDE: o['src'], o['by'] = SRC_OVERRIDE[fid]; o.pop('val', None)
    if fid in RULES: o['rules'] = RULES[fid]
    if by == 'System' and t == 'date': o['vendor'] = True   # dates (planned / target / actual) are shown to the vendor read-only
    if DASH.get(aid) == fid: o['dash'] = True; o['list'] = True
    return o
# ENOVIA-fetched fields that are not in the JSON catalogue (from the client's ENOVIA field list), added at the top.
EXTRA = {
    'PP09': [
        {'k': 'applicability_of_msil_tool_go_ahead', 'l': 'Applicability of MSIL tool go ahead', 't': 'yesNo', 'by': 'System', 'src': 'enovia'},
        {'k': 'msil_tool_go_ahead_date', 'l': 'MSIL tool go ahead date', 't': 'date', 'by': 'System', 'src': 'enovia', 'vendor': True},
        {'k': 'ot_planned_date', 'l': 'OT planned date', 't': 'date', 'by': 'System', 'src': 'enovia', 'vendor': True},
    ],
    'PP12': [{'k': 'misp_prepared', 'l': 'MISP prepared', 't': 'yesNo', 'by': 'System', 'src': 'enovia'}],
}
out = {}
names = {}
for a in d['catalogue']:
    if a['stage'] != 'PP': continue
    aid = a['activityId']
    names[aid] = {'name': fix(a['activityName']), 'desc': fix(a.get('purpose', '')), 'done': fix(a.get('completionRule', ''))}
    out[aid] = EXTRA.get(aid, []) + [x for x in (spec(aid, f) for f in a['fields']) if x]
ts = ["/** AUTO-GENERATED by tools/gen_pp_catalogue.py from epmp-activity-fields-export.json (catalogue, stage PP). Do not hand-edit. */",
      "import type { PpFieldSpec } from './ppFieldConfig'", "",
      "export const PP_CATALOGUE_META: Record<string, { name: string; desc: string; done: string }> = " + json.dumps(names, ensure_ascii=False, indent=2) + "", "",
      "export const PP_CATALOGUE_FIELDS: Record<string, PpFieldSpec[]> = " + json.dumps(out, ensure_ascii=False, indent=2) + ""]
open(sys.argv[2], 'w', encoding='utf-8').write("\n".join(ts) + "\n")
print({k: len(v) for k, v in out.items()})
