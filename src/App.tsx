import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './features/AppLayout'
import { HomePage } from './features/home/HomePage'
import { ActivitiesPage } from './features/activities/ActivitiesPage'
import { BuilderWizard } from './features/builder/BuilderWizard'
import { ModelsPage } from './features/models/ModelsPage'
import { SectionTemplatePage } from './features/templates/SectionTemplatePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { PicsPage } from './features/pics/PicsPage'
import { PartsPage } from './features/parts/PartsPage'
import { ManpowerPage } from './features/manpower/ManpowerPage'
import { ExceptionsPage } from './features/exceptions/ExceptionsPage'
import { HistoryTransferPage } from './features/historytransfer/HistoryTransferPage'
import { PartWorkspacePage } from './features/partworkspace/PartWorkspacePage'
import { BulkEntryPage } from './features/partworkspace/BulkEntryPage'
import { LessonsPage } from './features/lessons/LessonsPage'
import { AuditLogPage } from './features/audit/AuditLogPage'
import { WbsPage } from './features/wbs/WbsPage'
import { DependenciesPage } from './features/dependencies/DependenciesPage'
import { GovernancePage } from './features/governance/GovernancePage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { InitiateProjectPage } from './features/projects/InitiateProjectPage'
import { ProjectDetailsPage } from './features/projects/ProjectDetailsPage'
import { ArchetypeDetailsPage } from './features/governance/ArchetypeDetailsPage'
const DashboardsPage = lazy(() =>
  import('./features/dashboard/DashboardsPage').then(m => ({ default: m.DashboardsPage })),
)
import { WorkspacePage } from './features/workspace/WorkspacePage'
import { ApplicabilityMatrixPage } from './features/applicability/ApplicabilityMatrixPage'
import { MyWorkPage } from './features/mywork/MyWorkPage'
import { DataEntryLandingPage } from './features/dataentry/DataEntryLandingPage'
import { MyWorkGridPage } from './features/mywork/MyWorkGridPage'

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-[var(--color-muted)]">
      <p className="text-5xl mb-4">404</p>
      <p className="text-lg font-medium">Page not found</p>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      {/* Skip-to-content for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-white focus:border focus:border-primary focus:px-3 focus:py-1.5 focus:rounded focus:text-sm focus:font-medium focus:text-primary focus:shadow"
      >
        Skip to main content
      </a>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="data-entry" element={<DataEntryLandingPage />} />
          <Route path="mywork" element={<MyWorkPage />} />
          <Route path="mywork/:activityId/:milestoneId" element={<MyWorkGridPage />} />
          <Route path="part-workspace" element={<PartWorkspacePage />} />
          <Route path="bulk-entry" element={<BulkEntryPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="activities/:id" element={<WorkspacePage />} />
          <Route path="builder" element={<Navigate to="/governance?tab=builder" replace />} />
          <Route path="builder/:id" element={<BuilderWizard />} />
          <Route
            path="dashboards"
            element={
              <Suspense fallback={<div className="p-6 text-[var(--color-muted)]">Loading dashboards…</div>}>
                <DashboardsPage />
              </Suspense>
            }
          />
          <Route path="models" element={<ModelsPage />} />
          <Route path="template" element={<SectionTemplatePage />} />
          <Route path="pics" element={<PicsPage />} />
          <Route path="parts" element={<PartsPage />} />
          <Route path="manpower" element={<ManpowerPage />} />
          <Route path="exceptions" element={<ExceptionsPage />} />
          <Route path="history-transfer" element={<HistoryTransferPage />} />
          <Route path="deviations" element={<Navigate to="/exceptions?tab=deviations" replace />} />
          <Route path="lessons" element={<LessonsPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="intake" element={<Navigate to="/parts" replace />} />
          <Route path="wbs" element={<WbsPage />} />
          <Route path="dependencies" element={<DependenciesPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<InitiateProjectPage />} />
          <Route path="projects/:no" element={<ProjectDetailsPage />} />
          <Route path="governance" element={<GovernancePage />} />
          <Route path="governance/:id" element={<ArchetypeDetailsPage />} />
          <Route path="applicability" element={<ApplicabilityMatrixPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
