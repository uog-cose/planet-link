import { useEffect, useState } from "react";
import { api } from "../../api";
import { t } from "../../i18n";
import { Button, Card, Pill } from "../../components/ui";
import { EmptyCard } from "../../components/EmptyCard";
import { EventMap } from "../../components/EventMap";
import {
  CalendarClock,
  MapPinned,
  Save,
  Square,
  Power,
  Plus,
  Search,
  Copy,
  Check,
  LocateFixed,
  ExternalLink,
} from "lucide-react";
import { CalendarField } from "../../components/CalendarField";
import { SearchSelect } from "../../components/SearchSelect";
import { appUrl } from "../../config";
const localDateTime = (offsetMs = 0) => {
  const d = new Date(Date.now() + offsetMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const EDINBURGH = { lat: 55.9533, lng: -3.1883 };
const newEvent = () => ({
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
});
const fmt = (x: any) =>
  x
    ? new Date(x).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "No time";
const localInput = (value: any) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const plus24Hours = (value: string) => {
  if (value === "NOW") return localDateTime(86400000);
  const d = new Date(`${value}:00`);
  return Number.isNaN(d.getTime())
    ? localDateTime(86400000)
    : localInput(d.getTime() + 86400000);
};
export function MapEvent() {
  const [e, setE] = useState<any>(newEvent());
  const [mapFocusKey, setMapFocusKey] = useState(0);
  const [endTouched, setEndTouched] = useState(false);
  const [mapInstanceId, setMapInstanceId] = useState<number | null>(null);
  const [mapToken, setMapToken] = useState("");
  const [mapAccessCode, setMapAccessCode] = useState("");
  const [mapExpires, setMapExpires] = useState("");
  const [mapCopied, setMapCopied] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const load = () =>
    api<any>("/map-event/").then((r) => {
      setEvents(r.events || []);
      setMapInstanceId(r.mapAccess?.instanceId || null);
      setMapToken(r.mapAccess?.token || "");
      setMapAccessCode(r.mapAccess?.token || "");
      setMapExpires(
        r.mapAccess?.expiresAt
          ? localInput(r.mapAccess.expiresAt)
          : localDateTime(86400000),
      );
    });
  useEffect(() => {
    load();
  }, []);
  async function generatePrivateLink() {
    try {
      const accessCode = mapAccessCode.trim().toUpperCase();
      const candidate = mapExpires || localDateTime(86400000);
      const parsedExpiry = new Date(candidate).getTime();
      const expiresAt =
        Number.isFinite(parsedExpiry) && parsedExpiry > Date.now() + 60000
          ? candidate
          : localDateTime(86400000);
      if (expiresAt !== mapExpires) setMapExpires(expiresAt);
      if (!/^[A-Z0-9]{6,16}$/.test(accessCode)) {
        setError(
          "Enter a 6–16 character map access key using letters and numbers only.",
        );
        return;
      }
      const r = await api<any>("/map-event/", {
        method: "POST",
        body: JSON.stringify({ action: "private-link", expiresAt, accessCode }),
      });
      setMapToken(r.token);
      setMapExpires(localInput(r.expiresAt));
      setMsg("Private map access updated.");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function privateLink() {
    return appUrl(
      `/public/map/${encodeURIComponent(String(mapInstanceId || ""))}/${encodeURIComponent(mapToken)}`,
    );
  }
  function openPrivateLink() {
    if (!mapToken || !mapInstanceId) return;
    window.open(privateLink(), "_blank", "noopener,noreferrer");
  }
  async function copyPrivateLink() {
    if (!mapToken || !mapInstanceId) return;
    const text = privateLink();
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text);
      else throw new Error();
      setMapCopied(true);
      setTimeout(() => setMapCopied(false), 1800);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setMapCopied(true);
        setTimeout(() => setMapCopied(false), 1800);
      } else
        setError("Copy failed. Select and copy the link manually: " + text);
    }
  }
  async function lookupAddress(postcodeValue?: string) {
    const postcode = String(postcodeValue ?? e.postcode ?? "").trim();
    if (!postcode) {
      setError("Enter a UK postcode first.");
      return;
    }
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode)) {
      return;
    }
    setLookupBusy(true);
    setError("");
    setSuggestions([]);
    try {
      const result = await api<any>(
        `/map-event/lookup/?postcode=${encodeURIComponent(postcode)}`,
      );
      setE((x: any) => ({
        ...x,
        postcode: result.postcode,
        lat: Number(result.lat),
        lng: Number(result.lng),
        ...(result.suggestions?.length
          ? {}
          : {
              address: result.fallbackLocation || x.address,
              locationName: result.fallbackLocation || x.locationName,
            }),
      }));
      const found = Array.isArray(result.suggestions) ? result.suggestions : [];
      setSuggestions(found);
      setMapFocusKey((k) => k + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to find that postcode.",
      );
    } finally {
      setLookupBusy(false);
    }
  }
  function chooseAddress(place: any) {
    setE((x: any) => ({
      ...x,
      address: String(place.display_name || "").slice(0, 240),
      locationName: String(place.display_name || "")
        .split(",")
        .slice(0, 2)
        .join(",")
        .slice(0, 180),
      lat: Number(place.lat),
      lng: Number(place.lon),
    }));
    setSuggestions([]);
    setMapFocusKey((k) => k + 1);
  }
  useEffect(() => {
    if (e.id) return;
    const postcode = String(e.postcode || "").trim();
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode)) return;
    const timer = window.setTimeout(() => {
      void lookupAddress(postcode);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [e.postcode, e.id]);
  useEffect(() => {
    if (e.id || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setE((x: any) => ({
          ...x,
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        }));
        setMapFocusKey((k) => k + 1);
        setMsg("Map centred on your device location.");
      },
      () => {
        if (!cancelled)
          setMsg(
            "Using the default map area. You can move the pin or search by postcode.",
          );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    );
    return () => {
      cancelled = true;
    };
  }, [e.id]);
  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Your browser does not provide device location.");
      return;
    }
    setMsg("Finding your device location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setE((x: any) => ({
          ...x,
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        }));
        setMapFocusKey((k) => k + 1);
        setMsg("Map centred on your device location.");
      },
      () =>
        setError(
          "Location access was unavailable. Check your browser location permission and try again.",
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }
  async function save() {
    setMsg("");
    setError("");
    if (!e.title.trim()) {
      setError("Add an event title.");
      return;
    }
    if (!e.startAt) {
      setError("Choose a start date and time.");
      return;
    }
    if (!e.endAt) {
      setError("Choose an end date and time.");
      return;
    }
    if (
      e.startAt !== "NOW" &&
      new Date(`${e.startAt}:00`).getTime() < Date.now() - 60000
    ) {
      setError(
        "Start date and time has already passed. Choose now or a future time.",
      );
      return;
    }
    if (
      e.startAt !== "NOW" &&
      new Date(e.endAt).getTime() <= new Date(e.startAt).getTime()
    ) {
      setError("End date and time must be after the start date and time.");
      return;
    }
    try {
      await api("/map-event/", {
        method: e.id ? "PATCH" : "POST",
        body: JSON.stringify({ ...e }),
      });
      setMsg(t("saved"));
      setE(newEvent());
      setEndTouched(false);
      setSuggestions([]);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function endNow(id: number) {
    try {
      await api("/map-event/end/", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function edit(x: any) {
    setError("");
    setEndTouched(true);
    setE({ ...x, startAt: localInput(x.startAt), endAt: localInput(x.endAt) });
    setSuggestions([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">EVENT MAP</span>
          <h2>Event locations</h2>
          <p>
            Create an event by postcode first, then choose a suggested address
            or drag the pin manually.
          </p>
        </div>
        <MapPinned size={34} />
      </div>
      <Card className="map-event-create-card">
        <div className="section-head">
          <div>
            <h3>{e.id ? "Edit event" : "Add an event"}</h3>
            <p className="muted">
              We’ll use your device location when available. You can also search
              by UK postcode and choose the exact address.
            </p>
          </div>
          <Plus />
        </div>
        <div className="grid-2">
          <label>
            Event title
            <input
              value={e.title || ""}
              placeholder="e.g. Saturday Quest"
              onChange={(x) => setE({ ...e, title: x.target.value })}
            />
          </label>
          <label>
            Location name
            <input
              value={e.locationName || ""}
              placeholder="e.g. Youth Centre"
              onChange={(x) => setE({ ...e, locationName: x.target.value })}
            />
          </label>
          <label>
            UK postcode
            <div className="inline-input-action">
              <input
                value={e.postcode || ""}
                placeholder="e.g. EH1 1YZ"
                onChange={(x) =>
                  setE({ ...e, postcode: x.target.value.toUpperCase() })
                }
              />
              <Button
                type="button"
                variant="secondary"
                icon={Search}
                disabled={lookupBusy}
                onClick={() => void lookupAddress()}
              >
                {lookupBusy ? "Finding…" : "Find"}
              </Button>
            </div>
          </label>
          <div>
            {suggestions.length ? (
              <SearchSelect
                label="Address"
                value={e.address || ""}
                onChange={(v) => {
                  const place = suggestions.find(
                    (p: any) => String(p.display_name) === v,
                  );
                  if (place) chooseAddress(place);
                }}
                options={suggestions.map((x: any) => ({
                  value: String(x.display_name),
                  label: String(x.display_name),
                  meta: String(x.type || "address"),
                }))}
                placeholder="Select an address…"
                searchPlaceholder="Search addresses…"
              />
            ) : (
              <label>
                Address
                <input
                  value={e.address || ""}
                  placeholder={
                    lookupBusy
                      ? "Finding addresses…"
                      : "Enter a postcode to find addresses"
                  }
                  readOnly={!e.address}
                />
              </label>
            )}
          </div>
          <label className="span-2">
            Description
            <textarea
              value={e.description || ""}
              onChange={(x) => setE({ ...e, description: x.target.value })}
            />
          </label>
          <CalendarField
            label="Starts"
            value={e.startAt || "NOW"}
            onChange={(v) => {
              setE((x: any) => ({
                ...x,
                startAt: v,
                ...(!endTouched ? { endAt: plus24Hours(v) } : {}),
              }));
            }}
            required
          />
          <CalendarField
            label="Ends"
            value={e.endAt || ""}
            onChange={(v) => {
              setEndTouched(true);
              setE((x: any) => ({ ...x, endAt: v }));
            }}
            required
          />
        </div>
        {suggestions.length > 0 && (
          <div className="map-address-suggestions">
            <strong>{suggestions.length} addresses found</strong>
            <span className="muted">
              Choose the exact address from the dropdown.
            </span>
          </div>
        )}
        <div className="map-selection-status">
          <Button
            type="button"
            variant="secondary"
            icon={LocateFixed}
            onClick={useMyLocation}
          >
            Use my location
          </Button>{" "}
          {e.address ? (
            <>
              <strong>Selected address:</strong> {e.address}{" "}
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setE((x: any) => ({
                    ...x,
                    lat: EDINBURGH.lat,
                    lng: EDINBURGH.lng,
                  }))
                }
              >
                Reset pin
              </Button>
            </>
          ) : (
            <span className="muted">
              Choose an address above, then drag the pin if the exact
              entrance/location needs adjusting.
            </span>
          )}
        </div>
        <div className="map-instruction-note">
          <strong>Map placement</strong>
          <br />
          Click the map to place the new event pin. Existing pins stay visible.
          Drag the selected pin to fine-tune it.
        </div>
        <EventMap
          value={e}
          events={events}
          editable
          focusKey={mapFocusKey}
          onChange={(v) => setE({ ...e, ...v })}
        />
        <div className="top-actions event-save-row">
          <Button icon={Save} onClick={save}>
            {e.id ? "Update event" : "Add event"}
          </Button>
          {e.id && (
            <Button
              variant="secondary"
              onClick={() => {
                setE(newEvent());
                setEndTouched(false);
                setError("");
              }}
            >
              Cancel edit
            </Button>
          )}
          {msg && <span className="success">{msg}</span>}
          {error && <span className="field-error">{error}</span>}
        </div>
      </Card>
      <Card className="map-event-share-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">PRIVATE PUBLIC MAP</span>
            <h3>Share the event map</h3>
            <p className="muted">
              Default access lasts 24 hours. Choose any future expiry when
              needed.
            </p>
          </div>
          <MapPinned />
        </div>
        <div className="grid-2">
          <label>
            Map access key
            <input
              value={mapAccessCode}
              maxLength={16}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. QUEST2026"
              onChange={(e) =>
                setMapAccessCode(
                  e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase(),
                )
              }
            />
            <small className="muted">
              Choose a short key people can type easily. It is not generated
              automatically.
            </small>
          </label>
          <CalendarField
            label="Expires in"
            value={mapExpires || localDateTime(86400000)}
            onChange={setMapExpires}
          />
          <div className="top-actions" style={{ alignItems: "end" }}>
            <Button icon={Save} onClick={generatePrivateLink}>
              Save expiry
            </Button>
            <Button
              variant="secondary"
              icon={mapCopied ? Check : Copy}
              disabled={!mapToken || !mapInstanceId}
              onClick={() => void copyPrivateLink()}
            >
              {mapCopied ? "Copied" : "Copy private link"}
            </Button>
            <Button
              variant="ghost"
              icon={ExternalLink}
              disabled={!mapToken || !mapInstanceId}
              onClick={openPrivateLink}
            >
              Open public map
            </Button>
          </div>
        </div>
        {mapToken && (
          <p className="muted">
            Private link is active until {fmt(mapExpires)}. Key:{" "}
            <strong>{mapAccessCode}</strong>
          </p>
        )}
      </Card>
      <Card className="map-event-timeline-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">EVENT TIMELINE</span>
            <h3>Current → next → later</h3>
            <p className="muted">
              Open an event only when you need its controls.
            </p>
          </div>
          <CalendarClock />
        </div>
        {events.length ? (
          <div className="event-timeline">
            {events.map((x, i) => (
              <details className={`event-timeline-row ${x.status}`} key={x.id}>
                <summary>
                  <div className="event-status">
                    {x.status === "current"
                      ? "NOW"
                      : x.status === "scheduled"
                        ? i === 0
                          ? "NEXT"
                          : "LATER"
                        : "PAST"}
                  </div>
                  <div className="grow">
                    <strong>{x.title}</strong>
                    <span>
                      {x.address || x.locationName || "Location not named"} ·{" "}
                      {fmt(x.startAt)} → {fmt(x.endAt)}
                    </span>
                  </div>
                  <Pill>{x.status}</Pill>
                </summary>
                <div className="event-timeline-details">
                  <div className="top-actions">
                    <Button
                      variant="secondary"
                      icon={Power}
                      onClick={async () => {
                        await api("/map-event/", {
                          method: "PATCH",
                          body: JSON.stringify({
                            action: "toggle-pin",
                            id: x.id,
                            pinEnabled: x.pinEnabled === false,
                          }),
                        });
                        load();
                      }}
                    >
                      {x.pinEnabled === false ? "Enable pin" : "Disable pin"}
                    </Button>
                    <Button variant="secondary" onClick={() => edit(x)}>
                      Edit
                    </Button>
                    {x.status === "current" && (
                      <Button
                        variant="secondary"
                        icon={Square}
                        onClick={() => endNow(x.id)}
                      >
                        End now
                      </Button>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyCard
            icon={CalendarClock}
            title="No events scheduled"
            body="Add the first event above. It will automatically become Current when its start time arrives."
          />
        )}
      </Card>
    </div>
  );
}
