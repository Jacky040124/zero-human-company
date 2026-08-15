import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { LiveDot, StatusPill } from '../../components/ui'
import { factory } from '../../data'
import { useDemo } from '../../state/DemoContext'

const nav = [
  { to: '/app/dashboard', label: 'Dashboard' },
  { to: '/app/discovery', label: 'Discovery' },
  { to: '/app/buyers', label: 'Pipeline' },
  { to: '/app/catalog', label: 'Catalog' },
  { to: '/app/contracts', label: 'Contracts' },
]

export function AppShell() {
  const { leads, autopilot, setAutopilot } = useDemo()
  const liveWorkers = leads.filter((lead) => lead.status !== 'contract').length

  return (
    <div className="flex min-h-svh bg-bg">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-sidebar px-3 py-4">
        <Logo to="/app/dashboard" />
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
        <main className="min-w-0 flex-1 overflow-auto bg-canvas p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
