import { useMemo, useState } from 'react'
import { Modal, Button } from '../../components'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { rowInScope } from '../scope'
import type { CrossActivityDashboard } from '../../domain'

const inputCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-[#f9fafb] px-2 text-[12px] text-[#344054]'

type Draft = Omit<CrossActivityDashboard, 'id' | 'createdAt' | 'createdBy'>

export function CrossActivityCreator({
  open, onClose, onCreate
}: {
  open: boolean
  onClose: () => void
  onCreate: (draft: Draft) => void
}) {
  const { activities, templateRows } = useQAStore()
  const { currentPersona } = usePersonaStore()

  const [name, setName] = useState('')
  const [commonality, setCommonality] = useState<'model' | 'part'>('model')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // Activities that have at least one template row visible to this persona.
  const selectableActivities = useMemo(
    () =>
      activities.filter(
        (a) => a.published !== false && templateRows.some((r) => r.activityId === a.id && rowInScope(r, currentPersona))
      ),
    [activities, templateRows, currentPersona]
  )

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const valid = name.trim() && picked.size >= 2

  const reset = () => {
    setName('')
    setCommonality('model')
    setPicked(new Set())
  }

  const submit = () => {
    if (!valid) return
    onCreate({
      name: name.trim(),
      commonality,
      activityIds: selectableActivities.filter((a) => picked.has(a.id)).map((a) => a.id),
      widgets: []
    })
    reset()
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title="New cross-activity dashboard"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={() => { reset(); onClose() }}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={!valid}>Create</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-[var(--color-muted)]">
          Build a reusable comparison template: choose whether it compares by model or by part and which
          activities to compare. You then pick the specific model/part from a dropdown on the dashboard and
          every chart re-populates. Each activity (repeated per milestone it appears under) becomes a point.
        </p>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Dashboard name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Key QA activities by model" />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">Compare across</span>
          <select
            value={commonality}
            onChange={(e) => setCommonality(e.target.value as 'model' | 'part')}
            className={inputCls}
          >
            <option value="model">A model (pick the model on the dashboard)</option>
            <option value="part">A part (pick the part on the dashboard)</option>
          </select>
        </label>

        <div>
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-muted)]">
            Activities to compare <span className="text-[10px]">(pick 2 or more)</span>
          </span>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-[var(--color-border)] p-1">
            {selectableActivities.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-[var(--color-muted)]">No activities available.</p>
            )}
            {selectableActivities.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-[var(--color-surface)]">
                <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
                <span className="truncate">{a.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-muted)]">{picked.size} selected</p>
        </div>
      </div>
    </Modal>
  )
}
