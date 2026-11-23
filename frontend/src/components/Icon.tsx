import { LucideIcon } from "lucide-react";
export function Icon({
  icon: Comp,
  size = 20,
}: {
  icon: LucideIcon;
  size?: number;
}) {
  return <Comp size={size} strokeWidth={2} aria-hidden="true" />;
}
