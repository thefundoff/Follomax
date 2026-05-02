import { type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'

interface PublicLayoutProps {
  children: ReactNode
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-navy-900">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-navy-900/80 backdrop-blur-xl border-b border-navy-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <img src="/logo.png" alt="Follomax" className="w-8 h-8 rounded-xl object-cover" />
              <span className="text-lg font-bold gradient-text">Follomax</span>
            </Link>

            <div className="hidden md:flex items-center gap-6">
              <Link to="/#features" className="text-sm text-gray-400 hover:text-white transition-colors">Features</Link>
              <Link to="/#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</Link>
              <Link to="/#faq" className="text-sm text-gray-400 hover:text-white transition-colors">FAQ</Link>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl hover:bg-navy-700 text-gray-400 hover:text-brand-400 transition-colors"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              {user ? (
                <Button size="sm" onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign In</Button>
                  <Button size="sm" onClick={() => navigate('/register')}>Get Started</Button>
                </>
              )}
            </div>

            <button
              className="md:hidden p-2 text-gray-400 hover:text-white"
              onClick={() => setMenuOpen(o => !o)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-navy-500/30 bg-navy-800 px-4 py-4 space-y-3">
            <Link to="/#features" className="block text-gray-300 hover:text-white py-2" onClick={() => setMenuOpen(false)}>Features</Link>
            <Link to="/#pricing" className="block text-gray-300 hover:text-white py-2" onClick={() => setMenuOpen(false)}>Pricing</Link>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl bg-navy-700 text-gray-400 hover:text-brand-400 transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => { navigate('/login'); setMenuOpen(false) }}>Sign In</Button>
              <Button size="sm" className="flex-1" onClick={() => { navigate('/register'); setMenuOpen(false) }}>Get Started</Button>
            </div>
          </div>
        )}
      </nav>

      <div className="pt-16">{children}</div>
    </div>
  )
}
