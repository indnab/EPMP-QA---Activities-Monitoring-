import type { ActivityDefinition, ChartDisplay, ChartProps } from '../../domain'
import { CHART_MEASURES, chartDimensions, chartMeasureFields } from '../../engine'

interface ChartControlsProps {
  chart: ChartProps
  /** The dashboard's activity; undefined on the Overview (built-in dimensions only). */
  activity?: ActivityDefinition
  onChange: (change: Partial<ChartProps>) => void
}

const SELECT_CLASS =
  'w-full border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs bg-white text-[var(--color-text)] focus:outline-none'
const LABEL_CLASS = 'block text-[10px] font-bold text-[var(--color-muted)] uppercase mb-1'

/**
 * Properties-panel controls of a custom chart: what to measure, group by, show as, and (stacked bar) split by.
 * It only offers valid choices; `applyChartChange` repairs anything a change invalidates.
 */
export function ChartControls({ chart, activity, onChange }: ChartControlsProps) {
  const measure = CHART_MEASURES.find((m) => m.id === chart.measure) ?? CHART_MEASURES[0]
  const dims = chartDimensions(activity)
  const numberFields = chartMeasureFields(activity)
  const fieldDims = dims.filter((d) => d.id.startsWith('field:'))

  return (
    <>
      <div>
        <label className={LABEL_CLASS} htmlFor="chart-measure">What to measure</label>
        <select
          id="chart-measure"
          value={chart.measure}
          onChange={(e) => onChange({ measure: e.target.value as ChartProps['measure'] })}
          className={SELECT_CLASS}
        >
          {CHART_MEASURES.map((m) => (
            <option key={m.id} value={m.id} disabled={m.needsField && numberFields.length === 0}>
              {m.label}
              {m.needsField && numberFields.length === 0 ? ' (no number fields here)' : ''}
            </option>
          ))}
        </select>
      </div>
      {measure.needsField && (
        <div>
          <label className={LABEL_CLASS} htmlFor="chart-field">Number / percent field</label>
          <select
            id="chart-field"
            value={chart.measureField ?? ''}
            onChange={(e) => onChange({ measureField: e.target.value })}
            className={SELECT_CLASS}
          >
            {numberFields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className={LABEL_CLASS} htmlFor="chart-group">Group by</label>
        <select
          id="chart-group"
          value={chart.groupBy}
          onChange={(e) => onChange({ groupBy: e.target.value })}
          className={SELECT_CLASS}
        >
          <optgroup label="Standard">
            {dims.filter((d) => !d.id.startsWith('field:')).map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </optgroup>
          {fieldDims.length > 0 && (
            <optgroup label="Field values">
              {fieldDims.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </optgroup>
          )}
        </select>
        {!activity && (
          <p className="text-xxs text-muted mt-1">To group by a field's values (for example Available / Not available), open that activity's dashboard.</p>
        )}
      </div>
      <div>
        <label className={LABEL_CLASS} htmlFor="chart-display">Show as</label>
        <select
          id="chart-display"
          value={chart.display}
          onChange={(e) => onChange({ display: e.target.value as ChartDisplay })}
          className={SELECT_CLASS}
        >
          <option value="bar">Bar chart</option>
          <option value="stackedBar">Stacked bar chart</option>
          <option value="donut">Donut</option>
          <option value="table">Table</option>
          <option value="kpi">KPI tile (overall value)</option>
        </select>
      </div>
      {chart.display === 'stackedBar' && (
        <div>
          <label className={LABEL_CLASS} htmlFor="chart-split">Split each bar by</label>
          <select
            id="chart-split"
            value={chart.splitBy ?? ''}
            onChange={(e) => onChange({ splitBy: e.target.value || undefined })}
            disabled={!measure.splittable}
            className={`${SELECT_CLASS} disabled:bg-surface disabled:text-muted`}
          >
            <option value="">No split</option>
            {dims.filter((d) => d.id !== chart.groupBy).map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
          {!measure.splittable && (
            <p className="text-xxs text-muted mt-1">This measure is one number per bar, so it cannot be split.</p>
          )}
        </div>
      )}
      {chart.display === 'kpi' && (
        <p className="text-xxs text-muted">A KPI tile shows the overall value; "Group by" does not apply.</p>
      )}
    </>
  )
}
