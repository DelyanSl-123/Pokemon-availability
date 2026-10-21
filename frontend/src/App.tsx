import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, type Product, type RunOutcome, type RunSummary, type Settings, type Shop } from './api';

const fmtDate = (iso: string) => new Date(iso).toLocaleString();

function StockBadge({ inStock }: { inStock: boolean | null }) {
  if (inStock === true) return <span className="badge ok">In stock</span>;
  if (inStock === false) return <span className="badge bad">Out of stock</span>;
  return <span className="badge muted">Unknown</span>;
}

function ShopRow({ shop, onChange, onDelete }: { shop: Shop; onChange: (patch: Partial<Shop>) => void; onDelete: () => void }) {
  const [searchUrl, setSearchUrl] = useState(shop.searchUrl);
  useEffect(() => setSearchUrl(shop.searchUrl), [shop.searchUrl]);

  return (
    <tr>
      <td>
        <strong>{shop.name}</strong>
        <div className="sub">{shop.baseUrl}</div>
      </td>
      <td>
        <input
          className="wide"
          value={searchUrl}
          onChange={(e) => setSearchUrl(e.target.value)}
          onBlur={() => searchUrl !== shop.searchUrl && onChange({ searchUrl })}
          aria-label={`Search URL for ${shop.name}`}
        />
      </td>
      <td className="center">
        <input type="checkbox" checked={shop.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} aria-label="Enabled" />
      </td>
      <td className="center">
        <input
          type="checkbox"
          checked={shop.respectRobots}
          onChange={(e) => onChange({ respectRobots: e.target.checked })}
          aria-label="Respect robots.txt"
        />
      </td>
      <td className="right">
        <button className="link danger" onClick={onDelete}>
          Remove
        </button>
      </td>
    </tr>
  );
}

export default function App() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [shopFilter, setShopFilter] = useState<number | ''>('');
  const [inStockOnly, setInStockOnly] = useState(false);

  const [newShopUrl, setNewShopUrl] = useState('');
  const [newShopSearch, setNewShopSearch] = useState('');

  const [sendEmail, setSendEmail] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<RunOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadProducts = useCallback(
    () => api.products({ shopId: shopFilter === '' ? undefined : shopFilter, inStock: inStockOnly }).then(setProducts),
    [shopFilter, inStockOnly],
  );

  const loadAll = useCallback(
    () =>
      guard(async () => {
        const [s, r, cfg] = await Promise.all([api.shops(), api.runs(), api.settings()]);
        setShops(s);
        setRuns(r);
        setSettings(cfg);
        await loadProducts();
      }),
    [guard, loadProducts],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runNow = () =>
    guard(async () => {
      setRunning(true);
      setNotice(null);
      try {
        const outcome = await api.run(sendEmail);
        setLastOutcome(outcome);
        await loadAll();
      } finally {
        setRunning(false);
      }
    });

  const addShop = (e: FormEvent) => {
    e.preventDefault();
    void guard(async () => {
      await api.addShop({ url: newShopUrl, searchUrl: newShopSearch.trim() || undefined });
      setNewShopUrl('');
      setNewShopSearch('');
      setShops(await api.shops());
    });
  };

  const saveSettings = (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    void guard(async () => {
      setSettings(await api.saveSettings(settings));
      setNotice('Settings saved');
    });
  };

  const lastRun = runs[0];

  return (
    <main>
      <header className="top">
        <div>
          <h1>Pokémon TCG Tracker</h1>
          <p className="sub">Checks your shops once a day and emails what it finds.</p>
        </div>
        <div className="run-box">
          <label className="inline">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Send email
          </label>
          <button className="primary" onClick={runNow} disabled={running}>
            {running ? 'Checking…' : 'Run check now'}
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}
      {lastOutcome?.email && !lastOutcome.email.sent && (
        <div className="banner warn">Email not sent: {lastOutcome.email.reason}</div>
      )}
      {lastOutcome?.email?.sent && <div className="banner ok">Email sent.</div>}

      <section>
        <h2>Last run</h2>
        {lastRun ? (
          <>
            <p className="sub">
              {fmtDate(lastRun.startedAt)} · {lastRun.source} · search “{lastRun.query}”
            </p>
            <div className="chips">
              {lastRun.shops.map((s) => (
                <div key={s.shopId} className={`chip ${s.status}`}>
                  <strong>{s.shopName}</strong>
                  <span>
                    {s.status === 'ok'
                      ? `${s.found} found · ${s.newCount} new${s.backInStock ? ` · ${s.backInStock} back in stock` : ''}`
                      : `${s.status}: ${s.message ?? ''}`}
                  </span>
                  {s.status === 'ok' && s.message && <span className="sub">{s.message}</span>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="sub">No checks yet. Press “Run check now”.</p>
        )}
      </section>

      <section>
        <h2>Shops</h2>
        <table>
          <thead>
            <tr>
              <th>Shop</th>
              <th>Search URL (use {'{query}'})</th>
              <th className="center">Enabled</th>
              <th className="center">Obey robots.txt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shops.map((shop) => (
              <ShopRow
                key={shop.id}
                shop={shop}
                onChange={(patch) =>
                  void guard(async () => {
                    await api.patchShop(shop.id, patch);
                    setShops(await api.shops());
                  })
                }
                onDelete={() =>
                  window.confirm(`Remove ${shop.name} and its saved products?`) &&
                  void guard(async () => {
                    await api.deleteShop(shop.id);
                    await loadAll();
                  })
                }
              />
            ))}
            {shops.length === 0 && (
              <tr>
                <td colSpan={5} className="sub">
                  No shops yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <form className="row" onSubmit={addShop}>
          <input required placeholder="www.example.bg" value={newShopUrl} onChange={(e) => setNewShopUrl(e.target.value)} />
          <input
            className="wide"
            placeholder="Optional search URL, e.g. https://www.example.bg/search?q={query}"
            value={newShopSearch}
            onChange={(e) => setNewShopSearch(e.target.value)}
          />
          <button type="submit">Add shop</button>
        </form>
      </section>

      <section>
        <div className="section-head">
          <h2>Products</h2>
          <div className="row">
            <select value={shopFilter} onChange={(e) => setShopFilter(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">All shops</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="inline">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} /> In stock only
            </label>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Shop</th>
              <th className="right">Price</th>
              <th>Stock</th>
              <th>First seen</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {p.title}
                  </a>
                </td>
                <td>{p.shopName}</td>
                <td className="right">{p.price === null ? '—' : `${p.price.toFixed(2)} ${p.currency ?? ''}`}</td>
                <td>
                  <StockBadge inStock={p.inStock} />
                </td>
                <td className="sub">{fmtDate(p.firstSeen)}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="sub">
                  Nothing found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {settings && (
        <section>
          <h2>Daily email</h2>
          <form className="grid" onSubmit={saveSettings}>
            <label>
              Send to
              <input type="email" required value={settings.mailTo} onChange={(e) => setSettings({ ...settings, mailTo: e.target.value })} />
            </label>
            <label>
              Schedule (cron, server time zone)
              <input required value={settings.cron} onChange={(e) => setSettings({ ...settings, cron: e.target.value })} />
              <span className="sub">0 9 * * * = every day at 09:00</span>
            </label>
            <label>
              Search phrase
              <input required value={settings.query} onChange={(e) => setSettings({ ...settings, query: e.target.value })} />
            </label>
            <div>
              <button type="submit">Save settings</button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
