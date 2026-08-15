import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { LiveDot, StatusPill } from '../../components/ui'
import { factory } from '../../data'
import { useDemo } from '../../state/DemoContext'

const nav = [
  { to: '/app/dashboard', label: 'Dashboard' },
  { to: '/app/buyers', label: 'Buyers' },
  { to: '/app/catalog', label: 'Catalog' },
  { to: '/app/contracts', label: 'Contracts' },
]

export function AppShell() {
  const { leads, autopilot, setAutopilot } = useDemo()
  const liveWorkers = leads.filter((lead) => lead.status !== 'contract').length

  return (
    <div className="flex min-h-svh flex-col bg-bg md:flex-row">
      <aside className="sticky top-0 z-40 flex w-full shrink-0 items-center gap-4 border-b border-line bg-sidebar px-3 py-3 md:static md:w-56 md:flex-col md:items-stretch md:border-b-0 md:border-r md:py-4">
        <Logo to="/app/dashboard" />
        <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto md:mt-6 md:flex-none md:flex-col">
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
        <div className="mt-auto hidden rounded-md border border-line px-3 py-3 md:block">
          <p className="text-xs text-muted">Sources in use</p>
          <p className="mt-1 text-sm leading-snug text-ink">
            LinkedIn, Maps, customs, directories, showrooms…
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-medium text-ink">
              {factory.name}{' '}
              <span className="font-normal text-muted">{factory.nameZh}</span>
            </p>
            <p className="text-xs text-muted">
              {factory.city} · {factory.workers} people · {factory.exportShare} export
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutopilot(!autopilot)}
              className="cursor-pointer border-0 bg-transparent p-0"
              title="Toggle autopilot"
            >
              {autopilot ? (
                <StatusPill tone="live">
                  <LiveDot />
                  Autopilot on
                </StatusPill>
              ) : (
                <StatusPill tone="warn">Autopilot paused</StatusPill>
              )}
            </button>
            <StatusPill>{liveWorkers} workers live</StatusPill>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
