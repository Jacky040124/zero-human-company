import { catalog } from '../../data'

export function CatalogView() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Catalog</h1>
      <p className="mt-2 text-sm text-muted">
        The same line collected in onboarding. Always visible.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {catalog.map((product) => (
          <article key={product.id} className="rounded-lg border border-line bg-bg p-5">
            <p className="text-xs text-muted">{product.sku}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
              {product.name}
            </h2>
            <p className="text-sm text-muted">{product.nameZh}</p>
            <p className="mt-3 text-sm text-ink">{product.notes}</p>
            <p className="mt-4 text-sm text-muted">
              {product.price} · {product.moq} · {product.leadTime}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
