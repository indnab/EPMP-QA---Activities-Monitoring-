/**
 * Usage Report calculations over the login log (src/mock/usage.ts), for a period [from, to]:
 *  - Active = logged in within the 90 days up to the period end; Inactive = no login in those 90 days.
 *  - Usage frequency = login days per month (30 days) in the period, for active users.
 *  - Average time spent = minutes per active user per day / week / month in the period.
 * A vendor is active when at least one of its linked users is active.
 */
import type { UsageData, UsageDay, UsageUser } from '../../mock/usage'

export const INACTIVE_DAYS = 90
const DAY = 86_400_000
const num = (d: string) => Date.parse(`${d}T00:00:00Z`)
export const daysIn = (from: string, to: string) => Math.round((num(to) - num(from)) / DAY) + 1
export const addDays = (d: string, n: number) => new Date(num(d) + n * DAY).toISOString().slice(0, 10)

export interface UserStat {
  user: UsageUser
  loginDays: number
  hits: number
  minutes: number
  /** Last login up to the period end. */
  lastLogin?: string
  /** Days since the last login, at the period end (undefined = never). */
  since?: number
  active: boolean
  /** Login days per month (period normalised to 30 days). */
  perMonth: number
  /** Average minutes on a day the user logged in. */
  minPerLoginDay: number
}
export interface VendorStat {
  code: string
  name: string
  users: UserStat[]
  activeUsers: number
  loginDays: number
  hits: number
  minutes: number
  lastLogin?: string
  since?: number
  active: boolean
  perMonth: number
}

export function userStats(data: UsageData, from: string, to: string): UserStat[] {
  const byUser = new Map<string, UsageDay[]>()
  for (const d of data.days) {
    if (d.date > to) continue
    const xs = byUser.get(d.userId)
    if (xs) xs.push(d); else byUser.set(d.userId, [d])
  }
  const months = daysIn(from, to) / 30
  return data.users.map((user) => {
    const all = byUser.get(user.id) ?? []
    const inP = all.filter((d) => d.date >= from)
    const lastLogin = all.length ? all.reduce((m, d) => (d.date > m ? d.date : m), all[0].date) : undefined
    const since = lastLogin ? Math.round((num(to) - num(lastLogin)) / DAY) : undefined
    const minutes = inP.reduce((n, d) => n + d.minutes, 0)
    const active = since !== undefined && since < INACTIVE_DAYS
    return {
      user, loginDays: inP.length, hits: inP.reduce((n, d) => n + d.hits, 0), minutes, lastLogin, since, active,
      perMonth: active ? Math.round((inP.length / months) * 10) / 10 : 0,
      minPerLoginDay: inP.length ? Math.round(minutes / inP.length) : 0,
    }
  })
}

export function vendorStats(users: UserStat[], from: string, to: string): VendorStat[] {
  const months = daysIn(from, to) / 30
  const by = new Map<string, UserStat[]>()
  for (const u of users) if (u.user.kind === 'Vendor' && u.user.vendorCode) by.set(u.user.vendorCode, [...(by.get(u.user.vendorCode) ?? []), u])
  return [...by.entries()].map(([code, us]) => {
    const last = us.map((u) => u.lastLogin).filter((d): d is string => !!d).sort().at(-1)
    const since = last ? Math.round((num(to) - num(last)) / DAY) : undefined
    const active = us.some((u) => u.active)
    // Vendor login days = distinct days any linked user logged in (approximated by the busiest user).
    const loginDays = Math.max(0, ...us.map((u) => u.loginDays))
    return {
      code, name: us[0].user.vendorName ?? code, users: us, activeUsers: us.filter((u) => u.active).length,
      loginDays, hits: us.reduce((n, u) => n + u.hits, 0), minutes: us.reduce((n, u) => n + u.minutes, 0),
      lastLogin: last, since, active, perMonth: active ? Math.round((loginDays / months) * 10) / 10 : 0,
    }
  })
}

/** Days-since-last-login bands (at the period end). */
export const BANDS = [
  { label: '≤ 30 days', test: (s?: number) => s !== undefined && s <= 30 },
  { label: '31–60 days', test: (s?: number) => s !== undefined && s > 30 && s <= 60 },
  { label: '61–90 days', test: (s?: number) => s !== undefined && s > 60 && s < INACTIVE_DAYS },
  { label: '> 90 days', test: (s?: number) => s !== undefined && s >= INACTIVE_DAYS },
  { label: 'Never logged in', test: (s?: number) => s === undefined },
]

export type Grain = 'day' | 'week' | 'month'
/** Start of the bucket a date falls in (weeks start Monday). */
export function bucketOf(d: string, g: Grain): string {
  if (g === 'day') return d
  if (g === 'month') return `${d.slice(0, 7)}-01`
  const t = new Date(num(d))
  const back = (t.getUTCDay() + 6) % 7
  return addDays(d, -back)
}

/**
 * Trend per bucket: hits and the average minutes per active user (users who logged in in that bucket), MSIL vs vendor.
 */
export function trend(data: UsageData, from: string, to: string, g: Grain, keep: (u: UsageUser) => boolean) {
  const kind = new Map(data.users.map((u) => [u.id, u]))
  const m = new Map<string, { msilHits: number; vendorHits: number; msilMin: number; vendorMin: number; msilUsers: Set<string>; vendorUsers: Set<string> }>()
  for (const d of data.days) {
    if (d.date < from || d.date > to) continue
    const u = kind.get(d.userId)
    if (!u || !keep(u)) continue
    const b = bucketOf(d.date, g)
    const r = m.get(b) ?? { msilHits: 0, vendorHits: 0, msilMin: 0, vendorMin: 0, msilUsers: new Set(), vendorUsers: new Set() }
    if (u.kind === 'MSIL') { r.msilHits += d.hits; r.msilMin += d.minutes; r.msilUsers.add(u.id) }
    else { r.vendorHits += d.hits; r.vendorMin += d.minutes; r.vendorUsers.add(u.id) }
    m.set(b, r)
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([b, r]) => ({
    bucket: b,
    label: g === 'month' ? new Date(`${b}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      : new Date(`${b}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    msilHits: r.msilHits, vendorHits: r.vendorHits,
    msilAvgMin: r.msilUsers.size ? Math.round(r.msilMin / r.msilUsers.size) : 0,
    vendorAvgMin: r.vendorUsers.size ? Math.round(r.vendorMin / r.vendorUsers.size) : 0,
    msilUsers: r.msilUsers.size, vendorUsers: r.vendorUsers.size,
  }))
}
