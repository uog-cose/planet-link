import { Menu, X } from "lucide-react";

export function MobileSidebarToggle({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="mobile-sidebar-toggle"
      type="button"
      aria-label={open ? "Close navigation" : "Open navigation"}
      aria-expanded={open}
      onClick={onClick}
    >
      {open ? <X size={20} /> : <Menu size={20} />}
      <span className="sr-only">
        {open ? "Close navigation" : "Open navigation"}
      </span>
    </button>
  );
}
