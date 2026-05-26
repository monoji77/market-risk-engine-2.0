import {
  metricOrder,
  type MarketDataset,
  type MarketSeriesPoint,
  type MarketSeriesSummary,
  type MarketVisualizationPayload,
  type Metric,
} from '../types/market'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
const staticMarketVisualizationUrl = `${import.meta.env.BASE_URL}market_visualizations.json`
const marketVisualizationUrl = apiBaseUrl
  ? `${apiBaseUrl}/api/market/visualizations`
  : staticMarketVisualizationUrl

let datasetPromise: Promise<MarketDataset> | null = null

export function loadMarketDataset() {
  if (!datasetPromise) {
    datasetPromise = getMarketDataset()
  }

  return datasetPromise
}

async function getMarketDataset() {
  const payload = await loadVisualizationPayload()
  return normalizePayload(payload)
}

async function loadVisualizationPayload() {
  const response = await fetch(marketVisualizationUrl, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Market visualization request failed with ${response.status}. Generate frontend/public/market_visualizations.json or set VITE_API_BASE_URL.`,
    )
  }

  const payload = (await response.json()) as MarketVisualizationPayload
  return assertPayload(payload)
}

function assertPayload(payload: MarketVisualizationPayload) {
  if (
    !payload ||
    !Array.isArray(payload.tickers) ||
    !Array.isArray(payload.metrics) ||
    !Array.isArray(payload.data)
  ) {
    throw new Error('Market visualization payload is malformed.')
  }

  return payload
}

function normalizePayload(payload: MarketVisualizationPayload): MarketDataset {
  const tickers = payload.tickers
  const metrics = payload.metrics.filter(isMetric)
  const series: MarketDataset['series'] = {}
  const drawdownSeries: MarketDataset['drawdownSeries'] = {}
  const drawdownRows = Array.isArray(payload.drawdown_data)
    ? payload.drawdown_data
    : []

  for (const ticker of tickers) {
    series[ticker] = {}
    drawdownSeries[ticker] = {
      points: [],
      summary: emptySummary(),
    }
  }

  for (const row of payload.data) {
    if (!isMetric(row.metric)) {
      continue
    }

    if (!series[row.ticker]) {
      series[row.ticker] = {}
    }

    if (!series[row.ticker][row.metric]) {
      series[row.ticker][row.metric] = {
        points: [],
        summary: emptySummary(),
      }
    }

    const marketSeries = series[row.ticker][row.metric]

    if (!marketSeries) {
      continue
    }

    marketSeries.points.push({
      date: row.date,
      time: row.date,
      value: row.value,
    })
  }

  for (const row of drawdownRows) {
    if (!drawdownSeries[row.ticker]) {
      drawdownSeries[row.ticker] = {
        points: [],
        summary: emptySummary(),
      }
    }

    drawdownSeries[row.ticker].points.push({
      date: row.date,
      time: row.date,
      value: row.value,
    })
  }

  for (const ticker of Object.keys(series)) {
    for (const metric of metrics) {
      const marketSeries = series[ticker][metric]

      if (!marketSeries || marketSeries.points.length === 0) {
        continue
      }

      marketSeries.summary = summarizeSeries(marketSeries.points)
    }
  }

  for (const ticker of Object.keys(drawdownSeries)) {
    const drawdownSeriesForTicker = drawdownSeries[ticker]

    if (drawdownSeriesForTicker.points.length === 0) {
      continue
    }

    drawdownSeriesForTicker.summary = summarizeSeries(
      drawdownSeriesForTicker.points,
    )
  }

  return {
    drawdownSeries,
    endDate: payload.end_date,
    metrics,
    rowCount: payload.data.length,
    series,
    startDate: payload.start_date,
    tickers,
  }
}

function summarizeSeries(points: MarketSeriesPoint[]): MarketSeriesSummary {
  const firstPoint = points[0]
  const latestPoint = points.at(-1) ?? firstPoint

  let minValue = firstPoint.value
  let maxValue = firstPoint.value

  for (const point of points) {
    if (point.value < minValue) {
      minValue = point.value
    }

    if (point.value > maxValue) {
      maxValue = point.value
    }
  }

  const change = latestPoint.value - firstPoint.value
  const changePct = firstPoint.value === 0 ? 0 : change / firstPoint.value

  return {
    change,
    changePct,
    firstValue: firstPoint.value,
    lastValue: latestPoint.value,
    latestDate: latestPoint.date,
    maxValue,
    minValue,
    observations: points.length,
  }
}

function emptySummary(): MarketSeriesSummary {
  return {
    change: 0,
    changePct: 0,
    firstValue: 0,
    lastValue: 0,
    latestDate: '',
    maxValue: 0,
    minValue: 0,
    observations: 0,
  }
}

function isMetric(metric: string): metric is Metric {
  return metricOrder.includes(metric as Metric)
}
