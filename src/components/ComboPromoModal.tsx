import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, X, Sparkles, Check } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'

/**
 * Flag set by the login & register flows to force the promo on an explicit
 * sign-in (covers logging back in within the same tab).
 */
export const COMBO_PROMO_FLAG = 'follomax:show_combo_promo'

/**
 * Marks that the promo has been shown in this browser session, so a mere page
 * refresh won't re-trigger it — but a fresh session (new login, including a
 * restored session on browser reopen) will.
 */
const COMBO_PROMO_SHOWN = 'follomax:combo_promo_shown'

const PERKS = [
  'Followers, views, likes, shares & saves in one order',
  'The balanced signal the algorithm rewards',
  'One click, one link — no guesswork',
]

export function ComboPromoModal() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!user || isAdmin) return
    const forced = sessionStorage.getItem(COMBO_PROMO_FLAG) === '1'
    const alreadyShown = sessionStorage.getItem(COMBO_PROMO_SHOWN) === '1'
    // Show on an explicit login (forced), or once per browser session for a
    // restored session — but not on a plain refresh once already shown.
    if (forced || !alreadyShown) {
      sessionStorage.removeItem(COMBO_PROMO_FLAG)
      sessionStorage.setItem(COMBO_PROMO_SHOWN, '1')
      setOpen(true)
    }
  }, [user, isAdmin])

  const close = () => setOpen(false)

  const goToBooster = () => {
    setOpen(false)
    navigate('/booster')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="combo-promo-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={close}
          />
          <motion.div
            key="combo-promo-modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none px-4"
          >
            <div className="glass-card rounded-2xl w-full max-w-md pointer-events-auto shadow-brand-lg overflow-hidden relative">
              {/* Glow banner header */}
              <div className="relative bg-gradient-to-br from-brand-500/25 to-brand-600/5 px-8 pt-8 pb-6 text-center overflow-hidden">
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-40 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
                <button
                  onClick={close}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-navy-600/60 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/20 border border-brand-500/30 text-brand-300 text-xs font-semibold mb-4 relative">
                  <Sparkles className="w-3.5 h-3.5" />
                  NEW FEATURE
                </div>

                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.1 }}
                  className="w-16 h-16 rounded-2xl bg-brand-500/20 border-2 border-brand-500/40 flex items-center justify-center mx-auto mb-4 relative"
                >
                  <Rocket className="w-8 h-8 text-brand-400" />
                </motion.div>

                <h2 className="text-2xl font-bold text-white relative">
                  Meet <span className="gradient-text">Combo Deals</span>
                </h2>
                <p className="text-sm text-gray-300 mt-2 leading-relaxed relative">
                  The Algorithm Booster bundles every engagement type into one
                  package — grow smarter, not harder.
                </p>
              </div>

              {/* Body */}
              <div className="px-8 pb-8">
                <ul className="space-y-2.5 mb-6">
                  {PERKS.map(perk => (
                    <li key={perk} className="flex items-start gap-2.5 text-sm text-gray-300">
                      <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-2.5 h-2.5 text-brand-400" />
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  size="lg"
                  leftIcon={<Rocket className="w-4 h-4" />}
                  onClick={goToBooster}
                >
                  Explore Combo Deals
                </Button>
                <button
                  onClick={close}
                  className="w-full mt-3 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
