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
  :root { --bg:#f6f7f9; --card:#fff; --text:#1c2430; --muted:#6b7686; --line:#e3e7ed; --accent:#e3350d; --ok:#17803d; --bad:#b42318; --warn:#b45309; --img:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12161c; --card:#1a2029; --text:#e8ecf2; --muted:#93a0b2; --line:#2a3340; --ok:#4ade80; --bad:#f87171; --warn:#fbbf24; --img:#f3f4f6; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:1200px; margin:0 auto; padding:20px 16px 60px; }
  .brand { display:flex; align-items:center; gap:12px; margin-bottom:6px; }
  .brand svg { width:48px; height:48px; flex:none; }
  h1 { margin:0; font-size:1.7rem; letter-spacing:-.02em; line-height:1.1; }
  h1 span { color:var(--accent); }
  .tagline { color:var(--muted); font-size:.85rem; }
  .account { margin-left:auto; display:inline-flex; align-items:center; gap:6px; padding:6px 12px 6px 8px; border:1px solid var(--line); border-radius:999px; background:var(--card); color:var(--text); text-decoration:none; font-size:.9rem; font-weight:600; }
  .account:hover { border-color:var(--accent); color:var(--accent); }
  .account svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
  @media (max-width:480px) { .account span { display:none; } .account { padding:6px; } }
  h2 { margin:22px 0 10px; font-size:1.1rem; display:flex; gap:8px; align-items:baseline; }
  .sub { color:var(--muted); font-size:.85rem; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px 14px; }
  .stat b { display:block; font-size:1.3rem; }
  .shops { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
  .chip { font:inherit; color:inherit; text-align:left; cursor:pointer; background:var(--card); border:1px solid var(--line); border-left:4px solid var(--ok); border-radius:8px; padding:6px 10px; font-size:.85rem; }
  .chip.blocked, .chip.error { border-left-color:var(--warn); }
  .chip.active { outline:2px solid var(--accent); outline-offset:1px; }
  .controls { position:sticky; top:0; z-index:1; background:var(--bg); display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding:12px 0; margin-top:6px; border-bottom:1px solid var(--line); }
  input[type=search], select { font:inherit; color:inherit; background:var(--card); border:1px solid var(--line); border-radius:8px; padding:7px 10px; }
  input[type=search] { flex:1; min-width:180px; }
  label { display:inline-flex; gap:6px; align-items:center; font-size:.9rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(155px, 1fr)); gap:12px; }
  .card { display:flex; flex-direction:column; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; color:inherit; text-decoration:none; transition:transform .12s, box-shadow .12s; }
  .card:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,.08); }
  .card.oos { opacity:.6; }
  .pic { position:relative; aspect-ratio:1; background:var(--img); display:flex; align-items:center; justify-content:center; }
  .pic img { width:100%; height:100%; object-fit:contain; padding:10px; }
  .pic .none { color:#9aa3af; font-size:.8rem; }
  .flags { position:absolute; top:8px; left:8px; display:flex; gap:4px; flex-wrap:wrap; }
  .flags .badge { background:var(--ok); color:#fff; border-color:var(--ok); margin:0; }
  .body { padding:10px 12px 12px; display:flex; flex-direction:column; gap:6px; flex:1; }
  .title { font-weight:600; font-size:.92rem; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .shopname { color:var(--muted); font-size:.8rem; }
  .foot { margin-top:auto; display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; }
  .price { font-weight:700; font-size:1.05rem; }
  a { color:var(--accent); }
  .badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:.72rem; font-weight:600; border:1px solid currentColor; white-space:nowrap; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .muted { color:var(--muted); } .warn { color:var(--warn); }
  .empty { padding:30px 0; text-align:center; }
</style>
</head>
<body>
<main>
  <header class="brand">
    ${LOGO_SVG}
    <div><h1>Collectible<span>Market</span></h1><div class="tagline">Pokémon TCG availability tracker</div></div>
    ${accountLink}
  </header>
  <div class="sub">Checked ${esc(when)} (Sofia time) · search phrase “${esc(summary.query)}”</div>

  <div class="stats">
    <div class="stat"><b id="s-total">0</b><span class="sub">products</span></div>
    <div class="stat"><b id="s-stock">0</b><span class="sub">in stock</span></div>
    <div class="stat"><b id="s-oos">0</b><span class="sub">out of stock</span></div>
    <div class="stat"><b id="s-new">0</b><span class="sub">new today</span></div>
  </div>

  <div class="shops" id="shops"></div>

  <div class="controls">
    <input type="search" id="q" placeholder="Search products…" aria-label="Search products">
    <select id="shop" aria-label="Shop"><option value="">All shops</option></select>
    <select id="sort" aria-label="Sort">
      <option value="shop">Group by shop, in stock first</option>
      <option value="price-asc">Price low → high</option>
      <option value="price-desc">Price high → low</option>
      <option value="name">Name</option>
    </select>
    <label><input type="checkbox" id="instock"> In stock only</label>
    <label><input type="checkbox" id="onlynew"> New only</label>
    <span class="sub" id="count"></span>
  </div>

  <div id="results"></div>
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
  function priceText(p) { return p.price === null ? '—' : p.price.toFixed(2) + ' ' + p.currency; }

  // totals
  $('s-total').textContent = products.length;
  $('s-stock').textContent = products.filter(function (p) { return p.inStock === true; }).length;
  $('s-oos').textContent = products.filter(function (p) { return p.inStock === false; }).length;
  $('s-new').textContent = products.filter(function (p) { return p.isNew; }).length;

  // shop status chips (click to filter) + filter options
  data.shops.forEach(function (s) {
    var chip = el('button', 'chip ' + s.status);
    chip.type = 'button';
    chip.dataset.shop = s.name;
    chip.appendChild(el('b', '', s.name));
    var detail = s.status === 'ok'
      ? s.found + ' found' + (s.scanned !== null ? ' of ' + s.scanned + ' on page' : '')
      : s.status + ': ' + s.message;
    chip.appendChild(el('div', 'sub', detail));
    if (s.status === 'ok' && s.message) chip.appendChild(el('div', 'sub', s.message));
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
    if (link) { c.href = link; c.target = '_blank'; c.rel = 'noreferrer'; }

    var pic = el('div', 'pic');
    var src = safeUrl(p.image);
    if (src) {
      var i = el('img');
      i.src = src; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
      i.addEventListener('error', function () { pic.replaceChild(el('span', 'none', 'No image'), i); });
      pic.appendChild(i);
    } else {
      pic.appendChild(el('span', 'none', 'No image'));
    }
    var flags = el('div', 'flags');
    if (p.isNew) flags.appendChild(el('span', 'badge', 'NEW'));
    if (p.backInStock) flags.appendChild(el('span', 'badge', 'BACK IN STOCK'));
    pic.appendChild(flags);
    c.appendChild(pic);

    var body = el('div', 'body');
    var title = el('div', 'title', p.title); title.title = p.title;
    body.appendChild(title);
    body.appendChild(el('div', 'shopname', p.shop));
    var foot = el('div', 'foot');
    foot.appendChild(el('span', 'price', priceText(p)));
    if (p.inStock === true) foot.appendChild(el('span', 'badge ok', 'In stock'));
    else if (p.inStock === false) foot.appendChild(el('span', 'badge bad', 'OUT OF STOCK'));
    else foot.appendChild(el('span', 'badge muted', 'Stock unknown'));
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
      out.appendChild(el('div', 'sub empty', 'Nothing matches.'));
    } else if (sort === 'shop') {
      var grid = null, current = null;
      list.forEach(function (p) {
        if (p.shop !== current) {
          current = p.shop;
          var h = el('h2', '', p.shop);
          h.appendChild(el('span', 'sub', list.filter(function (x) { return x.shop === current; }).length + ' products'));
          out.appendChild(h);
          grid = el('div', 'grid');
          out.appendChild(grid);
        }
        grid.appendChild(card(p));
      });
    } else {
      var all = el('div', 'grid');
      all.style.marginTop = '14px';
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
