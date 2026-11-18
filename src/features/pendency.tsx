/** "Pending with" display: the role an item is waiting on, as a chip in the role's colour (see engine.pendencyOf). */
import { PERSONAS } from '../store/personaStore'

export const PERSONA_LABEL: Record<string, string> = Object.fromEntries(PERSONAS.map((p) => [p.id, p.label]))

export function PendingRoleChip({ role }: { role: string }) {
  const hex = PERSONAS.find((p) => p.id === role)?.hex ?? '#667085'
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: `${hex}22`, color: hex === '#c4b5fd' ? '#6d28d9' : hex }}>
      {PERSONA_LABEL[role] ?? role}
    </span>
  )
}
