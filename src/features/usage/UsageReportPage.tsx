/**
 * Usage Report: EPMP portal usage, MSIL Quality users (PIC, SIC, DPM) and vendors (vendor codes parts are assigned to).
 * Headline counts (registered / active / inactive), usage frequency (login days per month, active users) and
 * average time spent (per day / week / month); trends; days since last login; department-wise; user-wise and
 * vendor-wise tables.
 */
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { buildUsage } from '../../mock/usage'
import { useQAStore } from '../../store/qaStore'
import { buildCsv, downloadCsv } from '../mywork/csv'
import { DEMO_TODAY, fmtDate } from '../scope'
import { ColumnFilter } from '../ColumnFilter'
import { BANDS, INACTIVE_DAYS, addDays, daysIn, trend, userStats, vendorStats } from './usageStats'
import type { Grain, UserStat, VendorStat } from './usageStats'

const MSIL = '#2563eb'
const VEND = '#0d9488'
type PeriodId = '7' | '30' | '90' | '180' | 'custom' | `m:${string}`

export function UsageReportPage() {
  const parts = useQAStore((s) => s.parts)
  // Vendors parts are assigned to in EPMP (they lead the vendor list).
  const assigned = useMemo(() => [...new Map(parts.filter((p) => p.vendorCode).map((p) => [p.vendorCode, { code: p.vendorCode, name: p.vendorName }])).values()], [parts])
  const data = useMemo(() => buildUsage(DEMO_TODAY, assigned), [assigned])

  const months = useMemo(() => {
    const out: { id: PeriodId; label: string; from: string; to: string }[] = []
    for (let k = 0; k < 6; k++) {
      const d = new Date(`${DEMO_TODAY.slice(0, 7)}-01T00:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() - k)
      const from = d.toISOString().slice(0, 10)
      const e = new Date(d); e.setUTCMonth(e.getUTCMonth() + 1); e.setUTCDate(0)
      const to = e.toISOString().slice(0, 10) > DEMO_TODAY ? DEMO_TODAY : e.toISOString().slice(0, 10)
      out.push({ id: `m:${from}`, label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }), from, to })
    }
    return out
  }, [])
  const [period, setPeriod] = useState<PeriodId>('30')
  // Custom date range (any start and end within the data the portal holds).
  const [customFrom, setCustomFrom] = useState(() => addDays(DEMO_TODAY, -29))
  const [customTo, setCustomTo] = useState(DEMO_TODAY)
  const [dept, setDept] = useState('All')
  const [vendor, setVendor] = useState('All')
  const [grain, setGrain] = useState<Grain>('day')
  const [timeGrain, setTimeGrain] = useState<Grain>('day')
  const [q, setQ] = useState('')
  // The headline tiles filter the tables below: all / active / inactive, for MSIL users and for vendors.
  type StatusSel = 'all' | 'active' | 'inactive'
  const [msilSel, setMsilSel] = useState<StatusSel>('all')
  const [vendSel, setVendSel] = useState<StatusSel>('all')
  const keepSel = (sel: StatusSel, active: boolean) => sel === 'all' || (sel === 'active') === active

  const dataFrom = data.from, dataTo = data.to < DEMO_TODAY ? data.to : DEMO_TODAY
  const clampD = (d: string) => (d < dataFrom ? dataFrom : d > dataTo ? dataTo : d)
  const customBad = !customFrom || !customTo || customFrom > customTo
  const range = period === 'custom'
    ? { from: clampD(customBad ? addDays(DEMO_TODAY, -29) : customFrom), to: clampD(customBad ? DEMO_TODAY : customTo), label: 'Custom range' }
    : period.startsWith('m:') ? months.find((m) => m.id === period)! : { from: addDays(DEMO_TODAY, -(Number(period) - 1)), to: DEMO_TODAY, label: `Last ${period} days` }
  const { from, to } = range
  const keepMsil = (u: { kind: string; dept: string }) => u.kind === 'MSIL' && (dept === 'All' || u.dept === dept)
  const keepVendor = (u: { kind: string; vendorCode?: string }) => u.kind === 'Vendor' && (vendor === 'All' || u.vendorCode === vendor)

  const stats = useMemo(() => userStats(data, from, to), [data, from, to])
  const msil = stats.filter((s) => keepMsil(s.user))
  const vUsers = stats.filter((s) => keepVendor(s.user))
  const vendors = useMemo(() => vendorStats(vUsers, from, to), [vUsers, from, to])
  const series = useMemo(() => trend(data, from, to, grain, (u) => keepMsil(u) || keepVendor(u)), [data, from, to, grain, dept, vendor]) // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0)
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0)
  const msilActive = msil.filter((s) => s.active)
  const vendActive = vendors.filter((v) => v.active)
  const n = daysIn(from, to)
  // Average time spent per active user, per day / week / month of the period.
  const per = (g: Grain) => (g === 'day' ? n : g === 'week' ? n / 7 : n / 30)
  const avgTime = (users: UserStat[], g: Grain) => (users.length ? Math.round(sum(users, (u) => u.minutes) / users.length / per(g)) : 0)
  const vendActiveUsers = vUsers.filter((u) => u.active)
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`)

  const bands = BANDS.map((b) => ({ band: b.label, MSIL: msil.filter((s) => b.test(s.since)).length, Vendors: vendors.filter((v) => b.test(v.since)).length }))
  const depts = useMemo(() => {
    const m = new Map<string, UserStat[]>()
    for (const s of msil.filter((x) => keepSel(msilSel, x.active))) m.set(s.user.dept, [...(m.get(s.user.dept) ?? []), s])
    return [...m.entries()].map(([d, xs]) => {
      const act = xs.filter((x) => x.active)
      return { dept: d, users: xs.length, active: act.length, inactive: xs.length - act.length, minutes: sum(xs, (x) => x.minutes), perMonth: avg(act.map((x) => x.perMonth)), minDay: avgTime(act, 'day') }
    }).sort((a, b) => b.minutes - a.minutes)
  }, [msil, msilSel]) // eslint-disable-line react-hooks/exhaustive-deps

  const ql = q.trim().toLowerCase()
  const userRows = [...msil].filter((s) => keepSel(msilSel, s.active)).filter((s) => !ql || `${s.user.id} ${s.user.name} ${s.user.dept} ${s.user.role}`.toLowerCase().includes(ql)).sort((a, b) => b.minutes - a.minutes)
  const vendorRows = [...vendors].filter((v) => keepSel(vendSel, v.active)).filter((v) => !ql || `${v.code} ${v.name}`.toLowerCase().includes(ql)).sort((a, b) => b.minutes - a.minutes)
  const maxU = Math.max(1, ...userRows.map((s) => s.minutes)), maxV = Math.max(1, ...vendorRows.map((v) => v.minutes))
  const deptOptions = [...new Set(stats.filter((s) => s.user.kind === 'MSIL').map((s) => s.user.dept))].sort()
  const vendorOptions = [...new Map(stats.filter((s) => s.user.vendorCode).map((s) => [s.user.vendorCode!, s.user.vendorName!])).entries()].sort()


  const exportUsers = (rows: UserStat[]) => downloadCsv(`epmp-usage-msil-${from}-${to}.csv`, buildCsv(
    ['User ID', 'Name', 'Role', 'Department', 'Status', 'Login days', 'Login days / month', 'Avg min per login day', 'Total minutes', 'Last login'],
    rows.map((s) => [s.user.id, s.user.name, s.user.role, s.user.dept, s.active ? 'Active' : 'Inactive', s.loginDays, s.perMonth, s.minPerLoginDay, s.minutes, s.lastLogin ?? 'Never'])))
  const exportVendors = (rows: VendorStat[]) => downloadCsv(`epmp-usage-vendors-${from}-${to}.csv`, buildCsv(
    ['Vendor code', 'Vendor name', 'Linked users', 'Active users', 'Status', 'Login days', 'Login days / month', 'Avg min per login day', 'Total minutes', 'Last login'],
    rows.map((v) => [v.code, v.name, v.users.length, v.activeUsers, v.active ? 'Active' : 'Inactive', v.loginDays, v.perMonth, v.loginDays ? Math.round(v.minutes / Math.max(1, v.users.reduce((n, u) => n + u.loginDays, 0))) : 0, v.minutes, v.lastLogin ?? 'Never'])))

  const sel = 'h-9 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-[11.5px] text-[#344054]'
  const seg = <T extends string>(value: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="inline-flex rounded-lg bg-[#eef0f4] p-0.5">
      {opts.map(([id, l]) => (
        <button key={id} type="button" onClick={() => set(id)} aria-pressed={value === id}
          className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium ${value === id ? 'bg-white text-[#101828] shadow-sm' : 'text-[#475467]'}`}>{l}</button>
      ))}
    </div>
  )
  const tip = { contentStyle: { fontSize: 11, borderRadius: 8 } }

  return (
    <div className="pb-6">
      <PageHeader title="Usage Report" section="Modules" />
      {/* Title + period / filters */}
      <section className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 text-[18px] font-bold text-[#101828]">EPMP Quality Portal</h1>
          <p className="text-[11.5px] text-[#475467]">User adoption and vendor engagement · {fmtDate(from)} – {fmtDate(to)}</p>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)} aria-label="Period" className={sel}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="180">Last 180 days</option>
          {months.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          <option value="custom">Custom range…</option>
        </select>
        {period === 'custom' && (
          <span className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="usage-from">From</label>
            <input id="usage-from" type="date" value={customFrom} min={dataFrom} max={customTo || dataTo} onChange={(e) => setCustomFrom(e.target.value)} className={sel} />
            <span className="text-[11px] text-[var(--color-muted)]">to</span>
            <label className="sr-only" htmlFor="usage-to">To</label>
            <input id="usage-to" type="date" value={customTo} min={customFrom || dataFrom} max={dataTo} onChange={(e) => setCustomTo(e.target.value)} className={sel} />
            {customBad && <span role="alert" className="text-[10.5px] font-semibold text-red-700">Pick a start on or before the end date.</span>}
          </span>
        )}
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" className={sel}><option value="All">Dept: All</option>{deptOptions.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} aria-label="Vendor" className={`${sel} max-w-[220px]`}><option value="All">Vendor: All</option>{vendorOptions.map(([c, nm]) => <option key={c} value={c}>{c}: {nm}</option>)}</select>
        <span className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-[9.5px] font-semibold text-[var(--color-muted)]">SAMPLE DATA</span>
      </section>

      {/* Users / vendors */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {([
          ['MSIL Quality users', 'Total registered users (PIC, SIC, DPM)', 'users', MSIL, msil.length, msilActive.length, msilSel, setMsilSel, 'usage-msil-table'],
          ['Vendors', 'Vendor codes with parts in EPMP', 'users', VEND, vendors.length, vendActive.length, vendSel, setVendSel, 'usage-vendor-table'],
        ] as const).map(([t, sub, icon, c, total, act, sel, setSel, target]) => (
          <section key={t} className="epmp-card p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${c}18`, color: c }}><Icon name={icon} size={20} /></span>
              {([['all', total, t.startsWith('MSIL') ? 'Total registered' : 'Total vendors', '#101828'], ['active', act, 'Active', c], ['inactive', total - act, `Inactive (no login ${INACTIVE_DAYS} d)`, '#f59e0b']] as const).map(([id, v, label, col], k) => (
                <button key={id} type="button" onClick={() => { setSel(sel === id ? 'all' : id); setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }} aria-pressed={sel === id}
                  title={sel === id && id !== 'all' ? 'Click again to show all' : `Show ${id === 'all' ? 'all' : id} ${t.startsWith('MSIL') ? 'users' : 'vendors'} in the tables below`}
                  className={`rounded-lg px-2.5 py-1 text-left transition-colors hover:bg-[var(--color-surface)] ${k ? 'border-l border-[var(--color-border)] pl-4' : 'min-w-[150px]'} ${sel === id ? 'bg-secondary ring-1 ring-[#bfdbfe]' : ''}`}>
                  {k === 0 && <div className="text-[11px] font-semibold uppercase tracking-wide text-[#344054]">{t}</div>}
                  <div className={k === 0 ? 'text-[26px] font-bold leading-tight text-[#101828]' : 'text-[22px] font-bold'} style={k ? { color: col } : undefined}>{v.toLocaleString()}</div>
                  <div className="text-[10.5px] text-[var(--color-muted)]">{k === 0 ? sub : label}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-amber-400"><div style={{ width: `${pct(act, total)}%`, background: c }} /></div>
              <span className="text-[11px] font-semibold text-[#344054]">{pct(act, total)}% active</span>
            </div>
          </section>
        ))}
      </div>

      {/* Frequency, time */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['Usage frequency · MSIL', `${avg(msilActive.map((s) => s.perMonth))}`, 'login days / month, active users', MSIL],
          ['Usage frequency · Vendor', `${avg(vendActive.map((v) => v.perMonth))}`, 'login days / month, active vendors', VEND],
        ].map(([t, v, sub, c]) => (
          <section key={t} className="epmp-card px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#344054]">{t}</div>
            <div className="text-[22px] font-bold leading-tight" style={{ color: c }}>{v}</div>
            <div className="text-[10px] text-[var(--color-muted)]">{sub}</div>
          </section>
        ))}
        <section className="epmp-card px-3.5 py-3">
          <div className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#344054]">Avg time spent</div>
          <div className="my-1">{seg(timeGrain, setTimeGrain, [['day', 'Day'], ['week', 'Week'], ['month', 'Month']])}</div>
          <div className="flex justify-between text-[11px]"><span className="text-[var(--color-muted)]">MSIL</span><strong style={{ color: MSIL }}>{fmtMin(avgTime(msilActive, timeGrain))}</strong></div>
          <div className="flex justify-between text-[11px]"><span className="text-[var(--color-muted)]">Vendor</span><strong style={{ color: VEND }}>{fmtMin(avgTime(vendActiveUsers, timeGrain))}</strong></div>
          <div className="text-[9.5px] text-[var(--color-muted)]">per active user per {timeGrain}</div>
        </section>
      </div>

      {/* Trends */}
      <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="epmp-card p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="text-[12.5px] font-semibold text-[#101828]">Portal usage trend</h3>
            <span className="text-[10px] text-[var(--color-muted)]">average time spent, minutes per user who logged in</span>
            <span className="ml-auto">{seg(grain, setGrain, [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']])}</span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="label" fontSize={10} stroke="#98a2b3" tickLine={false} minTickGap={16} />
                <YAxis fontSize={10} stroke="#98a2b3" tickLine={false} allowDecimals={false} unit=" m" />
                <Tooltip {...tip} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="msilAvgMin" name="MSIL users (min)" stroke={MSIL} strokeWidth={2} dot={grain !== 'day'} isAnimationActive={false} />
                <Line type="monotone" dataKey="vendorAvgMin" name="Vendors (min)" stroke={VEND} strokeWidth={2} dot={grain !== 'day'} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="epmp-card p-3">
          <div className="mb-1 flex items-center gap-2"><h3 className="text-[12.5px] font-semibold text-[#101828]">Days since last login</h3><span className="text-[10px] text-[var(--color-muted)]">at {fmtDate(to)} · inactive = {INACTIVE_DAYS}+ d</span></div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bands} layout="vertical" margin={{ top: 2, right: 26, left: 6, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" fontSize={10} stroke="#98a2b3" allowDecimals={false} tickLine={false} />
                <YAxis type="category" dataKey="band" width={96} fontSize={10.5} stroke="#475467" tickLine={false} axisLine={false} />
                <Tooltip {...tip} /><Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="MSIL" fill={MSIL} radius={[0, 3, 3, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 10 }} />
                <Bar dataKey="Vendors" fill={VEND} radius={[0, 3, 3, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3">
        <UsageTable<(typeof depts)[number]> title="Department-wise (MSIL)" color={MSIL} note={msilSel === 'all' ? undefined : `${msilSel} users only`} onClearNote={() => setMsilSel('all')}
          rows={depts} rowKey={(d) => d.dept} maxHeight="max-h-[260px]"
          rowProps={(d) => ({ onClick: () => setDept(d.dept === dept ? 'All' : d.dept), title: 'Filter the report to this department', className: `cursor-pointer ${dept === d.dept ? 'bg-secondary' : ''}` })}
          columns={[
            { label: 'Dept', val: (d) => d.dept, cell: (d) => <span className="font-semibold text-[#101828]">{d.dept}</span> },
            { label: 'Users', val: (d) => d.users, cell: (d) => d.users },
            { label: 'Active', val: (d) => d.active, cell: (d) => <span className="text-blue-700">{d.active}</span> },
            { label: 'Inactive', val: (d) => d.inactive, cell: (d) => <span className="text-amber-600">{d.inactive}</span> },
            { label: 'Total time', val: (d) => d.minutes, cell: (d) => <span className="tabular-nums">{fmtMin(d.minutes)}</span> },
            { label: 'Days / month', val: (d) => d.perMonth, cell: (d) => d.perMonth },
            { label: 'Avg / day', val: (d) => d.minDay, cell: (d) => fmtMin(d.minDay) },
          ]} />
      </div>

      {/* User-wise / vendor-wise */}
      <div className="mb-2 flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user ID, name, dept, vendor code…" aria-label="Search users and vendors"
          className="h-8 w-72 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-[11px]" />
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <UsageTable<UserStat> id="usage-msil-table" title="MSIL user-wise usage" color={MSIL} note={msilSel === 'all' ? undefined : `${msilSel} users only`} onClearNote={() => setMsilSel('all')}
          rows={userRows} rowKey={(s) => s.user.id} limit={8} onExport={exportUsers}
          columns={[
            { label: 'User ID', val: (s) => s.user.id, cell: (s) => <span className="font-mono text-[#101828]">{s.user.id}</span> },
            { label: 'Name', val: (s) => s.user.name, cell: (s) => s.user.name },
            { label: 'Role · Dept', val: (s) => `${s.user.role} · ${s.user.dept}`, cell: (s) => <span className="text-[#475467]">{s.user.role} · {s.user.dept}</span> },
            { label: 'Status', val: (s) => (s.active ? 'Active' : 'Inactive'), options: ['Active', 'Inactive'], cell: (s) => <StatusPill active={s.active} since={s.since} /> },
            { label: 'Total time', val: (s) => s.minutes, text: (s) => fmtMin(s.minutes), cell: (s) => <TimeBar v={s.minutes} max={maxU} color={MSIL} fmtMin={fmtMin} /> },
            { label: 'Days / mo', val: (s) => (s.active ? s.perMonth : -1), text: (s) => (s.active ? String(s.perMonth) : '—'), cell: (s) => <span className="tabular-nums">{s.active ? s.perMonth : '—'}</span> },
            { label: 'Avg / login day', val: (s) => s.minPerLoginDay, text: (s) => (s.loginDays ? fmtMin(s.minPerLoginDay) : '—'), cell: (s) => (s.loginDays ? fmtMin(s.minPerLoginDay) : '—') },
            { label: 'Last login', val: (s) => s.lastLogin ?? '', text: (s) => (s.lastLogin ? `${fmtDate(s.lastLogin)} ${s.lastLogin}` : 'Never'), cell: (s) => <span className="whitespace-nowrap">{s.lastLogin ? fmtDate(s.lastLogin) : 'Never'}</span> },
          ]} />
        <UsageTable<VendorStat> id="usage-vendor-table" title="Vendor-wise usage" color={VEND} note={vendSel === 'all' ? undefined : `${vendSel} vendors only`} onClearNote={() => setVendSel('all')}
          rows={vendorRows} rowKey={(v) => v.code} limit={8} onExport={exportVendors}
          rowProps={(v) => ({ title: v.users.map((u) => `${u.user.id} ${u.user.name}: ${fmtMin(u.minutes)}${u.lastLogin ? `, last ${u.lastLogin}` : ', never'}`).join('\n') })}
          columns={[
            { label: 'Vendor code', val: (v) => v.code, cell: (v) => <span className="font-mono text-[#101828]">{v.code}</span> },
            { label: 'Vendor name', val: (v) => v.name, cell: (v) => v.name },
            { label: 'Status', val: (v) => (v.active ? 'Active' : 'Inactive'), options: ['Active', 'Inactive'], cell: (v) => <StatusPill active={v.active} since={v.since} /> },
            { label: 'Users (active)', val: (v) => v.users.length, text: (v) => `${v.users.length} (${v.activeUsers})`, cell: (v) => <span className="tabular-nums">{v.users.length} ({v.activeUsers})</span> },
            { label: 'Total time', val: (v) => v.minutes, text: (v) => fmtMin(v.minutes), cell: (v) => <TimeBar v={v.minutes} max={maxV} color={VEND} fmtMin={fmtMin} /> },
            { label: 'Days / mo', val: (v) => (v.active ? v.perMonth : -1), text: (v) => (v.active ? String(v.perMonth) : '—'), cell: (v) => <span className="tabular-nums">{v.active ? v.perMonth : '—'}</span> },
            { label: 'Avg / login day', val: (v) => (v.minutes ? Math.round(v.minutes / Math.max(1, sumDays(v))) : 0), text: (v) => (v.minutes ? fmtMin(Math.round(v.minutes / Math.max(1, sumDays(v)))) : '—'), cell: (v) => (v.minutes ? fmtMin(Math.round(v.minutes / Math.max(1, sumDays(v)))) : '—') },
            { label: 'Last login', val: (v) => v.lastLogin ?? '', text: (v) => (v.lastLogin ? `${fmtDate(v.lastLogin)} ${v.lastLogin}` : 'Never'), cell: (v) => <span className="whitespace-nowrap">{v.lastLogin ? fmtDate(v.lastLogin) : 'Never'}</span> },
          ]} />
      </div>

      <p className="mt-2 text-[10px] text-[var(--color-muted)]">
        Rules: Active = at least one login in the {INACTIVE_DAYS} days up to the period end; Inactive = no login in those {INACTIVE_DAYS} days. Usage frequency = login days per month in the period, active users only.
        Average time spent = minutes per active user per day / week / month. A vendor is active when one of its linked users is. Sample data generated for the prototype.
      </p>
    </div>
  )
}

interface Col<T> {
  label: string
  /** What the column sorts on (numbers sort numerically). */
  val: (r: T) => string | number
  /** What the column's filter box matches (default: val). */
  text?: (r: T) => string
  /** A fixed set of values: the filter is a drop-down matching exactly. */
  options?: string[]
  cell: (r: T) => React.ReactNode
}
/**
 * A usage table: click a header to sort (ascending, descending, back to the given order), type in a column's box to
 * filter it. `limit` shows the top N with a "View all" switch; `onExport` gets the rows as listed.
 */
function UsageTable<T>({ id, title, color, note, onClearNote, rows, columns, rowKey, rowProps, limit, onExport, maxHeight }: {
  id?: string; title: string; color: string; note?: string; onClearNote?: () => void
  rows: T[]; columns: Col<T>[]; rowKey: (r: T) => string
  rowProps?: (r: T) => { onClick?: () => void; title?: string; className?: string }
  limit?: number; onExport?: (rows: T[]) => void; maxHeight?: string
}) {
  const [all, setAll] = useState(false)
  const [sortBy, setSortBy] = useState<{ col: number; dir: 'asc' | 'desc' } | null>(null)
  const [filters, setFilters] = useState<Record<number, string[]>>({})
  const listed = useMemo(() => {
    const active = columns.map((c, i) => [c, filters[i] ?? []] as const).filter(([, vs]) => vs.length)
    let out = active.length ? rows.filter((r) => active.every(([c, vs]) => vs.includes(String((c.text ?? c.val)(r))))) : rows
    if (sortBy) {
      const c = columns[sortBy.col], dir = sortBy.dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => {
        const x = c.val(a), y = c.val(b)
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir
      })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, sortBy])
  const shown = limit && !all ? listed.slice(0, limit) : listed
  /** The values a column holds (its drop-down lists them). */
  const valuesOf = (c: Col<T>) => [...new Set(rows.map((r) => String((c.text ?? c.val)(r))).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const anyFilter = Object.values(filters).some((v) => v.length > 0)
  const clickSort = (i: number) => setSortBy((cur) => (!cur || cur.col !== i ? { col: i, dir: 'asc' } : cur.dir === 'asc' ? { col: i, dir: 'desc' } : null))
  return (
    <section id={id} className="epmp-card scroll-mt-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
        <h3 className="text-[12.5px] font-semibold text-[#101828]">{title}</h3>
        <span className="text-[10px] text-[var(--color-muted)]">{limit && !all ? `top ${Math.min(limit, listed.length)} of ${listed.length}` : `${listed.length} row${listed.length === 1 ? '' : 's'}`}{sortBy ? '' : ' · by time spent'}</span>
        {note && (
          <button type="button" onClick={onClearNote} title="Show all again" className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold capitalize text-primary hover:brightness-95">{note} ✕</button>
        )}
        {anyFilter && <button type="button" onClick={() => setFilters({})} className="text-[10.5px] font-semibold text-[var(--color-accent)] hover:underline">Clear column filters</button>}
        {onExport && <button type="button" onClick={() => onExport(listed)} className="ml-auto text-[10.5px] font-semibold text-[var(--color-muted)] hover:underline"><Icon name="download" size={11} className="mr-0.5" />CSV</button>}
        {limit && <button type="button" onClick={() => setAll(!all)} className={`${onExport ? '' : 'ml-auto '}text-[10.5px] font-semibold text-[var(--color-accent)] hover:underline`}>{all ? `Show top ${limit}` : 'View all'}</button>}
      </div>
      <div className={all ? 'max-h-[460px] overflow-auto' : maxHeight ? `${maxHeight} overflow-auto` : 'overflow-x-auto'}>
        <table className="w-full text-[10.5px]">
          <thead className="sticky top-0">
            <tr className="text-left">
              {columns.map((c, i) => {
                const on = sortBy?.col === i
                return (
                  <th key={c.label} className="px-2.5 py-1.5" aria-sort={on ? (sortBy!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => clickSort(i)} title={`Sort by ${c.label}`} className="inline-flex items-center gap-1 whitespace-nowrap font-medium hover:text-[var(--color-primary)]">
                      {c.label}<span className={on ? 'text-[var(--color-primary)]' : 'text-[#98a2b3]'} aria-hidden="true">{on ? (sortBy!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
            <tr className="text-left">
              {columns.map((c, i) => (
                <th key={c.label} className="px-2.5 pb-1.5 font-normal">
                  <ColumnFilter label={c.label} options={c.options ?? valuesOf(c)} selected={filters[i] ?? []} minWidth={64}
                    onChange={(next) => setFilters((f) => ({ ...f, [i]: next }))} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const rp = rowProps?.(r)
              return (
                <tr key={rowKey(r)} onClick={rp?.onClick} title={rp?.title} className={`border-t border-[var(--color-border)] hover:bg-[var(--color-surface)] ${rp?.className ?? ''}`}>
                  {columns.map((c) => <td key={c.label} className="px-2.5 py-1.5">{c.cell(r)}</td>)}
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-[var(--color-muted)]">No rows match.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
/** Active / Inactive pill ("Inactive" also says how long, or that the user never logged in). */
function StatusPill({ active, since }: { active: boolean; since?: number }) {
  return active
    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-800">Active</span>
    : <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-semibold text-amber-800">Inactive{since === undefined ? ' · never logged in' : ` · ${since} d`}</span>
}
function TimeBar({ v, max, color, fmtMin }: { v: number; max: number; color: string; fmtMin: (m: number) => string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-24 overflow-hidden rounded bg-[#eef2f7]"><span className="block h-full rounded" style={{ width: `${(v / max) * 100}%`, background: color }} /></span>
      <span className="whitespace-nowrap tabular-nums">{fmtMin(v)}</span>
    </span>
  )
}
const sumDays = (v: VendorStat) => v.users.reduce((n, u) => n + u.loginDays, 0)
