import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/auth/RequireAuth';
import { AuthProvider } from './lib/auth';
import { Landing } from './pages/Landing';
import { NotFound } from './pages/NotFound';
import { Leaderboard } from './pages/Leaderboard';
import { Polls } from './pages/Polls';
import { Profile } from './pages/Profile';
import { Quiz } from './pages/Quiz';
import { SignIn } from './pages/SignIn';
import { Suggestions } from './pages/Suggestions';
import { AdminRoute } from './pages/Admin';
import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminQuizzes } from './pages/admin/AdminQuizzes';
import { AdminPolls } from './pages/admin/AdminPolls';
import { AdminSuggestions } from './pages/admin/AdminSuggestions';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Landing />} />
            <Route path="sign-in" element={<SignIn />} />
            <Route
              path="profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="quiz"
              element={
                <RequireAuth>
                  <Quiz />
                </RequireAuth>
              }
            />
            <Route
              path="leaderboard"
              element={
                <RequireAuth>
                  <Leaderboard />
                </RequireAuth>
              }
            />
            <Route
              path="polls"
              element={
                <RequireAuth>
                  <Polls />
                </RequireAuth>
              }
            />
            <Route
              path="suggestions"
              element={
                <RequireAuth>
                  <Suggestions />
                </RequireAuth>
              }
            />
            <Route path="admin" element={<AdminRoute />}>
              <Route index element={<AdminOverview />} />
              <Route path="quizzes" element={<AdminQuizzes />} />
              <Route path="polls" element={<AdminPolls />} />
              <Route path="suggestions" element={<AdminSuggestions />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
