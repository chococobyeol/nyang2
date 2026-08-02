export const PROJECT_STORAGE_KEY = "nyangnyang-mml-project-v1";

const TRACK_COLORS = ["#ef6b5a", "#e8ad45", "#5f9f8d", "#7b78b8", "#ca769b", "#5d87b6"];

export function createTrack(index, themeId = "nyang-voice") {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `track-${Date.now()}-${index}`,
    name: `Track ${index + 1}`,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    sourceText: index === 0 ? "t120o4l4v15" : "o4l4v15",
    themeId,
    mixerVolume: 1,
    recordVelocity: 15,
    muted: false,
    solo: false,
    pianoRollVisible: true,
  };
}

export function createProject(themeId = "nyang-voice") {
  const tracks = [createTrack(0, themeId), createTrack(1, themeId), createTrack(2, themeId)];
  return {
    format: "nyangmml",
    version: 1,
    title: "",
    tracks,
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    timeSignatureMap: [{ tick: 0, numerator: 4, denominator: 4 }],
    routing: { left: [tracks[0].id, tracks[1].id], right: [tracks[2].id] },
    recording: {
      mode: "realtime",
      editMode: "overwrite",
      pitchPriority: "high",
      quantize: "1/8",
      countIn: 1,
      metronome: true,
      metronomeVolume: 0.55,
      insertScope: "all",
      restKey: "KeyS",
      shortcuts: {
        play: "Alt+KeyP",
        record: "Alt+KeyR",
        stop: "Alt+KeyS",
      },
    },
    view: { selectedTrackId: tracks[0].id, loop: false, loopStart: 0, loopEnd: 384 },
  };
}

export function sanitizeProject(value, themeId = "nyang-voice") {
  if (!value || value.format !== "nyangmml" || !Array.isArray(value.tracks) || value.tracks.length === 0) {
    return createProject(themeId);
  }
  const fallback = createProject(themeId);
  const tracks = value.tracks.map((track, index) => ({
    ...createTrack(index, themeId),
    ...track,
    id: typeof track.id === "string" ? track.id : createTrack(index, themeId).id,
    name: typeof track.name === "string" ? track.name : `Track ${index + 1}`,
    sourceText: typeof track.sourceText === "string" ? track.sourceText : "",
  }));
  const ids = new Set(tracks.map((track) => track.id));
  const route = (side) => Array.isArray(value.routing?.[side]) ? value.routing[side].filter((id) => ids.has(id)) : [];
  return {
    ...fallback,
    ...value,
    format: "nyangmml",
    version: 1,
    tracks,
    routing: { left: route("left"), right: route("right") },
    recording: {
      ...fallback.recording,
      ...value.recording,
      shortcuts: { ...fallback.recording.shortcuts, ...value.recording?.shortcuts },
    },
    timeSignature: {
      numerator: Math.max(1, Number(value.timeSignature?.numerator) || 4),
      denominator: Math.max(1, Number(value.timeSignature?.denominator) || 4),
    },
    timeSignatureMap: Array.isArray(value.timeSignatureMap) && value.timeSignatureMap.length
      ? value.timeSignatureMap
        .map((marker) => ({
          tick: Math.max(0, Number(marker.tick) || 0),
          numerator: Math.max(1, Number(marker.numerator) || 4),
          denominator: Math.max(1, Number(marker.denominator) || 4),
        }))
        .sort((a, b) => a.tick - b.tick)
      : [{ tick: 0, numerator: Math.max(1, Number(value.timeSignature?.numerator) || 4), denominator: Math.max(1, Number(value.timeSignature?.denominator) || 4) }],
    view: {
      ...fallback.view,
      ...value.view,
      selectedTrackId: ids.has(value.view?.selectedTrackId) ? value.view.selectedTrackId : tracks[0].id,
    },
  };
}

export function projectFilename(project) {
  const title = project.title.trim().replace(/[\\/:*?"<>|]+/g, "-");
  if (title) return `${title}.nyangmml`;
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `nyangmml-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.nyangmml`;
}
