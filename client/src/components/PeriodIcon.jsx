// Decorative: the heading next to it already says morning or evening.
export function PeriodIcon({ period }) {
  return (
    <svg className="period-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {period === 'AM' ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
        </g>
      ) : (
        <path
          fill="currentColor"
          d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z"
        />
      )}
    </svg>
  );
}
