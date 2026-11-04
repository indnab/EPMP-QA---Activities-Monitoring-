import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PersonaId =
  | 'Vendor'
  | 'PIC'
  | 'SIC'
  | 'DPM'
  | 'ModelCoordinator'
  | 'SectionAdmin'
  | 'Admin'

export interface PersonaMeta {
  id: PersonaId
  label: string
  /** Tailwind CSS custom-property colour name (e.g. 'persona-vendor') */
  colorKey: string
  /** Hex fallback for non-Tailwind contexts */
  hex: string
}

export const PERSONAS: PersonaMeta[] = [
  { id: 'Vendor',           label: 'Vendor',            colorKey: 'persona-vendor', hex: '#f97316' },
  { id: 'PIC',              label: 'PIC',               colorKey: 'persona-pic',    hex: '#c4b5fd' },
  { id: 'SIC',              label: 'SIC',               colorKey: 'persona-sic',    hex: '#a78bfa' },
  { id: 'DPM',              label: 'DPM',               colorKey: 'persona-dpm',    hex: '#6366f1' },
  { id: 'ModelCoordinator', label: 'Division Model Coordinator', colorKey: 'persona-mc',     hex: '#0891b2' },
  { id: 'SectionAdmin',     label: 'Department Co-ordinator', colorKey: 'persona-sa', hex: '#d97706' },
  { id: 'Admin',            label: 'Admin',             colorKey: 'persona-admin',  hex: '#10b981' },
]

/** Role-only identity: fixed section / vendor per persona (no named users). */
export const FIXED_SECTION = 'NP1'
export const FIXED_VENDOR_NAME = 'Minda Industries'

export interface PersonaScope {
  /** Restrict to parts in this Section.id */
  section?: string
  /** Restrict to parts whose vendorName matches */
  vendor?: string
}

/** PIC, SIC and SectionAdmin are fixed to section NP1; Vendor to Minda; other roles are unrestricted ({}). */
export function getPersonaScope(persona: PersonaId): PersonaScope {
  if (persona === 'PIC' || persona === 'SIC' || persona === 'SectionAdmin') return { section: FIXED_SECTION }
  if (persona === 'Vendor') return { vendor: FIXED_VENDOR_NAME }
  return {}
}

interface PersonaState {
  currentPersona: PersonaId
  setPersona: (id: PersonaId) => void
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set) => ({
      currentPersona: 'PIC',
      setPersona: (id) => set({ currentPersona: id }),
    }),
    {
      name: 'qa-tracker-persona',
      version: 1,
      // v1: DDVM and DVM personas removed; a saved session on either falls back to PIC.
      migrate: (persisted: any) => {
        const id = persisted?.currentPersona
        return { ...persisted, currentPersona: id === 'DDVM' || id === 'DVM' ? 'PIC' : id }
      },
    },
  ),
)
