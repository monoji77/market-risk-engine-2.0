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
  type RiskClassification,
  type TickerRiskAssessment,
type VolatilityMetricKey,
  } from '../types/market'

interface LoadOptions {
  forceRefresh?: boolean
}

const configuredBlobArtifactsUrl = normalizeBlobArtifactsUrl(
  import.meta.env.VITE_AZURE_BLOB_ARTIFACTS_URL,
)
const configuredApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
const apiRootUrl = configuredBlobArtifactsUrl
  ? null
  : buildApiRootUrl(configuredApiBaseUrl)
const marketCatalogUrl = configuredBlobArtifactsUrl
  ? buildBlobArtifactUrl(configuredBlobArtifactsUrl, ['market_catalog.json'])
  : `${apiRootUrl}/market/catalog`
const marketTickerBaseUrl = configuredBlobArtifactsUrl
  ? null
  : `${apiRootUrl}/market/tickers`
const advancedMetricsBaseUrl = configuredBlobArtifactsUrl
  ? null
  : `${apiRootUrl}/market/advanced-metrics`

let catalogPromise: Promise<MarketCatalogPayload> | null = null
const tickerDatasetPromiseCache = new Map<string, Promise<MarketDataset>>()

export function loadMarketCatalog() {
  if (!catalogPromise) {
    catalogPromise = getMarketCatalog()
  }

  return catalogPromise
}

export function loadTickerDataset(ticker: string) {
  return primeTickerDatasetPromise(ticker)
}

export function refreshTickerDataset(ticker: string) {
  return primeTickerDatasetPromise(ticker, { forceRefresh: true })
}

function primeTickerDatasetPromise(ticker: string, options: LoadOptions = {}) {
  const cachedPromise = options.forceRefresh
    ? null
    : tickerDatasetPromiseCache.get(ticker)

  if (cachedPromise) {
    return cachedPromise
  }

  const nextPromise = getTickerDataset(ticker, options).catch((error) => {
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
      buildPayloadRequestError(
        'Market catalog',
        response.status,
        'backend/02_build_market_visualizations.py',
      ),
    )
  }

  const payload = await parsePayloadResponse<MarketCatalogPayload>(
    response,
    'Market catalog',
  )

  return normalizeMarketCatalogPayload(assertMarketCatalogPayload(payload))
}

async function getTickerDataset(ticker: string, options: LoadOptions = {}) {
  const [marketPayload, advancedPayload] = await Promise.all([
    loadMarketTickerPayload(ticker, options),
    loadAdvancedTickerPayload(ticker, options),
  ])

  return normalizeTickerPayload(marketPayload, advancedPayload)
}

async function loadMarketTickerPayload(ticker: string, options: LoadOptions = {}) {
  const response = await fetch(
    buildRequestUrl(buildMarketTickerPayloadUrl(ticker), options),
    {
      cache: options.forceRefresh ? 'no-store' : 'default',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      buildPayloadRequestError(
        `Ticker payload for ${ticker}`,
        response.status,
        'backend/02_build_market_visualizations.py',
      ),
    )
  }

  const payload = await parsePayloadResponse<MarketTickerPayload>(
    response,
    `${ticker} market payload`,
  )

  return normalizeMarketTickerPayload(assertMarketTickerPayload(payload))
}

async function loadAdvancedTickerPayload(
  ticker: string,
  options: LoadOptions = {},
) {
  const response = await fetch(
    buildRequestUrl(buildAdvancedTickerPayloadUrl(ticker), options),
    {
      cache: options.forceRefresh ? 'no-store' : 'default',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      buildPayloadRequestError(
        `Advanced ticker payload for ${ticker}`,
        response.status,
        'backend/03_calculate_other_risk_measures.py',
      ),
    )
  }

  const payload = await parsePayloadResponse<AdvancedTickerPayload>(
    response,
    `${ticker} advanced market payload`,
  )

  return assertAdvancedTickerPayload(payload)
}

function buildRequestUrl(url: string, options: LoadOptions = {}) {
  if (!options.forceRefresh) {
    return url
  }

  const nextUrl = new URL(url, window.location.href)
  nextUrl.searchParams.set('_ts', Date.now().toString())

  return nextUrl.toString()
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
  const garchVolatilityRows = advancedPayload?.series.garch_1_1_volatility ?? []
  const garchVolatilityMarketSeries = buildSeries(garchVolatilityRows)
  rowCount += garchVolatilityMarketSeries.points.length

  return {
    drawdownSeries: {
      [ticker]: drawdownMarketSeries,
    },
    endDate: marketPayload.end_date,
    garchDistributionByTicker: {
      [ticker]: advancedPayload?.garch_1_1_distribution ?? null,
    },
    garchVolatilitySeries: {
      [ticker]: garchVolatilityMarketSeries,
    },
    metrics,
    riskAssessmentByTicker: {
      [ticker]: normalizeRiskAssessment(advancedPayload?.risk_assessment),
    },
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

function buildMarketTickerPayloadUrl(ticker: string) {
  if (configuredBlobArtifactsUrl) {
    return buildBlobArtifactUrl(configuredBlobArtifactsUrl, [
      'tickers',
      buildTickerArtifactFilename(ticker),
    ])
  }

  return buildApiTickerPayloadUrl(marketTickerBaseUrl, ticker)
}

function buildAdvancedTickerPayloadUrl(ticker: string) {
  if (configuredBlobArtifactsUrl) {
    return buildBlobArtifactUrl(configuredBlobArtifactsUrl, [
      'advanced_metrics',
      buildTickerArtifactFilename(ticker),
    ])
  }

  return buildApiTickerPayloadUrl(advancedMetricsBaseUrl, ticker)
}

function buildTickerArtifactFilename(ticker: string) {
  return `${encodeURIComponent(ticker)}.json`
}

function buildApiTickerPayloadUrl(baseUrl: string | null, ticker: string) {
  if (!baseUrl) {
    throw new Error('Ticker payload URL is not configured.')
  }

  return `${baseUrl}/${encodeURIComponent(ticker)}`
}

function buildBlobArtifactUrl(baseUrl: URL, pathSegments: string[]) {
  const nextUrl = new URL(baseUrl.toString())
  const normalizedBasePath = nextUrl.pathname.replace(/\/+$/, '')
  const encodedPath = pathSegments
    .flatMap((segment) => segment.split('/'))
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  nextUrl.pathname = `${normalizedBasePath}/${encodedPath}`

  return nextUrl.toString()
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

function normalizeBlobArtifactsUrl(baseUrl: string | undefined) {
  const normalizedValue = baseUrl?.trim()

  if (!normalizedValue) {
    return null
  }

  try {
    return new URL(normalizedValue)
  } catch {
    throw new Error(
      'VITE_AZURE_BLOB_ARTIFACTS_URL must be a valid absolute URL to the artifacts container.',
    )
  }
}

function buildPayloadRequestError(
  label: string,
  status: number,
  preparationScript: string,
) {
  if (configuredBlobArtifactsUrl) {
    return `${label} request failed with ${status}. Confirm VITE_AZURE_BLOB_ARTIFACTS_URL points to the Azure artifacts container and that browser read access plus Blob CORS are configured for this origin.`
  }

  return `${label} request failed with ${status}. Run ${preparationScript} first.`
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

    if (parseError instanceof Error) {
      throw new Error(`${label} payload is not valid JSON. ${parseError.message}`, {
        cause: parseError,
      })
    }

    throw new Error(`${label} payload is not valid JSON. Unknown parse error`, {
      cause: parseError,
    })
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

function normalizeRiskAssessment(
  riskAssessment: TickerRiskAssessment | null | undefined,
): TickerRiskAssessment | null {
  if (!riskAssessment || typeof riskAssessment !== 'object') {
    return null
  }

  return {
    benchmark_ticker:
      typeof riskAssessment.benchmark_ticker === 'string'
        ? riskAssessment.benchmark_ticker
        : '^GSPC',
    drawdown: {
      asset_max_drawdown_pct: normalizeFiniteNumber(
        riskAssessment.drawdown?.asset_max_drawdown_pct,
      ),
      benchmark_max_drawdown_pct: normalizeFiniteNumber(
        riskAssessment.drawdown?.benchmark_max_drawdown_pct,
      ),
      classification: normalizeRiskClassification(
        riskAssessment.drawdown?.classification,
      ),
      lookback_days:
        typeof riskAssessment.drawdown?.lookback_days === 'number'
          ? riskAssessment.drawdown.lookback_days
          : 30,
      relative_drawdown_ratio: normalizeFiniteNumber(
        riskAssessment.drawdown?.relative_drawdown_ratio,
      ),
      window_end_date:
        typeof riskAssessment.drawdown?.window_end_date === 'string'
          ? riskAssessment.drawdown.window_end_date
          : '',
      window_start_date:
        typeof riskAssessment.drawdown?.window_start_date === 'string'
          ? riskAssessment.drawdown.window_start_date
          : '',
    },
    overall: {
      classification: normalizeRiskClassification(
        riskAssessment.overall?.classification,
      ),
      label:
        typeof riskAssessment.overall?.label === 'string'
          ? riskAssessment.overall.label
          : null,
    },
    volatility: {
      asset_latest_metrics: normalizeVolatilityMetricMap(
        riskAssessment.volatility?.asset_latest_metrics,
      ),
      asset_max: normalizeFiniteNumber(riskAssessment.volatility?.asset_max),
      benchmark_latest_metrics: normalizeVolatilityMetricMap(
        riskAssessment.volatility?.benchmark_latest_metrics,
      ),
      benchmark_max: normalizeFiniteNumber(
        riskAssessment.volatility?.benchmark_max,
      ),
      classification: normalizeRiskClassification(
        riskAssessment.volatility?.classification,
      ),
      latest_date:
        typeof riskAssessment.volatility?.latest_date === 'string'
          ? riskAssessment.volatility.latest_date
          : '',
      relative_max_volatility: normalizeFiniteNumber(
        riskAssessment.volatility?.relative_max_volatility,
      ),
    },
  }
}

function normalizeVolatilityMetricMap(
  metrics: Partial<Record<VolatilityMetricKey, number | null>> | undefined,
) {
  if (!metrics || typeof metrics !== 'object') {
    return {}
  }

  const normalizedMetrics: Partial<Record<VolatilityMetricKey, number | null>> = {}

  for (const metricKey of [
    'daily_short_term_volatility',
    'garch_1_1_volatility',
    'ewma_volatility',
  ] as const) {
    normalizedMetrics[metricKey] = normalizeFiniteNumber(metrics[metricKey])
  }

  return normalizedMetrics
}

function normalizeFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeRiskClassification(
  value: unknown,
): RiskClassification | null {
  return riskClassificationOrder.includes(value as RiskClassification)
    ? (value as RiskClassification)
    : null
}

const riskClassificationOrder = [
  'Low',
  'Moderate',
  'High',
  'Very High',
  'Extreme',
] as const
