import type { AttributeCatalogueEntry } from '../domain'

/**
 * Mock attribute catalogue for fetched fields.
 * Each system (ENOVIA, SAP, E-Doc, Regulatory App) exposes a set of
 * fetchable attributes. The builder's Fields step lets the user pick
 * a system + attribute from this list when source is 'enovia'|'sap'|'edoc'|'regapp'.
 */
const NEWNESS_TYPES = ['New Tech. / New Design', 'New Vendor', 'Existing vendor New part category', 'New Process', 'New Plant', 'New Material', 'Localization', 'Others']
export const ATTRIBUTE_CATALOGUE: AttributeCatalogueEntry[] = [
  // ENOVIA
  { system: 'enovia', key: 'enovia_drawing_no',         label: 'Drawing Number',             type: 'text'    },
  { system: 'enovia', key: 'enovia_drawing_rev',        label: 'Drawing Revision',           type: 'text'    },
  { system: 'enovia', key: 'enovia_classification',     label: 'Part Classification',        type: 'dropdown'},
  { system: 'enovia', key: 'enovia_material',           label: 'Material Specification',     type: 'text'    },
  { system: 'enovia', key: 'enovia_weight',             label: 'Part Weight (kg)',           type: 'number'  },
  { system: 'enovia', key: 'enovia_release_date',       label: 'Drawing Release Date',       type: 'date'    },
  { system: 'enovia', key: 'enovia_spec_ref',           label: 'Spec Reference',             type: 'text'    },
  { system: 'enovia', key: 'enovia_target_date_proprietary', label: 'Target date – Proprietary part', type: 'date' },
  { system: 'enovia', key: 'enovia_tech_meeting_status',     label: 'Tech Meeting Status (TM +PM)', type: 'yesNo' },
  { system: 'enovia', key: 'enovia_process_meeting_status',  label: 'Process Meeting (Only PM)',    type: 'yesNo' },
  { system: 'enovia', key: 'enovia_spec_meeting_status',     label: 'Enovia Spec Meeting Status',   type: 'dropdown', options: ['Initiated', 'Pending', 'Approved'] },
  { system: 'enovia', key: 'enovia_planned_start_date',      label: 'Planned Start Date',           type: 'date' },
  { system: 'enovia', key: 'enovia_actual_end_date',         label: 'Enovia Actual End Date',       type: 'date' },
  { system: 'enovia', key: 'enovia_tool_go_ahead_applicability', label: 'Applicability Of MSIL Tool Go Ahead', type: 'yesNo' },
  { system: 'enovia', key: 'enovia_tool_go_ahead_date',      label: 'MSIL Tool Go Ahead Date',      type: 'date' },
  { system: 'enovia', key: 'enovia_ot_planned_date',         label: 'OT planned date',              type: 'date' },
  { system: 'enovia', key: 'enovia_inspection_target_date',  label: 'Inspection Target Date',       type: 'date' },
  { system: 'enovia', key: 'enovia_inspection_completed',    label: 'Inspection completed',         type: 'yesNo' },
  { system: 'enovia', key: 'enovia_inspection_status',       label: 'Inspection status',            type: 'dropdown', options: ['OK', 'NG'] },
  { system: 'enovia', key: 'enovia_misp_prepared',           label: 'MISP Prepared',                type: 'yesNo' },
  // Note: "Spec Meeting Not Applicable" (Tech = N and Process = N) and "Data Update Pending" (both blank) are calculated, not fetched.

  // SAP
  { system: 'sap',    key: 'sap_part_category',        label: 'Part Category',              type: 'dropdown', options: ['A', 'AR', 'A/AR', 'G', 'F'] },
  { system: 'sap',    key: 'sap_monitoring_required_reason', label: 'Monitoring Required Reason', type: 'dropdown', options: ['New Part', 'ECN Part'] },
  { system: 'sap',    key: 'sap_spec_meeting_status',  label: 'SAP Spec Meeting Status',    type: 'dropdown', options: ['Not Initiated', 'Initiated', 'Pending For Approval', 'Approved'] },
  { system: 'sap',    key: 'sap_actual_start_date',    label: 'Actual Start Date',          type: 'date'    },
  { system: 'sap',    key: 'sap_actual_end_date',      label: 'SAP Actual End Date',        type: 'date'    },
  { system: 'sap',    key: 'sap_tier2_supplier_code',  label: 'Tier-2 supplier code',       type: 'number'  },
  { system: 'sap',    key: 'sap_tier2_supplier_name',  label: 'Tier-2 supplier name',       type: 'text'    },
  { system: 'sap',    key: 'sap_tier2_others_status',  label: 'Tier-2 status when blank (Others status)', type: 'dropdown', options: ['New (Unaudited)', 'Tier-1', 'Directed Tier-2', 'Overseas', 'Trader', 'RM', 'Catalogue Part', 'Consumables', 'Others'] },
  { system: 'sap',    key: 'sap_new_tier2_vendor_code', label: 'New Tier-2 Vendor Code',    type: 'number'  },
  { system: 'sap',    key: 'sap_new_tier2_vendor_name', label: 'New Tier-2 Vendor Name',    type: 'text'    },
  { system: 'sap',    key: 'sap_audit_status',         label: 'Audit Status',               type: 'dropdown', options: ['Done', 'Not done'] },
  { system: 'sap',    key: 'sap_newness_type',         label: 'Newness type (if applicable = Y)', type: 'dropdown', options: NEWNESS_TYPES },
  { system: 'sap',    key: 'sap_sheet_metal_applicability', label: 'Sheet Metal Applicability (only for Weld part)', type: 'yesNo' },
  { system: 'sap',    key: 'sap_total_parameters',     label: 'Total Parameters',           type: 'number'  },
  { system: 'sap',    key: 'sap_inspection_actual_date', label: 'Inspection Actual Date',   type: 'date'    },
  { system: 'sap',    key: 'sap_evidence_attachment',  label: 'Evidence attachment',        type: 'yesNo'   },
  { system: 'sap',    key: 'sap_inspection_completed', label: 'Inspection completed',       type: 'yesNo'   },
  { system: 'sap',    key: 'sap_ppap_status',          label: 'PPAP status',                type: 'dropdown', options: ['Approved', 'Pending'] },
  { system: 'sap',    key: 'sap_pending_at',           label: 'Pending at',                 type: 'dropdown', options: ['PIC', 'SIC', 'DPM', 'DDVM', 'DVM', 'DVM-SMC'] },
  { system: 'sap',    key: 'sap_ifm_check_sheet_status', label: 'IFM check sheet status',   type: 'dropdown', options: ['Submitted by vendor', 'Approved by MSIL'] },
  { system: 'sap',    key: 'sap_applicability_category', label: 'Applicability – A / AR / A/AR / F (default Y)', type: 'yesNo' },
  { system: 'sap',    key: 'sap_uploaded_in_smir',     label: 'Uploaded in SAP SMIR',       type: 'yesNo'   },
  { system: 'sap',    key: 'sap_ppvt_scope_volume',    label: 'PPVT MSIL Scope Volume',     type: 'number'  },
  { system: 'sap',    key: 'sap_ppvt_scope_status',    label: 'PPVT MSIL Scope Status',     type: 'dropdown', options: ['OK', 'NG'] },
  { system: 'sap',    key: 'sap_ppvt_scope_planned_date', label: 'PPVT MSIL Scope Planned Date (text, if not completed)', type: 'text' },
  { system: 'sap',    key: 'sap_ppvt_scope_actual_date',  label: 'PPVT MSIL Scope Actual Date (text, if not completed)',  type: 'text' },
  { system: 'sap',    key: 'sap_smir_upload_date',     label: 'SMIR Upload Date',           type: 'date'    },
  { system: 'sap',    key: 'sap_spec_meeting_date',    label: 'Spec Meeting Date',          type: 'date'    },
  { system: 'sap',    key: 'sap_plant_code',           label: 'Plant Code',                 type: 'text'    },
  { system: 'sap',    key: 'sap_storage_location',     label: 'Storage Location',           type: 'text'    },
  { system: 'sap',    key: 'sap_cost_center',          label: 'Cost Center',                type: 'text'    },

  // E-Doc
  { system: 'edoc',   key: 'edoc_doc_no',              label: 'E-Doc Number',               type: 'text'    },
  { system: 'edoc',   key: 'edoc_deviation_status',    label: 'Deviation Status',           type: 'dropdown'},
  { system: 'edoc',   key: 'edoc_approval_date',       label: 'Deviation Approval Date',    type: 'date'    },
  { system: 'edoc',   key: 'edoc_closure_date',        label: 'E-Doc Closure Date',         type: 'date'    },
  { system: 'edoc',   key: 'edoc_approver',            label: 'Approver Name',              type: 'text'    },

  // Regulatory App
  { system: 'regapp', key: 'reg_cert_status',          label: 'Certification Status',       type: 'dropdown'},
  { system: 'regapp', key: 'reg_cert_no',              label: 'Certificate Number',         type: 'text'    },
  { system: 'regapp', key: 'reg_expiry_date',          label: 'Certificate Expiry Date',    type: 'date'    },
  { system: 'regapp', key: 'reg_authority',            label: 'Regulatory Authority',       type: 'text'    },
  { system: 'regapp', key: 'reg_compliance_flag',      label: 'Compliance Flag (Y/N)',      type: 'yesNo'   },
]
