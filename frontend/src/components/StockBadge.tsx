export function StockBadge({ inStock }: { inStock: boolean | null }) {
  if (inStock === true) return <span className="badge ok">In stock</span>;
  if (inStock === false) return <span className="badge bad">Out of stock</span>;
  return <span className="badge muted">Unknown</span>;
}
