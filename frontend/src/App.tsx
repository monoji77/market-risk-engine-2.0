import { AnimatePresence, motion } from 'framer-motion'
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { DrawdownChart } from './components/charts/DrawdownChart'
import { MarketLineChart } from './components/charts/MarketLineChart'
import { ShortTermVolatilityChart } from './components/charts/ShortTermVolatilityChart'
import { EntrySplash } from './components/ui/EntrySplash'
import { CountUpValue } from './components/ui/CountUpValue'
import { InfoTooltip } from './components/ui/InfoTooltip'
import ShinyText from './components/ui/ShinyText'
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
const ewmaLongTermLambda = 0.94
const ewmaShortTermLambda = 0.3

type ChartView = 'overview' | 'advanced'
type PageView = 'home' | 'portfolio'
type ExpandedChartId =
  | 'overview-primary'
  | 'overview-drawdown'
  | 'advanced-returns'
  | 'advanced-drawdown'
  | 'advanced-volatility'
  | 'advanced-ewma'

function App() {
  const [dataset, setDataset] = useState<MarketDataset | null>(null)
  const [selectedTicker, setSelectedTicker] = useState('AAPL')
  const [selectedMetric, setSelectedMetric] = useState<Metric>('close')
  const [overviewSelectedMetric, setOverviewSelectedMetric] =
    useState<Metric>('close')
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
  const [ewmaLambda, setEwmaLambda] = useState(ewmaLongTermLambda)
  const [hoveredPageNav, setHoveredPageNav] = useState<PageView | null>(null)
  const [pressedPageNav, setPressedPageNav] = useState<PageView | null>(null)
  const [sharedHoverDate, setSharedHoverDate] = useState<string | null>(null)
  const [isHoverDateLocked, setIsHoverDateLocked] = useState(false)
  const [isTopbarHovered, setIsTopbarHovered] = useState(false)
  const [isTopbarScrolled, setIsTopbarScrolled] = useState(false)
  const [expandedChartId, setExpandedChartId] =
    useState<ExpandedChartId | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const advancedRefreshTimerRef = useRef<number | null>(null)
  const volatilityCardPulseFrameRef = useRef<number | null>(null)
  const volatilityCardPulseTimerRef = useRef<number | null>(null)
  const [isAdvancedVolatilityBuffering, setIsAdvancedVolatilityBuffering] =
    useState(false)
  const [isVolatilityCardPulsing, setIsVolatilityCardPulsing] = useState(false)

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

      if (advancedRefreshTimerRef.current) {
        window.clearTimeout(advancedRefreshTimerRef.current)
      }

      if (volatilityCardPulseFrameRef.current) {
        window.cancelAnimationFrame(volatilityCardPulseFrameRef.current)
      }

      if (volatilityCardPulseTimerRef.current) {
        window.clearTimeout(volatilityCardPulseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setSharedVisibleRange(null)
  }, [selectedTicker])

  useEffect(() => {
    setSharedHoverDate(null)
    setIsHoverDateLocked(false)
  }, [chartView, pageView, selectedTicker])

  useEffect(() => {
    if (!expandedChartId) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpandedChartId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [expandedChartId])

  useEffect(() => {
    function handleScroll() {
      setIsTopbarScrolled(window.scrollY > 24)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
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
        setOverviewSelectedMetric(initialMetric)
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
  const currentReturnsSeries = dataset?.series[activeTicker]?.returns ?? null
  const currentDrawdownSeries = dataset?.drawdownSeries[activeTicker] ?? null
  const currentShortTermVolatilitySeries =
    dataset?.shortTermVolatilitySeries[activeTicker] ?? null
  const currentReturnsPoints = currentReturnsSeries?.points ?? []
  const currentDrawdownPoints = currentDrawdownSeries?.points ?? []
  const displayMetric: Metric = chartView === 'advanced' ? 'returns' : activeMetric
  const displaySeries =
    chartView === 'advanced' ? currentReturnsSeries : currentSeries
  const currentPoints = displaySeries?.points ?? []
  const currentShortTermVolatilityPoints =
    currentShortTermVolatilitySeries?.points ?? []
  const currentEwmaVolatilityPoints = useMemo(
    () => buildEwmaVolatilityPoints(currentReturnsPoints, ewmaLambda),
    [currentReturnsPoints, ewmaLambda],
  )
  const currentSummary = displaySeries?.summary ?? null

  const hoveredDrawdownPoint = buildPointByDate(
    currentDrawdownPoints,
    sharedHoverDate,
  )
  const activeDrawdownPoint =
    hoveredDrawdownPoint ?? currentDrawdownPoints.at(-1) ?? null
  const hoveredShortTermVolatilityPoint = buildPointByDate(
    currentShortTermVolatilityPoints,
    sharedHoverDate,
  )
  const activeShortTermVolatilityPoint =
    hoveredShortTermVolatilityPoint ??
    currentShortTermVolatilityPoints.at(-1) ??
    null
  const hoveredEwmaVolatilityPoint = buildPointByDate(
    currentEwmaVolatilityPoints,
    sharedHoverDate,
  )
  const activeEwmaVolatilityPoint =
    hoveredEwmaVolatilityPoint ?? currentEwmaVolatilityPoints.at(-1) ?? null

  const activeShortTermVolatilityMean = activeShortTermVolatilityPoint
    ? buildRollingMean(
        currentReturnsPoints,
        activeShortTermVolatilityPoint.date,
        30,
      )
    : null
  const dailyVolatilityConfidenceInterval =
    activeShortTermVolatilityPoint &&
    activeShortTermVolatilityMean !== null
      ? buildNormalConfidenceInterval(
          activeShortTermVolatilityMean,
          activeShortTermVolatilityPoint.value,
        )
      : null
  const dailyVolatilityConfidenceIntervalLabel =
    dailyVolatilityConfidenceInterval
      ? formatConfidenceInterval(dailyVolatilityConfidenceInterval)
      : 'Unavailable'

  const ewmaPresetLabel = resolveEwmaPresetLabel(ewmaLambda)
  const ewmaLambdaLabel = ewmaLambda.toFixed(2)
  const drawdownReportedValueLabel = activeDrawdownPoint
    ? `${currencyFormatter.format(activeDrawdownPoint.value)} on ${formatSingleDate(activeDrawdownPoint.date)}`
    : 'Unavailable'
  const ewmaReportedValueLabel = activeEwmaVolatilityPoint
    ? `${percentFormatter.format(activeEwmaVolatilityPoint.value)} on ${formatSingleDate(activeEwmaVolatilityPoint.date)}`
    : 'Unavailable'

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
  const yearToDateMove = buildVisibleYearToDateMove(
    currentPoints,
    visibleWindow,
    sharedHoverDate,
  )

  const refreshLabel = `${selectedTicker} ${metricMeta[chartView === 'advanced' ? 'returns' : selectedMetric].chartLabel}`
  const isTickerRefreshing = selectedTicker !== activeTicker
  const isMetricRefreshing = selectedMetric !== activeMetric
  const isRefreshing = isTickerRefreshing || isMetricRefreshing
  const isAdvancedReturnsBuffering =
    chartView === 'advanced' && activeMetric !== 'returns'
  const isAdvancedReturnsChartRefreshing =
    chartView === 'advanced' && (isTickerRefreshing || isAdvancedReturnsBuffering)
  const isAdvancedVolatilityChartRefreshing =
    chartView === 'advanced' &&
    (isTickerRefreshing ||
      isAdvancedReturnsBuffering ||
      isAdvancedVolatilityBuffering)
  const isAdvancedEwmaChartRefreshing =
    chartView === 'advanced' &&
    (isTickerRefreshing || isAdvancedReturnsBuffering)
  const isSplashVisible = isLoading || !hasMetMinimumSplashDuration
  const startCountUp =
    !isSplashVisible &&
    !isLoading &&
    (chartView === 'advanced'
      ? !isTickerRefreshing && !isAdvancedReturnsBuffering
      : !isRefreshing)
  const startAdvancedCountUp = startCountUp && !isAdvancedVolatilityBuffering

  const returnsChartTooltip = (
    <div className="info-tooltip__stack">
      <p>
        Close-to-close daily returns for the selected asset across the shared
        visible window.
      </p>
    </div>
  )

  const seriesSelectionTooltip =
    chartView === 'advanced' ? (
      <div className="info-tooltip__stack">
        <p>
          Advanced view is locked to close returns so daily short term
          volatility is calculated from a consistent base series.
        </p>
      </div>
    ) : (
      <div className="info-tooltip__stack">
        <p>
          Switch the plotted artifact between close price, close-to-close
          return, and close log-return for the selected asset.
        </p>
      </div>
    )

  const shortTermVolatilityTooltip = (
    <div className="info-tooltip__stack">
      <p>30-day rolling standard deviation of daily close returns.</p>
      <p>
        Its shape is often VIX-like for industry-dominant equities: volatility
        tends to spike when market stress hits large benchmark names, then mean
        revert as conditions stabilize.
      </p>
      {dailyVolatilityConfidenceInterval ? (
        <span className="info-tooltip__timestamp">
          95% Confidence Range: {dailyVolatilityConfidenceIntervalLabel}
        </span>
      ) : null}
    </div>
  )

  const drawdownTooltip = (
    <div className="info-tooltip__stack">
      <p>
        Drawdown measures how far the close price sits below its running peak.
        More negative values mean the asset is deeper below its prior high.
      </p>
      <span className="info-tooltip__timestamp">
        Reported value: {drawdownReportedValueLabel}
      </span>
    </div>
  )

  const ewmaVolatilityTooltip = (
    <div className="info-tooltip__stack">
      <p>
        EWMA volatility updates variance from the previous EWMA variance and the
        previous squared daily return, with lambda controlling how quickly old
        information decays.
      </p>
      <span className="info-tooltip__timestamp">
        Lambda: {ewmaLambdaLabel}{' '}
        {ewmaPresetLabel ? `(${ewmaPresetLabel})` : '(custom)'}
      </span>
      <span className="info-tooltip__timestamp">
        Reported value: {ewmaReportedValueLabel}
      </span>
    </div>
  )

  const seriesSelectionOptions =
    chartView === 'advanced'
      ? [
          {
            label: metricMeta.returns.tabLabel,
            value: 'returns' as Metric,
          },
        ]
      : (dataset?.metrics ?? []).map((metric) => ({
          label: metricMeta[metric].tabLabel,
          value: metric,
        }))

  function handleSharedVisibleRangeChange(nextRange: ChartVisibleRange | null) {
    setSharedVisibleRange((currentRange) => {
      if (!nextRange && !currentRange) {
        return currentRange
      }

      if (
        currentRange &&
        nextRange &&
        areSharedVisibleRangesClose(currentRange, nextRange)
      ) {
        return currentRange
      }

      return nextRange
    })
  }

  function handleSharedHoverDateChange(nextDate: string | null) {
    setSharedHoverDate((currentDate) =>
      currentDate === nextDate ? currentDate : nextDate,
    )
  }

  function handleSharedHoverLockChange(
    nextDate: string | null,
    locked: boolean,
  ) {
    setIsHoverDateLocked(locked)
    setSharedHoverDate((currentDate) => {
      const normalizedDate = locked ? nextDate : null
      return currentDate === normalizedDate ? currentDate : normalizedDate
    })
  }

  function handleEwmaLambdaChange(nextLambda: number) {
    const normalizedLambda = Number(
      Math.min(0.99, Math.max(0.01, nextLambda)).toFixed(2),
    )

    startTransition(() => {
      setEwmaLambda(normalizedLambda)
    })
  }

  useEffect(() => {
    if (!isHoverDateLocked || !sharedHoverDate || !sharedVisibleRange) {
      return
    }

    if (
      sharedHoverDate < sharedVisibleRange.from ||
      sharedHoverDate > sharedVisibleRange.to
    ) {
      setIsHoverDateLocked(false)
      setSharedHoverDate(null)
    }
  }, [isHoverDateLocked, sharedHoverDate, sharedVisibleRange])

  useEffect(() => {
    if (volatilityCardPulseFrameRef.current) {
      window.cancelAnimationFrame(volatilityCardPulseFrameRef.current)
      volatilityCardPulseFrameRef.current = null
    }

    if (volatilityCardPulseTimerRef.current) {
      window.clearTimeout(volatilityCardPulseTimerRef.current)
      volatilityCardPulseTimerRef.current = null
    }

    if (
      chartView !== 'advanced' ||
      !sharedHoverDate ||
      !hoveredShortTermVolatilityPoint
    ) {
      setIsVolatilityCardPulsing(false)
      return
    }

    setIsVolatilityCardPulsing(false)
    volatilityCardPulseFrameRef.current = window.requestAnimationFrame(() => {
      setIsVolatilityCardPulsing(true)
      volatilityCardPulseFrameRef.current = null
      volatilityCardPulseTimerRef.current = window.setTimeout(() => {
        setIsVolatilityCardPulsing(false)
        volatilityCardPulseTimerRef.current = null
      }, 420)
    })

    return () => {
      if (volatilityCardPulseFrameRef.current) {
        window.cancelAnimationFrame(volatilityCardPulseFrameRef.current)
        volatilityCardPulseFrameRef.current = null
      }

      if (volatilityCardPulseTimerRef.current) {
        window.clearTimeout(volatilityCardPulseTimerRef.current)
        volatilityCardPulseTimerRef.current = null
      }
    }
  }, [chartView, hoveredShortTermVolatilityPoint, sharedHoverDate])

  function clearAdvancedVolatilityBuffer() {
    if (advancedRefreshTimerRef.current) {
      window.clearTimeout(advancedRefreshTimerRef.current)
      advancedRefreshTimerRef.current = null
    }
  }

  function startAdvancedVolatilityBuffer() {
    clearAdvancedVolatilityBuffer()
    setIsAdvancedVolatilityBuffering(true)
    advancedRefreshTimerRef.current = window.setTimeout(() => {
      setIsAdvancedVolatilityBuffering(false)
      advancedRefreshTimerRef.current = null
    }, 1500)
  }

  function handleChartViewChange(nextView: ChartView) {
    setExpandedChartId(null)

    if (nextView === 'overview') {
      clearAdvancedVolatilityBuffer()
      setIsAdvancedVolatilityBuffering(false)
      setChartView('overview')
      setSelectedMetric(overviewSelectedMetric)
      return
    }

    const shouldOnlyBufferVolatilityChart = selectedMetric === 'returns'

    setChartView('advanced')
    setSelectedMetric('returns')

    if (shouldOnlyBufferVolatilityChart) {
      startAdvancedVolatilityBuffer()
      return
    }

    clearAdvancedVolatilityBuffer()
    setIsAdvancedVolatilityBuffering(false)
  }

  function handleExpandedChartToggle(nextChartId: ExpandedChartId) {
    setExpandedChartId((current) => (current === nextChartId ? null : nextChartId))
  }

  if (!dataset && !isLoading && error) {
    // keep the normal UI path below; this branch only avoids nullability noise
  }

  return (
    <div className="app-shell" data-chart-expanded={expandedChartId !== null}>
      <EntrySplash visible={isSplashVisible} />
      <AnimatePresence>
        {expandedChartId ? (
          <motion.button
            key="chart-expansion-backdrop"
            type="button"
            className="chart-expansion-backdrop"
            aria-label="Close expanded chart"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={() => setExpandedChartId(null)}
          />
        ) : null}
      </AnimatePresence>
      <div className="risk-grid" aria-hidden="true"></div>
      <header
        className="topbar"
        data-muted={
          expandedChartId !== null || (isTopbarScrolled && !isTopbarHovered)
        }
      >
        <nav
          className="topbar-nav"
          aria-label="Primary navigation"
          data-hovered={isTopbarHovered}
          onMouseEnter={() => setIsTopbarHovered(true)}
          onMouseLeave={() => setIsTopbarHovered(false)}
        >
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
              setHoveredPageNav((current) => (current === 'home' ? null : current))
              setPressedPageNav((current) => (current === 'home' ? null : current))
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
              <div className="module-shell module-shell--market">
                <div className="module-header">
                  <div>
                    <p className="section-eyebrow">Market Risk Assessment</p>
                    <h1>{activeTicker} market series</h1>
                  </div>

                  <div className="status-cluster">
                    <div className="status-stack">
                      <span className="status-pill">
                        {metricMeta[displayMetric].chartLabel}
                      </span>
                      <span className="status-subtext">
                        as of {formatSingleDate(latestAvailableDate)}
                      </span>
                    </div>
                    <span className="status-readout">
                      {currentSummary ? (
                        <CountUpValue
                          key={`${activeTicker}:${displayMetric}:status`}
                          className="status-readout__value"
                          formatValue={(value) =>
                            formatMetricValue(displayMetric, value)
                          }
                          startWhen={startCountUp}
                          value={currentSummary.lastValue}
                        />
                      ) : (
                        'Loading'
                      )}
                    </span>
                  </div>
                </div>

                <div className="control-rail">
                  <ShiftingTabs
                    className="control-rail__asset-tabs"
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
                    labelTooltip={seriesSelectionTooltip}
                    options={seriesSelectionOptions}
                    searchPlaceholder={
                      chartView === 'advanced'
                        ? 'Only return series available'
                        : 'Search series'
                    }
                    value={selectedMetric}
                    onChange={(metric) => {
                      if (chartView === 'advanced') {
                        return
                      }

                      setOverviewSelectedMetric(metric as Metric)
                      setSelectedMetric(metric as Metric)
                    }}
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

                {!isLoading && dataset && displaySeries && currentSummary ? (
                  <>
                    <div className="visualizer-body">
                      <div className="summary-rail">
                        <div className="summary-nav-card">
                          <nav
                            className="chart-nav chart-nav--summary"
                            aria-label="Market chart views"
                          >
                            <button
                              type="button"
                              className="chart-nav__link"
                              data-active={chartView === 'overview'}
                              onClick={() => handleChartViewChange('overview')}
                            >
                              Overview
                            </button>
                            <button
                              type="button"
                              className="chart-nav__link"
                              data-active={chartView === 'advanced'}
                              onClick={() => handleChartViewChange('advanced')}
                            >
                              Advanced
                            </button>
                          </nav>
                        </div>
                        <div className="market-summary">
                          <div className="summary-stat summary-stat--net-move">
                            <div className="summary-stat__heading">
                              <span className="summary-stat__title summary-stat__title--net-move">
                                Net move
                              </span>
                              {yearToDateMove ? (
                                <InfoTooltip
                                  label="Net move details"
                                  content={
                                    <div className="info-tooltip__stack">
                                      <p>
                                        Year-to-date change in the selected series
                                        from the first available market observation
                                        in the year of the current crosshair date
                                        through that reference date.
                                      </p>
                                      <span className="info-tooltip__timestamp">
                                        Start timestamp:{' '}
                                        {formatSingleDate(yearToDateMove.startDate)}
                                      </span>
                                      <span className="info-tooltip__timestamp">
                                        End timestamp:{' '}
                                        {formatSingleDate(yearToDateMove.endDate)}
                                      </span>
                                    </div>
                                  }
                                />
                              ) : null}
                            </div>
                            <strong
                              className={buildDeltaClassName(yearToDateMove?.change)}
                            >
                              {yearToDateMove ? (
                                <CountUpValue
                                  key={`${activeTicker}:${displayMetric}:net-move`}
                                  formatValue={(value) =>
                                    formatMetricChange(displayMetric, value)
                                  }
                                  startWhen={startCountUp}
                                  value={yearToDateMove.change}
                                />
                              ) : (
                                'Loading'
                              )}
                            </strong>
                          </div>

                          <div className="summary-stat summary-stat--volatility">
                            <div className="summary-stat__heading">
                              <span className="summary-stat__title summary-stat__title--volatility">
                                Drawdown
                              </span>
                              <InfoTooltip
                                label="Drawdown details"
                                content={drawdownTooltip}
                                align="start"
                                side="right"
                                sideOffset={6}
                              />
                            </div>
                            <strong
                              className={buildDeltaClassName(activeDrawdownPoint?.value)}
                            >
                              {activeDrawdownPoint ? (
                                <CountUpValue
                                  key={`${activeTicker}:drawdown`}
                                  formatValue={(value) =>
                                    currencyFormatter.format(value)
                                  }
                                  startWhen={startCountUp}
                                  value={activeDrawdownPoint.value}
                                />
                              ) : (
                                'Unavailable'
                              )}
                            </strong>
                          </div>

                          {chartView === 'advanced' ? (
                            <>
                              <div className="summary-stat summary-stat--volatility">
                                <div className="summary-stat__heading">
                                  <span className="summary-stat__title summary-stat__title--volatility">
                                    Daily short term volatility
                                  </span>
                                  <InfoTooltip
                                    label="Daily short term volatility details"
                                    content={shortTermVolatilityTooltip}
                                    align="start"
                                    side="right"
                                    sideOffset={6}
                                  />
                                </div>
                                <strong>
                                  {activeShortTermVolatilityPoint ? (
                                    <span
                                      className={[
                                        'summary-stat__value-shell',
                                        isVolatilityCardPulsing
                                          ? 'summary-stat__value-shell--pulse'
                                          : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      <CountUpValue
                                        key={`${activeTicker}:daily-short-term-volatility`}
                                        formatValue={(value) =>
                                          percentFormatter.format(value)
                                        }
                                        startWhen={startAdvancedCountUp}
                                        value={activeShortTermVolatilityPoint.value}
                                      />
                                    </span>
                                  ) : (
                                    'Unavailable'
                                  )}
                                </strong>
                              </div>

                              <div className="summary-stat summary-stat--volatility summary-stat--ewma">
                                <div className="summary-stat__heading">
                                  <span className="summary-stat__title summary-stat__title--volatility">
                                    EWMA volatility
                                  </span>
                                  <InfoTooltip
                                    label="EWMA volatility details"
                                    content={ewmaVolatilityTooltip}
                                    align="start"
                                    side="right"
                                    sideOffset={6}
                                  />
                                </div>
                                <span className="summary-stat__meta">
                                  Lambda {ewmaLambdaLabel}
                                </span>
                                <strong>
                                  {activeEwmaVolatilityPoint ? (
                                    <span
                                      className={[
                                        'summary-stat__value-shell',
                                        isVolatilityCardPulsing
                                          ? 'summary-stat__value-shell--pulse'
                                          : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      <CountUpValue
                                        key={`${activeTicker}:ewma-volatility:${ewmaLambdaLabel}`}
                                        formatValue={(value) =>
                                          percentFormatter.format(value)
                                        }
                                        startWhen={startAdvancedCountUp}
                                        value={activeEwmaVolatilityPoint.value}
                                      />
                                    </span>
                                  ) : (
                                    'Unavailable'
                                  )}
                                </strong>
                                <div className="ewma-control-panel ewma-control-panel--card">
                                  <div
                                    className="ewma-control-presets"
                                    role="group"
                                    aria-label="EWMA lambda presets"
                                  >
                                    <button
                                      type="button"
                                      className="ewma-control-preset"
                                      data-active={ewmaLambda === ewmaLongTermLambda}
                                      onClick={() =>
                                        handleEwmaLambdaChange(ewmaLongTermLambda)
                                      }
                                    >
                                      Long term
                                    </button>
                                    <button
                                      type="button"
                                      className="ewma-control-preset"
                                      data-active={ewmaLambda === ewmaShortTermLambda}
                                      onClick={() =>
                                        handleEwmaLambdaChange(ewmaShortTermLambda)
                                      }
                                    >
                                      Short term
                                    </button>
                                  </div>
                                  <label className="ewma-slider" htmlFor="ewma-lambda">
                                    <input
                                      id="ewma-lambda"
                                      className="ewma-slider__input"
                                      type="range"
                                      min="0.01"
                                      max="0.99"
                                      step="0.01"
                                      value={ewmaLambda}
                                      onChange={(event) =>
                                        handleEwmaLambdaChange(
                                          Number(event.target.value),
                                        )
                                      }
                                    />
                                    <div className="ewma-slider__scale" aria-hidden="true">
                                      <span>0.01</span>
                                      <span>0.99</span>
                                    </div>
                                  </label>
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="chart-panel chart-stack">
                        <div className="chart-toolbar">
                          <div className="chart-window-card">
                            <span className="chart-window-card__label">Window</span>
                            <strong className="chart-window-card__value">
                              {formatSingleDate(visibleWindowStartDate)} -{' '}
                              {formatSingleDate(visibleWindowEndDate)}
                            </strong>
                          </div>
                        </div>

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
                              <ExpandableChartCard
                                expanded={expandedChartId === 'overview-primary'}
                                label={`${activeTicker} ${metricMeta[activeMetric].chartLabel}`}
                                onToggle={() =>
                                  handleExpandedChartToggle('overview-primary')
                                }
                              >
                                <MarketLineChart
                                  ticker={activeTicker}
                                  metric={activeMetric}
                                  points={currentPoints}
                                  defaultVisibleFrom={chartFocusStartDate}
                                  rangeResetKey={activeTicker}
                                  isRefreshing={isRefreshing}
                                  isHoverLocked={isHoverDateLocked}
                                  onHoverDateChange={handleSharedHoverDateChange}
                                  onHoverLockChange={handleSharedHoverLockChange}
                                  onVisibleRangeChange={handleSharedVisibleRangeChange}
                                  refreshLabel={refreshLabel}
                                  syncedHoverDate={sharedHoverDate}
                                  syncedVisibleRange={sharedVisibleRange}
                                />
                              </ExpandableChartCard>

                              {currentDrawdownPoints.length ? (
                                <>
                                  <div className="chart-divider" aria-hidden="true"></div>
                                  <ExpandableChartCard
                                    expanded={expandedChartId === 'overview-drawdown'}
                                    label={`${activeTicker} drawdown`}
                                    onToggle={() =>
                                      handleExpandedChartToggle('overview-drawdown')
                                    }
                                  >
                                    <DrawdownChart
                                      ticker={activeTicker}
                                      points={currentDrawdownPoints}
                                      defaultVisibleFrom={chartFocusStartDate}
                                      rangeResetKey={activeTicker}
                                      isRefreshing={isTickerRefreshing}
                                      isHoverLocked={isHoverDateLocked}
                                      onHoverDateChange={handleSharedHoverDateChange}
                                      onHoverLockChange={handleSharedHoverLockChange}
                                      onVisibleRangeChange={handleSharedVisibleRangeChange}
                                      refreshLabel={`${selectedTicker} close drawdown`}
                                      syncedHoverDate={sharedHoverDate}
                                      syncedVisibleRange={sharedVisibleRange}
                                    />
                                  </ExpandableChartCard>
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
                              <div className="advanced-chart-grid">
                                <ExpandableChartCard
                                  className="advanced-chart-slot"
                                  expanded={expandedChartId === 'advanced-returns'}
                                  label={`${activeTicker} close returns`}
                                  onToggle={() =>
                                    handleExpandedChartToggle('advanced-returns')
                                  }
                                >
                                  <div className="advanced-chart-copy">
                                    <div className="advanced-chart-title-row">
                                      <span className="advanced-chart-title">
                                        Close returns
                                      </span>
                                      <InfoTooltip
                                        label="Close returns details"
                                        content={returnsChartTooltip}
                                      />
                                    </div>
                                  </div>
                                  <MarketLineChart
                                    ticker={activeTicker}
                                    metric="returns"
                                  points={currentReturnsPoints}
                                  defaultVisibleFrom={chartFocusStartDate}
                                  rangeResetKey={activeTicker}
                                  isRefreshing={isAdvancedReturnsChartRefreshing}
                                  isHoverLocked={isHoverDateLocked}
                                  onHoverDateChange={handleSharedHoverDateChange}
                                  onHoverLockChange={handleSharedHoverLockChange}
                                  onVisibleRangeChange={handleSharedVisibleRangeChange}
                                  refreshLabel={`${selectedTicker} close returns`}
                                  syncedHoverDate={sharedHoverDate}
                                  syncedVisibleRange={sharedVisibleRange}
                                />
                              </ExpandableChartCard>

                                {currentDrawdownPoints.length ? (
                                  <ExpandableChartCard
                                    className="advanced-chart-slot"
                                    expanded={expandedChartId === 'advanced-drawdown'}
                                    label={`${activeTicker} drawdown`}
                                    onToggle={() =>
                                      handleExpandedChartToggle('advanced-drawdown')
                                    }
                                  >
                                    <DrawdownChart
                                      ticker={activeTicker}
                                      points={currentDrawdownPoints}
                                      defaultVisibleFrom={chartFocusStartDate}
                                      rangeResetKey={activeTicker}
                                      isRefreshing={isAdvancedReturnsChartRefreshing}
                                      isHoverLocked={isHoverDateLocked}
                                      onHoverDateChange={handleSharedHoverDateChange}
                                      onHoverLockChange={handleSharedHoverLockChange}
                                      onVisibleRangeChange={handleSharedVisibleRangeChange}
                                      refreshLabel={`${selectedTicker} close drawdown`}
                                      syncedHoverDate={sharedHoverDate}
                                      syncedVisibleRange={sharedVisibleRange}
                                    />
                                  </ExpandableChartCard>
                                ) : (
                                  <AdvancedPlaceholder
                                    items={[
                                      'Generate backend drawdown measures',
                                    ]}
                                  />
                                )}

                                {currentShortTermVolatilityPoints.length ? (
                                  <ExpandableChartCard
                                    className="advanced-chart-slot"
                                    expanded={expandedChartId === 'advanced-volatility'}
                                    label={`${activeTicker} daily short term volatility`}
                                    onToggle={() =>
                                      handleExpandedChartToggle('advanced-volatility')
                                    }
                                  >
                                    <ShortTermVolatilityChart
                                      ticker={activeTicker}
                                      points={currentShortTermVolatilityPoints}
                                      defaultVisibleFrom={chartFocusStartDate}
                                      rangeResetKey={activeTicker}
                                      isRefreshing={isAdvancedVolatilityChartRefreshing}
                                      isHoverLocked={isHoverDateLocked}
                                      onHoverDateChange={handleSharedHoverDateChange}
                                      onHoverLockChange={handleSharedHoverLockChange}
                                      onVisibleRangeChange={handleSharedVisibleRangeChange}
                                      refreshLabel={`${selectedTicker} daily short term volatility`}
                                      syncedHoverDate={sharedHoverDate}
                                      syncedVisibleRange={sharedVisibleRange}
                                      tooltipContent={shortTermVolatilityTooltip}
                                    />
                                  </ExpandableChartCard>
                                ) : (
                                  <AdvancedPlaceholder
                                    items={[
                                      'Generate backend advanced volatility measures',
                                    ]}
                                  />
                                )}

                                <ExpandableChartCard
                                  className="advanced-chart-slot"
                                  expanded={expandedChartId === 'advanced-ewma'}
                                  label={`${activeTicker} ewma volatility`}
                                  onToggle={() =>
                                    handleExpandedChartToggle('advanced-ewma')
                                  }
                                >
                                  <ShortTermVolatilityChart
                                    ticker={activeTicker}
                                    points={currentEwmaVolatilityPoints}
                                    title="EWMA volatility"
                                    tooltipLabel="EWMA volatility details"
                                    defaultVisibleFrom={chartFocusStartDate}
                                    rangeResetKey={activeTicker}
                                    isRefreshing={isAdvancedEwmaChartRefreshing}
                                    isHoverLocked={isHoverDateLocked}
                                    onHoverDateChange={handleSharedHoverDateChange}
                                    onHoverLockChange={handleSharedHoverLockChange}
                                    onVisibleRangeChange={handleSharedVisibleRangeChange}
                                    refreshLabel={`${selectedTicker} ewma volatility`}
                                    syncedHoverDate={sharedHoverDate}
                                    syncedVisibleRange={sharedVisibleRange}
                                    tooltipContent={ewmaVolatilityTooltip}
                                    visualTone="price"
                                  />
                                </ExpandableChartCard>
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
                  <ShinyText
                    text="TO BE IMPLEMENTED"
                    className="advanced-placeholder__eyebrow"
                    color="#8ce1d3"
                    shineColor="#ffffff"
                    spread={100}
                    direction="left"
                    yoyo={false}
                    pauseOnHover={false}
                    speed={3}
                    delay={2}
                  />
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

      <footer className="app-footer">
        <div className="app-footer__inner">
          <a
            className="app-footer__credit app-footer__credit-link"
            href="https://chrisyong-portfolio.com/"
            target="_blank"
            rel="noreferrer"
          >
            Built by Chris Yong
          </a>
          <a
            className="app-footer__repo"
            href="https://github.com/Monoji77/market-risk-engine-2.0"
            target="_blank"
            rel="noreferrer"
          >
            <span className="app-footer__repo-badge" aria-hidden="true">
              GitHub
            </span>
            <span className="app-footer__repo-name">
              Monoji77/market-risk-engine-2.0
            </span>
          </a>
        </div>
      </footer>
    </div>
  )
}

function AdvancedPlaceholder({ items }: { items: string[] }) {
  return (
    <div className="advanced-placeholder advanced-placeholder--stacked">
      <div className="advanced-placeholder__chrome" aria-hidden="true">
        <span className="advanced-placeholder__dot advanced-placeholder__dot--red"></span>
        <span className="advanced-placeholder__dot advanced-placeholder__dot--amber"></span>
        <span className="advanced-placeholder__dot advanced-placeholder__dot--green"></span>
      </div>
      <ShinyText
        text="TO BE IMPLEMENTED"
        className="advanced-placeholder__eyebrow"
        color="#8ce1d3"
        shineColor="#ffffff"
        spread={100}
        direction="left"
        yoyo={false}
        pauseOnHover={false}
        speed={3}
        delay={2}
      />
      <ul className="advanced-placeholder__list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
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
  if (!date) {
    return 'Unavailable'
  }

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

  const startIndex = points.findIndex((point) => point.date >= visibleRange.from)
  const normalizedStartIndex = startIndex >= 0 ? startIndex : points.length - 1
  const endIndex = findVisibleEndIndex(points, visibleRange.to)

  if (endIndex < normalizedStartIndex) {
    return null
  }

  return {
    endPoint: points[endIndex] ?? points.at(-1) ?? points[0],
    endPointIndex: endIndex,
    startPoint: points[normalizedStartIndex] ?? points[0],
    startPointIndex: normalizedStartIndex,
  }
}

function areSharedVisibleRangesClose(
  left: ChartVisibleRange,
  right: ChartVisibleRange,
) {
  const datesMatch = left.from === right.from && left.to === right.to
  const leftLogicalFrom = left.logicalFrom
  const leftLogicalTo = left.logicalTo
  const rightLogicalFrom = right.logicalFrom
  const rightLogicalTo = right.logicalTo
  const logicalsAvailable =
    typeof leftLogicalFrom === 'number' &&
    typeof leftLogicalTo === 'number' &&
    typeof rightLogicalFrom === 'number' &&
    typeof rightLogicalTo === 'number'

  if (!datesMatch || !logicalsAvailable) {
    return datesMatch
  }

  return (
    Math.abs(leftLogicalFrom - rightLogicalFrom) < 0.02 &&
    Math.abs(leftLogicalTo - rightLogicalTo) < 0.02
  )
}

function buildVisibleYearToDateMove(
  points: MarketSeriesPoint[],
  visibleWindow: ReturnType<typeof buildVisiblePointWindow>,
  referenceDate?: string | null,
) {
  const latestVisiblePoint =
    buildPointAtOrBeforeDate(points, referenceDate) ??
    visibleWindow?.endPoint ??
    points.at(-1)

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

function buildPointAtOrBeforeDate(
  points: MarketSeriesPoint[],
  date: string | null | undefined,
) {
  if (!date) {
    return null
  }

  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].date <= date) {
      return points[index]
    }
  }

  return null
}

function findVisibleEndIndex(points: MarketSeriesPoint[], endDate: string) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].date <= endDate) {
      return index
    }
  }

  return 0
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

function buildNormalConfidenceInterval(mean: number, volatility: number) {
  const confidenceMultiplier = 1.96

  return {
    lower: mean - confidenceMultiplier * volatility,
    upper: mean + confidenceMultiplier * volatility,
  }
}

function formatConfidenceInterval(interval: { lower: number; upper: number }) {
  return `${formatSignedPercent(interval.lower)} to ${formatSignedPercent(interval.upper)}`
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${percentFormatter.format(value)}`
}

function buildPointByDate(
  points: MarketSeriesPoint[],
  date: string | null | undefined,
) {
  if (!date) {
    return null
  }

  return points.find((point) => point.date === date) ?? null
}

function buildEwmaVolatilityPoints(
  points: MarketSeriesPoint[],
  lambda: number,
) {
  if (!points.length) {
    return []
  }

  const normalizedLambda = Math.min(0.99, Math.max(0.01, lambda))
  const ewmaPoints: MarketSeriesPoint[] = []
  let previousVariance = Math.pow(points[0].value, 2)

  ewmaPoints.push({
    date: points[0].date,
    time: points[0].time,
    value: Math.sqrt(previousVariance),
  })

  for (let index = 1; index < points.length; index += 1) {
    const previousReturn = points[index - 1]?.value ?? 0

    previousVariance =
      normalizedLambda * previousVariance +
      (1 - normalizedLambda) * Math.pow(previousReturn, 2)

    ewmaPoints.push({
      date: points[index].date,
      time: points[index].time,
      value: Math.sqrt(Math.max(previousVariance, 0)),
    })
  }

  return ewmaPoints
}

function resolveEwmaPresetLabel(lambda: number) {
  if (Math.abs(lambda - ewmaLongTermLambda) < 0.0001) {
    return 'Long term'
  }

  if (Math.abs(lambda - ewmaShortTermLambda) < 0.0001) {
    return 'Short term'
  }

  return null
}

interface ExpandableChartCardProps {
  children: ReactNode
  className?: string
  expanded: boolean
  label: string
  onToggle: () => void
}

function ExpandableChartCard({
  children,
  className,
  expanded,
  label,
  onToggle,
}: ExpandableChartCardProps) {
  const content = (
    <div
      className={[
        'chart-expandable-card',
        className,
        expanded ? 'chart-expandable-card--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-expanded={expanded}
      role={expanded ? 'dialog' : undefined}
      aria-label={expanded ? `${label} expanded view` : undefined}
      aria-modal={expanded || undefined}
    >
      <div className="chart-expandable-card__toolbar">
        <button
          type="button"
          className="chart-expandable-card__toggle"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} chart`}
          aria-pressed={expanded}
          title={`${expanded ? 'Collapse' : 'Expand'} ${label} chart`}
          onClick={onToggle}
        >
          <span className="chart-expandable-card__toggle-icon" aria-hidden="true">
            {expanded ? '×' : '⛶'}
          </span>
        </button>
      </div>
      {children}
    </div>
  )

  if (expanded && typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
}

function buildRollingMean(
  points: MarketSeriesPoint[],
  endDate: string,
  windowSize: number,
) {
  const endIndex = points.findIndex((point) => point.date === endDate)

  if (endIndex < 0) {
    return null
  }

  const startIndex = Math.max(0, endIndex - windowSize + 1)
  const window = points.slice(startIndex, endIndex + 1)

  if (!window.length) {
    return null
  }

  const total = window.reduce((sum, point) => sum + point.value, 0)
  return total / window.length
}

export default App
