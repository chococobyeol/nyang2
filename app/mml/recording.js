import { serializeTrackEvents, TICKS_PER_QUARTER } from "./core.js";

export const QUANTIZE_TICKS = {
  "1/1": 384,
  "1/2": 192,
  "1/4": 96,
  "1/8": 48,
  "1/16": 24,
  "1/32": 12,
  off: 1,
};

const AUTO_GRIDS = [96, 48, 32, 24, 16, 12];

function autoQuantizeTick(value) {
  let best = { value: Math.round(value), score: Infinity };
  for (const grid of AUTO_GRIDS) {
    const candidate = Math.round(value / grid) * grid;
    const complexityPenalty = (48 / grid) * 1.5;
    const score = Math.abs(candidate - value) + complexityPenalty;
    if (score < best.score) best = { value: candidate, score };
  }
  return best.value;
}

export function quantizeInputs(inputs, bpm, division = "1/8", origin = null) {
  if (!inputs.length) return [];
  const start = origin ?? Math.min(...inputs.map((input) => input.startedAt));
  const ticksPerSecond = (TICKS_PER_QUARTER * bpm) / 60;
  const grid = QUANTIZE_TICKS[division] ?? QUANTIZE_TICKS["1/8"];
  return inputs.map((input) => {
    const rawStart = Math.max(0, (input.startedAt - start) * ticksPerSecond);
    const rawEnd = Math.max(rawStart, (input.endedAt - start) * ticksPerSecond);
    const tick = division === "off" ? Math.round(rawStart) : division === "auto" ? autoQuantizeTick(rawStart) : Math.round(rawStart / grid) * grid;
    const end = division === "off" ? Math.round(rawEnd) : division === "auto" ? autoQuantizeTick(rawEnd) : Math.round(rawEnd / grid) * grid;
    const minimum = division === "off" ? 1 : division === "auto" ? 12 : grid;
    return { ...input, tick, duration: Math.max(minimum, end - tick) };
  });
}

function overlaps(a, b) {
  return a.tick < b.tick + b.duration && b.tick < a.tick + a.duration;
}

function connectedComponents(notes) {
  const remaining = new Set(notes.map((_, index) => index));
  const components = [];
  while (remaining.size) {
    const seed = remaining.values().next().value;
    remaining.delete(seed);
    const queue = [seed];
    const component = [];
    while (queue.length) {
      const index = queue.pop();
      component.push(notes[index]);
      for (const candidate of [...remaining]) {
        if (component.some((note) => overlaps(note, notes[candidate]))) {
          remaining.delete(candidate);
          queue.push(candidate);
        }
      }
    }
    components.push(component);
  }
  return components;
}

export function allocateInputs(inputs, routing, pitchPriority = "high") {
  const assigned = [];
  const dropped = [];
  const trackOrder = [...new Set([...routing.left, ...routing.right])];

  for (const component of connectedComponents(inputs)) {
    const ordered = [...component].sort((a, b) => {
      const aCount = routing[a.side]?.length ?? 0;
      const bCount = routing[b.side]?.length ?? 0;
      if (aCount !== bCount) return aCount - bCount;
      return pitchPriority === "high" ? b.midi - a.midi : a.midi - b.midi;
    });
    let best = { assignments: [], count: -1, score: -Infinity };
    const occupied = new Map();
    const current = [];

    const search = (index) => {
      if (index === ordered.length) {
        const score = current.reduce((sum, item) => {
          const pitchRank = pitchPriority === "high" ? item.input.midi : -item.input.midi;
          return sum + pitchRank * 0.001 - trackOrder.indexOf(item.trackId) * 0.000001;
        }, 0);
        if (current.length > best.count || (current.length === best.count && score > best.score)) {
          best = { assignments: current.map((item) => ({ ...item })), count: current.length, score };
        }
        return;
      }
      if (current.length + (ordered.length - index) < best.count) return;
      const input = ordered[index];
      for (const trackId of routing[input.side] ?? []) {
        const trackNotes = occupied.get(trackId) ?? [];
        if (trackNotes.some((note) => overlaps(note, input))) continue;
        trackNotes.push(input);
        occupied.set(trackId, trackNotes);
        current.push({ input, trackId });
        search(index + 1);
        current.pop();
        trackNotes.pop();
      }
      search(index + 1);
    };
    search(0);
    const used = new Set(best.assignments.map((item) => item.input.id));
    assigned.push(...best.assignments);
    dropped.push(...component.filter((input) => !used.has(input.id)));
  }
  return { assigned, dropped };
}

export function recordingToTrackTexts(inputs, tracks, routing, options = {}) {
  const quantized = quantizeInputs(inputs, options.bpm ?? 120, options.quantize ?? "1/8", options.origin ?? null);
  const allocation = allocateInputs(quantized, routing, options.pitchPriority ?? "high");
  const byTrack = new Map(tracks.map((track) => [track.id, []]));
  for (const { input, trackId } of allocation.assigned) {
    byTrack.get(trackId)?.push({ tick: input.tick, duration: input.duration, midi: input.midi });
  }
  return {
    texts: new Map(tracks.map((track) => [track.id, serializeTrackEvents(byTrack.get(track.id) ?? [], { velocity: track.recordVelocity ?? 15 })])),
    usedTrackIds: new Set(allocation.assigned.map((item) => item.trackId)),
    dropped: allocation.dropped,
  };
}
