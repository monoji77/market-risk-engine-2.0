import { AnimatePresence, motion } from 'framer-motion'
import type { FocusEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { InfoTooltip } from './InfoTooltip'

interface ShiftingTabOption<T extends string> {
  description?: string
  label: string
  value: T
}

interface ShiftingTabsProps<T extends string> {
  className?: string
  label: string
  labelTooltip?: ReactNode
  onChange: (value: T) => void
  options: ShiftingTabOption<T>[]
  searchPlaceholder?: string
  value: T
}

export function ShiftingTabs<T extends string>({
  className,
  label,
  labelTooltip,
  onChange,
  options,
  searchPlaceholder,
  value,
}: ShiftingTabsProps<T>) {
  const layoutId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedValue, setHighlightedValue] = useState<T | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0] ?? null
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.description ?? ''}`
      .toLowerCase()
      .includes(searchValue.trim().toLowerCase()),
  )
  const activeHighlightValue =
    filteredOptions.find((option) => option.value === highlightedValue)?.value ??
    filteredOptions.find((option) => option.value === selectedOption?.value)
      ?.value ??
    filteredOptions[0]?.value ??
    null

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeDropdown()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    searchInputRef.current?.focus()
  }, [isOpen])

  function closeDropdown() {
    setIsOpen(false)
    setHighlightedValue(null)
    setSearchValue('')
  }

  function openDropdown() {
    setIsOpen(true)
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      closeDropdown()
    }
  }

  return (
    <div
      ref={rootRef}
      className={['shifting-tabs', className].filter(Boolean).join(' ')}
      onBlurCapture={handleBlur}
    >
      <div className="shifting-tabs__label-row">
        <span className="shifting-tabs__label">{label}</span>
        {labelTooltip ? (
          <InfoTooltip label={`${label} details`} content={labelTooltip} />
        ) : null}
      </div>

      <div
        className="shifting-tabs__surface"
        onMouseEnter={openDropdown}
        onMouseLeave={closeDropdown}
        onFocusCapture={openDropdown}
      >
        <motion.button
          type="button"
          className="shifting-tabs__trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          onClick={openDropdown}
        >
          <span className="shifting-tabs__trigger-copy">
            <span className="shifting-tabs__trigger-value">
              {selectedOption?.label ?? label}
            </span>
            {selectedOption?.description ? (
              <span className="shifting-tabs__trigger-description">
                {selectedOption.description}
              </span>
            ) : null}
          </span>
          <motion.span
            className="shifting-tabs__chevron"
            animate={{ rotate: isOpen ? 225 : 45 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          ></motion.span>
        </motion.button>

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              className="shifting-tabs__dropdown"
              role="listbox"
              aria-label={label}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="shifting-tabs__search-shell">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="shifting-tabs__search"
                  placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}`}
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>

              {filteredOptions.length ? (
                filteredOptions.map((option) => {
                const isSelected = option.value === value
                const isHighlighted = option.value === activeHighlightValue

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className="shifting-tabs__option"
                    data-selected={isSelected}
                    onMouseEnter={() => setHighlightedValue(option.value)}
                    onFocus={() => setHighlightedValue(option.value)}
                    onClick={() => {
                      onChange(option.value)
                      closeDropdown()
                    }}
                  >
                    {isHighlighted ? (
                      <motion.span
                        layoutId={layoutId}
                        className="shifting-tabs__highlight"
                        transition={{
                          damping: 30,
                          stiffness: 360,
                          type: 'spring',
                        }}
                      >
                        <motion.span
                          className="shifting-tabs__highlight-sheen"
                          initial={{ opacity: 0.36, x: '-16%' }}
                          animate={{ opacity: 0.6, x: '14%' }}
                          transition={{ duration: 0.42, ease: 'easeOut' }}
                        ></motion.span>
                      </motion.span>
                    ) : null}

                    <span className="shifting-tabs__option-text">
                      <span className="shifting-tabs__option-label">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="shifting-tabs__option-description">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <span className="shifting-tabs__option-indicator"></span>
                    ) : null}
                  </button>
                )
                })
              ) : (
                <div className="shifting-tabs__empty">No matching results</div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
