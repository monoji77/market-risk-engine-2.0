import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { DrawdownChart } from './components/charts/DrawdownChart'
import { MarketLineChart } from './components/charts/MarketLineChart'
import { EntrySplash } from './components/ui/EntrySplash'
import { CountUpValue } from './components/ui/CountUpValue'
import { InfoTooltip } from './components/ui/InfoTooltip'
import { ShiftingTabs } from './components/ui/ShiftingTabs'
import { loadMarketDataset } from './lib/market-data'
import type {
  ChartVisibleRange,
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

const minimumSplashDurationMs = 5000
type ChartView = 'overview' | 'advanced'
type PageView = 'home' | 'portfolio'

function App() {
  const [dataset, setDataset] = useState<MarketDataset | null>(null)
  const [selectedTicker, setSelectedTicker] = useState('AAPL')
  const [selectedMetric, setSelectedMetric] = useState<Metric>('close')
  const [activeTicker, setActiveTicker] = useState('AAPL')
  const [activeMetric, setActiveMetric] = useState<Metric>('close')
  const [hasMetMinimumSplashDuration, setHasMetMinimumSplashDuration] =
    useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sharedVisibleRange, setSharedVisibleRange] =
    useState<ChartVisibleRange | null>(null)
  const [chartView, setChartView] = useState<ChartView>('overview')
  const [pageView, setPageView] = useState<PageView>('home')
  const [hoveredPageNav, setHoveredPageNav] = useState<PageView | null>(null)
  const [pressedPageNav, setPressedPageNav] = useState<PageView | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const splashTimer = window.setTimeout(() => {
      setHasMetMinimumSplashDuration(true)
    }, minimumSplashDurationMs)

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
    setSharedVisibleRange(null)
  }, [selectedTicker])

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
  const currentDrawdownSeries = dataset?.drawdownSeries[activeTicker] ?? null
  const currentPoints = currentSeries?.points ?? []
  const currentSummary = currentSeries?.summary ?? null
  const latestAvailableDate =
    currentSummary?.latestDate ?? dataset?.endDate ?? chartFocusStartDate
  const visibleWindow = buildVisiblePointWindow(
    currentPoints,
    sharedVisibleRange,
    chartFocusStartDate,
  )
  const visibleWindowStartDate =
    visibleWindow?.startPoint.date ?? chartFocusStartDate
  const visibleWindowEndDate = visibleWindow?.endPoint.date ?? latestAvailableDate
  const yearToDateMove = buildVisibleYearToDateMove(currentPoints, visibleWindow)
  const refreshLabel = `${selectedTicker} ${metricMeta[selectedMetric].chartLabel}`
  const isTickerRefreshing = selectedTicker !== activeTicker
  const isMetricRefreshing = selectedMetric !== activeMetric
  const isRefreshing = isTickerRefreshing || isMetricRefreshing
  const isSplashVisible = isLoading || !hasMetMinimumSplashDuration
  const startCountUp = !isSplashVisible && !isLoading && !isRefreshing

  function handleSharedVisibleRangeChange(nextRange: ChartVisibleRange | null) {
    setSharedVisibleRange((currentRange) => {
      if (!nextRange && !currentRange) {
        return currentRange
      }

      if (
        currentRange &&
        nextRange &&
        Math.abs(currentRange.from - nextRange.from) < 0.05 &&
        Math.abs(currentRange.to - nextRange.to) < 0.05
      ) {
        return currentRange
      }

      return nextRange
    })
  }

  return (
    <div className="app-shell">
      <EntrySplash visible={isSplashVisible} />
      <div className="risk-grid" aria-hidden="true"></div>
      <header className="topbar">
        <nav className="topbar-nav" aria-label="Primary navigation">
          <button
            type="button"
            className="topbar-nav__link"
            data-active={pageView === 'home'}
            data-hovered={hoveredPageNav === 'home'}
            onMouseEnter={() => {
              if (pressedPageNav === 'home') {
                return
              }

              setHoveredPageNav('home')
            }}
            onMouseLeave={() => {
              setHoveredPageNav((current) => current === 'home' ? null : current)
              setPressedPageNav((current) => current === 'home' ? null : current)
            }}
            onClick={() => {
              setPageView('home')
              setHoveredPageNav(null)
              setPressedPageNav('home')
            }}
          >
            Home
          </button>
          <button
            type="button"
            className="topbar-nav__link"
            data-active={pageView === 'portfolio'}
            data-hovered={hoveredPageNav === 'portfolio'}
            onMouseEnter={() => {
              if (pressedPageNav === 'portfolio') {
                return
              }

              setHoveredPageNav('portfolio')
            }}
            onMouseLeave={() => {
              setHoveredPageNav((current) =>
                current === 'portfolio' ? null : current,
              )
              setPressedPageNav((current) =>
                current === 'portfolio' ? null : current,
              )
            }}
            onClick={() => {
              setPageView('portfolio')
              setHoveredPageNav(null)
              setPressedPageNav('portfolio')
            }}
          >
            Portfolio Risk Assessment
          </button>
        </nav>
      </header>

      <main className="page">
        <AnimatePresence mode="wait" initial={false}>
          {pageView === 'home' ? (
          <motion.section
            key="home"
            id="market-visualizer"
            className="visualizer-section"
            initial={{ opacity: 0, y: 18, scale: 0.992 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.992 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
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
                  <div className="visualizer-body">
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
                                    Year-to-date change in the selected series
                                    from the first available market observation
                                    in the year of the latest visible point
                                    through that visible endpoint.
                                  </p>
                                  <span className="info-tooltip__timestamp">
                                    Start timestamp: {yearToDateMove.startDate}
                                  </span>
                                  <span className="info-tooltip__timestamp">
                                    End timestamp: {yearToDateMove.endDate}
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
                            {formatSingleDate(visibleWindowStartDate)}
                          </span>
                          <span className="window-separator">-</span>
                          <span className="window-date">
                            {formatSingleDate(visibleWindowEndDate)}
                          </span>
                        </strong>
                      </div>
                    </div>

                    <div className="chart-panel chart-stack">
                      <nav className="chart-nav" aria-label="Market chart views">
                        <button
                          type="button"
                          className="chart-nav__link"
                          data-active={chartView === 'overview'}
                          onClick={() => setChartView('overview')}
                        >
                          Overview
                        </button>
                        <button
                          type="button"
                          className="chart-nav__link"
                          data-active={chartView === 'advanced'}
                          onClick={() => setChartView('advanced')}
                        >
                          Advanced
                        </button>
                      </nav>

                      <AnimatePresence mode="wait" initial={false}>
                        {chartView === 'overview' ? (
                          <motion.div
                            key="overview"
                            id="market-overview"
                            className="chart-section"
                            initial={{ opacity: 0, y: 16, scale: 0.994 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.994 }}
                            transition={{ duration: 0.24, ease: 'easeOut' }}
                          >
                            <MarketLineChart
                              ticker={activeTicker}
                              metric={activeMetric}
                              points={currentPoints}
                              defaultVisibleFrom={chartFocusStartDate}
                              rangeResetKey={activeTicker}
                              isRefreshing={isRefreshing}
                              onVisibleRangeChange={handleSharedVisibleRangeChange}
                              refreshLabel={refreshLabel}
                              syncedVisibleRange={sharedVisibleRange}
                            />

                            {currentDrawdownSeries?.points.length ? (
                              <>
                                <div className="chart-divider" aria-hidden="true"></div>
                                <DrawdownChart
                                  ticker={activeTicker}
                                  points={currentDrawdownSeries.points}
                                  defaultVisibleFrom={chartFocusStartDate}
                                  rangeResetKey={activeTicker}
                                  isRefreshing={isTickerRefreshing}
                                  onVisibleRangeChange={handleSharedVisibleRangeChange}
                                  refreshLabel={`${selectedTicker} close drawdown`}
                                  syncedVisibleRange={sharedVisibleRange}
                                />
                              </>
                            ) : null}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="advanced"
                            id="market-advanced"
                            className="chart-section"
                            initial={{ opacity: 0, y: 16, scale: 0.994 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.994 }}
                            transition={{ duration: 0.24, ease: 'easeOut' }}
                          >
                            <div className="advanced-placeholder">
                              <div
                                className="advanced-placeholder__chrome"
                                aria-hidden="true"
                              >
                                <span className="advanced-placeholder__dot advanced-placeholder__dot--red"></span>
                                <span className="advanced-placeholder__dot advanced-placeholder__dot--amber"></span>
                                <span className="advanced-placeholder__dot advanced-placeholder__dot--green"></span>
                              </div>
                              <p className="advanced-placeholder__eyebrow">
                                Currently in implementation
                              </p>
                              <ul className="advanced-placeholder__list">
                                <li>
                                  Historical VaR (using rolling 100 day VaR to
                                  calculate daily VaR)
                                </li>
                                <li>Historical ES (same)</li>
                                <li>CAGR</li>
                                <li>Volatility</li>
                              </ul>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </>
              ) : null}
          </div>
          </motion.section>
        ) : (
          <motion.section
            key="portfolio"
            id="portfolio-risk-assessment"
            className="visualizer-section"
            initial={{ opacity: 0, y: 18, scale: 0.992 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.992 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <div className="module-shell module-shell--portfolio">
              <div className="module-header module-header--compact">
                <div>
                  <p className="section-eyebrow">Portfolio risk assessment</p>
                  <h1>Portfolio risk engine</h1>
                </div>
              </div>

              <div className="advanced-placeholder advanced-placeholder--portfolio">
                <div className="advanced-placeholder__chrome" aria-hidden="true">
                  <span className="advanced-placeholder__dot advanced-placeholder__dot--red"></span>
                  <span className="advanced-placeholder__dot advanced-placeholder__dot--amber"></span>
                  <span className="advanced-placeholder__dot advanced-placeholder__dot--green"></span>
                </div>
                <p className="advanced-placeholder__eyebrow">
                  Currently in implementation
                </p>
                <ul className="advanced-placeholder__list">
                  <li>Portfolio Lab to build custom portfolio</li>
                  <li>Automated risk measures</li>
                </ul>
              </div>
            </div>
          </motion.section>
        )}
        </AnimatePresence>
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

function buildVisiblePointWindow(
  points: MarketSeriesPoint[],
  visibleRange: ChartVisibleRange | null,
  defaultVisibleFrom: string,
) {
  if (!points.length) {
    return null
  }

  if (!visibleRange) {
    const startIndex = Math.max(
      points.findIndex((point) => point.date >= defaultVisibleFrom),
      0,
    )

    return {
      endPoint: points.at(-1) ?? points[0],
      endPointIndex: points.length - 1,
      startPoint: points[startIndex] ?? points[0],
      startPointIndex: startIndex,
    }
  }

  const startIndex = clampPointIndex(
    Math.floor(visibleRange.from),
    points.length,
  )
  const endIndex = clampPointIndex(
    Math.ceil(visibleRange.to),
    points.length,
  )

  if (endIndex < startIndex) {
    return null
  }

  return {
    endPoint: points[endIndex] ?? points.at(-1) ?? points[0],
    endPointIndex: endIndex,
    startPoint: points[startIndex] ?? points[0],
    startPointIndex: startIndex,
  }
}

function buildVisibleYearToDateMove(
  points: MarketSeriesPoint[],
  visibleWindow: ReturnType<typeof buildVisiblePointWindow>,
) {
  const latestVisiblePoint = visibleWindow?.endPoint ?? points.at(-1)

  if (!latestVisiblePoint) {
    return null
  }

  const referenceYearStart = `${latestVisiblePoint.date.slice(0, 4)}-01-01`
  const startPoint =
    points.find(
      (point) =>
        point.date >= referenceYearStart && point.date <= latestVisiblePoint.date,
    ) ?? points[0]

  if (!startPoint) {
    return null
  }

  return {
    change: latestVisiblePoint.value - startPoint.value,
    endDate: latestVisiblePoint.date,
    startDate: startPoint.date,
  }
}

function clampPointIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), length - 1)
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
