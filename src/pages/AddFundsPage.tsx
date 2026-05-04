import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Wallet, CreditCard, ArrowUpRight, Clock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { useBalance } from '@/hooks/useBalance'
import { useTransactions } from '@/hooks/useTransactions'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { TableSkeleton } from '@/components/ui/Skeleton'
import type { TransactionType } from '@/types/database.types'

const KORAPAY_PUBLIC_KEY = import.meta.env.VITE_KORAPAY_PUBLIC_KEY as string

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  deposit: 'Deposit',
  order_charge: 'Order',
  refund: 'Refund',
  admin_adjustment: 'Adjustment',
  merchant_commission: 'Commission',
}

const TX_TYPE_VARIANTS: Record<TransactionType, 'success' | 'error' | 'info' | 'brand'> = {
  deposit: 'success',
  order_charge: 'error',
  refund: 'info',
  admin_adjustment: 'brand',
  merchant_commission: 'success',
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000]

function generateRef(userId?: string) {
  return `flx_${Date.now()}_${userId?.slice(0, 8) ?? 'guest'}`
}

declare global {
  interface Window {
    Korapay?: { initialize: (config: Record<string, unknown>) => void }
  }
}

export function AddFundsPage() {
  const { profile } = useAuth()
  const { data: balance, isLoading: balanceLoading } = useBalance()
  const { data: txData, isLoading: txLoading } = useTransactions()
  const [amount, setAmount] = useState(1000)
  const [txPage, setTxPage] = useState(1)
  const [isPaying, setIsPaying] = useState(false)
  const txRef = useRef(generateRef(profile?.id))
  const qc = useQueryClient()

  const pollBalance = useCallback((previousBalance: number) => {
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      await qc.invalidateQueries({ queryKey: ['balance'] })
      await qc.invalidateQueries({ queryKey: ['transactions'] })
      const current = qc.getQueryData<number>(['balance', profile?.id])
      if ((current ?? 0) > previousBalance || attempts >= 10) {
        clearInterval(interval)
        if ((current ?? 0) > previousBalance) {
          toast.success('Balance updated!', { duration: 3000 })
        }
      }
    }, 3000)
  }, [qc, profile?.id])

  const handlePay = async () => {
    if (!KORAPAY_PUBLIC_KEY) {
      toast.error('Korapay is not configured yet. Contact support.')
      return
    }
    if (amount < 500) {
      toast.error('Minimum deposit amount is ₦500')
      return
    }
    const korapay = window.Korapay
    if (!korapay) {
      toast.error('Payment system failed to load. Please refresh the page and try again.')
      return
    }

    setIsPaying(true)
    const ref = txRef.current

    // Pre-create a pending deposit record so the server-side webhook can process it
    // as a backup if the browser-side verify-payment call fails (e.g. tab closed).
    const { error: depositError } = await supabase.from('deposit_requests').insert({
      user_id: profile!.id,
      amount,
      method: 'korapay',
      flw_tx_ref: ref,
      status: 'pending',
    })
    if (depositError) {
      // Non-fatal: verify-payment will create the record on success if this failed.
      console.error('Pre-create deposit failed:', depositError)
    }

    korapay.initialize({
      key: KORAPAY_PUBLIC_KEY,
      reference: ref,
      amount: amount,
      currency: 'NGN',
      notification_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/korapay-webhook`,
      customer: {
        name: profile?.full_name || profile?.email || '',
        email: profile?.email || '',
      },
      onSuccess: async (data: { reference?: string }) => {
        setIsPaying(false)
        const paymentRef = data?.reference || ref
        const balanceBefore = qc.getQueryData<number>(['balance', profile?.id]) ?? 0
        toast.loading('Payment received! Crediting your balance…', { id: 'crediting' })

        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${(await import('@/lib/supabase').then(m => m.supabase.auth.getSession())).data.session?.access_token}`,
              },
              body: JSON.stringify({ reference: paymentRef, amount }),
            }
          )
          const result = await res.json()

          if (res.ok) {
            toast.dismiss('crediting')
            toast.success(`Balance credited! New balance: ₦${result.new_balance?.toLocaleString() ?? ''}`, { duration: 6000 })
            await qc.invalidateQueries({ queryKey: ['balance'] })
            await qc.invalidateQueries({ queryKey: ['transactions'] })
          } else {
            toast.dismiss('crediting')
            toast.error('Payment verified but crediting failed: ' + result.error)
          }
        } catch (err) {
          toast.dismiss('crediting')
          console.error('verify-payment error:', err)
          pollBalance(balanceBefore)
        }

        txRef.current = generateRef(profile?.id)
      },
      onClose: () => {
        setIsPaying(false)
      },
      onFailed: (data: { reference?: string }) => {
        setIsPaying(false)
        toast.error('Payment failed. Please try again. Ref: ' + (data?.reference || ref))
      },
    })
  }

  const totalTxPages = txData ? Math.ceil(txData.total / 20) : 0

  return (
    <DashboardLayout title="Add Funds">
      <div className="max-w-screen-lg space-y-6">
        {/* Balance hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-8 text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-radial from-brand-500/5 to-transparent pointer-events-none" />
          <Wallet className="w-10 h-10 text-brand-400 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-medium">Available Balance</p>
          {balanceLoading ? (
            <div className="h-12 w-40 bg-navy-600 rounded-xl animate-pulse mx-auto mt-2" />
          ) : (
            <p className="text-5xl font-bold text-white mt-2 tabular-nums">{formatCurrency(balance ?? 0)}</p>
          )}
        </motion.div>

        {/* Add funds panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Korapay */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Korapay</h3>
                  <p className="text-xs text-gray-400">Cards, Bank Transfer, USSD</p>
                </div>
                <Badge variant="success" className="ml-auto">Instant</Badge>
              </div>

              <p className="text-xs text-gray-400 font-medium mb-2">Select amount (NGN)</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {PRESET_AMOUNTS.map(a => (
                  <button
                    key={a}
                    onClick={() => setAmount(a)}
                    className={`py-2 rounded-xl text-sm font-semibold transition-all ${
                      amount === a
                        ? 'bg-brand-500 !text-white shadow-brand'
                        : 'bg-navy-700 text-gray-300 hover:bg-navy-600 border border-navy-500'
                    }`}
                  >
                    ₦{a.toLocaleString()}
                  </button>
                ))}
              </div>

              <Input
                label="Custom Amount (₦)"
                type="number"
                min={500}
                value={amount}
                onChange={e => setAmount(Number(e.target.value))}
                hint="Minimum ₦500"
              />

              <Button
                className="w-full mt-4"
                size="lg"
                onClick={handlePay}
                isLoading={isPaying}
                leftIcon={<ArrowUpRight className="w-4 h-4" />}
              >
                Pay {formatCurrency(amount)} with Korapay
              </Button>
            </Card>
          </motion.div>

          {/* Info panel */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="h-full">
              <h3 className="text-base font-semibold text-white mb-4">Payment Info</h3>
              <div className="space-y-4">
                {[
                  { icon: '⚡', title: 'Instant Credit', desc: 'Korapay payments are credited automatically after confirmation.' },
                  { icon: '🔒', title: 'Secure Payments', desc: 'All transactions are encrypted and processed securely.' },
                  { icon: '💳', title: 'Multiple Methods', desc: 'Pay with debit/credit cards, USSD, or bank transfer.' },
                  { icon: '🇳🇬', title: 'Nigerian Payments', desc: 'Optimised for Nigerian banks and payment methods.' },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Transaction history */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-gray-400" />
            <h3 className="text-base font-semibold text-white">Transaction History</h3>
          </div>

          {txLoading ? (
            <TableSkeleton rows={5} />
          ) : !txData?.transactions?.length ? (
            <p className="text-center py-8 text-gray-500 text-sm">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {txData.transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-navy-700/30 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm
                    ${tx.amount > 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {tx.amount > 0 ? '+' : '−'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">{tx.description || TX_TYPE_LABELS[tx.type]}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(tx.created_at)}</p>
                  </div>
                  <Badge variant={TX_TYPE_VARIANTS[tx.type]}>
                    {TX_TYPE_LABELS[tx.type]}
                  </Badge>
                  <div className="text-right">
                    <p className={`text-sm font-bold tabular-nums ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                    </p>
                    <p className="text-xs text-gray-500">{formatCurrency(tx.balance_after)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalTxPages > 1 && (
            <div className="mt-4">
              <Pagination page={txPage} totalPages={totalTxPages} onPageChange={setTxPage} />
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  )
}
