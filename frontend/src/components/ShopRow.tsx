import { useEffect, useState } from 'react';
import type { Shop } from '../api/client';

export function ShopRow({ shop, onChange, onDelete }: { shop: Shop; onChange: (patch: Partial<Shop>) => void; onDelete: () => void }) {
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
