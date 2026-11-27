import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, getCsrf } from "../../api";
import { t } from "../../i18n";
import { Button, Card, Progress, Pill, BadgeIcon } from "../../components/ui";
import { User } from "../../types";
import { AttendancePanel } from "../../components/attendance/AttendancePanel";

export function Attendance() {
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">CHECK IN</span>
          <h2>Attendance</h2>
          <p>Display one QR for up to 60 minutes; refreshing this screen only replaces the QR generated in this browser.</p>
        </div>
      </div>
      <AttendancePanel />
    </div>
  );
}
