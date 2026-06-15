import { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Toast, setToastFn } from './components/Toast'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Submissions } from './pages/Submissions'
import { Withdrawals } from './pages/Withdrawals'
import { Users } from './pages/Users'
import { Challenges } from './pages/Challenges'
import { BulkCredit } from './pages/BulkCredit'
import { Notify } from './pages/Notify'
import { BulkVerify } from './pages/BulkVerify'
import { ChallengeTypes } from './pages/ChallengeTypes'
import { Coach } from './pages/Coach'

interface ToastState {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

let toastId = 0

function App() {
  const [isAuth, setIsAuth] = useState(() => sessionStorage.getItem('zelth_admin_auth') === 'true')
  const [toasts, setToasts] = useState<ToastState[]>([])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  setToastFn(showToast)

  function removeToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  function handleLogout() {
    sessionStorage.removeItem('zelth_admin_auth')
    setIsAuth(false)
  }

  if (!isAuth) {
    return (
      <>
        <Login onLogin={() => setIsAuth(true)} />
        {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />)}
      </>
    )
  }

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar onLogout={handleLogout} />
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/submissions" element={<Submissions />} />
            <Route path="/withdrawals" element={<Withdrawals />} />
            <Route path="/users" element={<Users />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/bulk-verify" element={<BulkVerify />} />
            <Route path="/challenge-types" element={<ChallengeTypes />} />
            <Route path="/bulk-credit" element={<BulkCredit />} />
            <Route path="/notify" element={<Notify />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />)}
    </BrowserRouter>
  )
}

export default App
