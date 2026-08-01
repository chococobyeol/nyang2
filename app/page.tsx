"use client";

/* eslint-disable @next/next/no-img-element */

import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type NoteLabelMode = "hidden" | "base" | "transposed";
type AccidentalStyle = "sharp" | "flat";
type KeyboardSide = "left" | "right";

type Settings = {
  keyboardCount: 1 | 2;
  octavePresets: [number, number, number, number];
  showLowerB: boolean;
  showUpperC: boolean;
  noteLabelMode: NoteLabelMode;
  accidentalStyle: AccidentalStyle;
  showKeyMapping: boolean;
  mobileLandscape: boolean;
  leftMapping: string[];
  rightMapping: string[];
  masterVolume: number;
  themeId: string;
  breathEnabled: boolean;
  microphoneSensitivity: number;
  breathGate: number;
};

type Theme = {
  id: string;
  name: string;
  description: string;
  waveform: OscillatorType;
  harmonic: OscillatorType;
  harmonicGain: number;
  accent: string;
  accentSoft: string;
  visuals: {
    pawPad: string;
    mouthClosed: string;
    mouthOpen: string;
    bodyMiddle: string;
    bodyEnd: string;
  };
};

type AudioGraph = {
  context: AudioContext;
  master: GainNode;
  breath: GainNode;
  compressor: DynamicsCompressorNode;
};

type Voice = {
  id: string;
  inputId: string;
  keyId: string;
  baseMidi: number;
  pitchClass: number;
  gain: GainNode;
  oscillators: OscillatorNode[];
  released: boolean;
  stopped: boolean;
};

type CaptureTarget = { side: KeyboardSide; index: number } | null;

const STORAGE_KEY = "nyangnyang-settings-v1";
const NOTE_OFFSETS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WHITE_OFFSETS = [-1, 0, 2, 4, 5, 7, 9, 11, 12];
const BLACK_OFFSETS = [1, 3, 6, 8, 10];
const LEFT_MAPPING = [
  "Digit1",
  "KeyQ",
  "Digit2",
  "KeyW",
  "Digit3",
  "KeyE",
  "KeyR",
  "Digit5",
  "KeyT",
  "Digit6",
  "KeyY",
  "Digit7",
  "KeyU",
  "KeyI",
];
const RIGHT_MAPPING = [
  "KeyX",
  "KeyC",
  "KeyF",
  "KeyV",
  "KeyG",
  "KeyB",
  "KeyN",
  "KeyJ",
  "KeyM",
  "KeyK",
  "Comma",
  "KeyL",
  "Period",
  "Slash",
];

const DEFAULT_SETTINGS: Settings = {
  keyboardCount: 1,
  octavePresets: [2, 3, 4, 5],
  showLowerB: true,
  showUpperC: true,
  noteLabelMode: "base",
  accidentalStyle: "sharp",
  showKeyMapping: true,
  mobileLandscape: true,
  leftMapping: LEFT_MAPPING,
  rightMapping: RIGHT_MAPPING,
  masterVolume: 0.72,
  themeId: "warm-cat",
  breathEnabled: false,
  microphoneSensitivity: 2.1,
  breathGate: 0.035,
};

const DEFAULT_VISUALS = {
  pawPad: "/assets/themes/default/pawpad.svg",
  mouthClosed: "/assets/themes/default/mouth-close.svg",
  mouthOpen: "/assets/themes/default/mouth-open.svg",
  bodyMiddle: "/assets/themes/default/body-middle.svg",
  bodyEnd: "/assets/themes/default/body-end.svg",
};

const THEMES: Theme[] = [
  {
    id: "warm-cat",
    name: "따뜻한 고양이",
    description: "부드러운 임시 피아노 음색",
    waveform: "triangle",
    harmonic: "sine",
    harmonicGain: 0.18,
    accent: "#ef6b5a",
    accentSoft: "#ffd9d2",
    visuals: DEFAULT_VISUALS,
  },
  {
    id: "glass-bell",
    name: "유리 방울",
    description: "맑고 가벼운 임시 음색",
    waveform: "sine",
    harmonic: "triangle",
    harmonicGain: 0.28,
    accent: "#3e8f98",
    accentSoft: "#ccebed",
    visuals: DEFAULT_VISUALS,
  },
  {
    id: "soft-organ",
    name: "말랑 오르간",
    description: "길고 포근한 임시 음색",
    waveform: "square",
    harmonic: "sine",
    harmonicGain: 0.12,
    accent: "#7769b5",
    accentSoft: "#ded8f5",
    visuals: DEFAULT_VISUALS,
  },
];

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function noteName(value: number, style: AccidentalStyle) {
  return (style === "sharp" ? SHARP_NAMES : FLAT_NAMES)[mod(value, 12)];
}

function codeLabel(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const labels: Record<string, string> = {
    Comma: ",",
    Period: ".",
    Slash: "/",
    Space: "Space",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
  };
  return labels[code] ?? code.replace(/^Numpad/, "Num ");
}

function sanitizeSettings(raw: unknown): Settings {
  const value = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  const presets = Array.isArray(value.octavePresets)
    ? value.octavePresets.slice(0, 4).map((item) => Math.max(0, Math.min(8, Number(item))))
    : DEFAULT_SETTINGS.octavePresets;
  while (presets.length < 4) presets.push(DEFAULT_SETTINGS.octavePresets[presets.length]);
  const validMapping = (candidate: unknown, fallback: string[]) =>
    Array.isArray(candidate) && candidate.length === NOTE_OFFSETS.length
      ? candidate.map((item, index) => (typeof item === "string" ? item : fallback[index]))
      : fallback;

  return {
    ...DEFAULT_SETTINGS,
    ...value,
    keyboardCount: value.keyboardCount === 2 ? 2 : 1,
    octavePresets: presets as Settings["octavePresets"],
    noteLabelMode: ["hidden", "base", "transposed"].includes(value.noteLabelMode ?? "")
      ? (value.noteLabelMode as NoteLabelMode)
      : DEFAULT_SETTINGS.noteLabelMode,
    accidentalStyle: value.accidentalStyle === "flat" ? "flat" : "sharp",
    leftMapping: validMapping(value.leftMapping, LEFT_MAPPING),
    rightMapping: validMapping(value.rightMapping, RIGHT_MAPPING),
    masterVolume: Math.max(0, Math.min(1, Number(value.masterVolume ?? DEFAULT_SETTINGS.masterVolume))),
    microphoneSensitivity: Math.max(
      0.5,
      Math.min(6, Number(value.microphoneSensitivity ?? DEFAULT_SETTINGS.microphoneSensitivity)),
    ),
    breathGate: Math.max(0.005, Math.min(0.2, Number(value.breathGate ?? DEFAULT_SETTINGS.breathGate))),
  };
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <span className={`toggle ${checked ? "is-on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="toggle-knob" />
      </span>
    </label>
  );
}

type KeyboardGroupProps = {
  side: KeyboardSide;
  octave: number;
  settings: Settings;
  mapping: string[];
  transpose: number;
  activeKeys: Set<string>;
  pawPad: string;
  onPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    side: KeyboardSide,
    offset: number,
  ) => void;
};

function KeyboardGroup({
  side,
  octave,
  settings,
  mapping,
  transpose,
  activeKeys,
  pawPad,
  onPointerDown,
}: KeyboardGroupProps) {
  const visibleWhites = WHITE_OFFSETS.filter(
    (offset) => (offset !== -1 || settings.showLowerB) && (offset !== 12 || settings.showUpperC),
  );

  const labelFor = (offset: number) => {
    if (settings.noteLabelMode === "hidden") return "";
    return noteName(
      settings.noteLabelMode === "transposed" ? offset + transpose : offset,
      settings.accidentalStyle,
    );
  };

  const mappingFor = (offset: number) => {
    const index = NOTE_OFFSETS.indexOf(offset);
    return index >= 0 ? codeLabel(mapping[index]) : "";
  };

  return (
    <div className="paw-keyboard-group" aria-label={`${side === "left" ? "왼쪽" : "오른쪽"} O${octave} 발바닥 음판`}>
      <div className="paw-row paw-row-natural">
        {visibleWhites.map((offset) => {
          const keyId = `${side}:${offset}`;
          const active = activeKeys.has(keyId);
          return (
            <button
              type="button"
              className={`paw-note paw-note-natural ${active ? "is-active" : ""}`}
              key={keyId}
              data-piano-key={keyId}
              data-side={side}
              data-offset={offset}
              aria-label={`${labelFor(offset) || noteName(offset, settings.accidentalStyle)} 음`}
              onPointerDown={(event) => onPointerDown(event, side, offset)}
            >
              <img className="paw-mark" src={pawPad} alt="" draggable={false} />
              <span className="key-labels">
                {settings.noteLabelMode !== "hidden" && <span className="note-label">{labelFor(offset)}</span>}
                {settings.showKeyMapping && <span className="mapping-label">{mappingFor(offset)}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="paw-row paw-row-accidental" aria-hidden="false">
        {BLACK_OFFSETS.map((offset) => {
          const previousWhiteOffset = offset === 1 ? 0 : offset === 3 ? 2 : offset === 6 ? 5 : offset === 8 ? 7 : 9;
          const previousIndex = visibleWhites.indexOf(previousWhiteOffset);
          if (previousIndex < 0) return null;
          const left = ((previousIndex + 1) / visibleWhites.length) * 100;
          const keyId = `${side}:${offset}`;
          const active = activeKeys.has(keyId);
          return (
            <button
              type="button"
              className={`paw-note paw-note-accidental ${active ? "is-active" : ""}`}
              style={{ left: `${left}%`, width: `${Math.min(10.5, 88 / visibleWhites.length)}%` }}
              key={keyId}
              data-piano-key={keyId}
              data-side={side}
              data-offset={offset}
              aria-label={`${labelFor(offset) || noteName(offset, settings.accidentalStyle)} 음`}
              onPointerDown={(event) => onPointerDown(event, side, offset)}
            >
              <img className="paw-mark" src={pawPad} alt="" draggable={false} />
              <span className="key-labels">
                {settings.noteLabelMode !== "hidden" && <span className="note-label">{labelFor(offset)}</span>}
                {settings.showKeyMapping && <span className="mapping-label">{mappingFor(offset)}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leftOctave, setLeftOctave] = useState(2);
  const [rightOctave, setRightOctave] = useState(3);
  const [transpose, setTranspose] = useState(0);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [sustainPressed, setSustainPressed] = useState(false);
  const [lastCatPitchClass, setLastCatPitchClass] = useState(11);
  const [mouthOpen, setMouthOpen] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState("");
  const [breathLevel, setBreathLevel] = useState(0);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>(null);
  const [mappingError, setMappingError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const settingsRef = useRef(settings);
  const leftOctaveRef = useRef(leftOctave);
  const rightOctaveRef = useRef(rightOctave);
  const transposeRef = useRef(transpose);
  const sustainRef = useRef(sustainPressed);
  const breathLevelRef = useRef(0);
  const captureRef = useRef<CaptureTarget>(null);
  const audioRef = useRef<AudioGraph | null>(null);
  const voicesRef = useRef<Map<string, Voice>>(new Map());
  const inputVoiceRef = useRef<Map<string, string>>(new Map());
  const voiceCounterRef = useRef(0);
  const activePointersRef = useRef<Map<number, string>>(new Map());
  const microphoneRef = useRef<{
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    frame: number;
  } | null>(null);

  const theme = useMemo(
    () => THEMES.find((candidate) => candidate.id === settings.themeId) ?? THEMES[0],
    [settings.themeId],
  );

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    leftOctaveRef.current = leftOctave;
  }, [leftOctave]);
  useEffect(() => {
    rightOctaveRef.current = rightOctave;
  }, [rightOctave]);
  useEffect(() => {
    transposeRef.current = transpose;
  }, [transpose]);
  useEffect(() => {
    sustainRef.current = sustainPressed;
  }, [sustainPressed]);
  useEffect(() => {
    captureRef.current = captureTarget;
  }, [captureTarget]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setSettings(sanitizeSettings(JSON.parse(saved)));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [hydrated, settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      const AudioContextCtor = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("이 브라우저에서는 오디오를 사용할 수 없습니다.");
      const context = new AudioContextCtor({ latencyHint: "interactive" });
      const master = context.createGain();
      const breath = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      breath.gain.value = settingsRef.current.breathEnabled ? 0 : 1;
      master.gain.value = settingsRef.current.masterVolume;
      breath.connect(master);
      master.connect(compressor);
      compressor.connect(context.destination);
      audioRef.current = { context, master, breath, compressor };

      // Mobile Safari needs an audio graph to start directly inside the first touch gesture.
      const unlockSource = context.createBufferSource();
      unlockSource.buffer = context.createBuffer(1, 1, context.sampleRate);
      unlockSource.connect(context.destination);
      unlockSource.start(0);
    }
    if (audioRef.current.context.state !== "running") {
      void audioRef.current.context.resume().catch(() => {
        // A later touch gesture retries the resume operation.
      });
    }
    setAudioReady(true);
    return audioRef.current;
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      try {
        initAudio();
      } catch {
        // Unsupported browsers are handled when a note is pressed.
      }
    };
    window.addEventListener("touchstart", unlockAudio, { passive: true, capture: true });
    return () => window.removeEventListener("touchstart", unlockAudio, { capture: true });
  }, [initAudio]);

  useEffect(() => {
    const graph = audioRef.current;
    if (!graph) return;
    graph.master.gain.setTargetAtTime(settings.masterVolume, graph.context.currentTime, 0.02);
  }, [settings.masterVolume]);

  const refreshVoiceUI = useCallback(() => {
    const voices = [...voicesRef.current.values()].filter((voice) => !voice.stopped);
    const pressed = new Set(voices.filter((voice) => !voice.released).map((voice) => voice.keyId));
    setActiveKeys(pressed);

    const canHearBreath = !settingsRef.current.breathEnabled || breathLevelRef.current > 0.012;
    const isSounding = voices.length > 0 && canHearBreath;
    setMouthOpen(isSounding);
    if (isSounding) {
      const highestBaseMidi = Math.max(...voices.map((voice) => voice.baseMidi));
      setLastCatPitchClass(mod(highestBaseMidi, 12));
    }
  }, []);

  const stopVoice = useCallback(
    (voice: Voice, immediate = false) => {
      if (voice.stopped) return;
      voice.stopped = true;
      const graph = audioRef.current;
      if (!graph) return;
      const now = graph.context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + (immediate ? 0.025 : 0.16));
      voice.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop(now + (immediate ? 0.04 : 0.2));
        } catch {
          // The oscillator may already be stopped.
        }
      });
      window.setTimeout(
        () => {
          voicesRef.current.delete(voice.id);
          refreshVoiceUI();
        },
        immediate ? 60 : 230,
      );
      refreshVoiceUI();
    },
    [refreshVoiceUI],
  );

  const releaseInput = useCallback(
    (inputId: string, force = false) => {
      const voiceId = inputVoiceRef.current.get(inputId);
      if (!voiceId) return;
      inputVoiceRef.current.delete(inputId);
      const voice = voicesRef.current.get(voiceId);
      if (!voice) return;
      voice.released = true;
      if (sustainRef.current && !force) {
        refreshVoiceUI();
        return;
      }
      stopVoice(voice, force);
    },
    [refreshVoiceUI, stopVoice],
  );

  const startNote = useCallback(
    (inputId: string, side: KeyboardSide, offset: number) => {
      releaseInput(inputId, true);
      let graph: AudioGraph;
      try {
        graph = initAudio();
      } catch {
        return;
      }

      const octave = side === "left" ? leftOctaveRef.current : rightOctaveRef.current;
      const baseMidi = 12 * (octave + 1) + offset;
      const soundingMidi = baseMidi + transposeRef.current;
      const rawFrequency = 440 * 2 ** ((soundingMidi - 69) / 12);
      const frequency = Number.isFinite(rawFrequency)
        ? Math.max(0.001, Math.min(graph.context.sampleRate * 8, rawFrequency))
        : rawFrequency > 0
          ? graph.context.sampleRate * 8
          : 0.001;
      const selectedTheme = THEMES.find((item) => item.id === settingsRef.current.themeId) ?? THEMES[0];
      const gain = graph.context.createGain();
      gain.gain.value = 0.0001;
      gain.connect(graph.breath);

      const primary = graph.context.createOscillator();
      primary.type = selectedTheme.waveform;
      primary.frequency.setValueAtTime(frequency, graph.context.currentTime);
      primary.connect(gain);

      const harmonic = graph.context.createOscillator();
      const harmonicGain = graph.context.createGain();
      harmonic.type = selectedTheme.harmonic;
      harmonic.frequency.setValueAtTime(Math.min(graph.context.sampleRate * 8, frequency * 2.003), graph.context.currentTime);
      harmonicGain.gain.value = selectedTheme.harmonicGain;
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);

      const now = graph.context.currentTime;
      const peak = selectedTheme.id === "soft-organ" ? 0.17 : 0.24;
      const sustain = selectedTheme.id === "glass-bell" ? 0.035 : selectedTheme.id === "soft-organ" ? 0.105 : 0.07;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(sustain, now + (selectedTheme.id === "glass-bell" ? 1.2 : 0.8));

      primary.start(now);
      harmonic.start(now);

      const voiceId = `voice-${++voiceCounterRef.current}`;
      const voice: Voice = {
        id: voiceId,
        inputId,
        keyId: `${side}:${offset}`,
        baseMidi,
        pitchClass: mod(baseMidi, 12),
        gain,
        oscillators: [primary, harmonic],
        released: false,
        stopped: false,
      };
      voicesRef.current.set(voiceId, voice);
      inputVoiceRef.current.set(inputId, voiceId);
      refreshVoiceUI();
    },
    [initAudio, refreshVoiceUI, releaseInput],
  );

  const allNotesOff = useCallback(() => {
    inputVoiceRef.current.clear();
    activePointersRef.current.clear();
    voicesRef.current.forEach((voice) => stopVoice(voice, true));
    setSustainPressed(false);
    sustainRef.current = false;
  }, [stopVoice]);

  const setSustain = useCallback(
    (pressed: boolean) => {
      sustainRef.current = pressed;
      setSustainPressed(pressed);
      if (!pressed) {
        voicesRef.current.forEach((voice) => {
          if (voice.released) stopVoice(voice);
        });
      }
    },
    [stopVoice],
  );

  const sideAndOffsetForCode = useCallback((code: string) => {
    const current = settingsRef.current;
    const leftIndex = current.leftMapping.indexOf(code);
    if (leftIndex >= 0) return { side: "left" as const, offset: NOTE_OFFSETS[leftIndex] };
    if (current.keyboardCount === 2) {
      const rightIndex = current.rightMapping.indexOf(code);
      if (rightIndex >= 0) return { side: "right" as const, offset: NOTE_OFFSETS[rightIndex] };
    }
    return null;
  }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = captureRef.current;
      if (target) {
        event.preventDefault();
        if (event.code === "Escape") {
          setCaptureTarget(null);
          setMappingError("");
          return;
        }
        const current = settingsRef.current;
        const allCodes = [...current.leftMapping, ...current.rightMapping];
        const oldCode = target.side === "left" ? current.leftMapping[target.index] : current.rightMapping[target.index];
        if (allCodes.includes(event.code) && event.code !== oldCode) {
          setMappingError(`${codeLabel(event.code)} 키는 이미 다른 음에 사용 중입니다.`);
          return;
        }
        const key = target.side === "left" ? "leftMapping" : "rightMapping";
        const next = [...current[key]];
        next[target.index] = event.code;
        updateSettings({ [key]: next } as Partial<Settings>);
        setCaptureTarget(null);
        setMappingError("");
        return;
      }
      if (isTypingTarget(event.target) || event.repeat) return;
      if (event.code === "Space") {
        event.preventDefault();
        setSustain(true);
        return;
      }
      const mapped = sideAndOffsetForCode(event.code);
      if (!mapped) return;
      event.preventDefault();
      void startNote(`keyboard:${event.code}`, mapped.side, mapped.offset);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setSustain(false);
        return;
      }
      releaseInput(`keyboard:${event.code}`);
    };

    const handleBlur = () => allNotesOff();
    const handleVisibility = () => {
      if (document.hidden) allNotesOff();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [allNotesOff, releaseInput, setSustain, sideAndOffsetForCode, startNote, updateSettings]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, side: KeyboardSide, offset: number) => {
      event.preventDefault();
      const inputId = `pointer:${event.pointerId}`;
      const keyId = `${side}:${offset}`;
      activePointersRef.current.set(event.pointerId, keyId);
      void startNote(inputId, side, offset);
    },
    [startNote],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!activePointersRef.current.has(event.pointerId)) return;
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-piano-key]");
      const inputId = `pointer:${event.pointerId}`;
      if (!element) {
        releaseInput(inputId);
        activePointersRef.current.set(event.pointerId, "");
        return;
      }
      const keyId = element.dataset.pianoKey ?? "";
      if (activePointersRef.current.get(event.pointerId) === keyId) return;
      const side = element.dataset.side as KeyboardSide;
      const offset = Number(element.dataset.offset);
      activePointersRef.current.set(event.pointerId, keyId);
      void startNote(inputId, side, offset);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (!activePointersRef.current.has(event.pointerId)) return;
      releaseInput(`pointer:${event.pointerId}`);
      activePointersRef.current.delete(event.pointerId);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [releaseInput, startNote]);

  const stopMicrophone = useCallback(() => {
    const microphone = microphoneRef.current;
    if (microphone) {
      cancelAnimationFrame(microphone.frame);
      microphone.source.disconnect();
      microphone.stream.getTracks().forEach((track) => track.stop());
      microphoneRef.current = null;
    }
    setMicActive(false);
    setBreathLevel(0);
    breathLevelRef.current = 0;
    const graph = audioRef.current;
    if (graph) {
      graph.breath.gain.setTargetAtTime(settingsRef.current.breathEnabled ? 0 : 1, graph.context.currentTime, 0.02);
    }
    refreshVoiceUI();
  }, [refreshVoiceUI]);

  const startMicrophone = useCallback(async () => {
    setMicError("");
    try {
      const graph = await initAudio();
      stopMicrophone();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const source = graph.context.createMediaStreamSource(stream);
      const analyser = graph.context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let smooth = 0;
      let lastUiUpdate = 0;

      const tick = (time: number) => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
        const rms = Math.sqrt(sum / data.length) * settingsRef.current.microphoneSensitivity;
        const gate = settingsRef.current.breathGate;
        const normalized = Math.max(0, Math.min(1, (rms - gate) / Math.max(0.04, 0.32 - gate)));
        smooth = smooth * 0.72 + normalized * 0.28;
        if (smooth < 0.008) smooth = 0;
        breathLevelRef.current = smooth;
        graph.breath.gain.setTargetAtTime(smooth, graph.context.currentTime, 0.018);
        if (time - lastUiUpdate > 70) {
          setBreathLevel(smooth);
          refreshVoiceUI();
          lastUiUpdate = time;
        }
        const current = microphoneRef.current;
        if (current) current.frame = requestAnimationFrame(tick);
      };
      microphoneRef.current = { stream, source, analyser, frame: requestAnimationFrame(tick) };
      setMicActive(true);
    } catch {
      setMicError("마이크를 연결하지 못했습니다. 브라우저 권한을 확인해주세요.");
      setMicActive(false);
      updateSettings({ breathEnabled: false });
      const graph = audioRef.current;
      if (graph) graph.breath.gain.setTargetAtTime(1, graph.context.currentTime, 0.02);
    }
  }, [initAudio, refreshVoiceUI, stopMicrophone, updateSettings]);

  useEffect(() => () => stopMicrophone(), [stopMicrophone]);

  const toggleBreath = useCallback(
    async (enabled: boolean) => {
      updateSettings({ breathEnabled: enabled });
      if (enabled) await startMicrophone();
      else stopMicrophone();
    },
    [startMicrophone, stopMicrophone, updateSettings],
  );

  const selectTheme = useCallback(
    (themeId: string) => {
      allNotesOff();
      updateSettings({ themeId });
    },
    [allNotesOff, updateSettings],
  );

  const updatePreset = useCallback(
    (index: number, value: number) => {
      const nextValue = Math.max(0, Math.min(8, Math.round(value)));
      setSettings((current) => {
        const previousValue = current.octavePresets[index];
        const next = [...current.octavePresets] as Settings["octavePresets"];
        next[index] = nextValue;
        if (leftOctaveRef.current === previousValue) setLeftOctave(nextValue);
        if (rightOctaveRef.current === previousValue) setRightOctave(nextValue);
        return { ...current, octavePresets: next };
      });
    },
    [],
  );

  const resetSettings = useCallback(() => {
    if (!window.confirm("모든 설정을 기본값으로 되돌릴까요?")) return;
    stopMicrophone();
    allNotesOff();
    window.localStorage.removeItem(STORAGE_KEY);
    setSettings(DEFAULT_SETTINGS);
    setLeftOctave(2);
    setRightOctave(3);
    setTranspose(0);
    setLastCatPitchClass(11);
    setMouthOpen(false);
    setMappingError("");
    setCaptureTarget(null);
  }, [allNotesOff, stopMicrophone]);

  const resetTranspose = useCallback(() => {
    allNotesOff();
    setTranspose(0);
  }, [allNotesOff]);

  const segmentCount = 11 - lastCatPitchClass;
  const currentKey = noteName(transpose, settings.accidentalStyle);
  const catNote = noteName(lastCatPitchClass, settings.accidentalStyle);
  const appStyle = {
    "--accent": theme.accent,
    "--accent-soft": theme.accentSoft,
  } as CSSProperties;

  const renderOctavePanel = (side: KeyboardSide) => {
    const selected = side === "left" ? leftOctave : rightOctave;
    const setter = side === "left" ? setLeftOctave : setRightOctave;
    return (
      <section className="octave-panel" aria-label={`${side === "left" ? "왼쪽" : "오른쪽"} 옥타브 선택`}>
        <div className="panel-eyebrow">{side === "left" ? "왼쪽 옥타브" : "오른쪽 옥타브"}</div>
        <div className="octave-buttons">
          {settings.octavePresets.map((octave, index) => (
            <button
              type="button"
              className={`control-button octave-button ${selected === octave ? "is-selected" : ""}`}
              key={`${side}-${index}-${octave}`}
              onClick={() => setter(octave)}
              aria-pressed={selected === octave}
            >
              <span>O</span>{octave}
            </button>
          ))}
        </div>
      </section>
    );
  };

  const mappingEditor = (side: KeyboardSide) => {
    const mapping = side === "left" ? settings.leftMapping : settings.rightMapping;
    return (
      <div className="mapping-editor">
        {NOTE_OFFSETS.map((offset, index) => {
          const isCapture = captureTarget?.side === side && captureTarget.index === index;
          return (
            <button
              type="button"
              className={`mapping-chip ${isCapture ? "is-capturing" : ""}`}
              key={`${side}-map-${offset}`}
              onClick={() => {
                setCaptureTarget({ side, index });
                setMappingError("");
              }}
            >
              <span>{noteName(offset, settings.accidentalStyle)}</span>
              <strong>{isCapture ? "키 입력…" : codeLabel(mapping[index])}</strong>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <main className={`app-viewport ${settings.mobileLandscape ? "force-mobile-landscape" : ""}`} style={appStyle} onContextMenu={(event) => event.preventDefault()}>
      <div className="app-stage">
        <header className="top-bar">
          <div className="brand-block">
            <div className="brand-mark"><img src={theme.visuals.pawPad} alt="" /></div>
            <div>
              <h1>냥냥</h1>
            </div>
          </div>

          <div className={`octave-area ${settings.keyboardCount === 2 ? "is-double" : ""}`}>
            {renderOctavePanel("left")}
            {settings.keyboardCount === 2 && renderOctavePanel("right")}
          </div>

          <section className="transpose-panel" aria-label="전조 조절">
            <div className="transpose-status">
              <span>KEY</span>
              <strong>{currentKey}</strong>
              <small>{transpose > 0 ? `+${transpose}` : transpose} ST</small>
            </div>
            <div className="transpose-grid">
              <button type="button" className="control-button" onClick={() => setTranspose((value) => value - 1)}>
                <span>−1</span><small>반음</small>
              </button>
              <button type="button" className="control-button" onClick={() => setTranspose((value) => value + 1)}>
                <span>+1</span><small>반음</small>
              </button>
              <button type="button" className="control-button" onClick={() => setTranspose((value) => value - 7)}>
                <span>−5th</span><small>완전5도</small>
              </button>
              <button type="button" className="control-button" onClick={() => setTranspose((value) => value + 7)}>
                <span>+5th</span><small>완전5도</small>
              </button>
            </div>
            <button type="button" className="transpose-reset control-button" onClick={resetTranspose} aria-label="조성을 C로 초기화">
              <span aria-hidden="true">↺</span>
              <small>초기화</small>
            </button>
          </section>

          <div className="header-actions">
            {settings.breathEnabled && (
              <button
                type="button"
                className={`mic-status ${micActive ? "is-active" : ""}`}
                onClick={() => (micActive ? stopMicrophone() : void startMicrophone())}
              >
                <span className="mic-dot" />
                {micActive ? "바람 연결됨" : "마이크 연결"}
              </button>
            )}
            <button type="button" className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="설정 열기">
              <span aria-hidden="true">⚙</span>
              설정
            </button>
          </div>
        </header>

        <section className={`cat-zone ${settings.breathEnabled ? "has-breath" : ""}`} aria-label={`고양이 길이 ${catNote}, ${segmentCount + 1}단계`}>
          <div className="cat-track">
            <div className="cat-assembly" aria-hidden="true">
              <img className="cat-mouth" src={mouthOpen ? theme.visuals.mouthOpen : theme.visuals.mouthClosed} alt="" draggable={false} />
              {Array.from({ length: segmentCount }, (_, index) => (
                <img className="cat-middle" src={theme.visuals.bodyMiddle} alt="" draggable={false} key={`segment-${index}`} />
              ))}
              <img className="cat-end" src={theme.visuals.bodyEnd} alt="" draggable={false} />
            </div>
          </div>
          {settings.breathEnabled && (
            <div className="breath-meter" aria-label={`바람 세기 ${Math.round(breathLevel * 100)}퍼센트`}>
              <span>BREATH</span>
              <div><i style={{ width: `${breathLevel * 100}%` }} /></div>
            </div>
          )}
        </section>

        <section className={`keyboard-deck ${settings.keyboardCount === 2 ? "is-double" : ""}`} aria-label="발바닥 음판">
          <KeyboardGroup
            side="left"
            octave={leftOctave}
            settings={settings}
            mapping={settings.leftMapping}
            transpose={transpose}
            activeKeys={activeKeys}
            pawPad={theme.visuals.pawPad}
            onPointerDown={handlePointerDown}
          />
          {settings.keyboardCount === 2 && (
            <KeyboardGroup
              side="right"
              octave={rightOctave}
              settings={settings}
              mapping={settings.rightMapping}
              transpose={transpose}
              activeKeys={activeKeys}
              pawPad={theme.visuals.pawPad}
              onPointerDown={handlePointerDown}
            />
          )}
        </section>

        <footer className="performance-footer">
          <span className={audioReady ? "is-ready" : ""}>{audioReady ? "● AUDIO READY" : "첫 건반을 누르면 오디오가 시작됩니다"}</span>
          <span className={sustainPressed ? "sustain-on" : ""}>SPACE · SUSTAIN {sustainPressed ? "ON" : ""}</span>
          <button type="button" onClick={allNotesOff}>모든 음 끄기</button>
        </footer>
      </div>

      {settingsOpen && (
        <div className="settings-overlay" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setSettingsOpen(false);
        }}>
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-header">
              <div>
                <span>냥냥</span>
                <h2 id="settings-title">연주 설정</h2>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="설정 닫기">×</button>
            </div>

            <div className="settings-content">
              <section className="settings-section">
                <div className="settings-section-title"><span>01</span><h3>건반과 옥타브</h3></div>
                <Toggle
                  checked={settings.keyboardCount === 2}
                  onChange={(checked) => updateSettings({ keyboardCount: checked ? 2 : 1 })}
                  label="건반 한 세트 추가"
                />
                <Toggle checked={settings.showLowerB} onChange={(checked) => updateSettings({ showLowerB: checked })} label="낮은 B 표시" />
                <Toggle checked={settings.showUpperC} onChange={(checked) => updateSettings({ showUpperC: checked })} label="높은 C 표시" />
                <Toggle checked={settings.mobileLandscape} onChange={(checked) => updateSettings({ mobileLandscape: checked })} label="휴대폰 세로 화면을 가로로 표시" />
                <div className="setting-field">
                  <label>옥타브 선택 버튼</label>
                  <div className="preset-inputs">
                    {settings.octavePresets.map((value, index) => (
                      <label key={`preset-${index}`}><span>O</span><input type="number" min="0" max="8" value={value} onChange={(event) => updatePreset(index, Number(event.target.value))} /></label>
                    ))}
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-title"><span>02</span><h3>건반 표시</h3></div>
                <div className="setting-field">
                  <label htmlFor="note-label-mode">음 이름</label>
                  <select id="note-label-mode" value={settings.noteLabelMode} onChange={(event) => updateSettings({ noteLabelMode: event.target.value as NoteLabelMode })}>
                    <option value="hidden">표시하지 않음</option>
                    <option value="base">건반의 기본 음</option>
                    <option value="transposed">전조된 실제 음</option>
                  </select>
                </div>
                <div className="segmented-setting" aria-label="임시표 표기">
                  <button type="button" className={settings.accidentalStyle === "sharp" ? "is-selected" : ""} onClick={() => updateSettings({ accidentalStyle: "sharp" })}>샵 ♯</button>
                  <button type="button" className={settings.accidentalStyle === "flat" ? "is-selected" : ""} onClick={() => updateSettings({ accidentalStyle: "flat" })}>플랫 ♭</button>
                </div>
                <Toggle checked={settings.showKeyMapping} onChange={(checked) => updateSettings({ showKeyMapping: checked })} label="키 매핑 문자 표시" />
              </section>

              <section className="settings-section">
                <div className="settings-section-title"><span>03</span><h3>소리와 음색</h3></div>
                <div className="setting-field range-field">
                  <label htmlFor="master-volume">전체 음량 <strong>{Math.round(settings.masterVolume * 100)}%</strong></label>
                  <input id="master-volume" type="range" min="0" max="1" step="0.01" value={settings.masterVolume} onChange={(event) => updateSettings({ masterVolume: Number(event.target.value) })} />
                </div>
                <div className="theme-grid">
                  {THEMES.map((item) => (
                    <button type="button" className={settings.themeId === item.id ? "is-selected" : ""} key={item.id} onClick={() => selectTheme(item.id)}>
                      <i style={{ background: item.accent }} />
                      <span><strong>{item.name}</strong><small>{item.description}</small></span>
                    </button>
                  ))}
                </div>
                <p className="setting-note">현재 음색은 제공될 샘플 음원으로 교체하기 전의 테스트용입니다.</p>
              </section>

              <section className="settings-section">
                <div className="settings-section-title"><span>04</span><h3>불어서 연주</h3></div>
                <Toggle checked={settings.breathEnabled} onChange={(checked) => void toggleBreath(checked)} label="마이크로 음량 제어" />
                {settings.breathEnabled && (
                  <>
                    <div className="setting-field range-field">
                      <label htmlFor="mic-sensitivity">마이크 감도 <strong>{settings.microphoneSensitivity.toFixed(1)}×</strong></label>
                      <input id="mic-sensitivity" type="range" min="0.5" max="6" step="0.1" value={settings.microphoneSensitivity} onChange={(event) => updateSettings({ microphoneSensitivity: Number(event.target.value) })} />
                    </div>
                    <div className="setting-field range-field">
                      <label htmlFor="breath-gate">바람 인식 최소 세기 <strong>{Math.round(settings.breathGate * 1000)}</strong></label>
                      <input id="breath-gate" type="range" min="0.005" max="0.2" step="0.005" value={settings.breathGate} onChange={(event) => updateSettings({ breathGate: Number(event.target.value) })} />
                    </div>
                    <div className="live-meter"><span style={{ width: `${breathLevel * 100}%` }} /></div>
                    {!micActive && <button type="button" className="connect-mic-button" onClick={() => void startMicrophone()}>마이크 연결</button>}
                    {micError && <p className="error-message">{micError}</p>}
                    <p className="setting-note">음높이 분석 없이 바람의 세기만 가볍게 측정합니다.</p>
                  </>
                )}
              </section>

              <section className="settings-section">
                <div className="settings-section-title"><span>05</span><h3>컴퓨터 키 매핑</h3></div>
                <p className="setting-note">바꾸려는 키를 누른 다음 새 키를 입력하세요. 숨긴 건반의 매핑도 계속 작동합니다.</p>
                <details open>
                  <summary>왼쪽 건반</summary>
                  {mappingEditor("left")}
                </details>
                <details>
                  <summary>오른쪽 건반</summary>
                  {mappingEditor("right")}
                </details>
                {mappingError && <p className="error-message">{mappingError}</p>}
              </section>

              <section className="settings-section danger-section">
                <div><strong>설정 초기화</strong><p>저장된 설정을 지우고 기본값으로 돌아갑니다.</p></div>
                <button type="button" onClick={resetSettings}>초기화</button>
              </section>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
