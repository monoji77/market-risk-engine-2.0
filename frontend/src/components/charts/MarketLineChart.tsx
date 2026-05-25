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
import type { MarketSeriesPoint, Metric } from '../../types/market'
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
    accentLine: '#7a0c19',
    accentSolid: '#7a0c19',
    glow: 'rgba(122, 12, 25, 0.32)',
    lineWidth: 3 as const,
    marker: '#eaa7b3',
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
  borderColor: 'rgba(174, 182, 198, 0.16)',
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
  ticker: string
  metric: Metric
  points: MarketSeriesPoint[]
  isRefreshing: boolean
  refreshLabel: string
  rangeResetKey: string
}

type MarkerKind = 'peak' | 'trough'

export function MarketLineChart({
  defaultVisibleFrom,
  ticker,
  metric,
  points,
  isRefreshing,
  refreshLabel,
  rangeResetKey,
}: MarketLineChartProps) {
  const seriesKey = buildSeriesKey(ticker, metric)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const visibleRangeKeyRef = useRef<string | null>(null)
  const crosshairSnapshotRef = useRef<HoverSnapshot | null>(null)
  const [hoverSnapshot, setHoverSnapshot] = useState<HoverSnapshot | null>(null)
  const [viewportExtrema, setViewportExtrema] = useState<ViewportExtrema>({
    peakDate: null,
    troughDate: null,
  })
  const [markerHotspots, setMarkerHotspots] = useState<MarkerHotspot[]>([])
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null)
  const [pinnedMarkerId, setPinnedMarkerId] = useState<string | null>(null)

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
  })

  const syncHoverSnapshot = useEffectEvent((param: MouseEventParams<Time>) => {
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

    if (hoveredMarkerId || pinnedMarkerId) {
      return
    }

    if (!hoveredPoint) {
      setHoverSnapshot(null)
      return
    }

    setHoverSnapshot(nextSnapshot)
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
        borderColor: 'rgba(174, 182, 198, 0.16)',
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
    const markers = createSeriesMarkers(lineSeries, [])
    chart.subscribeCrosshairMove(syncHoverSnapshot)
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncViewportMarkers)

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
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncViewportMarkers)
      markersRef.current = null
      seriesRef.current = null
      chartRef.current = null
      visibleRangeKeyRef.current = null
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
  }, [defaultVisibleFrom, metric, points, rangeResetKey])

  useEffect(() => {
    if (hoveredMarkerId || pinnedMarkerId) {
      return
    }

    setHoverSnapshot(crosshairSnapshotRef.current)
  }, [hoveredMarkerId, pinnedMarkerId])

  const visuals = metricVisuals[metric]
  const latestPoint = points.at(-1)
  const activeSnapshot =
    hoverSnapshot?.seriesKey === seriesKey
      ? hoverSnapshot
      : buildLatestSnapshot(points, seriesKey)
  const hoverDateParts = activeSnapshot
    ? formatDateParts(activeSnapshot.date)
    : null
  const hoverTone = resolveHoverTone(activeSnapshot, viewportExtrema, latestPoint)

  return (
    <div
      className="market-chart-frame"
      style={{ '--chart-glow': visuals.glow } as CSSProperties}
    >
      <div className="market-chart-copy">
        <div className="market-chart-meta">
          <span>{points.length.toLocaleString('en-US')} plotted points</span>
        </div>
      </div>

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
            </strong>
          ) : null}
          <span className="market-chart-date-card__metric">
            {activeSnapshot
              ? formatChartValue(metric, activeSnapshot.value)
              : 'Loading'}
          </span>
        </div>
        <div ref={surfaceRef} className="market-chart-canvas"></div>
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
                setHoveredMarkerId(hotspot.id)
                setHoverSnapshot({
                  date: hotspot.date,
                  kind: hotspot.kind,
                  seriesKey,
                  value: hotspot.value,
                })
              }}
              onMouseLeave={() => {
                setHoveredMarkerId((current) =>
                  current === hotspot.id ? null : current,
                )

                if (pinnedMarkerId === hotspot.id) {
                  setPinnedMarkerId(null)
                }

                setHoverSnapshot(crosshairSnapshotRef.current)
              }}
              onClick={() => {
                setPinnedMarkerId(hotspot.id)
                setHoverSnapshot({
                  date: hotspot.date,
                  kind: hotspot.kind,
                  seriesKey,
                  value: hotspot.value,
                })
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

  return {
    color: visuals.accentLine,
    crosshairMarkerRadius: 5,
    crosshairMarkerBorderColor: visuals.marker,
    crosshairMarkerBackgroundColor: visuals.accentSolid,
    lastValueVisible: true,
    lineWidth: visuals.lineWidth,
    priceLineColor: visuals.accentSolid,
    priceLineVisible: true,
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
      color: '#f59e0b',
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
      color: '#f59e0b',
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
      color: '#34d399',
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
        y: Number(y),
      }
    })
    .filter((source): source is MarkerHotspot => Boolean(source))
}
