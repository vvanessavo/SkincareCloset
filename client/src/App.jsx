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
          <svg className="wordmark-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            {/* Jets rise from the centre and arc out into the upper bowl. */}
            <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 10.5V4.2" />
              <path d="M12 4.2C9.4 4.2 7.6 5.9 7 9.6" />
              <path d="M12 4.2c2.6 0 4.4 1.7 5 5.4" />
            </g>
            <circle cx="5.6" cy="14.2" r="0.9" fill="currentColor" />
            <circle cx="18.4" cy="14.2" r="0.9" fill="currentColor" />
            <circle cx="4.9" cy="16.6" r="0.75" fill="currentColor" />
            <circle cx="19.1" cy="16.6" r="0.75" fill="currentColor" />
            <path fill="currentColor" d="M6.5 10.4h11c-.4 1.6-2.7 2.7-5.5 2.7s-5.1-1.1-5.5-2.7Z" />
            <path fill="currentColor" d="M11.2 12.9h1.6l.5 5.1h-2.6Z" />
            <path
              fill="currentColor"
              d="M2.6 18h18.8c-.5 1.9-2.4 3.2-4.6 3.2H7.2c-2.2 0-4.1-1.3-4.6-3.2Z"
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
