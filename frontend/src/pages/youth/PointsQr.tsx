import { useEffect, useState } from "react";
import { api } from "../../api";
import { PointsQrCard } from "../../components/points/PointsQrCard";
import { Loading } from "../../components/feedback/Loading";
export function PointsQr() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api<any>("/dashboard/")
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data) return <Loading />;
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">POINTS</span>
          <h2>Your points QR</h2>
          <p>
            Share this QR with people from the public so they can leave feedback
            about you. A youth worker reviews every request before points are
            added.
          </p>
        </div>
      </div>
      <PointsQrCard
        avatar={data.profile.avatar}
        tier={data.profile.milestoneTier}
      />
    </div>
  );
}
