/**
 * Part intake fields, from the client sheet "Part Intake Fields.xlsx" (sheet "Parts Ingestion").
 * `source` says which system supplies the field; `core` marks the fields that live on PartRecord itself, every other
 * field is kept in PartRecord.attrs under `key`. `primary` = primary filter, `filter` = needed as a dashboard filter.
 */
export type IntakeSource = 'Enovia' | 'SAP' | 'System (EPMP)'

export interface IntakeField {
  key: string
  label: string
  source: IntakeSource
  /** "Display on Screen" in the sheet. */
  display: boolean
  /** Pick-list values from the sheet's Remarks column. */
  options?: string[]
  remarks?: string
  /** PartRecord property this field is stored in (otherwise PartRecord.attrs[key]). */
  core?: 'model' | 'department' | 'pic' | 'partNo' | 'partName' | 'vendorCode' | 'vendorName' | 'section'
  /** Calculated or stamped by the system, so it is not typed when a part is added manually. */
  system?: boolean
  type?: 'text' | 'date' | 'time'
  filter: boolean
  primary: boolean
  /** Required when a part is added manually. */
  required?: boolean
}

export const INTAKE_FIELDS: IntakeField[] = [
  { key: 'model', label: 'Model', source: 'Enovia', display: true, core: 'model', filter: true, primary: true, required: true },
  { key: 'qa_dept', label: 'QA Dept', source: 'Enovia', display: true, core: 'department', filter: true, primary: true },
  { key: 'part_category', label: 'Part Category', source: 'SAP', display: true, options: ['A', 'AR', 'A/AR', 'G', 'F'], filter: true, primary: true },
  { key: 'model_variant', label: 'Model Variant', source: 'Enovia', display: true, options: ['Domestic', 'Export', 'Domestic + Export'], remarks: 'Domestic, Export, Domestic + Export', filter: true, primary: true },
  { key: 'fuel_type', label: 'Fuel Type', source: 'Enovia', display: true, options: ['Petrol', 'CNG', 'Petrol+CNG'], remarks: 'Petrol, CNG, Petrol+CNG', filter: true, primary: true },
  { key: 'qa_pic_name', label: 'QA PIC Name', source: 'SAP', display: true, core: 'pic', remarks: 'Filter shows Staff ID and Name together', filter: true, primary: true },
  { key: 'trial_status', label: 'Trial Status', source: 'System (EPMP)', display: true, system: true, remarks: 'As per the current trial status', filter: false, primary: true },
  { key: 'part_number', label: 'Part Number', source: 'Enovia', display: true, core: 'partNo', filter: true, primary: false, required: true },
  { key: 'part_name', label: 'Part Name', source: 'Enovia', display: true, core: 'partName', filter: true, primary: false, required: true },
  { key: 'vendor_no', label: 'Vendor No', source: 'Enovia', display: true, core: 'vendorCode', filter: true, primary: false },
  { key: 'vendor_name', label: 'Vendor Name', source: 'SAP', display: true, core: 'vendorName', filter: true, primary: false, required: true },
  { key: 'plant', label: 'Plant', source: 'SAP', display: true, filter: true, primary: false },
  { key: 'technology_category', label: 'Technology Category', source: 'SAP', display: true, filter: true, primary: false },
  { key: 'vendor_criteria', label: 'Vendor Criteria', source: 'SAP', display: true, options: ['New Vendor', 'New Technology', 'New Part', 'New Process'], remarks: 'New Vendor/New Technology/New Part/New Process', filter: true, primary: false },
  { key: 'common_type', label: 'Type (Common/Uncommon)', source: 'Enovia', display: true, options: ['Common', 'Uncommon'], filter: true, primary: false },
  { key: 'monitoring_reason', label: 'Monitoring required reason', source: 'Enovia', display: true, options: ['New Part', 'ECN Part'], filter: true, primary: false },
  { key: 'engineering_dept', label: 'Engineering Dept', source: 'Enovia', display: true, filter: true, primary: false },
  { key: 'supply_chain_dept', label: 'Supply Chain Dept', source: 'Enovia', display: true, filter: true, primary: false },
  { key: 'status', label: 'Status', source: 'SAP', display: false, filter: false, primary: false },
  { key: 'fitment_location', label: 'Fitment Location (Weld/Engine/Assy)', source: 'Enovia', display: true, options: ['Weld', 'Engine', 'Assy'], filter: true, primary: false },
  { key: 'color', label: 'Color', source: 'Enovia', display: true, filter: true, primary: false },
  { key: 'remarks', label: 'Remarks', source: 'SAP', display: true, filter: false, primary: false },
  { key: 'qa_pic_staff_id', label: 'QA PIC Staff ID', source: 'SAP', display: false, filter: false, primary: false },
  { key: 'section_name', label: 'Section Name', source: 'SAP', display: true, core: 'section', filter: true, primary: false, required: true },
  { key: 'section_manager', label: 'Section Manager', source: 'SAP', display: true, filter: false, primary: false },
  { key: 'dpm_id', label: 'DPM ID', source: 'SAP', display: false, filter: false, primary: false },
  { key: 'dpm_name', label: 'DPM Name', source: 'SAP', display: false, filter: true, primary: false },
  { key: 'created_by', label: 'Created By', source: 'SAP', display: true, system: true, remarks: 'For a dummy part this is required for the log', filter: false, primary: false },
  { key: 'created_on', label: 'Created On', source: 'SAP', display: true, system: true, type: 'date', filter: false, primary: false },
  { key: 'created_at', label: 'Created At', source: 'SAP', display: true, system: true, type: 'time', filter: false, primary: false },
  { key: 'changed_by', label: 'Changed By', source: 'SAP', display: true, system: true, remarks: 'Merge / change / modify: staff who last did the action', filter: false, primary: false },
  { key: 'changed_on', label: 'Changed On', source: 'SAP', display: true, system: true, type: 'date', remarks: 'Date of last action', filter: false, primary: false },
  { key: 'changed_at', label: 'Changed At', source: 'SAP', display: true, system: true, type: 'time', remarks: 'Time of last action', filter: false, primary: false }
]

/** Trial the part is in today: the first milestone (PP, MPP, Pilot, SOP) whose MRD has not passed, else "Completed". */
export function trialStatusFor(mrds: Record<string, string> | undefined, today: string): string {
  if (!mrds) return '—'
  for (const m of ['PP', 'MPP', 'Pilot', 'SOP']) {
    const d = mrds[m]
    if (d && d >= today) return m
  }
  return mrds.PP || mrds.SOP ? 'Completed' : '—'
}

/** Deterministic mock intake attributes for a sample part (what the SAP / ENOVIA feeds would carry). */
export function sampleIntakeAttrs(partNo: string, i: number): Record<string, string> {
  const h = Array.from(partNo).reduce((n, c) => n + c.charCodeAt(0), 0) + i
  const pick = (a: string[]) => a[h % a.length]
  return {
    part_category: pick(['A', 'AR', 'A/AR', 'G', 'F']),
    model_variant: pick(['Domestic', 'Export', 'Domestic + Export']),
    fuel_type: pick(['Petrol', 'CNG', 'Petrol+CNG']),
    plant: pick(['Manesar', 'Gurgaon', 'Kharkhoda']),
    technology_category: pick(['Injection moulding', 'Sheet metal', 'Machining', 'Electronics']),
    vendor_criteria: pick(['New Vendor', 'New Technology', 'New Part', 'New Process']),
    common_type: pick(['Common', 'Uncommon']),
    monitoring_reason: pick(['New Part', 'ECN Part']),
    engineering_dept: pick(['Body Engg', 'Electrical Engg', 'Interior Engg', 'Engine Engg']),
    supply_chain_dept: pick(['SC Body', 'SC Electrical', 'SC Interior']),
    status: 'Active',
    fitment_location: pick(['Weld', 'Engine', 'Assy']),
    color: pick(['Black', 'Silver', 'White', 'Grey', 'Not applicable']),
    remarks: '',
    qa_pic_staff_id: `S${10000 + (h % 8999)}`,
    section_manager: pick(['A. Sharma', 'R. Iyer', 'M. Khan']),
    dpm_id: `D${2000 + (h % 799)}`,
    dpm_name: pick(['V. Rao', 'S. Mehta']),
    created_by: 'SAP interface',
    created_on: `2026-10-${String(1 + (h % 10)).padStart(2, '0')}`,
    created_at: `${String(8 + (h % 9)).padStart(2, '0')}:${String((h * 7) % 60).padStart(2, '0')}`,
    changed_by: pick(['SAP interface', 'R. Verma', 'A. Desai']),
    changed_on: `2026-10-${String(11 + (h % 4)).padStart(2, '0')}`,
    changed_at: `${String(9 + (h % 8)).padStart(2, '0')}:${String((h * 11) % 60).padStart(2, '0')}`
  }
}
