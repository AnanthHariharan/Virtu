"use client";

import { useRouter } from "next/navigation";
import { Opening, Fleuron, Sec, Entry } from "@/components/Page";
import { useToday, useEntities } from "@/hooks/useLedger";
import { logEvent } from "@/lib/store";
import { SLOTS, slotFor } from "@/lib/time";
import { haptic } from "@/lib/haptics";

export default function Rites() {
  const router = useRouter();
  const rites = useEntities("rite");
  const today = useToday();
  const slot = slotFor();

  const observed = new Set(
    today.filter(e => e.kind === "rite" && e.payload?.observed).map(e => String(e.payload!.rite_slug))
  );

  async function observe(slug: string, name: string, riteSlot: string, isJapa: boolean) {
    haptic(1);
    // Append-only: unobserving writes observed:false rather than deleting.
    await logEvent({
      kind: "rite",
      payload: { rite_slug: slug, name, slot: riteSlot, observed: !observed.has(slug) },
    });
    if (isJapa && !observed.has(slug)) router.push("/japa");
  }

  return (
    <>
      <Opening title="Anu" em="ṣṭhāna" sub="Nitya-karma · three vessels" />
      <Fleuron mark="❧ ❦ ❧" />

      {SLOTS.map(s => {
        const mine = rites.filter(r => r.meta?.slot === s.key);
        if (!mine.length) return null;
        const done = mine.filter(r => observed.has(r.slug)).length;
        return (
          <div key={s.key}>
            <Sec mark={s.key === slot ? "☞" : "·"} tail={`${done} / ${mine.length}`}>
              {s.label}
            </Sec>
            {mine.map(r => (
              <Entry
                key={r.slug}
                mark={observed.has(r.slug) ? "✓" : "¶"}
                markTone={observed.has(r.slug) ? "gilt" : "rubric"}
                done={observed.has(r.slug)}
                title={r.name}
                note={
                  r.meta?.japa ? "with Gāyatrī japa"
                  : r.meta?.portion ? "daily portion — corpus awaiting your śākhā"
                  : undefined
                }
                right={r.meta?.japa ? "japa" : r.meta?.portion ? "portion" : undefined}
                onClick={() => observe(r.slug, r.name, s.key, !!r.meta?.japa)}
              />
            ))}
          </div>
        );
      })}

      <div className="btn-row">
        <button className="btn red" onClick={() => { haptic(1); router.push("/japa"); }}>
          Open the counter
        </button>
      </div>

      <p className="colophon">
        Brahma-yajñam records a portion once its canon is seeded. Coverage against a
        known corpus is the one measure here with ground truth.
      </p>
    </>
  );
}
