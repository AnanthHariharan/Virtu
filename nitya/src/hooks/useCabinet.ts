"use client";

import { useCallback, useEffect, useState } from "react";
import { idb, safe } from "@/lib/idb";
import { supabase, hasRemote } from "@/lib/supabase";
import { APPS } from "@/lib/registry";

/**
 * Which instruments are kept and which are shut. Local first, mirrored to
 * the `apps` table when a database is configured. Shutting one hides its
 * instrument; its entries stay in the Daybook, because the events belong to
 * the ledger, not to the app that wrote them.
 */
export function useCabinet() {
  const [off, setOff] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      const row = await safe(
        () => idb.get<{ key: string; value: string[] }>("meta", "cabinet:off"),
        undefined
      );
      if (row?.value) setOff(new Set(row.value));
    })();
  }, []);

  const enabled = useCallback((id: string) => !off.has(id), [off]);

  const toggle = useCallback(async (id: string) => {
    const app = APPS.find(a => a.id === id);
    if (app?.fixed) return;
    const next = new Set(off);
    next.has(id) ? next.delete(id) : next.add(id);
    setOff(next);
    await safe(() => idb.put("meta", { key: "cabinet:off", value: [...next] }), undefined);
    if (hasRemote()) {
      await supabase!.from("apps").upsert({ id, enabled: !next.has(id) }).then(() => {}, () => {});
    }
  }, [off]);

  return { enabled, toggle, off };
}
