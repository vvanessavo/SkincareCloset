import { useEffect, useState } from 'react';
import { searchCatalog } from '../api.js';
import { ProductImage } from './ProductImage.jsx';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MS = 250;

export function CatalogSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  // Holds the query it answers, so results never show for different text.
  const [search, setSearch] = useState(null);
  const [error, setError] = useState(null);

  const term = query.trim();

  useEffect(() => {
    if (term.length < MIN_QUERY_LENGTH) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await searchCatalog(term, controller.signal);
        setSearch({ term, ...data });
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      }
    }, SEARCH_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const current = search?.term === term && term.length >= MIN_QUERY_LENGTH ? search : null;

  function handleSelect(item) {
    setQuery('');
    onSelect(item);
  }

  return (
    <div className="catalog-search">
      <label>
        Search Open Beauty Facts
        <input
          type="search"
          placeholder="Brand or product name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Enter here would otherwise submit the product form.
          onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
          autoFocus
        />
      </label>

      {error && <p className="catalog-hint">Search isn't working right now: {error}</p>}

      {current?.total === 0 && (
        <p className="catalog-hint">
          The catalog isn't set up yet. Run <code>npm run import:catalog</code> in server/.
        </p>
      )}
      {current?.total > 0 && current.results.length === 0 && (
        <p className="catalog-hint">No matches. Fill in the form below instead.</p>
      )}

      {current?.results.length > 0 && (
        <ul className="catalog-results">
          {current.results.map((item) => (
            <li key={item.code}>
              <button type="button" className="catalog-result" onClick={() => handleSelect(item)}>
                <ProductImage src={item.image_url} name={item.name} className="small" />
                <span>
                  <span className="catalog-result-name">{item.name}</span>
                  <span className="catalog-result-meta">
                    {item.brand ?? 'Unknown brand'}
                    {item.ingredients ? '' : ' · no ingredient list'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
