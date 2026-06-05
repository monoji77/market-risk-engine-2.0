import type { Time } from 'lightweight-charts'

export const metricOrder = ['close', 'returns', 'log_returns'] as const

export type Metric = (typeof metricOrder)[number]

export type AdvancedMetric =
  | 'daily_short_term_volatility'
  | 'garch_1_1_volatility'

export interface MarketCatalogTicker {
  name?: string | null
  security?: string | null
  sector?: string | null
  ticker: string
}

export interface MarketCatalogPayload {
  default_ticker: string
  metrics: Metric[]
  tickers: MarketCatalogTicker[]
}

export interface MarketPointRow {
  date: string
  value: number
}

export interface MarketTickerPayload {
  drawdown_series: MarketPointRow[]
  end_date: string
  metrics: Metric[]
  series: Partial<Record<Metric, MarketPointRow[]>>
  start_date: string
  ticker: string
}

export interface AdvancedTickerPayload {
  end_date: string
  garch_1_1_distribution?: string | null
  metrics: AdvancedMetric[]
  series: Partial<Record<AdvancedMetric, MarketPointRow[]>>
  start_date: string
  ticker: string
}

export interface MarketSeriesPoint {
  date: string
  time: Time
  value: number
}

export interface ChartVisibleRange {
  from: string
  fromDateOffset?: number
  logicalFrom?: number
  logicalTo?: number
  to: string
  toDateOffset?: number
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
  garchDistributionByTicker: Record<string, string | null>
  garchVolatilitySeries: Record<string, MarketSeries>
  metrics: Metric[]
  rowCount: number
  series: Record<string, Partial<Record<Metric, MarketSeries>>>
  shortTermVolatilitySeries: Record<string, MarketSeries>
  startDate: string
  tickers: string[]
}
