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
  tickToSeconds,
  TICKS_PER_QUARTER,
} from "../mml/core.js";
import { createProject, createTrack, PROJECT_STORAGE_KEY, projectFilename, sanitizeProject } from "../mml/project.js";
import { recordingToTrackTexts } from "../mml/recording.js";
import { loadAutosave, saveAutosave } from "../mml/storage.js";

type KeyboardSide = "left" | "right";

type ThemeOption = {
  id: string;
  name: string;
  accent: string;
};

export type MmlInputSink = {
  noteOn: (inputId: string, side: KeyboardSide, midi: number, at: number) => void;
  noteOff: (inputId: string, at: number) => void;
};

type Props = {
  currentThemeId: string;
  themes: ThemeOption[];
  onClose: () => void;
  registerInputSink: (sink: MmlInputSink | null) => void;
  playMidi: (sourceId: string, midi: number, themeId: string, volume: number) => void;
  releaseMidi: (sourceId: string) => void;
  stopMmlAudio: () => void;
  clickMetronome: (accent: boolean, volume: number) => void;
};

type RecordingInput = {
  id: string;
  inputId: string;
  side: KeyboardSide;
  midi: number;
  startedAt: number;
  endedAt: number;
};

type ParsedTrack = ReturnType<typeof parseTrack>;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

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

function noteLabel(midi: number) {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function shortcutLabel(value: string) {
  return value.replace(/Key|Digit/g, "").replace(/\+/g, " ");
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
  onClose,
  registerInputSink,
  playMidi,
  releaseMidi,
  stopMmlAudio,
  clickMetronome,
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
  const [droppedCount, setDroppedCount] = useState(0);
  const [settingsView, setSettingsView] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectRef = useRef(project);
  const playTimersRef = useRef<number[]>([]);
  const playRafRef = useRef(0);
  const startPlaybackRef = useRef<(fromTick?: number) => void>(() => undefined);
  const playStartedRef = useRef({ audioStartedAt: 0, tick: 0 });
  const countInTimerRef = useRef<number | null>(null);
  const metronomeTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef(0);
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

  const songDuration = useMemo(
    () => Math.max(TICKS_PER_QUARTER * 4, ...displayTracks.map((track: any) => track.duration)),
    [displayTracks],
  );

  const clearPlayback = useCallback(() => {
    playTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    playTimersRef.current = [];
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

    project.tracks.forEach((track: any, trackIndex: number) => {
      if (track.muted || (soloed && !track.solo)) return;
      for (const note of displayTracks[trackIndex]?.notes ?? []) {
        if (note.tick + note.duration <= startTick || note.tick >= endTick) continue;
        const noteStart = Math.max(note.tick, startTick);
        const noteEnd = Math.min(note.tick + note.duration, endTick);
        const delay = Math.max(0, (tickToSeconds(noteStart, allTempoEvents, project.tempo) - startSeconds) * 1000);
        const duration = Math.max(10, (tickToSeconds(noteEnd, allTempoEvents, project.tempo) - tickToSeconds(noteStart, allTempoEvents, project.tempo)) * 1000);
        const sourceId = `mml:${track.id}:${note.sourceStart}:${now}`;
        playTimersRef.current.push(window.setTimeout(() => playMidi(sourceId, note.midi, track.themeId, track.mixerVolume * note.velocity / 15), delay));
        playTimersRef.current.push(window.setTimeout(() => releaseMidi(sourceId), delay + duration));
      }
    });

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

  const finishRecording = useCallback(() => {
    if (countInTimerRef.current !== null) window.clearTimeout(countInTimerRef.current);
    if (metronomeTimerRef.current !== null) window.clearInterval(metronomeTimerRef.current);
    countInTimerRef.current = null;
    metronomeTimerRef.current = null;
    const endedAt = performance.now() / 1000;
    activeRecordingRef.current.forEach((input) => {
      recordingInputsRef.current.push({ ...input, endedAt });
    });
    activeRecordingRef.current.clear();
    const current = projectRef.current;
    const origin = current.recording.mode === "realtime" ? recordingStartRef.current : 0;
    const result = recordingToTrackTexts(
      recordingInputsRef.current,
      current.tracks,
      current.routing,
      {
        bpm: current.tempo,
        quantize: current.recording.quantize,
        pitchPriority: current.recording.pitchPriority,
        origin,
      },
    );
    let recordedEndTick = 0;
    for (const input of recordingInputsRef.current) {
      const seconds = input.endedAt - origin;
      recordedEndTick = Math.max(recordedEndTick, Math.round(seconds * TICKS_PER_QUARTER * current.tempo / 60));
    }
    for (const rest of explicitRestsRef.current) {
      recordedEndTick = Math.max(recordedEndTick, Math.round(rest.end * TICKS_PER_QUARTER * current.tempo / 60));
    }
    const startTick = playhead;
    const recordingLength = Math.max(0, recordedEndTick);
    const connectedIds = new Set([...current.routing.left, ...current.routing.right]);
    commit((draft: any) => {
      const applyToTrack = (track: any, index: number) => {
        const newText = result.texts.get(track.id);
        const isUsed = result.usedTrackIds.has(track.id) || (recordingLength > 0 && connectedIds.has(track.id) && explicitRestsRef.current.length > 0);
        if (!isUsed && !(draft.recording.editMode === "insert" && draft.recording.insertScope === "all")) return track;
        let existing;
        try { existing = parseTrack(track.sourceText); } catch { existing = { notes: [] }; }
        const inserted = newText ? parseTrack(newText).notes.map((note: any) => ({ ...note, tick: note.tick + startTick })) : [];
        let notes = existing.notes.map((note: any) => ({ tick: note.tick, duration: note.duration, midi: note.midi }));
        if (draft.recording.editMode === "insert") {
          notes = notes.map((note: any) => note.tick >= startTick ? { ...note, tick: note.tick + recordingLength } : note);
          if (isUsed) notes.push(...inserted);
        } else if (isUsed) {
          notes = notes.filter((note: any) => note.tick + note.duration <= startTick || note.tick >= startTick + recordingLength);
          notes.push(...inserted);
        }
        let sourceText = serializeTrackEvents(notes, { velocity: track.recordVelocity });
        const parsedDuration = parseTrack(sourceText).duration;
        if (isUsed && recordedEndTick > 0 && parsedDuration < startTick + recordedEndTick) {
          sourceText += encodeDuration(startTick + recordedEndTick - parsedDuration).map((length: string) => `r${length}`).join("");
        }
        draft.tracks[index].sourceText = sourceText;
        return draft.tracks[index];
      };
      draft.tracks.forEach(applyToTrack);
      return draft;
    });
    setDroppedCount(result.dropped.length);
    setRecordingMessage(result.dropped.length ? `${result.dropped.length}개 음은 연결된 트랙이 부족해 기록하지 않았습니다.` : "녹음을 MML로 변환했습니다.");
    setRecordState("idle");
    recordingInputsRef.current = [];
    explicitRestsRef.current = [];
    restStartedRef.current = null;
  }, [commit, playhead]);

  const beginRecording = useCallback(() => {
    if (parseError || tempoConflict) return;
    clearPlayback();
    const current = projectRef.current;
    recordingInputsRef.current = [];
    activeRecordingRef.current.clear();
    explicitRestsRef.current = [];
    appendCursorRef.current = 0;
    appendWallStartRef.current = null;
    setDroppedCount(0);
    const begin = () => {
      recordingStartRef.current = performance.now() / 1000;
      setRecordState("recording");
      setRecordingMessage(current.recording.mode === "realtime" ? "실시간 녹음 중" : "이어붙이기 녹음 중");
      if (current.recording.metronome) {
        let beat = 0;
        clickMetronome(true, current.recording.metronomeVolume);
        metronomeTimerRef.current = window.setInterval(() => {
          beat += 1;
          clickMetronome(beat % current.timeSignature.numerator === 0, current.recording.metronomeVolume);
        }, 60000 / current.tempo);
      }
    };
    if (current.recording.countIn > 0) {
      setRecordState("count-in");
      setRecordingMessage(`${current.recording.countIn}마디 카운트인`);
      const beats = current.recording.countIn * current.timeSignature.numerator;
      let beat = 0;
      clickMetronome(true, current.recording.metronomeVolume);
      const countInterval = window.setInterval(() => {
        beat += 1;
        if (beat >= beats) {
          window.clearInterval(countInterval);
          begin();
        } else clickMetronome(beat % current.timeSignature.numerator === 0, current.recording.metronomeVolume);
      }, 60000 / current.tempo);
      countInTimerRef.current = countInterval;
    } else begin();
  }, [clearPlayback, clickMetronome, parseError, tempoConflict]);

  const sink = useMemo<MmlInputSink>(() => ({
    noteOn(inputId, side, midi, at) {
      if (recordState !== "recording" || activeRecordingRef.current.has(inputId)) return;
      const current = projectRef.current;
      let startedAt = at;
      if (current.recording.mode === "append") {
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
      const current = projectRef.current;
      let endedAt = at;
      if (current.recording.mode === "append") {
        endedAt = appendCursorRef.current + (at - (appendWallStartRef.current ?? at));
      }
      recordingInputsRef.current.push({ ...active, endedAt: Math.max(active.startedAt, endedAt) });
      activeRecordingRef.current.delete(inputId);
      if (current.recording.mode === "append" && activeRecordingRef.current.size === 0 && restStartedRef.current === null) {
        appendCursorRef.current = endedAt;
        appendWallStartRef.current = null;
      }
    },
  }), [recordState]);

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
        return;
      }
      const current = projectRef.current;
      if (typing || event.repeat || recordState !== "recording" || current.recording.mode !== "append" || event.code !== current.recording.restKey) return;
      event.preventDefault();
      const at = performance.now() / 1000;
      if (appendWallStartRef.current === null) appendWallStartRef.current = at;
      restStartedRef.current = appendCursorRef.current + (at - appendWallStartRef.current);
    };
    const up = (event: KeyboardEvent) => {
      const current = projectRef.current;
      if (recordState !== "recording" || current.recording.mode !== "append" || event.code !== current.recording.restKey || restStartedRef.current === null) return;
      event.preventDefault();
      const at = performance.now() / 1000;
      const end = appendCursorRef.current + (at - (appendWallStartRef.current ?? at));
      explicitRestsRef.current.push({ start: restStartedRef.current, end });
      restStartedRef.current = null;
      if (activeRecordingRef.current.size === 0) {
        appendCursorRef.current = end;
        appendWallStartRef.current = null;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [beginRecording, clearPlayback, finishRecording, playing, recordState, redo, startPlayback, undo]);

  useEffect(() => () => {
    clearPlayback();
    if (countInTimerRef.current !== null) window.clearInterval(countInTimerRef.current);
    if (metronomeTimerRef.current !== null) window.clearInterval(metronomeTimerRef.current);
  }, [clearPlayback]);

  const updateTrack = (id: string, patch: Record<string, unknown>) => commit((draft: any) => {
    const track = draft.tracks.find((item: any) => item.id === id);
    if (track) Object.assign(track, patch);
    return draft;
  });

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

  const selectPianoNote = (trackIndex: number, note: any) => {
    const track = project.tracks[trackIndex];
    commit((draft: any) => {
      draft.view.selectedTrackId = track.id;
      return draft;
    });
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(note.sourceStart, note.sourceEnd);
    });
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm("현재 작업을 불러온 내용으로 변경할까요? 필요한 경우 먼저 냥 프로젝트를 저장하세요.")) return;
    const text = await file.text();
    try {
      if (file.name.toLowerCase().endsWith(".nyangmml")) {
        commit(sanitizeProject(JSON.parse(text), currentThemeId));
        return;
      }
      const parsed = parseMmlDocument(text);
      const mode = window.prompt("가져오기 방식: 1 전체 교체 · 2 곡 뒤에 추가 · 3 새 트랙 · 4 선택 트랙 교체", "1");
      if (!mode) return;
      const ranges = parsed.tracks.map((track: any) => text.slice(track.sourceStart, track.sourceEnd));
      commit((draft: any) => {
        if (mode === "1") {
          draft.tracks = ranges.map((sourceText: string, index: number) => ({ ...createTrack(index, currentThemeId), sourceText }));
          draft.routing = { left: draft.tracks.slice(0, 2).map((track: any) => track.id), right: draft.tracks[2] ? [draft.tracks[2].id] : [] };
          draft.view.selectedTrackId = draft.tracks[0].id;
        } else if (mode === "2") {
          ranges.forEach((sourceText: string, index: number) => {
            if (!draft.tracks[index]) draft.tracks.push(createTrack(index, currentThemeId));
            draft.tracks[index].sourceText += sourceText;
          });
        } else if (mode === "3") {
          ranges.forEach((sourceText: string) => draft.tracks.push({ ...createTrack(draft.tracks.length, currentThemeId), sourceText }));
        } else if (mode === "4") {
          const selected = draft.tracks.find((track: any) => track.id === draft.view.selectedTrackId);
          if (selected) selected.sourceText = ranges[0] ?? "";
        }
        return draft;
      });
    } catch (error) {
      window.alert(`파일을 불러오지 못했습니다.\n${(error as Error).message}`);
    }
  };

  const exportProject = () => saveBlob(projectFilename(project), "application/json", JSON.stringify(project, null, 2));
  const exportMml = () => {
    const name = project.title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "nyangnyang";
    saveBlob(`${name}.mml`, "text/plain;charset=utf-8", combineTracks(project.tracks.map((track: any) => track.sourceText), { removeComments: true }));
  };

  const pianoWidth = Math.max(760, (songDuration / (TICKS_PER_QUARTER * 4)) * 190);
  const pianoHeight = 390;
  const visibleNotes = displayTracks.flatMap((track: any, trackIndex: number) => {
    if (!project.tracks[trackIndex]?.pianoRollVisible) return [];
    return track.notes.map((note: any) => ({ ...note, trackIndex }));
  });
  const minMidi = Math.min(36, ...visibleNotes.map((note: any) => note.midi));
  const maxMidi = Math.max(84, ...visibleNotes.map((note: any) => note.midi));
  const pixelsPerPitch = pianoHeight / (maxMidi - minMidi + 1);

  const timelineContext = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const tick = Math.max(0, Math.round(((event.clientX - rect.left + event.currentTarget.scrollLeft) / pianoWidth) * songDuration));
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
          <span>MML STUDIO</span>
          <input aria-label="프로젝트 제목" placeholder="프로젝트 제목" value={project.title} onChange={(event) => commit((draft: any) => ({ ...draft, title: event.target.value }))} />
        </div>
        <div className={`mml-record-state is-${recordState}`}>
          <i />
          <strong>{recordState === "idle" ? "준비" : recordingMessage}</strong>
        </div>
        <button type="button" className="mml-close" onClick={onClose} aria-label="MML 닫기">×</button>
      </header>

      <div className="mml-transport" aria-label="MML 재생과 녹음">
        <button type="button" onClick={() => (playing ? clearPlayback() : startPlayback())} disabled={Boolean(parseError || tempoConflict)}>{playing ? "Ⅱ" : "▶"}<span>{playing ? "일시정지" : "재생"}</span><kbd>{shortcutLabel(recordingShortcuts.play)}</kbd></button>
        <button type="button" onClick={() => { clearPlayback(); setPlayhead(0); }}>■<span>정지</span><kbd>{shortcutLabel(recordingShortcuts.stop)}</kbd></button>
        <button type="button" className={recordState !== "idle" ? "is-active" : ""} onClick={() => recordState === "idle" ? beginRecording() : finishRecording()} disabled={Boolean(parseError || tempoConflict)}>●<span>{recordState === "idle" ? "녹음" : "끝내기"}</span><kbd>{shortcutLabel(recordingShortcuts.record)}</kbd></button>
        <button type="button" className={project.recording.metronome ? "is-active" : ""} onClick={() => commit((draft: any) => { draft.recording.metronome = !draft.recording.metronome; return draft; })}>♩<span>메트로놈</span></button>
        <button type="button" className={project.view.loop ? "is-active" : ""} onClick={() => commit((draft: any) => { draft.view.loop = !draft.view.loop; return draft; })}>↻<span>반복</span></button>
        <button type="button" onClick={undo} disabled={!past.length}>↶<span>실행 취소</span></button>
        <button type="button" onClick={redo} disabled={!future.length}>↷<span>다시 실행</span></button>
        <button type="button" onClick={() => setSettingsView((value) => !value)}>⚙<span>MML 설정</span></button>
        <button type="button" onClick={exportMml}>MML<span>내보내기</span></button>
        <button type="button" onClick={exportProject}>냥<span>프로젝트</span></button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>↥<span>불러오기</span></button>
        <input ref={fileInputRef} type="file" accept=".mml,.nyangmml,text/plain,application/json" hidden onChange={importFile} />
      </div>

      {settingsView && (
        <div className="mml-quick-settings">
          <label>녹음 방식<select value={project.recording.mode} onChange={(event) => commit((draft: any) => { draft.recording.mode = event.target.value; return draft; })}><option value="realtime">실시간</option><option value="append">이어붙이기</option></select></label>
          <label>편집 방식<select value={project.recording.editMode} onChange={(event) => commit((draft: any) => { draft.recording.editMode = event.target.value; return draft; })}><option value="overwrite">수정</option><option value="insert">삽입</option></select></label>
          {project.recording.editMode === "insert" && <label>삽입 범위<select value={project.recording.insertScope} onChange={(event) => commit((draft: any) => { draft.recording.insertScope = event.target.value; return draft; })}><option value="all">전체 트랙 밀기</option><option value="used">사용 트랙만 밀기</option></select></label>}
          <label>박자 보정<select value={project.recording.quantize} onChange={(event) => commit((draft: any) => { draft.recording.quantize = event.target.value; return draft; })}>{["1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "auto", "off"].map((value) => <option value={value} key={value}>{value === "off" ? "보정 안 함" : value === "auto" ? "자동 리듬 인식" : value}</option>)}</select></label>
          <label>음 배정<select value={project.recording.pitchPriority} onChange={(event) => commit((draft: any) => { draft.recording.pitchPriority = event.target.value; return draft; })}><option value="high">높은 음 우선</option><option value="low">낮은 음 우선</option></select></label>
          <label>기록 v<input type="number" min="0" max="15" value={selectedTrack.recordVelocity} onChange={(event) => updateTrack(selectedTrack.id, { recordVelocity: Math.max(0, Math.min(15, Number(event.target.value))) })} /></label>
          <label>BPM<input type="number" min="1" value={project.tempo} onChange={(event) => commit((draft: any) => ({ ...draft, tempo: Math.max(1, Number(event.target.value)) }))} /></label>
          <label>박자표<select value={["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"].includes(`${project.timeSignature.numerator}/${project.timeSignature.denominator}`) ? `${project.timeSignature.numerator}/${project.timeSignature.denominator}` : "custom"} onChange={(event) => {
            if (event.target.value === "custom") return;
            const [numerator, denominator] = event.target.value.split("/").map(Number);
            commit((draft: any) => { draft.timeSignature = { numerator, denominator }; draft.timeSignatureMap = [{ tick: 0, numerator, denominator }, ...draft.timeSignatureMap.filter((item: any) => item.tick !== 0)]; return draft; });
          }}>{["2/4", "3/4", "4/4", "6/8", "9/8", "12/8"].map((value) => <option value={value} key={value}>{value}</option>)}<option value="custom">직접 입력</option></select></label>
          <label>박자<input type="number" min="1" value={project.timeSignature.numerator} onChange={(event) => commit((draft: any) => { draft.timeSignature.numerator = Math.max(1, Number(event.target.value)); draft.timeSignatureMap = [{ tick: 0, ...draft.timeSignature }, ...draft.timeSignatureMap.filter((item: any) => item.tick !== 0)]; return draft; })} /><span>/</span><input type="number" min="1" value={project.timeSignature.denominator} onChange={(event) => commit((draft: any) => { draft.timeSignature.denominator = Math.max(1, Number(event.target.value)); draft.timeSignatureMap = [{ tick: 0, ...draft.timeSignature }, ...draft.timeSignatureMap.filter((item: any) => item.tick !== 0)]; return draft; })} /></label>
          <label>카운트인<select value={project.recording.countIn} onChange={(event) => commit((draft: any) => { draft.recording.countIn = Number(event.target.value); return draft; })}><option value="0">없음</option><option value="1">1마디</option><option value="2">2마디</option></select></label>
          <label>메트로놈 음량<input type="range" min="0" max="1" step="0.05" value={project.recording.metronomeVolume} onChange={(event) => commit((draft: any) => { draft.recording.metronomeVolume = Number(event.target.value); return draft; })} /></label>
          {project.recording.mode === "append" && <label>쉼표 키<input value={project.recording.restKey.replace(/^Key/, "")} readOnly onKeyDown={(event) => { event.preventDefault(); commit((draft: any) => { draft.recording.restKey = event.code; return draft; }); }} /></label>}
          {(["play", "record", "stop"] as const).map((action) => <label key={action}>{action === "play" ? "재생 키" : action === "record" ? "녹음 키" : "정지 키"}<input value={shortcutLabel(recordingShortcuts[action])} readOnly onKeyDown={(event) => captureShortcut(action, event)} /></label>)}
          <label>반복 시작<input type="number" min="0" value={project.view.loopStart} onChange={(event) => commit((draft: any) => { draft.view.loopStart = Math.max(0, Number(event.target.value)); return draft; })} /></label>
          <label>반복 끝<input type="number" min="1" value={project.view.loopEnd} onChange={(event) => commit((draft: any) => { draft.view.loopEnd = Math.max(1, Number(event.target.value)); return draft; })} /></label>
          <button type="button" onClick={() => window.alert(parseError ? parseError.message : tempoConflict || "냥냥에서 재생할 수 있는 MML입니다.")}>호환성 검사</button>
        </div>
      )}

      <div className="mml-main-grid">
        <aside className="mml-track-list">
          <div className="mml-track-list-title"><strong>트랙</strong><button type="button" onClick={addTrack}>＋ 추가</button></div>
          {project.tracks.map((track: any, index: number) => (
            <article className={`mml-track-card ${track.id === selectedTrack.id ? "is-selected" : ""}`} style={{ "--track-color": track.color } as CSSProperties} key={track.id} onClick={() => commit((draft: any) => { draft.view.selectedTrackId = track.id; return draft; })}>
              <div className="mml-track-head"><input type="color" value={track.color} onChange={(event) => updateTrack(track.id, { color: event.target.value })} aria-label={`${track.name} 색상`} /><input value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} aria-label={`Track ${index + 1} 이름`} /><button type="button" onClick={(event) => { event.stopPropagation(); removeTrack(track.id); }} disabled={project.tracks.length <= 1}>×</button></div>
              <div className="mml-track-routes"><button type="button" className={project.routing.left.includes(track.id) ? "is-on" : ""} onClick={(event) => { event.stopPropagation(); toggleRoute("left", track.id); }}>왼쪽</button><button type="button" className={project.routing.right.includes(track.id) ? "is-on" : ""} onClick={(event) => { event.stopPropagation(); toggleRoute("right", track.id); }}>오른쪽</button></div>
              <select value={track.themeId} onChange={(event) => updateTrack(track.id, { themeId: event.target.value })}>{themes.map((theme) => <option value={theme.id} key={theme.id}>{theme.name}</option>)}</select>
              <input className="mml-track-volume" aria-label={`${track.name} 재생 음량`} type="range" min="0" max="1" step="0.01" value={track.mixerVolume} onChange={(event) => updateTrack(track.id, { mixerVolume: Number(event.target.value) })} />
              <div className="mml-track-switches"><button type="button" className={track.muted ? "is-on" : ""} onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }}>M</button><button type="button" className={track.solo ? "is-on" : ""} onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }}>S</button><button type="button" className={!track.pianoRollVisible ? "is-on" : ""} onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { pianoRollVisible: !track.pianoRollVisible }); }}>숨김</button></div>
            </article>
          ))}
        </aside>

        <div className="mml-work-area">
          <div className={`mml-piano-roll ${parseError ? "has-error" : ""}`} onContextMenu={timelineContext} onClick={(event) => {
            if ((event.target as HTMLElement).closest(".mml-note-block")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const tick = Math.round(((event.clientX - rect.left + event.currentTarget.scrollLeft) / pianoWidth) * songDuration);
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
              {Array.from({ length: Math.ceil(songDuration / (TICKS_PER_QUARTER * 4)) + 1 }, (_, index) => <span className="mml-measure-label" style={{ left: `${index * 190}px` }} key={index}>{index + 1}</span>)}
              {project.timeSignatureMap.filter((marker: any) => marker.tick > 0).map((marker: any) => <span className="mml-meter-marker" style={{ left: `${(marker.tick / songDuration) * pianoWidth}px` }} key={`${marker.tick}-${marker.numerator}-${marker.denominator}`}>{marker.numerator}/{marker.denominator}</span>)}
              {visibleNotes.map((note: any) => {
                const track = project.tracks[note.trackIndex];
                const selected = track.id === selectedTrack.id;
                return <button type="button" className={`mml-note-block ${selected ? "is-selected" : ""}`} style={{ left: `${(note.tick / songDuration) * pianoWidth}px`, width: `${Math.max(4, (note.duration / songDuration) * pianoWidth)}px`, top: `${(maxMidi - note.midi) * pixelsPerPitch}px`, height: `${Math.max(5, pixelsPerPitch - 1)}px`, background: track.color }} key={`${track.id}-${note.sourceStart}-${note.tick}`} onClick={() => selectPianoNote(note.trackIndex, note)} title={`${track.name} · ${noteLabel(note.midi)}`} />;
              })}
              <i className="mml-playhead" style={{ left: `${(playhead / songDuration) * pianoWidth}px` }} />
            </div>
          </div>

          <div className="mml-editor-head"><strong>{selectedTrack.name}</strong><span style={{ color: selectedTrack.color }}>●</span><small>v{selectedTrack.recordVelocity}</small><button type="button" onClick={() => navigator.clipboard.writeText(selectedTrack.sourceText)}>복사</button></div>
          <textarea ref={editorRef} className={parseError && project.tracks[parseError.trackIndex]?.id === selectedTrack.id ? "has-error" : ""} spellCheck={false} value={selectedTrack.sourceText} onChange={(event) => updateTrack(selectedTrack.id, { sourceText: event.target.value })} onPaste={(event) => {
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
