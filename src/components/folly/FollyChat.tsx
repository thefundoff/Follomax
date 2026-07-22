import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, X, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { follySend, follyPlace, type FollyPending } from '@/hooks/useFollyChat'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  pending?: FollyPending | null
  resolved?: boolean // pending confirmed/cancelled
}

const uid = () => Math.random().toString(36).slice(2)

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: "Hi! I'm Folly 🤖 — ask me anything. Try “what Instagram services do you have?”, “send 1000 likes to <link>”, or “what's my balance?”.",
}

export function FollyChat() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState('NGN')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const history = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role === 'assistant' ? ('model' as const) : ('user' as const), text: m.text }))
    setMessages((m) => [...m, { id: uid(), role: 'user', text }])
    setLoading(true)
    try {
      const res = await follySend(text, history)
      if (res.currency) setCurrency(res.currency)
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: res.reply, pending: res.pending }])
    } catch {
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: '😕 I could not reach the server. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const confirm = async (msgId: string, pending: FollyPending) => {
    setLoading(true)
    try {
      const res = await follyPlace(pending)
      setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: true } : x)))
      if (res.ok) {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: `✅ Order placed! #${res.order_id?.slice(0, 8)} — now processing.\nNew balance: ${res.balance?.toFixed(2)} ${res.currency ?? currency}` }])
        qc.invalidateQueries({ queryKey: ['profile'] })
        qc.invalidateQueries({ queryKey: ['balance'] })
        qc.invalidateQueries({ queryKey: ['orders'] })
        qc.invalidateQueries({ queryKey: ['transactions'] })
      } else if (res.code === 'insufficient_balance') {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: '⚠️ Your balance is too low for that order. Add funds and try again.' }])
      } else {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: `⚠️ Could not place that order: ${res.error}. You were not charged.` }])
      }
    } catch {
      toast.error('Failed to place order')
    } finally {
      setLoading(false)
    }
  }

  const cancel = (msgId: string) => {
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, resolved: true } : x)))
    setMessages((m) => [...m, { id: uid(), role: 'assistant', text: 'No problem — cancelled. Anything else? 👍' }])
  }

  return (
    <>
      {/* Launcher — stacked above the WhatsApp support button (which sits at bottom-5) */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full bg-gradient-brand shadow-brand flex items-center justify-center text-white hover:scale-105 transition-transform"
        aria-label="Chat with Folly"
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-40 right-5 z-50 w-[370px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[68vh] flex flex-col rounded-2xl bg-navy-800 border border-navy-500/50 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-500/50 bg-navy-800">
              <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Folly</p>
                <p className="text-xs text-gray-400">Your Follomax assistant</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-navy-700 text-gray-100'}`}>
                    {m.text}
                    {m.pending && !m.resolved && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-gray-300 mb-2">
                          {m.pending.quantity.toLocaleString()} × {m.pending.service_name} — {m.pending.charge.toFixed(2)} {currency}
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => confirm(m.id, m.pending!)} disabled={loading} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium py-1.5 disabled:opacity-50">
                            <Check className="w-3.5 h-3.5" /> Confirm
                          </button>
                          <button onClick={() => cancel(m.id)} disabled={loading} className="flex-1 rounded-lg bg-navy-600 hover:bg-navy-500 text-gray-200 text-xs font-medium py-1.5 disabled:opacity-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-3 bg-navy-700">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-navy-500/50 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Message Folly…"
                className="flex-1 bg-navy-700 border border-navy-500/50 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
              <button onClick={send} disabled={loading || !input.trim()} className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center text-white disabled:opacity-40 hover:opacity-90">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
