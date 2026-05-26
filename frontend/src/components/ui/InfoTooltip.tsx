import * as Tooltip from '@radix-ui/react-tooltip'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface InfoTooltipProps {
  content: ReactNode
  label: string
}

export function InfoTooltip({ content, label }: InfoTooltipProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const [isPointerOverTrigger, setIsPointerOverTrigger] = useState(false)
  const [isPointerOverContent, setIsPointerOverContent] = useState(false)
  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false)
  const isOpen =
    isPointerOverTrigger || isPointerOverContent || isKeyboardFocused

  function isWithinTooltip(target: EventTarget | null) {
    const node = target as Node | null

    return Boolean(
      node &&
        (triggerRef.current?.contains(node) || contentRef.current?.contains(node)),
    )
  }

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function scheduleTriggerExit() {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setIsPointerOverTrigger(false)
    }, 70)
  }

  useEffect(() => () => clearCloseTimer(), [])

  return (
    <Tooltip.Provider delayDuration={140}>
      <Tooltip.Root open={isOpen}>
        <Tooltip.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className="info-tooltip__trigger"
            aria-label={label}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => {
              clearCloseTimer()
              setIsPointerOverTrigger(true)
            }}
            onMouseLeave={(event) => {
              if (isWithinTooltip(event.relatedTarget)) {
                return
              }

              scheduleTriggerExit()
            }}
            onFocus={() => setIsKeyboardFocused(true)}
            onBlur={() => setIsKeyboardFocused(false)}
            onClick={() => {
              clearCloseTimer()
              setIsPointerOverTrigger(true)
            }}
          >
            ?
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            ref={contentRef}
            className="info-tooltip__content"
            side="top"
            align="center"
            sideOffset={6}
            collisionPadding={16}
            onMouseEnter={() => {
              clearCloseTimer()
              setIsPointerOverContent(true)
            }}
            onMouseLeave={(event) => {
              if (triggerRef.current?.contains(event.relatedTarget as Node | null)) {
                setIsPointerOverContent(false)
                return
              }

              clearCloseTimer()
              setIsPointerOverContent(false)
              setIsPointerOverTrigger(false)
            }}
          >
            {content}
            <Tooltip.Arrow className="info-tooltip__arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
