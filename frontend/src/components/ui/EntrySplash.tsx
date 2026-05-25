import { AnimatePresence, motion } from 'framer-motion'

interface EntrySplashProps {
  visible: boolean
}

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
            className="entry-splash__panel"
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
            aria-live="polite"
          >
            <div className="entry-splash__stack" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => (
                <motion.span
                  key={index}
                  className="entry-splash__bar"
                  initial={{ opacity: 0.35, scaleY: 0.35 }}
                  animate={{
                    opacity: [0.35, 0.85, 0.35],
                    scaleY: [0.35, 1, 0.45],
                  }}
                  transition={{
                    delay: index * 0.08,
                    duration: 1.35,
                    ease: 'easeInOut',
                    repeat: Number.POSITIVE_INFINITY,
                    repeatType: 'mirror',
                  }}
                ></motion.span>
              ))}
            </div>

            <motion.div
              className="entry-splash__trace"
              initial={{ opacity: 0.35, scaleX: 0.2 }}
              animate={{
                opacity: [0.35, 1, 0.68],
                scaleX: [0.2, 1, 0.92],
              }}
              transition={{
                duration: 2.2,
                ease: 'easeInOut',
                repeat: Number.POSITIVE_INFINITY,
                repeatType: 'mirror',
              }}
            ></motion.div>

            <motion.p
              className="entry-splash__eyebrow"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
            >
              Engine buffer
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.55, ease: 'easeOut' }}
            >
              Market Risk Engine
            </motion.h1>
            <motion.p
              className="entry-splash__caption"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.44, duration: 0.55, ease: 'easeOut' }}
            >
              Calibrating the visualization surface
            </motion.p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
