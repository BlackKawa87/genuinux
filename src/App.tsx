import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Overview from './pages/dashboard/Overview'
import ApiKeys from './pages/dashboard/ApiKeys'
import Events from './pages/dashboard/Events'
import Queue from './pages/dashboard/Queue'
import Rules from './pages/dashboard/Rules'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="events" element={<Events />} />
          <Route path="queue" element={<Queue />} />
          <Route path="rules" element={<Rules />} />
          <Route path="api-keys" element={<ApiKeys />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
