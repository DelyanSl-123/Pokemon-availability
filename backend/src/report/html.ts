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

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * One self-contained HTML page (no server, no internet needed) with every product found in a run:
 * search box, shop / stock / new filters, sorting, shop status and links to each product page.
 */
export function buildReportHtml(summary: RunSummary): string {
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
<title>Pokémon TCG report ${esc(when)}</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1c2430; --muted:#6b7686; --line:#e3e7ed; --accent:#e3350d; --ok:#17803d; --bad:#b42318; --warn:#b45309; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12161c; --card:#1a2029; --text:#e8ecf2; --muted:#93a0b2; --line:#2a3340; --ok:#4ade80; --bad:#f87171; --warn:#fbbf24; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:20px 16px 60px; }
  h1 { margin:0 0 4px; font-size:1.5rem; }
  .sub { color:var(--muted); font-size:.85rem; }
  section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; margin-top:14px; overflow-x:auto; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px 14px; }
  .stat b { display:block; font-size:1.3rem; }
  .shops { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { border:1px solid var(--line); border-left:4px solid var(--ok); border-radius:8px; padding:6px 10px; font-size:.85rem; }
  .chip.blocked, .chip.error { border-left-color:var(--warn); }
  .controls { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
  input[type=search], select { font:inherit; color:inherit; background:var(--card); border:1px solid var(--line); border-radius:8px; padding:7px 10px; }
  input[type=search] { flex:1; min-width:200px; }
  label { display:inline-flex; gap:6px; align-items:center; font-size:.9rem; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:middle; }
  th { color:var(--muted); font-size:.8rem; }
  td.right, th.right { text-align:right; white-space:nowrap; }
  td img { width:44px; height:44px; object-fit:contain; border-radius:6px; background:#fff; }
  a { color:var(--accent); }
  .badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:.75rem; font-weight:600; border:1px solid currentColor; margin-left:4px; white-space:nowrap; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .muted { color:var(--muted); } .warn { color:var(--warn); }
  tr.oos td { opacity:.65; }
</style>
</head>
<body>
<main>
  <h1>Pokémon TCG report</h1>
  <div class="sub">Checked ${esc(when)} (Sofia time) · search phrase “${esc(summary.query)}”</div>

  <div class="stats">
    <div class="stat"><b id="s-total">0</b><span class="sub">products</span></div>
    <div class="stat"><b id="s-stock">0</b><span class="sub">in stock</span></div>
    <div class="stat"><b id="s-oos">0</b><span class="sub">out of stock</span></div>
    <div class="stat"><b id="s-new">0</b><span class="sub">new today</span></div>
  </div>

  <section>
    <div class="shops" id="shops"></div>
  </section>

  <section>
    <div class="controls">
      <input type="search" id="q" placeholder="Search products…" aria-label="Search products">
      <select id="shop" aria-label="Shop"><option value="">All shops</option></select>
      <select id="sort" aria-label="Sort">
        <option value="shop">Sort: shop, in stock first</option>
        <option value="price-asc">Sort: price low → high</option>
        <option value="price-desc">Sort: price high → low</option>
        <option value="name">Sort: name</option>
      </select>
      <label><input type="checkbox" id="instock"> In stock only</label>
      <label><input type="checkbox" id="onlynew"> New only</label>
      <span class="sub" id="count"></span>
    </div>
    <table>
      <thead><tr><th></th><th>Product</th><th>Shop</th><th class="right">Price</th><th>Stock</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </section>
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
  var inStock = products.filter(function (p) { return p.inStock === true; }).length;
  var oos = products.filter(function (p) { return p.inStock === false; }).length;
  $('s-total').textContent = products.length;
  $('s-stock').textContent = inStock;
  $('s-oos').textContent = oos;
  $('s-new').textContent = products.filter(function (p) { return p.isNew; }).length;

  // shop status chips + filter options
  data.shops.forEach(function (s) {
    var chip = el('div', 'chip ' + s.status);
    var name = el('b');
    var page = safeUrl(s.page);
    if (page) { var a = el('a', '', s.name); a.href = page; a.target = '_blank'; a.rel = 'noreferrer'; name.appendChild(a); }
    else { name.textContent = s.name; }
    chip.appendChild(name);
    var detail = s.status === 'ok'
      ? s.found + ' found' + (s.scanned !== null ? ' of ' + s.scanned + ' on page' : '')
      : s.status + ': ' + s.message;
    chip.appendChild(el('div', 'sub', detail));
    if (s.status === 'ok' && s.message) chip.appendChild(el('div', 'sub', s.message));
    $('shops').appendChild(chip);
    var opt = el('option', '', s.name); opt.value = s.name; $('shop').appendChild(opt);
  });

  function rank(p) { return p.inStock === true ? 0 : p.inStock === null ? 1 : 2; }
  function sorters() {
    return {
      'shop': function (a, b) { return a.shop.localeCompare(b.shop) || rank(a) - rank(b) || a.title.localeCompare(b.title); },
      'price-asc': function (a, b) { return (a.price === null) - (b.price === null) || a.price - b.price; },
      'price-desc': function (a, b) { return (a.price === null) - (b.price === null) || b.price - a.price; },
      'name': function (a, b) { return a.title.localeCompare(b.title); }
    };
  }

  function render() {
    var q = $('q').value.trim().toLowerCase();
    var shop = $('shop').value;
    var list = products.filter(function (p) {
      if (shop && p.shop !== shop) return false;
      if ($('instock').checked && p.inStock !== true) return false;
      if ($('onlynew').checked && !p.isNew) return false;
      return !q || (p.title + ' ' + p.shop).toLowerCase().indexOf(q) !== -1;
    }).sort(sorters()[$('sort').value]);

    var body = $('rows');
    body.textContent = '';
    list.forEach(function (p) {
      var tr = el('tr', p.inStock === false ? 'oos' : '');
      var imgTd = el('td');
      var img = safeUrl(p.image);
      if (img) { var i = el('img'); i.src = img; i.alt = ''; i.loading = 'lazy'; imgTd.appendChild(i); }
      tr.appendChild(imgTd);

      var nameTd = el('td');
      var link = safeUrl(p.url);
      if (link) { var a = el('a', '', p.title); a.href = link; a.target = '_blank'; a.rel = 'noreferrer'; nameTd.appendChild(a); }
      else { nameTd.textContent = p.title; }
      if (p.isNew) nameTd.appendChild(el('span', 'badge ok', 'NEW'));
      if (p.backInStock) nameTd.appendChild(el('span', 'badge ok', 'BACK IN STOCK'));
      tr.appendChild(nameTd);

      tr.appendChild(el('td', '', p.shop));
      tr.appendChild(el('td', 'right', priceText(p)));

      var stockTd = el('td');
      if (p.inStock === true) stockTd.appendChild(el('span', 'badge ok', 'In stock'));
      else if (p.inStock === false) stockTd.appendChild(el('span', 'badge bad', 'OUT OF STOCK'));
      else stockTd.appendChild(el('span', 'badge muted', 'Unknown'));
      tr.appendChild(stockTd);
      body.appendChild(tr);
    });
    if (list.length === 0) {
      var empty = el('tr'); var td = el('td', 'sub', 'Nothing matches.'); td.colSpan = 5; empty.appendChild(td); body.appendChild(empty);
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
