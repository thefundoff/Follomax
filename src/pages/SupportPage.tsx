import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, ChevronDown, Send, ChevronUp, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDateTime } from '@/lib/utils'
import { useMyTickets, useCreateTicket, CATEGORY_LABELS, STATUS_LABELS, useHasUnreadReply } from '@/hooks/useSupport'
import type { SupportTicket } from '@/hooks/useSupport'
import { useOrders } from '@/hooks/useOrders'

const noScript = (val: string) => !/<|>|javascript:|on\w+\s*=|script/i.test(val)

const schema = z.object({
  subject: z.string().min(5, 'Subject too short').max(120, 'Subject too long').refine(noScript, 'Invalid input'),
  category: z.enum(['order_issue', 'payment_issue', 'technical', 'other']),
  order_id: z.string().optional(),
  message: z.string().min(20, 'Please describe your issue in more detail').max(2000).refine(noScript, 'Invalid input'),
})
type FormData = z.infer<typeof schema>

const STATUS_CONFIG = {
  open: { icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  in_progress: { icon: Clock, color: 'text-brand-400', bg: 'bg-brand-500/10 border-brand-500/20' },
  resolved: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[ticket.status]
  const Icon = cfg.icon

  return (
    <div className={`rounded-xl border ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{ticket.subject}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {CATEGORY_LABELS[ticket.category]} · {formatDateTime(ticket.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-medium ${cfg.color}`}>{STATUS_LABELS[ticket.status]}</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/5"
          >
            <div className="px-4 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Your Message</p>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{ticket.message}</p>
              </div>

              {ticket.admin_reply ? (
                <div className="rounded-xl bg-navy-700/60 p-4">
                  <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-1.5">Support Reply</p>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{ticket.admin_reply}</p>
                  {ticket.replied_at && (
                    <p className="text-xs text-gray-500 mt-2">{formatDateTime(ticket.replied_at)}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-navy-700/40 p-3 text-center">
                  <p className="text-xs text-gray-500">Awaiting reply from our support team</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SupportPage() {
  const { data: tickets, isLoading } = useMyTickets()
  const { mutateAsync: createTicket } = useCreateTicket()
  const { data: ordersData } = useOrders({ status: 'all', search: '', page: 1 })
  const { refetch: refetchUnread } = useHasUnreadReply()

  // Clear the green dot as soon as the user opens this page
  useEffect(() => {
    localStorage.setItem('support_last_viewed', new Date().toISOString())
    refetchUnread()
  }, [refetchUnread])
  const [submitted, setSubmitted] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'order_issue' },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await createTicket({ ...data, order_id: data.order_id || null })
      toast.success('Ticket submitted! We\'ll get back to you soon.')
      reset()
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 4000)
    } catch {
      toast.error('Failed to submit ticket. Please try again.')
    }
  }

  return (
    <DashboardLayout title="Support">
      <div className="max-w-screen-lg space-y-6">

        {/* Submit new ticket */}
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Submit a Support Ticket</h2>
              <p className="text-xs text-gray-500">We typically reply within 24 hours</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-8 text-center"
              >
                <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mb-3">
                  <CheckCircle className="w-7 h-7 text-green-400" />
                </div>
                <p className="text-white font-semibold">Ticket Submitted!</p>
                <p className="text-sm text-gray-400 mt-1">Our team will review and reply shortly.</p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Subject"
                    type="text"
                    placeholder="Brief description of your issue"
                    error={errors.subject?.message}
                    {...register('subject')}
                  />

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-300">Category</label>
                    <div className="relative">
                      <select
                        className="input-field w-full appearance-none pr-8"
                        {...register('category')}
                      >
                        <option value="order_issue">Order Issue</option>
                        <option value="payment_issue">Payment Issue</option>
                        <option value="technical">Technical Issue</option>
                        <option value="other">Other</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-300">
                    Related Order <span className="text-gray-500 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <select className="input-field w-full appearance-none pr-8" {...register('order_id')}>
                      <option value="">— Not related to a specific order —</option>
                      {ordersData?.orders?.map(o => (
                        <option key={o.id} value={o.id}>
                          #{o.id.slice(0, 8).toUpperCase()} · {o.services?.name || 'Unknown'} · {o.status}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-300">Message</label>
                  <textarea
                    rows={5}
                    placeholder="Describe your issue in detail — the more context you give, the faster we can help."
                    className="input-field resize-none w-full"
                    {...register('message')}
                  />
                  {errors.message && <p className="text-red-400 text-xs">{errors.message.message}</p>}
                </div>

                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  leftIcon={<Send className="w-4 h-4" />}
                >
                  Submit Ticket
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </Card>

        {/* Past tickets */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Your Tickets</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-navy-700/40 animate-pulse" />)}
            </div>
          ) : !tickets?.length ? (
            <Card>
              <div className="text-center py-10 text-gray-500">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p className="text-sm">No tickets yet. Submit one above if you need help.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  )
}
