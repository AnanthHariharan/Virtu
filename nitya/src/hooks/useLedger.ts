"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribe, eventsOn, getEntities, allEvents } from "@/lib/store";
import { localDate } from "@/lib/time";
import type { NEvent, Entity, EventKind } from "@/lib/types";

/** Re-runs whenever anything is written. One subscription, no polling. */
function useLive<T>(read: () => Promise<T>, initial: T, deps: unknown[] = []): [T, () => void] {
  const [value, setValue] = useState<T>(initial);
  const refresh = useCallback(() => { void read().then(setValue); }, deps); // eslint-disable-line
  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);
  return [value, refresh];
}

export function useToday(): NEvent[] {
  const [rows] = useLive(() => eventsOn(localDate()), [] as NEvent[]);
  return rows;
}

export function useEntities(kind: string): Entity[] {
  const [rows] = useLive(() => getEntities(kind), [] as Entity[], [kind]);
  return rows;
}

export function useEvents(kind?: EventKind): NEvent[] {
  const [rows] = useLive(
    async () => {
      const all = await allEvents();
      return kind ? all.filter(e => e.kind === kind) : all;
    },
    [] as NEvent[],
    [kind]
  );
  return rows;
}

/** The most recent event of a kind matching a predicate — for "did I already log this today?" */
export function useLatest(kind: EventKind, match: (e: NEvent) => boolean): NEvent | undefined {
  const rows = useEvents(kind);
  return rows.find(match);
}
