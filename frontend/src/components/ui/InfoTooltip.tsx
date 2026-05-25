import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

interface InfoTooltipProps {
  content: ReactNode
  label: string
}

export function InfoTooltip({ content, label }: InfoTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={140}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="info-tooltip__trigger"
            aria-label={label}
          >
            ?
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="info-tooltip__content"
            side="top"
            align="center"
            sideOffset={10}
            collisionPadding={16}
          >
            {content}
            <Tooltip.Arrow className="info-tooltip__arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
