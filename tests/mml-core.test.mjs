import assert from "node:assert/strict";
import test from "node:test";
import { combineTracks, parseMmlDocument, parseTrack, serializeTrackEvents, stripComments, tickToSeconds } from "../app/mml/core.js";
import { allocateInputs, quantizeInputs, recordingToTrackTexts } from "../app/mml/recording.js";

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
});

test("quantizes raw audio times to the selected rhythm grid", () => {
  const result = quantizeInputs([{ id: "a", side: "left", midi: 60, startedAt: 10, endedAt: 10.49 }], 120, "1/8");
  assert.equal(result[0].tick, 0);
  assert.equal(result[0].duration, 96);
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
