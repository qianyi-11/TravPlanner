"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Globe, Loader2, Plus, Search } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { Button, LinkButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { enrichGooglePlace, searchGooglePlaces } from "@/lib/google-places-client";
import type { Place } from "@/lib/types";

/** Stable reference so the selector doesn't return a fresh object each render. */
const EMPTY_TRIP_PLACES: Record<string, Place> = {};

export default function AddPlacesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const currentUserId = usePlannerStore((s) => s.currentUserId);
  const allPlaces = usePlannerStore(useShallow((s) => Object.values(s.places)));
  // Suggestions are per-trip: a place added in another group must not read as
  // "Added" here.
  const tripPlacesById = usePlannerStore((s) => s.tripPlaces[tripId] ?? EMPTY_TRIP_PLACES);
  const addSuggestion = usePlannerStore((s) => s.addPlaceSuggestion);
  const importAndSuggest = usePlannerStore((s) => s.importAndSuggestPlace);
  const removeSuggestion = usePlannerStore((s) => s.removePlaceSuggestion);
  const showToast = usePlannerStore((s) => s.showToast);

  const [query, setQuery] = useState("");
  const [destFilter, setDestFilter] = useState<string>("All");
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch((error: unknown) => {
        setMapsError(error instanceof Error ? error.message : "Google Maps could not load");
      });
  }, []);

  const searchDestination = destFilter !== "All" ? destFilter : trip?.destinations[0] ?? "";

  useEffect(() => {
    if (!mapsReady || !query.trim()) {
      setLiveResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchGooglePlaces(query, searchDestination || undefined)
        .then((results) => {
          if (!cancelled) {
            setLiveResults(results);
            setSearching(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLiveResults([]);
            setSearching(false);
            setMapsError("Google Places search failed. Check the API key and enabled APIs.");
          }
        });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchDestination, mapsReady]);

  if (!trip) notFound();

  const candidates = useMemo(() => {
    // Before the group settles on a destination, only show what's already been
    // suggested for this trip — everything else comes from live search.
    const pool =
      trip.destinations.length > 0
        ? allPlaces.filter((p) => trip.destinations.includes(p.destination))
        : allPlaces.filter((p) => trip.placeIds.includes(p.id));
    return pool
      .filter((p) => destFilter === "All" || p.destination === destFilter)
      .filter((p) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.rating - a.rating);
  }, [allPlaces, trip.destinations, trip.placeIds, destFilter, query]);

  const catalogIds = new Set(candidates.map((p) => p.id));
  const freshLiveResults = liveResults.filter((p) => !catalogIds.has(p.id));

  const myCount = Object.values(tripPlacesById).filter((p) =>
    p.suggestedBy.includes(currentUserId)
  ).length;

  async function handleAdd(place: Place) {
    // Whether it's in the shared catalogue at all — separate from whether this
    // trip has it. A place another group added still needs suggesting here.
    const alreadyInCatalog = allPlaces.some((p) => p.id === place.id);
    if (alreadyInCatalog) {
      await addSuggestion(tripId, place.id);
      showToast(`${place.name} added to your suggestions`);
      return;
    }
    setAddingId(place.id);
    const enriched =
      (await enrichGooglePlace(place.id.replace(/^g-/, ""), place.destination || undefined)) ?? place;
    await importAndSuggest(tripId, enriched);
    setAddingId(null);
    showToast(`${place.name} added to your suggestions`);
  }

  function renderCard(place: Place) {
    const inThisTrip = tripPlacesById[place.id];
    const added = inThisTrip ? inThisTrip.suggestedBy.includes(currentUserId) : false;
    const isAdding = addingId === place.id;
    return (
      <PlaceCard
        key={place.id}
        place={inThisTrip ?? place}
        footer={
          <Button
            size="sm"
            variant={added ? "outline" : "primary"}
            icon={isAdding ? <Loader2 size={14} className="animate-spin" /> : added ? <Check size={14} /> : <Plus size={14} />}
            disabled={isAdding}
            onClick={() => {
              if (added) {
                removeSuggestion(tripId, place.id);
              } else {
                handleAdd(place);
              }
            }}
            className={added ? "border-[var(--color-teal)] text-[var(--color-teal-dark)]" : ""}
          >
            {isAdding ? "Adding..." : added ? "Added" : "Add"}
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6">
        <h1 className="font-display text-2xl font-bold">Where do you want to go?</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Add the places you&apos;d love to visit. Your group will vote on them later.
        </p>

        <div className="sticky top-[70px] z-20 mt-5 rounded-2xl border border-[var(--color-border)] bg-white/95 p-3 shadow-[var(--shadow-soft)] backdrop-blur">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                trip.destinations.length > 0
                  ? `Search ${trip.destinations[0]} places...`
                  : "Search anywhere — try “Tokyo temples” or “Bali beach club”"
              }
              className="w-full rounded-xl border border-[var(--color-border)] py-3 pl-11 pr-10 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            {searching && (
              <Loader2 size={15} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[var(--color-ink-soft)]" />
            )}
          </div>
          {trip.destinations.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip label="All" selected={destFilter === "All"} onClick={() => setDestFilter("All")} />
              {trip.destinations.map((d) => (
                <Chip key={d} label={d} selected={destFilter === d} onClick={() => setDestFilter(d)} />
              ))}
            </div>
          )}
            {mapsError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {mapsError}
              </p>
            )}
        </div>

        <div className={`mt-5 space-y-3 ${myCount > 0 ? "pb-24 sm:pb-20" : ""}`}>
          {candidates.length === 0 && freshLiveResults.length === 0 ? (
            <EmptyState icon={Search} title="No places found" description="Try a different search term or destination." />
          ) : (
            candidates.map(renderCard)
          )}

          {freshLiveResults.length > 0 && (
            <div className="pt-2">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                <Globe size={13} /> More results from Google
              </div>
              <div className="space-y-3">{freshLiveResults.map(renderCard)}</div>
            </div>
          )}
        </div>

        {myCount > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-teal)] bg-[var(--color-teal-soft)] p-5">
            <div>
              <p className="font-display text-base font-bold">
                You&apos;ve added {myCount} place{myCount > 1 ? "s" : ""}
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-teal-dark)]">
                Done adding? Review them and submit so the group can start voting.
              </p>
            </div>
            <LinkButton
              href={`/trips/${tripId}/places/mine`}
              variant="secondary"
              iconRight={<ArrowRight size={15} />}
            >
              Review &amp; Submit
            </LinkButton>
          </div>
        )}
      </div>

      {myCount > 0 && (
        <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 sm:bottom-6">
          <div className="flex items-center gap-3 rounded-full bg-[var(--color-ink)] py-2 pl-5 pr-2 shadow-[var(--shadow-pop)]">
            <span className="text-sm font-semibold text-white">{myCount} places</span>
            <LinkButton href={`/trips/${tripId}/places/mine`} size="sm" variant="primary">
              Review Suggestions
            </LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
