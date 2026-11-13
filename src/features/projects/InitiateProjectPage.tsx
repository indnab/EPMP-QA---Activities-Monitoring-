/**
 * Initiate Project (Division Model Coordinator). Project No. is automatic; name, archetype and Project Master are
 * chosen; a Vehicle project adds its models with their MRD dates. On Initiate the project goes straight into
 * execution and the parts tagged to its models are worked under the archetype's activities.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import type { InitiateProjectInput, ModelDraft, ProjectMaster } from '../../domain/projects'
import { PROJECT_INITIATOR, PROJECT_MASTERS, matchModelFromName, nextProjectNo, previewProject, projectOfModel, validateInitiation } from '../../domain/projects'
import { MrdEditor } from '../models/MrdEditor'

const inputCls = 'h-9 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-[12px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]'
const NEW = '__new__'

export function InitiateProjectPage() {
  const navigate = useNavigate()
  const { projects, archetypes, models, milestones, parts, initiateProject } = useQAStore()
  const { currentPersona } = usePersonaStore()
  const [name, setName] = useState('')
  const [archetypeId, setArchetypeId] = useState('')
  const [master, setMaster] = useState<ProjectMaster | ''>('')
  const [blocks, setBlocks] = useState<ModelDraft[]>([])
  const [touchedModels, setTouchedModels] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [storeErrors, setStoreErrors] = useState<Record<string, string>>({})

  const activeArchetypes = archetypes.filter((a) => a.active)
  const existingBlock = (modelName: string): ModelDraft => ({ name: modelName, isNew: false, mrds: { ...(models.find((m) => m.name === modelName)?.mrds ?? {}) } })

  // Name → model preselect (until the user changes the model list themselves).
  const onName = (v: string) => {
    setName(v)
    if (master === 'Vehicle' && !touchedModels) {
      const m = matchModelFromName(v, models)
      setBlocks(m ? [existingBlock(m)] : [])
    }
  }
  const onMaster = (v: ProjectMaster | '') => {
    setMaster(v)
    if (v === 'Vehicle' && blocks.length === 0) {
      const m = matchModelFromName(name, models)
      setBlocks([m ? existingBlock(m) : { name: '', isNew: false, mrds: {} }])
    }
  }
  const setBlock = (i: number, b: ModelDraft) => { setTouchedModels(true); setBlocks((bs) => bs.map((x, j) => (j === i ? b : x))) }
  const addBlock = () => { setTouchedModels(true); setBlocks((bs) => [...bs, { name: '', isNew: false, mrds: {} }]) }
  const removeBlock = (i: number) => { setTouchedModels(true); setBlocks((bs) => bs.filter((_, j) => j !== i)) }

  const input: InitiateProjectInput = { name, archetypeId, master, models: master === 'Vehicle' ? blocks : [] }
  const liveErrors = validateInitiation(input, { archetypes, models, milestones, projects, by: currentPersona })
  const errors = { ...liveErrors, ...storeErrors }
  const show = (k: string) => (submitted ? errors[k] : undefined)
  const arc = archetypes.find((a) => a.id === archetypeId)
  const preview = useMemo(() => previewProject(input, parts, arc), [input, parts, arc]) // eslint-disable-line react-hooks/exhaustive-deps

  if (currentPersona !== PROJECT_INITIATOR) {
    return (
      <div>
        <PageHeader title="Initiate Project" section="Project Initiation" />
        <Card><p className="py-10 text-center text-sm text-[var(--color-muted)]">Only the <strong>Division Model Coordinator</strong> can initiate a project.</p></Card>
      </div>
    )
  }

  const submit = () => {
    setSubmitted(true)
    if (Object.keys(liveErrors).length) return
    const r = initiateProject(input, currentPersona)
    if (!r.ok) { setStoreErrors(r.errors); return }
    navigate(`/projects/${r.project.no}`)
  }

  return (
    <div className="pb-24">
      <PageHeader title="Initiate Project" section="Project Initiation" />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#344054]">Project No.</span>
            <input value={nextProjectNo(projects)} readOnly className={`${inputCls} bg-[var(--color-surface)] font-mono text-[var(--color-muted)]`} />
            <span className="mt-1 block text-[10px] text-[var(--color-muted)]">Generated automatically</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#344054]">Project Name <span className="text-red-500">*</span></span>
            <input value={name} onChange={(e) => onName(e.target.value)} className={inputCls} placeholder="e.g. Swift" />
            {show('name') && <span className="mt-1 block text-[11px] text-red-600">{show('name')}</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#344054]">Project Archetype <span className="text-red-500">*</span></span>
            <select value={archetypeId} onChange={(e) => setArchetypeId(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {activeArchetypes.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
            </select>
            {show('archetypeId') && <span className="mt-1 block text-[11px] text-red-600">{show('archetypeId')}</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#344054]">Project Master <span className="text-red-500">*</span></span>
            <select value={master} onChange={(e) => onMaster(e.target.value as ProjectMaster | '')} className={inputCls}>
              <option value="">Select…</option>
              {PROJECT_MASTERS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {show('master') && <span className="mt-1 block text-[11px] text-red-600">{show('master')}</span>}
          </label>
        </div>
      </Card>

      {master === 'NonVehicle' && (
        <div className="mb-4 rounded-lg border border-[#bfdbfe] bg-secondary px-4 py-3 text-[12px] text-primary">
          A non-vehicle project has no models or parts. It is tracked on its archetype’s WBS at project level.
        </div>
      )}

      {master === 'Vehicle' && (
        <Card className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[14px] font-semibold text-[#101828]">Models &amp; MRD dates</h2>
            <span className="text-[11px] text-[var(--color-muted)]">The parts tagged to these models are pulled into the project.</span>
          </div>
          {show('models') && <p className="mb-2 text-[11px] text-red-600">{show('models')}</p>}
          <div className="space-y-4">
            {blocks.map((b, i) => {
              const taken = (n: string) => projectOfModel(n, projects)
              return (
                <div key={i} className="rounded-lg border border-[var(--color-border)] p-4">
                  <div className="mb-3 flex flex-wrap items-end gap-3">
                    <label className="block min-w-[220px] flex-1">
                      <span className="mb-1 block text-[11px] font-medium text-[#344054]">Model {i + 1} <span className="text-red-500">*</span></span>
                      <select
                        value={b.isNew ? NEW : b.name}
                        onChange={(e) => setBlock(i, e.target.value === NEW ? { name: '', isNew: true, mrds: {} } : existingBlock(e.target.value))}
                        className={inputCls}
                      >
                        <option value="">Select a model…</option>
                        {models.map((m) => {
                          const t = taken(m.name)
                          return <option key={m.name} value={m.name} disabled={!!t}>{m.name}{t ? ` — in ${t.no}` : ''}</option>
                        })}
                        <option value={NEW}>+ New model…</option>
                      </select>
                    </label>
                    {b.isNew && (
                      <label className="block min-w-[220px] flex-1">
                        <span className="mb-1 block text-[11px] font-medium text-[#344054]">New model name <span className="text-red-500">*</span></span>
                        <input value={b.name} onChange={(e) => setBlock(i, { ...b, name: e.target.value })} className={inputCls} placeholder="e.g. eVX" />
                      </label>
                    )}
                    <button type="button" onClick={() => removeBlock(i)} aria-label={`Remove model ${i + 1}`}
                      className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[#fef2f2] hover:text-[var(--color-destructive)]">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  {show(`model.${i}.name`) && <p className="mb-2 text-[11px] text-red-600">{show(`model.${i}.name`)}</p>}
                  {!b.isNew && b.name && <p className="mb-2 text-[11px] text-[var(--color-muted)]">MRDs prefilled from the model master — changes here update the master.</p>}
                  {(b.isNew || b.name) && (
                    <MrdEditor
                      idPrefix={`prj-m${i}`}
                      milestones={milestones}
                      mrds={b.mrds}
                      onChange={(mrds) => setBlock(i, { ...b, mrds })}
                      errors={submitted ? Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith(`model.${i}.mrd.`)).map(([k, v]) => [k.slice(`model.${i}.mrd.`.length), v])) : {}}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" onClick={addBlock} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-secondary)]">
            <Icon name="circle-plus" size={16} /> Add model
          </button>
        </Card>
      )}

      {/* Live preview */}
      {master && arc && (
        <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-[12px] text-[#344054]">
          <strong>Preview:</strong>{' '}
          {master === 'Vehicle'
            ? <>{preview.modelNames.join(', ') || 'no model yet'} · <strong>{preview.partsCount}</strong> part{preview.partsCount === 1 ? '' : 's'} · </>
            : <>no parts · </>}
          <strong>{preview.activityCount}</strong> QA activit{preview.activityCount === 1 ? 'y' : 'ies'} from {arc.name} ({preview.wbsObjectCount} WBS objects)
        </div>
      )}
      {submitted && errors._form && <p className="mb-3 text-[12px] text-red-600">{errors._form}</p>}

      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-end gap-3 border-t border-[var(--color-border)] bg-white/90 px-7 py-3 backdrop-blur lg:left-[248px] xl:left-[272px]">
        <Link to="/projects" className="inline-flex items-center rounded-[10px] border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[#fafafa]">Cancel</Link>
        <Button variant="primary" size="md" onClick={submit}>Initiate Project</Button>
      </div>
    </div>
  )
}
