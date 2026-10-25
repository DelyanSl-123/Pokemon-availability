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
