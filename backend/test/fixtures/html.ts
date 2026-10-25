/** A product listing with one in-stock Pokémon item, one unrelated item and one sold-out Pokémon item. */
export const CARDS_HTML = `
<html><body>
<ul class="products">
  <li class="product-item">
    <a href="/pokemon-tcg-scarlet-violet-booster"><img src="/img/a.jpg"></a>
    <h3 class="product-name"><a href="/pokemon-tcg-scarlet-violet-booster">Pokémon TCG Scarlet &amp; Violet Booster Pack</a></h3>
    <span class="price">12,99 лв.</span>
    <button>Добави в количката</button>
  </li>
  <li class="product-item">
    <a href="/lego-city-fire-station"><img src="/img/b.jpg"></a>
    <h3 class="product-name"><a href="/lego-city-fire-station">LEGO City Fire Station</a></h3>
    <span class="price">59,99 лв.</span>
    <button>Добави в количката</button>
  </li>
  <li class="product-item">
    <a href="/pokemon-elite-trainer-box"></a>
    <h3 class="product-name"><a href="/pokemon-elite-trainer-box">Pokemon TCG Elite Trainer Box</a></h3>
    <span class="price">89,90 лв.</span>
    <span class="stock">Изчерпан</span>
  </li>
</ul>
</body></html>`;

/** Same listing, but the Elite Trainer Box is available again. */
export const CARDS_HTML_RESTOCKED = CARDS_HTML.replace(
  '<span class="stock">Изчерпан</span>',
  '<button>Добави в количката</button>',
);

export const JSON_LD_HTML = `
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
  {"@type":"ListItem","position":1,"item":{"@type":"Product","name":"Pokemon TCG Booster Display",
    "url":"https://shop.test/p/booster-display","image":"https://shop.test/i.jpg",
    "offers":{"@type":"Offer","price":"159.90","priceCurrency":"BGN","availability":"https://schema.org/InStock"}}},
  {"@type":"ListItem","position":2,"item":{"@type":"Product","name":"Pokemon TCG Tin","url":"/p/tin",
    "offers":{"@type":"Offer","price":29.5,"priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"}}},
  {"@type":"ListItem","position":3,"item":{"@type":"Product","name":"Garden Hose","url":"/p/hose"}}
]}
</script>
</head><body></body></html>`;

export const ANCHORS_ONLY_HTML = `
<html><body>
  <a href="/p/1">Pokemon TCG Booster Bundle</a>
  <a href="/p/2">Lego Technic</a>
  <a href="#top">Pokemon</a>
</body></html>`;

/** Magento-style cards: many links per card (photo, name, brand, wishlist, compare). */
export const MANY_LINKS_HTML = `
<html><body><ol class="products">
  <li class="item product product-item">
    <a class="product photo" href="/p/pokemon-booster-display"><img src="/i/1.jpg" alt="Pokémon Booster"></a>
    <strong class="product name"><a class="product-item-link" href="/p/pokemon-booster-display">Pokémon TCG Booster Display</a></strong>
    <a href="/brand/pokemon">Pokemon</a>
    <a href="/wishlist/add/1">Wishlist</a>
    <a href="/compare/add/1">Compare</a>
    <span class="price">45,50 лв.</span>
    <button>Добави в количката</button>
  </li>
  <li class="item product product-item">
    <a class="product photo" href="/p/pokemon-tin"><img src="/i/2.jpg" alt="Tin"></a>
    <strong class="product name"><a class="product-item-link" href="/p/pokemon-tin">Pokémon TCG Collector Tin</a></strong>
    <a href="/brand/pokemon">Pokemon</a>
    <span class="price">29,90 лв.</span>
    <span class="stock unavailable">Изчерпан</span>
  </li>
</ol></body></html>`;

/** No known class names at all, an old + new price pair, and a mini-cart total in the header. */
export const DIV_SOUP_HTML = `
<html><head><title>Pokemon cards</title></head><body>
  <header><div class="cart">Количка 0,00 лв.</div></header>
  <div class="grid">
    <div class="c">
      <a href="/x/etb-prismatic"><img src="/i/e.jpg" alt=""></a>
      <div><a href="/x/etb-prismatic">Elite Trainer Box Prismatic Evolutions</a></div>
      <div><s>99,00 лв.</s> <b>89,90 лв.</b></div>
    </div>
    <div class="c">
      <a href="/x/booster-bundle"><img src="/i/b.jpg" alt=""></a>
      <div><a href="/x/booster-bundle">Booster Bundle Surging Sparks</a></div>
      <div><b>39,90 лв.</b></div>
    </div>
  </div>
</body></html>`;

/** Shopify-style grid: tracking params in links, sale price pair, and a cart drawer with a price. */
export const SHOPIFY_LIKE_HTML = `
<html><body>
  <cart-drawer class="drawer"><div class="drawer__inner">
    <span class="price">0,00 €</span><a href="/collections/all">Продължи пазаруването</a>
  </div></cart-drawer>
  <ul class="grid">
    <li class="grid__item"><div class="card-wrapper"><div class="card">
      <a href="/products/pokemon-etb?_pos=1&amp;_sid=abc&amp;_ss=r" class="full-unstyled-link">Pokémon Elite Trainer Box</a>
      <div class="price"><div class="price__sale"><s class="price-item--regular">59,90 €</s><span class="price-item--sale">49,90 €</span></div></div>
    </div></div></li>
    <li class="grid__item"><div class="card-wrapper"><div class="card">
      <a href="/products/pokemon-tin?_pos=2&amp;_sid=abc&amp;_ss=r" class="full-unstyled-link">Pokémon Collector Tin</a>
      <span class="badge badge--sold-out">Sold out</span>
      <div class="price"><span class="price-item">29,90 €</span></div>
    </div></div></li>
  </ul>
</body></html>`;

/** Ozone-style card: the crossed-out supplier price comes before the real selling price. */
export const OLD_PRICE_HTML = `
<html><body><div class="product-box">
  <a href="/pokemon-booster"><img src="/i.jpg" alt=""></a>
  <a href="/pokemon-booster" class="title">Pokémon Booster Pack</a>
  <p class="old-price"><span class="price-label">ПЦД:</span> <span class="price">39,90&nbsp;€</span></p>
  <p class="special-price"><span class="price">29,90&nbsp;€</span></p>
  <button>Добави в количката</button>
</div></body></html>`;

/** Title element with an attribute line appended (ozone.bg style). */
export const TITLE_WITH_THEME_HTML = `
<html><body><div class="product-box">
  <a href="/p/pokemon-tin"><h3 class="product-name">Pokemon TCG: 30th Celebration Mini Tin, асортимент Тема: Pokémon</h3></a>
  <span class="price">9,90 €</span>
</div></body></html>`;

export const BOT_WALL_HTML =
  '<html><head><META NAME="robots" CONTENT="noindex,nofollow"></head><body>Request unsuccessful. Incapsula incident ID: 9200002-412</body></html>';

/** JSON-LD with products that are not Pokémon (a mixed trading-card category). */
export const OTHER_CARDS_HTML = `
<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Magic: The Gathering Booster","url":"/p/mtg",
 "offers":{"@type":"Offer","price":"6.5","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
</script></head><body></body></html>`;

/** Every JSON-LD product points at the listing page itself; the real products are only in the markup. */
export const JSON_LD_SAME_URL_HTML = `
<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"Product","name":"Pokémon TCG Booster A","url":"https://shop.test/search"},
 {"@type":"Product","name":"Pokémon TCG Booster B","url":"https://shop.test/search"},
 {"@type":"Product","name":"Pokémon TCG Booster C","url":"https://shop.test/search"}]}
</script></head><body>
  <div class="grid">
    <div class="c"><a href="/x/booster-a">Pokémon TCG Booster A</a><div><b>5,90 €</b></div></div>
    <div class="c"><a href="/x/booster-b">Pokémon TCG Booster B</a><div><b>6,90 €</b></div></div>
    <div class="c"><a href="/x/booster-c">Pokémon TCG Booster C</a><div><b>7,90 €</b></div></div>
  </div>
</body></html>`;

/** A card whose title element contains an inline script (as seen on ozone.bg). */
export const SCRIPT_IN_TITLE_HTML = `
<html><body><div class="product-box">
  <h3 class="product-name"><script>var productData_x = { ids:'BGPM0000754N', value: 1 };</script><a href="/p/pokemon-booster">Pokémon Booster Pack</a></h3>
  <span class="price">12,90 €</span>
</div></body></html>`;

/** Cards with several links each (product, vendor, collection) and sale/regular price blocks. */
export const MULTI_LINK_PRICE_BLOCKS_HTML = `
<html><body><ul class="grid">
  <li><div class="card">
    <a href="/products/pokemon-bundle">Pokémon Booster Bundle</a>
    <a href="/collections/vendors?q=Pokemon">Pokemon</a>
    <a href="/collections/booster">Booster</a>
    <div class="price"><div class="price__regular"><span>10,00 €</span></div><div class="price__sale"><s>10,00 €</s><span>8,00 €</span></div></div>
  </div></li>
  <li><div class="card">
    <a href="/products/pokemon-tin">Pokémon Collector Tin</a>
    <a href="/collections/vendors?q=Pokemon">Pokemon</a>
    <a href="/collections/tin">Tin</a>
    <div class="price"><div class="price__regular"><span>20,00 €</span></div></div>
  </div></li>
</ul></body></html>`;
