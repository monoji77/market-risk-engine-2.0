import {
  type AdvancedTickerPayload,
  metricOrder,
  type MarketCatalogPayload,
  type MarketDataset,
  type MarketPointRow,
  type MarketSeriesPoint,
  type MarketSeriesSummary,
  type MarketTickerPayload,
  type Metric,
} from '../types/market'

const configuredApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
const apiRootUrl = buildApiRootUrl(configuredApiBaseUrl)
const marketCatalogUrl = `${apiRootUrl}/market/catalog`
const marketTickerBaseUrl = `${apiRootUrl}/market/tickers`
const advancedMetricsBaseUrl = `${apiRootUrl}/market/advanced-metrics`

let catalogPromise: Promise<MarketCatalogPayload> | null = null
const tickerDatasetPromiseCache = new Map<string, Promise<MarketDataset>>()

export function loadMarketCatalog() {
  if (!catalogPromise) {
    catalogPromise = getMarketCatalog()
  }

  return catalogPromise
}

export function loadTickerDataset(ticker: string) {
  const cachedPromise = tickerDatasetPromiseCache.get(ticker)

  if (cachedPromise) {
    return cachedPromise
  }

  const nextPromise = getTickerDataset(ticker).catch((error) => {
    tickerDatasetPromiseCache.delete(ticker)
    throw error
  })

  tickerDatasetPromiseCache.set(ticker, nextPromise)

  return nextPromise
}

async function getMarketCatalog() {
  const response = await fetch(marketCatalogUrl, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Market catalog request failed with ${response.status}. Run backend/02_build_market_visualizations.py first.`,
    )
  }

  const payload = await parsePayloadResponse<MarketCatalogPayload>(
    response,
    'Market catalog',
  )

  return normalizeMarketCatalogPayload(assertMarketCatalogPayload(payload))
}

async function getTickerDataset(ticker: string) {
  const [marketPayload, advancedPayload] = await Promise.all([
    loadMarketTickerPayload(ticker),
    loadAdvancedTickerPayload(ticker),
  ])

  return normalizeTickerPayload(marketPayload, advancedPayload)
}

async function loadMarketTickerPayload(ticker: string) {
  const response = await fetch(buildTickerPayloadUrl(marketTickerBaseUrl, ticker), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Ticker payload request failed with ${response.status} for ${ticker}. Run backend/02_build_market_visualizations.py first.`,
    )
  }

  const payload = await parsePayloadResponse<MarketTickerPayload>(
    response,
    `${ticker} market payload`,
  )

  return normalizeMarketTickerPayload(assertMarketTickerPayload(payload))
}

async function loadAdvancedTickerPayload(ticker: string) {
  const response = await fetch(
    buildTickerPayloadUrl(advancedMetricsBaseUrl, ticker),
    {
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    return null
  }

  const payload = await parsePayloadResponse<AdvancedTickerPayload>(
    response,
    `${ticker} advanced market payload`,
  )

  return assertAdvancedTickerPayload(payload)
}

function assertMarketCatalogPayload(payload: MarketCatalogPayload) {
  if (
    !payload ||
    !Array.isArray(payload.metrics) ||
    !Array.isArray(payload.tickers)
  ) {
    throw new Error('Market catalog payload is malformed.')
  }

  return payload
}

function assertMarketTickerPayload(payload: MarketTickerPayload) {
  if (
    !payload ||
    typeof payload.ticker !== 'string' ||
    !Array.isArray(payload.metrics) ||
    !payload.series ||
    !Array.isArray(payload.drawdown_series)
  ) {
    throw new Error('Ticker market payload is malformed.')
  }

  return payload
}

function assertAdvancedTickerPayload(payload: AdvancedTickerPayload | null) {
  if (!payload) {
    return null
  }

  if (
    typeof payload.ticker !== 'string' ||
    !Array.isArray(payload.metrics) ||
    !payload.series
  ) {
    throw new Error('Ticker advanced payload is malformed.')
  }

  return payload
}

function normalizeMarketCatalogPayload(payload: MarketCatalogPayload) {
  return {
    ...payload,
    metrics: payload.metrics.map(normalizeMetricIdentifier).filter(isMetric),
    tickers: payload.tickers.map((ticker) => ({
      ...ticker,
      name: ticker.security ?? ticker.name ?? null,
      security: ticker.security ?? ticker.name ?? null,
    })),
  }
}

function normalizeMarketTickerPayload(payload: MarketTickerPayload) {
  const normalizedSeries = Object.entries(payload.series).reduce<
    Partial<Record<Metric, MarketPointRow[]>>
  >((seriesMap, [metric, rows]) => {
    const normalizedMetric = normalizeMetricIdentifier(metric)

    if (rows && isMetric(normalizedMetric)) {
      seriesMap[normalizedMetric] = rows
    }

    return seriesMap
  }, {})

  return {
    ...payload,
    metrics: payload.metrics.map(normalizeMetricIdentifier).filter(isMetric),
    series: normalizedSeries,
  }
}

function normalizeTickerPayload(
  marketPayload: MarketTickerPayload,
  advancedPayload: AdvancedTickerPayload | null,
): MarketDataset {
  const ticker = marketPayload.ticker
  const metrics = marketPayload.metrics.filter(isMetric)
  const series: MarketDataset['series'] = {
    [ticker]: {},
  }

  let rowCount = 0

  for (const metric of metrics) {
    const metricRows = marketPayload.series[metric] ?? []
    const marketSeries = buildSeries(metricRows)
    rowCount += marketSeries.points.length

    series[ticker][metric] = marketSeries
  }

  const drawdownMarketSeries = buildSeries(marketPayload.drawdown_series)
  rowCount += drawdownMarketSeries.points.length

  const shortTermVolatilityRows =
    advancedPayload?.series.daily_short_term_volatility ?? []
  const shortTermVolatilityMarketSeries = buildSeries(shortTermVolatilityRows)
  rowCount += shortTermVolatilityMarketSeries.points.length

  return {
    drawdownSeries: {
      [ticker]: drawdownMarketSeries,
    },
    endDate: marketPayload.end_date,
    metrics,
    rowCount,
    series,
    shortTermVolatilitySeries: {
      [ticker]: shortTermVolatilityMarketSeries,
    },
    startDate: marketPayload.start_date,
    tickers: [ticker],
  }
}

function buildSeries(rows: MarketPointRow[]) {
  const points = normalizePointRows(rows)

  return {
    points,
    summary: points.length ? summarizeSeries(points) : emptySummary(),
  }
}

function normalizePointRows(rows: MarketPointRow[]) {
  return rows
    .filter((row) => Number.isFinite(row.value))
    .map((row) => ({
      date: row.date,
      time: row.date,
      value: row.value,
    }))
}

function buildTickerPayloadUrl(baseUrl: string, ticker: string) {
  return `${baseUrl}/${encodeURIComponent(ticker)}`
}

function normalizeApiBaseUrl(baseUrl: string | undefined) {
  const normalizedValue = baseUrl?.trim()

  if (!normalizedValue) {
    return null
  }

  return normalizedValue.endsWith('/')
    ? normalizedValue.slice(0, -1)
    : normalizedValue
}

function buildApiRootUrl(baseUrl: string | null) {
  if (!baseUrl) {
    return '/api'
  }

  return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`
}

async function parsePayloadResponse<T>(response: Response, label: string) {
  const text = await response.text()

  try {
    return JSON.parse(text) as T
  } catch (parseError) {
    const sanitizedText = sanitizeNonFiniteJsonLiterals(text)

    if (sanitizedText !== text) {
      try {
        return JSON.parse(sanitizedText) as T
      } catch {
        // Fall through to the structured error below.
      }
    }

    const message =
      parseError instanceof Error ? parseError.message : 'Unknown parse error'

    throw new Error(`${label} payload is not valid JSON. ${message}`)
  }
}

function sanitizeNonFiniteJsonLiterals(text: string) {
  return text.replace(
    /(:\s*)(NaN|-Infinity|Infinity)(\s*[,}\]])/g,
    '$1null$3',
  )
}

function normalizeMetricIdentifier(metric: string) {
  return metric === 'Close' ? 'close' : metric
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
