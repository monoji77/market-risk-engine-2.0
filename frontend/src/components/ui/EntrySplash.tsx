import { AnimatePresence, motion } from 'framer-motion'

interface EntrySplashProps {
  visible: boolean
}

const loaderLines = [
  'entry-splash__line--top',
  'entry-splash__line--right',
  'entry-splash__line--bottom',
  'entry-splash__line--left',
]

export function EntrySplash({ visible }: EntrySplashProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="entry-splash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.55, ease: 'easeOut' } }}
        >
          <div className="entry-splash__veil" aria-hidden="true"></div>
          <motion.div
            className="entry-splash__loader"
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: {
                damping: 24,
                stiffness: 210,
                type: 'spring',
              },
            }}
            exit={{ opacity: 0, scale: 1.03, y: -18 }}
            role="status"
            aria-label="Loading market risk engine"
          >
            <motion.div
              className="entry-splash__glow"
              aria-hidden="true"
              animate={{
                opacity: [0.38, 0.72, 0.38],
                scale: [0.86, 1.18, 0.86],
              }}
              transition={{
                duration: 3.2,
                ease: 'easeInOut',
                repeat: Number.POSITIVE_INFINITY,
              }}
            ></motion.div>

            <div className="entry-splash__orbit" aria-hidden="true">
              {loaderLines.map((className) => (
                <span
                  key={className}
                  className={`entry-splash__line ${className}`}
                ></span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
