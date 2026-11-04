import type { ActivityDefinition, ChartProps } from '../../domain'
import { CHART_MEASURES, chartDimensions, chartMeasureFields } from '../../engine'

/** What "+ Custom chart" starts with: the comparison the dashboards ship with, drawn as a bar chart. */
export const DEFAULT_CHART_PROPS: ChartProps = { measure: 'completionRate', groupBy: 'model', display: 'bar' }

/**
 * Applies one Admin choice to a chart's settings and repairs whatever it invalidates: the field choice follows the
 * measure (average/sum need a number or percent field), split only exists for a counting measure and must differ
 * from the group, and group/split must be dimensions this dashboard offers.
 */
export function applyChartChange(current: ChartProps, change: Partial<ChartProps>, activity?: ActivityDefinition): ChartProps {
  const next: ChartProps = { ...current, ...change }
  const dims = chartDimensions(activity).map((d) => d.id)
  const fields = chartMeasureFields(activity)

  let measure = CHART_MEASURES.find((m) => m.id === next.measure) ?? CHART_MEASURES[0]
  if (measure.needsField && fields.length === 0) measure = CHART_MEASURES[0] // nothing to average on this dashboard
  next.measure = measure.id
  if (measure.needsField) {
    if (!fields.some((f) => f.key === next.measureField)) next.measureField = fields[0].key
  } else {
    delete next.measureField
  }

  if (!dims.includes(next.groupBy)) next.groupBy = dims[0]
  if (!measure.splittable || !next.splitBy || next.splitBy === next.groupBy || !dims.includes(next.splitBy)) delete next.splitBy
  return next
}

/** A readable title for a chart's settings, e.g. "Completion rate by Model" or "Parts by Status and RYG". */
export function chartTitle(props: ChartProps, activity?: ActivityDefinition): string {
  const dims = chartDimensions(activity)
  const dimLabel = (id: string) => dims.find((d) => d.id === id)?.label ?? id
  const fieldLabel = chartMeasureFields(activity).find((f) => f.key === props.measureField)?.label ?? 'field'
  const what = {
    count: 'Parts',
    completionRate: 'Completion rate',
    overdue: 'Overdue parts',
    awaitingValidation: 'Awaiting validation',
    average: `Average ${fieldLabel}`,
    sum: `Total ${fieldLabel}`
  }[props.measure]
  if (props.display === 'kpi') return what
  const split = props.display === 'stackedBar' && props.splitBy ? ` and ${dimLabel(props.splitBy)}` : ''
  return `${what} by ${dimLabel(props.groupBy)}${split}`
}

/**
 * Converts the older Stacked Bar widget (stacks by Approval state or RYG only) into the equivalent custom chart,
 * where the stacks (and the X axis) can then be changed to any dimension or field.
 */
export function stackedBarToChart(props: Record<string, any>): ChartProps {
  const groupBy = props.groupBy === 'vendorName' || !props.groupBy ? 'vendor' : props.groupBy
  return { measure: 'count', groupBy, splitBy: props.field === 'ryg' ? 'ryg' : 'status', display: 'stackedBar' }
}
