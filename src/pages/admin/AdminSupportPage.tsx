import { useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Clock, CheckCircle, AlertCircle, Send } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime } from '@/lib/utils'
import { useAdminTickets, useReplyTicket, CATEGORY_LABELS, STATUS_LABELS } from '@/hooks/useSupport'
import type { SupportTicket } from '@/hooks/useSupport'

const STATUS_FILTERS = ['all', 'open', 'in_progress', 'resolved'] as const

const STATUS_CONFIG = {
  open: { icon: AlertCircle, color: 'text-yellow-400' },
  in_progress: { icon: Clock, color: 'text-brand-400' },
  resolved: { icon: CheckCircle, color: 'text-green-400' },
}

export function AdminSupportPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null)
  const [reply, setReply] = useState('')
  const [newStatus, setNewStatus] = useState('in_progress')

  const { data: tickets, isLoading } = useAdminTickets(statusFilter)
  const { mutateAsync: replyTicket, isPending } = useReplyTicket()

  const openCount = tickets?.filter(t => t.status === 'open').length ?? 0

  const handleReply = async () => {
    if (!activeTicket || !reply.trim()) return
    try {
      await replyTicket({ id: activeTicket.id, reply: reply.trim(), status: newStatus })
      toast.success('Reply sent!')
      setActiveTicket(null)
      setReply('')
    } catch {
      toast.error('Failed to send reply.')
    }
  }

  return (
    <DashboardLayout title="Support Tickets">
      <div className="max-w-screen-xl space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Open', value: tickets?.filter(t => t.status === 'open').length ?? 0, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
            { label: 'In Progress', value: tickets?.filter(t => t.status === 'in_progress').length ?? 0, color: 'text-brand-400', bg: 'bg-brand-500/10' },
            { label: 'Resolved', value: tickets?.filter(t => t.status === 'resolved').length ?? 0, color: 'text-green-400', bg: 'bg-green-500/10' },
          ].map(s => (
            <Card key={s.label} padding="sm">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-brand-500 !text-white'
                  : 'bg-navy-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
              {s === 'open' && openCount > 0 && (
                <span className="ml-1.5 bg-yellow-500 text-black text-[10px] font-bold rounded-full px-1.5 py-0.5">{openCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tickets table */}
        <Card padding="none">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-navy-700/40 animate-pulse" />)}
            </div>
          ) : !tickets?.length ? (
            <div className="text-center py-14 text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-sm">No tickets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-500/40">
                    {['User', 'Subject', 'Category', 'Status', 'Date', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-500/20">
                  {tickets.map((ticket, i) => {
                    const cfg = STATUS_CONFIG[ticket.status]
                    const Icon = cfg.icon
                    return (
                      <motion.tr
                        key={ticket.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-navy-700/30 transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <p className="text-sm text-white font-medium">{ticket.profiles?.full_name || '—'}</p>
                          <p className="text-xs text-gray-500">{ticket.profiles?.email}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm text-white max-w-[200px] truncate">{ticket.subject}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-gray-400">{CATEGORY_LABELS[ticket.category]}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                            <span className={`text-xs font-medium ${cfg.color}`}>{STATUS_LABELS[ticket.status]}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs text-gray-400">{formatDateTime(ticket.created_at)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => { setActiveTicket(ticket); setReply(ticket.admin_reply || ''); setNewStatus(ticket.status === 'open' ? 'in_progress' : ticket.status) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500/15 text-brand-400 hover:bg-brand-500/25 transition-colors"
                          >
                            {ticket.admin_reply ? 'View / Edit' : 'Reply'}
                          </button>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Reply modal */}
      <Modal
        isOpen={!!activeTicket}
        onClose={() => setActiveTicket(null)}
        title="Ticket Details"
        size="lg"
      >
        {activeTicket && (
          <div className="space-y-4">
            {/* Ticket info */}
            <div className="grid grid-cols-2 gap-3">
              {[
                ['From', activeTicket.profiles?.full_name || activeTicket.profiles?.email || '—'],
                ['Category', CATEGORY_LABELS[activeTicket.category]],
                ['Subject', activeTicket.subject],
                ['Submitted', formatDateTime(activeTicket.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="bg-navy-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-sm text-white font-medium">{value}</p>
                </div>
              ))}
            </div>

            {/* User message */}
            <div className="bg-navy-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">User Message</p>
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{activeTicket.message}</p>
            </div>

            {/* Reply textarea */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-300">Your Reply</label>
              <textarea
                rows={5}
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Type your reply to the user..."
                className="input-field resize-none w-full"
              />
            </div>

            {/* Status selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-400 flex-shrink-0">Set status:</label>
              <div className="flex gap-2">
                {(['open', 'in_progress', 'resolved'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setNewStatus(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      newStatus === s ? 'bg-brand-500 !text-white' : 'bg-navy-700 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleReply}
              isLoading={isPending}
              disabled={!reply.trim()}
              leftIcon={<Send className="w-4 h-4" />}
              className="w-full"
            >
              Send Reply
            </Button>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
