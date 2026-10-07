import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/ui/states';
import { useSession } from '@/lib/session';
import { LoginPage } from '@/routes/LoginPage';
import { DashboardPage } from '@/routes/DashboardPage';
import { MoodleListPage } from '@/routes/moodles/MoodleListPage';
import { MoodleCreatePage } from '@/routes/moodles/MoodleCreatePage';
import { MoodleDetailPage } from '@/routes/moodles/MoodleDetailPage';
import { PlanListPage } from '@/routes/plans/PlanListPage';
import { PlanCreatePage } from '@/routes/plans/PlanCreatePage';
import { PlanDetailPage } from '@/routes/plans/PlanDetailPage';
import { ForbiddenPage } from '@/routes/ForbiddenPage';

/**
 * Redirects to login, remembering where the user was headed.
 *
 * The return path is stored in state rather than in the query string: a
 * redirect target is attacker-controllable input, and an open redirect
 * through `?next=https://…` is a classic phishing vector. State is
 * discarded on reload, which is exactly the lifetime we want for it.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Restaurando sesión…" />
      </div>
    );
  }

  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/** Gates a route on a permission, so a hidden link never 403s on click. */
function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { can } = useSession();
  if (!can(permission)) return <ForbiddenPage />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />

        <Route path="moodles">
          <Route index element={<MoodleListPage />} />
          <Route
            path="new"
            element={
              <RequirePermission permission="moodles.create">
                <MoodleCreatePage />
              </RequirePermission>
            }
          />
          <Route path=":id" element={<MoodleDetailPage />} />
        </Route>

        <Route path="plans">
          <Route index element={<PlanListPage />} />
          <Route
            path="new"
            element={
              <RequirePermission permission="plans.create">
                <PlanCreatePage />
              </RequirePermission>
            }
          />
          <Route path=":id" element={<PlanDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
