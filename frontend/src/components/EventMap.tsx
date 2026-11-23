import { t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Expand, Minimize, Navigation, MapPinned } from "lucide-react";
import {
  SCOTLAND_MAP_BOUNDS,
  SCOTLAND_MAP_MAX_ZOOM,
  SCOTLAND_MAP_MIN_ZOOM,
} from "../config/map";

export type EventMapValue = {
  id?: number;
  lat: number;
  lng: number;
  title?: string;
  locationName?: string;
  pinEnabled?: boolean;
  status?: string;
  startAt?: string | null;
  endAt?: string | null;
};
const pin = (status = "scheduled", enabled = true) =>
  L.divIcon({
    className: `yq-map-pin ${status} ${enabled ? "" : "disabled"}`,
    html: "<span></span>",
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  });
const safe = (x: string) => String(x || "").replace(/[<>]/g, "");
const inScotland = (lat: number, lng: number) =>
  lat >= SCOTLAND_MAP_BOUNDS[0][0] &&
  lat <= SCOTLAND_MAP_BOUNDS[1][0] &&
  lng >= SCOTLAND_MAP_BOUNDS[0][1] &&
  lng <= SCOTLAND_MAP_BOUNDS[1][1];
const clampToScotland = (lat: number, lng: number) => ({
  lat: Math.min(
    SCOTLAND_MAP_BOUNDS[1][0],
    Math.max(SCOTLAND_MAP_BOUNDS[0][0], lat),
  ),
  lng: Math.min(
    SCOTLAND_MAP_BOUNDS[1][1],
    Math.max(SCOTLAND_MAP_BOUNDS[0][1], lng),
  ),
});

class YouthQuestTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: any): HTMLElement {
    const tile = document.createElement("img");
    tile.alt = "";
    tile.setAttribute("role", "presentation");
    // Dev Tunnels can apply a same-origin document policy. Explicitly setting
    // the image referrer policy keeps OSM tile requests identifiable without
    // exposing the full Youth Quest route/query string.
    tile.referrerPolicy = "origin";
    tile.addEventListener("load", () => done(null, tile));
    tile.addEventListener("error", () =>
      done(new Error("Map tile failed to load"), tile),
    );
    tile.src = this.getTileUrl(coords);
    return tile;
  }
}

export function EventMap({
  value,
  events = [],
  editable = false,
  focusKey,
  onChange,
  onDirections,
  expandable = true,
}: {
  value: EventMapValue;
  events?: EventMapValue[];
  editable?: boolean;
  focusKey?: string | number;
  onChange?: (v: { lat: number; lng: number }) => void;
  onDirections?: () => void;
  expandable?: boolean;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const selectedMarker = useRef<L.Marker | null>(null);
  const draftMarker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const editableRef = useRef(editable);
  onChangeRef.current = onChange;
  editableRef.current = editable;
  const [expanded, setExpanded] = useState(false);
  const userCentre = useRef<{ lat: number; lng: number } | null>(null);
  const userLocationRequested = useRef(false);
  const all = events.filter(Boolean);
  const visibleEvents = all.filter((x) => inScotland(x.lat, x.lng));
  const centre =
    value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
      ? value
      : all[0] || { lat: 55.9533, lng: -3.1883 };

  useEffect(() => {
    if (
      userLocationRequested.current ||
      typeof navigator === "undefined" ||
      !navigator.geolocation
    )
      return;
    userLocationRequested.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = clampToScotland(
          Number(pos.coords.latitude),
          Number(pos.coords.longitude),
        );
        if (!inScotland(point.lat, point.lng)) return;
        userCentre.current = { lat: point.lat, lng: point.lng };
        map.current?.setView([point.lat, point.lng], 14, { animate: true });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, {
      zoomControl: true,
      scrollWheelZoom: editable,
      keyboard: !editable,
      maxBounds: SCOTLAND_MAP_BOUNDS,
      maxBoundsViscosity: 1,
      minZoom: SCOTLAND_MAP_MIN_ZOOM,
      maxZoom: SCOTLAND_MAP_MAX_ZOOM,
    });
    m.fitBounds(SCOTLAND_MAP_BOUNDS, { padding: [16, 16], animate: false });
    new YouthQuestTileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: SCOTLAND_MAP_MAX_ZOOM,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    map.current = m;
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => m.invalidateSize({ animate: false }))
        : null;
    resizeObserver?.observe(el.current);
    return () => {
      resizeObserver?.disconnect();
      m.remove();
      map.current = null;
      markers.current = [];
      selectedMarker.current = null;
      draftMarker.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || focusKey === undefined) return;
    const point = clampToScotland(Number(value?.lat), Number(value?.lng));
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      m.setView([point.lat, point.lng], 14, { animate: true });
    }
  }, [focusKey]);

  // Rebuild only when the event collection/selection changes. A drag must not recreate the
  // marker from React state on every mouse move, otherwise it visibly snaps back.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    selectedMarker.current = null;
    draftMarker.current = null;
    visibleEvents.forEach((ev) => {
      const isSelected = editable && ev.id === value?.id;
      const mk = L.marker([ev.lat, ev.lng], {
        icon: pin(ev.status || "scheduled", ev.pinEnabled !== false),
        draggable: isSelected,
      }).addTo(m);
      mk.bindPopup(
        `<strong>${safe(ev.title || "Event")}</strong><br/>${safe(ev.locationName || "")}`,
      );
      if (!editable) mk.on("click", () => onDirections && onDirections());
      if (isSelected) {
        selectedMarker.current = mk;
        mk.on("dragend", () => {
          const p = mk.getLatLng();
          onChangeRef.current?.({
            lat: Number(p.lat.toFixed(6)),
            lng: Number(p.lng.toFixed(6)),
          });
        });
        mk.on("click", () => mk.openPopup());
      }
      markers.current.push(mk);
    });
    if (editable && !value?.id && value?.title?.trim()) {
      const draft = L.marker([value.lat, value.lng], {
        icon: pin("scheduled", true),
        draggable: true,
      }).addTo(m);
      draft.on("dragend", () => {
        const p = draft.getLatLng();
        onChangeRef.current?.({
          lat: Number(p.lat.toFixed(6)),
          lng: Number(p.lng.toFixed(6)),
        });
      });
      draftMarker.current = draft;
      markers.current.push(draft);
    }
    const bounds = L.latLngBounds(
      visibleEvents.map((x) => [x.lat, x.lng] as [number, number]),
    );
    const safeCentre =
      userCentre.current || clampToScotland(centre.lat, centre.lng);
    if (bounds.isValid() && visibleEvents.length > 1)
      m.fitBounds(bounds.pad(0.18));
    else
      m.setView(
        [safeCentre.lat, safeCentre.lng],
        Math.max(
          SCOTLAND_MAP_MIN_ZOOM,
          Math.min(SCOTLAND_MAP_MAX_ZOOM, m.getZoom() || 13),
        ),
        { animate: false },
      );
    setTimeout(() => m.invalidateSize(), 50);
  }, [
    editable,
    value?.id,
    value?.title,
    value?.lat,
    value?.lng,
    JSON.stringify(
      events.map((x) => [x.id, x.lat, x.lng, x.status, x.pinEnabled]),
    ),
  ]);

  // Keep the selected/draft marker in sync with a saved edit without rebuilding it.
  useEffect(() => {
    const marker = value?.id ? selectedMarker.current : draftMarker.current;
    if (marker && Number.isFinite(value?.lat) && Number.isFinite(value?.lng)) {
      const p = marker.getLatLng();
      if (
        Math.abs(p.lat - value.lat) > 1e-7 ||
        Math.abs(p.lng - value.lng) > 1e-7
      )
        marker.setLatLng([value.lat, value.lng]);
    }
  }, [value?.lat, value?.lng, value?.id]);
  useEffect(() => {
    const m = map.current;
    if (!m || !editable) return;
    const handle = (ev: L.LeafletMouseEvent) => {
      const bounded = clampToScotland(ev.latlng.lat, ev.latlng.lng);
      const point = {
        lat: Number(bounded.lat.toFixed(6)),
        lng: Number(bounded.lng.toFixed(6)),
      };
      if (!value?.id) {
        if (!draftMarker.current) {
          const draft = L.marker([point.lat, point.lng], {
            icon: pin("scheduled", true),
            draggable: true,
          }).addTo(m);
          draft.on("dragend", () => {
            const p = draft.getLatLng();
            onChangeRef.current?.({
              lat: Number(p.lat.toFixed(6)),
              lng: Number(p.lng.toFixed(6)),
            });
          });
          draftMarker.current = draft;
          markers.current.push(draft);
        } else draftMarker.current.setLatLng([point.lat, point.lng]);
      }
      onChangeRef.current?.(point);
    };
    m.on("click", handle);
    return () => {
      m.off("click", handle);
    };
  }, [editable, value?.id]);
  return (
    <div className={`event-map-wrap ${expanded ? "map-expanded" : ""}`}>
      <div ref={el} className="event-map" />
      {!editable && onDirections && (
        <button className="map-directions" onClick={onDirections}>
          <Navigation size={16} />
          <span>{t("getDirections")}</span>
        </button>
      )}
      {expandable && (
        <button
          type="button"
          className="map-expand-btn"
          aria-label={expanded ? t("collapseMap") : t("expandMap")}
          onClick={() => {
            setExpanded((v) => !v);
            setTimeout(() => map.current?.invalidateSize(), 100);
          }}
        >
          {expanded ? <Minimize size={18} /> : <Expand size={18} />}
        </button>
      )}
      {editable && (
        <div className="map-help">
          <MapPinned size={15} />
          <span>{t("mapPinHelp")}</span>
        </div>
      )}
    </div>
  );
}
