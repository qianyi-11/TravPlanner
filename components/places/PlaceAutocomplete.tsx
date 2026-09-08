"use client";

import { useEffect, useRef, useState } from "react";

export type PlaceSelection = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  formattedAddress?: string;
};

type PlaceWidget = HTMLElement & { placeholder: string; addEventListener: HTMLElement["addEventListener"] };
type PlaceLibrary = { PlaceAutocompleteElement: new () => PlaceWidget };
type SelectedPlace = { id?: string; displayName?: string; formattedAddress?: string; location?: { lat: () => number; lng: () => number }; fetchFields?: (options: { fields: string[] }) => Promise<void> };
type GoogleMaps = { importLibrary?: (name: "places") => Promise<PlaceLibrary>; places?: PlaceLibrary };
type GoogleWindow = Window & { google?: { maps?: GoogleMaps }; __travPlannerGoogleMapsReady?: () => void };

let loader: Promise<PlaceLibrary> | undefined;

function loadPlaces(): Promise<PlaceLibrary> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return Promise.reject(new Error("Google Places is not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY."));
  if (typeof window === "undefined") return Promise.reject(new Error("Google Places is only available in the browser."));
  const maps = (window as GoogleWindow).google?.maps;
  if (maps?.importLibrary) return maps.importLibrary("places");
  if (maps?.places?.PlaceAutocompleteElement) return Promise.resolve(maps.places);
  if (!loader) loader = new Promise<PlaceLibrary>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return true;
      const loadedMaps = (window as GoogleWindow).google?.maps;
      if (loadedMaps?.importLibrary) {
        settled = true;
        delete (window as GoogleWindow).__travPlannerGoogleMapsReady;
        loadedMaps.importLibrary("places").then(resolve, reject);
        return true;
      } else if (loadedMaps?.places?.PlaceAutocompleteElement) {
        settled = true;
        delete (window as GoogleWindow).__travPlannerGoogleMapsReady;
        resolve(loadedMaps.places);
        return true;
      }
      return false;
    };
    const existing = document.getElementById("google-maps-js") as HTMLScriptElement | null;
    const removeFailedScript = () => {
      if (document.getElementById("google-maps-js")?.dataset.travPlannerLoader === "true") document.getElementById("google-maps-js")?.remove();
      delete (window as GoogleWindow).__travPlannerGoogleMapsReady;
    };
    const missingPlaces = () => { removeFailedScript(); reject(new Error("Google Maps loaded without the Places library.")); };
    const fail = () => { removeFailedScript(); reject(new Error("Google Places could not be loaded.")); };
    if (existing) {
      if ((window as GoogleWindow).google?.maps) {
        if (!finish()) missingPlaces();
      }
      else {
        existing.addEventListener("load", () => setTimeout(() => { if (!finish()) missingPlaces(); }, 1000), { once: true });
        existing.addEventListener("error", fail, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-js";
    script.dataset.travPlannerLoader = "true";
    script.async = true;
    (window as GoogleWindow).__travPlannerGoogleMapsReady = finish;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly&loading=async&callback=__travPlannerGoogleMapsReady`;
    script.addEventListener("load", () => setTimeout(() => { if (!finish()) missingPlaces(); }, 1000), { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  }).catch((cause) => {
    loader = undefined;
    throw cause;
  });
  return loader;
}

export function PlaceAutocomplete({ label, placeholder, onChange }: { label: string; placeholder: string; onChange: (selection: PlaceSelection | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let disposed = false;
    const host = container.current;
    if (!host) return;
    void loadPlaces().then(({ PlaceAutocompleteElement }) => {
      if (disposed) return;
      const widget = new PlaceAutocompleteElement();
      widget.placeholder = placeholder;
      widget.setAttribute("aria-label", label);
      widget.style.width = "100%";
      const select = async (event: Event) => {
        try {
          const placePrediction = (event as Event & { placePrediction?: { toPlace: () => SelectedPlace } }).placePrediction;
          const place = placePrediction?.toPlace();
          if (!place?.id) throw new Error("The selected place did not include a provider ID.");
          await place.fetchFields?.({ fields: ["displayName", "formattedAddress", "location"] });
          if (!place.location) throw new Error("The selected place did not include a location.");
          const lat = place.location.lat();
          const lng = place.location.lng();
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("The selected place did not include valid coordinates.");
          setError(null);
          onChangeRef.current({ placeId: place.id, name: place.displayName || place.formattedAddress || "Selected place", lat, lng, formattedAddress: place.formattedAddress });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not read the selected place.");
          onChangeRef.current(null);
        }
      };
      widget.addEventListener("gmp-select", select);
      host.replaceChildren(widget);
      return () => widget.removeEventListener("gmp-select", select);
    }).catch((cause) => {
      if (!disposed) {
        console.error("Google Places failed to initialize.", cause);
        setError(cause instanceof Error && cause.message.startsWith("Google Places is not configured") ? cause.message : "Google Places failed to initialize. Check the browser key and Maps/Places API setup.");
      }
    });
    return () => { disposed = true; host.replaceChildren(); };
  }, [label, placeholder]);

  return <div><div ref={container} className="min-h-12 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2" />{error && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">{error}</p>}</div>;
}
