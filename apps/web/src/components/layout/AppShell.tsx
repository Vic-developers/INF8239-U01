/**
 * Application shell: sidebar navigation, tenant header, sign-out.
 *
 * The navigation is filtered by permission rather than hidden by role name,
 * because permissions are what the API enforces. A menu item that appears
 * for someone whose request would be rejected is a bug, and deriving both
 * from the same list is the only way they stay in step.
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Sun,
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: typeof LayoutDashboard;
  /** Rendered only when the session holds this permission. */
  readonly permission?: string;
  readonly end?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/moodles', label: 'Instancias Moodle', icon: Building2, permission: 'moodles.read' },
  { to: '/plans', label: 'Planes', icon: ClipboardList, permission: 'plans.read' },
];

export function AppShell() {
  const { session, can, logout } = useSession();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  if (session === null) return null;

  const items = NAV_ITEMS.filter((item) => item.permission === undefined || can(item.permission));
  const canCreateMoodle = can('moodles.create');
  const canCreatePlan = can('plans.create');

  const toggleTheme = (): void => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const signOut = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      {/* Overlay for small screens, where the sidebar is off-canvas. */}
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground">
            <Building2 className="size-4" aria-hidden />
          </span>
          <span className="font-semibold leading-tight">
            Moodle Control Center
            <span className="block text-xs font-normal text-muted-foreground">
              {session.tenantName}
            </span>
          </span>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Navegación principal">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end === true}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}

          <div className="pt-4">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Acciones
            </p>
            <div className="space-y-1">
              {canCreateMoodle ? (
                <NavLink
                  to="/moodles/new"
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )
                  }
                >
                  <Plus className="size-4" aria-hidden />
                  Registrar instancia
                </NavLink>
              ) : null}
              {canCreatePlan ? (
                <NavLink
                  to="/plans/new"
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )
                  }
                >
                  <Plus className="size-4" aria-hidden />
                  Crear plan
                </NavLink>
              ) : null}
            </div>
          </div>
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{session.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            >
              {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {session.roles.map((role) => (
              <span
                key={role}
                className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"
              >
                {role}
              </span>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void signOut()}>
            <LogOut aria-hidden />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu aria-hidden />
          </Button>
          <p className="text-sm text-muted-foreground">
            Consola de control multi-tenant para ecosistemas Moodle
          </p>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
