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
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
