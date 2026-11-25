/**
 * Mock portal login log for the Usage Report (a real build reads the EPMP access log). Deterministic: the same users,
 * vendors and daily logins every load. One record per user per day they logged in, with hits (page views, system
 * traffic excluded) and minutes spent.
 *
 * MSIL Quality users: PIC, SIC and DPM (the named people of the sample data plus a generated team).
 * Vendors: the vendor codes parts are assigned to in EPMP, plus a vendor directory; each vendor has 1–3 linked users.
 */
import { staffIdOf } from '../domain/people'

export interface UsageUser {
  id: string
  name: string
  kind: 'MSIL' | 'Vendor'
  /** MSIL: PIC / SIC / DPM; Vendor: the vendor user's role. */
  role: string
  /** MSIL department, or the vendor's code. */
  dept: string
  vendorCode?: string
  vendorName?: string
}
export interface UsageDay { userId: string; date: string; hits: number; minutes: number }
export interface UsageData { users: UsageUser[]; days: UsageDay[]; from: string; to: string }

const DEPTS = ['Body', 'Electrical', 'Engine', 'Interior', 'Lighting', 'Chassis', 'Transmission']
const FIRST = ['Amit', 'Priya', 'Rohit', 'Neha', 'Vikram', 'Kavita', 'Arjun', 'Sneha', 'Manish', 'Pooja', 'Sandeep', 'Ritu', 'Deepak', 'Anjali', 'Rajesh', 'Meera', 'Sunil', 'Nisha', 'Gaurav', 'Swati', 'Ashok', 'Divya', 'Karan', 'Shalini', 'Harish', 'Preeti', 'Naveen', 'Asha']
const LAST = ['Sharma', 'Gupta', 'Singh', 'Kumar', 'Verma', 'Jain', 'Mehta', 'Iyer', 'Reddy', 'Nair', 'Joshi', 'Bansal', 'Chopra', 'Kapoor', 'Malhotra', 'Saxena']
const VENDOR_DIR: [string, string][] = [
  ['V1006', 'Lumax Industries'], ['V1007', 'Uno Minda Lighting'], ['V1008', 'Sona Comstar'], ['V1009', 'Motherson Sumi'], ['V1010', 'Endurance Technologies'],
  ['V1011', 'JBM Auto'], ['V1012', 'Rane Brake Lining'], ['V1013', 'Varroc Engineering'], ['V1014', 'Subros Thermal'], ['V1015', 'Gabriel India'],
  ['V1016', 'Lucas TVS'], ['V1017', 'Bharat Seats'], ['V1018', 'Krishna Maruti'], ['V1019', 'SKH Metals'], ['V1020', 'Jay Bharat Maruti'],
  ['V1021', 'Fiem Industries'], ['V1022', 'Pricol Ltd'], ['V1023', 'Shivam Autotech'], ['V1024', 'Talbros Automotive'], ['V1025', 'Minda Corporation'],
  ['V1026', 'Amtek Auto'], ['V1027', 'Igarashi Motors'], ['V1028', 'Setco Automotive'], ['V1029', 'Hi-Tech Gears'], ['V1030', 'Omax Autos'],
]

/** Small seeded random (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const DAY = 86_400_000

type Profile = 'heavy' | 'regular' | 'light' | 'lapsed' | 'never'
const PROFILE: Record<Profile, { p: number; min: number }> = {
  heavy: { p: 0.82, min: 55 }, regular: { p: 0.45, min: 32 }, light: { p: 0.16, min: 18 }, lapsed: { p: 0.35, min: 25 }, never: { p: 0, min: 0 },
}
const pickProfile = (r: number, vendor: boolean): Profile =>
  vendor
    ? r < 0.12 ? 'heavy' : r < 0.47 ? 'regular' : r < 0.7 ? 'light' : r < 0.88 ? 'lapsed' : 'never'
    : r < 0.22 ? 'heavy' : r < 0.62 ? 'regular' : r < 0.82 ? 'light' : r < 0.93 ? 'lapsed' : 'never'

/**
 * Build the log for `daysBack` days up to `today`. `vendors` = the vendor codes / names parts are assigned to
 * (they come first; the directory fills up the rest).
 */
export function buildUsage(today: string, vendors: { code: string; name: string }[], daysBack = 210): UsageData {
  const r = rng(20261015)
  const users: UsageUser[] = []
  const profile = new Map<string, Profile>()
  const lapseAt = new Map<string, number>()

  // MSIL Quality users: the sample-data people first, then a generated team.
  const known: [string, string, string][] = [
    ['Rahul Verma', 'PIC', 'Lighting'], ['Anita Desai', 'PIC', 'Body'], ['Suresh Nair', 'PIC', 'Electrical'],
    ['V. Rao', 'SIC', 'Body'], ['S. Mehta', 'SIC', 'Engine'], ['K. Iyer', 'SIC', 'Interior'],
  ]
  known.forEach(([name, role, dept]) => { users.push({ id: staffIdOf(name), name, kind: 'MSIL', role, dept }); profile.set(staffIdOf(name), 'heavy') })
  for (let k = 0; k < 58; k++) {
    const name = `${FIRST[k % FIRST.length]} ${LAST[(k * 7) % LAST.length]}`
    const role = k % 10 === 0 ? 'DPM' : k % 5 === 1 ? 'SIC' : 'PIC'
    const id = `S${30100 + k * 13}`
    users.push({ id, name, kind: 'MSIL', role, dept: DEPTS[(k * 3) % DEPTS.length] })
    profile.set(id, pickProfile(r(), false))
  }
  // Vendors: assigned via EPMP first, then the directory.
  const all = [...vendors]
  for (const [code, name] of VENDOR_DIR) if (!all.some((v) => v.code === code)) all.push({ code, name })
  all.forEach((v, n) => {
    const count = 1 + Math.floor(r() * 3)
    const vp = n < vendors.length ? 'heavy' : pickProfile(r(), true)
    for (let u = 0; u < count; u++) {
      const id = `${v.code}-U${u + 1}`
      users.push({ id, name: `${FIRST[(n * 5 + u * 3) % FIRST.length]} ${LAST[(n + u * 5) % LAST.length]}`, kind: 'Vendor', role: u === 0 ? 'Vendor QA' : 'Vendor engineer', dept: v.code, vendorCode: v.code, vendorName: v.name })
      // Users of one vendor behave alike (the first user most).
      profile.set(id, vp === 'never' ? 'never' : u === 0 ? vp : pickProfile(r(), true))
    }
  })
  const end = Date.parse(`${today}T00:00:00Z`)
  const start = end - (daysBack - 1) * DAY
  for (const u of users) if (profile.get(u.id) === 'lapsed') lapseAt.set(u.id, end - Math.round((40 + r() * 150) * DAY))

  const days: UsageDay[] = []
  for (const u of users) {
    const pr = PROFILE[profile.get(u.id)!]
    if (!pr.p) continue
    const stop = lapseAt.get(u.id) ?? Infinity
    // Adoption grew over the period: a little less use early on.
    for (let t = start; t <= end; t += DAY) {
      if (t > stop) break
      const dow = new Date(t).getUTCDay()
      const weekend = dow === 0 || dow === 6
      const ramp = 0.75 + 0.25 * ((t - start) / (end - start))
      if (r() > pr.p * ramp * (weekend ? 0.12 : 1)) continue
      const minutes = Math.max(3, Math.round(pr.min * (0.45 + r() * 1.1)))
      days.push({ userId: u.id, date: iso(t), minutes, hits: Math.max(1, Math.round(minutes * (0.9 + r() * 0.8))) })
    }
  }
  return { users, days, from: iso(start), to: today }
}
