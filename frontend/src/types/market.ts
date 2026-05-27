import type { Time } from 'lightweight-charts'

export const metricOrder = ['close', 'returns', 'log_returns'] as const

export type Metric = (typeof metricOrder)[number]

export interface MarketDataRow {
  date: string
  metric: Metric
  ticker: string
  value: number
}

export interface DrawdownDataRow {
  date: string
  ticker: string
  value: number
}

export interface AdvancedMetricDataRow {
  date: string
  metric: 'daily_short_term_volatility'
  ticker: string
  value: number
}

export interface MarketVisualizationPayload {
  data: MarketDataRow[]
  drawdown_data?: DrawdownDataRow[]
  end_date: string
  metrics: Metric[]
  start_date: string
  tickers: string[]
}

export interface AdvancedMetricsPayload {
  data: AdvancedMetricDataRow[]
  end_date: string
  metrics: string[]
  start_date: string
  tickers: string[]
}

export interface MarketSeriesPoint {
  date: string
  time: Time
  value: number
}

export interface ChartVisibleRange {
  from: string
  to: string
}

export interface MarketSeriesSummary {
  change: number
  changePct: number
  firstValue: number
  lastValue: number
  latestDate: string
  maxValue: number
  minValue: number
  observations: number
}

export interface MarketSeries {
  points: MarketSeriesPoint[]
  summary: MarketSeriesSummary
}

export interface MarketDataset {
  drawdownSeries: Record<string, MarketSeries>
  endDate: string
  metrics: Metric[]
  rowCount: number
  series: Record<string, Partial<Record<Metric, MarketSeries>>>
  shortTermVolatilitySeries: Record<string, MarketSeries>
  startDate: string
  tickers: string[]
}
