import { useState } from 'react';
import { ProductLibrary } from './components/ProductLibrary.jsx';
import { RoutineBuilder } from './components/RoutineBuilder.jsx';
import { SkinLog } from './components/SkinLog.jsx';
import { TodayChecklist } from './components/TodayChecklist.jsx';
import { confirmDiscard } from './unsavedChanges.js';

const PAGES = [
  { name: 'Routines', hash: '#routines', Page: RoutineBuilder },
  { name: 'Today', hash: '#today', Page: TodayChecklist },
  { name: 'Skin log', hash: '#skin-log', Page: SkinLog },
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
      <div className="topbar">
        <p className="wordmark">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2.5c3.6 4.3 6.5 7.8 6.5 11.4a6.5 6.5 0 0 1-13 0c0-3.6 2.9-7.1 6.5-11.4Z"
            />
          </svg>
          Skincare Tracker
        </p>
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
      </div>
      <current.Page />
      <footer className="app-footer">
        Search results and marked products come from{' '}
        <a href="https://world.openbeautyfacts.org" target="_blank" rel="noreferrer">
          Open Beauty Facts
        </a>
        . Data under the Open Database License, pictures under CC BY-SA.
      </footer>
    </div>
  );
}
