/**
 * Maps each activity id to the client-provided pixel-perfect HTML dashboard
 * (served from /public/client-dashboards). When an activity has a mapping, its
 * Dashboard view embeds the real client file in an iframe instead of the generic
 * auto-generated widgets. Activities without a mapping fall back to the generic view.
 *
 * The HTML files are the client's own prototypes and run on their own demo data.
 */
export const CLIENT_DASHBOARD_BY_ACTIVITY: Record<string, string> = {
  // ── PP phase ──
  'pp-1': 'parts-drawing-confirmation_1.html',
  'pp-2': 'spec-meeting-confirmation_1.html',
  'pp-3': 'sor-status.html',
  'pp-4': 'tier-2-compilation.html',
  'pp-5': 'tier-2-compilation.html', // New Tier-2 shares the Tier-2 dashboard (New Tier 2 tab)
  'pp-6': 'newness-mizenboshi-status.html',
  'pp-7': 'dmu-status.html',
  'pp-8': 'ses-nr-status.html',
  'pp-9': 'ot-go-ahead.html',
  'pp-10': 'sheet-metal-parts-accuracy-status.html',
  'pp-11': 'part-inspection-deviation-status.html',
  'pp-12': 'mis-p-approval.html',
  'pp-13': 'lab-testing-status.html',
  'pp-14': 'bcf-status.html',
  'pp-15': 'colour-parts-check-status.html',
  'pp-16': 'part-list-deviation-special-parts.html',

  // ── MPP phase ──
  'mpp-1': 'otop-status-mpp.html',
  'mpp-5': 'hinkai-monitoring-closure-status.html',
  'mpp-6': 'sor-adherence-confirmation.html',
  'mpp-7': 'lab-testing-status-mpp.html',
  'mpp-8': 'process-audit.html',
  'mpp-9': 'process-capability.html',
  'mpp-10': 'homologation-marking-confirmation.html',
  'mpp-11': 'set-parts-semi-finished-status.html',
  'mpp-12': 'misp-revision.html',
  'mpp-13': 'spare-kit-part-status.html',
  'mpp-14': 'part-list-deviation-special-parts-mpp.html',

  // ── Pilot / SOP phase ──
  'pilot-1': 'otop-status-ecn-cases.html',
  'pilot-2': 'sheet-metal-parts-accuracy-status-sop.html',
  'pilot-3': 'part-inspection-deviation-status-sop.html',
  'pilot-4': 'mpp-trial-hinkai-monitoring-closure.html',
  'pilot-5': 'bcf-status-sop.html',
  'pilot-6': 'ppvt-confirmation.html',
  'pilot-7': 'ppap-file-approval-status.html',
  'pilot-8': 'lab-testing-status-sop.html',
  'pilot-9': 'homologation-status-sop.html',
  'pilot-10': 'list-of-limit-sample.html',
  'pilot-11': 'ifm-mail-initiation-checklist.html',
  'pilot-12': 'sop-readiness.html',
  'pilot-14': 'part-updation-regulatory-app.html',
  'pilot-15': 'part-updation-smir-system.html',
  'pilot-16': 'part-updation-cpm-system.html',
  'pilot-17': 'misp-revision.html',
  'pilot-18': 'ppvt-confirmation.html'
}

/** Returns the public URL of the client dashboard for an activity, or null if none. */
export function clientDashboardUrl(activityId: string): string | null {
  const file = CLIENT_DASHBOARD_BY_ACTIVITY[activityId]
  if (!file) return null
  // import.meta.env.BASE_URL respects the Vite `base` (e.g. '/qa-activity-tracker/' on Pages).
  return `${import.meta.env.BASE_URL}client-dashboards/${file}`
}
