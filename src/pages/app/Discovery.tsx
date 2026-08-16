import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useDemo } from '../../state/DemoContext'

export function Discovery() {
  const { searchBuyers, discoveryRound, addToPipeline, leads } = useDemo()
  const reduceMotion = Boolean(useReducedMotion())
  const [loading, setLoading] = useState(!discoveryRound)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (discoveryRound || fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    searchBuyers({ region: 'Europe', buyerType: 'importer', maxResults: 8 })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Apollo search failed')
      })
      .finally(() => setLoading(false))
  }, [discoveryRound, searchBuyers])

  const companies = discoveryRound?.companies ?? []
  const inPipeline = (name: string, id: string) =>
    leads.some((lead) => lead.id === id || lead.company.toLowerCase() === name.toLowerCase())

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Discovery</h1>
      <p className="mt-1 text-sm text-muted">
        Buyers Bobby found. Add the ones you want to the pipeline.
      </p>

      {loading ? (
        <div className="mt-8 max-w-3xl rounded-xl border border-black/8 bg-bg px-4 py-6">
          <p className="text-sm text-ink">Searching Apollo for buyers…</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/8">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: '12%' }}
              animate={reduceMotion ? { width: '55%' } : { width: ['18%', '78%', '42%'] }}
              transition={reduceMotion ? { duration: 0 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-6 text-sm text-danger">{error}</p> : null}

      {!loading && companies.length > 0 ? (
        <div className="mt-6 max-w-3xl overflow-hidden rounded-xl border border-black/8 bg-bg">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Country</th>
                <th className="px-4 py-2.5 font-medium">Website</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const added = inPipeline(company.name, company.externalCompanyId)
                return (
                  <tr key={company.externalCompanyId} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{company.name}</p>
                      {company.description ? (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-muted">{company.description}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">{company.country ?? '—'}</td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-muted">
                      {company.website ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {added ? (
                        <span className="text-xs font-medium text-good">✓ In pipeline</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToPipeline(company)}
                          className="cursor-pointer rounded-md border-0 bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                        >
                          Add to pipeline
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error && companies.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Apollo returned no companies.</p>
      ) : null}
    </div>
  )
}
