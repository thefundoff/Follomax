import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, ShoppingCart, Wallet, TrendingUp, Plus } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { RecentOrdersTable } from '@/components/dashboard/RecentOrdersTable'
import { useOrderStats } from '@/hooks/useOrders'
import { useBalance } from '@/hooks/useBalance'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import { OnboardingTour, useOnboarding } from '@/components/onboarding/OnboardingTour'

export function DashboardPage() {
  const { profile } = useAuth()
  const { isDone } = useOnboarding()
  const [showTour, setShowTour] = useState(() => !isDone())
  const { data: stats, isLoading: statsLoading } = useOrderStats()
  const { data: balance, isLoading: balanceLoading } = useBalance()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const name = profile?.full_name?.split(' ')[0] || 'there'

  return (
    <>
    <AnimatePresence>
      {showTour && <OnboardingTour onDismiss={() => setShowTour(false)} />}
    </AnimatePresence>
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 max-w-screen-xl">
        {/* Greeting */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">{greeting}, {name} 👋</h1>
            <p className="text-gray-400 text-xs md:text-sm mt-0.5">Here's what's happening with your account</p>
          </div>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            size="sm"
            onClick={() => window.location.href = '/orders/new'}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">New Order</span>
            <span className="sm:hidden">Order</span>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatsCard
            label="Total Orders"
            value={formatNumber(stats?.total ?? 0)}
            icon={Package}
            iconColor="text-brand-400"
            iconBg="bg-brand-500/15"
            isLoading={statsLoading}
            delay={0}
          />
          <StatsCard
            label="Active Orders"
            value={formatNumber(stats?.active ?? 0)}
            icon={ShoppingCart}
            iconColor="text-blue-400"
            iconBg="bg-blue-500/15"
            isLoading={statsLoading}
            delay={0.05}
          />
          <StatsCard
            label="Balance"
            value={formatCurrency(balance ?? 0)}
            icon={Wallet}
            iconColor="text-green-400"
            iconBg="bg-green-500/15"
            isLoading={balanceLoading}
            delay={0.1}
          />
          <StatsCard
            label="Total Spent"
            value={formatCurrency(stats?.total_spent ?? 0)}
            icon={TrendingUp}
            iconColor="text-orange-400"
            iconBg="bg-orange-500/15"
            isLoading={statsLoading}
            delay={0.15}
          />
        </div>

        {/* Quick actions + Recent orders */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Quick actions */}
          <div className="space-y-3">
            <h2 className="text-xs md:text-sm font-semibold text-gray-300 uppercase tracking-wider">Quick Actions</h2>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {[
                { to: '/orders/new', icon: '🛒', label: 'New Order', desc: 'Buy followers, likes & more' },
                { to: '/funds', icon: '💳', label: 'Add Funds', desc: 'Top up your balance' },
                { to: '/orders', icon: '📦', label: 'My Orders', desc: 'Track all your orders' },
                { to: '/profile', icon: '🔑', label: 'API Access', desc: 'Use our reseller API' },
              ].map(item => (
                <Link key={item.to} to={item.to}>
                  <Card hover padding="sm" className="flex items-center gap-3 h-full">
                    <span className="text-xl md:text-2xl">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs md:text-sm font-medium text-white truncate">{item.label}</p>
                      <p className="text-xs text-gray-500 hidden sm:block truncate">{item.desc}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent orders */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Recent Orders</h2>
              <Link to="/orders" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                View all →
              </Link>
            </div>
            <Card padding="none">
              <div className="p-4">
                <RecentOrdersTable />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
    </>
  )
}
