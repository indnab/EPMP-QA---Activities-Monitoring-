/**
 * Master search for the My Work filters. Type one or more terms, e.g. "baleno door minda" or "swift 35520 V1001 mpp":
 * each term (or run of words, like "door wiring") is matched to a filter value (model, part, vendor, trial, activity,
 * PIC, department, status, part category, fuel type or market), and "Apply all" sets all of them at once.
 * The suggestions below auto-complete the last term: picking one applies that filter and leaves the rest of what was
 * typed, so the next term can follow. A value that is already applied shows a tick; picking it removes it.
 * Keyboard: ↑ / ↓ to move, Enter to apply the highlighted row ("Apply all" first), Esc to close.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon as FbIcon } from '../../components/Icon'

export interface SearchFacet {
  /** Stable key of the filter, e.g. "model". */
  key: string
  /** Filter name shown in the results, e.g. "Model". */
  label: string
  options: { value: string; label?: string }[]
  selected: string[]
}
export interface SearchPick { facet: string; value: string }

const MAX_PER_GROUP = 6
const norm = (s: string) => s.toLowerCase()
const textOf = (o: { value: string; label?: string }) => norm(`${o.value} ${o.label ?? ''}`)

/** How well a run of words matches an option: 3 exact, 2 starts with, 1 contains every word, 0 no match. */
function score(o: { value: string; label?: string }, words: string[]): number {
  const phrase = words.join(' ')
  const v = norm(o.value), l = norm(o.label ?? '')
  if (v === phrase || l === phrase) return 3
  if (v.startsWith(phrase) || l.startsWith(phrase) || l.includes(`: ${phrase}`)) return 2
  const t = textOf(o)
  return words.every((w) => t.includes(w)) ? 1 : 0
}

/**
 * Split the words into filter values, left to right: at each point take the longest run of words that matches some
 * value, and the best value for it (preferring a filter not used yet). Words that match nothing are returned too.
 */
function parse(words: string[], facets: SearchFacet[]) {
  const picks: (SearchPick & { facetLabel: string; label: string; words: string })[] = []
  const unmatched: string[] = []
  let i = 0
  while (i < words.length) {
    let found: (typeof picks)[number] | null = null
    let used = 1
    for (let j = words.length; j > i && !found; j--) {
      const span = words.slice(i, j)
      let best: { f: SearchFacet; o: { value: string; label?: string }; s: number } | null = null
      for (const f of facets) {
        for (const o of f.options) {
          const s = score(o, span)
          // Several words make one value only as a phrase ("door wiring", "headlamp assy lh"); otherwise each word
          // is its own filter ("swift 31100 minda" = model + part + vendor).
          if (!s || (span.length > 1 && s < 2)) continue
          const fresh = !picks.some((p) => p.facet === f.key)
          const rank = s * 2 + (fresh ? 1 : 0)
          const bestRank = best ? best.s * 2 + (!picks.some((p) => p.facet === best!.f.key) ? 1 : 0) : -1
          if (rank > bestRank) best = { f, o, s }
        }
      }
      if (best) {
        found = { facet: best.f.key, value: best.o.value, facetLabel: best.f.label, label: best.o.label ?? best.o.value, words: span.join(' ') }
        used = j - i
      }
    }
    if (found) { if (!picks.some((p) => p.facet === found!.facet && p.value === found!.value)) picks.push(found); i += used }
    else { unmatched.push(words[i]); i += 1 }
  }
  return { picks, unmatched }
}

export function MasterSearch({ facets, onApply, onRemove }: {
  facets: SearchFacet[]
  /** Add these values to their filters, all in one update. */
  onApply: (picks: SearchPick[]) => void
  /** Remove a value from its filter. */
  onRemove: (pick: SearchPick) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const out = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [])

  const words = useMemo(() => norm(q).trim().split(/\s+/).filter(Boolean), [q])
  const parsed = useMemo(() => parse(words, facets), [words, facets])
  // "Apply" row when the terms make more than one filter, or one filter plus words that matched nothing.
  const combo = parsed.picks.length > 1 || (parsed.picks.length === 1 && parsed.unmatched.length > 0) ? parsed.picks : []
  // Auto-complete the last term typed.
  const last = words.length ? words[words.length - 1] : ''
  const groups = useMemo(() => {
    if (!last) return []
    return facets
      .map((f) => {
        const hits = f.options.filter((o) => textOf(o).includes(last))
          .sort((a, b) => score(b, [last]) - score(a, [last]))
        return { facet: f, hits: hits.slice(0, MAX_PER_GROUP), more: Math.max(0, hits.length - MAX_PER_GROUP) }
      })
      .filter((g) => g.hits.length > 0)
  }, [last, facets])
  const singles = groups.flatMap((g) => g.hits.map((o) => ({ facet: g.facet, o })))
  const rows = (combo.length ? 1 : 0) + singles.length

  const applyAll = () => { onApply(combo); setQ(''); setOpen(false) }
  const applyOne = (n: number) => {
    const hit = singles[n]
    if (!hit) return
    const pick = { facet: hit.facet.key, value: hit.o.value }
    if (hit.facet.selected.includes(hit.o.value)) onRemove(pick)
    else onApply([pick])
    // Keep the earlier terms so the next one can follow.
    const rest = q.trim().split(/\s+/).slice(0, -1).join(' ')
    setQ(rest ? `${rest} ` : '')
    setCursor(0)
    input.current?.focus()
  }
  const activate = (n: number) => { if (combo.length && n === 0) applyAll(); else applyOne(n - (combo.length ? 1 : 0)) }

  return (
    <div ref={ref} className="relative" data-export-ignore="true">
      <label className="flex h-9 w-[300px] max-w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-[11.5px] focus-within:ring-2 focus-within:ring-[#bfdbfe]">
        <FbIcon name="search" size={14} className="text-[var(--color-muted)]" />
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); activate(cursor) }
            else if (e.key === 'Escape') { setOpen(false) }
          }}
          placeholder="Search filters: model part vendor trial…"
          aria-label="Search and apply filters"
          role="combobox"
          aria-expanded={open && words.length > 0}
          aria-controls="mw-master-search"
          className="min-w-0 flex-1 bg-transparent text-[#344054] placeholder-[var(--color-muted)] focus:outline-none"
        />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><FbIcon name="close" size={12} /></button>}
      </label>
      {open && words.length > 0 && (
        <div id="mw-master-search" role="listbox" aria-label="Matching filter values"
          className="absolute left-0 z-40 mt-1 max-h-[460px] w-[420px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-1.5 shadow-xl">
          {combo.length > 0 && (
            <button type="button" role="option" aria-selected={cursor === 0} onMouseEnter={() => setCursor(0)} onClick={applyAll}
              className={`mb-1 w-full rounded-lg border px-2.5 py-2 text-left ${cursor === 0 ? 'border-[#bfdbfe] bg-secondary' : 'border-[var(--color-border)]'}`}>
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                <FbIcon name="check" size={12} />{combo.length > 1 ? `Apply all ${combo.length} filters` : 'Apply this filter'}
                <span className="ml-auto text-[10px] font-normal text-[var(--color-muted)]">Enter</span>
              </span>
              <span className="flex flex-wrap gap-1">
                {combo.map((p) => (
                  <span key={`${p.facet}|${p.value}`} className="rounded-full bg-white px-2 py-0.5 text-[10.5px] text-[#344054] ring-1 ring-[var(--color-border)]">
                    <span className="text-[var(--color-muted)]">{p.facetLabel}:</span> {p.label}
                  </span>
                ))}
              </span>
              {parsed.unmatched.length > 0 && (
                <span className="mt-1 block text-[10px] text-amber-700">No match for: {parsed.unmatched.join(', ')}</span>
              )}
            </button>
          )}
          {groups.length === 0 && combo.length === 0 && <p className="px-3 py-4 text-center text-[11px] text-[var(--color-muted)]">No filter value matches “{last}”.</p>}
          {groups.length > 0 && combo.length > 0 && <div className="px-2 pb-0.5 pt-1.5 text-[10px] text-[var(--color-muted)]">Or complete “{last}”:</div>}
          {groups.map((g) => (
            <div key={g.facet.key} className="mb-1">
              <div className="px-2 pb-0.5 pt-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{g.facet.label}</div>
              {g.hits.map((o) => {
                const n = singles.findIndex((x) => x.facet === g.facet && x.o.value === o.value) + (combo.length ? 1 : 0)
                const on = g.facet.selected.includes(o.value)
                return (
                  <button key={o.value} type="button" role="option" aria-selected={n === cursor}
                    onMouseEnter={() => setCursor(n)} onClick={() => activate(n)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] ${n === cursor ? 'bg-[var(--color-surface)]' : ''}`}>
                    <span className="min-w-0 flex-1 truncate text-[#101828]">{o.label ?? o.value}</span>
                    {on
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><FbIcon name="check" size={11} />Applied · remove</span>
                      : <span className="text-[10px] text-[var(--color-muted)]">Add filter</span>}
                  </button>
                )
              })}
              {g.more > 0 && <div className="px-2 py-0.5 text-[10px] text-[var(--color-muted)]">+{g.more} more — type more to narrow</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
