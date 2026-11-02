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
export function buildReportHtml(summary: RunSummary, opts: { appUrl?: string } = {}): string {
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
    --img:#fff; --hero:#151922; --hero-text:#f4f1ea; --hero-muted:#a3a9b6; --hero-line:rgba(255,255,255,.12);
    --shadow:0 1px 2px rgba(21,25,34,.05), 0 6px 20px rgba(21,25,34,.06);
    --shadow-hover:0 2px 4px rgba(21,25,34,.06), 0 14px 32px rgba(21,25,34,.12);
    --holo:linear-gradient(90deg,#e3350d,#f5b301 30%,#2bb7a8 60%,#6a5cff 85%,#e3350d);
  }
  @media (prefers-color-scheme: dark) { :root {
    --bg:#0f1217; --surface:#181c24; --text:#e9ebef; --muted:#959cab; --line:#29303b; --accent:#ff5a36;
    --ok:#4ade80; --ok-bg:rgba(74,222,128,.12); --bad:#f87171; --bad-bg:rgba(248,113,113,.12); --warn:#fbbf24; --unk-bg:rgba(255,255,255,.07);
    --img:#f4f3f0; --hero:#0a0c10; --shadow:0 1px 2px rgba(0,0,0,.3); --shadow-hover:0 12px 30px rgba(0,0,0,.45);
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
  h1 span { color:#ff6a3d; }
  .tagline { color:var(--hero-muted); font-size:.85rem; margin-top:2px; }
  .account { margin-left:auto; display:inline-flex; align-items:center; gap:7px; padding:7px 14px 7px 9px; border:1px solid var(--hero-line); border-radius:999px; background:rgba(255,255,255,.06); color:var(--hero-text); text-decoration:none; font-size:.9rem; font-weight:600; transition:background .15s, border-color .15s; }
  .account:hover { background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.3); }
  .account svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
  @media (max-width:480px) { .account span { display:none; } .account { padding:8px; } }
  .meta { color:var(--hero-muted); font-size:.85rem; margin:18px 0 0; }
  .meta b { color:var(--hero-text); font-weight:600; }
  .stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); margin-top:14px; border:1px solid var(--hero-line); border-radius:14px; overflow:hidden; }
  .stat { padding:12px 16px; border-left:1px solid var(--hero-line); }
  .stat:first-child { border-left:0; }
  .stat b { display:block; font-size:1.7rem; font-weight:800; letter-spacing:-.02em; line-height:1.1; font-variant-numeric:tabular-nums; }
  .stat span { color:var(--hero-muted); font-size:.8rem; }
  .stat.s-ok b { color:#4ade80; } .stat.s-new b { color:#ffb340; }
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
  .card { display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line); border-radius:14px; overflow:hidden; color:inherit; text-decoration:none; box-shadow:var(--shadow); transition:transform .15s, box-shadow .15s, border-color .15s; }
  a.card:hover { transform:translateY(-3px); box-shadow:var(--shadow-hover); border-color:color-mix(in srgb, var(--accent) 35%, var(--line)); }
  a.card:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
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

<main class="wrap">
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

  function rank(p) { return p.inStock === true ? 0 : p.inStock === null ? 1 : 2; }
  var sorters = {
    'shop': function (a, b) { return a.shop.localeCompare(b.shop) || rank(a) - rank(b) || a.title.localeCompare(b.title); },
    'price-asc': function (a, b) { return (a.price === null) - (b.price === null) || a.price - b.price; },
    'price-desc': function (a, b) { return (a.price === null) - (b.price === null) || b.price - a.price; },
    'name': function (a, b) { return a.title.localeCompare(b.title); }
  };

  function card(p) {
    var link = safeUrl(p.url);
    var c = el(link ? 'a' : 'div', 'card' + (p.inStock === false ? ' oos' : ''));
    c.style.setProperty('--shop', shopColor(p.shop));
    if (link) { c.href = link; c.target = '_blank'; c.rel = 'noreferrer'; }

    var pic = el('div', 'pic');
    var src = safeUrl(p.image);
    if (src) {
      var i = el('img');
      i.src = src; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
      i.addEventListener('error', function () { pic.replaceChild(noImage(), i); });
      pic.appendChild(i);
    } else {
      pic.appendChild(noImage());
    }
    var flags = el('div', 'flags');
    if (p.isNew) flags.appendChild(el('span', 'flag', 'New'));
    if (p.backInStock) flags.appendChild(el('span', 'flag back', 'Back in stock'));
    pic.appendChild(flags);
    c.appendChild(pic);

    var body = el('div', 'body');
    body.appendChild(el('div', 'shopname', p.shop));
    var title = el('div', 'title', p.title); title.title = p.title;
    body.appendChild(title);
    var foot = el('div', 'foot');
    foot.appendChild(el('span', 'price', priceText(p)));
    if (p.inStock === true) foot.appendChild(el('span', 'stock ok', 'In stock'));
    else if (p.inStock === false) foot.appendChild(el('span', 'stock bad', 'Out of stock'));
    else foot.appendChild(el('span', 'stock muted', 'Stock unknown'));
    body.appendChild(foot);
    c.appendChild(body);
    return c;
  }

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
  }

  ['q', 'shop', 'sort', 'instock', 'onlynew'].forEach(function (id) {
    $(id).addEventListener(id === 'q' ? 'input' : 'change', render);
  });
  render();
})();
</script>
</body>
</html>
`;
}
