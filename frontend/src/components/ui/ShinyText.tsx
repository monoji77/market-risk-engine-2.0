import { useCallback, useEffect, useRef, useState } from 'react'
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useTransform,
} from 'motion/react'
import './ShinyText.css'

interface ShinyTextProps {
  className?: string
  color?: string
  delay?: number
  direction?: 'left' | 'right'
  disabled?: boolean
  pauseOnHover?: boolean
  shineColor?: string
  speed?: number
  spread?: number
  text: string
  yoyo?: boolean
}

export default function ShinyText({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  delay = 0,
}: ShinyTextProps) {
  const [isPaused, setIsPaused] = useState(false)
  const progress = useMotionValue(0)
  const elapsedRef = useRef(0)
  const lastTimeRef = useRef<number | null>(null)
  const directionRef = useRef(direction === 'left' ? 1 : -1)
  const animationDuration = speed * 1000
  const delayDuration = delay * 1000

  useAnimationFrame((time) => {
    if (disabled || isPaused) {
      lastTimeRef.current = null
      return
    }

    if (lastTimeRef.current === null) {
      lastTimeRef.current = time
      return
    }

    const deltaTime = time - lastTimeRef.current
    lastTimeRef.current = time
    elapsedRef.current += deltaTime

    if (yoyo) {
      const cycleDuration = animationDuration + delayDuration
      const fullCycle = cycleDuration * 2
      const cycleTime = elapsedRef.current % fullCycle

      if (cycleTime < animationDuration) {
        const nextProgress = (cycleTime / animationDuration) * 100
        progress.set(directionRef.current === 1 ? nextProgress : 100 - nextProgress)
      } else if (cycleTime < cycleDuration) {
        progress.set(directionRef.current === 1 ? 100 : 0)
      } else if (cycleTime < cycleDuration + animationDuration) {
        const reverseTime = cycleTime - cycleDuration
        const nextProgress = 100 - (reverseTime / animationDuration) * 100
        progress.set(directionRef.current === 1 ? nextProgress : 100 - nextProgress)
      } else {
        progress.set(directionRef.current === 1 ? 0 : 100)
      }

      return
    }

    const cycleDuration = animationDuration + delayDuration
    const cycleTime = elapsedRef.current % cycleDuration

    if (cycleTime < animationDuration) {
      const nextProgress = (cycleTime / animationDuration) * 100
      progress.set(directionRef.current === 1 ? nextProgress : 100 - nextProgress)
      return
    }

    progress.set(directionRef.current === 1 ? 100 : 0)
  })

  useEffect(() => {
    directionRef.current = direction === 'left' ? 1 : -1
    elapsedRef.current = 0
    progress.set(0)
  }, [direction, progress])

  const backgroundPosition = useTransform(
    progress,
    (nextProgress) => `${150 - nextProgress * 2}% center`,
  )

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) {
      setIsPaused(true)
    }
  }, [pauseOnHover])

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) {
      setIsPaused(false)
    }
  }, [pauseOnHover])

  const gradientStyle = {
    WebkitBackgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent' as const,
    backgroundClip: 'text' as const,
    backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
  }

  return (
    <motion.span
      className={`shiny-text ${className}`.trim()}
      style={{ ...gradientStyle, backgroundPosition }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </motion.span>
  )
}
