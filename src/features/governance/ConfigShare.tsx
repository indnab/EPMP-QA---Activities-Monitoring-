/**
 * Governance header buttons: Export configuration (download the file to share) and Import configuration
 * (apply a received file in this browser, after a confirmation). See configFile.ts.
 */
import { useRef, useState } from 'react'
import { Button, Modal } from '../../components'
import { Icon } from '../../components/Icon'
import { toast } from '../../components/Toast'
import { useQAStore } from '../../store/qaStore'
import { CONFIG_PATH, applyConfig, downloadConfig, parseConfig, summarize } from './configFile'
import type { ConfigFile } from './configFile'

export function ConfigShare() {
  const store = useQAStore()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ConfigFile | null>(null)
  const [error, setError] = useState('')

  const pick = async (file?: File) => {
    if (input.current) input.current.value = ''
    if (!file) return
    const parsed = parseConfig(await file.text())
    if (!parsed.ok) { setError(parsed.error); return }
    setError('')
    setPending(parsed.config)
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { downloadConfig('Admin'); toast('Configuration downloaded (activity-config.json). Email it, or save it in the repo as public/' + CONFIG_PATH + ' and push.') }}
        title="Download the archetypes, activities, milestones and section templates as one file to share">
        <Icon name="download" size={13} className="mr-1" />Export configuration
      </Button>
      <Button variant="secondary" size="sm" onClick={() => input.current?.click()} title="Apply a configuration file someone sent you (this browser only)">
        <Icon name="refresh" size={13} className="mr-1" />Import configuration
      </Button>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="Choose a configuration file" onChange={(e) => pick(e.target.files?.[0])} />

      <Modal open={!!pending || !!error} onClose={() => { setPending(null); setError('') }} title={error ? 'Cannot import this file' : 'Import activity configuration?'} size="md"
        footer={error ? (
          <Button variant="primary" size="md" onClick={() => setError('')}>OK</Button>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={() => { if (pending) { applyConfig(pending); toast(`Configuration imported: ${summarize(pending)}.`) } setPending(null) }}>Replace configuration</Button>
          </>
        )}>
        {error ? (
          <p className="text-[12px] text-[#344054]">{error}</p>
        ) : pending && (
          <div className="space-y-3 text-[12px] text-[#344054]">
            <p>This replaces the configuration in <strong>this browser</strong>:</p>
            <table className="w-full text-[11.5px]">
              <thead><tr><th className="px-2 py-1 text-left">Item</th><th className="px-2 py-1 text-right">Now</th><th className="px-2 py-1 text-right">In the file</th></tr></thead>
              <tbody>
                {([['Archetypes', 'archetypes'], ['Activities', 'activities'], ['Milestones', 'milestones'], ['Sections', 'sections'], ['Section template rows', 'templateRows'], ['Activity dependencies', 'activityDependencies']] as const).map(([label, k]) => (
                  <tr key={k} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1">{label}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{store[k].length}</td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">{pending[k].length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-[var(--color-muted)]">
              Exported {new Date(pending.exportedAt).toLocaleString()}{pending.exportedBy ? ` by ${pending.exportedBy}` : ''}. Models, projects, parts and entries are not changed.
              Unpublished Activity Builder drafts in this browser stay as they are.
            </p>
            <p className="text-[11px] text-[var(--color-muted)]">To share it with everyone, save the file in the repo as <code>public/{CONFIG_PATH}</code> and push.</p>
          </div>
        )}
      </Modal>
    </>
  )
}
