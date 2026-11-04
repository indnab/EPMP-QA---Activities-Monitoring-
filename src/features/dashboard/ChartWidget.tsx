import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { GlobalFilters, Widget } from '../../domain'
import { CHART_MEASURES, drillFilterFor, readChartProps } from '../../engine'
import type { ChartGroup, ChartResult } from '../../engine'

interface ChartWidgetProps {
  widget: Widget
  /** The engine's ChartResult, or null when the widget's props do not describe a chart. */
  data: ChartResult | null
  onDrillDown?: (filters: Partial<GlobalFilters>) => void
}

// Used for groups that have no fixed colour (everything except status and RYG)
const BRAND_COLORS = ['#2153f5', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#14b8a6', '#6366f1']
const TOOLTIP_STYLE = { background: '#fff', border: '1px solid #e5e7eb', fontSize: '11px', borderRadius: '4px' }

const colorFor = (g: { color?: string }, i: number) => g.color ?? BRAND_COLORS[i % BRAND_COLORS.length]

function Empty({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">{text}</div>
}

function Title({ text }: { text: string }) {
  return (
    <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2">{text}</div>
  )
}

/**
 * The general Admin-configured chart. One engine result drawn five ways (bar, stacked bar, donut, table, KPI tile);
 * a click on a bar, slice, segment or row hands the matching dashboard filter to `onDrillDown`.
 */
export function ChartWidget({ widget, data, onDrillDown }: ChartWidgetProps) {
  const props = readChartProps(widget.props)
  if (!props || !data) return <Empty text="Chart not configured" />

  const { groups, splitKeys, unit, overall } = data
  const measure = CHART_MEASURES.find((m) => m.id === props.measure)
  const showText = (value: number, empty?: boolean) => (empty ? '—' : `${value}${unit}`)
  const drill = (key: string) => onDrillDown?.(drillFilterFor(props.groupBy, key))
  // Counting measures are whole numbers; averages and sums may have one decimal
  const whole = props.measure !== 'average' && props.measure !== 'sum'

  if (props.display === 'kpi') {
    const alert = props.measure === 'overdue' && overall > 0
    const done = props.measure === 'completionRate' && overall === 100
    const tint = alert ? 'bg-[#fef2f2] border-[#fecaca]' : done ? 'bg-[#ecfdf5] border-[#a7f3d0]' : 'bg-white'
    const text = alert ? 'text-destructive' : done ? 'text-[#047857]' : 'text-[var(--color-text)]'
    // Count, average and sum have no filter of their own, so those tiles are not clickable
    const click =
      props.measure === 'overdue' ? { ryg: 'Red' }
      : props.measure === 'awaitingValidation' ? { status: 'Submitted' }
      : props.measure === 'completionRate' ? { status: 'Approved' }
      : undefined
    return (
      <div
        onClick={click ? () => onDrillDown?.(click) : undefined}
        className={`border border-[var(--color-border)] rounded-lg p-4 h-full flex flex-col justify-between transition-shadow ${click ? 'cursor-pointer hover:shadow-sm' : ''} ${tint}`}
      >
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{widget.title}</div>
        <div className="my-2">
          <span className={`text-3xl font-extrabold tracking-tight ${text}`}>
            {groups.length === 0 ? '—' : `${overall}${unit}`}
          </span>
        </div>
        <div className="text-xxs text-[var(--color-muted)] truncate">{measure?.label}</div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <Title text={widget.title} />
        <Empty text="No data for the current filters" />
      </div>
    )
  }

  if (props.display === 'table') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2 flex justify-between items-center">
          <span>{widget.title}</span>
          <span className="text-xxs font-normal">{groups.length} rows</span>
        </div>
        <div className="flex-1 overflow-y-auto text-xxs">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[var(--color-muted)] font-medium">
                <th className="py-1 pb-1.5 font-semibold">Group</th>
                <th className="py-1 pb-1.5 font-semibold text-right">{measure?.label}</th>
                {props.measure !== 'count' && <th className="py-1 pb-1.5 font-semibold text-right">Parts</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[var(--color-text)]">
              {groups.map((g) => (
                <tr key={g.key} className="hover:bg-surface cursor-pointer" onClick={() => drill(g.key)}>
                  <td className="py-1.5 font-medium text-primary truncate max-w-[140px]">{g.name}</td>
                  <td className="py-1.5 text-right font-mono">{showText(g.value, g.empty)}</td>
                  {props.measure !== 'count' && <td className="py-1.5 text-right font-mono text-muted">{g.total}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (props.display === 'donut') {
    if (groups.every((g) => g.value === 0)) {
      return (
        <div className="h-full flex flex-col">
          <Title text={widget.title} />
          <Empty text="Nothing to show: every group is 0" />
        </div>
      )
    }
    return (
      <div className="h-full flex flex-col">
        <Title text={widget.title} />
        <div className="flex-1 min-h-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={groups} innerRadius="55%" outerRadius="80%" paddingAngle={2} dataKey="value" nameKey="name" cx="50%" cy="50%">
                {groups.map((g, i) => (
                  <Cell key={g.key} fill={colorFor(g, i)} className="cursor-pointer focus:outline-none" onClick={() => drill(g.key)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name, item) => [showText(Number(value), (item.payload as ChartGroup).empty), name]}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // bar and stackedBar share the axes. A stacked bar needs a split; without one it is drawn as a plain bar.
  const stacked = props.display === 'stackedBar' && splitKeys.length > 0
  const rows = stacked
    ? groups.map((g) => ({ key: g.key, name: g.name, ...Object.fromEntries((g.parts ?? []).map((p) => [p.key, p.value])) }))
    : groups.map((g) => ({ key: g.key, name: g.name, value: g.value, empty: g.empty }))

  return (
    <div className="h-full flex flex-col">
      <Title text={widget.title} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
            <YAxis
              stroke="#9ca3af"
              fontSize={10}
              tickLine={false}
              allowDecimals={!whole}
              domain={unit === '%' && !stacked ? [0, 100] : [0, 'auto']}
              tickFormatter={(v) => `${v}${unit}`}
            />
            {stacked ? (
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            ) : (
              <Tooltip
                formatter={(value, _name, item) => [showText(Number(value), (item.payload as { empty?: boolean }).empty), measure?.label]}
                contentStyle={TOOLTIP_STYLE}
              />
            )}
            {stacked ? (
              <>
                <Legend iconType="rect" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                {splitKeys.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={colorFor(s, i)} className="cursor-pointer">
                    {rows.map((r) => (
                      <Cell
                        key={r.key}
                        onClick={() =>
                          props.splitBy &&
                          onDrillDown?.({ ...drillFilterFor(props.groupBy, r.key), ...drillFilterFor(props.splitBy, s.key) })
                        }
                      />
                    ))}
                  </Bar>
                ))}
              </>
            ) : (
              <Bar dataKey="value" radius={[4, 4, 0, 0]} className="cursor-pointer">
                {groups.map((g, i) => (
                  <Cell key={g.key} fill={colorFor(g, i)} onClick={() => drill(g.key)} />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
