import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, X, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { follyChat, type FollyBtn, type FollyFlow, type FollyPending } from '@/hooks/useFollyChat'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  buttons?: FollyBtn[][] | null
}

const uid = () => Math.random().toString(36).slice(2)

// Client-side quick actions (ids match the folly-chat handler).
const QUICK_ACTIONS: FollyBtn[][] = [
  [{ id: 'menu_balance', title: '💰 Balance' }, { id: 'menu_orders', title: '📦 My Orders' }],
  [{ id: 'menu_services', title: '🔍 Order Services' }, { id: 'menu_addfunds', title: '➕ Add Funds' }],
]

const welcome = (): ChatMessage => ({
  id: 'welcome',
  role: 'assistant',
  text: "Hi! I'm Folly 🤖 — tap an option below, or just tell me what you need (e.g. “1000 Instagram likes”).",
  buttons: QUICK_ACTIONS,
})

function chipClass(id: string): string {
  if (id === 'confirm_order') return 'bg-green-600 hover:bg-green-500 text-white'
  if (id === 'cancel_order' || id === 'flow_cancel') return 'bg-navy-600 hover:bg-navy-500 text-gray-200'
  return 'bg-navy-700 hover:bg-navy-600 text-brand-200 border border-brand-500/30'
}

export function FollyChat() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const storageKey = user ? `folly-chat:${user.id}` : null
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([welcome()])
  const [flow, setFlow] = useState<FollyFlow | null>(null)
  const [pending, setPending] = useState<FollyPending | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState('NGN')
  const [loaded, setLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Restore saved conversation (survives reloads / navigation).
  useEffect(() => {
    setLoaded(false)
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      const s = raw ? JSON.parse(raw) : null
      if (s && Array.isArray(s.messages) && s.messages.length) {
        setMessages(s.messages)
        setFlow(s.flow ?? null)
        setPending(s.pending ?? null)
      } else setMessages([welcome()])
    } catch {
      setMessages([welcome()])
    }
    setLoaded(true)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || !loaded) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ messages: messages.slice(-50), flow, pending }))
    } catch { /* ignore */ }
  }, [messages, flow, pending, storageKey, loaded])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, loading])

  const clearChat = () => {
    setMessages([welcome()])
    setFlow(null)
    setPending(null)
    if (storageKey) { try { localStorage.removeItem(storageKey) } catch { /* ignore */ } }
  }

  const historyFor = (msgs: ChatMessage[]) =>
    msgs.filter((m) => m.id !== 'welcome').map((m) => ({ role: m.role === 'assistant' ? ('model' as const) : ('user' as const), text: m.text }))

  const applyResult = (res: Awaited<ReturnType<typeof follyChat>>) => {
    if (res.currency) setCurrency(res.currency)
    setFlow(res.flow ?? null)
    setPending(res.pending ?? null)
    setMessages((m) => [...m, { id: uid(), role: 'assistant', text: res.reply, buttons: res.buttons }])
    if (res.order_placed) {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['balance'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const history = historyFor(messages)
    setMessages((m) => [...m, { id: uid(), role: 'user', text }])
    setLoading(true)
    try {
      applyResult(await follyChat({ message: text, history, flow, pending }))
    } catch {
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: '😕 I could not reach the server. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const clickButton = async (btn: FollyBtn) => {
    if (loading) return
    if (btn.url) { window.open(btn.url, '_blank', 'noopener'); return }
    const history = historyFor(messages)
    setMessages((m) => [...m, { id: uid(), role: 'user', text: btn.title }])
    setLoading(true)
    try {
      applyResult(await follyChat({ button_id: btn.id, history, flow, pending }))
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full shadow-brand overflow-hidden ring-2 ring-brand-500/50 flex items-center justify-center text-white hover:scale-105 transition-transform"
        aria-label="Chat with Folly"
      >
        {open ? (
          <span className="w-full h-full bg-gradient-brand flex items-center justify-center"><X className="w-6 h-6" /></span>
        ) : (
          <img src="/folly-avatar.jpg" alt="Folly" className="w-full h-full object-cover object-[center_38%]" />
        )}
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
              <div className="w-9 h-9 rounded-xl overflow-hidden bg-navy-900 flex-shrink-0">
                <img src="/folly-avatar.jpg" alt="Folly" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">Folly</p>
                <p className="text-xs text-gray-400">Your Follomax assistant</p>
              </div>
              <button onClick={clearChat} title="Clear chat" className="text-gray-400 hover:text-white transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="space-y-2">
                  <div className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-navy-700 text-gray-100'}`}>
                      {m.text}
                    </div>
                  </div>
                  {m.role === 'assistant' && m.buttons && m.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.buttons.flat().map((b, i) => (
                        <button
                          key={b.id + i}
                          onClick={() => clickButton(b)}
                          disabled={loading}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${chipClass(b.id)}`}
                        >
                          {b.title}
                        </button>
                      ))}
                    </div>
                  )}
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
