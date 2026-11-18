import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'

/**
 * "← Back" to the page (or tab) the user came from. Shown only when there is an earlier entry in this app's history,
 * so it never sends the user out of the app (e.g. on a first visit or a bookmarked link).
 */
/** The router's position in the browser history (0 = first page of this visit). */
function historyIndex(_locationKey: string): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? 0
}

export function BackButton() {
  const navigate = useNavigate()
  const { key } = useLocation()
  // Read the history position per location (keyed on it so it is recomputed on every navigation).
  const idx = historyIndex(key)
  if (idx <= 0) return null
  return (
    <button type="button" onClick={() => navigate(-1)} aria-label="Back to the previous page"
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#344054] hover:border-[#bfdbfe] hover:text-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bfdbfe]">
      <Icon name="undo" size={12} /> Back
    </button>
  )
}
