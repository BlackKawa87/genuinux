import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Join from './pages/Join'
import Demo from './pages/Demo'
import Docs from './pages/Docs'
import BlogPost from './pages/BlogPost'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Overview from './pages/dashboard/Overview'
import ApiKeys from './pages/dashboard/ApiKeys'
import Events from './pages/dashboard/Events'
import Queue from './pages/dashboard/Queue'
import Rules from './pages/dashboard/Rules'
import Webhooks from './pages/dashboard/Webhooks'
import UsersPage from './pages/dashboard/Users'
import SettingsPage from './pages/dashboard/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/join" element={<Join />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/docs" element={<Docs />} />
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
          <Route path="webhooks" element={<Webhooks />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
