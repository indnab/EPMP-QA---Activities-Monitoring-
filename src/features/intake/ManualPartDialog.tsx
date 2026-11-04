import { useMemo, useState } from 'react'
import { Button, Modal } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore, getPersonaScope } from '../../store/personaStore'
import { INTAKE_FIELDS } from '../../mock/partIntakeFields'
import type { IntakeField } from '../../mock/partIntakeFields'
import type { PartRecord } from '../../domain'
import { actorLabel } from '../excel/audit'

const inputCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-3 text-[12px] text-[#344054]'
const SOURCE_TAG: Record<string, string> = { Enovia: 'bg-sky-100 text-sky-800', SAP: 'bg-indigo-100 text-indigo-800' }
/** Typed in by hand; Trial Status, Created and Changed fields are stamped by the system. */
const FORM_FIELDS = INTAKE_FIELDS.filter((f) => !f.system)

/** Form for adding a part by hand when SAP / ENOVIA has no number yet. Every intake field is offered. */
export function ManualPartDialog({ onClose, sections }: { onClose: () => void; sections: string[] }) {
  const { parts, models, picAssignments, addManualPart } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const lockedSection = getPersonaScope(currentPersona).section
  const [vals, setVals] = useState<Record<string, string>>({ section_name: lockedSection ?? sections[0] ?? '' })
  const [type, setType] = useState<'NewPart' | 'ECN'>('NewPart')
  const [tried, setTried] = useState(false)
  const set = (k: string, v: string) => setVals((p) => ({ ...p, [k]: v }))
  const knownPics = useMemo(() => Array.from(new Set([...parts.map((p) => p.pic), ...picAssignments.map((a) => a.pic)].filter(Boolean))).sort(), [parts, picAssignments])
  const partNo = (vals.part_number ?? '').trim()
  const dup = !!partNo && parts.some((p) => p.partNo === partNo)
  const missing = FORM_FIELDS.filter((f) => f.required && !(vals[f.key] ?? '').trim())
  const valid = missing.length === 0 && !dup

  function submit() {
    setTried(true)
    if (!valid) return
    const now = new Date()
    const iso = now.toISOString()
    const attrs: Record<string, string> = {}
    for (const f of FORM_FIELDS) if (!f.core && (vals[f.key] ?? '').trim()) attrs[f.key] = vals[f.key].trim()
    // Stamped by the system so the creation can be traced in the log.
    attrs.created_by = actorLabel(currentPersona)
    attrs.created_on = iso.slice(0, 10)
    attrs.created_at = iso.slice(11, 16)
    const part: Omit<PartRecord, 'origin' | 'supersededBy' | 'supersedes' | 'createdBy' | 'createdAt'> = {
      partNo,
      partName: (vals.part_name ?? '').trim(),
      model: (vals.model ?? '').trim(),
      vendorCode: (vals.vendor_no ?? '').trim() || '—',
      vendorName: (vals.vendor_name ?? '').trim(),
      department: (vals.qa_dept ?? '').trim() || 'Other',
      section: vals.section_name,
      pic: (vals.qa_pic_name ?? '').trim(),
      type,
      attrs
    }
    addManualPart(part, currentPersona, actorLabel(currentPersona))
    onClose()
  }

  const control = (f: IntakeField) => {
    const id = `mp-${f.key}`
    const v = vals[f.key] ?? ''
    const bad = tried && f.required && !v.trim()
    const cls = `${inputCls} ${bad ? 'border-red-400' : ''}`
    if (f.key === 'model')
      return (
        <select id={id} value={v} onChange={(e) => set(f.key, e.target.value)} className={cls}>
          <option value="">— select —</option>
          {models.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
      )
    if (f.key === 'section_name')
      return (
        <select id={id} value={v} onChange={(e) => set(f.key, e.target.value)} className={cls} disabled={!!lockedSection} title={lockedSection ? 'You add parts to your own section' : undefined}>
          {(lockedSection ? [lockedSection] : sections).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )
    if (f.options)
      return (
        <select id={id} value={v} onChange={(e) => set(f.key, e.target.value)} className={cls}>
          <option value="">— select —</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    if (f.key === 'qa_pic_name')
      return (
        <>
          <input id={id} list="mp-pics" value={v} onChange={(e) => set(f.key, e.target.value)} className={cls} />
          <datalist id="mp-pics">{knownPics.map((p) => <option key={p} value={p} />)}</datalist>
        </>
      )
    return <input id={id} value={v} onChange={(e) => set(f.key, e.target.value)} className={cls} />
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add part manually"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit}>Add part</Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        Use this when SAP / ENOVIA has no part number yet. The part is flagged as a dummy. Created By, Created On and Created At are filled in by the system, and Trial Status follows the model's dates.
      </p>
      <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
        <label className="block text-xs font-medium text-[#344054]">
          Part type<span className="text-red-500"> *</span>
          <select value={type} onChange={(e) => setType(e.target.value as 'NewPart' | 'ECN')} className={`${inputCls} mt-1`}>
            <option value="NewPart">New Part</option>
            <option value="ECN">ECN</option>
          </select>
        </label>
        {FORM_FIELDS.map((f) => (
          <label key={f.key} htmlFor={`mp-${f.key}`} className="block text-xs font-medium text-[#344054]">
            <span className="flex items-center gap-1.5">
              {f.label}
              {f.required && <span className="text-red-500">*</span>}
              <span className={`rounded px-1 py-px text-[9px] font-medium ${SOURCE_TAG[f.source] ?? 'bg-slate-100 text-slate-600'}`}>{f.source}</span>
            </span>
            <span className="mt-1 block">{control(f)}</span>
            {f.key === 'part_number' && dup && <span className="mt-1 block text-[11px] text-red-600">A part with this number already exists.</span>}
            {f.remarks && !f.options && <span className="mt-0.5 block text-[10px] font-normal text-[var(--color-muted)]">{f.remarks}</span>}
          </label>
        ))}
      </div>
      {tried && !valid && !dup && <p role="alert" className="mt-2 text-xs text-red-600">Fill in: {missing.map((f) => f.label).join(', ')}.</p>}
    </Modal>
  )
}
