import { Link } from 'react-router-dom'
import { leads } from '../../data'

export function ContractsList() {
  const rows = leads.filter(
    (lead) => lead.status === 'contract' || lead.status === 'negotiating',
  )

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Contracts</h1>
      <p className="mt-2 text-sm text-muted">
        Drafts follow the buyer’s country. German law for Hamburg. Dutch law for
        Rotterdam. Always a Terac lawyer on the redline.
      </p>
      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-bg">
        <table className="w-full text-left text-sm">
          <thead className="text-xs font-normal text-muted">
            <tr>
              <th className="px-4 py-2 font-normal uppercase">Buyer</th>
              <th className="px-4 py-2 font-normal uppercase">Law</th>
              <th className="px-4 py-2 font-normal uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr key={lead.id} className="border-t border-line hover:bg-hover">
                <td className="px-4 py-3">
                  <Link
                    to={
                      lead.id === 'nordlicht'
                        ? `/app/leads/${lead.id}/contract`
                        : `/app/leads/${lead.id}`
                    }
                    className="font-medium text-ink no-underline hover:text-accent"
                  >
                    {lead.company}
                  </Link>
                  <p className="text-xs text-muted">{lead.containers}</p>
                </td>
                <td className="px-4 py-3 text-muted">{lead.country}</td>
                <td className="px-4 py-3 text-muted">
                  {lead.id === 'nordlicht'
                    ? 'Terac review returned in 41 min'
                    : lead.lastAction}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
