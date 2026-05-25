import { useEffect, useRef, useState } from 'react'

interface CountUpValueProps {
  className?: string
  duration?: number
  formatValue: (value: number) => string
  startWhen?: boolean
  value: number
}

export function CountUpValue({
  className,
  duration = 950,
  formatValue,
  startWhen = true,
  value,
}: CountUpValueProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const animationFrameRef = useRef<number | null>(null)
  const previousValueRef = useRef(0)

  useEffect(() => {
    if (!startWhen) {
      return
    }

    const fromValue = previousValueRef.current
    const delta = value - fromValue

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (!Number.isFinite(value) || Math.abs(delta) < Number.EPSILON) {
      setDisplayValue(value)
      previousValueRef.current = value
      return
    }

    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      const nextValue = fromValue + delta * easedProgress

      setDisplayValue(nextValue)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick)
        return
      }

      previousValueRef.current = value
    }

    animationFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [duration, startWhen, value])

  return <span className={className}>{formatValue(displayValue)}</span>
}
