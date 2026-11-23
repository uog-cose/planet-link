export function Loading() {
  return (
    <div
      className="loading-skeleton themed-loading"
      aria-label="Loading"
      role="status"
    >
      <div className="loading-skeleton-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="skeleton-line skeleton-eyebrow" />
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-grid">
        {[1, 2, 3].map((i) => (
          <div className="skeleton-card" key={i}>
            <div className="skeleton-circle" />
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-block" />
          </div>
        ))}
      </div>
      <div className="skeleton-wide">
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
        <div className="skeleton-bar" />
      </div>
    </div>
  );
}
