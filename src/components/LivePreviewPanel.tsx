/**
 * LivePreviewPanel
 *
 * Right-side preview rendered from a BuilderDraft.
 * Shows two tabs:
 *   1. "Form" — a lightweight workspace form preview using fieldRendererRegistry
 *   2. "Dashboard" — a basic dashboard tile preview from the draft's field roles
 *
 * This is an intentionally lightweight renderer.
 * Sub-task 4 (Workspace) and Sub-task 5 (Dashboards) will build full implementations.
 */

import { useState } from 'react'
import type { BuilderDraft } from '../domain'
import { Tabs } from './Tabs'
import { SourceBadge } from './SourceBadge'
import { getFieldRenderer } from './FieldRenderer'
import type { FieldSource } from '../domain'

interface LivePreviewPanelProps {
  draft: BuilderDraft
}

const COMMON_FIELDS = [
  { label: 'Model', value: 'Swift' },
  { label: 'Part No.', value: '31100-M74LD0' },
  { label: 'Part Name', value: 'Starter Motor Assembly' },
  { label: 'Vendor', value: 'Minda Industries' },
  { label: 'Department', value: 'Electrical' },
  { label: 'Section', value: 'NP1' },
  { label: 'Milestone', value: 'PP · 2026-10-24' },
]

export function LivePreviewPanel({ draft }: LivePreviewPanelProps) {
  const [activeTab, setActiveTab] = useState('form')

  const tabs = [
    { id: 'form', label: 'Form' },
    { id: 'dashboard', label: 'Dashboard' },
  ]

  return (
    <div className="flex flex-col h-full epmp-card overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-0 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">Live Preview</span>
          <span className="text-xs text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 rounded">Draft</span>
        </div>
        <Tabs items={tabs} activeId={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'form' ? (
          <FormPreview draft={draft} />
        ) : (
          <DashboardPreview draft={draft} />
        )}
      </div>
    </div>
  )
}

// ── Form Preview ──────────────────────────────────────────────────────────────

function FormPreview({ draft }: { draft: BuilderDraft }) {
  return (
    <div className="space-y-4 text-sm">
      {/* Activity header */}
      <div className="bg-[var(--color-surface)] rounded p-3 border border-[var(--color-border)]">
        <div className="font-semibold text-[var(--color-text)] mb-1">
          {draft.name || 'Untitled Activity'}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
          <span>{draft.scope === 'Both' ? 'New Part + ECN' : draft.scope === 'NewPart' ? 'New Part' : 'ECN'}</span>
          <span>·</span>
          <span className="italic">Dates set by Department Co-ordinator (MRD offsets)</span>
          {draft.allowNotApplicable && (
            <>
              <span>·</span>
              <span>PIC can mark parts Not applicable</span>
            </>
          )}
        </div>
      </div>

      {/* Common locked fields */}
      <div>
        <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
          Common Part Fields <span className="normal-case font-normal">(always included)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {COMMON_FIELDS.map((cf) => (
            <div key={cf.label} className="bg-[var(--color-surface)] rounded p-2 border border-[var(--color-border)] opacity-70">
              <div className="text-xs text-[var(--color-muted)]">{cf.label}</div>
              <div className="text-sm font-medium text-[var(--color-text)]">{cf.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Defined fields */}
      {draft.fields.length === 0 ? (
        <div className="text-center py-6 text-[var(--color-muted)] text-xs">
          Add fields in the Fields step to see them here.
        </div>
      ) : (
        <div>
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
            Activity Fields ({draft.fields.length})
          </div>
          <div className="space-y-3">
            {draft.fields.filter((f) => !f.dataOnly).map((field) => {
              const renderer = getFieldRenderer(field.type)
              return (
                <div key={field.key} className="border border-[var(--color-border)] rounded p-2.5 bg-white">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-[var(--color-text)]">
                      {field.label}
                      {field.mandatory && <span className="text-destructive ml-0.5">*</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <SourceBadge source={field.source as FieldSource} size="sm" />
                      <span className="text-xs text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">
                        {field.enteredBy}
                      </span>
                    </div>
                  </div>
                  {renderer.preview({ field, value: null })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dashboard Preview ─────────────────────────────────────────────────────────

function DashboardPreview({ draft }: { draft: BuilderDraft }) {
  const kpiFields = draft.fields.filter((f) => f.showOnDashboard && f.kpiRole)
  const statusFields = draft.fields.filter((f) => f.kpiRole === 'status')
  const dateFields = draft.fields.filter((f) => f.kpiRole === 'date')
  const percentFields = draft.fields.filter((f) => f.kpiRole === 'percentage')
  const countFields = draft.fields.filter((f) => f.kpiRole === 'count')

  return (
    <div className="space-y-4 text-sm">
      <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">
        Auto-generated Dashboard
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Total Parts', value: '25', color: '#3b82d4' },
          { label: 'Completion %', value: '—', color: '#10b981' },
          { label: 'Overdue', value: '—', color: '#ef4444' },
          { label: 'Awaiting', value: '—', color: '#f59e0b' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded border border-[var(--color-border)] p-2.5 text-center">
            <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="text-xs text-[var(--color-muted)] mt-0.5">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* RYG distribution mini chart */}
      <div className="border border-[var(--color-border)] rounded p-3">
        <div className="text-xs font-medium text-[var(--color-text)] mb-2">RYG Distribution</div>
        <div className="flex gap-1 h-8">
          {[
            { label: 'Green', pct: 60, color: '#10b981' },
            { label: 'Yellow', pct: 25, color: '#f59e0b' },
            { label: 'Red', pct: 15, color: '#ef4444' },
          ].map((seg) => (
            <div
              key={seg.label}
              className="rounded flex-shrink-0"
              style={{ width: `${seg.pct}%`, backgroundColor: seg.color, opacity: 0.8 }}
              title={`${seg.label}: ${seg.pct}%`}
            />
          ))}
        </div>
        <div className="flex gap-3 mt-1.5 text-xs text-[var(--color-muted)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-ryg-green" />Green 60%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-ryg-yellow" />Yellow 25%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-ryg-red" />Red 15%</span>
        </div>
      </div>

      {/* KPI field roles summary */}
      {kpiFields.length > 0 ? (
        <div className="border border-[var(--color-border)] rounded p-3">
          <div className="text-xs font-medium text-[var(--color-text)] mb-2">
            Dashboard Widgets from Field Roles ({kpiFields.length})
          </div>
          <div className="space-y-1">
            {statusFields.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">Status donut</span>
                <span className="text-[var(--color-text)]">{statusFields.map((f) => f.label).join(', ')}</span>
              </div>
            )}
            {dateFields.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">Timeline chart</span>
                <span className="text-[var(--color-text)]">{dateFields.map((f) => f.label).join(', ')}</span>
              </div>
            )}
            {percentFields.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">Gauge / band chart</span>
                <span className="text-[var(--color-text)]">{percentFields.map((f) => f.label).join(', ')}</span>
              </div>
            )}
            {countFields.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">Count KPI tile</span>
                <span className="text-[var(--color-text)]">{countFields.map((f) => f.label).join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-xs text-[var(--color-muted)]">
          Enable "Show on Dashboard" on fields and assign KPI roles to see widget mappings here.
        </div>
      )}
    </div>
  )
}
