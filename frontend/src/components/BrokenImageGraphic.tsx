import { useState } from "react";

export function BrokenImageGraphic({
  className = "",
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <img
        className={className}
        src="/quest-media/graphics/broken-image.svg"
        alt={alt}
        aria-hidden={!alt}
      />
    );
  return (
    <span
      className={`broken-image-graphic ${className}`.trim()}
      aria-label={alt || "Image unavailable"}
      role="img"
    >
      <img
        src="/quest-media/graphics/broken-image.svg"
        alt=""
        onError={() => setFailed(true)}
      />
    </span>
  );
}
