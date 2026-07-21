import { Sparkles, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAiStatus, useAiStatusLiveTest, type AiStatus } from '@/hooks/useAiStatus'

type Variant = 'default' | 'success' | 'warning' | 'error'

function derive(s?: AiStatus): { label: string; variant: Variant } {
  if (!s) return { label: 'Loading…', variant: 'default' }
  if (!s.configured) return { label: 'Not configured', variant: 'default' }

  // A live test result is the most authoritative.
  if (s.live && typeof s.ok === 'boolean') {
    if (s.ok) return { label: 'Operational', variant: 'success' }
    if (s.status === 429) return { label: 'Rate limited', variant: 'error' }
    return { label: `Error (${s.status})`, variant: 'warning' }
  }

  // Otherwise derive from recorded bot traffic.
  const okAt = s.last_ok?.at ? new Date(s.last_ok.at).getTime() : 0
  const errAt = s.last_error?.at ? new Date(s.last_error.at).getTime() : 0
  if (!okAt && !errAt) return { label: 'No recent activity', variant: 'default' }
  if (errAt > okAt) {
    return s.last_error?.status === 429
      ? { label: 'Rate limited', variant: 'error' }
      : { label: `Error (${s.last_error?.status})`, variant: 'warning' }
  }
  return { label: 'Operational', variant: 'success' }
}

function ago(at?: string | null): string {
  if (!at) return '—'
  return formatDistanceToNow(new Date(at), { addSuffix: true })
}

export function AiStatusCard() {
  const { data: status, isLoading } = useAiStatus()
  const { mutateAsync: testNow, isPending } = useAiStatusLiveTest()

  const { label, variant } = derive(status)

  const handleTest = async () => {
    try {
      const res = await testNow()
      if (res.ok) toast.success(`AI operational (${res.latency_ms}ms)`)
      else if (res.status === 429) toast.error('AI is rate limited (429)')
      else if (!res.configured) toast.error('Gemini API key not set')
      else toast.error(`AI error (${res.status})`)
    } catch {
      toast.error('Could not reach AI status endpoint')
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Folly AI (Claude)</h3>
            <p className="text-xs text-gray-400">{status?.model || 'claude'}{status?.live && status?.latency_ms ? ` · ${status.latency_ms}ms` : ''}</p>
          </div>
        </div>
        <Badge variant={isLoading ? 'default' : variant}>{isLoading ? 'Loading…' : label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-navy-700/40 rounded-xl p-3">
          <p className="text-xs text-gray-500">Last successful AI reply</p>
          <p className="text-sm font-medium text-white mt-1">{ago(status?.last_ok?.at)}</p>
        </div>
        <div className="bg-navy-700/40 rounded-xl p-3">
          <p className="text-xs text-gray-500">Last rate-limited (429)</p>
          <p className={`text-sm font-medium mt-1 ${status?.last_error?.status === 429 ? 'text-red-400' : 'text-white'}`}>
            {status?.last_error?.status === 429 ? ago(status?.last_error?.at) : '—'}
          </p>
        </div>
      </div>

      {status?.live && status?.status === 429 && status?.retry_after_seconds ? (
        <p className="text-xs text-red-400 mb-3">Provider says retry in ~{status.retry_after_seconds}s.</p>
      ) : null}

      <p className="text-xs text-gray-500 mb-4">
        Anthropic rate limits are per-minute (requests &amp; tokens) and recover within ~60s; a 429 includes a
        retry-after. Raising limits means moving up a usage tier. When rate-limited, Folly automatically falls
        back to buttons &amp; keywords, so users can still order.
      </p>

      <Button variant="secondary" size="sm" onClick={handleTest} isLoading={isPending} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
        Test now
      </Button>
    </Card>
  )
}
