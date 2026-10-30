import { useState } from 'react';

// Falls back to the product's first letter when there is no picture or it won't load.
export function ProductImage({ src, name, className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (src && src !== failedSrc) {
    return (
      <img
        className={`product-image ${className}`}
        src={src}
        alt={name}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return (
    <span className={`product-image placeholder ${className}`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
