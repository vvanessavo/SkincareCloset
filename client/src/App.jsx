import { useState } from 'react';
import { ProductLibrary } from './components/ProductLibrary.jsx';
import { RoutineBuilder } from './components/RoutineBuilder.jsx';

const PAGES = [
  { name: 'Products', Page: ProductLibrary },
  { name: 'Routines', Page: RoutineBuilder },
];

export function App() {
  const [current, setCurrent] = useState(PAGES[0]);

  return (
    <div className="app">
      <nav className="app-nav">
        {PAGES.map((page) => (
          <button
            key={page.name}
            type="button"
            aria-current={page === current ? 'page' : undefined}
            onClick={() => setCurrent(page)}
          >
            {page.name}
          </button>
        ))}
      </nav>
      <current.Page />
    </div>
  );
}
