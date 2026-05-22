import { Link } from 'react-router-dom'

export default function NotFound() {
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
      <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: 112, marginBottom: '2.5rem' }} />

      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#16C784', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' }}>
        404
      </p>
      <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 700, color: '#0F172A', margin: '0 0 1rem' }}>
        Page not found
      </h1>
      <p style={{ fontSize: '1.0625rem', color: '#64748B', maxWidth: 420, lineHeight: 1.6, margin: '0 0 2.5rem' }}>
        The page you're looking for doesn't exist or has been moved.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/" style={{
          display: 'inline-flex', alignItems: 'center',
          background: '#16C784', color: '#fff',
          padding: '0.625rem 1.5rem', borderRadius: 8,
          fontWeight: 600, fontSize: '0.9375rem', textDecoration: 'none',
        }}>
          Back to home
        </Link>
        <Link to="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center',
          background: 'transparent', color: '#0F172A',
          border: '1px solid #E2E8F0',
          padding: '0.625rem 1.5rem', borderRadius: 8,
          fontWeight: 600, fontSize: '0.9375rem', textDecoration: 'none',
        }}>
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
