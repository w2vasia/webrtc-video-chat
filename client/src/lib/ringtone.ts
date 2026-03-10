let ctx: AudioContext | null = null;
let ringing = false;
let timerId: ReturnType<typeof setTimeout> | null = null;

function playRingCycle() {
  if (!ringing || !ctx) return;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.frequency.value = 440;
  osc2.frequency.value = 480;
  gain.gain.value = 0.25;

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  osc1.start(now);
  osc1.stop(now + 1.0);
  osc2.start(now);
  osc2.stop(now + 1.0);

  timerId = setTimeout(playRingCycle, 3000);
}

export function startRingtone() {
  if (ringing) return;
  ringing = true;
  ctx = new AudioContext();
  playRingCycle();
}

export function stopRingtone() {
  ringing = false;
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  if (ctx) {
    ctx.close();
    ctx = null;
  }
}
