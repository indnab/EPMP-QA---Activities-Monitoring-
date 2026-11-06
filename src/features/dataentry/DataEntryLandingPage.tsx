import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components'
import { usePersonaStore } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'
import { AiImportPanel } from '../mywork/AiImportPanel'
import { canEnterWork } from '../mywork/workQueue'

interface Dest {
  to: string
  title: string
  desc: string
  icon: React.ReactNode
  roles?: PersonaId[]
}

const tile = (d: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const DESTS: Dest[] = [
  {
    to: '/activities',
    title: 'Activities',
    desc: 'Every activity by milestone, with parts, planned dates and completion. Open one to work on its parts.',
    icon: tile(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>)
  },
  {
    to: '/part-workspace',
    title: 'Part Workspace',
    desc: 'Open one part and fill every activity for it on a single screen.',
    roles: ['PIC', 'SIC', 'DPM'],
    icon: tile(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h7M7 16h4" /><path d="M16 14l2 2 3-3" /></>)
  },
  {
    to: '/bulk-entry',
    title: 'Bulk Entry Grid',
    desc: 'Parts down the rows, every activity\u2019s fields across the columns, filled in one grid.',
    roles: ['PIC', 'SIC', 'DPM'],
    icon: tile(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>)
  }
]

/** Landing page for Parts Data Entry: one card per entry screen (My Work, Part Workspace, Bulk Entry Grid). */
export function DataEntryLandingPage() {
  const navigate = useNavigate()
  const { currentPersona } = usePersonaStore()
  const available = DESTS.filter((d) => !d.roles || d.roles.includes(currentPersona))

  return (
    <div>
      <PageHeader
        title="Parts Data Entry"
        section="Workspace"
        description="Choose how you want to enter and review values for parts."
      />
      {available.length === 0 ? (
        <div className="epmp-card px-6 py-10 text-center text-sm text-[var(--color-muted)]">
          There is nothing to enter for the {currentPersona} role here.
        </div>
      ) : (
        <div className="epmp-card p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((d) => (
              <button
                key={d.to}
                type="button"
                onClick={() => navigate(d.to)}
                className="group flex flex-col items-start rounded-2xl border border-[var(--color-border)] bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]"
              >
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff]">{d.icon}</span>
                <span className="text-[14px] font-semibold text-[var(--color-text)]">{d.title}</span>
                <span className="mt-0.5 text-[11px] leading-4 text-[var(--color-muted)]">{d.desc}</span>
                <span className="mt-2 text-[12px] font-medium text-[var(--color-accent)]">
                  Open →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI-based entry: bring a file or paste text; AI maps it to the fields you may fill (review before saving). */}
      {canEnterWork(currentPersona) && (
        <div className="mt-3">
          <AiImportPanel role={currentPersona} />
        </div>
      )}
    </div>
  )
}
