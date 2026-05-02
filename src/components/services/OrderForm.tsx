import { useEffect, useState, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link2, Hash, DollarSign, AlertCircle, CheckCircle, Repeat, ChevronDown, MessageSquare, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import type { ServiceWithCategory, PlaceOrderResponse } from '@/types'
import { useBalance } from '@/hooks/useBalance'
import { usePlaceOrder } from '@/hooks/useOrders'
import { formatCurrency, formatNumber, calculateOrderCharge, getPlatformIcon } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

function isCustomComments(type: string | null | undefined): boolean {
  return !!type && type.toLowerCase().includes('comment')
}

interface OrderFormProps {
  service: ServiceWithCategory
  onOrderPlaced?: () => void
}

const INTERVAL_OPTIONS = [
  { label: '1 hour', value: 1 },
  { label: '6 hours', value: 6 },
  { label: '12 hours', value: 12 },
  { label: '1 day', value: 24 },
  { label: '2 days', value: 48 },
  { label: '3 days', value: 72 },
  { label: '1 week', value: 168 },
]

export function OrderForm({ service, onOrderPlaced }: OrderFormProps) {
  const { data: balance } = useBalance()
  const { mutateAsync: placeOrder, isPending } = usePlaceOrder()
  const [isDripFeed, setIsDripFeed] = useState(false)
  const [comments, setComments] = useState('')
  const [successData, setSuccessData] = useState<PlaceOrderResponse | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const customComments = isCustomComments(service.type)

  const commentLines = useMemo(
    () => comments.split('\n').map(l => l.trim()).filter(Boolean),
    [comments]
  )
  const commentCount = commentLines.length

  const schema = z.object({
    link: z.string().url('Please enter a valid URL'),
    quantity: customComments
      ? z.number().optional()
      : z.number()
          .int('Must be a whole number')
          .min(service.min_quantity, `Minimum quantity is ${service.min_quantity}`)
          .max(service.max_quantity, `Maximum quantity is ${service.max_quantity}`),
    drip_quantity: z.number().int().min(service.min_quantity).optional(),
    drip_interval: z.number().int().min(1).optional(),
  })
  type FormData = z.infer<typeof schema>

  const { register, watch, handleSubmit, setValue, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantity: service.min_quantity,
      drip_quantity: service.min_quantity,
      drip_interval: 24,
    },
  })

  useEffect(() => {
    reset({
      link: '',
      quantity: service.min_quantity,
      drip_quantity: service.min_quantity,
      drip_interval: 24,
    })
    setIsDripFeed(false)
    setComments('')
  }, [service.id, reset, service.min_quantity])

  const quantity = customComments ? commentCount : (watch('quantity') || 0)
  const dripQuantity = watch('drip_quantity') || service.min_quantity
  const dripInterval = watch('drip_interval') || 24

  const charge = calculateOrderCharge(Number(quantity), service.rate)
  const hasEnoughBalance = (balance ?? 0) >= charge

  const commentCountError = customComments && commentCount > 0 && (
    commentCount < service.min_quantity
      ? `Minimum ${service.min_quantity} comments required`
      : commentCount > service.max_quantity
        ? `Maximum ${service.max_quantity} comments allowed`
        : null
  )

  const dripRuns = isDripFeed && dripQuantity > 0
    ? Math.ceil(quantity / dripQuantity)
    : 0

  const dripDuration = isDripFeed && dripRuns > 1
    ? dripRuns * dripInterval
    : 0

  const formatDuration = (hours: number) => {
    if (hours < 24) return `${hours}h`
    const days = Math.round(hours / 24)
    return days === 1 ? '1 day' : `${days} days`
  }

  const onSubmit = async (data: FormData) => {
    if (customComments) {
      if (commentCount === 0) { toast.error('Please enter at least one comment.'); return }
      if (commentCount < service.min_quantity) { toast.error(`Minimum ${service.min_quantity} comments required.`); return }
      if (commentCount > service.max_quantity) { toast.error(`Maximum ${service.max_quantity} comments allowed.`); return }
    }
    if (!hasEnoughBalance) { toast.error('Insufficient balance. Please add funds.'); return }
    if (isDripFeed && (!data.drip_quantity || !data.drip_interval)) { toast.error('Please fill in Organix settings.'); return }
    if (isDripFeed && data.drip_quantity! > quantity) { toast.error('Quantity per run cannot exceed total quantity.'); return }

    try {
      const result = await placeOrder({
        service_id: service.id,
        link: data.link,
        quantity,
        ...(customComments && { comments: commentLines.join('\n') }),
        ...(isDripFeed && {
          is_drip_feed: true,
          drip_quantity: data.drip_quantity,
          drip_interval: data.drip_interval,
        }),
      })
      reset({ link: '', quantity: service.min_quantity, drip_quantity: service.min_quantity, drip_interval: 24 })
      setComments('')
      setIsDripFeed(false)
      setSuccessData(result)
      if (closeTimer.current) clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(() => {
        setSuccessData(null)
        onOrderPlaced?.()
      }, 3500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to place order')
    }
  }

  const platformIcon = service.categories?.icon || getPlatformIcon(service.name)

  return (
    <motion.div
      key={service.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card>
        {/* Service summary */}
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-navy-500/40">
          <div className="w-10 h-10 rounded-xl bg-navy-600 flex items-center justify-center text-xl">
            {platformIcon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium">{service.categories?.name || 'Service'}</p>
            <p className="text-sm font-semibold text-white leading-tight truncate">{service.name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Link"
            type="url"
            placeholder="https://instagram.com/p/yourpost"
            leftElement={<Link2 className="w-4 h-4" />}
            error={errors.link?.message}
            {...register('link')}
          />

          {customComments ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-400">
                Comments <span className="text-gray-600 font-normal">— one per line</span>
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                <textarea
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder={"Great post!\nLove this!\nAmazing content!"}
                  rows={6}
                  className="input-field pl-9 resize-none"
                />
              </div>
              <div className="flex justify-between px-1">
                <span className={`text-xs ${commentCountError ? 'text-red-400' : 'text-gray-500'}`}>
                  {commentCountError || `${commentCount} comment${commentCount !== 1 ? 's' : ''} entered`}
                </span>
                <span className="text-xs text-gray-500">
                  Min {formatNumber(service.min_quantity)} — Max {formatNumber(service.max_quantity)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                label="Quantity"
                type="number"
                leftElement={<Hash className="w-4 h-4" />}
                hint={`Min: ${formatNumber(service.min_quantity)} — Max: ${formatNumber(service.max_quantity)}`}
                error={errors.quantity?.message}
                {...register('quantity', { valueAsNumber: true })}
              />
              <div className="flex justify-between px-1">
                <span className="text-xs text-gray-500">
                  Rate: {formatCurrency(service.rate)}/1K
                </span>
                <button
                  type="button"
                  onClick={() => setValue('quantity', service.max_quantity)}
                  className="text-xs text-brand-400"
                >
                  Max ({formatNumber(service.max_quantity)})
                </button>
              </div>
            </div>
          )}

          {/* Drip Feed Toggle */}
          <div className="rounded-xl bg-navy-700/40 border border-navy-500/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsDripFeed(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-navy-700/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-medium text-white">Organix</span>
                <span className="text-xs text-gray-500">Spread delivery over time</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-9 h-5 rounded-full transition-colors relative ${isDripFeed ? 'bg-brand-500' : 'bg-navy-500'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDripFeed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>
            </button>

            {isDripFeed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pb-4 space-y-3 border-t border-navy-500/30"
              >
                <div className="pt-3">
                  <Input
                    label="Quantity per run"
                    type="number"
                    hint={`Min ${formatNumber(service.min_quantity)} per run`}
                    error={errors.drip_quantity?.message}
                    {...register('drip_quantity', { valueAsNumber: true })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Interval between runs</label>
                  <div className="relative">
                    <select
                      className="input-field w-full appearance-none pr-8"
                      {...register('drip_interval', { valueAsNumber: true })}
                    >
                      {INTERVAL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {dripRuns > 0 && (
                  <div className="rounded-lg bg-brand-500/10 border border-brand-500/20 p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Runs</span>
                      <span className="text-white font-medium">{dripRuns} runs × {formatNumber(dripQuantity)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Interval</span>
                      <span className="text-white font-medium">Every {INTERVAL_OPTIONS.find(o => o.value === dripInterval)?.label || `${dripInterval}h`}</span>
                    </div>
                    {dripRuns > 1 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Total duration</span>
                        <span className="text-brand-400 font-medium">~{formatDuration(dripDuration)}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Price preview */}
          <div className="rounded-xl bg-navy-700/60 p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Charge</span>
              <span className="text-lg font-bold text-white">
                {formatCurrency(isNaN(charge) ? 0 : charge)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Your Balance</span>
              <span className="text-xs font-medium text-gray-300">
                {formatCurrency(balance ?? 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">After Order</span>
              <span className={`text-xs font-medium ${hasEnoughBalance ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(Math.max(0, (balance ?? 0) - (isNaN(charge) ? 0 : charge)))}
              </span>
            </div>
          </div>

          {!hasEnoughBalance && quantity > 0 && !isNaN(charge) && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">
                Insufficient balance.{' '}
                <a href="/funds" className="underline font-medium">Add funds</a>
              </p>
            </div>
          )}

          {hasEnoughBalance && quantity >= service.min_quantity && !isNaN(charge) && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-xs text-green-400">
                {isDripFeed
                  ? `Ready — ${dripRuns} Organix run${dripRuns !== 1 ? 's' : ''} scheduled`
                  : 'Ready to place order'
                }
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isPending}
            leftIcon={isDripFeed ? <Repeat className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
            disabled={!hasEnoughBalance}
          >
            {isDripFeed ? 'Start Organix' : 'Place Order'} — {formatCurrency(isNaN(charge) ? 0 : charge)}
          </Button>
        </form>
      </Card>
      {/* ── Purchase Success Modal ───────────────────────── */}
      <AnimatePresence>
        {successData && (
          <>
            {/* Backdrop */}
            <motion.div
              key="success-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => { setSuccessData(null); onOrderPlaced?.() }}
            />

            {/* Modal */}
            <motion.div
              key="success-modal"
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none px-4"
            >
              <div className="glass-card rounded-2xl p-8 w-full max-w-sm text-center pointer-events-auto shadow-brand-lg">
                {/* Close */}
                <button
                  onClick={() => { setSuccessData(null); onOrderPlaced?.() }}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-navy-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Animated checkmark circle */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-brand-500/15 border-2 border-brand-500/40 flex items-center justify-center mx-auto mb-6"
                >
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.3 }}
                  >
                    <CheckCircle className="w-10 h-10 text-brand-400" />
                  </motion.div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h2 className="text-xl font-bold text-white mb-1">Purchase Successful!</h2>
                  <p className="text-sm text-gray-400 mb-6">Your order has been placed and is now being processed.</p>

                  <div className="space-y-2 text-left">
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-navy-700/60">
                      <span className="text-xs text-gray-500 font-medium">Order ID</span>
                      <span className="text-xs font-mono text-gray-200">
                        {successData.order_id ? successData.order_id.slice(0, 8).toUpperCase() + '...' : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-navy-700/60">
                      <span className="text-xs text-gray-500 font-medium">Status</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-yellow-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                        Pending
                      </span>
                    </div>
                  </div>

                  {/* Auto-close progress bar */}
                  <div className="mt-6 h-1 bg-navy-600 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-brand-500 rounded-full"
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: 3.5, ease: 'linear' }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">Closing automatically…</p>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
