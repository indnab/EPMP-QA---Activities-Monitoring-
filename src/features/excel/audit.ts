import { FIXED_VENDOR_NAME } from '../../store/personaStore'
import type { PersonaId } from '../../store/personaStore'

/** The name shown in the audit log for a role when no individual is known (the vendor company, or the role itself). */
export function actorLabel(persona: PersonaId): string {
  return persona === 'Vendor' ? FIXED_VENDOR_NAME : persona
}
