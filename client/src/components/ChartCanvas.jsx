import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useEffect, useRef, useState } from 'react';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

function readColors() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name) => styles.getPropertyValue(name).trim();
  return {
    accent: token('--accent'),
    border: token('--border'),
    muted: token('--muted'),
    surface: token('--surface'),
  };
}

// Canvas can't use CSS variables, so colors are read here and again on a theme change.
export function ChartCanvas({ buildConfig, label }) {
  const canvasRef = useRef(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleChange = () => setThemeVersion((version) => version + 1);
    scheme?.addEventListener('change', handleChange);
    return () => scheme?.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    // Canvas text doesn't inherit CSS, so axis labels are given the page's font.
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const chart = new Chart(canvasRef.current, buildConfig(readColors()));
    return () => chart.destroy();
  }, [buildConfig, themeVersion]);

  return (
    <div className="chart-canvas">
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
}
