/**
 * "More Filters" window: Part, Vendor, People & departments (and Activity) pickers in one place. Everything is edited
 * on a draft; Apply sets the page's filters, Cancel leaves them, "Clear additional filters" empties the draft.
 */
import { useState } from 'react'
import { Button, Modal } from '../../components'
import { MultiSelect } from '../intake/MultiSelect'
import { EXTRA_GROUPS, LABELS } from './extraFilters'
import type { ExtraSel } from './extraFilters'

type Opt = { value: string; label?: string }
export interface MoreValues { extra: ExtraSel; partNo: string[]; vendorCode: string[]; activity: string[]; pic: string[] }

export function MoreFilters({ open, onClose, value, onApply, options, partOptions, vendorOptions, activityOptions, picOptions, showPic, showActivity = true }: {
  open: boolean
  onClose: () => void
  value: MoreValues
  onApply: (v: MoreValues) => void
  /** Options per extra key. */
  options: Record<string, Opt[]>
  partOptions: Opt[]
  vendorOptions: Opt[]
  activityOptions: Opt[]
  picOptions: Opt[]
  showPic: boolean
  showActivity?: boolean
}) {
  if (!open) return null
  return <Body {...{ onClose, value, onApply, options, partOptions, vendorOptions, activityOptions, picOptions, showPic, showActivity }} />
}

function Body({ onClose, value, onApply, options, partOptions, vendorOptions, activityOptions, picOptions, showPic, showActivity }: Omit<Parameters<typeof MoreFilters>[0], 'open'> & { showActivity: boolean }) {
  const [d, setD] = useState<MoreValues>(value)
  // Each key's draft values and setter (bound keys edit the page's own filters).
  const field = (key: string): { selected: string[]; set: (v: string[]) => void; options: Opt[] } | null => {
    if (key === 'part_number') return { selected: d.partNo, set: (v) => setD({ ...d, partNo: v }), options: partOptions }
    if (key === 'vendor_no') return { selected: d.vendorCode, set: (v) => setD({ ...d, vendorCode: v }), options: vendorOptions }
    if (key === 'activity') return showActivity ? { selected: d.activity, set: (v) => setD({ ...d, activity: v }), options: activityOptions } : null
    if (key === 'qa_pic_name') return showPic ? { selected: d.pic, set: (v) => setD({ ...d, pic: v }), options: picOptions } : null
    return { selected: d.extra[key] ?? [], set: (v) => setD({ ...d, extra: { ...d.extra, [key]: v } }), options: options[key] ?? [] }
  }
  const clear = () => setD({ extra: {}, partNo: [], vendorCode: [], activity: [], pic: [] })
  return (
    <Modal open onClose={onClose} title="More filters" size="lg"
      footer={<>
        <button type="button" onClick={clear} className="mr-auto text-[11.5px] font-semibold text-[var(--color-accent)] hover:underline">Clear additional filters</button>
        <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="md" onClick={() => { onApply(d); onClose() }}>Apply</Button>
      </>}>
      <p className="mb-3 text-[11.5px] text-[#475467]">Narrow {showActivity ? 'the page' : 'the list'} beyond the top-level filters. Tick one or more values in any field; nothing ticked means all.</p>
      <div className="space-y-4">
        {EXTRA_GROUPS.map((g) => {
          const fields = g.keys.map((k) => ({ k, f: field(k) })).filter((x) => x.f)
          if (!fields.length) return null
          return (
            <section key={g.title}>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{g.title}</h4>
              <div className="flex flex-wrap gap-2">
                {fields.map(({ k, f }) => (
                  <MultiSelect key={k} label={LABELS[k] ?? k} options={f!.options} selected={f!.selected} onChange={f!.set} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
