import { t } from "../i18n";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Card, Button } from "./ui";
export function PwaInstallPrompt() {
  const [event, setEvent] = useState<any>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("yq_pwa_install_dismissed") === "1",
  );
  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((navigator as any).standalone);
    if (standalone) return;
    const handler = (e: any) => {
      e.preventDefault();
      setEvent(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (!event || dismissed) return null;
  async function install() {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice?.outcome === "accepted") setEvent(null);
  }
  function dismiss() {
    localStorage.setItem("yq_pwa_install_dismissed", "1");
    setDismissed(true);
  }
  return (
    <Card className="pwa-install-prompt">
      <div className="grow">
        <strong>{t("installYouthQuest")}</strong>
        <p>{t("installYouthQuestHelp")}</p>
      </div>
      <Button icon={Download} onClick={install}>
        {t("install")}
      </Button>
      <button
        className="prompt-dismiss"
        aria-label="Dismiss install prompt"
        onClick={dismiss}
      >
        <X size={18} />
      </button>
    </Card>
  );
}
