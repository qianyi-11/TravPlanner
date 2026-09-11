"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { Check, Globe, Loader2, Plus, Search } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import { TripHeader } from "@/components/trip/TripHeader";
import { PlaceCard } from "@/components/trip/PlaceCard";
import { Button, LinkButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { searchGooglePlaces } from "@/lib/google-places-client";
import type { Place } from "@/lib/types";

export default function AddPlacesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const currentUserId = usePlannerStore((s) => s.currentUserId);
  const allPlaces = usePlannerStore(useShallow((s) => Object.values(s.places)));
  const allPlacesById = usePlannerStore((s) => s.places);
  const addSuggestion = usePlannerStore((s) => s.addPlaceSuggestion);
  const importAndSuggest = usePlannerStore((s) => s.importAndSuggestPlace);
  const removeSuggestion = usePlannerStore((s) => s.removePlaceSuggestion);
  const showToast = usePlannerStore((s) => s.showToast);

  const [query, setQuery] = useState("");
  const [destFilter, setDestFilter] = useState<string>("All");
  const [mapsReady, setMapsReady] = useState(false);
  const [liveResults, setLiveResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch(() => {});
  }, []);

  const searchDestination = destFilter !== "All" ? destFilter : trip?.destinations[0] ?? "";

  useEffect(() => {
    if (!mapsReady || !query.trim() || !searchDestination) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setLiveResults([]);
      searchGooglePlaces(query, searchDestination).then((results) => {
        if (!cancelled) {
          setLiveResults(results);
          setSearching(false);
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
    return allPlaces
      .filter((p) => trip.destinations.includes(p.destination))
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
  }, [allPlaces, trip.destinations, destFilter, query]);

  const catalogIds = new Set(candidates.map((p) => p.id));
  const freshLiveResults = mapsReady && query.trim() && searchDestination
    ? liveResults.filter((p) => !catalogIds.has(p.id))
    : [];

  const myCount = allPlaces.filter(
    (p) => trip.placeIds.includes(p.id) && p.suggestedBy.includes(currentUserId)
  ).length;
  const solo = trip.memberIds.length === 1;

  async function handleAdd(place: Place) {
    const alreadyImported = Boolean(allPlacesById[place.id]);
    if (alreadyImported) {
      await addSuggestion(tripId, place.id);
      showToast(`${place.name} added to your suggestions`);
      return;
    }
    setAddingId(place.id);
    await importAndSuggest(tripId, place);
    setAddingId(null);
    showToast(`${place.name} added to your suggestions`);
  }

  function renderCard(place: Place) {
    const added = allPlacesById[place.id]
      ? place.suggestedBy.includes(currentUserId) || allPlacesById[place.id].suggestedBy.includes(currentUserId)
      : false;
    const isAdding = addingId === place.id;
    return (
      <PlaceCard
        key={place.id}
        place={allPlacesById[place.id] ?? place}
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
          {solo ? "Add the places you'd love to visit. Your preferences will shape the shortlist." : "Add the places you'd love to visit. Your group will vote on them later."}
        </p>

        <div className="sticky top-[70px] z-20 mt-5 rounded-2xl border border-[var(--color-border)] bg-white/95 p-3 shadow-[var(--shadow-soft)] backdrop-blur">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${trip.destinations[0]} places...`}
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
