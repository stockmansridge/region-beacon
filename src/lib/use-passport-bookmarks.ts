import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readStoredPassportForEvent } from "@/lib/use-current-event-passport";

export type BookmarkKind = "venue" | "offer";

export type BookmarkRow = {
  kind: BookmarkKind;
  venue_id: string;
  venue_name: string | null;
  logo_path: string | null;
  cover_path: string | null;
  offer_summary: string | null;
  created_at: string;
};

/**
 * Bookmarks live on the passport, so they are shared by every component on
 * the page. One tiny store per event keeps the venue page, the offer cards
 * and the Bookmarks page in sync without each button running its own query.
 */
const store = new Map<string, BookmarkRow[]>();
const loaded = new Set<string>();
const subscribers = new Map<string, Set<() => void>>();

function emit(eventId: string) {
  subscribers.get(eventId)?.forEach((fn) => fn());
}

function tokenFor(eventId: string): string | null {
  return readStoredPassportForEvent(eventId)?.access_token ?? null;
}

async function load(eventId: string) {
  const token = tokenFor(eventId);
  if (!token) return;
  const { data, error } = await supabase.rpc("get_passport_bookmarks", {
    _raw_token: token,
  });
  if (error) return;
  store.set(eventId, ((data ?? []) as BookmarkRow[]).filter((r) => r.venue_id));
  loaded.add(eventId);
  emit(eventId);
}

export function usePassportBookmarks(eventId: string | null | undefined) {
  const [, force] = useState(0);
  const key = eventId ?? "";

  useEffect(() => {
    if (!key) return;
    const rerender = () => force((n) => n + 1);
    const set = subscribers.get(key) ?? new Set<() => void>();
    set.add(rerender);
    subscribers.set(key, set);
    if (!loaded.has(key)) void load(key);
    else rerender();
    return () => {
      set.delete(rerender);
    };
  }, [key]);

  const rows = key ? (store.get(key) ?? []) : [];
  const enabled = key ? tokenFor(key) !== null : false;

  const has = useCallback(
    (kind: BookmarkKind, venueId: string) =>
      rows.some((r) => r.kind === kind && r.venue_id === venueId),
    [rows],
  );

  const toggle = useCallback(
    async (kind: BookmarkKind, venueId: string) => {
      if (!key) return;
      const token = tokenFor(key);
      if (!token) return;
      const { data, error } = await supabase.rpc("toggle_passport_bookmark", {
        _raw_token: token,
        _kind: kind,
        _venue_id: venueId,
      });
      if (error) return;
      const nowBookmarked = data === true;
      const current = store.get(key) ?? [];
      if (nowBookmarked) {
        store.set(key, [
          {
            kind,
            venue_id: venueId,
            venue_name: null,
            logo_path: null,
            cover_path: null,
            offer_summary: null,
            created_at: new Date().toISOString(),
          },
          ...current.filter((r) => !(r.kind === kind && r.venue_id === venueId)),
        ]);
      } else {
        store.set(
          key,
          current.filter((r) => !(r.kind === kind && r.venue_id === venueId)),
        );
      }
      emit(key);
      // Refresh so newly added rows pick up their venue details.
      void load(key);
    },
    [key],
  );

  return { enabled, rows, has, toggle, reload: () => load(key) };
}
