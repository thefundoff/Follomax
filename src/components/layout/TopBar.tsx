import { Wallet, Bell, ChevronDown, Sun, Moon, Menu } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useBalance } from '@/hooks/useBalance'
import { formatCurrency } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'

interface TopBarProps {
  title?: string
  onMenuClick?: () => void
}

export function TopBar({ title, onMenuClick }: TopBarProps) {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { data: balance, isLoading: balanceLoading } = useBalance()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="h-14 md:h-16 bg-navy-800/50 backdrop-blur-sm border-b border-navy-500/30 flex items-center px-3 md:px-6 gap-2 md:gap-4 flex-shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-xl hover:bg-navy-700 text-gray-400 hover:text-white transition-colors flex-shrink-0"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {title && <h1 className="text-base md:text-lg font-semibold text-white truncate">{title}</h1>}
      </div>

      <div className="flex items-center gap-1.5 md:gap-3">
        {/* Balance */}
        <Link
          to="/funds"
          className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 md:py-2 rounded-xl bg-brand-500/10 border border-brand-500/25 hover:bg-brand-500/20 transition-colors"
        >
          <Wallet className="w-4 h-4 text-brand-400 flex-shrink-0" />
          {balanceLoading ? (
            <Spinner size="sm" />
          ) : (
            <span className="text-xs md:text-sm font-semibold text-brand-300 whitespace-nowrap">
              {formatCurrency(balance ?? 0)}
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 md:p-2 rounded-xl hover:bg-navy-700 text-gray-400 hover:text-brand-400 transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
        </button>

        {/* Notifications — hidden on small screens */}
        <button className="hidden sm:flex relative p-1.5 md:p-2 rounded-xl hover:bg-navy-700 text-gray-400 hover:text-white transition-colors">
          <Bell className="w-4 h-4 md:w-5 md:h-5" />
        </button>

        {/* Profile menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-xl hover:bg-navy-700 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
            </div>
            <ChevronDown className="hidden sm:block w-4 h-4 text-gray-400" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 glass-card rounded-xl overflow-hidden z-50 py-1 border border-navy-500/50">
                <div className="px-4 py-3 border-b border-navy-500/30">
                  <p className="text-sm font-medium text-white truncate">
                    {profile?.full_name || 'My Account'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                >
                  Profile & Settings
                </Link>
                <Link
                  to="/funds"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center px-4 py-2.5 text-sm text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                >
                  Add Funds
                </Link>
                <div className="border-t border-navy-500/30 mt-1">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
