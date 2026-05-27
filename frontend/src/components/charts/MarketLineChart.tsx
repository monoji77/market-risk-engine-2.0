import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { motion } from 'framer-motion'
import {
  ColorType,
  LineStyle,
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
  Metric,
} from '../../types/market'
import './MarketLineChart.css'

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

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const metricVisuals = {
  close: {
    accentLine: 'rgba(184, 91, 111, 0.94)',
    accentSolid: '#b85b6f',
    glow: 'rgba(184, 91, 111, 0.08)',
    lineWidth: 3 as const,
    marker: '#f0c2cd',
  },
  returns: {
    accentLine: 'rgba(168, 85, 247, 0.6)',
    accentSolid: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.18)',
    lineWidth: 2 as const,
    marker: '#d8b4fe',
  },
  log_returns: {
    accentLine: 'rgba(168, 85, 247, 0.6)',
    accentSolid: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.18)',
    lineWidth: 2 as const,
    marker: '#d8b4fe',
  },
} satisfies Record<
  Metric,
  {
    accentLine: string
    accentSolid: string
    glow: string
    lineWidth: 2 | 3
    marker: string
  }
>

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

interface MarketLineChartProps {
  defaultVisibleFrom: string
  isRefreshing: boolean
  metric: Metric
  onHoverDateChange?: (date: string | null) => void
  onVisibleRangeChange?: (range: ChartVisibleRange | null) => void
  points: MarketSeriesPoint[]
  refreshLabel: string
  rangeResetKey: string
  syncedHoverDate?: string | null
  syncedVisibleRange: ChartVisibleRange | null
  ticker: string
}

type MarkerKind = 'peak' | 'trough'

export function MarketLineChart({
  defaultVisibleFrom,
  isRefreshing,
  metric,
  onHoverDateChange,
  onVisibleRangeChange,
  points,
  refreshLabel,
  rangeResetKey,
  syncedHoverDate = null,
  syncedVisibleRange,
  ticker,
}: MarketLineChartProps) {
  const seriesKey = buildSeriesKey(ticker, metric)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const referenceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
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
      width: surface.clientWidth,
      height: surface.clientHeight,
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
    )

    markers.setMarkers(markerPayload.markers)
    setMarkerHotspots(
      buildMarkerHotspots(markerPayload.hotspots, chart, lineSeries),
    )
    setViewportExtrema((previous) => {
      if (
        previous.peakDate === markerPayload.viewportExtrema.peakDate &&
        previous.troughDate === markerPayload.viewportExtrema.troughDate
      ) {
        return previous
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
      id: `synced:${matchingPoint.date}`,
      kind: 'peak',
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

    const visuals = metricVisuals.close
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
        borderColor: 'rgba(174, 182, 198, 0)',
      },
      timeScale: timeScaleOptions,
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
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
          labelBackgroundColor: visuals.accentSolid,
        },
        horzLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: visuals.accentSolid,
        },
      },
      localization: {
        priceFormatter: (value: number) => formatChartValue('close', value),
      },
    })

    const lineSeries = chart.addSeries(LineSeries, buildSeriesOptions('close'))
    const referenceSeries = chart.addSeries(
      LineSeries,
      buildReferenceSeriesOptions(),
    )
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
    referenceSeriesRef.current = referenceSeries
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
      referenceSeriesRef.current = null
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
    const referenceSeries = referenceSeriesRef.current
    const markers = markersRef.current

    if (!chart || !lineSeries || !referenceSeries || !markers) {
      return
    }

    const visuals = metricVisuals[metric]

    chart.applyOptions({
      timeScale: timeScaleOptions,
      crosshair: {
        vertLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: visuals.accentSolid,
        },
        horzLine: {
          color: 'rgba(174, 182, 198, 0.22)',
          labelBackgroundColor: visuals.accentSolid,
        },
      },
      localization: {
        priceFormatter: (value: number) => formatChartValue(metric, value),
      },
    })

    lineSeries.applyOptions(buildSeriesOptions(metric))
    lineSeries.setData(points)
    referenceSeries.applyOptions(buildReferenceSeriesOptions())
    referenceSeries.setData(buildReferenceSeriesData(points, metric))

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
  }, [defaultVisibleFrom, metric, points, rangeResetKey])

  useEffect(() => {
    const chart = chartRef.current

    if (!chart || !syncedVisibleRange) {
      return
    }

    const currentRange = normalizeVisibleRange(
      chart.timeScale().getVisibleRange(),
    )

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

  const visuals = metricVisuals[metric]
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
  const hoverTone = resolveHoverTone(activeSnapshot, viewportExtrema, latestPoint)

  return (
    <div
      className="market-chart-frame"
      style={{ '--chart-glow': visuals.glow } as CSSProperties}
    >
      <div className="market-chart-surface">
        <div
          className={`market-chart-date-card market-chart-date-card--${hoverTone}`}
        >
          <span className="market-chart-date-card__eyebrow">
            {hoverTone === 'peak'
              ? 'Peak marker'
              : hoverTone === 'trough'
                ? 'Trough marker'
                : activeSnapshot?.date === latestPoint?.date
                  ? 'Latest observation'
                  : 'Crosshair date'}
          </span>
          {hoverDateParts ? (
            <strong className="market-chart-date-card__value">
              <span className="market-chart-date-card__month">
                {hoverDateParts.month}
              </span>
              <span className="market-chart-date-card__day">
                {hoverDateParts.day}
              </span>
              <span className="market-chart-date-card__year">
                {hoverDateParts.year}
              </span>
              {isLatestSnapshot ? (
                <span className="market-chart-date-card__latest-tag">
                  (latest)
                </span>
              ) : null}
            </strong>
          ) : null}
          <span className="market-chart-date-card__metric">
            {activeSnapshot
              ? formatChartValue(metric, activeSnapshot.value)
              : 'Loading'}
          </span>
        </div>
        <div ref={surfaceRef} className="market-chart-canvas"></div>
        {syncedHoverPoint ? (
          <div
            className="market-chart-sync-point"
            style={{
              left: `${syncedHoverPoint.x}px`,
              top: `${syncedHoverPoint.y}px`,
            }}
          >
            <span className="market-chart-sync-point__core"></span>
          </div>
        ) : null}
        {markerHotspots.map((hotspot) => {
          const isActive =
            hoveredMarkerId === hotspot.id || pinnedMarkerId === hotspot.id

          return (
            <motion.button
              key={hotspot.id}
              type="button"
              className={`market-chart-hotspot market-chart-hotspot--${hotspot.kind}`}
              data-active={isActive}
              style={{
                left: `${hotspot.x}px`,
                top: `${hotspot.y}px`,
              }}
              animate={{
                height: isActive ? 40 : 22,
                opacity: isActive ? 1 : 0.9,
                width: isActive ? 40 : 22,
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
              <span className="market-chart-hotspot__core"></span>
            </motion.button>
          )
        })}
        {isRefreshing ? (
          <div className="market-chart-refresh">
            <div className="market-chart-refresh__card">
              <span className="market-chart-refresh__pulse"></span>
              <span className="market-chart-refresh__label">
                Buffering {refreshLabel}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function buildSeriesOptions(metric: Metric) {
  const visuals = metricVisuals[metric]
  const showsLatestReferenceLine = metric === 'close'

  return {
    color: visuals.accentLine,
    crosshairMarkerRadius: 5,
    crosshairMarkerBorderColor: visuals.marker,
    crosshairMarkerBackgroundColor: visuals.accentSolid,
    lastValueVisible: showsLatestReferenceLine,
    lineWidth: visuals.lineWidth,
    priceLineColor: visuals.accentSolid,
    priceLineVisible: showsLatestReferenceLine,
    priceFormat: {
      type: 'custom' as const,
      minMove: metric === 'close' ? 0.01 : 0.0001,
      formatter: (value: number) => formatChartValue(metric, value),
      tickmarksFormatter: (values: number[]) =>
        values.map((value) => formatChartValue(metric, value)),
    },
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

function formatChartValue(metric: Metric, value: number) {
  if (metric === 'close') {
    return Math.abs(value) >= 1000
      ? compactCurrencyFormatter.format(value)
      : currencyFormatter.format(value)
  }

  return percentFormatter.format(value)
}

function buildLatestSnapshot(points: MarketSeriesPoint[], seriesKey: string) {
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
) {
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

function buildVisibleRangeKey(
  rangeResetKey: string,
  defaultVisibleFrom: string,
  points: MarketSeriesPoint[],
) {
  const latestDate = points.at(-1)?.date ?? 'empty'
  return `${rangeResetKey}:${defaultVisibleFrom}:${points.length}:${latestDate}`
}

function buildSeriesKey(ticker: string, metric: Metric) {
  return `${ticker}:${metric}`
}

function buildViewportMarkers(
  points: MarketSeriesPoint[],
  visibleLogicalRange: { from: number; to: number } | null,
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

  const latestPoint = points.at(-1)
  const peakPoint = visibleWindow.points.reduce((peak, point) => {
    if (!peak || point.value > peak.value) {
      return point
    }

    return peak
  }, null as MarketSeriesPoint | null)
  const troughPoint = visibleWindow.points.reduce((trough, point) => {
    if (!trough || point.value < trough.value) {
      return point
    }

    return trough
  }, null as MarketSeriesPoint | null)

  if (!peakPoint && !troughPoint && !latestPoint) {
    return {
      hotspots: [] as MarkerSource[],
      markers: [] as SeriesMarker<Time>[],
      viewportExtrema: {
        peakDate: null,
        troughDate: null,
      },
    }
  }

  const viewportExtrema = {
    peakDate: peakPoint?.date ?? null,
    troughDate: troughPoint?.date ?? null,
  }

  if (peakPoint && troughPoint && peakPoint.time === troughPoint.time) {
    const combinedMarker: SeriesMarker<Time> = {
      color: '#34d399',
      position: 'aboveBar',
      shape: 'circle',
      text: 'Peak / Trough',
      time: peakPoint.time,
    }

    return {
      hotspots: [
        {
          date: peakPoint.date,
          kind: 'peak' as const,
          time: peakPoint.time,
          value: peakPoint.value,
        },
      ],
      markers: [combinedMarker],
      viewportExtrema,
    }
  }

  const markers: SeriesMarker<Time>[] = []
  const hotspots: MarkerSource[] = []

  if (peakPoint) {
    hotspots.push({
      date: peakPoint.date,
      kind: 'peak',
      time: peakPoint.time,
      value: peakPoint.value,
    })
    markers.push({
      color: '#34d399',
      position: 'aboveBar',
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
      shape: 'circle',
      text: 'Trough',
      time: troughPoint.time,
    })
  }

  const latestIndex = points.length - 1
  const latestIsVisible =
    latestPoint &&
    latestIndex >= visibleWindow.startIndex &&
    latestIndex <= visibleWindow.endIndex

  if (
    latestPoint &&
    latestIsVisible &&
    latestPoint.time !== peakPoint?.time &&
    latestPoint.time !== troughPoint?.time
  ) {
    markers.push({
      color: '#f8fafc',
      position: 'aboveBar',
      shape: 'arrowDown',
      text: 'Latest',
      time: latestPoint.time,
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

interface HoverSnapshot {
  date: string
  kind?: MarkerKind
  seriesKey: string
  value: number
}

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

function buildReferenceSeriesOptions() {
  return {
    color: 'rgba(148, 163, 184, 0.58)',
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    lineStyle: LineStyle.Dashed,
    lineWidth: 1 as const,
    priceLineVisible: false,
  }
}

function buildReferenceSeriesData(points: MarketSeriesPoint[], metric: Metric) {
  if (metric === 'close') {
    return []
  }

  return points.map((point) => ({
    time: point.time,
    value: 0,
  }))
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

function resolveMarkerHotspotOffset(kind: MarkerKind) {
  return kind === 'peak' ? -18 : 18
}
