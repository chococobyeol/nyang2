"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  combineTracks,
  encodeDuration,
  MmlSyntaxError,
  parseMmlDocument,
  parseTrack,
  serializeTrackEvents,
  tempoAtTick,
  tickToSeconds,
  TICKS_PER_QUARTER,
} from "../mml/core.js";
import { createProject, createTrack, PROJECT_STORAGE_KEY, projectFilename, sanitizeProject } from "../mml/project.js";
import { armedInputStartAt, countInBeats, liveInputTicks, quantizationGridTicks, quantizedInputsEndTick, quantizeInputs, recordingInputEndAt, recordingStartPlan, recordingToTrackTexts, snapTickToGrid } from "../mml/recording.js";
import { loadAutosave, saveAutosave } from "../mml/storage.js";
import { buildTimelineGrid, followTimelineScroll } from "../mml/timeline.js";

type KeyboardSide = "left" | "right";

type ThemeOption = {
  id: string;
  name: string;
  accent: string;
};

export type MmlInputSink = {
  noteOn: (inputId: string, side: KeyboardSide, midi: number, at: number) => void;
  noteOff: (inputId: string, at: number) => void;
  restOn: (at: number) => void;
  restOff: (at: number) => void;
};

type Props = {
  currentThemeId: string;
  themes: ThemeOption[];
  settingsRequested?: boolean;
  onSettingsRequestHandled?: () => void;
  onClose: () => void;
  registerInputSink: (sink: MmlInputSink | null) => void;
  playMidi: (sourceId: string, midi: number, themeId: string, volume: number) => void;
  releaseMidi: (sourceId: string) => void;
  stopMmlAudio: () => void;
  clickMetronome: (accent: boolean, volume: number, delaySeconds?: number, preparing?: boolean) => void;
  onRestShortcutChange?: (shortcut: string) => void;
  onRestPressedChange?: (pressed: boolean) => void;
};

type RecordingInput = {
  id: string;
  inputId: string;
  side: KeyboardSide;
  midi: number;
  startedAt: number;
  endedAt: number;
};

type LiveRecordingNote = {
  id: string;
  midi: number;
  tick: number;
  duration: number;
  color: string;
};

type ParsedTrack = ReturnType<typeof parseTrack>;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const PIANO_PIXELS_PER_TICK = 190 / (TICKS_PER_QUARTER * 4);

function saveBlob(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function secondsToTick(seconds: number, tempoEvents: Array<{ tick: number; bpm: number }>, maxTick: number) {
  let low = 0;
  let high = Math.max(maxTick, TICKS_PER_QUARTER * 16);
  while (tickToSeconds(high, tempoEvents) < seconds) high *= 2;
  for (let index = 0; index < 30; index += 1) {
    const middle = (low + high) / 2;
    if (tickToSeconds(middle, tempoEvents) < seconds) low = middle;
    else high = middle;
  }
  return Math.round((low + high) / 2);
}

function renderRecordingProject(
  baseProject: any,
  inputs: RecordingInput[],
  rests: Array<{ start: number; end: number }>,
  options: { bpm: number; origin: number; startTick: number; sessionEndedAt?: number },
) {
  const draft = clone(baseProject);
  const result = recordingToTrackTexts(inputs, baseProject.tracks, baseProject.routing, {
    bpm: options.bpm,
    quantize: baseProject.recording.quantize,
    pitchPriority: baseProject.recording.pitchPriority,
    origin: options.origin,
  });
  let recordedEndTick = result.endTick;
  for (const rest of rests) {
    const quantizedRest = quantizeInputs([{
      id: "rest-end",
      side: "left",
      midi: 60,
      startedAt: 0,
      endedAt: rest.end,
    }], options.bpm, baseProject.recording.quantize, 0)[0];
    recordedEndTick = Math.max(recordedEndTick, quantizedRest.duration);
  }
  if (baseProject.recording.mode === "realtime" && options.sessionEndedAt !== undefined) {
    const session = quantizeInputs([{
      id: "session-end",
      side: "left",
      midi: 60,
      startedAt: options.origin,
      endedAt: Math.max(options.origin, options.sessionEndedAt),
    }], options.bpm, baseProject.recording.quantize, options.origin)[0];
    recordedEndTick = Math.max(recordedEndTick, session.duration);
  }

  const recordingLength = Math.max(0, recordedEndTick);
  const connectedIds = new Set([...baseProject.routing.left, ...baseProject.routing.right]);
  draft.tracks.forEach((track: any, index: number) => {
    const newText = result.texts.get(track.id);
    const fillsTimeline = recordingLength > 0
      && connectedIds.has(track.id)
      && (baseProject.recording.mode === "realtime" || rests.length > 0);
    const isUsed = result.usedTrackIds.has(track.id) || fillsTimeline;
    if (!isUsed && !(baseProject.recording.editMode === "insert" && baseProject.recording.insertScope === "all")) return;
    let existing;
    try { existing = parseTrack(track.sourceText); } catch { existing = { notes: [], tempos: [] }; }
    const inserted = newText
      ? parseTrack(newText).notes.map((note: any) => ({ ...note, tick: note.tick + options.startTick }))
      : [];
    let notes = existing.notes.map((note: any) => ({ tick: note.tick, duration: note.duration, midi: note.midi }));
    if (baseProject.recording.editMode === "insert") {
      notes = notes.map((note: any) => note.tick >= options.startTick ? { ...note, tick: note.tick + recordingLength } : note);
      if (isUsed) notes.push(...inserted);
    } else if (isUsed) {
      notes = notes.filter((note: any) => note.tick + note.duration <= options.startTick || note.tick >= options.startTick + recordingLength);
      notes.push(...inserted);
    }
    const writesTempo = index === 0 || existing.tempos.length > 0;
    let sourceText = serializeTrackEvents(notes, {
      velocity: track.recordVelocity,
      tempo: writesTempo ? options.bpm : null,
    });
    const parsedDuration = parseTrack(sourceText).duration;
    if (isUsed && recordedEndTick > 0 && parsedDuration < options.startTick + recordedEndTick) {
      sourceText += encodeDuration(options.startTick + recordedEndTick - parsedDuration).map((length: string) => `r${length}`).join("");
    }
    draft.tracks[index].sourceText = sourceText;
  });
  draft.tempo = options.bpm;
  return { project: draft, result, recordedEndTick };
}

function noteLabel(midi: number) {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function shortcutLabel(value: string) {
  return value.replace(/Key|Digit/g, "").replace(/\+/g, " ");
}

function ticksToRecordingSeconds(ticks: number, bpm: number) {
  return ticks / (TICKS_PER_QUARTER * bpm / 60);
}

function shortcutFromEvent(event: ReactKeyboardEvent<HTMLInputElement> | KeyboardEvent) {
  const modifiers = [event.ctrlKey || event.metaKey ? "Mod" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : ""].filter(Boolean);
  return [...modifiers, event.code].join("+");
}

function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = shortcut.split("+");
  return event.code === parts.at(-1)
    && event.altKey === parts.includes("Alt")
    && event.shiftKey === parts.includes("Shift")
    && (event.ctrlKey || event.metaKey) === parts.includes("Mod");
}

export default function MmlStudio({
  currentThemeId,
  themes,
  settingsRequested = false,
  onSettingsRequestHandled,
  onClose,
  registerInputSink,
  playMidi,
  releaseMidi,
  stopMmlAudio,
  clickMetronome,
  onRestShortcutChange,
  onRestPressedChange,
}: Props) {
  const [project, setProject] = useState(() => createProject(currentThemeId));
  const [hydrated, setHydrated] = useState(false);
  const [past, setPast] = useState<any[]>([]);
  const [future, setFuture] = useState<any[]>([]);
  const [parseError, setParseError] = useState<{ message: string; trackIndex: number; index: number; line: number; column: number } | null>(null);
  const [parsedTracks, setParsedTracks] = useState<ParsedTrack[]>([]);
  const [lastValidTracks, setLastValidTracks] = useState<ParsedTrack[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recordState, setRecordState] = useState<"idle" | "count-in" | "recording">("idle");
  const [recordingMessage, setRecordingMessage] = useState("");
  const [restInputActive, setRestInputActive] = useState(false);
  const [metronomeVisual, setMetronomeVisual] = useState({ beat: -1, count: 4, preparing: false, pulse: 0 });
  const [liveRecordingNotes, setLiveRecordingNotes] = useState<LiveRecordingNote[]>([]);
  const [droppedCount, setDroppedCount] = useState(0);
  const [settingsView, setSettingsView] = useState(false);
  const [trackSettingsView, setTrackSettingsView] = useState(false);
  const [fileMenuView, setFileMenuView] = useState(false);
  const [importPayload, setImportPayload] = useState<string[] | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const pianoRollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectRef = useRef(project);
  const playTimersRef = useRef<number[]>([]);
  const playRafRef = useRef(0);
  const playSchedulerRef = useRef<number | null>(null);
  const startPlaybackRef = useRef<(fromTick?: number) => void>(() => undefined);
  const playStartedRef = useRef({ audioStartedAt: 0, tick: 0 });
  const countInTimerRef = useRef<number | null>(null);
  const countInClickTimersRef = useRef(new Set<number>());
  const beatVisualTimersRef = useRef(new Set<number>());
  const metronomeTimerRef = useRef<number | null>(null);
  const metronomeClockRef = useRef<{ startAt: number; beatSeconds: number } | null>(null);
  const recordingStartRef = useRef(0);
  const recordingStartTickRef = useRef(0);
  const recordingTempoRef = useRef(120);
  const recordingBaseProjectRef = useRef<any | null>(null);
  const recordingArmedRef = useRef(false);
  const recordingActiveRef = useRef(false);
  const recordingRafRef = useRef(0);
  const playheadRef = useRef(0);
  const recordingInputsRef = useRef<RecordingInput[]>([]);
  const activeRecordingRef = useRef(new Map<string, Omit<RecordingInput, "endedAt">>());
  const appendCursorRef = useRef(0);
  const appendWallStartRef = useRef<number | null>(null);
  const explicitRestsRef = useRef<Array<{ start: number; end: number }>>([]);
  const restStartedRef = useRef<number | null>(null);

  const selectedTrack = project.tracks.find((track: any) => track.id === project.view.selectedTrackId) ?? project.tracks[0];
  const recordingShortcuts = Object.assign({
    play: "Alt+KeyP",
    record: "Alt+KeyR",
    stop: "Alt+KeyS",
  }, project.recording.shortcuts ?? {});

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    onRestShortcutChange?.(project.recording.restKey);
  }, [onRestShortcutChange, project.recording.restKey]);

  useEffect(() => {
    onRestPressedChange?.(restInputActive);
    return () => onRestPressedChange?.(false);
  }, [onRestPressedChange, restInputActive]);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    if (!settingsRequested) return;
    setSettingsView(true);
    setTrackSettingsView(false);
    setFileMenuView(false);
    onSettingsRequestHandled?.();
  }, [onSettingsRequestHandled, settingsRequested]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await loadAutosave();
        if (cancelled) return;
        if (saved?.project) {
          setProject(sanitizeProject(saved.project, currentThemeId));
          setPast(Array.isArray(saved.past) ? saved.past.slice(-100) : []);
          setFuture(Array.isArray(saved.future) ? saved.future.slice(0, 100) : []);
        } else {
          const legacy = window.localStorage.getItem(PROJECT_STORAGE_KEY);
          if (legacy) setProject(sanitizeProject(JSON.parse(legacy), currentThemeId));
        }
      } catch {
        const legacy = window.localStorage.getItem(PROJECT_STORAGE_KEY);
        if (legacy && !cancelled) setProject(sanitizeProject(JSON.parse(legacy), currentThemeId));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [currentThemeId]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveAutosave({ project, past, future, savedAt: Date.now() }).catch(() => {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [future, hydrated, past, project]);

  const commit = useCallback((updater: any) => {
    setProject((current: any) => {
      const next = typeof updater === "function" ? updater(clone(current)) : updater;
      setPast((items) => [...items.slice(-99), clone(current)]);
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((items) => {
      if (!items.length) return items;
      const previous = items.at(-1);
      setFuture((values) => [clone(projectRef.current), ...values].slice(0, 100));
      setProject(previous);
      return items.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setPast((values) => [...values, clone(projectRef.current)].slice(-100));
      setProject(next);
      return items.slice(1);
    });
  }, []);

  useEffect(() => {
    try {
      const combined = combineTracks(project.tracks.map((track: any) => track.sourceText));
      const parsed = parseMmlDocument(combined).tracks.map((track: any) => {
        return {
          ...track,
          notes: track.notes.map((note: any) => ({
            ...note,
            sourceStart: note.sourceStart - track.sourceStart,
            sourceEnd: note.sourceEnd - track.sourceStart,
          })),
        };
      });
      setParsedTracks(parsed);
      setLastValidTracks(parsed);
      setParseError(null);
    } catch (error) {
      const syntax = error as InstanceType<typeof MmlSyntaxError> & { trackIndex?: number };
      const trackIndex = syntax.trackIndex ?? 0;
      const trackOffset = 4 + project.tracks.slice(0, trackIndex).reduce((sum: number, track: any) => sum + track.sourceText.length + 1, 0);
      const localIndex = Math.max(0, syntax.index - trackOffset);
      const before = project.tracks[trackIndex]?.sourceText.slice(0, localIndex) ?? "";
      const lines = before.split("\n");
      setParseError({
        message: syntax.message || "MML을 해석하지 못했습니다.",
        trackIndex,
        index: localIndex,
        line: lines.length,
        column: (lines.at(-1)?.length ?? 0) + 1,
      });
      setParsedTracks([]);
    }
  }, [project.tracks]);

  const displayTracks = parsedTracks.length ? parsedTracks : lastValidTracks;
  const allTempoEvents = useMemo(() => {
    const events = displayTracks.flatMap((track: any) => track.tempos);
    return events.sort((a: any, b: any) => a.tick - b.tick);
  }, [displayTracks]);

  const tempoConflict = useMemo(() => {
    const byTick = new Map<number, Set<number>>();
    for (const event of allTempoEvents) {
      const values = byTick.get(event.tick) ?? new Set();
      values.add(event.bpm);
      byTick.set(event.tick, values);
    }
    const conflict = [...byTick.entries()].find(([, values]) => values.size > 1);
    return conflict ? `${Math.round(conflict[0])} tick에 서로 다른 템포가 있습니다.` : "";
  }, [allTempoEvents]);

  const recordTempo = tempoAtTick(playhead, allTempoEvents, project.tempo);

  const songDuration = useMemo(
    () => Math.max(TICKS_PER_QUARTER * 4, ...displayTracks.map((track: any) => track.duration)),
    [displayTracks],
  );

  const clearPlayback = useCallback(() => {
    playTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    playTimersRef.current = [];
    if (playSchedulerRef.current !== null) window.clearInterval(playSchedulerRef.current);
    playSchedulerRef.current = null;
    window.cancelAnimationFrame(playRafRef.current);
    stopMmlAudio();
    setPlaying(false);
  }, [stopMmlAudio]);

  const startPlayback = useCallback((fromTick = playhead) => {
    if (parseError || tempoConflict || !displayTracks.length) return;
    clearPlayback();
    const startTick = Math.max(0, Math.min(fromTick, songDuration));
    const startSeconds = tickToSeconds(startTick, allTempoEvents, project.tempo);
    const endTick = project.view.loop ? Math.max(project.view.loopEnd, startTick + 1) : songDuration;
    const endSeconds = tickToSeconds(endTick, allTempoEvents, project.tempo);
    const soloed = project.tracks.some((track: any) => track.solo);
    const now = performance.now() / 1000;
    playStartedRef.current = { audioStartedAt: now, tick: startTick };
    setPlaying(true);

    const scheduledNotes: Array<{ note: any; track: any; noteStart: number; noteEnd: number; sourceId: string }> = [];
    project.tracks.forEach((track: any, trackIndex: number) => {
      if (track.muted || (soloed && !track.solo)) return;
      for (const note of displayTracks[trackIndex]?.notes ?? []) {
        if (note.tick + note.duration <= startTick || note.tick >= endTick) continue;
        const noteStart = Math.max(note.tick, startTick);
        const noteEnd = Math.min(note.tick + note.duration, endTick);
        const sourceId = `mml:${track.id}:${note.sourceStart}:${now}`;
        scheduledNotes.push({ note, track, noteStart, noteEnd, sourceId });
      }
    });
    scheduledNotes.sort((a, b) => a.noteStart - b.noteStart);
    let scheduleCursor = 0;
    const scheduleWindow = () => {
      const elapsed = performance.now() / 1000 - playStartedRef.current.audioStartedAt;
      while (scheduleCursor < scheduledNotes.length) {
        const item = scheduledNotes[scheduleCursor];
        const startsIn = tickToSeconds(item.noteStart, allTempoEvents, project.tempo) - startSeconds - elapsed;
        if (startsIn > 0.35) break;
        const duration = Math.max(0.01, tickToSeconds(item.noteEnd, allTempoEvents, project.tempo) - tickToSeconds(item.noteStart, allTempoEvents, project.tempo));
        const delay = Math.max(0, startsIn) * 1000;
        playTimersRef.current.push(window.setTimeout(() => playMidi(item.sourceId, item.note.midi, item.track.themeId, item.track.mixerVolume * item.note.velocity / 15), delay));
        playTimersRef.current.push(window.setTimeout(() => releaseMidi(item.sourceId), delay + duration * 1000));
        scheduleCursor += 1;
      }
      if (scheduleCursor >= scheduledNotes.length && playSchedulerRef.current !== null) {
        window.clearInterval(playSchedulerRef.current);
        playSchedulerRef.current = null;
      }
    };
    scheduleWindow();
    playSchedulerRef.current = window.setInterval(scheduleWindow, 80);

    const finishDelay = Math.max(20, (endSeconds - startSeconds) * 1000);
    playTimersRef.current.push(window.setTimeout(() => {
      if (projectRef.current.view.loop) startPlaybackRef.current(projectRef.current.view.loopStart);
      else {
        clearPlayback();
        setPlayhead(endTick);
      }
    }, finishDelay));

    const follow = () => {
      const elapsed = performance.now() / 1000 - playStartedRef.current.audioStartedAt;
      const tick = secondsToTick(startSeconds + elapsed, allTempoEvents, songDuration);
      setPlayhead(Math.min(endTick, tick));
      playRafRef.current = window.requestAnimationFrame(follow);
    };
    playRafRef.current = window.requestAnimationFrame(follow);
  }, [allTempoEvents, clearPlayback, displayTracks, parseError, playMidi, playhead, project, releaseMidi, songDuration, tempoConflict]);

  useEffect(() => {
    startPlaybackRef.current = startPlayback;
  }, [startPlayback]);

  const updateRecordingPreview = useCallback(() => {
    const base = recordingBaseProjectRef.current;
    if (!base || !recordingActiveRef.current) return null;
    const origin = base.recording.mode === "realtime" ? recordingStartRef.current : 0;
    const preview = renderRecordingProject(base, recordingInputsRef.current, explicitRestsRef.current, {
      bpm: recordingTempoRef.current,
      origin,
      startTick: recordingStartTickRef.current,
    });
    setProject(preview.project);
    setDroppedCount(preview.result.dropped.length);
    const last = preview.result.assigned.at(-1)?.input;
    if (last) {
      const length = encodeDuration(last.duration).map((value: string) => `1/${value}`).join(" + ");
      setRecordingMessage(`${noteLabel(last.midi)} · ${length} 기록됨`);
    }
    return preview;
  }, []);

  const clearBeatVisualTimers = useCallback(() => {
    beatVisualTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    beatVisualTimersRef.current.clear();
    setMetronomeVisual((current) => ({ ...current, beat: -1, preparing: false }));
  }, []);

  const scheduleBeatVisual = useCallback((beat: number, count: number, preparing: boolean, delaySeconds = 0) => {
    const activate = window.setTimeout(() => {
      beatVisualTimersRef.current.delete(activate);
      setMetronomeVisual((current) => ({ beat, count, preparing, pulse: current.pulse + 1 }));
      const deactivate = window.setTimeout(() => {
        beatVisualTimersRef.current.delete(deactivate);
        setMetronomeVisual((current) => current.beat === beat && current.preparing === preparing
          ? { ...current, beat: -1 }
          : current);
      }, 150);
      beatVisualTimersRef.current.add(deactivate);
    }, Math.max(0, delaySeconds * 1000));
    beatVisualTimersRef.current.add(activate);
  }, []);

  const clearCountInClicks = useCallback(() => {
    countInClickTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    countInClickTimersRef.current.clear();
  }, []);

  const stopMetronomeClock = useCallback(() => {
    if (metronomeTimerRef.current !== null) window.clearTimeout(metronomeTimerRef.current);
    metronomeTimerRef.current = null;
    metronomeClockRef.current = null;
  }, []);

  const startMetronomeClock = useCallback((startAt: number, bpm: number, numerator: number, denominator: number) => {
    stopMetronomeClock();
    const beatSeconds = (60 / bpm) * (4 / denominator);
    metronomeClockRef.current = { startAt, beatSeconds };
    let beat = 0;
    let nextAt = startAt;
    const schedule = () => {
      if (!projectRef.current.recording.metronome) {
        metronomeTimerRef.current = null;
        metronomeClockRef.current = null;
        return;
      }
      const now = performance.now() / 1000;
      while (nextAt <= now + 0.28) {
        if (nextAt >= now - 0.04) {
          const delay = Math.max(0, nextAt - now);
          clickMetronome(beat % numerator === 0, projectRef.current.recording.metronomeVolume, delay, false);
          scheduleBeatVisual(beat % numerator, numerator, false, delay);
        }
        beat += 1;
        nextAt = startAt + beat * beatSeconds;
      }
      metronomeTimerRef.current = window.setTimeout(schedule, 70);
    };
    schedule();
  }, [clickMetronome, scheduleBeatVisual, stopMetronomeClock]);

  useEffect(() => {
    if (!hydrated || !project.recording.metronome) {
      stopMetronomeClock();
      clearBeatVisualTimers();
      return;
    }
    startMetronomeClock(performance.now() / 1000 + 0.04, recordTempo, project.timeSignature.numerator, project.timeSignature.denominator);
    return stopMetronomeClock;
  }, [clearBeatVisualTimers, hydrated, project.recording.metronome, project.timeSignature.denominator, project.timeSignature.numerator, recordTempo, startMetronomeClock, stopMetronomeClock]);

  const toggleMetronome = useCallback(() => {
    setProject((current: any) => {
      const next = clone(current);
      next.recording.metronome = !current.recording.metronome;
      projectRef.current = next;
      if (recordingBaseProjectRef.current) recordingBaseProjectRef.current.recording.metronome = next.recording.metronome;
      return next;
    });
  }, []);

  const finishRecording = useCallback(() => {
    setRestInputActive(false);
    if (countInTimerRef.current !== null) window.clearTimeout(countInTimerRef.current);
    countInTimerRef.current = null;
    clearCountInClicks();
    clearBeatVisualTimers();
    window.cancelAnimationFrame(recordingRafRef.current);
    recordingArmedRef.current = false;
    const base = recordingBaseProjectRef.current;
    if (!base || !recordingActiveRef.current) {
      recordingActiveRef.current = false;
      activeRecordingRef.current.clear();
      recordingBaseProjectRef.current = null;
      setLiveRecordingNotes([]);
      setRecordState("idle");
      setRecordingMessage("녹음을 취소했습니다.");
      if (projectRef.current.recording.metronome) {
        startMetronomeClock(performance.now() / 1000 + 0.04, recordTempo, projectRef.current.timeSignature.numerator, projectRef.current.timeSignature.denominator);
      }
      return;
    }
    const wallEndedAt = performance.now() / 1000;
    activeRecordingRef.current.forEach((input) => {
      const endedAt = recordingInputEndAt(base.recording.mode, wallEndedAt, appendCursorRef.current, appendWallStartRef.current);
      recordingInputsRef.current.push({ ...input, endedAt });
    });
    activeRecordingRef.current.clear();
    setLiveRecordingNotes([]);
    recordingActiveRef.current = false;
    const origin = base.recording.mode === "realtime" ? recordingStartRef.current : 0;
    const preview = renderRecordingProject(base, recordingInputsRef.current, explicitRestsRef.current, {
      bpm: recordingTempoRef.current,
      origin,
      startTick: recordingStartTickRef.current,
      sessionEndedAt: wallEndedAt,
    });
    const hasRecording = recordingInputsRef.current.length > 0
      || explicitRestsRef.current.length > 0
      || (base.recording.mode === "realtime" && preview.recordedEndTick > 0);
    if (hasRecording) {
      setPast((items) => [...items.slice(-99), clone(base)]);
      setFuture([]);
      setProject(preview.project);
    } else {
      setProject(base);
    }
    const finalTick = recordingStartTickRef.current + preview.recordedEndTick;
    playheadRef.current = finalTick;
    setPlayhead(finalTick);
    setDroppedCount(preview.result.dropped.length);
    setRecordingMessage(preview.result.dropped.length
      ? `${preview.result.dropped.length}개 음은 연결된 트랙이 부족해 기록하지 않았습니다.`
      : `${preview.result.assigned.length}개 음을 기록했습니다.`);
    setRecordState("idle");
    recordingBaseProjectRef.current = null;
    recordingInputsRef.current = [];
    explicitRestsRef.current = [];
    restStartedRef.current = null;
    appendWallStartRef.current = null;
  }, [clearBeatVisualTimers, clearCountInClicks, recordTempo, startMetronomeClock]);

  const beginRecording = useCallback(() => {
    setRestInputActive(false);
    if (parseError || tempoConflict) return;
    clearPlayback();
    const current = clone(projectRef.current);
    const startTick = snapTickToGrid(playheadRef.current, current.recording.quantize);
    const bpm = tempoAtTick(startTick, allTempoEvents, current.tempo);
    recordingBaseProjectRef.current = current;
    recordingTempoRef.current = bpm;
    recordingInputsRef.current = [];
    activeRecordingRef.current.clear();
    explicitRestsRef.current = [];
    appendCursorRef.current = 0;
    recordingStartTickRef.current = startTick;
    playheadRef.current = startTick;
    setPlayhead(startTick);
    appendWallStartRef.current = null;
    recordingActiveRef.current = false;
    recordingArmedRef.current = false;
    setLiveRecordingNotes([]);
    setDroppedCount(0);

    const begin = (plannedStart: number) => {
      recordingStartRef.current = plannedStart;
      activeRecordingRef.current.forEach((input, inputId) => {
        activeRecordingRef.current.set(inputId, {
          ...input,
          startedAt: armedInputStartAt(current.recording.mode, plannedStart, input.startedAt),
        });
      });
      if (current.recording.mode === "append" && activeRecordingRef.current.size > 0) appendWallStartRef.current = plannedStart;
      recordingArmedRef.current = false;
      recordingActiveRef.current = true;
      setRecordState("recording");
      setRecordingMessage(`${current.recording.mode === "realtime" ? "실시간" : "이어붙이기"} 녹음 중 · ${bpm} BPM`);
      if (current.recording.mode === "realtime" && current.recording.metronome) {
        startMetronomeClock(plannedStart, bpm, current.timeSignature.numerator, current.timeSignature.denominator);
      } else if (current.recording.mode === "realtime") {
        clearBeatVisualTimers();
      }
      const follow = () => {
        if (!recordingActiveRef.current) return;
        const now = performance.now() / 1000;
        let elapsed = appendCursorRef.current;
        if (current.recording.mode === "realtime") elapsed = Math.max(0, now - recordingStartRef.current);
        else if (appendWallStartRef.current !== null) elapsed += Math.max(0, now - appendWallStartRef.current);
        const tick = recordingStartTickRef.current + Math.round(elapsed * TICKS_PER_QUARTER * bpm / 60);
        playheadRef.current = tick;
        setPlayhead(tick);
        const timelineNow = current.recording.mode === "realtime" ? now : elapsed;
        const origin = current.recording.mode === "realtime" ? recordingStartRef.current : 0;
        const activeInputs = [...activeRecordingRef.current.values()];
        const nextLiveNotes = activeInputs.map((input) => {
          const range = liveInputTicks(input, timelineNow, bpm, origin, recordingStartTickRef.current);
          const trackId = current.routing[input.side]?.[0];
          const track = current.tracks.find((item: any) => item.id === trackId) ?? current.tracks[0];
          return { id: input.id, midi: input.midi, tick: range.tick, duration: range.duration, color: track?.color ?? "#ef6b5a" };
        });
        setLiveRecordingNotes((notes) => nextLiveNotes.length || notes.length ? nextLiveNotes : notes);
        recordingRafRef.current = window.requestAnimationFrame(follow);
      };
      recordingRafRef.current = window.requestAnimationFrame(follow);
    };

    const now = performance.now() / 1000;
    const plan = recordingStartPlan({
      mode: current.recording.mode,
      countIn: current.recording.countIn,
      now,
      bpm,
      timeSignature: current.timeSignature,
      metronomeClock: current.recording.metronome ? metronomeClockRef.current : null,
    });
    if (current.recording.mode === "realtime") stopMetronomeClock();
    if (plan.waitsForStart) {
      recordingArmedRef.current = true;
      setRecordState("count-in");
      setRecordingMessage(current.recording.countIn > 0 ? `${current.recording.countIn}마디 카운트인 · ${bpm} BPM` : `다음 박자 대기 · ${bpm} BPM`);
      const nowAtSchedule = performance.now() / 1000;
      countInBeats(plan.plannedStart, bpm, current.timeSignature, current.recording.countIn).forEach((item) => {
        const delay = Math.max(0, item.at - nowAtSchedule);
        const lead = Math.min(0.08, delay);
        const timer = window.setTimeout(() => {
          countInClickTimersRef.current.delete(timer);
          clickMetronome(item.accent, current.recording.metronomeVolume, lead, true);
          scheduleBeatVisual(item.beat, item.count, true, lead);
        }, Math.max(0, (delay - lead) * 1000));
        countInClickTimersRef.current.add(timer);
      });
      countInTimerRef.current = window.setTimeout(() => begin(plan.plannedStart), Math.max(0, (plan.plannedStart - performance.now() / 1000) * 1000));
    } else {
      begin(plan.plannedStart);
    }
  }, [allTempoEvents, clearBeatVisualTimers, clearPlayback, clickMetronome, parseError, scheduleBeatVisual, startMetronomeClock, stopMetronomeClock, tempoConflict]);

  const beginRestInput = useCallback((at: number) => {
    const current = projectRef.current;
    if (!recordingActiveRef.current || current.recording.mode !== "append") {
      setRecordingMessage("쉼표는 이어붙이기 녹음 중에 길게 눌러 입력합니다.");
      return;
    }
    if (restStartedRef.current !== null) return;
    if (activeRecordingRef.current.size > 0) {
      setRecordingMessage("음을 누르는 동안에는 쉼표를 입력할 수 없습니다.");
      return;
    }
    if (appendWallStartRef.current === null) appendWallStartRef.current = at;
    restStartedRef.current = appendCursorRef.current + (at - appendWallStartRef.current);
    setRestInputActive(true);
    setRecordingMessage("쉼표 입력 중");
  }, []);

  const finishRestInput = useCallback((at: number) => {
    setRestInputActive(false);
    const current = projectRef.current;
    if (!recordingActiveRef.current || current.recording.mode !== "append" || restStartedRef.current === null) return;
    const end = appendCursorRef.current + (at - (appendWallStartRef.current ?? at));
    const restEndTick = quantizedInputsEndTick([{
      id: "append-rest",
      side: "left",
      midi: 60,
      startedAt: restStartedRef.current,
      endedAt: end,
    }], recordingTempoRef.current, current.recording.quantize, 0);
    const settledEnd = ticksToRecordingSeconds(restEndTick, recordingTempoRef.current);
    explicitRestsRef.current.push({ start: restStartedRef.current, end: settledEnd });
    restStartedRef.current = null;
    if (activeRecordingRef.current.size === 0) {
      appendCursorRef.current = settledEnd;
      appendWallStartRef.current = null;
      const absoluteTick = recordingStartTickRef.current + restEndTick;
      playheadRef.current = absoluteTick;
      setPlayhead(absoluteTick);
    }
    setRecordingMessage(`이어붙이기 녹음 · ${recordingTempoRef.current} BPM`);
    updateRecordingPreview();
  }, [updateRecordingPreview]);

  const sink = useMemo<MmlInputSink>(() => ({
    noteOn(inputId, side, midi, at) {
      if ((!recordingActiveRef.current && !recordingArmedRef.current) || activeRecordingRef.current.has(inputId)) return;
      const current = projectRef.current;
      const routedTracks = new Set([
        ...current.routing[side],
        ...[...activeRecordingRef.current.values()].flatMap((input) => current.routing[input.side] ?? []),
      ]);
      if (current.routing[side].length === 0) {
        setRecordingMessage(`${side === "left" ? "왼쪽" : "오른쪽"} 건반에 연결된 트랙이 없습니다.`);
      } else if (activeRecordingRef.current.size + 1 > routedTracks.size) {
        setRecordingMessage("동시에 누른 음보다 연결된 트랙이 적습니다.");
      }
      let startedAt = at;
      if (recordingActiveRef.current && current.recording.mode === "append") {
        if (appendWallStartRef.current === null) appendWallStartRef.current = at;
        startedAt = appendCursorRef.current + (at - appendWallStartRef.current);
      }
      activeRecordingRef.current.set(inputId, {
        id: `${inputId}:${at}`,
        inputId,
        side,
        midi,
        startedAt,
      });
    },
    noteOff(inputId, at) {
      const active = activeRecordingRef.current.get(inputId);
      if (!active) return;
      if (recordingArmedRef.current && !recordingActiveRef.current) {
        activeRecordingRef.current.delete(inputId);
        return;
      }
      const current = projectRef.current;
      let endedAt = at;
      if (current.recording.mode === "append") {
        endedAt = appendCursorRef.current + (at - (appendWallStartRef.current ?? at));
      }
      recordingInputsRef.current.push({ ...active, endedAt: Math.max(active.startedAt, endedAt) });
      activeRecordingRef.current.delete(inputId);
      if (current.recording.mode === "append" && activeRecordingRef.current.size === 0 && restStartedRef.current === null) {
        const settledTick = quantizedInputsEndTick(
          recordingInputsRef.current,
          recordingTempoRef.current,
          current.recording.quantize,
          0,
        );
        appendCursorRef.current = ticksToRecordingSeconds(settledTick, recordingTempoRef.current);
        appendWallStartRef.current = null;
        const absoluteTick = recordingStartTickRef.current + settledTick;
        playheadRef.current = absoluteTick;
        setPlayhead(absoluteTick);
      }
      setLiveRecordingNotes((notes) => notes.filter((note) => note.id !== active.id));
      updateRecordingPreview();
    },
    restOn(at) {
      beginRestInput(at);
    },
    restOff(at) {
      finishRestInput(at);
    },
  }), [beginRestInput, finishRestInput, updateRecordingPreview]);

  useEffect(() => {
    registerInputSink(sink);
    return () => registerInputSink(null);
  }, [registerInputSink, sink]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const typing = Boolean((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']"));
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      const shortcuts = Object.assign({
        play: "Alt+KeyP",
        record: "Alt+KeyR",
        stop: "Alt+KeyS",
      }, projectRef.current.recording.shortcuts ?? {});
      if (matchesShortcut(event, shortcuts.play)) {
        event.preventDefault();
        if (playing) clearPlayback(); else startPlayback();
        return;
      }
      if (matchesShortcut(event, shortcuts.record)) {
        event.preventDefault();
        if (recordState === "idle") beginRecording(); else finishRecording();
        return;
      }
      if (matchesShortcut(event, shortcuts.stop)) {
        event.preventDefault();
        clearPlayback();
        if (recordState !== "idle") finishRecording();
        playheadRef.current = 0;
        setPlayhead(0);
        return;
      }
      const current = projectRef.current;
      if (typing || event.repeat || recordState !== "recording" || current.recording.mode !== "append" || event.code !== current.recording.restKey) return;
      event.preventDefault();
      beginRestInput(performance.now() / 1000);
    };
    const up = (event: KeyboardEvent) => {
      const current = projectRef.current;
      if (recordState !== "recording" || current.recording.mode !== "append" || event.code !== current.recording.restKey || restStartedRef.current === null) return;
      event.preventDefault();
      finishRestInput(performance.now() / 1000);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [beginRecording, beginRestInput, clearPlayback, finishRecording, finishRestInput, playing, recordState, redo, startPlayback, undo]);

  useEffect(() => () => {
    clearPlayback();
    recordingActiveRef.current = false;
    recordingArmedRef.current = false;
    activeRecordingRef.current.clear();
    window.cancelAnimationFrame(recordingRafRef.current);
    if (countInTimerRef.current !== null) window.clearTimeout(countInTimerRef.current);
    clearCountInClicks();
    clearBeatVisualTimers();
    stopMetronomeClock();
  }, [clearBeatVisualTimers, clearCountInClicks, clearPlayback, stopMetronomeClock]);

  const updateTrack = (id: string, patch: Record<string, unknown>) => commit((draft: any) => {
    const track = draft.tracks.find((item: any) => item.id === id);
    if (track) Object.assign(track, patch);
    return draft;
  });

  const updateMasterTempo = (value: number) => {
    const bpm = Math.max(1, Math.round(value || 1));
    commit((draft: any) => {
      draft.tempo = bpm;
      let wroteTempo = false;
      draft.tracks.forEach((track: any) => {
        try {
          const tempo = parseTrack(track.sourceText).tempos.find((event: any) => event.tick === 0);
          if (!tempo) return;
          track.sourceText = `${track.sourceText.slice(0, tempo.sourceStart)}t${bpm}${track.sourceText.slice(tempo.sourceEnd)}`;
          wroteTempo = true;
        } catch {
          // Keep the source untouched while it has a syntax error.
        }
      });
      if (!wroteTempo && draft.tracks[0]) draft.tracks[0].sourceText = `t${bpm}${draft.tracks[0].sourceText}`;
      return draft;
    });
  };

  const captureShortcut = (action: "play" | "record" | "stop", event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const shortcut = shortcutFromEvent(event);
    const collision = Object.entries(recordingShortcuts).find(([name, value]) => name !== action && value === shortcut);
    if (collision) {
      window.alert("이미 다른 MML 기능에 사용 중인 단축키입니다.");
      return;
    }
    commit((draft: any) => {
      draft.recording.shortcuts = { ...recordingShortcuts, [action]: shortcut };
      return draft;
    });
  };

  const toggleRoute = (side: KeyboardSide, trackId: string) => commit((draft: any) => {
    const route = draft.routing[side];
    draft.routing[side] = route.includes(trackId) ? route.filter((id: string) => id !== trackId) : [...route, trackId];
    return draft;
  });

  const addTrack = () => commit((draft: any) => {
    const track = createTrack(draft.tracks.length, currentThemeId);
    draft.tracks.push(track);
    draft.view.selectedTrackId = track.id;
    return draft;
  });

  const removeTrack = (trackId: string) => {
    if (project.tracks.length <= 1) return;
    commit((draft: any) => {
      const index = draft.tracks.findIndex((track: any) => track.id === trackId);
      draft.tracks.splice(index, 1);
      draft.routing.left = draft.routing.left.filter((id: string) => id !== trackId);
      draft.routing.right = draft.routing.right.filter((id: string) => id !== trackId);
      if (draft.view.selectedTrackId === trackId) draft.view.selectedTrackId = draft.tracks[Math.max(0, index - 1)].id;
      return draft;
    });
  };

  const selectTrack = (trackId: string) => {
    setProject((current: any) => ({
      ...current,
      view: { ...current.view, selectedTrackId: trackId },
    }));
  };

  const selectPianoNote = (trackIndex: number, note: any) => {
    const track = project.tracks[trackIndex];
    selectTrack(track.id);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(note.sourceStart, note.sourceEnd);
    });
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    try {
      if (file.name.toLowerCase().endsWith(".nyangmml")) {
        if (!window.confirm("현재 작업을 불러온 프로젝트로 바꿀까요?")) return;
        commit(sanitizeProject(JSON.parse(text), currentThemeId));
        setFileMenuView(false);
        return;
      }
      const parsed = parseMmlDocument(text);
      const ranges = parsed.tracks.map((track: any) => text.slice(track.sourceStart, track.sourceEnd));
      setImportPayload(ranges);
      setFileMenuView(false);
    } catch (error) {
      window.alert(`파일을 불러오지 못했습니다.\n${(error as Error).message}`);
    }
  };

  const applyImport = (mode: "replace" | "append" | "tracks" | "selected") => {
    const ranges = importPayload;
    if (!ranges) return;
    commit((draft: any) => {
      if (mode === "replace") {
        draft.tracks = ranges.map((sourceText: string, index: number) => ({ ...createTrack(index, currentThemeId), sourceText }));
        draft.routing = { left: draft.tracks.slice(0, 2).map((track: any) => track.id), right: draft.tracks[2] ? [draft.tracks[2].id] : [] };
        draft.view.selectedTrackId = draft.tracks[0].id;
      } else if (mode === "append") {
        ranges.forEach((sourceText: string, index: number) => {
          if (!draft.tracks[index]) draft.tracks.push(createTrack(index, currentThemeId));
          draft.tracks[index].sourceText += sourceText;
        });
      } else if (mode === "tracks") {
        ranges.forEach((sourceText: string) => draft.tracks.push({ ...createTrack(draft.tracks.length, currentThemeId), sourceText }));
      } else {
        const selected = draft.tracks.find((track: any) => track.id === draft.view.selectedTrackId);
        if (selected) selected.sourceText = ranges[0] ?? "";
      }
      return draft;
    });
    setImportPayload(null);
  };

  const resetProject = () => {
    if (!window.confirm("현재 작업을 비우고 새 프로젝트를 만들까요?")) return;
    clearPlayback();
    const next = createProject(currentThemeId);
    setProject(next);
    setPast([]);
    setFuture([]);
    setPlayhead(0);
    playheadRef.current = 0;
    setRecordingMessage("");
    setDroppedCount(0);
    setFileMenuView(false);
  };

  const exportProject = () => saveBlob(projectFilename(project), "application/json", JSON.stringify(project, null, 2));
  const exportMml = () => {
    const name = project.title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "nyangnyang";
    saveBlob(`${name}.mml`, "text/plain;charset=utf-8", combineTracks(project.tracks.map((track: any) => track.sourceText), { removeComments: true }));
  };

  const pianoPixelsPerTick = PIANO_PIXELS_PER_TICK;
  const pianoTimelineDuration = Math.max(
    songDuration,
    TICKS_PER_QUARTER * 16,
    recordState === "recording" ? playhead + TICKS_PER_QUARTER * 12 : 0,
  );
  const pianoWidth = pianoTimelineDuration * pianoPixelsPerTick;
  const timelineGrid = buildTimelineGrid(pianoTimelineDuration, project.timeSignatureMap, project.timeSignature);
  const tickToPianoX = (tick: number) => tick * pianoPixelsPerTick;
  const quantizeGridTicks = quantizationGridTicks(project.recording.quantize);
  const structuralTicks = new Set([
    ...timelineGrid.measures.map((measure: any) => measure.tick),
    ...timelineGrid.beats.map((beat: any) => beat.tick),
  ]);
  const quantizeLines = quantizeGridTicks
    ? Array.from({ length: Math.floor(pianoTimelineDuration / quantizeGridTicks) + 1 }, (_, index) => index * quantizeGridTicks)
      .filter((tick) => !structuralTicks.has(tick))
    : [];
  const pianoHeight = 390;
  const visibleNotes = displayTracks.flatMap((track: any, trackIndex: number) => {
    if (!project.tracks[trackIndex]?.pianoRollVisible) return [];
    return track.notes.map((note: any) => ({ ...note, trackIndex }));
  });
  const visibleMidi = [...visibleNotes.map((note: any) => note.midi), ...liveRecordingNotes.map((note) => note.midi)];
  const minMidi = Math.min(36, ...visibleMidi);
  const maxMidi = Math.max(84, ...visibleMidi);
  const pixelsPerPitch = pianoHeight / (maxMidi - minMidi + 1);

  useEffect(() => {
    if (recordState !== "recording") return;
    const roll = pianoRollRef.current;
    if (!roll) return;
    roll.scrollLeft = followTimelineScroll(
      roll.scrollLeft,
      roll.clientWidth,
      roll.scrollWidth,
      playhead * PIANO_PIXELS_PER_TICK,
    );
  }, [playhead, recordState]);

  const timelineContext = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const rawTick = Math.max(0, Math.min(pianoTimelineDuration, Math.round((event.clientX - rect.left + event.currentTarget.scrollLeft) / pianoPixelsPerTick)));
    const tick = snapTickToGrid(rawTick, project.recording.quantize);
    const action = window.prompt("이 위치에 추가: tempo 숫자 또는 meter 7/8", `tempo ${project.tempo}`);
    if (!action) return;
    if (action.toLowerCase().startsWith("meter")) {
      const match = action.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) commit((draft: any) => {
        const marker = { tick, numerator: Number(match[1]), denominator: Number(match[2]) };
        draft.timeSignatureMap = [...draft.timeSignatureMap.filter((item: any) => item.tick !== tick), marker].sort((a: any, b: any) => a.tick - b.tick);
        if (tick === 0) draft.timeSignature = { numerator: marker.numerator, denominator: marker.denominator };
        return draft;
      });
      return;
    }
    const bpm = Number(action.replace(/[^0-9]/g, ""));
    if (bpm > 0) {
      const ratio = tick / Math.max(1, displayTracks[project.tracks.indexOf(selectedTrack)]?.duration ?? 1);
      const index = Math.round(selectedTrack.sourceText.length * Math.min(1, ratio));
      updateTrack(selectedTrack.id, { sourceText: `${selectedTrack.sourceText.slice(0, index)}t${bpm}${selectedTrack.sourceText.slice(index)}` });
    }
  };

  return (
    <section className="mml-studio" aria-label="MML 편집과 녹음">
      <header className="mml-studio-header">
        <div className="mml-project-title">
          <span>냥 MML</span>
          <input aria-label="프로젝트 제목" placeholder="프로젝트 제목" value={project.title} onChange={(event) => commit((draft: any) => ({ ...draft, title: event.target.value }))} />
        </div>
        <div className="mml-record-feedback">
          <div className={`mml-record-state is-${recordState}`}>
            <i />
            <strong>{recordState === "idle" ? `${project.recording.mode === "realtime" ? "실시간" : "이어붙이기"} · ${recordTempo} BPM` : recordingMessage}</strong>
          </div>
          <div
            className={`mml-beat-visual ${metronomeVisual.preparing ? "is-preparing" : ""}`}
            data-pulse={metronomeVisual.pulse}
            aria-label={metronomeVisual.preparing ? "녹음 준비 박자" : "메트로놈 박자"}
          >
            <span>{metronomeVisual.preparing ? "준비" : "박자"}</span>
            <div>
              {Array.from({ length: Math.max(1, metronomeVisual.count) }, (_, index) => (
                <i className={metronomeVisual.beat === index ? "is-active" : ""} key={index} />
              ))}
            </div>
          </div>
        </div>
        <button type="button" className="mml-close" onClick={onClose} aria-label="MML 닫기" disabled={recordState !== "idle"}>×</button>
      </header>

      <div className="mml-transport" aria-label="MML 재생과 녹음">
        <div className="mml-transport-primary">
          <button type="button" className="is-primary" onClick={() => (playing ? clearPlayback() : startPlayback())} disabled={Boolean(parseError || tempoConflict)}><b>{playing ? "Ⅱ" : "▶"}</b><span>{playing ? "일시정지" : "재생"}</span><kbd>{shortcutLabel(recordingShortcuts.play)}</kbd></button>
          <button type="button" onClick={() => { clearPlayback(); playheadRef.current = 0; setPlayhead(0); }}><b>■</b><span>정지</span><kbd>{shortcutLabel(recordingShortcuts.stop)}</kbd></button>
          <button type="button" className={`is-record ${recordState !== "idle" ? "is-active" : ""}`} onClick={() => recordState === "idle" ? beginRecording() : finishRecording()} disabled={Boolean(parseError || tempoConflict)}><b>●</b><span>{recordState === "idle" ? "녹음" : "끝내기"}</span><kbd>{shortcutLabel(recordingShortcuts.record)}</kbd></button>
        </div>
        <div className="mml-transport-toggles">
          <button type="button" className={project.recording.metronome ? "is-active" : ""} aria-pressed={project.recording.metronome} onClick={toggleMetronome}><b>♩</b><span>메트로놈</span></button>
          <button type="button" className={project.view.loop ? "is-active" : ""} aria-pressed={project.view.loop} onClick={() => commit((draft: any) => { draft.view.loop = !draft.view.loop; return draft; })}><b>↻</b><span>반복</span></button>
        </div>
        <div className="mml-transport-tools">
          <button type="button" onClick={undo} disabled={!past.length || recordState !== "idle"} aria-label="실행 취소" title="실행 취소"><b>↶</b></button>
          <button type="button" onClick={redo} disabled={!future.length || recordState !== "idle"} aria-label="다시 실행" title="다시 실행"><b>↷</b></button>
          <button type="button" className={settingsView ? "is-active" : ""} disabled={recordState !== "idle"} onClick={() => { setSettingsView((value) => !value); setTrackSettingsView(false); setFileMenuView(false); }}><b>⚙</b><span>녹음 설정</span></button>
          <button type="button" className={fileMenuView ? "is-active" : ""} disabled={recordState !== "idle"} onClick={() => { setFileMenuView((value) => !value); setSettingsView(false); setTrackSettingsView(false); }}><b>⋯</b><span>파일</span></button>
        </div>
        <input ref={fileInputRef} type="file" accept=".mml,.nyangmml,text/plain,application/json" hidden onChange={importFile} />
      </div>

      {fileMenuView && (
        <div className="mml-action-menu" role="dialog" aria-label="MML 파일 메뉴">
          <div className="mml-action-menu-head"><strong>파일</strong><button type="button" onClick={() => setFileMenuView(false)}>닫기</button></div>
          <button type="button" onClick={resetProject}><b>＋</b><span><strong>새 프로젝트</strong><small>현재 작업을 비우고 새로 시작</small></span></button>
          <button type="button" onClick={() => fileInputRef.current?.click()}><b>↥</b><span><strong>불러오기</strong><small>MML 또는 냥 프로젝트</small></span></button>
          <button type="button" onClick={() => { exportMml(); setFileMenuView(false); }}><b>M</b><span><strong>MML 내보내기</strong><small>주석을 제외한 호환 코드</small></span></button>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(combineTracks(project.tracks.map((track: any) => track.sourceText), { removeComments: true })); setFileMenuView(false); }}><b>⧉</b><span><strong>전체 MML 복사</strong><small>모든 트랙을 클립보드로</small></span></button>
          <button type="button" onClick={() => { exportProject(); setFileMenuView(false); }}><b>냥</b><span><strong>프로젝트 저장</strong><small>설정과 트랙을 함께 보관</small></span></button>
        </div>
      )}

      {importPayload && (
        <div className="mml-import-dialog" role="dialog" aria-modal="true" aria-label="MML 불러오기 방식 선택">
          <div className="mml-import-card">
            <div className="mml-action-menu-head"><strong>MML을 어떻게 넣을까요?</strong><button type="button" onClick={() => setImportPayload(null)}>취소</button></div>
            <button type="button" onClick={() => applyImport("replace")}><strong>전체 교체</strong><small>현재 트랙을 지우고 불러온 곡으로 교체</small></button>
            <button type="button" onClick={() => applyImport("append")}><strong>곡 뒤에 이어 붙이기</strong><small>각 트랙의 마지막에 추가</small></button>
            <button type="button" onClick={() => applyImport("tracks")}><strong>새 트랙으로 추가</strong><small>현재 곡은 유지하고 트랙만 추가</small></button>
            <button type="button" onClick={() => applyImport("selected")}><strong>선택 트랙만 교체</strong><small>첫 번째 불러온 트랙으로 교체</small></button>
          </div>
        </div>
      )}

      {settingsView && (
        <div className="mml-quick-settings" role="dialog" aria-label="MML 세부 설정">
          <div className="mml-quick-settings-head"><span><strong>녹음 설정</strong><small>입력 방식과 박자 보정</small></span><button type="button" onClick={() => setSettingsView(false)}>닫기</button></div>
          <label>녹음 방식<select value={project.recording.mode} onChange={(event) => commit((draft: any) => { draft.recording.mode = event.target.value; return draft; })}><option value="realtime">실시간</option><option value="append">이어붙이기</option></select></label>
          <label>편집 방식<select value={project.recording.editMode} onChange={(event) => commit((draft: any) => { draft.recording.editMode = event.target.value; return draft; })}><option value="overwrite">수정</option><option value="insert">삽입</option></select></label>
          {project.recording.editMode === "insert" && <label>삽입 범위<select value={project.recording.insertScope} onChange={(event) => commit((draft: any) => { draft.recording.insertScope = event.target.value; return draft; })}><option value="all">전체 트랙 밀기</option><option value="used">사용 트랙만 밀기</option></select></label>}
          <label>박자 보정<select value={project.recording.quantize} onChange={(event) => commit((draft: any) => { draft.recording.quantize = event.target.value; return draft; })}>{["1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "auto", "off"].map((value) => <option value={value} key={value}>{value === "off" ? "보정 안 함" : value === "auto" ? "자동 리듬 인식" : value}</option>)}</select></label>
          <label>음 배정<select value={project.recording.pitchPriority} onChange={(event) => commit((draft: any) => { draft.recording.pitchPriority = event.target.value; return draft; })}><option value="high">높은 음 우선</option><option value="low">낮은 음 우선</option></select></label>
          <label>기록 v<input type="number" min="0" max="15" value={selectedTrack.recordVelocity} onChange={(event) => updateTrack(selectedTrack.id, { recordVelocity: Math.max(0, Math.min(15, Number(event.target.value))) })} /></label>
          <label>트랙 템포<input key={`tempo-${recordTempo}`} type="number" min="1" defaultValue={recordTempo} onBlur={(event) => updateMasterTempo(Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
          <label>박자표<select value={["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"].includes(`${project.timeSignature.numerator}/${project.timeSignature.denominator}`) ? `${project.timeSignature.numerator}/${project.timeSignature.denominator}` : "custom"} onChange={(event) => {
            if (event.target.value === "custom") return;
            const [numerator, denominator] = event.target.value.split("/").map(Number);
            commit((draft: any) => { draft.timeSignature = { numerator, denominator }; draft.timeSignatureMap = [{ tick: 0, numerator, denominator }, ...draft.timeSignatureMap.filter((item: any) => item.tick !== 0)]; return draft; });
          }}>{["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"].map((value) => <option value={value} key={value}>{value}</option>)}<option value="custom">직접 입력</option></select></label>
          <label>박자<input type="number" min="1" value={project.timeSignature.numerator} onChange={(event) => commit((draft: any) => { draft.timeSignature.numerator = Math.max(1, Number(event.target.value)); draft.timeSignatureMap = [{ tick: 0, ...draft.timeSignature }, ...draft.timeSignatureMap.filter((item: any) => item.tick !== 0)]; return draft; })} /><span>/</span><input type="number" min="1" value={project.timeSignature.denominator} onChange={(event) => commit((draft: any) => { draft.timeSignature.denominator = Math.max(1, Number(event.target.value)); draft.timeSignatureMap = [{ tick: 0, ...draft.timeSignature }, ...draft.timeSignatureMap.filter((item: any) => item.tick !== 0)]; return draft; })} /></label>
          {project.recording.mode === "realtime" && <label>카운트인<select value={project.recording.countIn} onChange={(event) => commit((draft: any) => { draft.recording.countIn = Number(event.target.value); return draft; })}><option value="0">없음</option><option value="1">1마디</option><option value="2">2마디</option></select></label>}
          <label>메트로놈 음량<input type="range" min="0" max="1" step="0.05" value={project.recording.metronomeVolume} onChange={(event) => commit((draft: any) => { draft.recording.metronomeVolume = Number(event.target.value); return draft; })} /></label>
          {project.recording.mode === "append" && <label>쉼표 키<input value={project.recording.restKey.replace(/^Key/, "")} readOnly onKeyDown={(event) => { event.preventDefault(); commit((draft: any) => { draft.recording.restKey = event.code; return draft; }); }} /></label>}
          {(["play", "record", "stop"] as const).map((action) => <label key={action}>{action === "play" ? "재생 키" : action === "record" ? "녹음 키" : "정지 키"}<input value={shortcutLabel(recordingShortcuts[action])} readOnly onKeyDown={(event) => captureShortcut(action, event)} /></label>)}
          <label>반복 시작<input type="number" min="0" value={project.view.loopStart} onChange={(event) => commit((draft: any) => { draft.view.loopStart = Math.max(0, Number(event.target.value)); return draft; })} /></label>
          <label>반복 끝<input type="number" min="1" value={project.view.loopEnd} onChange={(event) => commit((draft: any) => { draft.view.loopEnd = Math.max(1, Number(event.target.value)); return draft; })} /></label>
          <button type="button" onClick={() => window.alert(parseError ? parseError.message : tempoConflict || "냥냥에서 재생할 수 있는 MML입니다.")}>호환성 검사</button>
        </div>
      )}

      {trackSettingsView && (
        <div className="mml-track-settings" role="dialog" aria-label={`${selectedTrack.name} 설정`}>
          <div className="mml-quick-settings-head"><span><strong>트랙 설정</strong><small>선택한 트랙의 녹음·재생 속성</small></span><button type="button" onClick={() => setTrackSettingsView(false)}>닫기</button></div>
          <label className="mml-track-name-field">이름<input value={selectedTrack.name} onChange={(event) => updateTrack(selectedTrack.id, { name: event.target.value })} /></label>
          <label>색상<input type="color" value={selectedTrack.color} onChange={(event) => updateTrack(selectedTrack.id, { color: event.target.value })} /></label>
          <label>음색<select value={selectedTrack.themeId} onChange={(event) => updateTrack(selectedTrack.id, { themeId: event.target.value })}>{themes.map((theme) => <option value={theme.id} key={theme.id}>{theme.name}</option>)}</select></label>
          <label>기록 음량<input type="number" min="0" max="15" value={selectedTrack.recordVelocity} onChange={(event) => updateTrack(selectedTrack.id, { recordVelocity: Math.max(0, Math.min(15, Number(event.target.value))) })} /></label>
          <label className="mml-track-volume-field">재생 음량<input aria-label={`${selectedTrack.name} 재생 음량`} type="range" min="0" max="1" step="0.01" value={selectedTrack.mixerVolume} onChange={(event) => updateTrack(selectedTrack.id, { mixerVolume: Number(event.target.value) })} /></label>
          <div className="mml-track-setting-group"><span>건반 연결</span><button type="button" className={project.routing.left.includes(selectedTrack.id) ? "is-on" : ""} aria-pressed={project.routing.left.includes(selectedTrack.id)} onClick={() => toggleRoute("left", selectedTrack.id)}>왼쪽</button><button type="button" className={project.routing.right.includes(selectedTrack.id) ? "is-on" : ""} aria-pressed={project.routing.right.includes(selectedTrack.id)} onClick={() => toggleRoute("right", selectedTrack.id)}>오른쪽</button></div>
          <div className="mml-track-setting-group"><span>재생</span><button type="button" className={selectedTrack.muted ? "is-on" : ""} aria-pressed={selectedTrack.muted} onClick={() => updateTrack(selectedTrack.id, { muted: !selectedTrack.muted })}>음소거</button><button type="button" className={selectedTrack.solo ? "is-on" : ""} aria-pressed={selectedTrack.solo} onClick={() => updateTrack(selectedTrack.id, { solo: !selectedTrack.solo })}>혼자 듣기</button><button type="button" className={!selectedTrack.pianoRollVisible ? "is-on" : ""} aria-pressed={!selectedTrack.pianoRollVisible} onClick={() => updateTrack(selectedTrack.id, { pianoRollVisible: !selectedTrack.pianoRollVisible })}>롤 숨김</button></div>
          <button type="button" className="mml-delete-track" onClick={() => { removeTrack(selectedTrack.id); setTrackSettingsView(false); }} disabled={project.tracks.length <= 1}>이 트랙 삭제</button>
        </div>
      )}

      <div className="mml-main-grid">
        <aside className="mml-track-list">
          <div className="mml-track-list-title"><strong>트랙</strong><button type="button" onClick={addTrack} disabled={recordState !== "idle"}>＋</button></div>
          {project.tracks.map((track: any, index: number) => (
            <button type="button" className={`mml-track-card ${track.id === selectedTrack.id ? "is-selected" : ""}`} style={{ "--track-color": track.color } as CSSProperties} key={track.id} onClick={() => selectTrack(track.id)} aria-pressed={track.id === selectedTrack.id}>
              <i style={{ background: track.color }} />
              <span><strong>{track.name || `Track ${index + 1}`}</strong><small>{themes.find((theme) => theme.id === track.themeId)?.name ?? "음색"}</small></span>
              <em>{project.routing.left.includes(track.id) ? "L" : ""}{project.routing.right.includes(track.id) ? "R" : ""}{track.muted ? " M" : ""}{track.solo ? " S" : ""}</em>
            </button>
          ))}
          <button type="button" className="mml-track-settings-button" disabled={recordState !== "idle"} onClick={() => { setTrackSettingsView(true); setSettingsView(false); setFileMenuView(false); }}>선택 트랙 설정</button>
        </aside>

        <div className="mml-work-area">
          <div ref={pianoRollRef} className={`mml-piano-roll ${parseError ? "has-error" : ""}`} onContextMenu={timelineContext} onClick={(event) => {
            if ((event.target as HTMLElement).closest(".mml-note-block")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const rawTick = Math.round((event.clientX - rect.left + event.currentTarget.scrollLeft) / pianoPixelsPerTick);
            const tick = snapTickToGrid(rawTick, project.recording.quantize);
            playheadRef.current = Math.max(0, tick);
            setPlayhead(Math.max(0, tick));
            const selectedIndex = project.tracks.findIndex((track: any) => track.id === selectedTrack.id);
            const parsed = displayTracks[selectedIndex];
            const timelineItems = [...(parsed?.notes ?? []), ...(parsed?.rests ?? [])].sort((a: any, b: any) => a.tick - b.tick);
            const target = timelineItems.find((item: any) => item.tick >= tick) ?? timelineItems.at(-1);
            const caret = target?.sourceStart ?? selectedTrack.sourceText.length;
            window.requestAnimationFrame(() => {
              editorRef.current?.focus();
              editorRef.current?.setSelectionRange(caret, caret);
            });
          }}>
            <div className="mml-piano-canvas" style={{ width: pianoWidth, height: pianoHeight }}>
              {Array.from({ length: maxMidi - minMidi + 1 }, (_, index) => {
                const midi = maxMidi - index;
                const pitchClass = ((midi % 12) + 12) % 12;
                return <span className={`mml-pitch-row ${[1, 3, 6, 8, 10].includes(pitchClass) ? "is-accidental" : ""}`} style={{ top: `${index * pixelsPerPitch}px`, height: `${pixelsPerPitch}px` }} key={`pitch-${midi}`}><em>{pitchClass === 0 ? noteLabel(midi) : ""}</em></span>;
              })}
              {quantizeLines.map((tick) => <i className="mml-quantize-line" style={{ left: `${tickToPianoX(tick)}px` }} key={`quantize-${tick}`} />)}
              {timelineGrid.beats.map((beat: any) => <i className="mml-beat-line" style={{ left: `${tickToPianoX(beat.tick)}px` }} key={`beat-${beat.tick}`} />)}
              {timelineGrid.measures.map((measure: any) => <i className="mml-measure-line" style={{ left: `${tickToPianoX(measure.tick)}px` }} key={`measure-line-${measure.tick}`} />)}
              {timelineGrid.measures.map((measure: any) => <span className="mml-measure-label" style={{ left: `${tickToPianoX(measure.tick)}px` }} key={`measure-label-${measure.tick}`}>{measure.number}</span>)}
              {project.timeSignatureMap.filter((marker: any) => marker.tick > 0).map((marker: any) => <span className="mml-meter-marker" style={{ left: `${tickToPianoX(marker.tick)}px` }} key={`${marker.tick}-${marker.numerator}-${marker.denominator}`}>{marker.numerator}/{marker.denominator}</span>)}
              {visibleNotes.map((note: any) => {
                const track = project.tracks[note.trackIndex];
                const selected = track.id === selectedTrack.id;
                return <button type="button" className={`mml-note-block ${selected ? "is-selected" : ""}`} style={{ left: `${tickToPianoX(note.tick)}px`, width: `${Math.max(4, tickToPianoX(note.duration))}px`, top: `${(maxMidi - note.midi) * pixelsPerPitch}px`, height: `${Math.max(5, pixelsPerPitch - 1)}px`, background: track.color }} key={`${track.id}-${note.sourceStart}-${note.tick}`} onClick={() => selectPianoNote(note.trackIndex, note)} title={`${track.name} · ${noteLabel(note.midi)}`} />;
              })}
              {liveRecordingNotes.map((note) => <i aria-hidden="true" className="mml-note-block is-live-recording" style={{ left: `${tickToPianoX(note.tick)}px`, width: `${Math.max(4, tickToPianoX(note.duration))}px`, top: `${(maxMidi - note.midi) * pixelsPerPitch}px`, height: `${Math.max(5, pixelsPerPitch - 1)}px`, background: note.color }} key={`live-${note.id}`} />)}
              <i className="mml-playhead" style={{ left: `${tickToPianoX(playhead)}px` }} />
            </div>
          </div>

          <div className="mml-editor-head">
            <i style={{ background: selectedTrack.color }} />
            <strong>{selectedTrack.name}</strong>
            <small>{project.recording.mode === "realtime" ? "실시간" : "이어붙이기"} · {project.recording.editMode === "overwrite" ? "수정" : "삽입"} · {project.recording.quantize === "off" ? "보정 없음" : `${project.recording.quantize} 보정`}</small>
            <button type="button" onClick={() => { setTrackSettingsView(true); setSettingsView(false); setFileMenuView(false); }}>트랙 설정</button>
            <button type="button" onClick={() => navigator.clipboard.writeText(selectedTrack.sourceText)}>복사</button>
          </div>
          <textarea ref={editorRef} className={parseError && project.tracks[parseError.trackIndex]?.id === selectedTrack.id ? "has-error" : ""} spellCheck={false} readOnly={recordState !== "idle"} value={selectedTrack.sourceText} onChange={(event) => updateTrack(selectedTrack.id, { sourceText: event.target.value })} onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (!/^\s*MML@/i.test(text)) return;
            event.preventDefault();
            try {
              const parsed = parseMmlDocument(text);
              const ranges = parsed.tracks.map((track: any) => text.slice(track.sourceStart, track.sourceEnd));
              commit((draft: any) => {
                draft.tracks = ranges.map((sourceText: string, index: number) => ({ ...createTrack(index, currentThemeId), sourceText }));
                draft.routing = { left: draft.tracks.slice(0, 2).map((track: any) => track.id), right: draft.tracks[2] ? [draft.tracks[2].id] : [] };
                draft.view.selectedTrackId = draft.tracks[0].id;
                return draft;
              });
            } catch (error) {
              window.alert(`붙여넣은 MML을 나누지 못했습니다.\n${(error as Error).message}`);
            }
          }} aria-label={`${selectedTrack.name} MML 편집`} />
          <div className="mml-status-line">
            <span>{parseError ? `Track ${parseError.trackIndex + 1} · ${parseError.line}줄 ${parseError.column}자 · ${parseError.message}` : tempoConflict || `${Math.round(songDuration)} tick · ${project.tempo} BPM · ${project.timeSignature.numerator}/${project.timeSignature.denominator}`}</span>
            <span>{droppedCount > 0 ? `놓친 음 ${droppedCount}개` : recordingMessage}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
