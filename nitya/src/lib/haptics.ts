/**
 * Haptics on iOS without the Vibration API.
 *
 * Safari has never implemented navigator.vibrate. But toggling an
 * <input type="checkbox" switch> triggers the system haptic on iOS 17.4+,
 * which is the only route a web app has to the Taptic Engine. We keep one
 * hidden switch in the DOM and click it.
 *
 * If this ever stops working, the fallbacks in order are: a Bluetooth
 * clicker (already supported — see useClicker), or wrapping the same app in
 * Capacitor for the real haptics API.
 */

let el: HTMLLabelElement | null = null;

function ensure(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (el && document.body.contains(el)) return el;
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  label.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none";
  label.setAttribute("aria-hidden", "true");
  document.body.appendChild(label);
  el = label;
  return el;
}

/** One tick per bead; a burst at a boundary. */
export function haptic(times = 1, gapMs = 72): void {
  const target = ensure();
  let i = 0;
  const fire = () => {
    try { target?.click(); } catch {}
    try { navigator.vibrate?.(12); } catch {}
    if (++i < times) setTimeout(fire, gapMs);
  };
  fire();
}

/* ── the bell at the end of a mālā ──────────────────────────────
   Synthesised rather than loaded: three inharmonic partials with
   independent decay is most of what makes a struck bell sound struck,
   and it ships nothing.                                            */

let ctx: AudioContext | null = null;

export function bell(fundamental = 318): void {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    [1, 2.76, 5.4].forEach((mult, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = fundamental * mult;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.26 / (i + 1.6), t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2 / (i + 1));
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + 3.4);
    });
  } catch {
    /* audio unavailable — the haptic still fired */
  }
}
