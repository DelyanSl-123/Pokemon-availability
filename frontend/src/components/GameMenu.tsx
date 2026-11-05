import { FormEvent, useState } from 'react';
import { api, type Game } from '../api/client';

/** The menu of games: one tab per game, and (for the admin) a panel to add, switch off or remove games. */
export function GameMenu({
  games,
  selected,
  onSelect,
  isAdmin,
  onChanged,
  run,
}: {
  games: Game[];
  /** Slug of the selected game, '' for all games. */
  selected: string;
  onSelect: (slug: string) => void;
  isAdmin: boolean;
  /** Reload everything after the games changed. */
  onChanged: () => Promise<void>;
  /** Runs an action and shows its error in the page banner. */
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [query, setQuery] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const game = await api.addGame({ name, keywords: keywords.trim() || undefined, query: query.trim() || undefined });
      setName('');
      setKeywords('');
      setQuery('');
      await onChanged();
      onSelect(game.slug);
    });
  };

  return (
    <nav className="game-menu" aria-label="Games">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={selected === ''} className={selected === '' ? 'tab active' : 'tab'} onClick={() => onSelect('')}>
          All games
        </button>
        {games
          .filter((g) => g.enabled)
          .map((g) => (
            <button
              key={g.slug}
              role="tab"
              aria-selected={selected === g.slug}
              className={selected === g.slug ? 'tab active' : 'tab'}
              onClick={() => onSelect(g.slug)}
            >
              {g.name}
            </button>
          ))}
        {isAdmin && (
          <button className="tab add" onClick={() => setManaging(!managing)} aria-expanded={managing}>
            {managing ? 'Close' : '+ Add / manage games'}
          </button>
        )}
      </div>

      {isAdmin && managing && (
        <div className="manage">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Keywords in the product name</th>
                <th>Search phrase</th>
                <th className="center">On</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.slug}>
                  <td>
                    <strong>{g.name}</strong>
                    {g.builtin && <span className="sub"> (built in)</span>}
                  </td>
                  <td className="sub">{g.keywords}</td>
                  <td className="sub">{g.query}</td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={g.enabled}
                      aria-label={`${g.name} on`}
                      onChange={(e) =>
                        void run(async () => {
                          await api.patchGame(g.slug, { enabled: e.target.checked });
                          if (!e.target.checked && selected === g.slug) onSelect('');
                          await onChanged();
                        })
                      }
                    />
                  </td>
                  <td className="right">
                    {!g.builtin && (
                      <button
                        className="link danger"
                        onClick={() =>
                          window.confirm(`Remove ${g.name} with its shop pages and saved products?`) &&
                          void run(async () => {
                            await api.deleteGame(g.slug);
                            if (selected === g.slug) onSelect('');
                            await onChanged();
                          })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="row" onSubmit={add}>
            <input required minLength={2} maxLength={40} placeholder="Game name, e.g. Dragon Ball" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              className="wide"
              placeholder="Keywords, comma separated (default: the name)"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
            <input placeholder="Search phrase (default: the name)" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="submit">Add game</button>
          </form>
          <p className="sub">
            A product counts for a game when its name or link contains one of the keywords and it looks like a trading card
            product. After adding a game, add the shop pages for it in the Shops table below.
          </p>
        </div>
      )}
    </nav>
  );
}
