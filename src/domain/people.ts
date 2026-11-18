/**
 * People directory (prototype): one staff ID per MSIL person and the vendor code as the vendor's ID, so every screen
 * shows the same "ID: Name". Known PICs keep the IDs they already had; anyone else gets a stable ID from their name.
 */
const KNOWN_STAFF_IDS: Record<string, string> = {
  'Anita Desai': 'S10664',
  'Rahul Verma': 'S10666',
  'Suresh Nair': 'S10667',
  'V. Rao': 'S20411',
  'S. Mehta': 'S20437',
  'K. Iyer': 'S20512',
}

/** The SIC of each QA section (sample data). */
export const SIC_BY_SECTION: Record<string, string> = { NP1: 'K. Iyer' }

/** Staff ID of an MSIL person (PIC, SIC, DPM), e.g. 'S10666'. Empty for an empty name. */
export function staffIdOf(name: string | undefined): string {
  const n = (name ?? '').trim()
  if (!n || n === 'Unassigned') return ''
  if (KNOWN_STAFF_IDS[n]) return KNOWN_STAFF_IDS[n]
  const h = Array.from(n).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 89999, 7)
  return `S${10000 + h}`
}

/** "S10666: Rahul Verma" (the name alone when there is no ID). */
export function picLabel(name: string | undefined): string {
  const id = staffIdOf(name)
  return id ? `${id}: ${name}` : name || ''
}

/** "V1001: Minda Industries". */
export function vendorLabel(vendorName: string, vendorCode?: string): string {
  return vendorCode ? `${vendorCode}: ${vendorName}` : vendorName
}

/** Who did a history step: role, name and ID (staff ID, or vendor code for the vendor). */
export function actorOf(
  log: { persona: string; actorName?: string },
  part: { pic?: string; vendorName: string; vendorCode?: string; section?: string; attrs?: Record<string, string> } | undefined
): { role: string; name: string; id: string } {
  const role = log.persona
  if (role === 'Vendor') return { role, name: log.actorName || part?.vendorName || '', id: part?.vendorCode ?? '' }
  if (role === 'System') return { role, name: 'System', id: '' }
  const name =
    log.actorName ||
    (role === 'PIC' ? part?.pic : role === 'DPM' ? part?.attrs?.dpm_name : role === 'SIC' ? SIC_BY_SECTION[part?.section ?? ''] : '') ||
    ''
  return { role, name, id: staffIdOf(name) }
}
