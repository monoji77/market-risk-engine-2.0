import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { motion } from 'framer-motion'
import {
  BaselineSeries,
  ColorType,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import type {
  ChartVisibleRange,
  MarketSeriesPoint,
} from '../../types/market'
import { InfoTooltip } from '../ui/InfoTooltip'
import './DrawdownChart.css'

const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
})

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const timeScaleOptions = {
  barSpacing: 0.2,
  borderColor: 'rgba(174, 182, 198, 0)',
  fixLeftEdge: false,
  fixRightEdge: false,
  lockVisibleTimeRangeOnResize: true,
  minBarSpacing: 0.05,
  rightOffset: 6,
  secondsVisible: false,
  timeVisible: true,
} as const

const drawdownVisuals = {
  fillTop: 'rgba(184, 91, 111, 0.12)',
  glow: 'rgba(184, 91, 111, 0.14)',
  line: '#b85b6f',
  marker: '#f0c2cd',
  maximumDrawdown: '#f59e0b',
  priceLine: '#b85b6f',
}

interface DrawdownChartProps {
  defaultVisibleFrom: string
  isRefreshing: boolean
  onHoverDateChange?: (date: string | null) => void
  onVisibleRangeChange?: (range: ChartVisibleRange | null) => void
  points: MarketSeriesPoint[]
  rangeResetKey: string
  refreshLabel: string
  syncedHoverDate?: string | null
  syncedVisibleRange: ChartVisibleRange | null
  ticker: string
}

interface HoverSnapshot {
  date: string
  kind?: 'max-drawdown'
  seriesKey: string
  value: number
}

interface MarkerHotspot {
  date: string
  id: string
  value: number
  x: number
  y: number
}

interface VisibleDrawdownExtrema {
  date: string | null
  fromDate: string | null
  value: number | null
}

export function DrawdownChart({
  defaultVisibleFrom,
  isRefreshing,
  onHoverDateChange,
  onVisibleRangeChange,
  points,
  rangeResetKey,
  refreshLabel,
  syncedHoverDate = null,
  syncedVisibleRange,
  ticker,
}: DrawdownChartProps) {
  const seriesKey = `${ticker}:drawdown`
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Baseline'> | null>(null)
  const zeroLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const visibleRangeKeyRef = useRef<string | null>(null)
  const crosshairSnapshotRef = useRef<HoverSnapshot | null>(null)
  const hoveredMarkerIdRef = useRef<string | null>(null)
  const pinnedMarkerIdRef = useRef<string | null>(null)
  const [hoverSnapshot, setHoverSnapshot] = useState<HoverSnapshot | null>(null)
  const [maximumDrawdown, setMaximumDrawdown] = useState<VisibleDrawdownExtrema>({
    date: null,
    fromDate: null,
    value: null,
  })
  const [markerHotspots, setMarkerHotspots] = useState<MarkerHotspot[]>([])
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null)
  const [pinnedMarkerId, setPinnedMarkerId] = useState<string | null>(null)
  const [syncedHoverPoint, setSyncedHoverPoint] = useState<MarkerHotspot | null>(
    null,
  )

  const syncChartFrame = useEffectEvent(() => {
    const surface = surfaceRef.current
    const chart = chartRef.current

    if (!surface || !chart) {
      return
    }

    chart.applyOptions({
      height: surface.clientHeight,
      width: surface.clientWidth,
    })

    syncViewportExtrema()
    syncSyncedHoverPoint()
  })

  const syncHoverSnapshot = useEffectEvent((param: MouseEventParams<Time>) => {
    if (hoveredMarkerIdRef.current || pinnedMarkerIdRef.current) {
      return
    }

    const hoveredPoint =
      param.point && param.time ? resolveHoveredPoint(param, points) : null
    const nextSnapshot = hoveredPoint
      ? {
          date: hoveredPoint.date,
          seriesKey,
          value: hoveredPoint.value,
        }
      : null

    crosshairSnapshotRef.current = nextSnapshot

    setHoverSnapshot(nextSnapshot)
    onHoverDateChange?.(nextSnapshot?.date ?? null)
  })

  const syncViewportExtrema = useEffectEvent(() => {
    const chart = chartRef.current
    const baselineSeries = seriesRef.current
    const markers = markersRef.current

    if (!chart || !baselineSeries || !markers) {
      return
    }

    const viewportMarker = buildViewportMaximumDrawdown(
      points,
      chart.timeScale().getVisibleLogicalRange(),
    )

    markers.setMarkers(viewportMarker.markers)
    setMarkerHotspots(
      buildMarkerHotspots(viewportMarker.hotspot, chart, baselineSeries),
    )
    setMaximumDrawdown((current) => {
      if (
        current.date === viewportMarker.maximumDrawdown.date &&
        current.fromDate === viewportMarker.maximumDrawdown.fromDate &&
        current.value === viewportMarker.maximumDrawdown.value
      ) {
        return current
      }

      return viewportMarker.maximumDrawdown
    })
  })

  const syncSyncedHoverPoint = useEffectEvent(() => {
    const chart = chartRef.current
    const baselineSeries = seriesRef.current

    if (!chart || !baselineSeries) {
      return
    }

    if (
      !syncedHoverDate ||
      crosshairSnapshotRef.current ||
      hoveredMarkerIdRef.current ||
      pinnedMarkerIdRef.current
    ) {
      setSyncedHoverPoint(null)
      return
    }

    const matchingPoint = points.find((point) => point.date === syncedHoverDate)

    if (!matchingPoint) {
      setSyncedHoverPoint(null)
      return
    }

    const x = chart.timeScale().timeToCoordinate(matchingPoint.time)
    const y = baselineSeries.priceToCoordinate(matchingPoint.value)

    if (x === null || y === null) {
      setSyncedHoverPoint(null)
      return
    }

    setSyncedHoverPoint({
      date: matchingPoint.date,
      id: `synced:${matchingPoint.date}`,
      value: matchingPoint.value,
      x: Number(x),
      y: Number(y),
    })
  })

  const syncSharedVisibleRange = useEffectEvent(
    (range: ChartVisibleRange | null) => {
      if (!range || !onVisibleRangeChange) {
        return
      }

      if (areVisibleRangesClose(range, syncedVisibleRange)) {
        return
      }

      onVisibleRangeChange(range)
    },
  )

  useEffect(() => {
    const surface = surfaceRef.current

    if (!surface) {
      return
    }

    const chart = createChart(surface, {
      width: surface.clientWidth,
      height: surface.clientHeight,
      layout: {
        background: {
          color: 'transparent',
          type: ColorType.Solid,
        },
        textColor: '#aeb6c6',
      },
      grid: {
        vertLines: {
          color: 'rgba(174, 182, 198, 0.08)',
        },
        horzLines: {
          color: 'rgba(174, 182, 198, 0.08)',
        },
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: 'rgba(174, 182, 198, 0)',
        scaleMargins: {
          bottom: 0.08,
          top: 0.02,
        },
      },
      timeScale: timeScaleOptions,
      handleScale: {
        axisPressedMouseMove: {
          price: true,
          time: true,
        },
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
        vertTouchDrag: true,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: drawdownVisuals.line,
        },
        horzLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: drawdownVisuals.line,
        },
      },
      localization: {
        priceFormatter: formatCurrencyValue,
      },
    })

    const baselineSeries = chart.addSeries(BaselineSeries, buildSeriesOptions(points))
    const zeroLineSeries = chart.addSeries(LineSeries, buildZeroLineSeriesOptions())
    const markers = createSeriesMarkers(baselineSeries, [])
    const handleVisibleLogicalRangeChange = () => {
      syncViewportExtrema()
      syncSharedVisibleRange(
        normalizeVisibleTimeRange(chart.timeScale().getVisibleRange()),
      )
      syncSyncedHoverPoint()
    }

    chart.subscribeCrosshairMove(syncHoverSnapshot)
    chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange)

    chartRef.current = chart
    seriesRef.current = baselineSeries
    zeroLineSeriesRef.current = zeroLineSeries
    markersRef.current = markers
    visibleRangeKeyRef.current = null

    const observer = new ResizeObserver(() => {
      syncChartFrame()
    })

    observer.observe(surface)

    return () => {
      observer.disconnect()
      chart.unsubscribeCrosshairMove(syncHoverSnapshot)
      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange)
      markersRef.current = null
      seriesRef.current = null
      zeroLineSeriesRef.current = null
      chartRef.current = null
      hoveredMarkerIdRef.current = null
      pinnedMarkerIdRef.current = null
      visibleRangeKeyRef.current = null
      setSyncedHoverPoint(null)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    const baselineSeries = seriesRef.current
    const zeroLineSeries = zeroLineSeriesRef.current
    const markers = markersRef.current

    if (!chart || !baselineSeries || !zeroLineSeries || !markers) {
      return
    }

    chart.applyOptions({
      crosshair: {
        vertLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: drawdownVisuals.line,
        },
        horzLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: drawdownVisuals.line,
        },
      },
      localization: {
        priceFormatter: formatCurrencyValue,
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: 'rgba(174, 182, 198, 0)',
        scaleMargins: {
          bottom: 0.08,
          top: 0.02,
        },
      },
      timeScale: timeScaleOptions,
    })

    baselineSeries.applyOptions(buildSeriesOptions(points))
    baselineSeries.setData(points)
    zeroLineSeries.applyOptions(buildZeroLineSeriesOptions())
    zeroLineSeries.setData(buildZeroLineData(points))

    const nextVisibleRangeKey = buildVisibleRangeKey(
      rangeResetKey,
      defaultVisibleFrom,
      points,
    )

    if (visibleRangeKeyRef.current !== nextVisibleRangeKey) {
      applyVisibleRange(chart, points, defaultVisibleFrom)
      visibleRangeKeyRef.current = nextVisibleRangeKey
    }

    syncViewportExtrema()
    syncSyncedHoverPoint()
  }, [defaultVisibleFrom, points, rangeResetKey])

  useEffect(() => {
    const chart = chartRef.current

    if (!chart || !syncedVisibleRange) {
      return
    }

    const currentRange = normalizeVisibleRange(chart.timeScale().getVisibleRange())

    if (areVisibleRangesClose(currentRange, syncedVisibleRange)) {
      return
    }

    chart.timeScale().setVisibleRange(syncedVisibleRange)
  }, [syncedVisibleRange])

  useEffect(() => {
    syncSyncedHoverPoint()
  }, [points, syncedHoverDate, syncSyncedHoverPoint])

  useEffect(() => {
    if (hoveredMarkerId || pinnedMarkerId) {
      return
    }

    setHoverSnapshot(crosshairSnapshotRef.current)
  }, [hoveredMarkerId, pinnedMarkerId])

  const latestPoint = points.at(-1)
  const syncedSnapshot =
    !crosshairSnapshotRef.current && !hoveredMarkerId && !pinnedMarkerId
      ? buildSnapshotByDate(points, syncedHoverDate, seriesKey)
      : null
  const activeSnapshot =
    hoverSnapshot?.seriesKey === seriesKey
      ? hoverSnapshot
      : syncedSnapshot ?? buildLatestSnapshot(points, seriesKey)
  const isLatestSnapshot = activeSnapshot?.date === latestPoint?.date
  const hoverDateParts = activeSnapshot
    ? formatDateParts(activeSnapshot.date)
    : null
  const maximumDrawdownLabel =
    maximumDrawdown.value !== null
      ? formatCurrencyValue(maximumDrawdown.value)
      : 'Unavailable'
  const maximumDrawdownRangeLabel = formatDrawdownRangeLabel(maximumDrawdown)
  const overallMaximumDrawdown = buildOverallMaximumDrawdown(points)
  const overallMaximumDrawdownLabel =
    overallMaximumDrawdown.value !== null
      ? formatCurrencyValue(overallMaximumDrawdown.value)
      : 'Unavailable'
  const overallMaximumDrawdownRangeLabel = formatDrawdownRangeLabel(
    overallMaximumDrawdown,
  )

  return (
    <div
      className="drawdown-chart-frame"
      style={{ '--chart-glow': drawdownVisuals.glow } as CSSProperties}
    >
      <div className="drawdown-chart-copy">
        <div className="drawdown-chart-title-row">
          <span className="drawdown-chart-title">Drawdown</span>
          <InfoTooltip
            label="Drawdown details"
            content={
              <div className="info-tooltip__stack">
                <p>
                  Drawdown measures how far the close price has fallen from its
                  running peak over the currently visible range.
                </p>
                <span className="info-tooltip__timestamp info-tooltip__timestamp--trough">
                  Maximum drawdown in view: {maximumDrawdownLabel}
                  {maximumDrawdownRangeLabel
                    ? ` ${maximumDrawdownRangeLabel}`
                    : ''}
                </span>
                <span className="info-tooltip__timestamp">
                  Maximum drawdown overall: {overallMaximumDrawdownLabel}
                  {overallMaximumDrawdownRangeLabel
                    ? ` ${overallMaximumDrawdownRangeLabel}`
                    : ''}
                </span>
              </div>
            }
          />
        </div>
      </div>

      <div className="drawdown-chart-surface">
        <div className="drawdown-chart-date-card">
          <span className="drawdown-chart-date-card__eyebrow">
            {activeSnapshot?.kind === 'max-drawdown'
              ? 'Maximum drawdown'
              : activeSnapshot?.date === latestPoint?.date
                ? 'Latest drawdown'
                : 'Crosshair date'}
          </span>
          {hoverDateParts ? (
            <strong className="drawdown-chart-date-card__value">
              <span className="drawdown-chart-date-card__month">
                {hoverDateParts.month}
              </span>
              <span className="drawdown-chart-date-card__day">
                {hoverDateParts.day}
              </span>
              <span className="drawdown-chart-date-card__year">
                {hoverDateParts.year}
              </span>
              {isLatestSnapshot ? (
                <span className="drawdown-chart-date-card__latest-tag">
                  (latest)
                </span>
              ) : null}
            </strong>
          ) : null}
          <span className="drawdown-chart-date-card__metric">
            {activeSnapshot
              ? formatCurrencyValue(activeSnapshot.value)
              : 'Loading'}
          </span>
        </div>
        <div ref={surfaceRef} className="drawdown-chart-canvas"></div>
        {syncedHoverPoint ? (
          <div
            className="drawdown-chart-sync-point"
            style={{
              left: `${syncedHoverPoint.x}px`,
              top: `${syncedHoverPoint.y}px`,
            }}
          >
            <span className="drawdown-chart-sync-point__core"></span>
          </div>
        ) : null}
        {markerHotspots.map((hotspot) => {
          const isActive =
            hoveredMarkerId === hotspot.id || pinnedMarkerId === hotspot.id

          return (
            <motion.button
              key={hotspot.id}
              type="button"
              className="drawdown-chart-hotspot"
              data-active={isActive}
              style={{
                left: `${hotspot.x}px`,
                top: `${hotspot.y}px`,
              }}
              animate={{
                height: isActive ? 38 : 20,
                opacity: isActive ? 1 : 0.94,
                width: isActive ? 38 : 20,
              }}
              transition={{
                damping: 26,
                stiffness: 320,
                type: 'spring',
              }}
              onMouseEnter={() => {
                hoveredMarkerIdRef.current = hotspot.id
                setHoveredMarkerId(hotspot.id)
                setHoverSnapshot({
                  date: hotspot.date,
                  kind: 'max-drawdown',
                  seriesKey,
                  value: hotspot.value,
                })
                onHoverDateChange?.(hotspot.date)
              }}
              onMouseLeave={() => {
                if (hoveredMarkerIdRef.current === hotspot.id) {
                  hoveredMarkerIdRef.current = null
                }

                setHoveredMarkerId((current) =>
                  current === hotspot.id ? null : current,
                )

                if (pinnedMarkerIdRef.current === hotspot.id) {
                  pinnedMarkerIdRef.current = null
                  setPinnedMarkerId(null)
                }

                setHoverSnapshot(crosshairSnapshotRef.current)
                onHoverDateChange?.(crosshairSnapshotRef.current?.date ?? null)
              }}
              onClick={() => {
                pinnedMarkerIdRef.current = hotspot.id
                setPinnedMarkerId(hotspot.id)
                setHoverSnapshot({
                  date: hotspot.date,
                  kind: 'max-drawdown',
                  seriesKey,
                  value: hotspot.value,
                })
                onHoverDateChange?.(hotspot.date)
              }}
            >
              <span className="drawdown-chart-hotspot__core"></span>
            </motion.button>
          )
        })}
        {isRefreshing ? (
          <div className="drawdown-chart-refresh">
            <div className="drawdown-chart-refresh__card">
              <span className="drawdown-chart-refresh__pulse"></span>
              <span className="drawdown-chart-refresh__label">
                Buffering {refreshLabel}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function buildSeriesOptions(points: MarketSeriesPoint[]) {
  const seriesMinimum =
    points.length > 0
      ? Math.min(
          ...points.map((point) => point.value),
          -0.01,
        )
      : -1

  return {
    autoscaleInfoProvider: (original: () => {
      priceRange: { maxValue: number; minValue: number }
    } | null) => {
      const baseInfo = original()

      if (!baseInfo?.priceRange) {
        return {
          priceRange: {
            maxValue: 0,
            minValue: seriesMinimum,
          },
        }
      }

      return {
        ...baseInfo,
        priceRange: {
          maxValue: 0,
          minValue: Math.min(baseInfo.priceRange.minValue, -0.01),
        },
      }
    },
    baseValue: {
      price: 0,
      type: 'price' as const,
    },
    bottomFillColor1: drawdownVisuals.fillTop,
    bottomFillColor2: drawdownVisuals.fillTop,
    bottomLineColor: drawdownVisuals.line,
    crosshairMarkerBackgroundColor: drawdownVisuals.line,
    crosshairMarkerBorderColor: drawdownVisuals.marker,
    crosshairMarkerRadius: 5,
    lastValueVisible: true,
    lineWidth: 3 as const,
    priceFormat: {
      formatter: formatCurrencyValue,
      minMove: 0.01,
      tickmarksFormatter: (values: number[]) =>
        values.map((value) => formatCurrencyValue(value)),
      type: 'custom' as const,
    },
    priceLineColor: drawdownVisuals.priceLine,
    priceLineVisible: true,
    topFillColor1: 'rgba(122, 12, 25, 0)',
    topFillColor2: 'rgba(122, 12, 25, 0)',
    topLineColor: 'rgba(122, 12, 25, 0)',
  }
}

function buildZeroLineSeriesOptions() {
  return {
    color: 'rgba(104, 115, 137, 0.84)',
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    lineStyle: 0 as const,
    lineWidth: 1 as const,
    priceLineVisible: false,
  }
}

function buildZeroLineData(points: MarketSeriesPoint[]) {
  return points.map((point) => ({
    time: point.time,
    value: 0,
  }))
}

function applyVisibleRange(
  chart: IChartApi,
  points: MarketSeriesPoint[],
  defaultVisibleFrom: string,
) {
  const range = buildVisibleLogicalRange(points, defaultVisibleFrom)

  if (!range) {
    chart.timeScale().fitContent()
    return
  }

  chart.timeScale().setVisibleLogicalRange(range)
}

function buildVisibleLogicalRange(
  points: MarketSeriesPoint[],
  defaultVisibleFrom: string,
) {
  if (!points.length) {
    return null
  }

  const firstVisibleIndex = points.findIndex(
    (point) => point.date >= defaultVisibleFrom,
  )
  const visibleStartIndex = firstVisibleIndex >= 0 ? firstVisibleIndex : 0
  const latestIndex = points.length - 1
  const rightPadding = Math.max(7, Math.min(16, Math.round(points.length * 0.02)))

  return {
    from: Math.max(visibleStartIndex - 1.5, -0.5),
    to: latestIndex + rightPadding,
  }
}

function resolveHoveredPoint(
  param: MouseEventParams<Time>,
  points: MarketSeriesPoint[],
) {
  const roundedLogical =
    typeof param.logical === 'number' ? Math.round(param.logical) : null

  if (
    roundedLogical !== null &&
    roundedLogical >= 0 &&
    roundedLogical < points.length
  ) {
    return points[roundedLogical]
  }

  const normalizedDate = normalizeTimeToDate(param.time)

  if (!normalizedDate) {
    return null
  }

  return points.find((point) => point.date === normalizedDate) ?? null
}

function normalizeTimeToDate(time?: Time) {
  if (!time) {
    return null
  }

  if (typeof time === 'string') {
    return time
  }

  if (typeof time === 'number') {
    return null
  }

  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(
    time.day,
  ).padStart(2, '0')}`
}

function formatDateParts(date: string) {
  const [year, , day] = date.split('-')
  const normalizedDate = new Date(`${date}T00:00:00`)
  const monthLabel = normalizedDate.toLocaleDateString('en-US', {
    month: 'short',
  })

  return {
    day,
    month: monthLabel,
    year,
  }
}

function buildLatestSnapshot(
  points: MarketSeriesPoint[],
  seriesKey: string,
): HoverSnapshot | null {
  const latestPoint = points.at(-1)

  if (!latestPoint) {
    return null
  }

  return {
    date: latestPoint.date,
    seriesKey,
    value: latestPoint.value,
  }
}

function buildSnapshotByDate(
  points: MarketSeriesPoint[],
  date: string | null | undefined,
  seriesKey: string,
): HoverSnapshot | null {
  if (!date) {
    return null
  }

  const matchingPoint = points.find((point) => point.date === date)

  if (!matchingPoint) {
    return null
  }

  return {
    date: matchingPoint.date,
    seriesKey,
    value: matchingPoint.value,
  }
}

function buildVisibleRangeKey(
  rangeResetKey: string,
  defaultVisibleFrom: string,
  points: MarketSeriesPoint[],
) {
  const latestDate = points.at(-1)?.date ?? 'empty'
  return `${rangeResetKey}:${defaultVisibleFrom}:${points.length}:${latestDate}`
}

function formatCurrencyValue(value: number) {
  return Math.abs(value) >= 1000
    ? compactCurrencyFormatter.format(value)
    : currencyFormatter.format(value)
}

function buildViewportMaximumDrawdown(
  points: MarketSeriesPoint[],
  visibleLogicalRange: { from: number; to: number } | null,
) {
  const visibleWindow = buildVisibleWindow(points, visibleLogicalRange)

  if (!visibleWindow) {
    return {
      hotspot: null as MarketSeriesPoint | null,
      markers: [] as SeriesMarker<Time>[],
      maximumDrawdown: {
        date: null,
        fromDate: null,
        value: null,
      },
    }
  }

  const maximumDrawdownPoint = visibleWindow.points.reduce((trough, point, index) => {
    if (!trough || point.value < trough.point.value) {
      return {
        absoluteIndex: visibleWindow.startIndex + index,
        point,
      }
    }

    return trough
  }, null as { absoluteIndex: number; point: MarketSeriesPoint } | null)

  if (!maximumDrawdownPoint) {
    return {
      hotspot: null as MarketSeriesPoint | null,
      markers: [] as SeriesMarker<Time>[],
      maximumDrawdown: {
        date: null,
        fromDate: null,
        value: null,
      },
    }
  }

  const fromDate = resolveDrawdownStartDate(points, maximumDrawdownPoint.absoluteIndex)

  return {
    hotspot: maximumDrawdownPoint.point,
    markers: [
      {
        color: drawdownVisuals.maximumDrawdown,
        position: 'belowBar' as const,
        price: maximumDrawdownPoint.point.value,
        shape: 'circle' as const,
        text: 'Max drawdown',
        time: maximumDrawdownPoint.point.time,
      },
    ],
    maximumDrawdown: {
      date: maximumDrawdownPoint.point.date,
      fromDate,
      value: maximumDrawdownPoint.point.value,
    },
  }
}

function buildOverallMaximumDrawdown(points: MarketSeriesPoint[]) {
  const maximumDrawdownPoint = points.reduce((trough, point, index) => {
    if (!trough || point.value < trough.point.value) {
      return {
        absoluteIndex: index,
        point,
      }
    }

    return trough
  }, null as { absoluteIndex: number; point: MarketSeriesPoint } | null)

  if (!maximumDrawdownPoint) {
    return {
      date: null,
      fromDate: null,
      value: null,
    }
  }

  return {
    date: maximumDrawdownPoint.point.date,
    fromDate: resolveDrawdownStartDate(points, maximumDrawdownPoint.absoluteIndex),
    value: maximumDrawdownPoint.point.value,
  }
}

function buildVisibleWindow(
  points: MarketSeriesPoint[],
  visibleLogicalRange: { from: number; to: number } | null,
) {
  if (!points.length) {
    return null
  }

  if (!visibleLogicalRange) {
    return {
      endIndex: points.length - 1,
      points,
      startIndex: 0,
    }
  }

  const startIndex = clampIndex(Math.floor(visibleLogicalRange.from), points.length)
  const endIndex = clampIndex(Math.ceil(visibleLogicalRange.to), points.length)

  if (endIndex < startIndex) {
    return null
  }

  return {
    endIndex,
    points: points.slice(startIndex, endIndex + 1),
    startIndex,
  }
}

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), length - 1)
}

function resolveDrawdownStartDate(
  points: MarketSeriesPoint[],
  troughIndex: number,
) {
  for (let index = troughIndex; index >= 0; index -= 1) {
    if (Math.abs(points[index]?.value ?? Number.NaN) < 1e-8) {
      return points[index]?.date ?? null
    }
  }

  return points[0]?.date ?? null
}

function buildMarkerHotspots(
  source: MarketSeriesPoint | null,
  chart: IChartApi,
  series: ISeriesApi<'Baseline'>,
) {
  if (!source) {
    return []
  }

  const x = chart.timeScale().timeToCoordinate(source.time)
  const y = series.priceToCoordinate(source.value)

  if (x === null || y === null) {
    return []
  }

  return [
    {
      date: source.date,
      id: `max-drawdown:${source.date}`,
      value: source.value,
      x: Number(x),
      y: Number(y) + 18,
    },
  ]
}

function normalizeVisibleRange(
  range: { from: Time; to: Time } | null,
): ChartVisibleRange | null {
  if (!range) {
    return null
  }

  const from = normalizeTimeToDate(range.from)
  const to = normalizeTimeToDate(range.to)

  if (!from || !to) {
    return null
  }

  return {
    from,
    to,
  }
}

function areVisibleRangesClose(
  left: ChartVisibleRange | null,
  right: ChartVisibleRange | null,
) {
  if (!left || !right) {
    return left === right
  }

  return left.from === right.from && left.to === right.to
}

function normalizeVisibleTimeRange(
  range: { from: Time; to: Time } | null,
): ChartVisibleRange | null {
  return normalizeVisibleRange(range)
}

function formatDrawdownRangeLabel(detail: VisibleDrawdownExtrema) {
  if (!detail.fromDate || !detail.date) {
    return ''
  }

  return `from ${detail.fromDate} to ${detail.date}`
}
