import { useEffect, useRef, useState } from 'react'
import { MarketLineChart } from './components/charts/MarketLineChart'
import { EntrySplash } from './components/ui/EntrySplash'
import { CountUpValue } from './components/ui/CountUpValue'
import { InfoTooltip } from './components/ui/InfoTooltip'
import { ShiftingTabs } from './components/ui/ShiftingTabs'
import { loadMarketDataset } from './lib/market-data'
import type {
  MarketDataset,
  MarketSeriesPoint,
  Metric,
} from './types/market'
import './App.css'

const metricMeta = {
  close: {
    chartLabel: 'Close Price',
    label: 'Raw close price',
    tabLabel: 'Close Price',
  },
  returns: {
    chartLabel: 'Close Returns',
    label: 'Close returns',
    tabLabel: 'Close Returns',
  },
  log_returns: {
    chartLabel: 'Close Log-Returns',
    label: 'Close log-returns',
    tabLabel: 'Close Log-Returns',
  },
} satisfies Record<
  Metric,
  { chartLabel: string; label: string; tabLabel: string }
>

const assetMeta: Record<string, string> = {
  AAPL: 'Apple',
  AMZN: 'Amazon',
  GOOGL: 'Alphabet',
  MSFT: 'Microsoft',
  SPY: 'SPDR S&P 500 ETF',
  TSLA: 'Tesla',
}

const chartFocusStartDate = '2021-01-01'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function App() {
  const [dataset, setDataset] = useState<MarketDataset | null>(null)
  const [selectedTicker, setSelectedTicker] = useState('AAPL')
  const [selectedMetric, setSelectedMetric] = useState<Metric>('close')
  const [activeTicker, setActiveTicker] = useState('AAPL')
  const [activeMetric, setActiveMetric] = useState<Metric>('close')
  const [isSplashVisible, setIsSplashVisible] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const splashTimer = window.setTimeout(() => {
      setIsSplashVisible(false)
    }, 3000)

    return () => {
      window.clearTimeout(splashTimer)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let isDisposed = false

    async function hydrate() {
      try {
        const loadedDataset = await loadMarketDataset()

        if (isDisposed) {
          return
        }

        setDataset(loadedDataset)
        const initialTicker = loadedDataset.tickers.includes('AAPL')
          ? 'AAPL'
          : loadedDataset.tickers[0] ?? 'AAPL'
        const initialMetric = loadedDataset.metrics.includes('close')
          ? 'close'
          : loadedDataset.metrics[0] ?? 'close'

        setSelectedTicker(initialTicker)
        setActiveTicker(initialTicker)
        setSelectedMetric(initialMetric)
        setActiveMetric(initialMetric)
      } catch (loadError) {
        if (!isDisposed) {
          const message =
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load market visualizations.'

          setError(message)
        }
      } finally {
        if (!isDisposed) {
          setIsLoading(false)
        }
      }
    }

    hydrate()

    return () => {
      isDisposed = true
    }
  }, [])

  useEffect(() => {
    if (!dataset) {
      return
    }

    if (selectedTicker === activeTicker && selectedMetric === activeMetric) {
      return
    }

    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      setActiveTicker(selectedTicker)
      setActiveMetric(selectedMetric)
      refreshTimerRef.current = null
    }, 1500)

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [activeMetric, activeTicker, dataset, selectedMetric, selectedTicker])

  const currentSeries = dataset?.series[activeTicker]?.[activeMetric] ?? null
  const currentPoints = currentSeries?.points ?? []
  const currentSummary = currentSeries?.summary ?? null
  const latestAvailableDate =
    currentSummary?.latestDate ?? dataset?.endDate ?? chartFocusStartDate
  const yearToDateMove = buildYearToDateMove(currentPoints)
  const refreshLabel = `${selectedTicker} ${metricMeta[selectedMetric].chartLabel}`
  const isRefreshing =
    selectedTicker !== activeTicker || selectedMetric !== activeMetric
  const startCountUp = !isSplashVisible && !isLoading && !isRefreshing

  return (
    <div className="app-shell">
      <EntrySplash visible={isSplashVisible} />
      <div className="risk-grid" aria-hidden="true"></div>
      <header className="topbar">
        <nav className="topbar-nav" aria-label="Page sections">
          <a href="#market-visualizer">Visualizer</a>
        </nav>
      </header>

      <main className="page">
        <section id="market-visualizer" className="visualizer-section">
          <div className="module-shell">
            <div className="module-header">
              <div>
                <p className="section-eyebrow">Market visualization</p>
                <h1>{activeTicker} market series</h1>
              </div>

              <div className="status-cluster">
                <div className="status-stack">
                  <span className="status-pill">
                    {metricMeta[activeMetric].chartLabel}
                  </span>
                  <span className="status-subtext">
                    as of {formatSingleDate(latestAvailableDate)}
                  </span>
                </div>
                <span className="status-readout">
                  {currentSummary
                    ? (
                        <CountUpValue
                          key={`${activeTicker}:${activeMetric}:status`}
                          className="status-readout__value"
                          formatValue={(value) =>
                            formatMetricValue(activeMetric, value)
                          }
                          startWhen={startCountUp}
                          value={currentSummary.lastValue}
                        />
                      )
                    : 'Loading'}
                </span>
              </div>
            </div>

            <div className="control-rail">
              <ShiftingTabs
                label="Asset selection"
                labelTooltip={
                  <div className="info-tooltip__stack">
                    <p>
                      Choose which market instrument is loaded into the chart
                      and summary cards.
                    </p>
                    <p>
                      Changing the asset resets the visible chart window to the
                      2021-to-latest view.
                    </p>
                  </div>
                }
                options={(dataset?.tickers ?? []).map((ticker) => ({
                  description: assetMeta[ticker],
                  label: ticker,
                  value: ticker,
                }))}
                searchPlaceholder="Search asset"
                value={selectedTicker}
                onChange={setSelectedTicker}
              />

              <ShiftingTabs
                label="Series selection"
                labelTooltip={
                  <div className="info-tooltip__stack">
                    <p>
                      Switch the plotted artifact between close price,
                      close-to-close return, and close log-return for the
                      selected asset.
                    </p>
                  </div>
                }
                options={(dataset?.metrics ?? []).map((metric) => ({
                  label: metricMeta[metric].tabLabel,
                  value: metric,
                }))}
                searchPlaceholder="Search series"
                value={selectedMetric}
                onChange={(metric) => setSelectedMetric(metric as Metric)}
              />
            </div>

            {isLoading ? (
              <div className="loading-panel">
                <div className="loading-bar"></div>
                <div className="loading-chart"></div>
              </div>
            ) : null}

            {!isLoading && error ? (
              <div className="error-panel">
                <p className="section-eyebrow">Data error</p>
                <h2>Unable to initialize the market visualization layer</h2>
                <p>{error}</p>
              </div>
            ) : null}

            {!isLoading && dataset && currentSeries && currentSummary ? (
              <>
                <div className="market-summary">
                  <div className="summary-stat">
                    <span>Series</span>
                    <strong>{metricMeta[activeMetric].chartLabel}</strong>
                  </div>
                  <div className="summary-stat">
                    <div className="summary-stat__heading">
                      <span>Net move</span>
                      {yearToDateMove ? (
                        <InfoTooltip
                          label="Net move details"
                          content={
                            <div className="info-tooltip__stack">
                              <p>
                                Year-to-date change in the selected series from
                                the first available market observation in the
                                current year through the latest observation.
                              </p>
                              <span className="info-tooltip__timestamp">
                                Start timestamp: {yearToDateMove.startDate}
                              </span>
                            </div>
                          }
                        />
                      ) : null}
                    </div>
                    <strong
                      className={buildDeltaClassName(yearToDateMove?.change)}
                    >
                      {yearToDateMove
                        ? (
                            <CountUpValue
                              key={`${activeTicker}:${activeMetric}:net-move`}
                              formatValue={(value) =>
                                formatMetricChange(activeMetric, value)
                              }
                              startWhen={startCountUp}
                              value={yearToDateMove.change}
                            />
                          )
                        : 'Loading'}
                    </strong>
                  </div>
                  <div className="summary-stat">
                    <span>Window</span>
                    <strong className="window-range">
                      <span className="window-date">
                        {formatSingleDate(chartFocusStartDate)}
                      </span>
                      <span className="window-separator">-</span>
                      <span className="window-date">
                        {formatSingleDate(latestAvailableDate)}
                      </span>
                    </strong>
                  </div>
                </div>

                <div className="chart-panel">
                  <MarketLineChart
                    ticker={activeTicker}
                    metric={activeMetric}
                    points={currentPoints}
                    defaultVisibleFrom={chartFocusStartDate}
                    rangeResetKey={activeTicker}
                    isRefreshing={isRefreshing}
                    refreshLabel={refreshLabel}
                  />
                </div>
              </>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}

function formatMetricValue(metric: Metric, value: number) {
  return metric === 'close'
    ? currencyFormatter.format(value)
    : percentFormatter.format(value)
}

function formatMetricChange(metric: Metric, value: number) {
  const prefix = value > 0 ? '+' : ''

  return metric === 'close'
    ? `${prefix}${currencyFormatter.format(value)}`
    : `${prefix}${percentFormatter.format(value)}`
}

function formatSingleDate(date: string) {
  return dateFormatter.format(new Date(date))
}

function buildYearToDateMove(points: MarketSeriesPoint[]) {
  const latestPoint = points.at(-1)

  if (!latestPoint) {
    return null
  }

  const currentYearStart = `${latestPoint.date.slice(0, 4)}-01-01`
  const firstYearPoint =
    points.find((point) => point.date >= currentYearStart) ?? points[0]

  return {
    change: latestPoint.value - firstYearPoint.value,
    startDate: firstYearPoint.date,
  }
}

function buildDeltaClassName(value?: number) {
  if (typeof value !== 'number') {
    return ''
  }

  if (value > 0) {
    return 'summary-stat__value summary-stat__value--positive'
  }

  if (value < 0) {
    return 'summary-stat__value summary-stat__value--negative'
  }

  return 'summary-stat__value'
}

export default App
