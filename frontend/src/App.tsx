import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Game, type Product, type RunSummary, type Settings, type Shop, type ShopSuggestion, type User } from './api/client';
import { SiteHeader } from './components/SiteHeader';
import { TermsPrompt } from './components/TermsPrompt';
import { AccountPanel } from './components/AccountPanel';
import { AuthForm } from './components/AuthForm';
import { ShopRow } from './components/ShopRow';
import { StockBadge } from './components/StockBadge';
import { GameMenu } from './components/GameMenu';
import { fmtDate } from './utils/format';

export default function App() {
  // undefined while checking the session, null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  /** The sign-in / register screen is only shown on request (or from an email link). */
  const [auth, setAuth] = useState<'login' | 'register' | null>(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has('register')) return 'register';
    return q.has('activate') || q.has('reset') || q.has('login') ? 'login' : null;
  });

  /** The current version of the Terms (from the server); a signed-in person with an older one is asked to accept it. */
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  useEffect(() => {
    api.config().then((c) => setTermsVersion(c.termsVersion), () => undefined);
  }, []);

  /** /app?account = the profile page ("My account"). */
  const [wantsAccount] = useState(() => new URLSearchParams(window.location.search).has('account'));
  const goHome = () => window.location.assign('/');
  const signOut = () => {
    void api
      .logout()
      .catch(() => undefined)
      .finally(goHome);
  };

  useEffect(() => {
    // The link in the "confirm your new email" message opens the app as /?confirm-email=<token>.
    const token = new URLSearchParams(window.location.search).get('confirm-email');
    if (token) {
      window.history.replaceState(null, '', window.location.pathname);
      api
        .confirmEmail(token)
        .then(() => setFlash({ ok: true, text: 'Your new email address is confirmed. Sign in with it.' }))
        .catch((err) => setFlash({ ok: false, text: err instanceof Error ? err.message : String(err) }))
        .finally(() => api.me().then(setUser, () => setUser(null)));
      return;
    }
    api.me().then(setUser, () => setUser(null));
  }, []);

  if (user === undefined) return <main className="auth sub">Loading…</main>;
  return (
    <>
      {flash && (
        <div className={`banner ${flash.ok ? 'ok' : 'error'}`} onClick={() => setFlash(null)}>
          {flash.text}
        </div>
      )}
      {user && termsVersion && user.termsVersion !== termsVersion && (
        <TermsPrompt user={user} version={termsVersion} onAccepted={setUser} onSignOut={signOut} />
      )}
      {user === null && (auth || wantsAccount) ? (
        <AuthForm
          initialMode={auth ?? 'login'}
          onSignedIn={(u) => {
            // After signing in the visitor lands on the home page (or on the profile page they asked for).
            if (wantsAccount) {
              setUser(u);
              setAuth(null);
            } else {
              goHome();
            }
          }}
          onClose={goHome}
        />
      ) : user && wantsAccount ? (
        <AccountPanel page user={user} onClose={goHome} onUserChange={setUser} onDeleted={goHome} onSignOut={signOut} />
      ) : (
        <Tracker
          user={user}
          onUserChange={setUser}
          onSignIn={(mode) => setAuth(mode)}
          onSignOut={signOut}
          onSessionExpired={() => setUser(null)}
        />
      )}
    </>
  );
}

function Tracker({
  user,
  onSignIn,
  onSignOut,
  onSessionExpired,
}: {
  /** null = visitor who is not signed in: sees products and shops, nothing else. */
  user: User | null;
  onUserChange: (user: User) => void;
  onSignIn: (mode: 'login' | 'register') => void;
  onSignOut: () => void;
  onSessionExpired: () => void;
}) {
  const isAdmin = user?.role === 'admin';
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  /** Shops that visitors suggested on the home page (admin only). */
  const [suggestions, setSuggestions] = useState<ShopSuggestion[]>([]);
  /** The selected tab of the games menu; '' = all games. */
  const [game, setGame] = useState('');

  const [shopFilter, setShopFilter] = useState<number | ''>('');
  const [inStockOnly, setInStockOnly] = useState(false);

  const [newShopUrl, setNewShopUrl] = useState('');
  const [newShopSearch, setNewShopSearch] = useState('');
  const [newShopGame, setNewShopGame] = useState('');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onSessionExpired();
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [onSessionExpired]);

  const loadProducts = useCallback(
    () =>
      api
        .products({ shopId: shopFilter === '' ? undefined : shopFilter, game: game || undefined, inStock: inStockOnly })
        .then(setProducts),
    [shopFilter, game, inStockOnly],
  );

  const loadAll = useCallback(
    () =>
      guard(async () => {
        const [s, r, cfg, g, sug] = await Promise.all([api.shops(), api.runs(), isAdmin ? api.settings() : null, api.games(), isAdmin ? api.suggestions() : []]);
        setSuggestions(sug);
        setGames(g);
        setShops(s);
        setRuns(r);
        setSettings(cfg);
        await loadProducts();
      }),
    [guard, loadProducts, isAdmin],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runNow = () =>
    guard(async () => {
      setRunning(true);
      setNotice(null);
      try {
        await api.run();
        await loadAll();
      } finally {
        setRunning(false);
      }
    });

  const addShop = (e: FormEvent) => {
    e.preventDefault();
    void guard(async () => {
      await api.addShop({ url: newShopUrl, searchUrl: newShopSearch.trim() || undefined, game: newShopGame || game || 'pokemon' });
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
  const gameName = (slug: string) => games.find((g) => g.slug === slug)?.name ?? slug;
  const inGame = (slug: string | undefined) => !game || (slug ?? 'pokemon') === game;
  const shownShops = shops.filter((s) => inGame(s.game));

  return (
    <>
    {user && <SiteHeader user={user} onSignOut={onSignOut} current={isAdmin ? 'admin' : undefined} />}
    <main>
      <header className="top">
        <div>
          <h1>Trading Card Tracker</h1>
          <p className="sub">Checks your shops once a day for Pokémon, One Piece, Yu-Gi-Oh!, Magic and other card games.</p>
        </div>
        <div className="side">
          <div className="account">
            {user ? null : (
              <>
                <button className="link" onClick={() => onSignIn('login')}>
                  Sign in
                </button>
                <button className="primary" onClick={() => onSignIn('register')}>
                  Register
                </button>
              </>
            )}
          </div>
          {isAdmin && (
            <div className="run-box">
              <button className="primary" onClick={runNow} disabled={running}>
                {running ? 'Checking…' : 'Run check now'}
              </button>
            </div>
          )}
        </div>
      </header>

      <GameMenu games={games} selected={game} onSelect={setGame} isAdmin={isAdmin} onChanged={loadAll} run={guard} />

      {error && <div className="banner error">{error}</div>}
      {notice && <div className="banner ok">{notice}</div>}

      <section>
        <h2>Last run</h2>
        {lastRun ? (
          <>
            <p className="sub">
              {fmtDate(lastRun.startedAt)} · {lastRun.source} · search “{lastRun.query}”
            </p>
            <div className="chips">
              {lastRun.shops.filter((s) => inGame(s.game)).map((s) => (
                <div key={s.shopId} className={`chip ${s.status}`}>
                  <strong>{s.shopName}</strong>
                  {!game && <span className="sub">{gameName(s.game ?? 'pokemon')}</span>}
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
          <p className="sub">No checks yet.{isAdmin && ' Press “Run check now”.'}</p>
        )}
      </section>

      <section>
        <h2>Shops</h2>
        {!isAdmin ? (
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Checked page</th>
              </tr>
            </thead>
            <tbody>
              {shownShops
                .filter((s) => s.enabled)
                .map((shop) => (
                  <tr key={shop.id}>
                    <td>
                      <strong>{shop.name}</strong>
                      {!game && <div className="sub">{gameName(shop.game)}</div>}
                    </td>
                    <td className="sub">{shop.searchUrl}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <>
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
                {shownShops.map((shop) => (
                  <ShopRow
                    key={shop.id}
                    shop={shop}
                    gameName={game ? undefined : gameName(shop.game)}
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
                {shownShops.length === 0 && (
                  <tr>
                    <td colSpan={5} className="sub">
                      No shop pages for this game yet.
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
              <select value={newShopGame || game || 'pokemon'} onChange={(e) => setNewShopGame(e.target.value)} aria-label="Game">
                {games.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button type="submit">Add shop</button>
            </form>
          </>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Products</h2>
          <div className="row">
            <select value={shopFilter} onChange={(e) => setShopFilter(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">All shops</option>
              {shownShops.map((s) => (
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
                <td>
                  {p.shopName}
                  {!game && <div className="sub">{gameName(p.game)}</div>}
                </td>
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

      {isAdmin && (
        <section>
          <h2>Suggested shops</h2>
          {suggestions.length === 0 ? (
            <p className="sub">No suggestions yet. Visitors send them with “Suggest a shop” on the home page.</p>
          ) : (
            <>
              <p className="sub">
                Sent by visitors and not checked for safety. Before opening a link, check it at{' '}
                <a href="https://www.virustotal.com/gui/home/url" target="_blank" rel="noreferrer">
                  virustotal.com
                </a>
                .
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Shop address</th>
                    <th>Note</th>
                    <th>Received</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.id}>
                      <td style={{ wordBreak: 'break-all' }}>{s.url}</td>
                      <td>{s.note || '—'}</td>
                      <td>{fmtDate(s.createdAt.includes('T') ? s.createdAt : `${s.createdAt.replace(' ', 'T')}Z`)}</td>
                      <td>
                        <div className="row">
                          <button
                            type="button"
                            onClick={() => {
                              setNewShopUrl(s.url);
                              setNotice('The address is filled in the “Add shop” form above. Choose the game and press Add.');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Use in “Add shop”
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void guard(async () => {
                                await api.deleteSuggestion(s.id);
                                setSuggestions(await api.suggestions());
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {settings && (
        <section>
          <h2>Settings</h2>
          <form className="grid" onSubmit={saveSettings}>
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
    </>
  );
}
