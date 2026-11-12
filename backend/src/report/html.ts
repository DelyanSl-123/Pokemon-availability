import type { RunSummary } from '../types';

/** Makes JSON safe to embed inside a <script> element. */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

/** CollectibleMarket logo: two stacked trading cards with a sparkle. Used in the header and as favicon. */
export const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="CollectibleMarket">' +
  '<defs><linearGradient id="cm-g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#ff6a3d"/><stop offset="1" stop-color="#c81e0a"/></linearGradient></defs>' +
  '<rect x="9" y="13" width="30" height="42" rx="5" fill="#2b3a4f" stroke="#fff" stroke-width="2" transform="rotate(-12 24 34)"/>' +
  '<g transform="rotate(10 39 30)">' +
  '<rect x="24" y="9" width="30" height="42" rx="5" fill="url(#cm-g)" stroke="#fff" stroke-width="2"/>' +
  '<path d="M39 19.5 41.6 27.4 49.5 30 41.6 32.6 39 40.5 36.4 32.6 28.5 30 36.4 27.4Z" fill="#fff"/>' +
  '</g></svg>';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * One self-contained HTML page (no server needed) with every product found in a run, shown as
 * cards with images: search box, shop / stock / new filters, sorting, shop status and product links.
 * The daily run publishes it to GitHub Pages; `npm run report` writes it locally.
 */
export interface ReportOptions {
  /** Address of the web app; adds a sign-in / register icon to the header (http(s) only). */
  appUrl?: string;
  /** Exact address of the sign-in link; overrides appUrl (used when the report is the home page of the app). */
  signInUrl?: string;
  /** Shops that are never checked automatically; listed with a link to check them by hand. */
  manualShops?: { name: string; url: string; note: string; game?: string }[];
  /** Address that accepts shop suggestions (POST, JSON); shows the "Suggest a shop" form. Site only. */
  suggestUrl?: string;
  /** Public site: makes the page indexable (meta tags, canonical, structured data). Without it the page is noindex. */
  seo?: { baseUrl: string; /** the page of one game; omitted for the home page */ game?: { slug: string; name: string } };
}

const trimSlash = (u: string) => u.replace(/\/+$/, '');

function seoTitle(game?: { name: string }): string {
  return game
    ? `${game.name} карти и продукти в България – цени и наличност | CollectibleMarket`
    : 'CollectibleMarket – TCG карти в България: Pokémon, One Piece, Yu-Gi-Oh!, Magic | цени и наличност';
}

function jsonLd(o: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
}

/** Meta description, canonical, Open Graph and structured data for the public pages. */
function seoHead(
  baseUrl: string,
  game: { slug: string; name: string } | undefined,
  games: { slug: string; name: string }[],
  products: RunSummary['products'],
  label: (shop: string, game: string) => string,
): string {
  const base = trimSlash(baseUrl);
  const url = game ? `${base}/games/${game.slug}` : `${base}/`;
  const list = products.filter((p) => !game || (p.game ?? 'pokemon') === game.slug);
  const names = games.map((g) => g.name).join(', ');
  const desc = game
    ? `Всички ${game.name} TCG продукти от български онлайн магазини на едно място: бустери, кутии и колоди с цени, наличност и директни линкове. Сравни и намери най-добрата оферта.`
    : `Следим цените и наличностите на TCG карти (${names}) в български онлайн магазини. Бустери, кутии и колоди с цени и директни линкове – намери най-добрата оферта.`;
  const title = seoTitle(game);
  const items = list.slice(0, 40).map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Product',
      name: p.title,
      url: p.url,
      ...(p.imageUrl ? { image: p.imageUrl } : {}),
      ...(p.price != null && p.currency
        ? {
            offers: {
              '@type': 'Offer',
              price: p.price,
              priceCurrency: p.currency,
              url: p.url,
              seller: { '@type': 'Organization', name: label(p.shopName, p.game ?? 'pokemon') },
              ...(p.inStock === true ? { availability: 'https://schema.org/InStock' } : p.inStock === false ? { availability: 'https://schema.org/OutOfStock' } : {}),
            },
          }
        : {}),
    },
  }));
  const blocks = [
    jsonLd({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'CollectibleMarket', url: `${base}/`, inLanguage: 'bg' }),
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'CollectibleMarket', item: `${base}/` },
        ...(game ? [{ '@type': 'ListItem', position: 2, name: game.name, item: url }] : []),
      ],
    }),
    ...(items.length > 0 ? [jsonLd({ '@context': 'https://schema.org', '@type': 'ItemList', name: game ? `${game.name} продукти` : 'TCG продукти', itemListElement: items })] : []),
  ];
  return [
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="CollectibleMarket">',
    '<meta property="og:locale" content="bg_BG">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    '<meta name="twitter:card" content="summary">',
    ...blocks,
  ].join('\n');
}

/** Plain list of the products for visitors and crawlers without JavaScript. */
function crawlableList(products: RunSummary['products'], label: (shop: string, game: string) => string): string {
  if (products.length === 0) return '';
  const rows = products.slice(0, 60).map((p) => {
    const price = p.price != null ? ` – ${p.price.toFixed(2)} ${esc(p.currency ?? '')}` : '';
    return `<li><a href="${esc(p.url)}" rel="nofollow noopener">${esc(p.title)}</a> (${esc(label(p.shopName, p.game ?? 'pokemon'))})${price}</li>`;
  });
  return `<noscript><ul>${rows.join('')}</ul></noscript>`;
}

export function buildReportHtml(summary: RunSummary, opts: ReportOptions = {}): string {
  // Sign-in / register icon in the header, linking to the web app (only http(s) addresses).
  const appUrl = opts.appUrl && /^https?:\/\//i.test(opts.appUrl) ? opts.appUrl.replace(/\/+$/, '') + '/' : '';
  const signIn = opts.signInUrl && /^(https?:\/\/|\/)/i.test(opts.signInUrl) ? opts.signInUrl : appUrl;
  // The register link opens the same screen in registration mode (?login becomes ?register).
  const registerUrl = /[?&]login\b/.test(signIn) ? signIn.replace(/([?&])login\b/, '$1register') : signIn + (signIn.includes('?') ? '&' : '?') + 'register';
  const accountLink = signIn
    ? `<a class="account" href="${esc(signIn)}" title="Sign in / Register" aria-label="Sign in or register">` +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>' +
      '<span>Sign in</span></a>' +
      `<a class="account reg" href="${esc(registerUrl)}" title="Create an account" aria-label="Register"><span>Register</span></a>`
    : '';
  // The menu: the games that were checked. Older summaries (before games existed) are all Pokémon.
  const games = summary.games && summary.games.length > 0 ? summary.games : [{ slug: 'pokemon', name: 'Pokémon' }];
  const gameName = new Map(games.map((g) => [g.slug, g.name]));
  // The same shop can be listed for several games: then its name gets the game appended.
  const namesCount = new Map<string, number>();
  for (const s of summary.shops) namesCount.set(s.shopName, (namesCount.get(s.shopName) ?? 0) + 1);
  const label = (shopName: string, game: string) =>
    (namesCount.get(shopName) ?? 0) > 1 ? `${shopName} · ${gameName.get(game) ?? game}` : shopName;
  const when = new Date(summary.startedAt).toLocaleString('en-GB', { timeZone: 'Europe/Sofia' });

  const data = {
    generated: when,
    query: summary.query,
    games,
    shops: summary.shops.map((s) => ({
      name: label(s.shopName, s.game ?? 'pokemon'),
      game: s.game ?? 'pokemon',
      page: s.searchUrl ?? '',
      status: s.status,
      message: s.message ?? '',
      found: s.found,
      scanned: s.scanned ?? null,
    })),
    manualShops: (opts.manualShops ?? []).map((s) => ({ name: s.name, page: s.url, note: s.note, game: s.game ?? 'pokemon' })),
    products: summary.products.map((p) => ({
      title: p.title,
      url: p.url,
      shop: label(p.shopName, p.game ?? 'pokemon'),
      game: p.game ?? 'pokemon',
      price: p.price,
      currency: p.currency ?? '',
      inStock: p.inStock,
      isNew: p.isNew,
      backInStock: p.backInStock,
      image: p.imageUrl ?? '',
    })),
  };

  const LIGHT_VARS =
    '--bg:#F3F5F9; --surface:#fff; --text:#10131C; --muted:#5B6474; --line:#E1E5EC; --accent:#D92F08; --accent-t:#C22A07;' +
    '--ok:#166534; --ok-bg:#E3F4E9; --bad:#B42318; --bad-bg:#FCEBE8; --warn:#A85A07; --unk-bg:#ECEFF4;' +
    '--img:#fff; --hero:#fff; --hero-text:#10131C; --hero-muted:#5B6474; --hero-line:#E1E5EC; --hero-ok:#166534; --hero-new:#B45309; --hero-hover:#F3F5F9; --logo-edge:#fff;' +
    '--field:#F3F5F9; --field-line:#D5DBE5; --badge-bg:#FDE7DF; --badge-t:#B4270A; --inv:#10131C; --inv-t:#fff;' +
    '--shadow:0 1px 2px rgba(16,19,28,.04), 0 6px 20px rgba(16,19,28,.05); --shadow-hover:0 2px 4px rgba(16,19,28,.06), 0 14px 32px rgba(16,19,28,.12);';
  const DARK_VARS =
    '--bg:#0D1016; --surface:#161A23; --text:#F1F3F7; --muted:#A3ACBB; --line:#262C3A; --accent:#D92F08; --accent-t:#FF7A52;' +
    '--ok:#6FE0A0; --ok-bg:rgba(111,224,160,.12); --bad:#FF9A8F; --bad-bg:rgba(255,154,143,.12); --warn:#FBBF24; --unk-bg:rgba(255,255,255,.07);' +
    '--img:#F4F3F0; --hero:#161A23; --hero-text:#F1F3F7; --hero-muted:#A3ACBB; --hero-line:#262C3A; --hero-ok:#6FE0A0; --hero-new:#FFB86B; --hero-hover:#0D1016; --logo-edge:#fff;' +
    '--field:#0D1016; --field-line:#2E3545; --badge-bg:rgba(255,106,61,.14); --badge-t:#FF8A63; --inv:#F1F3F7; --inv-t:#0D1016;' +
    '--shadow:0 1px 2px rgba(0,0,0,.3); --shadow-hover:0 12px 30px rgba(0,0,0,.45);';
  const suggestUrl = opts.suggestUrl && /^(https?:\/\/|\/)/i.test(opts.suggestUrl) ? opts.suggestUrl : '';
  const seo = opts.seo;
  const seoGame = seo?.game && /^[a-z0-9-]+$/.test(seo.game.slug) ? seo.game : undefined;
  const initialGame = seoGame ? seoGame.slug : '';
  const head = seo ? seoHead(seo.baseUrl, seoGame, games, summary.products, label) : '';
  const robotsMeta = seo
    ? '<meta name="robots" content="index, follow, max-image-preview:large">'
    : '<meta name="robots" content="noindex, nofollow, noarchive">';
  const pageTitle = seo ? seoTitle(seoGame) : `CollectibleMarket · ${when}`;
  const h1Text = seoGame
    ? `${seoGame.name} TCG products in Bulgarian shops: prices and availability`
    : 'Trading card games in Bulgarian shops: Pokémon, One Piece, Yu-Gi-Oh! and Magic prices and availability';
  const crawlList = seo ? crawlableList(summary.products.filter((p) => !seoGame || (p.game ?? 'pokemon') === seoGame.slug), label) : '';
  // Footer links: real addresses on the public site (one page per game), in-page switches elsewhere.
  const footGames = games
    .map((g) => `<a href="${seo ? `${esc(trimSlash(seo.baseUrl))}/games/${esc(g.slug)}` : '#'}" data-game="${esc(g.slug)}">${esc(g.name)}</a>`)
    .join('');
  const footAccount = signIn
    ? `<div class="fcol"><b>Account</b><a href="${esc(signIn)}">Sign in</a><a href="${esc(registerUrl)}">Register</a></div>`
    : '';
  const footLegal = seo || suggestUrl ? '<div class="fcol"><b>Legal</b><a href="/terms.html">Terms and Conditions</a><a href="/privacy.html">Privacy Policy</a></div>' : '';
  const suggestBand = suggestUrl
    ? '<section class="suggest"><div><h2>Know a shop we should check?</h2><p>Send us its link and we will add it to the daily check.</p></div>' +
      '<button type="button" id="suggest-open">Suggest a shop</button></section>'
    : '';
  const suggestDialog = suggestUrl
    ? `<dialog class="sdlg" id="suggest-dlg" aria-labelledby="sdlg-title"><form id="suggest-form" data-url="${esc(suggestUrl)}" novalidate>` +
      '<h2 id="sdlg-title">Suggest a shop</h2><p class="sub">Tell us which shop sells trading cards and we will try to add it.</p>' +
      '<label for="sg-url">Shop address</label><input type="text" id="sg-url" name="url" maxlength="300" placeholder="shop.bg" autocomplete="off" required>' +
      '<label for="sg-note">Note (optional)</label><textarea id="sg-note" name="note" maxlength="500" placeholder="Which games does it sell?"></textarea>' +
      '<div class="hp" aria-hidden="true"><label for="sg-web">Website</label><input type="text" id="sg-web" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<div class="msg" id="sg-msg" role="status"></div>' +
      '<div class="acts"><button type="button" class="btn ghost" id="sg-cancel">Close</button><button type="submit" class="btn primary" id="sg-send">Send</button></div>' +
      '</form></dialog>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${robotsMeta}
<title>${esc(pageTitle)}</title>
${head}
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script>try { var t = localStorage.getItem('cm-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}</script>
<style>
  :root { ${LIGHT_VARS} --holo:linear-gradient(90deg,#e3350d,#f5b301 30%,#2bb7a8 60%,#6a5cff 85%,#e3350d); color-scheme:light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { ${DARK_VARS} color-scheme:dark; } }
  :root[data-theme=dark] { ${DARK_VARS} color-scheme:dark; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1240px; margin:0 auto; padding:0 16px; }
  a { color:var(--accent); }
  .sub { color:var(--muted); font-size:.85rem; }

  /* hero */
  .brand { display:flex; align-items:center; gap:14px; }
  .brand svg { width:52px; height:52px; flex:none; filter:drop-shadow(0 4px 10px rgba(227,53,13,.35)); }
  .bname { font-size:1.8rem; font-weight:800; letter-spacing:-.03em; line-height:1.05; }
  .bname span { color:var(--accent); }
  .account { display:inline-flex; align-items:center; gap:7px; padding:7px 14px 7px 9px; border:1px solid var(--hero-line); border-radius:999px; background:var(--hero-hover); color:var(--hero-text); text-decoration:none; font-size:.9rem; font-weight:600; transition:background .15s, border-color .15s; }
  .account.reg { margin-left:6px; padding:7px 16px; background:var(--accent); border-color:var(--accent); color:#fff; }
  .account.reg:hover { filter:brightness(1.08); background:var(--accent); border-color:var(--accent); }
  .account:hover { background:var(--hero-hover); border-color:var(--muted); }
  .account svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
  @media (max-width:1400px) { .gamenav button { padding:20px 9px; font-size:.88rem; } .account:not(.reg) span { display:none; } .account:not(.reg) { padding:8px; } }
  @media (max-width:480px) { .account:not(.reg) { display:none; } .account.reg { padding:7px 12px; margin-left:0; } }

  .sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  #results { scroll-margin-top:76px; }

  /* shops */
  .section-label { margin:22px 0 8px; font-size:.72rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  /* top bar: stays on screen while scrolling */
  .topbar { position:sticky; top:0; z-index:30; background:var(--hero); color:var(--hero-text); border-bottom:1px solid var(--hero-line); }
  .bar { display:flex; align-items:center; gap:14px; height:60px; }
  .bar .brand { gap:10px; flex:none; }
  .bar .brand svg { width:34px; height:34px; filter:none; }
  .bar .bname { font-size:1.2rem; }
  .gamenav { display:flex; gap:2px; margin-left:18px; flex:1; min-width:0; overflow-x:auto; scrollbar-width:none; }
  .gamenav::-webkit-scrollbar { display:none; }
  .gamenav button { font:inherit; cursor:pointer; background:none; border:0; color:inherit; }
  .gamenav button { position:relative; padding:20px 12px; font-size:.92rem; font-weight:600; color:var(--hero-muted); white-space:nowrap; }
  .gamenav button:hover { color:var(--hero-text); }
  .gamenav button.active { color:var(--hero-text); }
  .gamenav button.active::after { content:""; position:absolute; left:12px; right:12px; bottom:0; height:3px; border-radius:3px 3px 0 0; background:var(--accent); }
  .iconbtn, .fbtn { font:inherit; cursor:pointer; display:inline-flex; align-items:center; gap:8px; color:var(--hero-text); background:var(--hero-hover); border:1px solid var(--hero-line); border-radius:999px; height:38px; }
  .iconbtn { width:38px; justify-content:center; padding:0; }
  .fbtn { padding:0 16px 0 12px; font-weight:650; font-size:.9rem; margin-left:auto; }
  .gamenav + .fbtn { margin-left:0; }
  .fbtn[aria-expanded=true] { border-color:var(--accent); }
  .fbtn b { background:var(--accent); color:#fff; border-radius:999px; font-size:.72rem; min-width:18px; height:18px; line-height:18px; text-align:center; padding:0 5px; }
  .fbtn b:empty { display:none; }
  .iconbtn svg, .fbtn svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
  .search.topsearch { flex:none; width:150px; min-width:0; transition:width .2s; }
  .search.topsearch:focus-within { width:300px; }
  .topsearch input { height:36px; border-radius:999px; background:var(--hero-hover); border-color:var(--hero-line); color:var(--hero-text); }
  .topsearch input::placeholder { color:var(--hero-muted); }
  .topsearch svg { stroke:var(--hero-muted); }
  .fpanel { position:absolute; top:100%; right:0; left:0; }
  .fpanel .wrap { display:flex; justify-content:flex-end; }

  .fpanel .controls { margin:8px 0 0; width:min(560px,100%); flex-direction:column; align-items:stretch; padding:16px; border-radius:14px; box-shadow:var(--shadow-hover); color:var(--text); }
  .fpanel .row { display:flex; gap:8px; flex-wrap:wrap; }
  .fpanel .row select { flex:1; min-width:0; }
  .fpanel .actions { display:flex; gap:8px; align-items:center; }
  .fpanel .actions .sub { margin-left:auto; }
  @media (max-width:860px) {
    .search.topsearch, .search.topsearch:focus-within { flex:1; width:auto; } .gamenav + .fbtn { margin-left:0; }
    .bar { gap:10px; } .bar .bname { font-size:1.05rem; } .gamenav + .fbtn { margin-left:auto; }
  }
  @media (max-width:560px) { .bar .brand .bname { display:none; } }
  @media (max-width:480px) { .fbtn span.t { display:none; } .fbtn { padding:0 10px; } .bar .brand .bname { font-size:.98rem; } }
  .shops { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { font:inherit; color:inherit; text-align:left; cursor:pointer; display:flex; gap:9px; align-items:flex-start; background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:8px 12px 8px 10px; font-size:.85rem; box-shadow:var(--shadow); transition:border-color .15s; max-width:100%; }
  .chip:hover { border-color:var(--muted); }
  .chip b { font-weight:650; }
  .chip .dot { margin-top:6px; }
  .chip { border-left:4px solid var(--shop, var(--line)); }
  .chip.active { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
  .dot { width:8px; height:8px; border-radius:50%; flex:none; background:var(--ok); }
  .chip.blocked .dot, .chip.error .dot { background:var(--warn); }
  .chip.manual { border-style:dashed; border-left:4px solid var(--muted); box-shadow:none; background:transparent; color:inherit; text-decoration:none; }
  .chip.manual .dot { background:transparent; border:2px solid var(--muted); }
  a.chip.manual:hover { border-color:var(--accent); }
  a.chip.manual:hover .sub:first-of-type { color:var(--accent); }
  @media (max-width:560px) {
    .shops { flex-wrap:nowrap; overflow-x:auto; margin:0 -16px; padding:2px 16px 8px; scrollbar-width:none; }
    .shops::-webkit-scrollbar { display:none; }
    .chip { flex:none; white-space:nowrap; }
  }

  /* toolbar */
  .controls { display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding:12px; margin-top:0; background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:var(--shadow); }
  .controls .btn { height:38px; padding:0 18px; border-radius:10px; font:inherit; font-size:.9rem; font-weight:650; cursor:pointer; }
  .controls .btn.go { background:var(--accent); color:#fff; border:1px solid var(--accent); }
  .controls .btn.reset { background:transparent; color:var(--muted); border:1px solid var(--line); }
  .controls .sub { margin-left:auto; }
  .search { position:relative; flex:1; min-width:200px; }
  .search svg { position:absolute; left:11px; top:50%; width:16px; height:16px; transform:translateY(-50%); fill:none; stroke:var(--muted); stroke-width:2; stroke-linecap:round; pointer-events:none; }
  input[type=search], select { font:inherit; font-size:.9rem; color:inherit; background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:8px 11px; height:38px; }
  input[type=search] { width:100%; padding-left:34px; }
  input[type=search]:focus, select:focus { outline:2px solid color-mix(in srgb, var(--accent) 40%, transparent); outline-offset:0; border-color:var(--accent); }
  .toggle { position:relative; display:inline-flex; cursor:pointer; }
  .toggle input { position:absolute; opacity:0; width:1px; height:1px; }
  .toggle span { display:inline-flex; align-items:center; height:38px; padding:0 14px; border:1px solid var(--line); border-radius:999px; background:var(--surface); font-size:.88rem; font-weight:600; user-select:none; transition:background .15s, color .15s, border-color .15s; }
  .toggle input:checked + span { background:var(--text); color:var(--bg); border-color:var(--text); }
  .toggle input:focus-visible + span { outline:2px solid var(--accent); outline-offset:2px; }
  #count { margin-left:auto; white-space:nowrap; }
  @media (max-width:560px) { .search { flex-basis:100%; } .controls select { flex:1 1 40%; min-width:0; } }

  /* results */
  .group { --shop:var(--accent); display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:40px 0 14px; padding:12px 14px 12px 12px; background:var(--surface); border:1px solid var(--line); border-left:6px solid var(--shop); border-radius:12px; box-shadow:var(--shadow); }
  #results > .group:first-child { margin-top:22px; }
  .group .mark { width:38px; height:38px; flex:none; border-radius:10px; background:var(--shop); color:#fff; display:grid; place-items:center; font-weight:800; font-size:1.15rem; text-transform:uppercase; }
  .group h2 { margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-.02em; line-height:1.1; }
  .group .count { padding:3px 10px; border-radius:999px; font-size:.78rem; font-weight:700; color:var(--shop); background:color-mix(in srgb, var(--shop) 14%, transparent); white-space:nowrap; }
  .group a { margin-left:auto; padding:6px 12px; border:1px solid var(--line); border-radius:999px; color:var(--text); font-size:.85rem; font-weight:600; text-decoration:none; white-space:nowrap; transition:border-color .15s, color .15s; }
  .group a:hover { border-color:var(--shop); color:var(--shop); }
  @media (max-width:480px) { .group h2 { font-size:1.2rem; } .group a { margin-left:50px; } }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:14px; }
  @media (max-width:420px) { .grid { grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; } }
  .card { position:relative; display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:var(--shadow); transition:transform .15s, box-shadow .15s, border-color .15s; }
  .card:hover { transform:translateY(-3px); box-shadow:var(--shadow-hover); border-color:color-mix(in srgb, var(--accent) 35%, var(--line)); }
  .card.picked { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent), var(--shadow); }
  .card-link { display:flex; flex-direction:column; flex:1; color:inherit; text-decoration:none; }
  a.card-link:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; border-radius:14px; }
  .pick { position:absolute; top:8px; right:8px; z-index:1; display:inline-flex; align-items:center; gap:6px; padding:4px 10px 4px 7px; border:1px solid var(--line); border-radius:999px; background:color-mix(in srgb, var(--surface) 92%, transparent); color:var(--text); font-size:.72rem; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.12); user-select:none; }
  .pick input { margin:0; width:15px; height:15px; accent-color:var(--accent); cursor:inherit; }
  .pick:has(input:disabled) { opacity:.45; cursor:not-allowed; }
  .card.picked .pick { background:var(--accent); border-color:var(--accent); color:#fff; }
  .card.picked .pick input { accent-color:#fff; }
  @media (max-width:420px) { .pick span { display:none; } .pick { padding:6px; } }
  .pic { position:relative; aspect-ratio:1; background:var(--img); display:flex; align-items:center; justify-content:center; border-bottom:1px solid var(--line); }
  .pic img { width:100%; height:100%; object-fit:contain; padding:12px; }
  .card.oos .pic img { filter:grayscale(1); opacity:.55; }
  .pic .none { display:flex; flex-direction:column; align-items:center; gap:8px; color:#9aa3af; font-size:.75rem; font-weight:600; }
  .pic .none svg { width:46%; max-width:96px; height:auto; opacity:.9; }
  .flags { position:absolute; top:8px; left:8px; display:flex; gap:4px; flex-wrap:wrap; }
  .flag { padding:3px 8px; border-radius:6px; font-size:.66rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#fff; background:var(--accent); box-shadow:0 2px 6px rgba(0,0,0,.18); }
  .flag.back { background:#15803d; }
  .body { padding:11px 12px 12px; display:flex; flex-direction:column; gap:4px; flex:1; }
  .shopname { color:color-mix(in srgb, var(--shop, var(--muted)) 78%, var(--text)); font-size:.72rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
  .title { font-weight:600; font-size:.9rem; line-height:1.35; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .foot { margin-top:auto; padding-top:8px; display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; }
  .price { font-weight:800; font-size:1.1rem; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
  .card.oos .price { color:var(--muted); }
  .stock { display:inline-flex; align-items:center; gap:5px; padding:2px 8px 2px 7px; border-radius:999px; font-size:.7rem; font-weight:700; white-space:nowrap; }
  .stock::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
  .stock.ok { color:var(--ok); background:var(--ok-bg); }
  .stock.bad { color:var(--bad); background:var(--bad-bg); }
  .stock.muted { color:var(--muted); background:var(--unk-bg); }
  .empty { padding:60px 0; text-align:center; }
  .empty b { display:block; color:var(--text); font-size:1rem; margin-bottom:4px; }
  footer { margin:48px 0 32px; padding-top:16px; border-top:1px solid var(--line); text-align:center; }
  [hidden] { display:none !important; }

  /* buttons */
  .btn { font:inherit; font-size:.88rem; font-weight:700; height:38px; padding:0 16px; border-radius:999px; border:1px solid transparent; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s, opacity .15s; }
  .btn.primary { background:var(--accent); color:#fff; }
  .btn.primary:hover:not(:disabled) { background:color-mix(in srgb, var(--accent) 85%, #000); }
  .btn:disabled { opacity:.45; cursor:not-allowed; }
  .btn.ghost { background:var(--surface); color:var(--text); border-color:var(--line); }
  .btn.ghost:hover { border-color:var(--muted); }
  .btn.ghost-dark { background:transparent; color:var(--hero-text); border-color:var(--hero-line); }
  .btn.ghost-dark:hover { border-color:var(--muted); }
  .btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }

  /* compare bar */
  .cmpbar { position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:5; width:min(760px, calc(100% - 32px)); display:flex; align-items:center; gap:12px; padding:10px 10px 10px 12px; border-radius:16px; background:var(--hero); color:var(--hero-text); border:1px solid var(--hero-line); box-shadow:0 12px 40px rgba(0,0,0,.35); }
  body.has-bar main { padding-bottom:84px; }
  .thumbs { display:flex; gap:6px; }
  .thumb { position:relative; width:44px; height:44px; flex:none; border-radius:9px; background:var(--img); display:flex; align-items:center; justify-content:center; }
  .thumb img { width:100%; height:100%; object-fit:contain; padding:3px; border-radius:9px; }
  .thumb .none span { display:none; }
  .thumb .none svg { width:26px; }
  .thumb-x { position:absolute; top:-6px; right:-6px; width:20px; height:20px; padding:0; border:2px solid var(--hero); border-radius:50%; background:#fff; color:#151922; font:700 13px/1 system-ui, sans-serif; cursor:pointer; }
  .cmp-text { display:flex; flex-direction:column; margin-right:auto; min-width:0; }
  .cmp-text b { font-size:.9rem; }
  .cmp-text span { color:var(--hero-muted); font-size:.75rem; }
  @media (max-width:560px) { .thumbs { display:none; } .cmpbar { gap:8px; } .btn { padding:0 12px; } }

  /* comparison page */
  .cmp-top { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:22px 0 4px; }
  .cmp-top h2 { margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-.02em; }
  .cmp-top .count { padding:3px 10px; border-radius:999px; font-size:.78rem; font-weight:700; color:var(--accent); background:color-mix(in srgb, var(--accent) 12%, transparent); }
  .cmp-top .count:empty { display:none; }
  .cmp-wrap { margin-top:16px; overflow-x:auto; background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:var(--shadow); }
  table.cmp { width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; }
  .cmp th, .cmp td { padding:14px; text-align:left; vertical-align:top; border-bottom:1px solid var(--line); border-left:1px solid var(--line); }
  .cmp tr:last-child td, .cmp tr:last-child th { border-bottom:0; }
  .cmp th[scope=row], .cmp-corner { position:sticky; left:0; z-index:1; width:130px; border-left:0; background:var(--surface); color:var(--muted); font-size:.72rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
  .cmp-product { border-top:4px solid var(--shop); }
  .cmp-pic { position:relative; aspect-ratio:1; max-width:200px; border-radius:10px; background:var(--img); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; margin-bottom:10px; }
  .cmp-pic img { width:100%; height:100%; object-fit:contain; padding:10px; }
  .cmp-pic .none svg { width:40%; }
  .cmp-name { display:block; color:var(--text); font-size:.92rem; font-weight:650; line-height:1.35; text-decoration:none; }
  a.cmp-name:hover { color:var(--accent); text-decoration:underline; }
  .cmp-remove { position:absolute; top:6px; right:6px; width:30px; height:30px; padding:0; display:grid; place-items:center; border:1px solid var(--line); border-radius:50%; background:#fff; color:#151922; font:700 18px/1 system-ui, sans-serif; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.15); transition:background .15s, color .15s, border-color .15s; }
  .cmp-remove:hover:not(:disabled) { background:var(--bad); border-color:var(--bad); color:#fff; }
  .cmp-remove:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .cmp-remove:disabled { opacity:.35; cursor:not-allowed; box-shadow:none; }
  .cmp-price { font-size:1.25rem; font-weight:800; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
  .cmp-best { display:inline-block; margin-top:4px; padding:2px 8px; border-radius:999px; font-size:.7rem; font-weight:700; color:var(--ok); background:var(--ok-bg); }
  .cmp-shop { display:inline-flex; align-items:center; gap:8px; font-weight:650; }
  .cmp-shop .mark { width:26px; height:26px; flex:none; border-radius:7px; background:var(--shop); color:#fff; display:grid; place-items:center; font-weight:800; font-size:.85rem; text-transform:uppercase; }
  .cmp-flags { display:flex; gap:4px; flex-wrap:wrap; }
  .cmp-flags .flag { box-shadow:none; }
  .cmp-open { display:inline-block; padding:7px 14px; border:1px solid var(--line); border-radius:999px; color:var(--text); font-size:.85rem; font-weight:600; text-decoration:none; }
  .cmp-open:hover { border-color:var(--shop); color:var(--shop); }
  @media (max-width:560px) { .cmp th[scope=row], .cmp-corner { width:92px; } .cmp th, .cmp td { padding:10px; } }

  /* ---- catalog layout (redesign) ---- */
  body { font:15px/1.5 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:1280px; padding:0 32px; }
  a { color:var(--accent-t); }
  .bname span { color:var(--accent-t); }
  .bar { height:80px; gap:18px; }
  .bar .brand svg { width:38px; height:38px; }
  .bar .bname { font-size:1.3rem; }
  .search.topsearch, .search.topsearch:focus-within { flex:1; width:auto; max-width:620px; margin:0 auto; }
  .topsearch input { height:50px; border-radius:999px; background:var(--field); border-color:var(--field-line); padding-left:46px; font-size:1rem; }
  .topsearch svg { left:18px; width:20px; height:20px; }
  .iconbtn { width:44px; height:44px; flex:none; background:none; }
  .iconbtn .moon { display:none; }
  :root[data-theme=dark] .iconbtn .moon { display:block; } :root[data-theme=dark] .iconbtn .sun { display:none; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) .iconbtn .moon { display:block; } :root:not([data-theme=light]) .iconbtn .sun { display:none; } }
  .account { height:44px; padding:0 14px; border:0; background:none; font-size:.95rem; font-weight:700; flex:none; }
  .account:hover { background:var(--hero-hover); }
  .account.reg { margin-left:0; padding:0 20px; background:var(--accent); color:#fff; }
  @media (min-width:701px) { .account:not(.reg) span { display:inline; } .account:not(.reg) { padding:0 14px; } }

  .intro { display:flex; align-items:center; justify-content:space-between; gap:40px; flex-wrap:wrap; padding:44px 0 32px; }
  .intro-text { flex:1 1 520px; min-width:0; }
  .headline { margin:0; font-weight:800; font-size:clamp(2rem, 4.2vw, 2.9rem); line-height:1.08; letter-spacing:-.035em; }
  .lead { margin:14px 0 0; max-width:600px; font-size:1.1rem; color:var(--muted); }
  .today { flex:0 1 380px; min-width:260px; padding:22px 24px; border-radius:18px; background:var(--surface); border:1px solid var(--line); }
  .eyebrow { font-size:.8rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  .tstats { margin-top:14px; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
  .tstats b { display:block; font-weight:800; font-size:1.75rem; letter-spacing:-.02em; line-height:1.15; font-variant-numeric:tabular-nums; }
  .tstats span { font-size:.8rem; color:var(--muted); }
  .tstats .s-ok b { color:var(--hero-ok); } .tstats .s-new b { color:var(--hero-new); }
  .today .sub { margin-top:12px; }

  .gamestrip { display:flex; align-items:center; gap:10px; padding:14px 18px; background:var(--surface); border:1px solid var(--line); border-radius:18px; }
  .glabel { flex:none; font-size:.88rem; font-weight:700; color:var(--muted); margin-right:4px; }
  .gamenav { display:flex; flex:1; min-width:0; margin:0; gap:10px; overflow-x:auto; }
  .gamenav button { flex:none; display:inline-flex; align-items:center; gap:10px; height:46px; padding:0 20px 0 10px; border-radius:999px; border:2px solid var(--field-line); background:var(--surface); color:var(--text); font-size:.95rem; font-weight:700; }
  .gamenav button:hover { border-color:var(--muted); }
  .gamenav button.active { background:var(--inv); color:var(--inv-t); border-color:var(--inv); }
  .gamenav button.active::after { display:none; }
  .gdot { width:26px; height:26px; border-radius:50%; flex:none; }

  .layout { display:flex; align-items:flex-start; gap:28px; margin-top:28px; }
  .side { flex:0 0 270px; min-width:0; }
  .maincol { flex:1; min-width:0; }
  .side .fbtn { display:none; }
  .side .fpanel { position:static; }
  .side .controls { flex-direction:column; align-items:stretch; gap:14px; width:auto; margin:0; padding:22px; border-radius:18px; box-shadow:none; }
  .side h2 { margin:0; font-size:1.15rem; font-weight:800; }
  .side .row { flex-direction:column; }
  .side select { width:100%; height:46px; border-radius:12px; }
  .side .toggle { display:flex; }
  .side .toggle span { width:100%; height:46px; border-radius:12px; }
  .side .actions .btn { flex:1; height:46px; border-radius:12px; }
  @media (min-width:901px) { .side .fpanel[hidden] { display:block !important; } }
  @media (max-width:900px) {
    .layout { flex-direction:column; gap:14px; }
    .side { flex:none; width:100%; }
    .side .fbtn { display:inline-flex; height:46px; padding:0 20px 0 16px; margin:0; color:var(--text); background:var(--surface); border-color:var(--line); }
    .side .fbtn span.t { display:inline; }
    .side .fpanel { margin-top:10px; }
  }
  .reshead { display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .reshead h2 { margin:0; font-size:1.75rem; font-weight:800; letter-spacing:-.025em; }
  #count { margin:0; }
  .group { margin:28px 0 14px; border-radius:14px; box-shadow:none; }
  #results > .group:first-child { margin-top:18px; }
  .grid { grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:18px; }
  @media (max-width:520px) { .grid { grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; } }
  .card { border-radius:18px; box-shadow:none; }
  .body { padding:14px 16px 16px; }
  .title { font-size:1rem; font-weight:700; }
  .price { font-size:1.35rem; }
  .open { margin-top:10px; height:42px; display:flex; align-items:center; justify-content:center; border-radius:12px; background:var(--accent); color:#fff; font-weight:700; font-size:.9rem; }
  .flag { border-radius:999px; background:var(--inv); color:var(--inv-t); box-shadow:none; }
  .pic .none svg { width:38%; max-width:78px; }
  .pic .none { color:var(--muted); }

  .sec { margin-top:56px; }
  .sec h2 { margin:0; font-size:2.1rem; font-weight:800; letter-spacing:-.03em; }
  .sec .shops { margin-top:16px; }
  .chip { border-radius:12px; box-shadow:none; }
  .steps { margin-top:28px; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:18px; }
  .step { padding:28px; border-radius:18px; background:var(--surface); border:1px solid var(--line); }
  .step .n { width:44px; height:44px; border-radius:12px; background:var(--badge-bg); color:var(--badge-t); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.25rem; }
  .step h3 { margin:18px 0 0; font-size:1.25rem; font-weight:700; }
  .step p { margin:8px 0 0; color:var(--muted); font-size:1rem; line-height:1.55; }
  .suggest { margin-top:56px; padding:40px 44px; border-radius:24px; background:linear-gradient(120deg, #D92F08, #F08A1B); display:flex; align-items:center; justify-content:space-between; gap:28px; flex-wrap:wrap; color:#fff; }
  .suggest h2 { margin:0; font-size:2rem; font-weight:800; letter-spacing:-.03em; line-height:1.1; }
  .suggest p { margin:10px 0 0; font-size:1.05rem; }
  .suggest button { height:52px; padding:0 28px; border:0; border-radius:13px; background:#10131C; color:#fff; font:inherit; font-weight:700; font-size:1rem; cursor:pointer; }
  .suggest button:focus-visible { outline:3px solid #fff; outline-offset:2px; }
  footer.sitefoot { margin:64px 0 0; padding:0; text-align:left; background:var(--surface); border-top:1px solid var(--line); }
  .footin { display:flex; flex-wrap:wrap; gap:40px; justify-content:space-between; padding-top:44px; padding-bottom:28px; }
  .footin .about { flex:1 1 340px; min-width:0; }
  .footin .about p { margin:12px 0 0; max-width:420px; font-size:.9rem; line-height:1.6; color:var(--muted); }
  .footin .bname { font-size:1.3rem; font-weight:800; letter-spacing:-.03em; }
  .fcols { display:flex; gap:56px; flex-wrap:wrap; }
  .fcol { display:flex; flex-direction:column; gap:10px; font-size:.95rem; }
  .fcol b { font-weight:800; }
  .fcol a { color:var(--muted); text-decoration:none; }
  .fcol a:hover { color:var(--accent-t); }
  .copy { padding-bottom:28px; font-size:.82rem; color:var(--muted); }
  dialog.sdlg { border:1px solid var(--line); border-radius:20px; padding:28px; width:min(480px, calc(100% - 32px)); background:var(--surface); color:var(--text); }
  dialog.sdlg::backdrop { background:rgba(0,0,0,.55); }
  .sdlg h2 { margin:0 0 6px; font-size:1.4rem; font-weight:800; }
  .sdlg label { display:block; margin-top:16px; font-weight:600; font-size:.9rem; }
  .sdlg input[type=text], .sdlg textarea { display:block; width:100%; margin-top:6px; font:inherit; color:inherit; background:var(--field); border:1px solid var(--field-line); border-radius:12px; padding:11px 12px; }
  .sdlg textarea { min-height:84px; resize:vertical; }
  .sdlg .hp { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
  .sdlg .acts { margin-top:20px; display:flex; gap:10px; justify-content:flex-end; }
  .sdlg .msg { margin-top:12px; font-size:.9rem; min-height:1.2em; }
  .sdlg .msg.ok { color:var(--ok); } .sdlg .msg.err { color:var(--bad); }
  @media (max-width:800px) { .steps { grid-template-columns:1fr; } .sec h2 { font-size:1.7rem; } }
  @media (max-width:700px) {
    .wrap { padding:0 16px; }
    .bar { height:64px; gap:10px; }
    .topsearch input { height:44px; }
    .intro { padding:28px 0 22px; gap:22px; }
    .today { flex:1 1 100%; }
    .gamestrip { padding:10px 12px; margin:0 -4px; }
    .glabel { display:none; }
    .suggest { padding:28px 22px; } .suggest h2 { font-size:1.6rem; }
    .fcols { gap:32px; }
  }
</style>
</head>
<body>
<div class="topbar">
  <div class="wrap bar">
    <div class="brand">${LOGO_SVG}<b class="bname">Collectible<span>Market</span></b></div>
    <div class="search topsearch">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="q" placeholder="Search in all shops…" aria-label="Search products">
    </div>
    <button type="button" class="iconbtn" id="themebtn" aria-label="Switch between light and dark" title="Light / dark">
      <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
      <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
    </button>
    ${accountLink}
  </div>
</div>
<main class="wrap" id="list-view">
  <h1 class="sr">${esc(h1Text)}</h1>
  <section class="intro">
    <div class="intro-text">
      <p class="headline">Find it in stock. Pay the lowest price.</p>
      <p class="lead">Trading card products from Bulgarian online shops, checked every day and compared in one place.</p>
    </div>
    <div class="today">
      <div class="eyebrow">Latest check</div>
      <div class="tstats">
        <div><b id="s-total">0</b><span>products</span></div>
        <div class="s-ok"><b id="s-stock">0</b><span>in stock</span></div>
        <div class="s-new"><b id="s-new">0</b><span>new</span></div>
      </div>
      <div class="sub">Checked ${esc(when)} (Sofia time)</div>
    </div>
  </section>

  <div class="gamestrip"><span class="glabel">Game</span><nav class="gamenav" id="games" aria-label="Games"></nav></div>

  <div class="layout">
    <aside class="side" id="filterbar" aria-label="Filters">
      <button type="button" class="fbtn" id="fbtn" aria-expanded="false" aria-controls="fpanel"><svg viewBox="0 0 24 24"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg><span class="t">Filter</span><b id="fcount"></b></button>
      <div class="fpanel" id="fpanel" hidden>
      <form class="controls" id="filters" autocomplete="off">
        <h2>Filters</h2>
        <div class="row">
          <select id="shop" aria-label="Shop"><option value="">All shops</option></select>
          <select id="sort" aria-label="Sort">
            <option value="shop">Group by shop, in stock first</option>
            <option value="price-asc">Price low → high</option>
            <option value="price-desc">Price high → low</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div class="row">
          <label class="toggle"><input type="checkbox" id="instock"><span>In stock only</span></label>
          <label class="toggle"><input type="checkbox" id="onlynew"><span>New only</span></label>
        </div>
        <div class="actions">
          <button type="submit" class="btn go">Filter</button>
          <button type="reset" class="btn reset" id="reset">Reset</button>
        </div>
      </form>
      </div>
    </aside>
    <div class="maincol">
      <div class="reshead"><h2 id="res-title">All products</h2><span class="sub" id="count"></span></div>
      <div id="results"></div>
    </div>
  </div>

  <section class="sec">
    <div class="eyebrow" id="shops-sum">Shops we check</div>
    <div class="shops" id="shops"></div>
  </section>

  <section class="sec">
    <h2>How it works</h2>
    <div class="steps">
      <div class="step"><div class="n">1</div><h3>We check the shops</h3><p>Every day our checker reads the product lists of Bulgarian online shops for each game.</p></div>
      <div class="step"><div class="n">2</div><h3>You compare</h3><p>See prices, stock and what is new in one list. Filter by shop, game or availability.</p></div>
      <div class="step"><div class="n">3</div><h3>You buy on the shop</h3><p>Open the product in the shop you prefer. We never take your order or your payment.</p></div>
    </div>
  </section>

  ${suggestBand}
  ${crawlList}
</main>

<main class="wrap" id="compare-view" hidden>
  <div class="cmp-top">
    <button type="button" class="btn ghost" id="compare-back">← Back to products</button>
    <h2>Compare products</h2>
    <span class="count" id="compare-count"></span>
  </div>
  <div id="compare-body"></div>
</main>

<footer class="sitefoot">
  <div class="wrap footin">
    <div class="about"><b class="bname">Collectible<span>Market</span></b><p>A search-only tracker. Prices and stock come from each shop's first results page. Buy on the shop's own website.</p></div>
    <nav class="fcols" aria-label="Footer">
      <div class="fcol" id="foot-games"><b>Games</b>${footGames}</div>
      ${footAccount}
      ${footLegal}
    </nav>
  </div>
  <div class="wrap copy">© CollectibleMarket. All trademarks belong to their owners.</div>
</footer>
${suggestDialog}

<div class="cmpbar" id="cmpbar" hidden>
  <div class="thumbs" id="cmp-thumbs"></div>
  <div class="cmp-text"><b id="cmp-count"></b><span id="cmp-hint"></span></div>
  <button type="button" class="btn ghost-dark" id="cmp-clear">Clear</button>
  <button type="button" class="btn primary" id="cmp-go">Compare</button>
</div>

<script type="application/json" id="data">${safeJson(data)}</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById('data').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var products = data.products;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function safeUrl(u) { return /^https?:\\/\\//i.test(u) ? u : ''; }
  // each shop gets its own colour (order of the shop list), used on its chip, heading and cards
  var palette = ['#e3350d', '#2563eb', '#0d9488', '#9333ea', '#d97706', '#db2777', '#0891b2', '#65a30d'];
  var shopNames = data.shops.map(function (s) { return s.name; });
  function shopColor(name) {
    var i = shopNames.indexOf(name);
    return palette[(i < 0 ? shopNames.length : i) % palette.length];
  }
  // neutral card placeholder for products without a (loadable) image
  var NOIMG = '<svg viewBox="0 0 86 120" aria-hidden="true"><rect x="3" y="3" width="80" height="114" rx="10" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="3"/>' +
    '<rect x="14" y="14" width="58" height="50" rx="6" fill="currentColor" fill-opacity=".14"/><rect x="14" y="76" width="44" height="6" rx="3" fill="currentColor" fill-opacity=".3"/>' +
    '<rect x="14" y="90" width="30" height="6" rx="3" fill="currentColor" fill-opacity=".2"/></svg>';
  function noImage() {
    var s = el('span', 'none');
    s.innerHTML = NOIMG;
    s.appendChild(el('span', '', 'No image'));
    return s;
  }
  function priceText(p) { return p.price === null ? '—' : p.price.toFixed(2) + ' ' + p.currency; }

  // the menu: one tab per game ('' = all games)
  var game = ${JSON.stringify(initialGame)};
  var games = data.games || [];
  function inGame(x) { return !game || x.game === game; }
  var THEMES = {
    pokemon: ['#e3350d', '#f59e0b'],
    onepiece: ['#0b3d91', '#e11d48'],
    yugioh: ['#4c1d95', '#b45309'],
    mtg: ['#14532d', '#9a3412']
  };
  function theme(slug) {
    if (THEMES[slug]) return THEMES[slug];
    var h = 0;
    for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
    return ['hsl(' + h + ',60%,32%)', 'hsl(' + ((h + 50) % 360) + ',65%,42%)'];
  }
  function setGame(slug) { game = slug; renderTabs(); buildShops(); render(); }
  function renderTabs() {
    var box = $('games');
    box.textContent = '';
    [{ slug: '', name: 'All games' }].concat(games).forEach(function (g) {
      var b = el('button', g.slug === game ? 'active' : '');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(g.slug === game));
      var dot = el('span', 'gdot');
      dot.style.background = g.slug ? theme(g.slug)[0] : 'var(--muted)';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(g.name));
      b.addEventListener('click', function () { setGame(g.slug); });
      box.appendChild(b);
    });
  }
  function updateTotals() {
    var inScope = products.filter(inGame);
    $('s-total').textContent = inScope.length;
    $('s-stock').textContent = inScope.filter(function (p) { return p.inStock === true; }).length;
    $('s-new').textContent = inScope.filter(function (p) { return p.isNew; }).length;
    var current = games.filter(function (g) { return g.slug === game; })[0];
    $('res-title').textContent = current ? current.name : 'All products';
  }
  function setPanel(open) {
    $('fpanel').hidden = !open; $('fbtn').setAttribute('aria-expanded', String(open));
  }
  $('fbtn').addEventListener('click', function (e) { e.stopPropagation(); setPanel($('fpanel').hidden); });
  $('fpanel').addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { setPanel(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setPanel(false); });


  // shop status chips (click to filter) + filter options, for the selected game
  function buildShops() {
    $('shops').textContent = '';
    $('shop').textContent = '';
    var all = el('option', '', 'All shops'); all.value = ''; $('shop').appendChild(all);
    updateTotals();
    $('shops-sum').textContent = 'Shops we check (' + (data.shops.filter(inGame).length + (data.manualShops || []).filter(inGame).length) + ')';
    data.shops.filter(inGame).forEach(function (s) {
      var chip = el('button', 'chip ' + s.status);
      chip.style.setProperty('--shop', shopColor(s.name));
      chip.type = 'button';
      chip.dataset.shop = s.name;
      chip.title = s.status === 'ok' ? 'Show only ' + s.name : s.status;
      chip.appendChild(el('span', 'dot'));
      var text = el('span');
      text.appendChild(el('b', '', s.name));
      var detail = s.status === 'ok'
        ? s.found + ' found' + (s.scanned !== null ? ' of ' + s.scanned + ' on page' : '')
        : s.status + ': ' + s.message;
      text.appendChild(el('div', 'sub', detail));
      if (s.status === 'ok' && s.message) text.appendChild(el('div', 'sub', s.message));
      chip.appendChild(text);
      chip.addEventListener('click', function () {
        $('shop').value = $('shop').value === s.name ? '' : s.name;
        render();
      });
      $('shops').appendChild(chip);
      var opt = el('option', '', s.name); opt.value = s.name; $('shop').appendChild(opt);
    });

    // shops that cannot be checked automatically: a link to their page, to check by hand
    (data.manualShops || []).filter(inGame).forEach(function (s) {
      var page = safeUrl(s.page);
      var chip = el(page ? 'a' : 'span', 'chip manual');
      if (page) { chip.href = page; chip.target = '_blank'; chip.rel = 'noreferrer'; }
      chip.title = 'Not checked automatically – open the shop to check it yourself';
      chip.appendChild(el('span', 'dot'));
      var text = el('span');
      text.appendChild(el('b', '', s.name));
      text.appendChild(el('div', 'sub', 'Check manually' + (page ? ' ↗' : '')));
      if (s.note) text.appendChild(el('div', 'sub', s.note));
      chip.appendChild(text);
      $('shops').appendChild(chip);
    });
  }

  function rank(p) { return p.inStock === true ? 0 : p.inStock === null ? 1 : 2; }
  var sorters = {
    'shop': function (a, b) { return a.shop.localeCompare(b.shop) || rank(a) - rank(b) || a.title.localeCompare(b.title); },
    'price-asc': function (a, b) { return (a.price === null) - (b.price === null) || a.price - b.price; },
    'price-desc': function (a, b) { return (a.price === null) - (b.price === null) || b.price - a.price; },
    'name': function (a, b) { return a.title.localeCompare(b.title); }
  };

  function picture(p, cls) {
    var pic = el('div', cls);
    var src = safeUrl(p.image);
    if (src) {
      var i = el('img');
      i.src = src; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
      i.addEventListener('error', function () { pic.replaceChild(noImage(), i); });
      pic.appendChild(i);
    } else {
      pic.appendChild(noImage());
    }
    return pic;
  }
  function stockBadge(p) {
    if (p.inStock === true) return el('span', 'stock ok', 'In stock');
    if (p.inStock === false) return el('span', 'stock bad', 'Out of stock');
    return el('span', 'stock muted', 'Stock unknown');
  }

  /* ---------- comparison: up to MAX_PICK products, chosen with the checkbox on each card ---------- */
  var MIN_PICK = 2;
  var MAX_PICK = 5;
  var STORE_KEY = 'cm-compare';
  var picked = []; // indexes into products, in the order they were chosen
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    // stored by product link, so a choice survives the next day's report
    saved.forEach(function (url) {
      var i = products.findIndex(function (p) { return p.url === url; });
      if (i >= 0 && picked.length < MAX_PICK) picked.push(i);
    });
  } catch (e) { /* storage unavailable: start empty */ }
  function savePicked() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(picked.map(function (i) { return products[i].url; }))); } catch (e) { /* ignore */ }
  }
  function setPicked(i, on) {
    var at = picked.indexOf(i);
    if (on && at < 0 && picked.length < MAX_PICK) picked.push(i);
    if (!on && at >= 0) picked.splice(at, 1);
    savePicked();
    refreshPicks();
  }

  function card(p) {
    var idx = products.indexOf(p);
    var c = el('div', 'card' + (p.inStock === false ? ' oos' : ''));
    c.dataset.i = idx;
    c.style.setProperty('--shop', shopColor(p.shop));

    var link = safeUrl(p.url);
    var main = el(link ? 'a' : 'div', 'card-link');
    if (link) { main.href = link; main.target = '_blank'; main.rel = 'noreferrer'; }

    var pic = picture(p, 'pic');
    var flags = el('div', 'flags');
    if (p.isNew) flags.appendChild(el('span', 'flag', 'New'));
    if (p.backInStock) flags.appendChild(el('span', 'flag back', 'Back in stock'));
    pic.appendChild(flags);
    main.appendChild(pic);

    var body = el('div', 'body');
    body.appendChild(el('div', 'shopname', p.shop));
    var title = el('div', 'title', p.title); title.title = p.title;
    body.appendChild(title);
    var foot = el('div', 'foot');
    foot.appendChild(el('span', 'price', priceText(p)));
    foot.appendChild(stockBadge(p));
    body.appendChild(foot);
    if (link) body.appendChild(el('span', 'open', 'Open in shop \u2197'));
    main.appendChild(body);
    c.appendChild(main);

    var pick = el('label', 'pick');
    var box = el('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', 'Compare ' + p.title);
    box.addEventListener('change', function () { setPicked(idx, box.checked); });
    pick.appendChild(box);
    pick.appendChild(el('span', '', 'Compare'));
    c.appendChild(pick);
    return c;
  }

  /** Syncs every card checkbox and the compare bar with the current choice. */
  function refreshPicks() {
    var full = picked.length >= MAX_PICK;
    Array.prototype.forEach.call(document.querySelectorAll('.card'), function (c) {
      var on = picked.indexOf(Number(c.dataset.i)) >= 0;
      var box = c.querySelector('.pick input');
      box.checked = on;
      box.disabled = !on && full;
      c.classList.toggle('picked', on);
      c.querySelector('.pick').title = !on && full ? 'You can compare up to ' + MAX_PICK + ' products' : '';
    });

    var bar = $('cmpbar');
    bar.hidden = picked.length === 0 || !$('compare-view').hidden;
    document.body.classList.toggle('has-bar', !bar.hidden);
    var thumbs = $('cmp-thumbs');
    thumbs.textContent = '';
    picked.forEach(function (i) {
      var p = products[i];
      var t = picture(p, 'thumb');
      t.title = p.title;
      var x = el('button', 'thumb-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + p.title);
      x.addEventListener('click', function () { setPicked(i, false); });
      t.appendChild(x);
      thumbs.appendChild(t);
    });
    $('cmp-count').textContent = picked.length + ' of ' + MAX_PICK + ' selected';
    $('cmp-hint').textContent = picked.length < MIN_PICK
      ? 'Pick at least ' + MIN_PICK + ' to compare (up to ' + MAX_PICK + ')'
      : full ? 'Maximum reached' : 'You can add ' + (MAX_PICK - picked.length) + ' more';
    $('cmp-go').disabled = picked.length < MIN_PICK;
  }

  /** The comparison page: one column per chosen product, opened at #compare/<indexes>. */
  function renderCompare(list) {
    var out = $('compare-body');
    out.textContent = '';
    $('compare-count').textContent = list.length >= MIN_PICK ? list.length + ' products' : '';
    if (list.length < MIN_PICK) {
      var empty = el('div', 'sub empty');
      empty.appendChild(el('b', '', 'Not enough products to compare.'));
      empty.appendChild(document.createTextNode('Tick “Compare” on ' + MIN_PICK + ' to ' + MAX_PICK + ' products, then open the comparison.'));
      out.appendChild(empty);
      return;
    }
    var items = list.map(function (i) { return products[i]; });
    var prices = items.filter(function (p) { return p.price !== null; });
    var sameCurrency = prices.every(function (p) { return p.currency === (prices[0] && prices[0].currency); });
    var lowest = sameCurrency && prices.length > 1 ? Math.min.apply(null, prices.map(function (p) { return p.price; })) : null;

    var wrap = el('div', 'cmp-wrap');
    var table = el('table', 'cmp');
    table.style.minWidth = (130 + items.length * 190) + 'px';

    var head = el('tr');
    head.appendChild(el('th', 'cmp-corner'));
    items.forEach(function (p, n) {
      var th = el('th', 'cmp-product');
      th.scope = 'col';
      th.style.setProperty('--shop', shopColor(p.shop));
      var pic = picture(p, 'cmp-pic');
      var rm = el('button', 'cmp-remove', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + p.title + ' from the comparison');
      // a comparison needs at least MIN_PICK products
      rm.disabled = items.length <= MIN_PICK;
      rm.title = rm.disabled ? 'A comparison needs at least ' + MIN_PICK + ' products' : 'Remove from comparison';
      rm.addEventListener('click', function () {
        setPicked(list[n], false);
        openCompare(picked, true);
      });
      pic.appendChild(rm);
      th.appendChild(pic);
      var link = safeUrl(p.url);
      var name = el(link ? 'a' : 'span', 'cmp-name', p.title);
      if (link) { name.href = link; name.target = '_blank'; name.rel = 'noreferrer'; }
      th.appendChild(name);
      head.appendChild(th);
    });
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    var tbody = el('tbody');
    function row(label, fill) {
      var tr = el('tr');
      var th = el('th', '', label);
      th.scope = 'row';
      tr.appendChild(th);
      items.forEach(function (p) {
        var td = el('td');
        td.style.setProperty('--shop', shopColor(p.shop));
        fill(td, p);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    row('Price', function (td, p) {
      td.appendChild(el('div', 'cmp-price', priceText(p)));
      if (lowest === null || p.price === null) return;
      if (p.price === lowest) td.appendChild(el('span', 'cmp-best', 'Lowest price'));
      else td.appendChild(el('div', 'sub', '+' + (p.price - lowest).toFixed(2) + ' ' + p.currency));
    });
    row('Stock', function (td, p) { td.appendChild(stockBadge(p)); });
    row('Shop', function (td, p) {
      var s = el('span', 'cmp-shop');
      s.appendChild(el('span', 'mark', p.shop.charAt(0)));
      s.appendChild(document.createTextNode(p.shop));
      td.appendChild(s);
    });
    row('Status', function (td, p) {
      var flags = el('div', 'cmp-flags');
      if (p.isNew) flags.appendChild(el('span', 'flag', 'New'));
      if (p.backInStock) flags.appendChild(el('span', 'flag back', 'Back in stock'));
      if (!p.isNew && !p.backInStock) flags.appendChild(el('span', 'sub', '—'));
      td.appendChild(flags);
    });
    row('', function (td, p) {
      var link = safeUrl(p.url);
      if (!link) return;
      var a = el('a', 'cmp-open', 'View in shop ↗');
      a.href = link; a.target = '_blank'; a.rel = 'noreferrer';
      td.appendChild(a);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    out.appendChild(wrap);
  }

  /** #compare/<i,j,…> shows the comparison page; any other address shows the product list. */
  function compareFromHash() {
    var m = /^#compare\\/?([\\d,]*)$/.exec(location.hash);
    if (!m) return null;
    var seen = [];
    m[1].split(',').forEach(function (s) {
      var i = Number(s);
      if (s !== '' && i < products.length && seen.indexOf(i) < 0 && seen.length < MAX_PICK) seen.push(i);
    });
    return seen;
  }
  // Pages that cannot change their own address (e.g. some embedded previews) keep the view here:
  // undefined = follow the address, null = product list, array = comparison of those products.
  var override;
  var cameFromList = false; // a history entry for the list exists right behind the comparison
  function openCompare(list, replace) {
    var hash = '#compare/' + list.join(',');
    try {
      if (replace) history.replaceState(null, '', hash); else location.hash = hash;
    } catch (e) { /* handled below */ }
    override = location.hash === hash ? undefined : list.slice();
    if (!replace) cameFromList = override === undefined;
    route();
  }
  function route() {
    var list = override !== undefined ? override : compareFromHash();
    var comparing = list !== null;
    $('list-view').hidden = comparing;
    $('compare-view').hidden = !comparing;
    if (comparing) {
      // the address is the source of truth on this page (it can be bookmarked or shared)
      picked = list.slice();
      savePicked();
      renderCompare(list);
      window.scrollTo(0, 0);
    }
    refreshPicks();
  }
  $('cmp-go').addEventListener('click', function () { openCompare(picked, false); });
  $('cmp-clear').addEventListener('click', function () { picked = []; savePicked(); refreshPicks(); });
  $('compare-back').addEventListener('click', function () {
    // back to where the list was (keeps its scroll position); a shared link goes straight to the list
    if (cameFromList && override === undefined) { cameFromList = false; history.back(); return; }
    cameFromList = false;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* handled below */ }
    override = compareFromHash() === null ? undefined : null;
    route();
  });
  window.addEventListener('hashchange', function () { override = undefined; route(); });

  function render() {
    var q = $('q').value.trim().toLowerCase();
    var shop = $('shop').value;
    var sort = $('sort').value;
    var list = products.filter(function (p) {
      if (!inGame(p)) return false;
      if (shop && p.shop !== shop) return false;
      if ($('instock').checked && p.inStock !== true) return false;
      if ($('onlynew').checked && !p.isNew) return false;
      return !q || (p.title + ' ' + p.shop).toLowerCase().indexOf(q) !== -1;
    }).sort(sorters[sort]);

    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
      c.classList.toggle('active', c.dataset.shop === shop);
    });

    var out = $('results');
    out.textContent = '';
    if (list.length === 0) {
      var empty = el('div', 'sub empty');
      empty.appendChild(el('b', '', 'Nothing matches.'));
      empty.appendChild(document.createTextNode('Try another search or clear the filters.'));
      out.appendChild(empty);
    } else if (sort === 'shop') {
      var grid = null, current = null;
      list.forEach(function (p) {
        if (p.shop !== current) {
          current = p.shop;
          var h = el('div', 'group');
          h.style.setProperty('--shop', shopColor(p.shop));
          h.appendChild(el('span', 'mark', p.shop.charAt(0)));
          h.appendChild(el('h2', '', p.shop));
          h.appendChild(el('span', 'count', list.filter(function (x) { return x.shop === current; }).length + ' products'));
          var info = data.shops.filter(function (s) { return s.name === current; })[0];
          var page = info ? safeUrl(info.page) : '';
          if (page) {
            var a = el('a', '', 'Open shop search ↗');
            a.href = page; a.target = '_blank'; a.rel = 'noreferrer';
            h.appendChild(a);
          }
          out.appendChild(h);
          grid = el('div', 'grid');
          out.appendChild(grid);
        }
        grid.appendChild(card(p));
      });
    } else {
      var all = el('div', 'grid');
      all.style.marginTop = '18px';
      list.forEach(function (p) { all.appendChild(card(p)); });
      out.appendChild(all);
    }
    $('count').textContent = list.length + ' shown';
    var active = (shop ? 1 : 0) + (sort !== 'shop' ? 1 : 0) + ($('instock').checked ? 1 : 0) + ($('onlynew').checked ? 1 : 0);
    $('fcount').textContent = active ? String(active) : '';
    refreshPicks();
  }

  $('q').addEventListener('input', render);
  $('filters').addEventListener('submit', function (e) { e.preventDefault(); render(); setPanel(false); });
  $('filters').addEventListener('reset', function () { setTimeout(render, 0); });
  renderTabs();
  buildShops();
  render();
  route();

  // light / dark: follows the device until the visitor picks one
  $('themebtn').addEventListener('click', function () {
    var root = document.documentElement;
    var now = root.getAttribute('data-theme') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = now === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('cm-theme', next); } catch (e) { /* ignore */ }
  });

  // footer game links without their own address switch the game in place
  $('foot-games').addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-game]') : null;
    if (!a || a.getAttribute('href') !== '#') return;
    e.preventDefault();
    setGame(a.getAttribute('data-game'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // "Suggest a shop" form (only on the website)
  var dlg = $('suggest-dlg');
  if (dlg && $('suggest-open')) {
    var form = $('suggest-form');
    var msg = $('sg-msg');
    var say = function (cls, text) { msg.className = 'msg ' + cls; msg.textContent = text; };
    $('suggest-open').addEventListener('click', function () {
      say('', '');
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      $('sg-url').focus();
    });
    $('sg-cancel').addEventListener('click', function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = $('sg-url').value.trim();
      if (!url) { say('err', 'Enter the address of the shop.'); $('sg-url').focus(); return; }
      $('sg-send').disabled = true;
      say('', 'Sending…');
      fetch(form.getAttribute('data-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, note: $('sg-note').value.trim(), website: $('sg-web').value })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      }).then(function (r) {
        $('sg-send').disabled = false;
        if (r.ok) { form.reset(); say('ok', 'Thank you! We received your suggestion.'); return; }
        say('err', r.status === 429 ? 'Too many attempts. Please try again later.' : (r.body && r.body.error) || 'Could not send. Please try again.');
      }).catch(function () {
        $('sg-send').disabled = false;
        say('err', 'Could not send. Please check your connection and try again.');
      });
    });
  }
})();
</script>
</body>
</html>
`;
}
