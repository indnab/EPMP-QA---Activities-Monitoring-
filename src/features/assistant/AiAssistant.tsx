/**
 * AI assistant: a round button at the bottom left of every page. It opens a floating "AI Insights Summary" panel
 * (a short briefing for the current role) with a chat to ask about overdue work, vendors, release / planning
 * timelines, approvals or a named part. The panel can be dragged anywhere on screen, minimized, and keeps its place.
 * Answers are rule-based over the user's own EPMP data (see assistantKnowledge.ts), with links to the detail.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon } from '../../components/Icon'
import { answer, summary, SUGGESTIONS, useFacts } from './assistantKnowledge'
import type { Answer } from './assistantKnowledge'

const W = 372
const H = 540
const MARGIN = 8

interface AssistantState {
  open: boolean
  pos: { x: number; y: number } | null
  setOpen: (v: boolean) => void
  setPos: (p: { x: number; y: number }) => void
}
const useAssistant = create<AssistantState>()(
  persist((set) => ({ open: false, pos: null, setOpen: (open) => set({ open }), setPos: (pos) => set({ pos }) }), { name: 'qa-tracker-assistant', version: 1 })
)

/** Keeps the panel fully on screen. */
const clamp = (p: { x: number; y: number }, w: number, h: number) => ({
  x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
  y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
})

interface Msg { from: 'ai' | 'me'; text: string; bullets?: string[]; links?: Answer['links'] }

export function AiAssistant({ navCollapsed }: { navCollapsed: boolean }) {
  const { open, pos, setOpen, setPos } = useAssistant()
  const facts = useFacts()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const [mini, setMini] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [live, setLive] = useState<{ x: number; y: number } | null>(null)

  const h = mini ? 48 : Math.min(H, window.innerHeight - 2 * MARGIN)
  const w = Math.min(W, window.innerWidth - 2 * MARGIN)
  // First open: bottom left, next to the button.
  const at = clamp(live ?? pos ?? { x: (navCollapsed ? 60 : 216) + 14, y: window.innerHeight - h - 100 }, w, h)

  // Keep it on screen when the window is resized.
  useEffect(() => {
    if (!open) return
    const on = () => setLive(null)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [open])
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }) }, [msgs, thinking, open, mini])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) setOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, setOpen])

  const sm = summary(facts)
  const ask = (text: string) => {
    const t = text.trim()
    if (!t) return
    setMsgs((m) => [...m, { from: 'me', text: t }])
    setQ('')
    setThinking(true)
    // A short pause so it reads like an answer being prepared.
    window.setTimeout(() => { setMsgs((m) => [...m, { from: 'ai', ...answer(t, facts) }]); setThinking(false) }, 350)
  }

  // Dragging by the header.
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - at.x, dy: e.clientY - at.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => { if (drag.current) setLive(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, w, h)) }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    drag.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (live) setPos(live)
  }

  return (
    <>
      {/* The round button, bottom left of the page */}
      <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Close AI assistant' : 'Open AI assistant'} aria-expanded={open}
        title="AI Insights Summary" data-export-ignore="true" data-ai-button
        className={`fixed bottom-12 z-[64] flex h-11 w-11 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(91,52,201,.45)] transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4b5fd] max-lg:left-3 ${navCollapsed ? 'lg:left-[72px]' : 'lg:left-[228px]'}`}
        style={{ background: 'linear-gradient(135deg,#3b6cf5,#7c3aed)' }}>
        <Icon name={open ? 'close' : 'spark'} size={20} />
        {!open && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" aria-hidden="true" />}
      </button>

      {open && (
        <section role="complementary" aria-label="AI Insights Summary" data-export-ignore="true" data-ai-panel
          className="fixed z-[65] flex flex-col overflow-hidden rounded-2xl border border-[#c7d2fe] bg-white shadow-[0_18px_48px_rgba(30,27,75,.35)]"
          style={{ left: at.x, top: at.y, width: w, height: h }}>
          {/* Header: drag here */}
          <header onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            className="flex flex-none cursor-grab touch-none select-none items-center gap-2 px-3 py-2.5 text-white active:cursor-grabbing"
            style={{ background: 'linear-gradient(135deg,#2f6bf2,#4b3fd4 70%,#5b34c9)', height: 48 }} title="Drag to move">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20"><Icon name="spark" size={16} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold leading-tight">AI Insights Summary</div>
              {!mini && <div className="truncate text-[10px] text-white/80">{facts.role} · rule-based on your EPMP data</div>}
            </div>
            <span className="mr-1 text-white/70" aria-hidden="true" title="Drag to move"><svg width="12" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.2" /><circle cx="7.5" cy="2.5" r="1.2" /><circle cx="2.5" cy="7" r="1.2" /><circle cx="7.5" cy="7" r="1.2" /><circle cx="2.5" cy="11.5" r="1.2" /><circle cx="7.5" cy="11.5" r="1.2" /></svg></span>
            <button type="button" onClick={() => setMini((v) => !v)} aria-label={mini ? 'Expand' : 'Minimize'} title={mini ? 'Expand' : 'Minimize'}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/20"><Icon name={mini ? 'chevron-up' : 'chevron-down'} size={15} /></button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" title="Close" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/20"><Icon name="close" size={15} /></button>
          </header>

          {!mini && (
            <>
              <div ref={body} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f8f9ff] px-3 py-3 text-[12px] text-[#101828]">
                {/* The briefing */}
                <div className="rounded-xl border border-[#dbe2fe] bg-white p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#5b34c9]">Summary</div>
                  <p className="m-0 mb-1.5 leading-snug text-[#344054]">{sm.lead}</p>
                  <ul className="m-0 list-disc space-y-1 pl-4 leading-snug text-[#344054]">{sm.bullets.map((b, k) => <li key={k}>{b}</li>)}</ul>
                </div>
                {msgs.map((m, k) => (
                  <div key={k} className={m.from === 'me' ? 'flex justify-end' : 'flex'}>
                    <div className={`max-w-[88%] rounded-2xl px-3 py-2 leading-snug ${m.from === 'me' ? 'rounded-br-md bg-[#4b3fd4] text-white' : 'rounded-bl-md border border-[#dbe2fe] bg-white text-[#344054]'}`}>
                      <p className="m-0">{m.text}</p>
                      {m.bullets && m.bullets.length > 0 && <ul className="m-0 mt-1 list-disc space-y-0.5 pl-4">{m.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                      {m.links && m.links.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {m.links.map((l) => <Link key={l.to + l.label} to={l.to} className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#4b3fd4] hover:bg-[#e0e7ff]">{l.label} →</Link>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {thinking && <div className="flex"><div className="rounded-2xl rounded-bl-md border border-[#dbe2fe] bg-white px-3 py-2 text-[#98a2b3]" aria-live="polite">Looking at your data…</div></div>}
              </div>
              <div className="flex-none border-t border-[#e5e7f5] bg-white px-3 pb-3 pt-2">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-[#c7d2fe] bg-white px-2 py-0.5 text-[10.5px] font-medium text-[#4b3fd4] hover:bg-[#eef2ff]">{s}</button>)}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); ask(q) }} className="flex items-center gap-2 rounded-xl border border-[#c7d2fe] px-3 py-1.5 focus-within:ring-2 focus-within:ring-[#c4b5fd]">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask AI anything…" aria-label="Ask AI anything" className="min-w-0 flex-1 bg-transparent text-[12px] text-[#101828] placeholder-[#98a2b3] focus:outline-none" />
                  <button type="submit" disabled={!q.trim()} aria-label="Send" className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4b3fd4] text-white disabled:opacity-40">→</button>
                </form>
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}
