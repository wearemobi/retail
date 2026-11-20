let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    audioContext = new Ctor();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

export function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  gainPeak = 0.08,
): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
  } catch {
    // Ignore audio playback errors if user hasn't interacted with page
  }
}

/** Chime de dos tonos para nuevas comandas que entran al board */
export function playNewTicketChime(): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.value = 880;
    gain1.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.value = 1318.5;
    gain2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.38);
  } catch {
    // Ignore audio playback errors
  }
}

/** Confirmación suave al ejecutar una transición FSM */
export function playTransitionSound(): void {
  tone(659.25, 0.16, "sine", 0.15);
}

/** Feedback táctil del keypad de PIN */
export function playKeypadClick(): void {
  tone(440, 0.04, "square", 0.05);
}

/** Sonido al agregar un ítem */
export function playAdd(): void {
  tone(660, 0.08, "sine", 0.08);
}

/** Sonido al remover un ítem */
export function playRemove(): void {
  tone(220, 0.08, "square", 0.05);
}

/** Sonido de éxito o despacho */
export function playSuccess(): void {
  tone(523.25, 0.1, "sine", 0.08);
  setTimeout(() => tone(659.25, 0.1, "sine", 0.08), 100);
  setTimeout(() => tone(783.99, 0.15, "sine", 0.08), 200);
}
