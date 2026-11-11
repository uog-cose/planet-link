import { LucideIcon, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./ui";
export function EmptyCard({
  title,
  body,
  icon: Icon = Inbox,
  action,
  className = "",
}: {
  title: string;
  body?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`null-card ${className}`}>
      <div className="null-card-icon">
        <Icon size={22} />
      </div>
      <div>
        <strong>{title}</strong>
        {body && <p>{body}</p>}
      </div>
      {action}
    </Card>
  );
}
