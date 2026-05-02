import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const STEPS = [
  {
    emoji: '🎉',
    title: 'Welcome to Follomax!',
    description: "You're all set up. Follomax lets you grow any social media account — followers, likes, views, comments and more — instantly and affordably.",
    action: null,
  },
  {
    emoji: '💳',
    title: 'Add Funds to Your Balance',
    description: 'Before placing an order, you need to top up your balance. We accept all payment methods via Korapay. Your balance is available instantly after payment.',
    action: { label: 'Add Funds Now', href: '/funds' },
  },
  {
    emoji: '🛒',
    title: 'Place Your First Order',
    description: 'Go to New Order, pick a category (Instagram, TikTok, YouTube…), search for a service, select it, enter your link and quantity, then hit Place Order.',
    action: { label: 'Browse Services', href: '/orders/new' },
  },
  {
    emoji: '📦',
    title: 'Track Your Orders',
    description: 'All your orders appear in My Orders with real-time status updates — Pending, In Progress, Completed, and more. Delivery usually starts within minutes.',
    action: { label: 'View My Orders', href: '/orders' },
  },
  {
    emoji: '🔑',
    title: 'Reseller API Access',
    description: 'Want to automate orders or build your own panel on top of Follomax? Your personal API key is available on the Profile page — ready to use right now.',
    action: { label: 'Get My API Key', href: '/profile' },
  },
]

const STORAGE_KEY = 'follomax-onboarded'

export function useOnboarding() {
  const isDone = () => localStorage.getItem(STORAGE_KEY) === 'true'
  const markDone = () => localStorage.setItem(STORAGE_KEY, 'true')
  return { isDone, markDone }
}

interface OnboardingTourProps {
  onDismiss: () => void
}

export function OnboardingTour({ onDismiss }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const navigate = useNavigate()
  const { markDone } = useOnboarding()

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  const dismiss = () => {
    markDone()
    onDismiss()
  }

  const next = () => {
    if (isLast) { dismiss(); return }
    setDirection(1)
    setStep(s => s + 1)
  }

  const goTo = (i: number) => {
    setDirection(i > step ? 1 : -1)
    setStep(i)
  }

  const handleAction = () => {
    if (!current.action) return
    dismiss()
    navigate(current.action.href)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="relative w-full max-w-md glass-card rounded-2xl p-6 shadow-brand z-10"
      >
        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-navy-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Step counter */}
        <p className="text-xs font-medium text-brand-400 mb-4">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Step content */}
        <div className="overflow-hidden min-h-[160px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.22 }}
            >
              <div className="text-5xl mb-4">{current.emoji}</div>
              <h2 className="text-xl font-bold text-white mb-2">{current.title}</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{current.description}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-6 mb-5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-200 ${
                i === step
                  ? 'w-5 h-2 bg-brand-500'
                  : i < step
                    ? 'w-2 h-2 bg-brand-500/50'
                    : 'w-2 h-2 bg-navy-500'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={dismiss}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors px-2 py-1"
          >
            Skip tour
          </button>

          <div className="flex-1" />

          {current.action && (
            <button
              onClick={handleAction}
              className="text-sm text-brand-400 hover:text-brand-300 font-medium transition-colors"
            >
              {current.action.label}
            </button>
          )}

          <Button size="sm" onClick={next} rightIcon={isLast ? <Check className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}>
            {isLast ? 'Done' : 'Next'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
