import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Rocket, Link2, User, AlertCircle, CheckCircle, X, Zap, Sparkles,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useCombos, comboPrice, usePlaceComboOrder } from '@/hooks/useCombos'
import { useBalance } from '@/hooks/useBalance'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  COMBO_COMPONENTS, COMBO_COMPONENT_LABELS, PROFILE_LINK_COMPONENTS,
} from '@/types'
import type { ComboWithItems, ComboComponent, PlaceComboResponse } from '@/types'

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: '📸' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵' },
]

const isUrl = (v: string) => /^https?:\/\/.+/i.test(v.trim())

/** Ordered component lines for a combo (followers → views → likes → shares → saves) */
function comboLines(combo: ComboWithItems) {
  return COMBO_COMPONENTS
    .map(component => {
      const item = combo.combo_items.find(i => i.component === component)
      return item ? { component: component as ComboComponent, quantity: item.quantity } : null
    })
    .filter((x): x is { component: ComboComponent; quantity: number } => x !== null)
}

export function AlgorithmBoosterPage() {
  const [platform, setPlatform] = useState('instagram')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [profileLink, setProfileLink] = useState('')
  const [postLink, setPostLink] = useState('')
  const [successData, setSuccessData] = useState<PlaceComboResponse | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  const { data: combos, isLoading } = useCombos(platform)
  const { data: balance } = useBalance()
  const { mutateAsync: placeCombo, isPending } = usePlaceComboOrder()

  // Reset selection when platform changes or combo list no longer has it
  useEffect(() => {
    setSelectedId(null)
    setProfileLink('')
    setPostLink('')
  }, [platform])

  const selected = useMemo(
    () => combos?.find(c => c.id === selectedId) ?? null,
    [combos, selectedId]
  )

  const needsProfile = selected
    ? selected.combo_items.some(i => PROFILE_LINK_COMPONENTS.has(i.component as ComboComponent))
    : false
  const needsPost = selected
    ? selected.combo_items.some(i => !PROFILE_LINK_COMPONENTS.has(i.component as ComboComponent))
    : false

  const price = selected ? comboPrice(selected) : 0
  const hasEnoughBalance = (balance ?? 0) >= price

  const linksValid =
    (!needsProfile || isUrl(profileLink)) &&
    (!needsPost || isUrl(postLink))

  const canPlace = !!selected && hasEnoughBalance && linksValid && !isPending

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  const handlePlace = async () => {
    if (!selected) return
    if (needsProfile && !isUrl(profileLink)) { toast.error('Enter a valid profile link.'); return }
    if (needsPost && !isUrl(postLink)) { toast.error('Enter a valid post link.'); return }
    if (!hasEnoughBalance) { toast.error('Insufficient balance. Please add funds.'); return }

    try {
      const result = await placeCombo({
        combo_id: selected.id,
        ...(needsProfile && { profile_link: profileLink }),
        ...(needsPost && { post_link: postLink }),
      })
      setProfileLink('')
      setPostLink('')
      setSelectedId(null)
      setSuccessData(result)
      if (closeTimer.current) clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(() => {
        setSuccessData(null)
        navigate('/orders')
      }, 4500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to place combo order')
    }
  }

  return (
    <DashboardLayout title="Algorithm Booster">
      <div className="max-w-screen-xl space-y-5">
          {/* Hero */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-500/15 to-brand-600/5 border border-brand-500/20 p-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                <Rocket className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Boost the Algorithm</h2>
                <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">
                  One package delivers followers, views, likes, shares & saves together —
                  the balanced signal platforms reward. Pick a tier, drop your link, done.
                </p>
              </div>
            </div>
          </div>

          {/* Platform toggle */}
          <div className="flex gap-2">
            {PLATFORMS.map(p => (
              <button
                key={p.key}
                onClick={() => setPlatform(p.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
                  platform === p.key
                    ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                    : 'bg-navy-700/50 text-gray-400 border border-navy-500/30 hover:text-gray-200'
                )}
              >
                <span className="text-base">{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>

          {/* Tier cards */}
          {isLoading ? (
            <TableSkeleton rows={3} />
          ) : !combos || combos.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center text-center py-12 text-gray-500">
                <Sparkles className="w-8 h-8 mb-2 text-gray-600" />
                <p className="text-sm font-medium text-gray-400">No boosters available yet</p>
                <p className="text-xs mt-1">Check back soon — new packages are on the way.</p>
              </div>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {combos.map(combo => {
                const active = combo.id === selectedId
                const lines = comboLines(combo)
                return (
                  <button
                    key={combo.id}
                    onClick={() => setSelectedId(combo.id)}
                    className={cn(
                      'text-left rounded-2xl p-5 border transition-all',
                      active
                        ? 'bg-brand-500/10 border-brand-500/40 ring-1 ring-brand-500/30'
                        : 'bg-navy-800/60 border-navy-500/30 hover:border-brand-500/25'
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                        <Zap className={cn('w-4 h-4', active ? 'text-brand-400' : 'text-gray-500')} />
                        {combo.name}
                      </span>
                      {active && <CheckCircle className="w-5 h-5 text-brand-400" />}
                    </div>

                    {combo.description && (
                      <p className="text-xs text-gray-400 mb-3 line-clamp-2">{combo.description}</p>
                    )}

                    <ul className="space-y-1.5 mb-4">
                      {lines.map(line => (
                        <li key={line.component} className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">{COMBO_COMPONENT_LABELS[line.component]}</span>
                          <span className="text-white font-medium">{formatNumber(line.quantity)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="pt-3 border-t border-navy-500/30 flex items-baseline justify-between">
                      <span className="text-xs text-gray-500">Total</span>
                      <span className="text-lg font-bold text-white">{formatCurrency(comboPrice(combo))}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
      </div>

      {/* ── Checkout: bottom-sheet on mobile, centered dialog on desktop ── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="checkout-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setSelectedId(null)}
            />
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className="w-full sm:max-w-md pointer-events-auto"
              >
                <Card className="rounded-b-none sm:rounded-2xl max-h-[88vh] overflow-y-auto">
                  {/* Grab handle (mobile bottom-sheet affordance) */}
                  <div className="sm:hidden flex justify-center -mt-2 mb-3">
                    <span className="h-1 w-10 rounded-full bg-navy-500/70" />
                  </div>

                  <div className="flex items-center gap-3 pb-4 mb-4 border-b border-navy-500/40">
                    <div className="w-10 h-10 rounded-xl bg-navy-600 flex items-center justify-center text-xl">
                      {PLATFORMS.find(p => p.key === platform)?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 font-medium capitalize">{platform} Booster</p>
                      <p className="text-sm font-semibold text-white leading-tight truncate">{selected.name}</p>
                    </div>
                    <button
                      onClick={() => setSelectedId(null)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-navy-600 transition-colors flex-shrink-0"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {needsProfile && (
                      <Input
                        label="Profile link"
                        type="url"
                        placeholder="https://instagram.com/yourhandle"
                        leftElement={<User className="w-4 h-4" />}
                        hint="Where followers are delivered"
                        value={profileLink}
                        onChange={e => setProfileLink(e.target.value)}
                      />
                    )}
                    {needsPost && (
                      <Input
                        label="Post link"
                        type="url"
                        placeholder="https://instagram.com/p/yourpost"
                        leftElement={<Link2 className="w-4 h-4" />}
                        hint="Where likes, views, shares & saves go"
                        value={postLink}
                        onChange={e => setPostLink(e.target.value)}
                      />
                    )}

                    {/* Charge summary */}
                    <div className="rounded-xl bg-navy-700/60 p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Charge</span>
                        <span className="text-lg font-bold text-white">{formatCurrency(price)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Your Balance</span>
                        <span className="text-xs font-medium text-gray-300">{formatCurrency(balance ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">After Order</span>
                        <span className={cn('text-xs font-medium', hasEnoughBalance ? 'text-green-400' : 'text-red-400')}>
                          {formatCurrency(Math.max(0, (balance ?? 0) - price))}
                        </span>
                      </div>
                    </div>

                    {!hasEnoughBalance && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-xs text-red-400">
                          Insufficient balance.{' '}
                          <a href="/funds" className="underline font-medium">Add funds</a>
                        </p>
                      </div>
                    )}

                    {hasEnoughBalance && linksValid && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <p className="text-xs text-green-400">Ready to launch your booster</p>
                      </div>
                    )}

                    <Button
                      type="button"
                      className="w-full"
                      size="lg"
                      isLoading={isPending}
                      leftIcon={<Rocket className="w-4 h-4" />}
                      disabled={!canPlace}
                      onClick={handlePlace}
                    >
                      Launch Booster — {formatCurrency(price)}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Success modal ── */}
      <AnimatePresence>
        {successData && (
          <>
            <motion.div
              key="success-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => { setSuccessData(null); navigate('/orders') }}
            />
            <motion.div
              key="success-modal"
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none px-4"
            >
              <div className="glass-card rounded-2xl p-8 w-full max-w-sm text-center pointer-events-auto shadow-brand-lg">
                <button
                  onClick={() => { setSuccessData(null); navigate('/orders') }}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-navy-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-brand-500/15 border-2 border-brand-500/40 flex items-center justify-center mx-auto mb-6"
                >
                  <Rocket className="w-9 h-9 text-brand-400" />
                </motion.div>

                <h2 className="text-xl font-bold text-white mb-1">Booster Launched!</h2>
                <p className="text-sm text-gray-400 mb-6">Your services are now being delivered together.</p>

                <div className="space-y-2 text-left">
                  {(successData.results || []).map(r => (
                    <div key={r.component} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-navy-700/60">
                      <span className="text-xs text-gray-300 font-medium capitalize">{r.component}</span>
                      {r.status === 'processing' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 h-1 bg-navy-600 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-500 rounded-full"
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 4.5, ease: 'linear' }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-2">Taking you to your orders…</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}
