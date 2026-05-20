import { Component, ErrorInfo, ReactNode } from 'react'
import { captureException } from '../lib/monitoring'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    captureException(err, { componentStack: info.componentStack ?? '' })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: 48, marginBottom: '2.5rem' }} />

        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#EF4444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Something went wrong
        </p>
        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: '#0F172A', margin: '0 0 0.75rem' }}>
          An unexpected error occurred
        </h1>
        <p style={{ fontSize: '0.8125rem', color: '#64748B', maxWidth: 480, lineHeight: 1.6, margin: '0 0 2rem', fontFamily: 'IBM Plex Mono, monospace' }}>
          {this.state.message || 'Unknown error'}
        </p>

        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#16C784', color: '#fff',
            border: 'none', borderRadius: 8,
            padding: '0.625rem 1.5rem',
            fontWeight: 600, fontSize: '0.9375rem',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          Reload page
        </button>
      </div>
    )
  }
}
