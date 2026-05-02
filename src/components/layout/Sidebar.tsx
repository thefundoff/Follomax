import { NavLink, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ShoppingCart, Package, Wallet, User, Settings,
  LogOut, Users, BarChart3, DollarSign, ChevronLeft, ChevronRight, Store, X, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useState } from 'react'

const userNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/orders/new', icon: ShoppingCart, label: 'New Order' },
  { to: '/orders', icon: Package, label: 'My Orders' },
  { to: '/funds', icon: Wallet, label: 'Add Funds' },
  { to: '/profile', icon: User, label: 'Profile' },
]

const merchantNav = [
  { to: '/merchant', icon: Store, label: 'Overview' },
  { to: '/merchant/users', icon: Users, label: 'My Users' },
]

const adminNav = [
  { to: '/admin', icon: BarChart3, label: 'Overview' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/services', icon: Zap, label: 'Services' },
  { to: '/admin/orders', icon: Package, label: 'Orders' },
  { to: '/admin/transactions', icon: DollarSign, label: 'Transactions' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { profile, signOut, isAdmin, isMerchant } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const NavContent = ({ showLabels, onLinkClick }: { showLabels: boolean; onLinkClick?: () => void }) => (
    <>
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 p-4 border-b border-navy-500/30 flex-shrink-0 hover:opacity-90 transition-opacity">
        <img src="/logo.png" alt="Follomax" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
        {showLabels && (
          <span className="text-lg font-bold gradient-text whitespace-nowrap">Follomax</span>
        )}
      </Link>

      {/* Nav links */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1 px-2">
          {showLabels && (
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2">Main Menu</p>
          )}
          {userNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/orders'}
              onClick={onLinkClick}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-500/15 text-brand-300 border border-brand-500/25'
                  : 'text-gray-400 hover:bg-navy-700/60 hover:text-gray-200'
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              {showLabels && <span className="truncate">{label}</span>}
            </NavLink>
          ))}

          {isMerchant && (
            <>
              {showLabels && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mt-4 mb-2">Merchant</p>
              )}
              {merchantNav.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/merchant'}
                  onClick={onLinkClick}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-orange-500/15 text-orange-300 border border-orange-500/25'
                      : 'text-gray-400 hover:bg-navy-700/60 hover:text-gray-200'
                  )}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {showLabels && <span className="truncate">{label}</span>}
                </NavLink>
              ))}
            </>
          )}

          {isAdmin && (
            <>
              {showLabels && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mt-4 mb-2">Admin</p>
              )}
              {adminNav.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/admin'}
                  onClick={onLinkClick}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-brand-500/15 text-brand-300 border border-brand-500/25'
                      : 'text-gray-400 hover:bg-navy-700/60 hover:text-gray-200'
                  )}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {showLabels && <span className="truncate">{label}</span>}
                </NavLink>
              ))}
            </>
          )}
        </div>
      </nav>

      {/* User & signout */}
      <div className="p-3 border-t border-navy-500/30 space-y-2 flex-shrink-0">
        {showLabels && profile && (
          <div className="px-3 py-2 rounded-xl bg-navy-700/50">
            <p className="text-xs font-medium text-white truncate">{profile.full_name || profile.email}</p>
            <p className="text-xs text-gray-500 truncate">{profile.email}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {showLabels && <span>Sign Out</span>}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="relative hidden md:flex flex-shrink-0 bg-navy-800 border-r border-navy-500/30 flex-col overflow-hidden"
      >
        <NavContent showLabels={!collapsed} />

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute top-[72px] -right-3 w-6 h-6 bg-navy-600 border border-navy-500 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </motion.aside>

      {/* ── Mobile drawer ─────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={onMobileClose}
            />

            {/* Drawer */}
            <motion.aside
              key="drawer"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 w-72 z-50 flex flex-col bg-navy-800 border-r border-navy-500/30 md:hidden overflow-hidden"
            >
              {/* Close button */}
              <button
                onClick={onMobileClose}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-navy-700 transition-colors z-10"
              >
                <X size={18} />
              </button>

              <NavContent showLabels onLinkClick={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
