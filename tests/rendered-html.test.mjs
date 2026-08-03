import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { chooseSecondKeyboardOctave } from "../app/octave-selection.js";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished nyangnyang app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>냥냥<\/title>/i);
  assert.match(html, /<h1>냥냥<\/h1>/i);
  assert.match(html, /왼쪽 옥타브/);
  assert.match(html, /발바닥 음판/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("ships the tuned E4 nyang sample with conditional tail-only reverb", async () => {
  const audioRoot = new URL("../public/audio/nyang/", import.meta.url);
  const expectedFiles = ["e4.mp3"];
  const [page, layout, files] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readdir(audioRoot),
  ]);

  assert.deepEqual(files.sort(), expectedFiles);
  for (const file of expectedFiles) {
    const details = await stat(new URL(file, audioRoot));
    assert.ok(details.size > 10_000, `${file} should contain an encoded sample`);
  }

  assert.match(page, /const NYANG_SAMPLE = \{ midi: 64/);
  assert.match(page, /themeId: "nyang-voice"/);
  assert.match(page, /name: "냥 보이스"/);
  assert.match(page, /description: "냥\.\."/);
  assert.doesNotMatch(page, /직접 녹음한 진짜 냥 소리/);
  assert.match(page, /name: "포근 신스"/);
  assert.match(page, /createBufferSource\(\)/);
  assert.match(page, /source\.playbackRate/);
  assert.doesNotMatch(page, /source\.loop = true/);
  assert.match(page, /triggerSampleTail/);
  assert.match(page, /sustainLatched: boolean/);
  assert.match(page, /if \(!state\.sustainLatched\) \{\s*stopVoice\(voice, true\)/);
  assert.doesNotMatch(page, /heldLong/);
  assert.match(page, /voice\.released && \(!voice\.sampleState \|\| voice\.sampleState\.sustainLatched\)/);
  assert.match(page, /createConvolver\(\)/);
  assert.match(page, /NYANG_LONG_PRESS_MS/);
  assert.match(page, /const \[leftOctave, setLeftOctave\] = useState\(4\)/);
  assert.match(page, /const \[rightOctave, setRightOctave\] = useState\(5\)/);
  assert.match(layout, /title:\s*"냥냥"/);
  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
});

test("publishes a privacy policy and links it from settings", async () => {
  const [response, page] = await Promise.all([
    render("/privacy"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /개인정보처리방침/);
  assert.match(html, /마이크 소리는 기기 안에서만 실시간으로 처리/);
  assert.match(html, /기기 저장 공간에만 보관/);
  assert.match(html, /마지막 MML 프로젝트·편집 기록/);
  assert.match(html, /Cloudflare/);
  assert.match(html, /mailto:chaamu\.channel@gmail\.com/);
  assert.doesNotMatch(html, /github\.com\/chococobyeol\/nyang2\/issues/);
  assert.match(page, /href="\/privacy"/);
  assert.doesNotMatch(page, /기기 저장 설정과 마이크 처리 방식을 확인/);
});

test("includes the MML studio without changing the public route", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /MmlStudio/);
  assert.match(page, /불어서 연주를 끄고 MML을 열까요/);
  assert.match(page, /className="brand-mark"/);
  assert.match(page, /건반 설정/);
  assert.match(page, /MML 설정/);
  assert.match(css, /\.mml-open \.app-stage/);
  assert.match(css, /\.mml-studio/);
});

test("keeps the MML workspace text readable in the split layout", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.mml-project-title input \{[^}]*font-size: 18px;/s);
  assert.match(css, /\.mml-transport button \{[^}]*font-size: 13px;/s);
  assert.match(css, /\.mml-track-card strong \{\s*font-size: 12px;/s);
  assert.match(css, /\.mml-work-area textarea \{[^}]*font-size: 15px;/s);
  assert.match(css, /\.mml-status-line \{[^}]*font-size: 10px;/s);
  assert.match(css, /\.mml-quick-settings input,[^}]*font-size: 12px;/s);
});

test("keeps the time-signature preset and direct inputs in one settings cell", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /className="mml-meter-setting"/);
  assert.match(studio, /className="mml-meter-controls"/);
  assert.match(studio, /aria-label="박자표 선택"/);
  assert.match(studio, /aria-label="박자 분자"/);
  assert.match(studio, /aria-label="박자 분모"/);
  assert.match(css, /\.mml-meter-controls \{[^}]*grid-template-columns: minmax\(0, 1fr\) 116px;/s);
});

test("aligns compact octave, key, and settings controls", async () => {
  const [css, page] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.octave-buttons \{[^}]*repeat\(4, minmax\(0, 64px\)\)/s);
  assert.match(css, /\.octave-button \{[^}]*aspect-ratio: 1;/s);
  assert.match(css, /\.octave-panel \{[^}]*grid-template-rows: auto 64px;[^}]*gap: 6px;/s);
  assert.match(css, /\.transpose-panel \{[^}]*height: 64px;[^}]*margin-top: 15px;/s);
  assert.match(css, /\.transpose-panel \{[^}]*height: 64px/s);
  assert.match(css, /\.settings-button \{[^}]*height: 64px/s);
  assert.match(css, /\.transpose-panel \{[^}]*height: 42px/s);
  assert.match(css, /\.transpose-grid \{\s*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);[^}]*height: 42px/s);
  assert.match(css, /\.settings-button \{[^}]*height: 42px/s);
  assert.match(css, /\.transpose-status \{\s*min-height: 0;\s*height: 100%/);
  assert.match(css, /\.transpose-grid button \{\s*display: flex;\s*align-items: center;\s*justify-content: center;/);
  assert.match(page, /settings\.keyboardCount === 1\s*\? "옥타브"/);
  assert.match(page, /side === "left" \? "왼쪽 옥타브" : "오른쪽 옥타브"/);
});

test("renders the optional lower B and upper C at accidental-key scale", async () => {
  const [css, page] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const edgeNote = offset === -1 \|\| offset === 12;/);
  assert.match(page, /edgeNote \? "is-edge-note" : ""/);
  assert.match(css, /\.paw-note-natural\.is-edge-note \{\s*--edge-note-shift: 0%;\s*transform: translateX\(var\(--edge-note-shift\)\) scale\(0\.72\);/);
  assert.match(css, /\.paw-note-natural\.is-edge-note:first-child \{\s*--edge-note-shift: 14%;/);
  assert.match(css, /\.paw-note-natural\.is-edge-note:last-child \{\s*--edge-note-shift: -14%;/);
  assert.match(css, /\.paw-note-natural\.is-edge-note\.is-active \{\s*transform: translateX\(var\(--edge-note-shift\)\) translateY\(5px\) scale\(0\.64\);/);
});

test("keeps the selected left octave and opens the second keyboard on octave five", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const rightPresets = settingsRef\.current\.rightOctavePresets;/);
  assert.match(page, /setRightOctave\(chooseSecondKeyboardOctave\(rightPresets\)\);/);
  assert.doesNotMatch(page, /setRightOctave\(Math\.min\(8, leftOctaveRef\.current \+ 1\)\)/);
  assert.equal(chooseSecondKeyboardOctave([3, 4, 5, 6]), 5);
  assert.equal(chooseSecondKeyboardOctave([1, 2, 4, 6]), 1);
});

test("keeps the live recording playhead independent from quantized note previews", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(studio, /setPlayhead\(visibleTick\)/);
  assert.match(studio, /const elapsedTick = recordingStartTickRef\.current[\s\S]*?setPlayhead\(tick\)/);
  assert.match(studio, /liveNotesEndTick\(nextLiveNotes, elapsedTick\)/);
  assert.match(studio, /if \(!playing && recordState !== "recording"\) return/);
  assert.match(studio, /\[pianoPixelsPerTick, playhead, playing, recordState\]/);
  assert.match(studio, /appendLegatoContinuation\([\s\S]*?appendWallStartRef\.current = at/);
  assert.match(studio, /syncedPlaybackStartAt\(project\.recording\.metronome, metronomeClockRef\.current, now\)/);
  assert.match(studio, /playbackWait \+ endSeconds - startSeconds/);
  assert.match(studio, /aria-label="맨앞으로 이동"/);
  assert.match(studio, /const seekPlayhead = \(tick: number\)[\s\S]*?nextTick \* pianoPixelsPerTick/);
  assert.match(studio, /adjacentMeasureTick\(timelineGrid\.measures, playheadRef\.current, -1, songDuration\)/);
  assert.match(studio, /adjacentMeasureTick\(timelineGrid\.measures, playheadRef\.current, 1, songDuration\)/);
  assert.match(studio, /aria-label="맨뒤로 이동"/);
  assert.match(studio, /onClick=\{toggleMetronome\}/);
  assert.doesNotMatch(studio, /startRecordingMetronome/);
  assert.match(studio, /is-live-recording/);
});

test("pre-schedules playback notes on the same audio clock as the metronome", async () => {
  const [studio, page] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /playMidi\(item\.sourceId,[\s\S]*?delaySeconds\)/);
  assert.doesNotMatch(studio, /setTimeout\(\(\) => playMidi/);
  assert.match(page, /audioDelaySeconds\?: number/);
  assert.match(page, /scheduledStartAt = graph\.context\.currentTime \+ Math\.max\(0, options\.audioDelaySeconds \?\? 0\)/);
  assert.match(page, /const now = Math\.max\(graph\.context\.currentTime, scheduledStartAt\)/);
});

test("provides direct track controls, timeline zoom, and full-screen composing", async () => {
  const [page, studio, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /onWheel=\{zoomTimelineWithWheel\}/);
  assert.match(studio, /if \(!event\.altKey\) return/);
  assert.match(studio, /nativeEvent\.wheelDeltaY \?\? nativeEvent\.wheelDelta/);
  assert.match(studio, /normalizedWheelSteps\(delta, event\.deltaMode, event\.currentTarget\.clientHeight, windowsWheelDelta\)/);
  assert.match(studio, /consumeWheelSteps\(state\.timelineSteps\)/);
  assert.match(studio, /window\.requestAnimationFrame\(animateWheelZoom\)/);
  assert.match(studio, /timelineZoomAnchorRef/);
  assert.match(studio, /useLayoutEffect\(\(\) => \{[\s\S]*?roll\.scrollLeft/);
  assert.match(studio, /if \(event\.shiftKey\)[\s\S]*?state\.pitchSteps/);
  assert.match(studio, /title="Alt\+휠 시간축 · Alt\+Shift\+휠 음정 간격"/);
  assert.match(studio, /const minMidi = Math\.min\(12, \.\.\.visibleMidi\)/);
  assert.match(studio, /const maxMidi = Math\.max\(108, \.\.\.visibleMidi\)/);
  assert.match(studio, /const PIANO_PITCH_ROW_HEIGHT = 12/);
  assert.match(studio, /const \[pitchZoom, setPitchZoom\] = useState\(1\)/);
  assert.match(studio, /const pianoHeight = \(maxMidi - minMidi \+ 1\) \* pixelsPerPitch/);
  assert.match(studio, /roll\.scrollTop = Math\.max\(0,/);
  assert.match(studio, /aria-label="타임라인 축소"/);
  assert.match(studio, /aria-label="타임라인 확대"/);
  assert.match(studio, /aria-label="음정 간격 축소"/);
  assert.match(studio, /aria-label="음정 간격 확대"/);
  assert.match(studio, /aria-label=\{expanded \? "작곡창 축소" : "작곡창 전체화면"\}/);
  assert.match(studio, /onDoubleClick=\{\(\) => \{ selectTrack\(track\.id\); setTrackSettingsView\(true\)/);
  assert.match(studio, /className="mml-track-actions"/);
  assert.match(studio, /className="mml-track-route-actions"/);
  assert.match(studio, /className="mml-track-play-actions"/);
  assert.match(studio, /className=\{`mml-track-visibility/);
  assert.match(studio, /aria-label="왼쪽 건반 연결"/);
  assert.match(studio, /aria-label="오른쪽 건반 연결"/);
  assert.match(studio, /aria-label="음소거"/);
  assert.match(studio, /aria-label="솔로"/);
  assert.match(studio, /className="mml-track-add-button"/);
  assert.doesNotMatch(studio, /<span>건반 연결<\/span>/);
  assert.doesNotMatch(studio, /<span>재생<\/span>/);
  assert.match(page, /event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey/);
  assert.match(page, /mmlExpanded \? "mml-expanded"/);
  assert.match(page, /expanded=\{mmlExpanded\}/);
  assert.match(css, /\.mml-expanded \.performance-surface \{[^}]*visibility: hidden;[^}]*pointer-events: none;/s);
  assert.match(css, /\.mml-zoom-controls/);
  assert.match(css, /\.mml-track-route-actions \{\s*grid-template-columns: repeat\(2, 28px\);/s);
  assert.match(css, /\.mml-track-play-actions \{\s*grid-template-columns: repeat\(3, 18px\);/s);
  assert.match(css, /\.mml-track-visibility span \{[^}]*width: 14px;[^}]*height: 9px;/s);
  assert.match(css, /\.mml-track-visibility\.is-hidden::after/);
});

test("defaults repeat to the whole song and presents repeat positions as measures", async () => {
  const [studio, project] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mml/project.js", import.meta.url), "utf8"),
  ]);
  assert.match(project, /loopStart: 0, loopEnd: 0/);
  assert.match(project, /Number\(value\.version\) < 5[\s\S]*?view\.loopEnd = 0/);
  assert.match(studio, /반복 시작 마디/);
  assert.match(studio, /반복 끝 마디/);
  assert.match(studio, /project\.view\.loopEnd > loopStartTick[\s\S]*?: songDuration/);
});

test("supports selection-based MML duration editing and Space playback", async () => {
  const [page, studio] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /onContextMenu=\{\(event\) => \{/);
  assert.match(studio, /setSelectedMmlLength/);
  assert.match(studio, /event\.code === "Comma" \|\| event\.code === "Period"/);
  assert.match(studio, /play: "Space"/);
  assert.match(studio, /matchesShortcut\(event, shortcuts\.play\)/);
  assert.match(studio, /shortcutLabel\(recordingShortcuts\.play\)/);
  assert.match(studio, /event\.stopPropagation\(\)/);
  assert.match(studio, /onPlayShortcutChange\?\.\(recordingShortcuts\.play\)/);
  assert.match(page, /onPlayShortcutChange=\{setMmlPlayShortcut\}/);
  assert.match(page, /shortcutCodeLabel\(mmlPlayShortcut\)/);
  assert.match(page, /mmlOpen && event\.code === "Space"/);
});

test("offers MML paste choices and configurable recording start positions", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /onPaste=\{\(event\) => \{/);
  assert.match(studio, /const ranges = parsed\.tracks\.map[\s\S]*?setImportPayload\(ranges\)/);
  assert.match(studio, /MML을 어떻게 넣을까요\?/);
  assert.match(studio, /선택 트랙만 교체/);
  assert.match(studio, /녹음 시작 위치/);
  assert.match(studio, /현재 재생 위치/);
  assert.match(studio, /연결 트랙의 빈 끝부분/);
  assert.match(studio, /resolveRecordingStartTick/);
});

test("keeps existing top controls while placing touch rest input with the keyboards", async () => {
  const [page, studio, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /className="paw-row paw-row-accidental"[\s\S]*className=\{`mml-rest-button/);
  assert.doesNotMatch(page, /<span aria-hidden="true">R<\/span>/);
  assert.match(page, /className="mml-rest-symbol"[^>]*>☾<\/span>/);
  assert.match(page, /className="mml-rest-shortcut"/);
  assert.doesNotMatch(page, /<small>쉼표<\/small>/);
  assert.match(page, /mmlInputSinkRef\.current\?\.restOn/);
  assert.match(page, /mmlInputSinkRef\.current\?\.restOff/);
  assert.match(page, /onClick=\{restControl\.onClick\}/);
  assert.match(studio, /restOn: \(at: number\) => void/);
  assert.match(studio, /onRestShortcutChange\?\.\(project\.recording\.restKey\)/);
  assert.match(studio, /setRestInputActive\(true\)/);
  assert.match(studio, /className=\{`mml-beat-visual/);
  assert.match(page, /preparing \? \(accented \? 1760 : 1480\)/);
  assert.match(css, /\.mml-open \.performance-surface \.top-bar \{[^}]*grid-template-columns: 88px minmax\(0, 1fr\) 64px;[^}]*grid-template-rows: 78px 68px/s);
  assert.match(css, /\.mml-open \.performance-surface \.settings-button \{[^}]*min-height: 64px;[^}]*height: 64px/s);
  assert.match(css, /\.mml-open \.performance-surface \.keyboard-deck\.is-double \{[^}]*top: 224px;[^}]*height: auto/s);
  assert.match(css, /\.mml-open \.performance-surface \.mml-rest-button/);
  assert.match(css, /\.mml-rest-symbol \{[^}]*font-family: "Segoe UI Symbol", "Arial Unicode MS", sans-serif;/s);
  assert.match(css, /\.mml-rest-button\.is-active \{[^}]*drop-shadow/s);
  assert.match(css, /\.mml-rest-shortcut \{[^}]*border-radius: 999px/s);
  assert.match(css, /\.mml-rest-button \{[^}]*pointer-events: auto/s);
  assert.match(css, /\.keyboard-deck:not\(\.is-double\) \{[^}]*height: 190px;/s);
  assert.match(css, /\.mml-rest-button::before \{[^}]*background: #f4ead9;/s);
  assert.match(css, /\.mml-beat-visual\.is-preparing/);
});
