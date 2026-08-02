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

export function quantizationGridTicks(division) {
  if (division === "off") return null;
  if (division === "auto") return 12;
  return QUANTIZE_TICKS[division] ?? QUANTIZE_TICKS["1/8"];
}

export function snapTickToGrid(tick, division = "1/8") {
  const grid = quantizationGridTicks(division);
  const safeTick = Math.max(0, Number(tick) || 0);
  return grid ? Math.round(safeTick / grid) * grid : Math.round(safeTick);
}

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
    const rawDuration = Math.max(0, rawEnd - rawStart);
    const tick = division === "off" ? Math.round(rawStart) : division === "auto" ? autoQuantizeTick(rawStart) : Math.round(rawStart / grid) * grid;
    const minimum = division === "off" ? 1 : division === "auto" ? 12 : grid;
    const durationByLength = division === "off"
      ? Math.round(rawDuration)
      : division === "auto"
        ? autoQuantizeTick(rawDuration)
        : Math.round(rawDuration / grid) * grid;
    const duration = Math.max(minimum, durationByLength);
    return {
      ...input,
      tick,
      duration,
      rawTick: rawStart,
      rawDuration,
    };
  });
}

function overlapTolerances(division) {
  const snapped = division === "off"
    ? 12
    : division === "auto"
      ? 48
      : QUANTIZE_TICKS[division] ?? QUANTIZE_TICKS["1/8"];
  return { snapped, raw: Math.max(4, Math.min(24, snapped * 0.25)) };
}

/**
 * A keyboard player will commonly press the next melody note just before
 * releasing the previous one. Keep genuine chords, but close a small boundary
 * overlap at the next snapped onset so a monophonic route does not lose notes.
 */
export function closeShortLegatoOverlaps(inputs, division = "1/8") {
  const normalized = inputs.map((input) => ({ ...input }));
  const tolerance = overlapTolerances(division);

  for (const side of ["left", "right"]) {
    const notes = normalized
      .filter((input) => input.side === side)
      .sort((a, b) => a.tick - b.tick || a.rawTick - b.rawTick || a.midi - b.midi);
    const onsetGroups = [];
    for (const note of notes) {
      const group = onsetGroups.at(-1);
      if (group?.tick === note.tick) group.notes.push(note);
      else onsetGroups.push({ tick: note.tick, notes: [note] });
    }

    for (let index = 0; index < onsetGroups.length - 1; index += 1) {
      const current = onsetGroups[index];
      const next = onsetGroups[index + 1];
      const nextRawTick = Math.min(...next.notes.map((note) => note.rawTick));
      for (const note of current.notes) {
        const snappedOverlap = note.tick + note.duration - next.tick;
        const rawOverlap = note.rawTick + note.rawDuration - nextRawTick;
        const separateAttack = nextRawTick - note.rawTick > 6;
        if (separateAttack && snappedOverlap > 0 && snappedOverlap <= tolerance.snapped && rawOverlap <= tolerance.raw) {
          note.duration = Math.max(1, next.tick - note.tick);
        }
      }
    }
  }

  return normalized;
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
  const initialAllocation = allocateInputs(quantized, routing, options.pitchPriority ?? "high");
  const normalized = initialAllocation.dropped.length
    ? closeShortLegatoOverlaps(quantized, options.quantize ?? "1/8")
    : quantized;
  const normalizedAllocation = normalized === quantized
    ? initialAllocation
    : allocateInputs(normalized, routing, options.pitchPriority ?? "high");
  const useNormalized = normalizedAllocation.dropped.length < initialAllocation.dropped.length;
  const finalInputs = useNormalized ? normalized : quantized;
  const allocation = useNormalized ? normalizedAllocation : initialAllocation;
  const byTrack = new Map(tracks.map((track) => [track.id, []]));
  for (const { input, trackId } of allocation.assigned) {
    byTrack.get(trackId)?.push({ tick: input.tick, duration: input.duration, midi: input.midi });
  }
  return {
    texts: new Map(tracks.map((track) => [track.id, serializeTrackEvents(byTrack.get(track.id) ?? [], { velocity: track.recordVelocity ?? 15 })])),
    usedTrackIds: new Set(allocation.assigned.map((item) => item.trackId)),
    dropped: allocation.dropped,
    assigned: allocation.assigned,
    endTick: Math.max(0, ...finalInputs.map((input) => input.tick + input.duration)),
  };
}
