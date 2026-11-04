import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from 'recharts'
import type { Widget } from '../../domain'
import { NOT_ENTERED } from '../../engine'
import { ChartWidget } from './ChartWidget'
import type { RawDrill } from './drill'

interface WidgetProps {
  widget: Widget
  data: any
  activityId: string | 'overview'
  onDrillDown?: (click: RawDrill) => void
}

// Color palette definitions
const RYG_COLORS: Record<string, string> = {
  Green: '#10b981',
  Yellow: '#f59e0b',
  Red: '#ef4444',
  Grey: '#c6cdd9',
  'Awaiting MRD': '#c6cdd9',
  'Not applicable': '#94a3b8',
  NA: '#94a3b8',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444'
}

const STATUS_COLORS: Record<string, string> = {
  NotStarted: '#c6cdd9',
  Draft: '#3b82f6',
  Submitted: '#f59e0b',
  'Sent back': '#ef4444',
  Approved: '#10b981',
  'Not Started': '#c6cdd9',
  'Sent Back': '#ef4444',
  'Not applicable': '#94a3b8',
  NA: '#94a3b8'
}

const BRAND_COLORS = [
  '#2153f5', // primary
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#10b981', // green
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#14b8a6', // emerald
  '#6366f1'  // indigo
]

/**
 * KPI Widget Component
 */
export function KPIWidget({ widget, data, onDrillDown }: WidgetProps) {
  const metric = widget.props.metric
  let bgClass = 'bg-white'
  let textClass = 'text-[var(--color-text)]'

  if (metric === 'overdueCount' && data > 0) {
    bgClass = 'bg-[#fef2f2] border-[#fecaca]'
    textClass = 'text-destructive'
  } else if (metric === 'completionRate' && data === 100) {
    bgClass = 'bg-[#ecfdf5] border-[#a7f3d0]'
    textClass = 'text-[#047857]'
  }

  // What a click filters to; Total parts has no filter of its own, so that tile is not clickable
  const click: RawDrill | undefined =
    metric === 'overdueCount' ? { ryg: 'Red' }
    : metric === 'pendingValidationCount' ? { status: 'Submitted' }
    : metric === 'completionRate' ? { status: 'Approved' }
    : metric === 'notApplicableCount' ? { status: 'NA' }
    : metric === 'awaitingMrdCount' ? { ryg: 'Grey' }
    : undefined

  return (
    <div
      onClick={click && onDrillDown ? () => onDrillDown(click) : undefined}
      className={`border border-[var(--color-border)] rounded-lg p-4 h-full flex flex-col justify-between transition-shadow ${click ? 'cursor-pointer hover:shadow-sm' : ''} ${bgClass}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {widget.title}
      </div>
      <div className="my-2">
        <span className={`text-3xl font-extrabold tracking-tight ${textClass}`}>
          {metric === 'completionRate' ? `${data}%` : data}
        </span>
      </div>
      {widget.props.subtext && (
        <div className="text-xxs text-[var(--color-muted)] truncate">
          {widget.props.subtext}
        </div>
      )}
    </div>
  )
}

/**
 * Donut / Pie Widget Component
 */
export function DonutWidget({ widget, data, onDrillDown }: WidgetProps) {
  const isRyg = widget.props.field === 'ryg'
  const isType = widget.props.field === 'type'
  const isStatus = widget.props.field === 'validationState' || widget.props.field === 'status'

  const getColor = (entry: any, index: number) => {
    if (isRyg) return RYG_COLORS[entry.name] || '#9ca3af'
    if (isStatus) return STATUS_COLORS[entry.name] || '#9ca3af'
    if (isType) return entry.name === 'New Part' ? '#3b82f6' : '#8b5cf6'
    return BRAND_COLORS[index % BRAND_COLORS.length]
  }

  const handleClick = (entry: any) => {
    if (!onDrillDown) return
    if (isRyg) {
      onDrillDown({ ryg: entry.name })
    } else if (isType) {
      onDrillDown({ type: entry.name })
    } else if (isStatus) {
      onDrillDown({ status: entry.name })
    } else {
      // Activity field: filter to the clicked value ('Not Started / NA' is the empty bucket)
      onDrillDown({ fields: [{ key: widget.props.field, value: entry.name === 'Not Started / NA' ? NOT_ENTERED : entry.name }] })
    }
  }

  if (!data || data.length === 0 || data.every((d: any) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
        No status data available
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2">
        {widget.title}
      </div>
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              cx="50%"
              cy="50%"
            >
              {data.map((entry: any, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getColor(entry, index)}
                  className="cursor-pointer focus:outline-none"
                  onClick={() => handleClick(entry)}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [`${value} parts`, name]}
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', fontSize: '11px', borderRadius: '4px' }}
            />
            <Legend
              layout="vertical"
              verticalAlign="middle"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Stacked Bar Widget Component
 */
export function StackedBarWidget({ widget, data, onDrillDown }: WidgetProps) {
  const isRyg = widget.props.field === 'ryg'
  const groupBy = widget.props.groupBy || 'vendorName'

  const handleClick = (barData: any, statusName: string) => {
    if (!onDrillDown) return
    const group: RawDrill =
      groupBy === 'vendorName' ? { vendor: barData.name }
      : groupBy === 'model' ? { model: barData.name }
      : groupBy === 'milestone' ? { milestone: barData.name }
      : groupBy === 'section' ? { section: barData.name }
      : groupBy === 'department' ? { department: barData.name }
      : {}
    onDrillDown({ ...group, ...(isRyg ? { ryg: statusName } : { status: statusName }) })
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
        No breakdown data available
      </div>
    )
  }

  const stackKeys = isRyg
    ? ['Green', 'Yellow', 'Red', 'Grey', 'NA']
    : ['NotStarted', 'Draft', 'Submitted', 'Sent back', 'Approved', 'NA']

  const getLabel = (key: string) => {
    if (key === 'NotStarted') return 'Not Started'
    if (key === 'Sent back') return 'Sent Back'
    if (key === 'Grey') return 'Awaiting MRD'
    if (key === 'NA') return 'Not applicable'
    return key
  }

  const getColor = (key: string) => {
    if (isRyg) return RYG_COLORS[key] || '#9ca3af'
    return STATUS_COLORS[key] || '#9ca3af'
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2">
        {widget.title}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
            <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', fontSize: '11px', borderRadius: '4px' }}
            />
            <Legend iconType="rect" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
            {stackKeys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                name={getLabel(key)}
                stackId="a"
                fill={getColor(key)}
                className="cursor-pointer"
              >
                {data.map((entry: any, index: number) => (
                  <Cell
                    key={`cell-${key}-${index}`}
                    onClick={() => handleClick(entry, key)}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Bar Category Widget Component
 */
export function BarCategoryWidget({ widget, data, onDrillDown }: WidgetProps) {
  const handleClick = (entry: any) => {
    onDrillDown?.({ fields: [{ key: widget.props.field, value: entry.category === 'Not Started / NA' ? NOT_ENTERED : entry.category }] })
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
        No category data available
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2">
        {widget.title}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="category" stroke="#9ca3af" fontSize={10} tickLine={false} />
            <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', fontSize: '11px', borderRadius: '4px' }}
            />
            <Bar dataKey="count" fill="#2153f5" radius={[4, 4, 0, 0]} className="cursor-pointer">
              {data.map((entry: any, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  onClick={() => handleClick(entry)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Trend Widget (Timeline) Component
 */
export function TrendWidget({ widget, data }: WidgetProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
        No timeline data available
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2">
        {widget.title}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 15, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} />
            <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', fontSize: '11px', borderRadius: '4px' }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
            <Line
              type="monotone"
              dataKey="Planned"
              stroke="#9ca3af"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="Actual"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Table Widget Component (for showing overdue/pending tables)
 */
export function TableWidget({ widget, data, onDrillDown }: WidgetProps) {
  // Outstanding list table
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2 flex justify-between items-center">
        <span>{widget.title}</span>
        <span className="text-xxs text-[var(--color-muted)] font-normal">{data?.length || 0} items</span>
      </div>
      <div className="flex-1 overflow-y-auto text-xxs">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-[var(--color-muted)] font-medium">
              <th className="py-1 pb-1.5 font-semibold">Part No</th>
              <th className="py-1 pb-1.5 font-semibold">Model</th>
              <th className="py-1 pb-1.5 font-semibold">Vendor</th>
              <th className="py-1 pb-1.5 font-semibold text-right">MRD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-[var(--color-text)]">
            {data && data.length > 0 ? (
              data.slice(0, 10).map((row: any, i: number) => (
                <tr
                  key={i}
                  className="hover:bg-surface cursor-pointer"
                  onClick={() => onDrillDown && onDrillDown({ vendor: row.part?.vendorName, model: row.part?.model })}
                >
                  <td className="py-1.5 font-medium text-primary truncate max-w-[80px]">{row.part?.partNo}</td>
                  <td className="py-1.5 truncate max-w-[60px]">{row.part?.model}</td>
                  <td className="py-1.5 truncate max-w-[80px]">{row.part?.vendorName}</td>
                  <td className="py-1.5 text-right font-mono text-muted">{row.part?.mrd}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">No outstanding items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Gauge / Band widget component
 */
export function GaugeWidget({ widget, data, onDrillDown }: WidgetProps) {
  const handleClick = (entry: any) => {
    onDrillDown?.({ fields: [{ key: widget.props.field, value: entry.name === 'N/A' ? NOT_ENTERED : entry.name }] })
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
        No accuracy band data available
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2">
        {widget.title}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
            <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', fontSize: '11px', borderRadius: '4px' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} className="cursor-pointer">
              {data.map((entry: any, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || BRAND_COLORS[index % BRAND_COLORS.length]}
                  onClick={() => handleClick(entry)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Cross-activity Phase overview RYG Heat-map Widget Component.
 * Lists all activities on the Y axis (rows) and counts of Green, Yellow, Red on the columns,
 * with clickable cells to drill down to that activity and status!
 */
export function HeatMapWidget({ widget, data, onDrillDown }: WidgetProps) {
  const handleCellClick = (activityId: string, status: string, count: number) => {
    if (count === 0 || !onDrillDown) return
    onDrillDown({ activityId, ryg: status })
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
        No activities to roll up
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="text-xs font-semibold text-[var(--color-muted)] border-b border-[var(--color-border)] pb-2 mb-2">
        {widget.title}
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xxs">
          <thead>
            <tr className="border-b border-border text-[var(--color-muted)]">
              <th className="py-1 font-semibold">Activity</th>
              <th className="py-1 text-center font-semibold w-14">Green</th>
              <th className="py-1 text-center font-semibold w-14">Yellow</th>
              <th className="py-1 text-center font-semibold w-14">Red</th>
              <th className="py-1 text-center font-semibold w-14" title="Awaiting MRD">Grey</th>
              <th className="py-1 text-center font-semibold w-14" title="Not applicable">N/A</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-[var(--color-text)]">
            {data.map((row: any) => (
              <tr key={row.activityId} className="hover:bg-surface">
                <td className="py-1.5 font-medium truncate max-w-[150px]" title={row.activityName}>
                  {row.activityName}
                </td>
                <td
                  onClick={() => handleCellClick(row.activityId, 'Green', row.Green)}
                  className={`py-1.5 text-center font-bold border-l border-border cursor-pointer hover:underline ${
                    row.Green > 0 ? 'bg-[#ecfdf5] text-[#047857]' : 'text-muted'
                  }`}
                >
                  {row.Green}
                </td>
                <td
                  onClick={() => handleCellClick(row.activityId, 'Yellow', row.Yellow)}
                  className={`py-1.5 text-center font-bold border-l border-border cursor-pointer hover:underline ${
                    row.Yellow > 0 ? 'bg-[#fffbeb] text-[#b45309]' : 'text-muted'
                  }`}
                >
                  {row.Yellow}
                </td>
                <td
                  onClick={() => handleCellClick(row.activityId, 'Red', row.Red)}
                  className={`py-1.5 text-center font-bold border-l border-border cursor-pointer hover:underline ${
                    row.Red > 0 ? 'bg-[#fef2f2] text-destructive' : 'text-muted'
                  }`}
                >
                  {row.Red}
                </td>
                <td
                  onClick={() => handleCellClick(row.activityId, 'Grey', row.Grey)}
                  className={`py-1.5 text-center font-bold border-l border-border cursor-pointer hover:underline ${
                    row.Grey > 0 ? 'bg-surface text-[var(--color-muted)]' : 'text-muted'
                  }`}
                >
                  {row.Grey}
                </td>
                <td
                  onClick={() => handleCellClick(row.activityId, 'NA', row.NA)}
                  className={`py-1.5 text-center font-bold border-l border-border cursor-pointer hover:underline ${
                    row.NA > 0 ? 'bg-surface text-[var(--color-muted)]' : 'text-muted'
                  }`}
                >
                  {row.NA}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Root Widget Renderer Router
 */
export function WidgetRenderer(props: WidgetProps) {
  const { widget } = props

  switch (widget.type) {
    case 'kpi':
      return <KPIWidget {...props} />
    case 'donut':
      return <DonutWidget {...props} />
    case 'stackedBar':
      return <StackedBarWidget {...props} />
    case 'barCategory':
      return <BarCategoryWidget {...props} />
    case 'trend':
      return <TrendWidget {...props} />
    case 'table':
      return <TableWidget {...props} />
    case 'gauge':
      return <GaugeWidget {...props} />
    case 'heatMap':
      return <HeatMapWidget {...props} />
    case 'chart':
      return <ChartWidget widget={widget} data={props.data} onDrillDown={props.onDrillDown} />
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-[var(--color-muted)]">
          Unknown Widget Type: {widget.type}
        </div>
      )
  }
}
