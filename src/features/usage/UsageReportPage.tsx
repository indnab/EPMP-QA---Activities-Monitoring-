/**
 * Usage Report: EPMP portal usage, MSIL Quality users (PIC, SIC, DPM) and vendors (vendor codes parts are assigned to).
 * Headline counts (registered / active / inactive), hits, usage frequency (login days per month, active users) and
 * average time spent (per day / week / month); trends; days since last login; department-wise; user-wise and
 * vendor-wise tables; and who to follow up (inactive > 90 days, never logged in).
 */
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../../components'
import { Icon } from '../../components/Icon'
import { buildUsage } from '../../mock/usage'
import { useQAStore } from '../../store/qaStore'
import { buildCsv, downloadCsv } from '../mywork/csv'
import { DEMO_TODAY, fmtDate } from '../scope'
import { BANDS, INACTIVE_DAYS, addDays, daysIn, trend, userStats, vendorStats } from './usageStats'
import type { Grain, UserStat, VendorStat } from './usageStats'

const MSIL = '#2563eb'
const VEND = '#0d9488'
type PeriodId = '7' | '30' | '90' | '180' | `m:${string}`

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
  const [dept, setDept] = useState('All')
  const [vendor, setVendor] = useState('All')
  const [role, setRole] = useState('All')
  const [grain, setGrain] = useState<Grain>('day')
  const [timeGrain, setTimeGrain] = useState<Grain>('day')
  const [allUsers, setAllUsers] = useState(false)
  const [allVendors, setAllVendors] = useState(false)
  const [q, setQ] = useState('')

  const range = period.startsWith('m:') ? months.find((m) => m.id === period)! : { from: addDays(DEMO_TODAY, -(Number(period) - 1)), to: DEMO_TODAY, label: `Last ${period} days` }
  const { from, to } = range
  const keepMsil = (u: { kind: string; dept: string; role: string }) => u.kind === 'MSIL' && (dept === 'All' || u.dept === dept) && (role === 'All' || u.role === role)
  const keepVendor = (u: { kind: string; vendorCode?: string }) => u.kind === 'Vendor' && (vendor === 'All' || u.vendorCode === vendor)

  const stats = useMemo(() => userStats(data, from, to), [data, from, to])
  const msil = stats.filter((s) => keepMsil(s.user))
  const vUsers = stats.filter((s) => keepVendor(s.user))
  const vendors = useMemo(() => vendorStats(vUsers, from, to), [vUsers, from, to])
  const series = useMemo(() => trend(data, from, to, grain, (u) => keepMsil(u) || keepVendor(u)), [data, from, to, grain, dept, vendor, role]) // eslint-disable-line react-hooks/exhaustive-deps

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
    for (const s of msil) m.set(s.user.dept, [...(m.get(s.user.dept) ?? []), s])
    return [...m.entries()].map(([d, xs]) => {
      const act = xs.filter((x) => x.active)
      return { dept: d, users: xs.length, active: act.length, inactive: xs.length - act.length, hits: sum(xs, (x) => x.hits), perMonth: avg(act.map((x) => x.perMonth)), minDay: avgTime(act, 'day') }
    }).sort((a, b) => b.hits - a.hits)
  }, [msil]) // eslint-disable-line react-hooks/exhaustive-deps

  const ql = q.trim().toLowerCase()
  const userRows = [...msil].filter((s) => !ql || `${s.user.id} ${s.user.name} ${s.user.dept} ${s.user.role}`.toLowerCase().includes(ql)).sort((a, b) => b.hits - a.hits)
  const vendorRows = [...vendors].filter((v) => !ql || `${v.code} ${v.name}`.toLowerCase().includes(ql)).sort((a, b) => b.hits - a.hits)
  const maxU = Math.max(1, ...userRows.map((s) => s.hits)), maxV = Math.max(1, ...vendorRows.map((v) => v.hits))
  const deptOptions = [...new Set(stats.filter((s) => s.user.kind === 'MSIL').map((s) => s.user.dept))].sort()
  const vendorOptions = [...new Map(stats.filter((s) => s.user.vendorCode).map((s) => [s.user.vendorCode!, s.user.vendorName!])).entries()].sort()

  const follow = {
    msil90: msil.filter((s) => s.since !== undefined && s.since >= INACTIVE_DAYS).length, vend90: vendors.filter((v) => v.since !== undefined && v.since >= INACTIVE_DAYS).length,
    msilNever: msil.filter((s) => s.since === undefined).length, vendNever: vendors.filter((v) => v.since === undefined).length,
  }

  const exportUsers = () => downloadCsv(`epmp-usage-msil-${from}-${to}.csv`, buildCsv(
    ['User ID', 'Name', 'Role', 'Department', 'Status', 'Hits', 'Login days', 'Login days / month', 'Avg min per login day', 'Total minutes', 'Last login'],
    userRows.map((s) => [s.user.id, s.user.name, s.user.role, s.user.dept, s.active ? 'Active' : 'Inactive', s.hits, s.loginDays, s.perMonth, s.minPerLoginDay, s.minutes, s.lastLogin ?? 'Never'])))
  const exportVendors = () => downloadCsv(`epmp-usage-vendors-${from}-${to}.csv`, buildCsv(
    ['Vendor code', 'Vendor name', 'Linked users', 'Active users', 'Status', 'Hits', 'Login days', 'Login days / month', 'Total minutes', 'Last login'],
    vendorRows.map((v) => [v.code, v.name, v.users.length, v.activeUsers, v.active ? 'Active' : 'Inactive', v.hits, v.loginDays, v.perMonth, v.minutes, v.lastLogin ?? 'Never'])))

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
          <h1 className="flex items-center gap-2 text-[18px] font-bold text-[#101828]">EPMP Quality Portal <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">QUALITY ONLY</span></h1>
          <p className="text-[11.5px] text-[#475467]">User adoption and vendor engagement · {fmtDate(from)} – {fmtDate(to)}</p>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)} aria-label="Period" className={sel}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="180">Last 180 days</option>
          {months.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className={sel}><option value="All">MSIL role: All</option>{['PIC', 'SIC', 'DPM'].map((r) => <option key={r}>{r}</option>)}</select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" className={sel}><option value="All">Dept: All</option>{deptOptions.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} aria-label="Vendor" className={`${sel} max-w-[220px]`}><option value="All">Vendor: All</option>{vendorOptions.map(([c, nm]) => <option key={c} value={c}>{c}: {nm}</option>)}</select>
        <span className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-[9.5px] font-semibold text-[var(--color-muted)]">SAMPLE DATA</span>
      </section>

      {/* Users / vendors */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {([
          ['MSIL Quality users', 'Total registered users (PIC, SIC, DPM)', 'users', MSIL, msil.length, msilActive.length],
          ['Vendors', 'Vendor codes with parts in EPMP', 'users', VEND, vendors.length, vendActive.length],
        ] as const).map(([t, sub, icon, c, total, act]) => (
          <section key={t} className="epmp-card p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${c}18`, color: c }}><Icon name={icon} size={20} /></span>
              <div className="min-w-[150px]"><div className="text-[11px] font-semibold uppercase tracking-wide text-[#344054]">{t}</div><div className="text-[26px] font-bold leading-tight text-[#101828]">{total.toLocaleString()}</div><div className="text-[10.5px] text-[var(--color-muted)]">{sub}</div></div>
              <div className="border-l border-[var(--color-border)] pl-4"><div className="text-[22px] font-bold" style={{ color: c }}>{act}</div><div className="text-[10.5px] text-[var(--color-muted)]">Active</div></div>
              <div className="border-l border-[var(--color-border)] pl-4"><div className="text-[22px] font-bold text-amber-500">{total - act}</div><div className="text-[10.5px] text-[var(--color-muted)]">Inactive (no login {INACTIVE_DAYS} d)</div></div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-amber-400"><div style={{ width: `${pct(act, total)}%`, background: c }} /></div>
              <span className="text-[11px] font-semibold text-[#344054]">{pct(act, total)}% active</span>
            </div>
          </section>
        ))}
      </div>

      {/* Hits, frequency, time */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ['MSIL user hits', sum(msil, (s) => s.hits).toLocaleString(), 'page views in the period', MSIL],
          ['Vendor hits', sum(vendors, (v) => v.hits).toLocaleString(), 'across linked users', VEND],
          ['Total portal hits', (sum(msil, (s) => s.hits) + sum(vendors, (v) => v.hits)).toLocaleString(), `${fmtDate(from)} – ${fmtDate(to)}`, '#344054'],
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
            <span className="text-[10px] text-[var(--color-muted)]">hits</span>
            <span className="ml-auto">{seg(grain, setGrain, [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']])}</span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="label" fontSize={10} stroke="#98a2b3" tickLine={false} minTickGap={16} />
                <YAxis fontSize={10} stroke="#98a2b3" tickLine={false} allowDecimals={false} />
                <Tooltip {...tip} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="msilHits" name="MSIL users" stroke={MSIL} strokeWidth={2} dot={grain !== 'day'} isAnimationActive={false} />
                <Line type="monotone" dataKey="vendorHits" name="Vendors" stroke={VEND} strokeWidth={2} dot={grain !== 'day'} isAnimationActive={false} />
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
      <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="epmp-card p-3">
          <div className="mb-1 flex items-center gap-2"><h3 className="text-[12.5px] font-semibold text-[#101828]">Average time spent trend</h3><span className="text-[10px] text-[var(--color-muted)]">minutes per user who logged in, per {grain}</span></div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="label" fontSize={10} stroke="#98a2b3" tickLine={false} minTickGap={16} />
                <YAxis fontSize={10} stroke="#98a2b3" tickLine={false} unit=" m" />
                <Tooltip {...tip} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="msilAvgMin" name="MSIL users (min)" stroke={MSIL} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="vendorAvgMin" name="Vendors (min)" stroke={VEND} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="epmp-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2"><h3 className="text-[12.5px] font-semibold text-[#101828]">Department-wise (MSIL)</h3></div>
          <div className="max-h-[200px] overflow-auto">
            <table className="w-full text-[10.5px]">
              <thead className="sticky top-0"><tr className="text-left"><th className="px-3 py-1.5">Dept</th><th className="px-2 py-1.5">Users</th><th className="px-2 py-1.5">Active</th><th className="px-2 py-1.5">Inactive</th><th className="px-2 py-1.5">Hits</th><th className="px-2 py-1.5">Days / month</th><th className="px-2 py-1.5">Avg / day</th></tr></thead>
              <tbody>{depts.map((d) => (
                <tr key={d.dept} onClick={() => setDept(d.dept === dept ? 'All' : d.dept)} className={`cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface)] ${dept === d.dept ? 'bg-secondary' : ''}`} title="Filter the report to this department">
                  <td className="px-3 py-1.5 font-semibold text-[#101828]">{d.dept}</td><td className="px-2 py-1.5">{d.users}</td><td className="px-2 py-1.5 text-blue-700">{d.active}</td><td className="px-2 py-1.5 text-amber-600">{d.inactive}</td>
                  <td className="px-2 py-1.5 tabular-nums">{d.hits.toLocaleString()}</td><td className="px-2 py-1.5">{d.perMonth}</td><td className="px-2 py-1.5">{fmtMin(d.minDay)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>

      {/* User-wise / vendor-wise */}
      <div className="mb-2 flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user ID, name, dept, vendor code…" aria-label="Search users and vendors"
          className="h-8 w-72 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-[11px]" />
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <UsageTable title="MSIL user-wise usage" color={MSIL} rows={userRows.length} all={allUsers} setAll={setAllUsers} onExport={exportUsers}
          head={['User ID', 'Name', 'Role · Dept', 'Hits', 'Days / mo', 'Avg / login day', 'Last login']}
          body={(allUsers ? userRows : userRows.slice(0, 8)).map((s) => <UserRow key={s.user.id} s={s} max={maxU} color={MSIL} fmtMin={fmtMin} />)} />
        <UsageTable title="Vendor-wise usage" color={VEND} rows={vendorRows.length} all={allVendors} setAll={setAllVendors} onExport={exportVendors}
          head={['Vendor code', 'Vendor name', 'Users (active)', 'Hits', 'Days / mo', 'Time', 'Last login']}
          body={(allVendors ? vendorRows : vendorRows.slice(0, 8)).map((v) => <VendorRow key={v.code} v={v} max={maxV} color={VEND} fmtMin={fmtMin} />)} />
      </div>

      {/* Follow-up */}
      <section className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
        <span className="flex items-center gap-2 font-bold uppercase tracking-wide"><Icon name="exclamation-circle" size={16} />Follow-up priority</span>
        <span><strong className="text-[16px]">{follow.msil90}</strong> MSIL users and <strong className="text-[16px]">{follow.vend90}</strong> vendors inactive &gt; {INACTIVE_DAYS} days</span>
        <span><strong className="text-[16px]">{follow.msilNever}</strong> MSIL users and <strong className="text-[16px]">{follow.vendNever}</strong> vendors have never logged in</span>
      </section>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">
        Rules: Active = at least one login in the {INACTIVE_DAYS} days up to the period end; Inactive = no login in those {INACTIVE_DAYS} days. Usage frequency = login days per month in the period, active users only.
        Average time spent = minutes per active user per day / week / month. A vendor is active when one of its linked users is. Hits = page views excluding system traffic. Sample data generated for the prototype.
      </p>
    </div>
  )
}

function UsageTable({ title, color, rows, all, setAll, onExport, head, body }: {
  title: string; color: string; rows: number; all: boolean; setAll: (v: boolean) => void; onExport: () => void; head: string[]; body: React.ReactNode
}) {
  return (
    <section className="epmp-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
        <h3 className="text-[12.5px] font-semibold text-[#101828]">{title}</h3>
        <span className="text-[10px] text-[var(--color-muted)]">{all ? `all ${rows}` : `top ${Math.min(8, rows)} of ${rows}`} · by hits</span>
        <button type="button" onClick={onExport} className="ml-auto text-[10.5px] font-semibold text-[var(--color-muted)] hover:underline"><Icon name="download" size={11} className="mr-0.5" />CSV</button>
        <button type="button" onClick={() => setAll(!all)} className="text-[10.5px] font-semibold text-[var(--color-accent)] hover:underline">{all ? 'Show top 8' : 'View all'}</button>
      </div>
      <div className={all ? 'max-h-[460px] overflow-auto' : ''}>
        <table className="w-full text-[10.5px]">
          <thead className="sticky top-0"><tr className="text-left">{head.map((h) => <th key={h} className="px-2.5 py-1.5">{h}</th>)}</tr></thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </section>
  )
}
const status = (active: boolean, since?: number) =>
  since === undefined ? <span className="rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold text-slate-600">Never</span>
    : active ? null : <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold text-amber-800">Inactive {since} d</span>
function HitsBar({ v, max, color }: { v: number; max: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-24 overflow-hidden rounded bg-[#eef2f7]"><span className="block h-full rounded" style={{ width: `${(v / max) * 100}%`, background: color }} /></span>
      <span className="tabular-nums">{v.toLocaleString()}</span>
    </span>
  )
}
function UserRow({ s, max, color, fmtMin }: { s: UserStat; max: number; color: string; fmtMin: (m: number) => string }) {
  return (
    <tr className="border-t border-[var(--color-border)]">
      <td className="px-2.5 py-1.5 font-mono text-[#101828]">{s.user.id}</td>
      <td className="px-2.5 py-1.5">{s.user.name} {status(s.active, s.since)}</td>
      <td className="px-2.5 py-1.5 text-[#475467]">{s.user.role} · {s.user.dept}</td>
      <td className="px-2.5 py-1.5"><HitsBar v={s.hits} max={max} color={color} /></td>
      <td className="px-2.5 py-1.5 tabular-nums">{s.active ? s.perMonth : '—'}</td>
      <td className="px-2.5 py-1.5">{s.loginDays ? fmtMin(s.minPerLoginDay) : '—'}</td>
      <td className="whitespace-nowrap px-2.5 py-1.5">{s.lastLogin ? fmtDate(s.lastLogin) : 'Never'}</td>
    </tr>
  )
}
function VendorRow({ v, max, color, fmtMin }: { v: VendorStat; max: number; color: string; fmtMin: (m: number) => string }) {
  return (
    <tr className="border-t border-[var(--color-border)]" title={v.users.map((u) => `${u.user.id} ${u.user.name}: ${u.hits} hits${u.lastLogin ? `, last ${u.lastLogin}` : ', never'}`).join('\n')}>
      <td className="px-2.5 py-1.5 font-mono text-[#101828]">{v.code}</td>
      <td className="px-2.5 py-1.5">{v.name} {status(v.active, v.since)}</td>
      <td className="px-2.5 py-1.5 tabular-nums">{v.users.length} ({v.activeUsers})</td>
      <td className="px-2.5 py-1.5"><HitsBar v={v.hits} max={max} color={color} /></td>
      <td className="px-2.5 py-1.5 tabular-nums">{v.active ? v.perMonth : '—'}</td>
      <td className="px-2.5 py-1.5">{v.minutes ? fmtMin(v.minutes) : '—'}</td>
      <td className="whitespace-nowrap px-2.5 py-1.5">{v.lastLogin ? fmtDate(v.lastLogin) : 'Never'}</td>
    </tr>
  )
}
