/**
 * Step 1: Basics
 * Name, scope, description, owner persona.
 *
 * Planned dates are NOT set here. Section Admins assign each activity to a
 * milestone and express start/end as MRD-day offsets in the Section Template
 * screen. The system then calculates concrete dates per part from the model's
 * milestone MRD.
 */

import type { BuilderDraft } from '../../../domain'
import type { Scope } from '../../../domain'
import { PERSONAS } from '../../../store/personaStore'
import { Link } from 'react-router-dom'
import { useQAStore } from '../../../store/qaStore'
import type { PersonaId } from '../../../store/personaStore'

interface BasicsStepProps {
  draft: BuilderDraft
  onChange: (updates: Partial<BuilderDraft>) => void
}

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'NewPart', label: 'New Part' },
  { value: 'ECN', label: 'ECN' },
  { value: 'Both', label: 'Both (New Part + ECN)' },
]

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
      {text}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  )
}

function inputCls(error?: boolean) {
  return `w-full border ${error ? 'border-ryg-red' : 'border-[var(--color-border)]'} rounded px-3 py-2 text-sm bg-white text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]`
}

export function BasicsStep({ draft, onChange }: BasicsStepProps) {
  const nameError = !draft.name.trim()
  const { archetypes, milestones } = useQAStore()
  const arc = archetypes.find((a) => a.id === draft.archetypeId)
  const trial = milestones.find((m) => m.id === draft.defaultMilestoneId)?.label ?? draft.defaultMilestoneId

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Where this activity comes from (Governance → archetype WBS) */}
      {arc && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm">
          <span><span className="text-[var(--color-muted)]">Archetype </span><strong className="text-[var(--color-text)]">{arc.name}</strong> <span className="font-mono text-[11px] text-[var(--color-muted)]">{arc.id}</span></span>
          {trial && <span><span className="text-[var(--color-muted)]">Trial </span><strong className="text-[var(--color-text)]">{trial}</strong></span>}
          <Link to={`/governance/${arc.id}`} className="ml-auto text-[12px] font-semibold text-[var(--color-accent)] hover:underline">Edit in WBS →</Link>
        </div>
      )}
      {/* Info banner about date assignment */}
      <div className="flex items-start gap-2 rounded border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5 text-sm text-[#1e40af]">
        <span className="flex-shrink-0 font-bold">ℹ</span>
        <span>
          Planned dates are not set here. Department Co-ordinators assign this activity to a milestone and
          express start/end as <strong>MRD ± day offsets</strong> in the{' '}
          <strong>Section Template</strong> screen. The system calculates concrete dates per part
          from the model's milestone MRD.
        </span>
      </div>

      <div>
        <Label text="Activity Name" required />
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. PP #1 Parts drawing confirmation in IBOM"
          // The archetype's WBS owns the name of an archetype activity; rename it there.
          readOnly={!!arc}
          className={`${inputCls(nameError && !draft.name.trim())} ${arc ? 'bg-[var(--color-surface)] text-[var(--color-muted)]' : ''}`}
        />
        {arc && <p className="mt-1 text-xs text-[var(--color-muted)]">Comes from the archetype’s WBS object — rename it there.</p>}
        {nameError && <p className="text-xs text-destructive mt-1">Name is required</p>}
      </div>

      <div>
        <Label text="Scope / Applicability" required />
        <select
          value={draft.scope}
          onChange={(e) => onChange({ scope: e.target.value as Scope })}
          className={inputCls()}
        >
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <Label text="Owner Persona" required />
        <select
          value={draft.ownerPersona}
          onChange={(e) => onChange({ ownerPersona: e.target.value as PersonaId })}
          className={inputCls()}
        >
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          The persona responsible for managing and publishing this activity.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.allowNotApplicable === true}
            onChange={(e) => onChange({ allowNotApplicable: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded"
          />
          <span>
            <span className="block text-sm font-medium text-[var(--color-text)]">
              Allow PIC to mark parts Not applicable
            </span>
            <span className="block text-xs text-[var(--color-muted)] mt-0.5">
              A Department Co-ordinator adds this activity to a whole section, so it applies to every part there by
              default. Tick this when some parts may not need it and only the PIC knows which. The PIC can then
              mark individual parts Not applicable (with an optional reason). These parts are counted
              separately on dashboards and excluded from completion %. Leave unticked if the activity always
              applies to every part.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.allowVendorPlannedTimeline === true}
            onChange={(e) => onChange({ allowVendorPlannedTimeline: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded"
          />
          <span>
            <span className="block text-sm font-medium text-[var(--color-text)]">
              Allow vendor to set a planned timeline
            </span>
            <span className="block text-xs text-[var(--color-muted)] mt-0.5">
              By default a part's planned start/end come from the Section Template (MRD ± offsets). Tick this to
              let the vendor enter their own planned start/end for this activity. Once set, tracking (planned
              dates, RYG and overdue) follows the vendor's timeline instead of the template. The vendor can
              update it later; earlier dates stay visible with a strikethrough.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.trackNgRounds === true}
            onChange={(e) => onChange({ trackNgRounds: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded"
          />
          <span>
            <span className="block text-sm font-medium text-[var(--color-text)]">
              Track NG (no-go) resubmission rounds
            </span>
            <span className="block text-xs text-[var(--color-muted)] mt-0.5">
              Tick this when a vendor submission can be rejected as NG and has to be submitted again. The PIC then
              gets a "Mark NG" action: it records the reason and an optional target date for the next submission,
              sends the part back to the vendor, and counts a round. The round count and history show on the part,
              in the audit trail and on the Exception Management overview.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.canReferenceOtherActivities === true}
            onChange={(e) => onChange({ canReferenceOtherActivities: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded"
          />
          <span>
            <span className="block text-sm font-medium text-[var(--color-text)]">
              Show this part's NG and exceptions from other activities
            </span>
            <span className="block text-xs text-[var(--color-muted)] mt-0.5">
              Adds a "References" tab to this activity's form that lists the same part's NG rounds, deviations and
              open actions raised on other activities, so the PIC has that context while working this one. Read-only.
            </span>
          </span>
        </label>
      </div>

      <div>
        <Label text="Description" />
        <textarea
          value={draft.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Brief description of what this activity tracks and why it matters…"
          className={`${inputCls()} resize-y`}
        />
      </div>
    </div>
  )
}
