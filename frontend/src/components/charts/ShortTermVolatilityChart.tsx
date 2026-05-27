import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { motion } from 'framer-motion'
import {
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
import './ShortTermVolatilityChart.css'

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
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

const volatilityVisuals = {
  glow: 'rgba(34, 197, 94, 0.14)',
  line: '#5eead4',
  marker: '#ccfbf1',
  priceLine: '#2dd4bf',
}

interface ShortTermVolatilityChartProps {
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
  tooltipContent: ReactNode
}

interface HoverSnapshot {
  date: string
  kind?: MarkerKind
  seriesKey: string
  value: number
}

type MarkerKind = 'peak' | 'trough'

interface ViewportExtrema {
  peakDate: string | null
  troughDate: string | null
}

interface MarkerSource {
  date: string
  kind: MarkerKind
  time: Time
  value: number
}

interface MarkerHotspot {
  date: string
  id: string
  kind: MarkerKind
  value: number
  x: number
  y: number
}

export function ShortTermVolatilityChart({
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
  tooltipContent,
}: ShortTermVolatilityChartProps) {
  const seriesKey = `${ticker}:daily-short-term-volatility`
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const visibleRangeKeyRef = useRef<string | null>(null)
  const crosshairSnapshotRef = useRef<HoverSnapshot | null>(null)
  const hoveredMarkerIdRef = useRef<string | null>(null)
  const pinnedMarkerIdRef = useRef<string | null>(null)
  const [hoverSnapshot, setHoverSnapshot] = useState<HoverSnapshot | null>(null)
  const [viewportExtrema, setViewportExtrema] = useState<ViewportExtrema>({
    peakDate: null,
    troughDate: null,
  })
  const [markerHotspots, setMarkerHotspots] = useState<MarkerHotspot[]>([])
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null)
  const [pinnedMarkerId, setPinnedMarkerId] = useState<string | null>(null)
  const [syncedHoverPoint, setSyncedHoverPoint] = useState<{
    date: string
    x: number
    y: number
  } | null>(null)

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

    syncViewportMarkers()
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

    if (!hoveredPoint) {
      setHoverSnapshot(null)
      onHoverDateChange?.(null)
      return
    }

    setHoverSnapshot(nextSnapshot)
    onHoverDateChange?.(hoveredPoint.date)
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

  const syncViewportMarkers = useEffectEvent(() => {
    const chart = chartRef.current
    const lineSeries = seriesRef.current
    const markers = markersRef.current

    if (!chart || !lineSeries || !markers) {
      return
    }

    const markerPayload = buildViewportMarkers(
      points,
      chart.timeScale().getVisibleLogicalRange(),
      defaultVisibleFrom,
    )

    markers.setMarkers(markerPayload.markers)
    setMarkerHotspots(
      buildMarkerHotspots(markerPayload.hotspots, chart, lineSeries),
    )
    setViewportExtrema((current) => {
      if (
        current.peakDate === markerPayload.viewportExtrema.peakDate &&
        current.troughDate === markerPayload.viewportExtrema.troughDate
      ) {
        return current
      }

      return markerPayload.viewportExtrema
    })
  })

  const syncSyncedHoverPoint = useEffectEvent(() => {
    const chart = chartRef.current
    const lineSeries = seriesRef.current

    if (!chart || !lineSeries) {
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
    const y = lineSeries.priceToCoordinate(matchingPoint.value)

    if (x === null || y === null) {
      setSyncedHoverPoint(null)
      return
    }

    setSyncedHoverPoint({
      date: matchingPoint.date,
      x: Number(x),
      y: Number(y),
    })
  })

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
          top: 0.04,
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
          labelBackgroundColor: volatilityVisuals.priceLine,
        },
        horzLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: volatilityVisuals.priceLine,
        },
      },
      localization: {
        priceFormatter: formatPercentValue,
      },
    })

    const lineSeries = chart.addSeries(LineSeries, buildSeriesOptions())
    const markers = createSeriesMarkers(lineSeries, [])
    const handleVisibleLogicalRangeChange = () => {
      syncViewportMarkers()
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
    seriesRef.current = lineSeries
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
    const lineSeries = seriesRef.current
    const markers = markersRef.current

    if (!chart || !lineSeries || !markers) {
      return
    }

    chart.applyOptions({
      crosshair: {
        vertLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: volatilityVisuals.priceLine,
        },
        horzLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: volatilityVisuals.priceLine,
        },
      },
      localization: {
        priceFormatter: formatPercentValue,
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: 'rgba(174, 182, 198, 0)',
        scaleMargins: {
          bottom: 0.08,
          top: 0.04,
        },
      },
      timeScale: timeScaleOptions,
    })

    lineSeries.applyOptions(buildSeriesOptions())
    lineSeries.setData(points)

    const nextVisibleRangeKey = buildVisibleRangeKey(
      rangeResetKey,
      defaultVisibleFrom,
      points,
    )

    if (visibleRangeKeyRef.current !== nextVisibleRangeKey) {
      applyVisibleRange(chart, points, defaultVisibleFrom)
      visibleRangeKeyRef.current = nextVisibleRangeKey
    }
    syncViewportMarkers()
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
  const syncedSnapshot = !crosshairSnapshotRef.current
    ? buildSnapshotByDate(points, syncedHoverDate, seriesKey)
    : null
  const activeSnapshot =
    hoverSnapshot?.seriesKey === seriesKey
      ? hoverSnapshot
      : syncedSnapshot ?? buildLatestSnapshot(points, seriesKey)
  const isLatestSnapshot = activeSnapshot?.date === latestPoint?.date
  const hoverTone = resolveHoverTone(activeSnapshot, viewportExtrema, latestPoint)
  const hoverDateParts = activeSnapshot
    ? formatDateParts(activeSnapshot.date)
    : null

  return (
    <div
      className="volatility-chart-frame"
      style={{ '--chart-glow': volatilityVisuals.glow } as CSSProperties}
    >
      <div className="volatility-chart-copy">
        <div className="volatility-chart-title-row">
          <span className="volatility-chart-title">
            Daily short term volatility
          </span>
          <InfoTooltip
            label="Daily short term volatility details"
            content={tooltipContent}
            align="start"
            side="right"
            sideOffset={8}
          />
        </div>
      </div>

      <div className="volatility-chart-surface">
        <div
          className={`volatility-chart-date-card volatility-chart-date-card--${hoverTone}`}
        >
          <span className="volatility-chart-date-card__eyebrow">
            {hoverTone === 'peak'
              ? 'Peak marker'
              : hoverTone === 'trough'
                ? 'Trough marker'
                : activeSnapshot?.date === latestPoint?.date
              ? 'Latest observation'
                : 'Crosshair date'}
          </span>
          {hoverDateParts ? (
            <strong className="volatility-chart-date-card__value">
              <span className="volatility-chart-date-card__month">
                {hoverDateParts.month}
              </span>
              <span className="volatility-chart-date-card__day">
                {hoverDateParts.day}
              </span>
              <span className="volatility-chart-date-card__year">
                {hoverDateParts.year}
              </span>
              {isLatestSnapshot ? (
                <span className="volatility-chart-date-card__latest-tag">
                  (latest)
                </span>
              ) : null}
            </strong>
          ) : null}
          <span className="volatility-chart-date-card__metric">
            {activeSnapshot ? formatPercentValue(activeSnapshot.value) : 'Loading'}
          </span>
        </div>
        <div ref={surfaceRef} className="volatility-chart-canvas"></div>
        {syncedHoverPoint ? (
          <div
            className="volatility-chart-sync-point"
            style={{
              left: `${syncedHoverPoint.x}px`,
              top: `${syncedHoverPoint.y}px`,
            }}
          >
            <span className="volatility-chart-sync-point__core"></span>
          </div>
        ) : null}
        {markerHotspots.map((hotspot) => {
          const isActive =
            hoveredMarkerId === hotspot.id || pinnedMarkerId === hotspot.id

          return (
            <motion.button
              key={hotspot.id}
              type="button"
              className={`volatility-chart-hotspot volatility-chart-hotspot--${hotspot.kind}`}
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
                  kind: hotspot.kind,
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
                  kind: hotspot.kind,
                  seriesKey,
                  value: hotspot.value,
                })
                onHoverDateChange?.(hotspot.date)
              }}
            >
              <span className="volatility-chart-hotspot__core"></span>
            </motion.button>
          )
        })}
        {isRefreshing ? (
          <div className="volatility-chart-refresh">
            <div className="volatility-chart-refresh__card">
              <span className="volatility-chart-refresh__pulse"></span>
              <span className="volatility-chart-refresh__label">
                Buffering {refreshLabel}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function buildSeriesOptions() {
  return {
    color: volatilityVisuals.line,
    crosshairMarkerBackgroundColor: volatilityVisuals.priceLine,
    crosshairMarkerBorderColor: volatilityVisuals.marker,
    crosshairMarkerRadius: 5,
    lastValueVisible: true,
    lineWidth: 3 as const,
    priceFormat: {
      formatter: formatPercentValue,
      minMove: 0.0001,
      tickmarksFormatter: (values: number[]) =>
        values.map((value) => formatPercentValue(value)),
      type: 'custom' as const,
    },
    priceLineColor: volatilityVisuals.priceLine,
    priceLineVisible: true,
  }
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

function normalizeVisibleRange(range: { from: Time; to: Time } | null) {
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
    return false
  }

  return left.from === right.from && left.to === right.to
}

function normalizeVisibleTimeRange(
  range: { from: Time; to: Time } | null,
) {
  return normalizeVisibleRange(range)
}

function buildViewportMarkers(
  points: MarketSeriesPoint[],
  visibleLogicalRange: { from: number; to: number } | null,
  defaultVisibleFrom: string,
) {
  const visibleWindow = buildVisibleWindow(points, visibleLogicalRange)

  if (!visibleWindow) {
    return {
      hotspots: [] as MarkerSource[],
      markers: [] as SeriesMarker<Time>[],
      viewportExtrema: {
        peakDate: null,
        troughDate: null,
      },
    }
  }

  const visiblePoints = visibleWindow.points.filter(
    (point) => point.date >= defaultVisibleFrom,
  )

  if (!visiblePoints.length) {
    return {
      hotspots: [] as MarkerSource[],
      markers: [] as SeriesMarker<Time>[],
      viewportExtrema: {
        peakDate: null,
        troughDate: null,
      },
    }
  }

  const peakPoint = visiblePoints.reduce((peak, point) => {
    if (!peak || point.value > peak.value) {
      return point
    }

    return peak
  }, null as MarketSeriesPoint | null)
  const troughPoint = visiblePoints.reduce((trough, point) => {
    if (!trough || point.value < trough.value) {
      return point
    }

    return trough
  }, null as MarketSeriesPoint | null)

  const viewportExtrema = {
    peakDate: peakPoint?.date ?? null,
    troughDate: troughPoint?.date ?? null,
  }

  if (peakPoint && troughPoint && peakPoint.time === troughPoint.time) {
    const hotspots: MarkerSource[] = [
      {
        date: peakPoint.date,
        kind: 'peak',
        time: peakPoint.time,
        value: peakPoint.value,
      },
    ]
    const combinedMarkers: SeriesMarker<Time>[] = [
      {
        color: '#f59e0b',
        position: 'aboveBar',
        price: peakPoint.value,
        shape: 'circle',
        text: 'Peak / Trough',
        time: peakPoint.time,
      },
    ]

    return {
      hotspots,
      markers: combinedMarkers,
      viewportExtrema,
    }
  }

  const hotspots: MarkerSource[] = []
  const markers: SeriesMarker<Time>[] = []

  if (peakPoint) {
    hotspots.push({
      date: peakPoint.date,
      kind: 'peak',
      time: peakPoint.time,
      value: peakPoint.value,
    })
    markers.push({
      color: '#5eead4',
      position: 'aboveBar',
      price: peakPoint.value,
      shape: 'circle',
      text: 'Peak',
      time: peakPoint.time,
    })
  }

  if (troughPoint) {
    hotspots.push({
      date: troughPoint.date,
      kind: 'trough',
      time: troughPoint.time,
      value: troughPoint.value,
    })
    markers.push({
      color: '#f59e0b',
      position: 'belowBar',
      price: troughPoint.value,
      shape: 'circle',
      text: 'Trough',
      time: troughPoint.time,
    })
  }

  return {
    hotspots,
    markers,
    viewportExtrema,
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

function resolveHoverTone(
  activeSnapshot: HoverSnapshot | null,
  viewportExtrema: ViewportExtrema,
  latestPoint?: MarketSeriesPoint,
) {
  if (!activeSnapshot) {
    return 'default'
  }

  if (activeSnapshot.date === viewportExtrema.peakDate) {
    return 'peak'
  }

  if (activeSnapshot.date === viewportExtrema.troughDate) {
    return 'trough'
  }

  if (activeSnapshot.date === latestPoint?.date) {
    return 'latest'
  }

  return 'default'
}

function buildMarkerHotspots(
  sources: MarkerSource[],
  chart: IChartApi,
  lineSeries: ISeriesApi<'Line'>,
) {
  return sources
    .map<MarkerHotspot | null>((source) => {
      const x = chart.timeScale().timeToCoordinate(source.time)
      const y = lineSeries.priceToCoordinate(source.value)

      if (x === null || y === null) {
        return null
      }

      return {
        date: source.date,
        id: `${source.kind}:${source.date}`,
        kind: source.kind,
        value: source.value,
        x: Number(x),
        y: Number(y) + resolveMarkerHotspotOffset(source.kind),
      }
    })
    .filter((source): source is MarkerHotspot => Boolean(source))
}

function resolveMarkerHotspotOffset(kind: MarkerKind) {
  return kind === 'peak' ? -18 : 18
}

function formatPercentValue(value: number) {
  return percentFormatter.format(value)
}
