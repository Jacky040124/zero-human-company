import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { factory } from '../../data'
import { getMe, signOut, type AppUser } from '../../api/runtime'

const nav = [
  { to: '/app/discovery', label: 'Discovery' },
  { to: '/app/buyers', label: 'Pipeline' },
  { to: '/app/catalog', label: 'Catalog' },
  { to: '/app/contracts', label: 'Contracts' },
]

export function AppShell() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [userLoaded, setUserLoaded] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    getMe()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setUserLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const onSignOut = () => {
    void signOut().then(() => {
      setUser(null)
      navigate('/login')
    })
  }

  return (
    <div className="flex min-h-svh bg-bg">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-sidebar px-3 py-4">
        <Logo to="/app/discovery" />
        <nav className="mt-6 flex flex-col gap-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-2.5 py-1.5 text-sm no-underline ${
                  isActive
                    ? 'bg-hover font-medium text-ink'
                    : 'text-muted hover:bg-hover hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-bg px-6 py-3">
          <div>
            <p className="text-sm font-medium text-ink">
              {factory.name}{' '}
              <span className="font-normal text-muted">{factory.nameZh}</span>
            </p>
            <p className="text-xs text-muted">
              {factory.city} · {factory.workers} people · {factory.exportShare} export
            </p>
          </div>
          {userLoaded ? (
            user ? (
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {user.name[0]?.toUpperCase() ?? 'U'}
                </span>
                <div className="text-right">
                  <p className="text-xs font-medium text-ink">{user.name}</p>
                  <p className="text-[0.65rem] text-faint">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="cursor-pointer rounded-md border border-black/10 bg-bg px-2.5 py-1 text-xs text-muted hover:bg-hover hover:text-ink"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-md border border-black/10 bg-bg px-3 py-1.5 text-xs font-medium text-ink no-underline hover:bg-hover"
              >
                Sign in
              </Link>
            )
          ) : null}
        </header>
        <main className="min-w-0 flex-1 overflow-auto bg-canvas p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
