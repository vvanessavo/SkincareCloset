const CIRCUMFERENCE = 100;

// With a label it's a standalone image; without one the parent describes it.
export function ProgressRing({ percent, size, strokeWidth, label, children }) {
  const radius = (size - strokeWidth) / 2;

  return (
    <span
      className="progress-ring"
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          className="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        {percent > 0 && (
          <circle
            className="progress-ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            pathLength={CIRCUMFERENCE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE - percent}
          />
        )}
      </svg>
      {children && <span className="progress-ring-label">{children}</span>}
    </span>
  );
}
