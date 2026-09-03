"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribe, eventsOn, entities, allEvents, eventsOfKind } from "@/lib/ledger";
import { getMeta, setMeta } from "@/lib/db";
import { localDate } from "@/lib/time";
import { MODULES } from "@/modules/registry";
import type { VEvent, Entity, EventKind } from "@/lib/types";

/**
 * One subscription to the ledger, no polling. Every write emits once and
 * every hook below re-reads. At this data volume that is both correct and
 * fast, and it means no component ever holds a stale copy.
 */
function useLive<T>(read: () => Promise<T>, initial: T, deps: unknown[]): T {
  const [value, setValue] = useState<T>(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => { void read().then(setValue); }, deps);
  useEffect(() => { refresh(); return subscribe(refresh); }, [refresh]);
  return value;
}

export function useDay(date = localDate()): VEvent[] {
  return useLive(() => eventsOn(date), [], [date]);
}

export function useEntities(kind: string): Entity[] {
  return useLive(() => entities(kind), [], [kind]);
}

export function useKind<K extends EventKind>(kind: K): VEvent<K>[] {
  return useLive(() => eventsOfKind(kind), [], [kind]);
}

export function useAll(): VEvent[] {
  return useLive(() => allEvents(), [], []);
}

/** Today's events of one kind — the common case for "have I already?". */
export function useTodayKind<K extends EventKind>(kind: K): VEvent<K>[] {
  const day = useDay();
  return useMemo(() => day.filter(e => e.kind === kind) as VEvent<K>[], [day, kind]);
}

/**
 * Which modules are switched on.
 *
 * Switching one off hides its instrument and its entries — but the events
 * stay in the ledger, so switching it back on restores the history intact.
 * Events belong to the book, not to the module that wrote them.
 */
export function useModules() {
  const [off, setOff] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void getMeta<string[]>("modules:off", []).then(v => { setOff(v); setReady(true); });
  }, []);

  const enabled = useCallback((id: string) => !off.includes(id), [off]);

  const toggle = useCallback(async (id: string) => {
    if (MODULES.find(m => m.id === id)?.core) return;
    const next = off.includes(id) ? off.filter(x => x !== id) : [...off, id];
    setOff(next);
    await setMeta("modules:off", next);
  }, [off]);

  const active = useMemo(() => MODULES.filter(m => !off.includes(m.id)), [off]);

  return { enabled, toggle, active, off, ready };
}
