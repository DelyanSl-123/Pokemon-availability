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
  /** Shops that are never checked automatically; listed with a link to check them by hand. */
  manualShops?: { name: string; url: string; note: string }[];
}

export function buildReportHtml(summary: RunSummary, opts: ReportOptions = {}): string {
  // Sign-in / register icon in the header, linking to the web app (only http(s) addresses).
  const appUrl = opts.appUrl && /^https?:\/\//i.test(opts.appUrl) ? opts.appUrl.replace(/\/+$/, '') + '/' : '';
  const accountLink = appUrl
    ? `<a class="account" href="${esc(appUrl)}" title="Sign in / Register" aria-label="Sign in or register">` +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>' +
      '<span>Sign in</span></a>'
    : '';
  const when = new Date(summary.startedAt).toLocaleString('en-GB', { timeZone: 'Europe/Sofia' });

  const data = {
    generated: when,
    query: summary.query,
    shops: summary.shops.map((s) => ({
      name: s.shopName,
      page: s.searchUrl ?? '',
      status: s.status,
      message: s.message ?? '',
      found: s.found,
      scanned: s.scanned ?? null,
    })),
    manualShops: (opts.manualShops ?? []).map((s) => ({ name: s.name, page: s.url, note: s.note })),
    products: summary.products.map((p) => ({
      title: p.title,
      url: p.url,
      shop: p.shopName,
      price: p.price,
      currency: p.currency ?? '',
      inStock: p.inStock,
      isNew: p.isNew,
      backInStock: p.backInStock,
      image: p.imageUrl ?? '',
    })),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>CollectibleMarket · ${esc(when)}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}">
<style>
  :root {
    --bg:#f4f1ea; --surface:#fff; --text:#191c22; --muted:#686e7a; --line:#e3ddd1; --accent:#e3350d;
    --ok:#15803d; --ok-bg:#e6f5eb; --bad:#b42318; --bad-bg:#fcebe8; --warn:#a85a07; --unk-bg:#eeece7;
    --img:#fff; --hero:#fbf9f4; --hero-text:#191c22; --hero-muted:#686e7a; --hero-line:rgba(21,25,34,.14); --hero-ok:#15803d; --hero-new:#b45309; --hero-hover:rgba(21,25,34,.07); --logo-edge:#fff;
    --shadow:0 1px 2px rgba(21,25,34,.05), 0 6px 20px rgba(21,25,34,.06);
    --shadow-hover:0 2px 4px rgba(21,25,34,.06), 0 14px 32px rgba(21,25,34,.12);
    --holo:linear-gradient(90deg,#e3350d,#f5b301 30%,#2bb7a8 60%,#6a5cff 85%,#e3350d);
  }
  @media (prefers-color-scheme: dark) { :root {
    --bg:#0f1217; --surface:#181c24; --text:#e9ebef; --muted:#959cab; --line:#29303b; --accent:#ff5a36;
    --ok:#4ade80; --ok-bg:rgba(74,222,128,.12); --bad:#f87171; --bad-bg:rgba(248,113,113,.12); --warn:#fbbf24; --unk-bg:rgba(255,255,255,.07);
    --img:#f4f3f0; --hero:#0a0c10; --hero-text:#f4f1ea; --hero-muted:#a3a9b6; --hero-line:rgba(255,255,255,.12); --hero-ok:#4ade80; --hero-new:#ffb340; --hero-hover:rgba(255,255,255,.12); --shadow:0 1px 2px rgba(0,0,0,.3); --shadow-hover:0 12px 30px rgba(0,0,0,.45);
  } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1240px; margin:0 auto; padding:0 16px; }
  a { color:var(--accent); }
  .sub { color:var(--muted); font-size:.85rem; }

  /* hero */
  .hero { background:var(--hero); color:var(--hero-text); position:relative; padding:22px 0 26px; }
  .hero::after { content:""; position:absolute; left:0; right:0; bottom:0; height:3px; background:var(--holo); }
  .brand { display:flex; align-items:center; gap:14px; }
  .brand svg { width:52px; height:52px; flex:none; filter:drop-shadow(0 4px 10px rgba(227,53,13,.35)); }
  h1 { margin:0; font-size:1.8rem; font-weight:800; letter-spacing:-.03em; line-height:1.05; }
  h1 span { color:var(--accent); }
  .tagline { color:var(--hero-muted); font-size:.85rem; margin-top:2px; }
  .account { margin-left:auto; display:inline-flex; align-items:center; gap:7px; padding:7px 14px 7px 9px; border:1px solid var(--hero-line); border-radius:999px; background:var(--hero-hover); color:var(--hero-text); text-decoration:none; font-size:.9rem; font-weight:600; transition:background .15s, border-color .15s; }
  .account:hover { background:var(--hero-hover); border-color:var(--muted); }
  .account svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
  @media (max-width:480px) { .account span { display:none; } .account { padding:8px; } }
  .meta { color:var(--hero-muted); font-size:.85rem; margin:18px 0 0; }
  .meta b { color:var(--hero-text); font-weight:600; }
  .stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); margin-top:14px; border:1px solid var(--hero-line); border-radius:14px; overflow:hidden; }
  .stat { padding:12px 16px; border-left:1px solid var(--hero-line); }
  .stat:first-child { border-left:0; }
  .stat b { display:block; font-size:1.7rem; font-weight:800; letter-spacing:-.02em; line-height:1.1; font-variant-numeric:tabular-nums; }
  .stat span { color:var(--hero-muted); font-size:.8rem; }
  .stat.s-ok b { color:var(--hero-ok); } .stat.s-new b { color:var(--hero-new); }
  @media (max-width:560px) {
    .stats { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .stat:nth-child(3) { border-left:0; } .stat:nth-child(n+3) { border-top:1px solid var(--hero-line); }
  }

  /* shops */
  .section-label { margin:22px 0 8px; font-size:.72rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
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
  .controls { position:sticky; top:0; z-index:2; display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:12px 0; margin-top:14px; background:color-mix(in srgb, var(--bg) 88%, transparent); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); border-bottom:1px solid var(--line); }
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
</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <div class="brand">
      ${LOGO_SVG}
      <div><h1>Collectible<span>Market</span></h1><div class="tagline">Pokémon TCG availability tracker</div></div>
      ${accountLink}
    </div>
    <p class="meta">Checked <b>${esc(when)}</b> (Sofia time) · search phrase <b>“${esc(summary.query)}”</b></p>
    <div class="stats">
      <div class="stat"><b id="s-total">0</b><span>products</span></div>
      <div class="stat s-ok"><b id="s-stock">0</b><span>in stock</span></div>
      <div class="stat"><b id="s-oos">0</b><span>out of stock</span></div>
      <div class="stat s-new"><b id="s-new">0</b><span>new today</span></div>
    </div>
  </div>
</header>

<main class="wrap" id="list-view">
  <div class="section-label">Shops</div>
  <div class="shops" id="shops"></div>

  <div class="controls">
    <div class="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="q" placeholder="Search products…" aria-label="Search products">
    </div>
    <select id="shop" aria-label="Shop"><option value="">All shops</option></select>
    <select id="sort" aria-label="Sort">
      <option value="shop">Group by shop, in stock first</option>
      <option value="price-asc">Price low → high</option>
      <option value="price-desc">Price high → low</option>
      <option value="name">Name</option>
    </select>
    <label class="toggle"><input type="checkbox" id="instock"><span>In stock</span></label>
    <label class="toggle"><input type="checkbox" id="onlynew"><span>New</span></label>
    <span class="sub" id="count"></span>
  </div>

  <div id="results"></div>

  <footer class="sub">Search-only tracker: prices and stock come from each shop's first results page. Buy on the shop's own site.</footer>
</main>

<main class="wrap" id="compare-view" hidden>
  <div class="cmp-top">
    <button type="button" class="btn ghost" id="compare-back">← Back to products</button>
    <h2>Compare products</h2>
    <span class="count" id="compare-count"></span>
  </div>
  <div id="compare-body"></div>
  <footer class="sub">Search-only tracker: prices and stock come from each shop's first results page. Buy on the shop's own site.</footer>
</main>

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
  // Poké Ball placeholder for products without a (loadable) image
  var POKEBALL = '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<path d="M4 32a28 28 0 0 1 56 0Z" fill="#e3350d"/><path d="M4 32a28 28 0 0 0 56 0Z" fill="#fff"/>' +
    '<circle cx="32" cy="32" r="28" fill="none" stroke="#1f2430" stroke-width="4"/>' +
    '<path d="M4 32h56" stroke="#1f2430" stroke-width="4"/>' +
    '<circle cx="32" cy="32" r="9" fill="#fff" stroke="#1f2430" stroke-width="4"/>' +
    '<circle cx="32" cy="32" r="3.5" fill="none" stroke="#c9ced6" stroke-width="2"/></svg>';
  function noImage() {
    var s = el('span', 'none');
    s.innerHTML = POKEBALL;
    s.appendChild(el('span', '', 'No image'));
    return s;
  }
  function priceText(p) { return p.price === null ? '—' : p.price.toFixed(2) + ' ' + p.currency; }

  // totals
  $('s-total').textContent = products.length;
  $('s-stock').textContent = products.filter(function (p) { return p.inStock === true; }).length;
  $('s-oos').textContent = products.filter(function (p) { return p.inStock === false; }).length;
  $('s-new').textContent = products.filter(function (p) { return p.isNew; }).length;

  // shop status chips (click to filter) + filter options
  data.shops.forEach(function (s) {
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
  (data.manualShops || []).forEach(function (s) {
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
    refreshPicks();
  }

  ['q', 'shop', 'sort', 'instock', 'onlynew'].forEach(function (id) {
    $(id).addEventListener(id === 'q' ? 'input' : 'change', render);
  });
  render();
  route();
})();
</script>
</body>
</html>
`;
}
