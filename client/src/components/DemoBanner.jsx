const REPO_URL = 'https://github.com/vvanessavo/SkincareCloset';

export function DemoBanner() {
  async function handleReset() {
    if (!window.confirm('Reset the demo? Your changes here will be replaced with fresh sample data.')) {
      return;
    }
    const { resetDemo } = await import('demo-transport');
    await resetDemo();
  }

  return (
    <aside className="demo-banner" aria-label="About this demo">
      <p>
        <strong>Live demo</strong> with sample data. Try anything: changes stay in this browser
        only.
      </p>
      <div className="demo-banner-actions">
        <button type="button" onClick={handleReset}>
          Reset demo
        </button>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          View the code
        </a>
      </div>
    </aside>
  );
}
