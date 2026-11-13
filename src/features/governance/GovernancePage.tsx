/**
 * Governance (Admin): one home for configuration, kept out of the work screens (Parts Data Entry).
 *  - Archetypes        — project archetypes and their WBS templates (add activities here first)
 *  - Activity Builder  — build each archetype activity in detail (fields, flow, timeline) and publish
 *  - Activity Library  — every activity definition with edit / duplicate / restore / delete
 * The open tab is in the URL (?tab=), so links and Back land on the right one.
 */
import { useSearchParams } from 'react-router-dom'
import { Card, PageHeader, Tabs } from '../../components'
import { Icon } from '../../components/Icon'
import { useQAStore } from '../../store/qaStore'
import { usePersonaStore } from '../../store/personaStore'
import { isBuildable } from '../../domain'
import { ArchetypesPage } from './ArchetypesPage'
import { BuilderPage } from '../builder/BuilderPage'
import { ActivityLibrary } from './ActivityLibrary'

type GovTab = 'archetypes' | 'builder' | 'library'
const TABS: GovTab[] = ['archetypes', 'builder', 'library']

export function GovernancePage() {
  const [params, setParams] = useSearchParams()
  const { currentPersona } = usePersonaStore()
  const { archetypes, activities, drafts } = useQAStore()
  const asked = params.get('tab') as GovTab | null
  const tab: GovTab = asked && TABS.includes(asked) ? asked : 'archetypes'

  if (currentPersona !== 'Admin') {
    return (
      <div>
        <PageHeader title="Governance" section="Admin" />
        <Card>
          <div className="py-10 text-center text-[var(--color-muted)]">
            <p className="mb-3"><Icon name="lock" size={32} /></p>
            <p className="font-medium">Admin access required</p>
            <p className="mt-1 text-sm">Switch to the <strong>Admin</strong> persona to manage archetypes and activities.</p>
          </div>
        </Card>
      </div>
    )
  }

  // Activities still waiting to be built (QA objects whose activity is unpublished and has no draft yet).
  const toBuild = archetypes
    .flatMap((a) => a.wbs)
    .filter((o) => isBuildable(o) && o.activityId)
    .filter((o) => {
      const act = activities.find((x) => x.id === o.activityId)
      return act && !act.retired && act.published === false && !drafts.some((d) => d.sourceId === act.id)
    }).length

  return (
    <div>
      <PageHeader title="Governance" section="Admin" />
      <Tabs
        className="mb-4"
        activeId={tab}
        onChange={(id) => setParams(id === 'archetypes' ? {} : { tab: id })}
        items={[
          { id: 'archetypes', label: 'Archetypes', badge: archetypes.length || undefined },
          { id: 'builder', label: 'Activity Builder', badge: toBuild || undefined },
          { id: 'library', label: 'Activity Library' },
        ]}
      />
      {tab === 'archetypes' && <ArchetypesPage embedded />}
      {tab === 'builder' && <BuilderPage embedded />}
      {tab === 'library' && <ActivityLibrary />}
    </div>
  )
}
