import assert from "node:assert/strict";
import test from "node:test";
import { combineTracks, parseMmlDocument, parseTrack, serializeTrackEvents, stripComments, tempoAtTick, tickToSeconds } from "../app/mml/core.js";
import { allocateInputs, armedInputStartAt, closeShortLegatoOverlaps, countInBeats, liveInputTicks, liveNotesEndTick, nextMetronomeBeatAt, quantizationGridTicks, quantizedInputsEndTick, quantizeInputs, recordingInputEndAt, recordingStartPlan, recordingToTrackTexts, snapTickToGrid } from "../app/mml/recording.js";
import { createProject, sanitizeProject } from "../app/mml/project.js";
import { buildTimelineGrid, followTimelineScroll } from "../app/mml/timeline.js";

test("uses append recording by default and migrates the previous default", () => {
  assert.equal(createProject().recording.mode, "append");
  assert.equal(createProject().recording.metronome, false);
  const legacy = createProject();
  legacy.version = 1;
  legacy.recording.mode = "realtime";
  legacy.recording.metronome = true;
  assert.equal(sanitizeProject(legacy).recording.mode, "append");
  assert.equal(sanitizeProject(legacy).recording.metronome, false);
});

test("grows an active note graphic continuously before note-off", () => {
  const input = { startedAt: 10.25 };
  assert.deepEqual(liveInputTicks(input, 10.75, 120, 10, 96), { tick: 144, duration: 96 });
  assert.deepEqual(liveInputTicks(input, 11, 120, 10, 96), { tick: 144, duration: 144 });
});

test("starts append immediately while real-time recording can arm for the next metronome beat", () => {
  const clock = { startAt: 10, beatSeconds: 0.5 };
  assert.equal(nextMetronomeBeatAt(clock, 10.2), 10.5);
  assert.deepEqual(recordingStartPlan({
    mode: "append",
    countIn: 2,
    now: 10.2,
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    metronomeClock: clock,
  }), { plannedStart: 10.2, waitsForStart: false });
  assert.deepEqual(recordingStartPlan({
    mode: "realtime",
    countIn: 0,
    now: 10.2,
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    metronomeClock: clock,
  }), { plannedStart: 10.5, waitsForStart: true });
  assert.equal(armedInputStartAt("realtime", 10.5, 10.45), 10.5);
  assert.equal(armedInputStartAt("realtime", 10.5, 10.55), 10.55);
  assert.equal(recordingInputEndAt("append", 21.25, 3, 20.5), 3.75);
  assert.equal(recordingInputEndAt("realtime", 21.25, 3, 20.5), 21.25);
});

test("builds a full count-in measure with a distinct downbeat", () => {
  assert.deepEqual(countInBeats(12, 120, { numerator: 4, denominator: 4 }, 1), [
    { at: 10, beat: 0, count: 4, accent: true },
    { at: 10.5, beat: 1, count: 4, accent: false },
    { at: 11, beat: 2, count: 4, accent: false },
    { at: 11.5, beat: 3, count: 4, accent: false },
  ]);
});

test("parses Mabinogi-style notes, commands, dotted lengths, ties and absolute notes", () => {
  const parsed = parseTrack("t120o3l8v15c+4.d8&d8n61r4");
  assert.equal(parsed.tempos[0].bpm, 120);
  assert.equal(parsed.notes[0].midi, 49);
  assert.equal(parsed.notes[0].duration, 144);
  assert.equal(parsed.notes[1].duration, 96);
  assert.equal(parsed.notes[2].midi, 61);
  assert.equal(parsed.duration, 384);
});

test("preserves source positions and splits combined MML tracks", () => {
  const source = "MML@o4c4,/* keep */o3e4,g4;";
  const parsed = parseMmlDocument(source);
  assert.equal(parsed.tracks.length, 3);
  assert.equal(source.slice(parsed.tracks[1].notes[0].sourceStart, parsed.tracks[1].notes[0].sourceEnd), "e4");
  assert.equal(stripComments("c4 // hi\nd4/*x*/"), "c4      \nd4     ");
});

test("combines tracks and removes comments only for raw MML export", () => {
  assert.equal(combineTracks(["o4c4 // memo", "o3e4"], { removeComments: true }), "MML@o4c4,o3e4;");
});

test("serializes events with rests and exact note lengths", () => {
  const text = serializeTrackEvents([
    { tick: 48, duration: 48, midi: 60 },
    { tick: 96, duration: 96, midi: 64 },
  ]);
  const parsed = parseTrack(text);
  assert.deepEqual(parsed.notes.map(({ tick, duration, midi }) => ({ tick, duration, midi })), [
    { tick: 48, duration: 48, midi: 60 },
    { tick: 96, duration: 96, midi: 64 },
  ]);
});

test("converts ticks through tempo changes", () => {
  assert.equal(tickToSeconds(192, [{ tick: 96, bpm: 60 }]), 1.5);
  assert.equal(tempoAtTick(95, [{ tick: 0, bpm: 90 }, { tick: 96, bpm: 140 }]), 90);
  assert.equal(tempoAtTick(96, [{ tick: 0, bpm: 90 }, { tick: 96, bpm: 140 }]), 140);
});

test("quantizes raw audio times to the selected rhythm grid", () => {
  const result = quantizeInputs([{ id: "a", side: "left", midi: 60, startedAt: 10, endedAt: 10.49 }], 120, "1/8");
  assert.equal(result[0].tick, 0);
  assert.equal(result[0].duration, 96);
});

test("quantizes note length independently from a slightly late onset", () => {
  const result = quantizeInputs([{ id: "late", side: "left", midi: 60, startedAt: 10.14, endedAt: 10.54 }], 120, "1/8", 10);
  assert.equal(result[0].tick, 48);
  assert.equal(result[0].duration, 96);
  const ninetyBpm = quantizeInputs([{ id: "quarter", side: "left", midi: 60, startedAt: 3, endedAt: 3 + 2 / 3 }], 90, "1/8", 3);
  assert.equal(ninetyBpm[0].duration, 96);
});

test("chooses the closest fixed note value without inflating a near eighth note", () => {
  const [nearEighth] = quantizeInputs([
    { id: "near-eighth", side: "left", midi: 60, startedAt: 0, endedAt: 0.27 },
  ], 120, "1/8", 0);
  const [nearQuarter] = quantizeInputs([
    { id: "near-quarter", side: "left", midi: 62, startedAt: 0, endedAt: 0.46 },
  ], 120, "1/8", 0);
  const [exactMiddle] = quantizeInputs([
    { id: "middle", side: "left", midi: 64, startedAt: 0, endedAt: 0.375 },
  ], 120, "1/8", 0);

  assert.equal(nearEighth.duration, 48);
  assert.equal(nearQuarter.duration, 96);
  assert.equal(exactMiddle.duration, 48);
});

test("settles the append cursor at each quantized note end", () => {
  const shortC = { id: "c", side: "left", midi: 60, startedAt: 0, endedAt: 0.1 };
  assert.equal(quantizedInputsEndTick([shortC], 120, "1/8", 0), 48);

  const shortE = { id: "e", side: "left", midi: 64, startedAt: 0.25, endedAt: 0.35 };
  assert.equal(quantizedInputsEndTick([shortC, shortE], 120, "1/8", 0), 96);

  const overheldC = { id: "long-c", side: "left", midi: 60, startedAt: 0, endedAt: 0.34 };
  assert.equal(quantizedInputsEndTick([overheldC], 120, "1/8", 0), 48);
});

test("snaps a recording start and the visible grid to the selected division", () => {
  assert.equal(quantizationGridTicks("1/4"), 96);
  assert.equal(snapTickToGrid(104, "1/4"), 96);
  assert.equal(snapTickToGrid(151, "1/4"), 192);
  assert.equal(snapTickToGrid(104, "off"), 104);
});

test("keeps a near-half-note release on the half-note grid boundary", () => {
  const [note] = quantizeInputs([
    { id: "near-half", side: "left", midi: 60, startedAt: 0.2, endedAt: 1.15 },
  ], 120, "1/4", 0);
  assert.equal(note.tick, 0);
  assert.equal(note.duration, 192);

  const [quarter] = quantizeInputs([
    { id: "quarter", side: "left", midi: 62, startedAt: 0.2, endedAt: 0.65 },
  ], 120, "1/4", 0);
  assert.equal(quarter.duration, 96);
});

test("serializes the recording tempo into the generated master track", () => {
  assert.match(serializeTrackEvents([{ tick: 0, duration: 96, midi: 60 }], { tempo: 90 }), /^t90v15/);
});

test("keeps a minimum grid duration for a very short recorded tap", () => {
  const tracks = [{ id: "t1", recordVelocity: 15 }];
  const result = recordingToTrackTexts([
    { id: "tap", side: "left", midi: 60, startedAt: 3, endedAt: 3 },
  ], tracks, { left: ["t1"], right: [] }, { bpm: 120, quantize: "1/8", origin: 3 });
  assert.equal(result.endTick, 48);
  assert.equal(parseTrack(result.texts.get("t1")).notes[0].duration, 48);
});

test("auto rhythm recognition keeps straight and triplet values in one take", () => {
  const ticksPerSecond = 192;
  const result = quantizeInputs([
    { id: "straight", side: "left", midi: 60, startedAt: 0, endedAt: 48 / ticksPerSecond },
    { id: "triplet", side: "left", midi: 62, startedAt: 48 / ticksPerSecond, endedAt: 80 / ticksPerSecond },
  ], 120, "auto", 0);
  assert.equal(result[0].duration, 48);
  assert.equal(result[1].tick, 48);
  assert.equal(result[1].duration, 32);
});

test("maximizes preserved chord notes before pitch priority", () => {
  const inputs = [
    { id: "c", side: "left", midi: 60, tick: 0, duration: 96 },
    { id: "e", side: "right", midi: 64, tick: 0, duration: 96 },
  ];
  const allocation = allocateInputs(inputs, { left: ["t1"], right: ["t1", "t2"] }, "high");
  assert.equal(allocation.dropped.length, 0);
  assert.equal(allocation.assigned.find((item) => item.input.id === "c").trackId, "t1");
  assert.equal(allocation.assigned.find((item) => item.input.id === "e").trackId, "t2");
});

test("allocates delayed harmony to stable high and low tracks", () => {
  const tracks = [{ id: "t1", recordVelocity: 15 }, { id: "t2", recordVelocity: 15 }];
  const result = recordingToTrackTexts([
    { id: "c", side: "left", midi: 60, startedAt: 0, endedAt: 1 },
    { id: "e", side: "left", midi: 64, startedAt: 0.5, endedAt: 1 },
  ], tracks, { left: ["t1", "t2"], right: [] }, { bpm: 120, quantize: "1/8", pitchPriority: "high" });
  const high = parseTrack(result.texts.get("t1"));
  const low = parseTrack(result.texts.get("t2"));
  assert.equal(high.notes[0].midi, 64);
  assert.equal(high.notes[0].tick, 96);
  assert.equal(low.notes[0].midi, 60);
  assert.equal(low.notes[0].duration, 192);
});

test("keeps short legato notes on one track without shortening the first note", () => {
  const tracks = [{ id: "t1", recordVelocity: 15 }];
  const result = recordingToTrackTexts([
    { id: "c", side: "left", midi: 60, startedAt: 0, endedAt: 0.63 },
    { id: "d", side: "left", midi: 62, startedAt: 0.6, endedAt: 1.1 },
  ], tracks, { left: ["t1"], right: [] }, { bpm: 120, quantize: "1/8", pitchPriority: "high", origin: 0 });
  const parsed = parseTrack(result.texts.get("t1"));
  assert.equal(result.dropped.length, 0);
  assert.deepEqual(parsed.notes.map(({ tick, duration, midi }) => ({ tick, duration, midi })), [
    { tick: 0, duration: 144, midi: 60 },
    { tick: 144, duration: 96, midi: 62 },
  ]);
});

test("keeps a sub-grid overlap on the original route even when two tracks are available", () => {
  const tracks = [{ id: "t1", recordVelocity: 15 }, { id: "t2", recordVelocity: 15 }];
  const result = recordingToTrackTexts([
    { id: "half", side: "left", midi: 60, startedAt: 0, endedAt: 0.95 },
    { id: "overlap", side: "left", midi: 62, startedAt: 0.5, endedAt: 1.2 },
  ], tracks, { left: ["t1", "t2"], right: [] }, { bpm: 120, quantize: "1/4", pitchPriority: "low", origin: 0 });
  assert.deepEqual(parseTrack(result.texts.get("t1")).notes.map(({ tick, duration, midi }) => ({ tick, duration, midi })), [
    { tick: 0, duration: 192, midi: 60 },
    { tick: 192, duration: 96, midi: 62 },
  ]);
  assert.equal(parseTrack(result.texts.get("t2")).notes.length, 0);
  assert.equal(result.dropped.length, 0);
});

test("does not collapse a real delayed harmony or simultaneous chord", () => {
  const quantized = quantizeInputs([
    { id: "c", side: "left", midi: 60, startedAt: 0, endedAt: 1 },
    { id: "e", side: "left", midi: 64, startedAt: 0.5, endedAt: 1 },
    { id: "g", side: "right", midi: 67, startedAt: 0, endedAt: 0.5 },
    { id: "b", side: "right", midi: 71, startedAt: 0, endedAt: 0.5 },
  ], 120, "1/8", 0);
  const normalized = closeShortLegatoOverlaps(quantized, "1/8");
  assert.equal(normalized.find((note) => note.id === "c").duration, 192);
  assert.equal(normalized.find((note) => note.id === "g").duration, 96);
  assert.equal(normalized.find((note) => note.id === "b").duration, 96);
});

test("preserves a short delayed harmony when enough tracks are connected", () => {
  const tracks = [{ id: "t1", recordVelocity: 15 }, { id: "t2", recordVelocity: 15 }];
  const result = recordingToTrackTexts([
    { id: "c", side: "left", midi: 60, startedAt: 0, endedAt: 0.75 },
    { id: "e", side: "left", midi: 64, startedAt: 0.5, endedAt: 1 },
  ], tracks, { left: ["t1", "t2"], right: [] }, { bpm: 120, quantize: "1/8", pitchPriority: "high", origin: 0 });
  assert.equal(result.dropped.length, 0);
  assert.equal(result.assigned.find((item) => item.input.id === "c").input.duration, 144);
  assert.notEqual(
    result.assigned.find((item) => item.input.id === "c").trackId,
    result.assigned.find((item) => item.input.id === "e").trackId,
  );
});

test("builds measure labels and beat lines from the same tick positions", () => {
  const grid = buildTimelineGrid(1536, [{ tick: 0, numerator: 4, denominator: 4 }], { numerator: 4, denominator: 4 });
  assert.deepEqual(grid.measures.map((marker) => marker.tick), [0, 384, 768, 1152, 1536]);
  assert.deepEqual(grid.measures.map((marker) => marker.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(grid.beats.slice(0, 3).map((marker) => marker.tick), [96, 192, 288]);
});

test("starts a new measure exactly at a time-signature change", () => {
  const grid = buildTimelineGrid(960, [
    { tick: 0, numerator: 4, denominator: 4 },
    { tick: 384, numerator: 6, denominator: 8 },
  ], { numerator: 4, denominator: 4 });
  assert.deepEqual(grid.measures.map((marker) => marker.tick), [0, 384, 672, 960]);
  assert.deepEqual(grid.measures.map((marker) => marker.number), [1, 2, 3, 4]);
});

test("follows a recording playhead after it reaches the visible timeline anchor", () => {
  assert.equal(followTimelineScroll(0, 1000, 3000, 600), 0);
  assert.equal(followTimelineScroll(0, 1000, 3000, 700), 50);
  assert.equal(followTimelineScroll(50, 1000, 3000, 800), 150);
  assert.equal(followTimelineScroll(1800, 1000, 2500, 2500), 1500);
  assert.equal(followTimelineScroll(1000, 1000, 3000, 900), 700);
  assert.equal(followTimelineScroll(1000, 1000, 3000, 1150), 950);
});

test("keeps the append playhead on the live note's right edge", () => {
  assert.equal(liveNotesEndTick([{ tick: 384, duration: 71.6 }], 999), 456);
  assert.equal(liveNotesEndTick([
    { tick: 384, duration: 48 },
    { tick: 408, duration: 72 },
  ], 999), 480);
  assert.equal(liveNotesEndTick([], 432.4), 432);
});
