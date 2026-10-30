import { useState } from 'react';
import { ProductLibrary } from './components/ProductLibrary.jsx';
import { RoutineBuilder } from './components/RoutineBuilder.jsx';
import { confirmDiscard } from './unsavedChanges.js';

const PAGES = [
  { name: 'Routines', hash: '#routines', Page: RoutineBuilder },
  { name: 'Products', hash: '#products', Page: ProductLibrary },
];

function pageFromHash() {
  return PAGES.find((page) => page.hash === window.location.hash) ?? PAGES[0];
}

export function App() {
  const [current, setCurrent] = useState(pageFromHash);

  function handleSelect(page) {
    if (page === current || !confirmDiscard()) return;
    // Replacing keeps Back from moving between tabs past the discard check.
    window.history.replaceState(null, '', page.hash);
    setCurrent(page);
  }

  return (
    <div className="app">
      <nav className="app-nav">
        {PAGES.map((page) => (
          <button
            key={page.name}
            type="button"
            aria-current={page === current ? 'page' : undefined}
            onClick={() => handleSelect(page)}
          >
            {page.name}
          </button>
        ))}
      </nav>
      <current.Page />
    </div>
  );
}
