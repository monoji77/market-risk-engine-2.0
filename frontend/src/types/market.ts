import type { Time } from 'lightweight-charts'

export const metricOrder = ['close', 'returns', 'log_returns'] as const

export type Metric = (typeof metricOrder)[number]

export type AdvancedMetric =
  | 'daily_short_term_volatility'
  | 'garch_1_1_volatility'

export type VolatilityMetricKey = AdvancedMetric | 'ewma_volatility'

export type RiskClassification =
  | 'Low'
  | 'Moderate'
  | 'High'
  | 'Very High'
  | 'Extreme'

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
  risk_assessment?: TickerRiskAssessment | null
  series: Partial<Record<AdvancedMetric, MarketPointRow[]>>
  start_date: string
  ticker: string
}

export interface TickerRiskAssessment {
  benchmark_ticker: string
  drawdown: {
    asset_max_drawdown_pct: number | null
    benchmark_max_drawdown_pct: number | null
    classification: RiskClassification | null
    lookback_days: number
    relative_drawdown_ratio: number | null
    window_end_date: string
    window_start_date: string
  }
  overall: {
    classification: RiskClassification | null
    label: string | null
  }
  volatility: {
    asset_latest_metrics: Partial<Record<VolatilityMetricKey, number | null>>
    asset_max: number | null
    benchmark_latest_metrics: Partial<Record<VolatilityMetricKey, number | null>>
    benchmark_max: number | null
    classification: RiskClassification | null
    latest_date: string
    relative_max_volatility: number | null
  }
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
  riskAssessmentByTicker: Record<string, TickerRiskAssessment | null>
  rowCount: number
  series: Record<string, Partial<Record<Metric, MarketSeries>>>
  shortTermVolatilitySeries: Record<string, MarketSeries>
  startDate: string
  tickers: string[]
}
