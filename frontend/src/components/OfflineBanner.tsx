import { t } from "../i18n";
import { useEffect, useState } from "react";
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false),
      off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return offline ? (
    <div className="offline-banner" role="status">
      {t("offlineNotice")}
    </div>
  ) : null;
}
