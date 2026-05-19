import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { AppProviders } from '@/providers/AppProviders'

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LiveFeedPage = lazy(() => import('@/pages/LiveFeedPage').then((m) => ({ default: m.LiveFeedPage })))
const AutoTraderPage = lazy(() => import('@/pages/AutoTraderPage').then((m) => ({ default: m.AutoTraderPage })))
const SmartWalletsPage = lazy(() => import('@/pages/SmartWalletsPage').then((m) => ({ default: m.SmartWalletsPage })))
const PortfolioPage = lazy(() => import('@/pages/PortfolioPage').then((m) => ({ default: m.PortfolioPage })))
const StrategiesPage = lazy(() => import('@/pages/StrategiesPage').then((m) => ({ default: m.StrategiesPage })))
const AlertsPage = lazy(() => import('@/pages/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const TokenDetailPage = lazy(() => import('@/pages/TokenDetailPage').then((m) => ({ default: m.TokenDetailPage })))

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', color: '#fff', background: '#0a0b0f', minHeight: '100vh' }}>
          <h1 style={{ color: '#f87171' }}>App failed to load</h1>
          <pre style={{ color: '#a1a1aa', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px' }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
    </div>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              index
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardPage />
                </Suspense>
              }
            />
            <Route path="feed" element={<Suspense fallback={<PageLoader />}><LiveFeedPage /></Suspense>} />
            <Route path="autotrader" element={<Suspense fallback={<PageLoader />}><AutoTraderPage /></Suspense>} />
            <Route path="scanner" element={<Suspense fallback={<PageLoader />}><AutoTraderPage /></Suspense>} />
            <Route path="wallets" element={<Suspense fallback={<PageLoader />}><SmartWalletsPage /></Suspense>} />
            <Route path="portfolio" element={<Suspense fallback={<PageLoader />}><PortfolioPage /></Suspense>} />
            <Route path="strategies" element={<Suspense fallback={<PageLoader />}><StrategiesPage /></Suspense>} />
            <Route path="alerts" element={<Suspense fallback={<PageLoader />}><AlertsPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
            <Route path="token/:mint" element={<Suspense fallback={<PageLoader />}><TokenDetailPage /></Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProviders>
    </AppErrorBoundary>
  )
}
