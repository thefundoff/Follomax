import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthGuard } from '@/guards/AuthGuard'
import { AdminGuard } from '@/guards/AdminGuard'
import { MerchantGuard } from '@/guards/MerchantGuard'

import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { NewOrderPage } from '@/pages/NewOrderPage'
import { OrdersPage } from '@/pages/OrdersPage'
import { AddFundsPage } from '@/pages/AddFundsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { MerchantDashboardPage } from '@/pages/merchant/MerchantDashboardPage'
import { MerchantUsersPage } from '@/pages/merchant/MerchantUsersPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AdminServicesPage } from '@/pages/admin/AdminServicesPage'
import { AdminOrdersPage } from '@/pages/admin/AdminOrdersPage'
import { AdminTransactionsPage } from '@/pages/admin/AdminTransactionsPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { AdminSupportPage } from '@/pages/admin/AdminSupportPage'
import { SupportPage } from '@/pages/SupportPage'

function NotFound() {
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center text-center px-4">
      <div>
        <p className="text-8xl font-bold gradient-text mb-4">404</p>
        <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
        <p className="text-gray-400 mb-6">The page you're looking for doesn't exist.</p>
        <a href="/" className="btn-primary inline-flex items-center px-6 py-2.5 rounded-xl">Go Home</a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<AuthGuard />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/orders/new" element={<NewOrderPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/funds" element={<AddFundsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/support" element={<SupportPage />} />
            </Route>

            <Route element={<MerchantGuard />}>
              <Route path="/merchant" element={<MerchantDashboardPage />} />
              <Route path="/merchant/users" element={<MerchantUsersPage />} />
            </Route>

            <Route element={<AdminGuard />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/services" element={<AdminServicesPage />} />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/transactions" element={<AdminTransactionsPage />} />
              <Route path="/admin/settings" element={<AdminSettingsPage />} />
              <Route path="/admin/support" element={<AdminSupportPage />} />
            </Route>

            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1c2333',
              color: '#f0f6fc',
              border: '1px solid rgba(168, 85, 247, 0.15)',
              borderRadius: '12px',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#1c2333' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#1c2333' } },
          }}
        />
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
