import { useState } from 'react'
import {
  DollarSign, Users, Package, Wallet, TrendingUp, Activity, AlertCircle,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts'
import type { LucideIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Card } from '@/components/ui/Card'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useTheme } from '@/context/ThemeContext'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'

const BRAND = '#22aaf4'
const AMBER = '#f59e0b'

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
]

function compactCurrency(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`
  return `₦${Math.round(n)}`
}
function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}
function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + '…' : s
}

interface KpiProps {
  label: string
  value: string
  icon: LucideIcon
  fg: string
  bg: string
  isLoading?: boolean
}
function Kpi({ label, value, icon: Icon, fg, bg, isLoading }: KpiProps) {
  return (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-3 min-w-0">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('w-5 h-5', fg)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium truncate">{label}</p>
        {isLoading ? (
          <div className="h-5 w-16 mt-1 rounded bg-navy-700/60 animate-pulse" />
        ) : (
          <p className="text-base md:text-lg font-bold text-white truncate tabular-nums leading-tight mt-0.5" title={value}>
            {value}
          </p>
        )}
      </div>
    </div>
  )
}

interface ChartCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  height?: number
}
function ChartCard({ title, subtitle, children, className, height = 280 }: ChartCardProps) {
  return (
    <Card className={cn('min-w-0', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="min-w-0 overflow-hidden" style={{ width: '100%', height }}>{children}</div>
    </Card>
  )
}

export function AdminAnalyticsPage() {
  const [days, setDays] = useState(30)
  const { theme } = useTheme()
  const { data, isLoading, error } = useAnalytics(days)

  const chrome = theme === 'dark'
    ? { grid: '#1e293b', axis: '#64748b', tipBg: '#0f1729', tipBorder: 'rgba(255,255,255,0.10)', tipInk: '#e2e8f0' }
    : { grid: '#e2e8f0', axis: '#94a3b8', tipBg: '#ffffff', tipBorder: 'rgba(0,0,0,0.08)', tipInk: '#0f172a' }

  const tipStyle = {
    background: chrome.tipBg,
    border: `1px solid ${chrome.tipBorder}`,
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    color: chrome.tipInk,
  }
  const axisTick = { fill: chrome.axis, fontSize: 11 }

  const s = data?.summary

  // Reverse so highest spender/most-purchased sits at the top of horizontal bars
  const topServices = (data?.topServices ?? []).slice().reverse()
  const topUsers = (data?.topUsers ?? [])
    .map(u => ({ ...u, label: truncate(u.full_name || u.email.split('@')[0], 16) }))
    .slice()
    .reverse()

  return (
    <AdminLayout title="Analytics">
      <div className="space-y-6">
        {/* Time range */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Aggregated across all users · admin only
          </p>
          <div className="flex gap-1 p-1 rounded-xl bg-navy-700/50 border border-navy-500/30">
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  days === r.days ? 'bg-brand-500 !text-white shadow-brand' : 'text-gray-400 hover:text-gray-200'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <Card>
            <div className="flex items-center gap-2 text-red-400 py-6 justify-center">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">Failed to load analytics. {(error as Error).message}</span>
            </div>
          </Card>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Kpi label="Total Revenue" value={formatCurrency(s?.total_revenue ?? 0)} icon={DollarSign} fg="text-green-400" bg="bg-green-500/15" isLoading={isLoading} />
              <Kpi label="Total Users" value={formatNumber(s?.total_users ?? 0)} icon={Users} fg="text-brand-400" bg="bg-brand-500/15" isLoading={isLoading} />
              <Kpi label="Total Orders" value={formatNumber(s?.total_orders ?? 0)} icon={Package} fg="text-blue-400" bg="bg-blue-500/15" isLoading={isLoading} />
              <Kpi label="Total Spent" value={formatCurrency(s?.total_spent ?? 0)} icon={TrendingUp} fg="text-orange-400" bg="bg-orange-500/15" isLoading={isLoading} />
              <Kpi label="Wallet Balances" value={formatCurrency(s?.total_balance ?? 0)} icon={Wallet} fg="text-purple-400" bg="bg-purple-500/15" isLoading={isLoading} />
              <Kpi label="Active Users (30d)" value={formatNumber(s?.active_users_30d ?? 0)} icon={Activity} fg="text-teal-400" bg="bg-teal-500/15" isLoading={isLoading} />
            </div>

            {isLoading ? (
              <div className="grid lg:grid-cols-2 gap-6">
                {[0, 1, 2, 3].map(i => (
                  <Card key={i}><div className="h-64 rounded-xl bg-navy-700/40 animate-pulse" /></Card>
                ))}
              </div>
            ) : (
              <>
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Revenue over time */}
                  <ChartCard title="Revenue over time" subtitle={`Deposits received · last ${days} days`}>
                    <ResponsiveContainer>
                      <AreaChart data={data!.timeseries} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} vertical={false} />
                        <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} minTickGap={28}
                          tickFormatter={d => format(parseISO(d), 'MMM d')} />
                        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={compactCurrency} />
                        <Tooltip contentStyle={tipStyle} labelStyle={{ color: chrome.axis, fontSize: 12, marginBottom: 4 }}
                          itemStyle={{ color: BRAND }} cursor={{ stroke: chrome.grid }}
                          labelFormatter={l => format(parseISO(l as string), 'MMM d, yyyy')}
                          formatter={(v) => [formatCurrency(Number(v)), 'Revenue']} />
                        <Area type="monotone" dataKey="revenue" stroke={BRAND} strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* Orders per day (usage frequency over time) */}
                  <ChartCard title="Order activity" subtitle={`How often users place orders · last ${days} days`}>
                    <ResponsiveContainer>
                      <LineChart data={data!.timeseries} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} vertical={false} />
                        <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} minTickGap={28}
                          tickFormatter={d => format(parseISO(d), 'MMM d')} />
                        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} tickFormatter={compactNumber} />
                        <Tooltip contentStyle={tipStyle} labelStyle={{ color: chrome.axis, fontSize: 12, marginBottom: 4 }}
                          cursor={{ stroke: chrome.grid }}
                          labelFormatter={l => format(parseISO(l as string), 'MMM d, yyyy')}
                          formatter={(v, n) => [formatNumber(Number(v)), n === 'orders' ? 'Orders' : 'Active users']} />
                        <Line type="monotone" dataKey="orders" stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="active_users" stroke={AMBER} strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 3" />
                        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: chrome.axis }}
                          formatter={(val) => <span style={{ color: chrome.axis }}>{val === 'orders' ? 'Orders' : 'Active users'}</span>} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* Most purchased services */}
                  <ChartCard title="Most purchased services" subtitle="By number of orders (all time)" height={320}>
                    <ResponsiveContainer>
                      <BarChart data={topServices} layout="vertical" margin={{ top: 0, right: 36, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} horizontal={false} />
                        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={compactNumber} />
                        <YAxis type="category" dataKey="name" tick={{ fill: chrome.axis, fontSize: 10 }} axisLine={false} tickLine={false}
                          width={140} tickFormatter={(v: string) => truncate(v, 20)} />
                        <Tooltip contentStyle={tipStyle} cursor={{ fill: chrome.grid, opacity: 0.25 }}
                          formatter={(v) => [formatNumber(Number(v)), 'Orders']} />
                        <Bar dataKey="order_count" fill={BRAND} radius={[0, 4, 4, 0]} barSize={16}>
                          <LabelList dataKey="order_count" position="right" fill={chrome.axis} fontSize={11} formatter={(v) => formatNumber(Number(v))} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* Order frequency distribution */}
                  <ChartCard title="How often users order" subtitle="Number of users by lifetime order count">
                    <ResponsiveContainer>
                      <BarChart data={data!.frequency} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} vertical={false} />
                        <XAxis dataKey="bucket" tick={axisTick} axisLine={false} tickLine={false} />
                        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} allowDecimals={false} tickFormatter={compactNumber} />
                        <Tooltip contentStyle={tipStyle} cursor={{ fill: chrome.grid, opacity: 0.25 }}
                          formatter={(v) => [formatNumber(Number(v)), 'Users']} />
                        <Bar dataKey="users" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={56}>
                          <LabelList dataKey="users" position="top" fill={chrome.axis} fontSize={11} formatter={(v) => formatNumber(Number(v))} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {/* Top users: spend vs balance */}
                <ChartCard title="Top users — total spent vs wallet balance" subtitle="Highest lifetime spenders" height={Math.max(280, topUsers.length * 40)}>
                  <ResponsiveContainer>
                    <BarChart data={topUsers} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} horizontal={false} />
                      <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={compactCurrency} />
                      <YAxis type="category" dataKey="label" tick={{ fill: chrome.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                      <Tooltip contentStyle={tipStyle} cursor={{ fill: chrome.grid, opacity: 0.25 }}
                        formatter={(v, n) => [formatCurrency(Number(v)), n === 'total_spent' ? 'Spent' : 'Balance']} />
                      <Legend wrapperStyle={{ fontSize: 12 }}
                        formatter={(val) => <span style={{ color: chrome.axis }}>{val === 'total_spent' ? 'Total spent' : 'Wallet balance'}</span>} />
                      <Bar dataKey="total_spent" fill={BRAND} radius={[0, 4, 4, 0]} barSize={11} />
                      <Bar dataKey="balance" fill={AMBER} radius={[0, 4, 4, 0]} barSize={11} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}

// default export for lazy loading
export default AdminAnalyticsPage
