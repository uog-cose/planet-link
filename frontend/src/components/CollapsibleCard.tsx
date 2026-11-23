import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Card } from "./ui";

export function CollapsibleCard({
  title,
  description,
  summary,
  icon: Icon,
  children,
  defaultOpen = false,
  collapsible = true,
  className = "",
}: {
  title: string;
  description?: string;
  summary?: string;
  icon?: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!collapsible) return <Card className={className}>{children}</Card>;
  return (
    <Card
      className={`config-collapsible ${open ? "is-open" : "is-closed"} ${className}`}
    >
      <button
        type="button"
        className="config-collapsible-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="config-collapsible-icon">
          <ChevronDown size={19} />
        </span>
        {Icon && <Icon size={21} />}
        <span className="config-collapsible-copy">
          <strong>{title}</strong>
          {description && <span>{description}</span>}
        </span>
        {summary && (
          <span className="config-collapsible-summary">{summary}</span>
        )}
      </button>
      <div className="config-collapsible-body" aria-hidden={!open}>
        <div className="config-collapsible-inner">{children}</div>
      </div>
    </Card>
  );
}
