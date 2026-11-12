/** The CollectibleMarket logo and name; links to the home page. */
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="CollectibleMarket home">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="cm-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff6a3d" />
            <stop offset="1" stopColor="#c81e0a" />
          </linearGradient>
        </defs>
        <rect x="9" y="13" width="30" height="42" rx="5" fill="#2b3a4f" stroke="#fff" strokeWidth="2" transform="rotate(-12 24 34)" />
        <g transform="rotate(10 39 30)">
          <rect x="24" y="9" width="30" height="42" rx="5" fill="url(#cm-g)" stroke="#fff" strokeWidth="2" />
          <path d="M39 19.5 41.6 27.4 49.5 30 41.6 32.6 39 40.5 36.4 32.6 28.5 30 36.4 27.4Z" fill="#fff" />
        </g>
      </svg>
      <span>
        Collectible<b>Market</b>
      </span>
    </a>
  );
}
