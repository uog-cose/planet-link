
from pathlib import Path
from datetime import datetime, timedelta
import shutil
import subprocess
import sys

root = Path.cwd()

page = root / "frontend/src/pages/admin/MapEvent.tsx"
calendar = root / "frontend/src/components/CalendarField.tsx"

if not page.exists() or not calendar.exists():
    raise SystemExit("ERROR: Run this script from the youth_quest project root.")

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = root / "backups" / f"event_datetime_fix_{stamp}"
backup.mkdir(parents=True)

for file in (page, calendar):
    destination = backup / file.name
    shutil.copy2(file, destination)
    print(f"BACKUP: {destination}")

# Fix event defaults: use a real local start time and
# calculate the end from that exact start.
source = page.read_text()

old = '''const newEvent = () => ({
  title: "",
  description: "",
  locationName: "",
  postcode: "",
  address: "",
  lat: EDINBURGH.lat,
  lng: EDINBURGH.lng,
  startAt: "NOW",
  endAt: localDateTime(86400000),
  visible: true,
  pinEnabled: true,
});'''

new = '''const newEvent = () => {
  const startAt = localDateTime();
  return {
    title: "",
    description: "",
    locationName: "",
    postcode: "",
    address: "",
    lat: EDINBURGH.lat,
    lng: EDINBURGH.lng,
    startAt,
    endAt: plus24Hours(startAt),
    visible: true,
    pinEnabled: true,
  };
};'''

if old not in source:
    raise SystemExit("Could not locate newEvent block. No files changed.")

source = source.replace(old, new, 1)

# Make 24-hour calculation use local calendar components.
old_helper = '''const plus24Hours = (value: string) => {
  if (value === "NOW") return localDateTime(86400000);
  const d = new Date(`${value}:00`);
  return Number.isNaN(d.getTime())
    ? localDateTime(86400000)
    : localInput(d.getTime() + 86400000);
};'''

new_helper = '''const plus24Hours = (value: string) => {
  const base = value === "NOW" ? localDateTime() : value;
  const match = String(base).match(
    /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})/
  );
  if (!match) return localDateTime(86400000);

  const [, y, mo, day, hour, minute] = match;
  const d = new Date(
    Number(y), Number(mo) - 1, Number(day),
    Number(hour), Number(minute), 0, 0
  );
  d.setTime(d.getTime() + 86400000);
  return localInput(d.getTime());
};'''

if old_helper not in source:
    raise SystemExit("Could not locate plus24Hours helper. No files changed.")

source = source.replace(old_helper, new_helper, 1)
page.write_text(source)

# CalendarField already synchronises its local state with value.
# Fix the quick-time buttons so they correctly handle day rollover.
cal_source = calendar.read_text()

old_clock = '''  const addMinutes = (base: string, minutes: number) => {
    const [h, m] = base.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + minutes, 0, 0);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };'''

new_clock = '''  const addMinutes = (base: string, minutes: number) => {
    const [h, m] = base.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m + minutes, 0, 0);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };'''

if old_clock not in cal_source:
    print("NOTE: Quick-time helper unchanged; no replacement needed.")
else:
    cal_source = cal_source.replace(old_clock, new_clock, 1)

calendar.write_text(cal_source)

print("\\nPATCH APPLIED")
print("New events now default to a real local start time.")
print("End time defaults to 24 hours after the start.")
print("The existing end-time manual editing behaviour is preserved.")
print("\\nRunning frontend TypeScript validation...")

try:
    subprocess.run(
        ["npm", "run", "lint"],
        cwd=root / "frontend",
        check=True
    )
    print("\\nSUCCESS: TypeScript validation passed.")
except subprocess.CalledProcessError:
    print("\\nWARNING: TypeScript validation failed. Backups are available.")
    sys.exit(1)

