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

test("publishes a compact paw-mark link preview", async () => {
  const [layout, manifest, previewImage] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(layout, /const siteUrl = "https:\/\/nyang2\.pages\.dev"/);
  assert.match(layout, /그냥 마비노기 모바일 작곡 mml 고양이 건반 어쩌구\.\.\./);
  assert.match(layout, /card: "summary"/);
  assert.match(layout, /width: 512/);
  assert.match(layout, /height: 512/);
  assert.match(manifest, /그냥 마비노기 모바일 작곡 mml 고양이 건반 어쩌구\.\.\./);
  assert.equal(previewImage.subarray(1, 4).toString(), "PNG");
  assert.equal(previewImage.readUInt32BE(16), 512);
  assert.equal(previewImage.readUInt32BE(20), 512);
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
  assert.match(page, /const NYANG_SAMPLE_START_OFFSET_SECONDS = 0\.032/);
  assert.match(page, /source\.start\(now, sampleSourceOffset\)/);
  assert.match(page, /offset - state\.sourceOffset/);
  assert.match(page, /Object\.values\(theme\.visuals\)\.forEach/);
  assert.match(page, /Array\.from\(\{ length: segmentCount \}/);
  assert.match(page, /className="cat-middle" src=\{theme\.visuals\.bodyMiddle\}/);
  assert.doesNotMatch(page, /cat-middle-strip/);
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
  assert.match(html, /기기 저장 공간에만 보관/);
  assert.match(html, /마지막 MML 프로젝트·편집 기록/);
  assert.match(html, /Cloudflare/);
  assert.doesNotMatch(html, /마이크|불어서 연주/);
  assert.match(html, /mailto:chaamu\.channel@gmail\.com/);
  assert.doesNotMatch(html, /github\.com\/chococobyeol\/nyang2\/issues/);
  assert.match(page, /href="\/privacy"/);
  assert.match(page, /문의 \/ 버그 제보/);
  assert.match(page, /https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQLSfwJVXnlAzQoZKInD5pQS1K6r5pwHwpSWi8yC5cdNTJT_DiIw\/viewform/);
  assert.doesNotMatch(page, /기기 저장 설정과 마이크 처리 방식을 확인/);
});

test("keeps the help page vertically scrollable on phones", async () => {
  const [response, css] = await Promise.all([
    render("/help"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /class="help-page"/);
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.help-page \{[^}]*position: fixed;[^}]*height: 100dvh;[^}]*overflow-y: auto;[^}]*touch-action: pan-y;[^}]*-webkit-overflow-scrolling: touch;/s,
  );
});

test("includes the MML studio without changing the public route", async () => {
  const [page, studio, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /MmlStudio/);
  assert.match(page, /visible=\{mmlOpen\}/);
  assert.doesNotMatch(page, /\{mmlOpen && \(\s*<MmlStudio/);
  assert.doesNotMatch(page, /getUserMedia|불어서 연주|마이크 연결/);
  assert.match(page, /className=\{`brand-mark \$\{mmlOpen \? "is-mml-open" : ""\}`\}/);
  assert.match(page, /className="brand-mark-mml"[^>]*>MML<\/span>/);
  assert.doesNotMatch(page, /className="settings-tabs"/);
  assert.doesNotMatch(page, />MML 설정</);
  assert.match(css, /\.mml-open \.app-stage/);
  assert.match(css, /\.mml-studio/);
  assert.match(css, /\.mml-studio\.is-hidden \{\s*display: none;/s);
  assert.match(css, /\.mml-open \.performance-surface \.cat-zone \{[^}]*display: grid;/s);
  assert.match(css, /\.mml-open \.performance-surface \.cat-zone\.is-double \{[^}]*top: 23%;[^}]*height: 24%;[^}]*transform: none;/s);
  assert.match(css, /\.mml-open \.performance-surface \.keyboard-deck\.is-double \{[^}]*top: 42%;/s);
  assert.match(css, /\.mml-open \.performance-surface \.keyboard-deck\.is-double \.paw-keyboard-group:first-child \{[^}]*translateY\(18%\)/s);
  assert.match(css, /\.mml-open \.performance-surface \.cat-zone\.is-double \{\s*display: none;/s);
  assert.match(studio, /if \(!visible\) return;[\s\S]*?window\.addEventListener\("keydown", down\)/);
});

test("uses endpoint-safe sliders that follow touch drags in the rotated mobile layout", async () => {
  const [page, studio, range, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/range-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ariaLabel="전체 음량"/);
  assert.match(studio, /ariaLabel="메트로놈 음량"/);
  assert.match(studio, /ariaLabel=\{`\$\{selectedTrack\.name\} 재생 음량`\}/);
  assert.match(range, /const verticalOnScreen = rect\.height > rect\.width/);
  assert.match(range, /setPointerCapture/);
  assert.match(range, /event\.key === "Home"/);
  assert.match(range, /event\.key === "End"/);
  assert.match(css, /\.nyang-range \{[^}]*touch-action: none;/s);
  assert.match(css, /\.nyang-range-rail \{[^}]*inset: 0 11px;/s);
  assert.doesNotMatch(`${page}\n${studio}`, /type="range"/);
});

test("keeps the MML workspace text readable in the split layout", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.mml-project-title input \{[^}]*font-size: 18px;/s);
  assert.match(css, /\.mml-transport button \{[^}]*font-size: 13px;/s);
  assert.match(css, /\.mml-transport \{[^}]*align-items: center;[^}]*gap: 7px;/s);
  assert.match(css, /\.mml-transport-navigation \{[^}]*padding-left: 6px;[^}]*border-left: 1px solid var\(--line\);/s);
  assert.match(css, /\.mml-track-card strong \{\s*font-size: 12px;/s);
  assert.match(css, /\.mml-work-area textarea \{[^}]*font-size: 15px;/s);
  assert.match(css, /\.mml-status-line \{[^}]*font-size: 10px;/s);
  assert.match(css, /\.mml-quick-settings input,[^}]*font-size: 12px;/s);
});

test("shows useful track length and clock progress instead of raw ticks", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /selectedTrackCharacterCount = selectedTrack\.sourceText\.length/);
  assert.match(studio, /MML \$\{selectedTrackCharacterCount\.toLocaleString\(\)\}자 · 재생 \$\{formatPlaybackTime\(currentPlaybackSeconds\)\} \/ \$\{formatPlaybackTime\(totalPlaybackSeconds\)\}/);
  assert.match(studio, /Math\.round\(seconds \* 10\)/);
  assert.match(studio, /String\(remainder\)\.padStart\(2, "0"\)\}\.\$\{tenths\}/);
  assert.doesNotMatch(studio, /Math\.round\(songDuration\)\} tick/);
  assert.doesNotMatch(studio, /음이름과 음가를 읽기 좋게 풀어썼습니다/);
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
  assert.match(css, /\.top-bar \{[^}]*--octave-label-height: 20px;[^}]*--octave-row-gap: 3px;[^}]*--top-control-height: 64px;[^}]*--top-control-offset: calc\(var\(--octave-label-height\) \/ 2\);[^}]*--octave-button-size: calc\(var\(--top-control-height\) - var\(--octave-row-gap\) - \(var\(--octave-label-height\) \/ 2\)\);/s);
  assert.match(css, /\.top-bar \{[^}]*grid-template-columns: 155px minmax\(330px, 1fr\) 330px 64px;/s);
  assert.match(css, /\.octave-buttons \{[^}]*repeat\(4, minmax\(0, var\(--octave-button-size\)\)\)/s);
  assert.match(css, /\.octave-button \{[^}]*aspect-ratio: 1;/s);
  assert.match(css, /\.octave-panel \{[^}]*grid-template-rows: var\(--octave-label-height\) var\(--octave-button-size\);[^}]*gap: var\(--octave-row-gap\);/s);
  assert.match(css, /\.transpose-panel \{[^}]*height: var\(--top-control-height\);[^}]*margin-top: var\(--top-control-offset\);/s);
  assert.match(css, /\.transpose-panel \{[^}]*grid-template-columns: 64px minmax\(132px, 1fr\) 64px;/s);
  assert.match(css, /\.header-actions \{[^}]*height: var\(--top-control-height\);[^}]*margin-top: var\(--top-control-offset\);/s);
  assert.match(css, /\.settings-button \{[^}]*height: 100%;/s);
  assert.match(css, /\.mml-open \.performance-surface \.top-bar \.transpose-panel \{[^}]*width: min\(300px, 100%\);/s);
  assert.match(css, /\.mml-open \.performance-surface \.transpose-panel \{\s*grid-template-columns: 64px minmax\(150px, 1fr\) 64px;/s);
  assert.match(css, /\.mml-open \.performance-surface \.transpose-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(css, /--octave-label-height: 16px;\s*--octave-row-gap: 2px;\s*--top-control-height: 42px;/s);
  assert.match(css, /\.octave-buttons \{[^}]*grid-template-columns: repeat\(4, minmax\(0, var\(--octave-button-size\)\)\);/s);
  assert.match(css, /\.transpose-grid \{\s*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);[^}]*height: 100%;/s);
  assert.match(css, /\.transpose-status \{\s*min-height: 0;\s*height: 100%/);
  assert.match(css, /\.transpose-grid button \{\s*display: flex;\s*align-items: center;\s*justify-content: center;/);
  assert.match(page, /const panelTitle = side === "left" \? "OCT L" : "OCT R"/);
  assert.doesNotMatch(page, /"왼쪽 옥타브"|"오른쪽 옥타브"/);
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
  assert.match(css, /\.paw-note-accidental \.key-labels \{[^}]*width: 72%;[^}]*gap: clamp\(1px, 0\.18vw, 3px\);/s);
  assert.match(css, /\.paw-note-accidental \.mapping-label \{[^}]*width: clamp\(15px, 1vw, 18px\);[^}]*min-width: clamp\(15px, 1vw, 18px\);/s);
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
  assert.match(studio, /syncedPlaybackStartAt\(project\.recording\.metronome, runningMetronomeClock, now, \{/);
  assert.match(studio, /meterStartTick: currentMeter\.tick/);
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
  assert.match(page, /pendingNoteRef\.current\.keys\(\)[\s\S]*?inputId\.startsWith\("mml:"\)[\s\S]*?pendingNoteRef\.current\.delete/);
  assert.match(page, /voicesRef\.current\.values\(\)[\s\S]*?voice\.inputId\.startsWith\("mml:"\)[\s\S]*?stopVoice\(voice, true\)/);
  assert.match(page, /Math\.max\(graph\.context\.currentTime, scheduledStartAt\) \+ 0\.001/);
  assert.match(studio, /buildMetronomeEvents\(endTick, project\.timeSignatureMap, project\.timeSignature\)/);
  assert.match(studio, /tickToSeconds\(beat\.tick, allTempoEvents, baseTempo\) - startSeconds - elapsed/);
  assert.match(studio, /if \(!projectRef\.current\.recording\.metronome\) break/);
  assert.match(studio, /playbackMetronomeCancelsRef\.current\.forEach\(\(cancel\) => cancel\(\)\)/);
  assert.match(studio, /className="mml-timeline-ruler"/);
  assert.match(studio, /className="mml-change-marker"/);
  assert.match(studio, /aria-label="박자와 템포 변경"/);
  assert.match(studio, /변경 삭제/);
  assert.doesNotMatch(studio, /window\.prompt\("이 위치에 추가/);
  assert.match(page, /oscillator\.onended = disconnect/);
});

test("cancels pending and active playback audio immediately on pause or stop", async () => {
  const [studio, page] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /item\.track\.themeId\.startsWith\("soundpack:"\) && delaySeconds > 0/);
  assert.match(studio, /playTimersRef\.current\.push\(window\.setTimeout\(\(\) => \{\s*playMidi\([\s\S]*?volume, 0\)/);
  assert.match(studio, /playTimersRef\.current\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
  assert.match(page, /const cancelBeforeStart = immediate && voice\.scheduledStartAt > now \+ 0\.003/);
  assert.match(page, /source\.stop\(cancelBeforeStart \? now : now \+ \(immediate \? 0\.012 : 0\.2\)\)/);
  assert.match(page, /immediate \? graph\.context\.currentTime : Math\.max\(graph\.context\.currentTime, scheduledStartAt\) \+ 0\.001/);
  assert.match(studio, /const file = event\.target\.files\?\.\[0\][\s\S]*?if \(!file\) return;\s*clearPlayback\(\)/);
  assert.match(studio, /replaceLoadedProject\(imported\)/);
  assert.match(studio, /setImportPayload\(\{ ranges, replacementTitle: importedMmlTitle\(file\.name\) \}\)/);
  assert.match(studio, /const next = applyMmlImport\(projectRef\.current, importPayload, mode, currentThemeId\)/);
});

test("uses the piano-roll context action instead of a redundant meter and tempo button", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const zoomStart = studio.indexOf('<div className="mml-zoom-controls"');
  const zoomEnd = studio.indexOf("{timelineEditor && (", zoomStart);
  assert.doesNotMatch(studio, /현재 위치의 박자와 템포 변경/);
  assert.doesNotMatch(studio.slice(zoomStart, zoomEnd), /openTimelineEditor/);
  assert.match(studio, /className=\{`mml-piano-roll[\s\S]*?onContextMenu=\{timelineContext\}/);
  assert.match(studio, /className="mml-change-marker"[\s\S]*?openTimelineEditor\(tick\)/);
  assert.match(studio, /workArea\.clientWidth > 680[\s\S]*?openTimelineEditor\(tick, anchor\)/);
  assert.match(studio, /timelineEditorRef[\s\S]*?parent\.clientWidth - dialog\.offsetWidth[\s\S]*?parent\.clientHeight - dialog\.offsetHeight/);
  assert.match(css, /\.mml-timeline-editor \{[^}]*left: 50%;[^}]*transform: translateX\(-50%\);/s);
  assert.match(studio, /cardRect\.right - studioRect\.left \+ 10/);
  assert.match(studio, /trackSettingsRef[\s\S]*?parent\.clientWidth - dialog\.offsetWidth[\s\S]*?parent\.clientHeight - dialog\.offsetHeight/);
});

test("provides direct track controls, timeline zoom, and full-screen composing", async () => {
  const [page, studio, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /addEventListener\("wheel", handleWheel, \{ passive: false \}\)/);
  assert.match(studio, /removeEventListener\("wheel", handleWheel\)/);
  assert.doesNotMatch(studio, /onWheel=\{zoomTimelineWithWheel\}/);
  assert.match(studio, /if \(!event\.altKey\) return/);
  assert.match(studio, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(studio, /wheelDeltaY|windowsWheelDelta/);
  assert.match(studio, /normalizedWheelSteps\(delta, event\.deltaMode, roll\.clientHeight\)/);
  assert.match(studio, /const timelineSteps = state\.timelineSteps/);
  assert.match(studio, /state\.timelineSteps = 0/);
  assert.match(studio, /timelineTargetZoom = clampPianoTimelineZoom/);
  assert.match(studio, /minimumTimelineZoom = pianoViewportWidth > 0/);
  assert.match(studio, /minimumPitchZoom = pianoViewportHeight > 0/);
  assert.match(studio, /new ResizeObserver\(updateWidth\)/);
  assert.match(studio, /renderWheelZoomPreview\(\)/);
  assert.match(studio, /window\.requestAnimationFrame\(flushWheelZoom\)/);
  assert.match(studio, /window\.setTimeout\(commitWheelZoom, 90\)/);
  assert.match(studio, /grid\.style\.transform = `translate\(\$\{translateX\}px, \$\{translateY\}px\) scale\(\$\{horizontal\.scale\}, \$\{vertical\.scale\}\)`/);
  assert.match(studio, /timelineZoomAnchorRef\.current = timelineAnchor/);
  assert.match(studio, /ref=\{pianoCanvasRef\} className="mml-piano-canvas"/);
  assert.match(studio, /window\.addEventListener\("pointermove", onPointerMove, \{ capture: true, passive: false \}\)/);
  assert.match(studio, /window\.addEventListener\("pointerup", onPointerEnd, true\)/);
  assert.match(studio, /window\.addEventListener\("touchmove", onTouchMove, \{ capture: true, passive: false \}\)/);
  assert.match(studio, /window\.addEventListener\("touchend", onTouchEnd, true\)/);
  assert.match(studio, /className="mml-track-reorder-handle"/);
  assert.doesNotMatch(page, /requestFullscreen|orientation\.lock/);
  assert.match(studio, /Math\.max\(-6, Math\.min\(6, state\.timelineSteps \+ steps\)\)/);
  assert.match(studio, /timelineZoomAnchorRef/);
  assert.match(studio, /if \(!state\.timelineAnchor\)/);
  assert.match(studio, /if \(!state\.pitchAnchor\)/);
  const flushStart = studio.indexOf("const flushWheelZoom");
  const flushEnd = studio.indexOf("const zoomTimelineWithWheel", flushStart);
  assert.ok(flushStart >= 0 && flushEnd > flushStart);
  assert.doesNotMatch(studio.slice(flushStart, flushEnd), /setTimelineZoom|setPitchZoom/);
  assert.match(studio, /performance\.now\(\) < wheelZoomRef\.current\.activeUntil/);
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
  assert.match(studio, /onDoubleClick=\{\(event\) => openTrackSettings\(track\.id, event\)\}/);
  assert.match(studio, /className="mml-track-actions"/);
  assert.match(studio, /className="mml-track-route-actions"/);
  assert.match(studio, /className="mml-track-play-actions"/);
  assert.match(studio, /className=\{`mml-track-visibility/);
  assert.match(studio, /aria-label="왼쪽 건반 연결"/);
  assert.match(studio, /aria-label="오른쪽 건반 연결"/);
  assert.match(studio, /aria-label="음소거"/);
  assert.match(studio, /aria-label="솔로"/);
  assert.match(studio, /className="mml-track-add-button"/);
  assert.match(page, /showSideLabel\n\s+settings=\{settings\}/);
  assert.match(page, /showSideLabel && \([\s\S]*?className=\{`keyboard-side-code is-\$\{side\}`\}[\s\S]*?side === "left" \? "L" : "R"/);
  assert.match(page, /const panelTitle = side === "left" \? "OCT L" : "OCT R"/);
  assert.doesNotMatch(page, /panelTitle = mmlOpen/);
  assert.match(css, /\.keyboard-side-code \{[^}]*top: -25px;[^}]*left: 0;[^}]*border: 1px solid[^}]*background: color-mix[^}]*font-size: 13px;/s);
  assert.match(css, /\.app-viewport:not\(\.mml-open\) \.keyboard-deck\.is-double \.keyboard-side-code\.is-right \{[^}]*top: 50%;[^}]*left: clamp\(-44px, -7vw, -30px\);[^}]*translateY\(-50%\);/s);
  assert.doesNotMatch(css, /\.keyboard-side-code \{[^}]*background: var\(--ink\)/s);
  assert.match(css, /\.octave-panel \{[^}]*justify-self: center;[^}]*width: fit-content;[^}]*max-width: 100%;/s);
  assert.match(css, /\.panel-eyebrow \{[^}]*justify-self: start;[^}]*border: 1px solid[^}]*background: color-mix[^}]*font-size: 13px;/s);
  assert.doesNotMatch(studio, /<span>건반 연결<\/span>/);
  assert.doesNotMatch(studio, /<span>재생<\/span>/);
  assert.match(page, /event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey/);
  assert.match(page, /mmlExpanded \? "mml-expanded"/);
  assert.match(page, /expanded=\{mmlExpanded\}/);
  assert.match(css, /\.mml-expanded \.performance-surface \{[^}]*visibility: hidden;[^}]*pointer-events: none;/s);
  assert.match(css, /\.mml-zoom-controls/);
  assert.match(css, /\.mml-piano-roll \{[^}]*overflow-anchor: none;/s);
  assert.match(css, /\.mml-track-route-actions \{\s*grid-template-columns: repeat\(2, 28px\);/s);
  assert.match(css, /\.mml-track-play-actions \{\s*grid-template-columns: repeat\(3, 18px\);/s);
  assert.match(css, /\.mml-track-visibility span \{[^}]*width: 14px;[^}]*height: 9px;/s);
  assert.match(css, /\.mml-track-visibility\.is-hidden::after/);
});

test("changes the instrument for several selected tracks at once", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /const \[batchTrackIds, setBatchTrackIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(studio, /const changeTrackThemes = \(trackIds: string\[\], themeId: string\) =>/);
  assert.match(studio, /const updateBatchTheme = \(themeId: string\) =>/);
  assert.match(studio, /resumeAfterThemeChangeRef\.current = playheadRef\.current;[\s\S]*?clearPlayback\(\);[\s\S]*?track\.themeId = themeId/);
  assert.match(studio, /<label>음색<select[^>]*onChange=\{\(event\) => changeTrackThemes\(\[selectedTrack\.id\], event\.target\.value\)\}/);
  assert.match(studio, /const replayFromTick = fromTick >= songDuration \? 0 : fromTick;/);
  assert.match(studio, /prepareThemes\(themeIds\)[\s\S]*?schedulePlayback\(fromTick\)/);
  assert.match(studio, /startPlaybackRef\.current\(resumeTick\)/);
  assert.match(studio, /if \(selectedIds\.has\(track\.id\)\) track\.themeId = themeId/);
  assert.match(studio, /aria-label="선택한 트랙 음색"/);
  assert.match(studio, /className="mml-track-batch-checkbox"/);
  assert.match(studio, /const toggleAllBatchTracks = \(\) =>/);
  assert.match(studio, /renderBatchPanel\("sidebar"\)/);
  assert.match(studio, /renderBatchPanel\("floating"\)/);
  assert.match(studio, /\? "전체 해제" : "전체 선택"/);
  assert.match(studio, /setBatchTrackIds\(\[\]\)}>해제<\/button>/);
  assert.match(css, /\.mml-track-batch-panel/);
  assert.match(css, /\.mml-track-select-all/);
  assert.match(css, /\.mml-track-batch-checkbox input:checked/);
  assert.match(css, /\.mml-track-card\.is-batch-selected/);
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
  assert.match(studio, /if \(typing && event\.target !== editorRef\.current\) return;/);
  assert.match(studio, /matchesShortcut\(event, shortcuts\.play\)/);
  assert.match(studio, /shortcutLabel\(recordingShortcuts\.play\)/);
  assert.match(studio, /event\.stopPropagation\(\)/);
  assert.match(studio, /onPlayShortcutChange\?\.\(recordingShortcuts\.play\)/);
  assert.match(page, /onPlayShortcutChange=\{setMmlPlayShortcut\}/);
  assert.match(page, /shortcutCodeLabel\(mmlPlayShortcut\)/);
  assert.match(page, /mmlOpen && event\.code === "Space"/);
});

test("uses the same icon close control across MML panels", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /aria-label="파일 메뉴 닫기"><X/);
  assert.match(studio, /aria-label="녹음 설정 닫기"><X/);
  assert.match(studio, /aria-label="트랙 설정 닫기"><X/);
  assert.match(studio, /aria-label="선택 음가 변경 닫기"><X/);
  assert.match(studio, /aria-label="박자·템포 변경 닫기"><X/);
  assert.doesNotMatch(studio, />닫기<\/button>/);
  assert.match(css, /\.mml-quick-settings-head \.mml-panel-close,[\s\S]*?border-radius: 50%;/);
});

test("keeps octave labels from covering notes at the start of the piano roll", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.mml-pitch-label \{[\s\S]*?background: transparent;/);
});

test("offers MML paste choices and configurable recording start positions", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /onPaste=\{\(event\) => \{/);
  assert.match(studio, /const ranges = parsed\.tracks\.map[\s\S]*?setImportPayload\(\{ ranges \}\)/);
  assert.match(studio, /MML을 어떻게 넣을까요\?/);
  assert.match(studio, /선택 트랙만 교체/);
  assert.match(studio, /녹음 시작 위치/);
  assert.match(studio, /현재 재생 위치/);
  assert.match(studio, /연결 트랙의 빈 끝부분/);
  assert.match(studio, /resolveRecordingStartTick/);
  assert.match(studio, /currentParsedTracks = current\.tracks\.map/);
  assert.match(studio, /tempoAtTick\(startTick, currentTempoEvents, defaultTempo\)/);
  assert.match(studio, /elapsedSecondsToTicks\(/);
  assert.match(studio, /quantizeBpm: base\.recording\.mode === "append" \? 60/);
  assert.match(studio, /appendTimelineSecondsAt\(at\)/);
});

test("accepts MabiIcco MMI files from the project file menu", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /createProjectFromMmi/);
  assert.match(studio, /endsWith\("\.mmi"\)/);
  assert.match(studio, /accept="\.mml,\.mmi,\.nyangmml/);
  assert.match(studio, /MML·(?:3MLE·)?마비꼬 MMI·냥 프로젝트/);
});

test("recognizes channel-based 3MLE files from the MML file picker", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /isThreeMleDocument\(text\)/);
  assert.match(studio, /parseThreeMleDocument\(text\)/);
  assert.match(studio, /MML·3MLE·마비꼬 MMI·냥 프로젝트·MIDI/);
});

test("highlights the active MML source token while playback advances", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /sourceRangeAtTick\(displayTracks\[selectedTrackIndex\], playhead\)/);
  assert.match(studio, /className="mml-playback-source"/);
  assert.match(studio, /<mark>\{selectedTrack\.sourceText\.slice\(playbackSourceRange\.start, playbackSourceRange\.end\)\}<\/mark>/);
  assert.doesNotMatch(studio, /playbackSourceRef|playbackTokenRef|container\.scrollTop/);
});

test("uses standard undo and redo icons without platform-dependent arrow glyphs", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /import \{[^}]*Ellipsis[^}]*Redo2[^}]*Settings[^}]*Undo2[^}]*\} from "lucide-react"/);
  assert.match(studio, /<Undo2 className="mml-tool-icon"/);
  assert.match(studio, /<Redo2 className="mml-tool-icon"/);
  assert.match(studio, /<Settings className="mml-tool-icon"/);
  assert.match(studio, /<Ellipsis className="mml-tool-icon"/);
  assert.doesNotMatch(studio, /<b>↶<\/b>|<b>↷<\/b>/);
  assert.match(css, /\.mml-tool-icon \{[^}]*width: 14px;[^}]*height: 14px;[^}]*stroke-width: 2\.2;/s);
});

test("uses one line-icon family for playback, recording, metronome, and loop controls", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /<Play className="mml-tool-icon"/);
  assert.match(studio, /<Pause className="mml-tool-icon"/);
  assert.match(studio, /<Square className="mml-tool-icon"/);
  assert.match(studio, /<Circle className="mml-tool-icon mml-record-icon"/);
  assert.match(studio, /<Music2 className="mml-tool-icon"/);
  assert.match(studio, /<Repeat2 className="mml-tool-icon"/);
  assert.doesNotMatch(studio, /<b>(?:■|●|♩|↻)<\/b>/);
});

test("uses device-independent line icons for the performance and MML utility controls", async () => {
  const [page, studio] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<SettingsIcon className="settings-icon"/);
  assert.match(page, /<RotateCcw className="reset-icon"/);
  assert.doesNotMatch(page, />⚙<|>↺</);
  assert.match(studio, /<Maximize2 className="mml-header-icon"/);
  assert.match(studio, /<Minimize2 className="mml-header-icon"/);
  assert.match(studio, /<Upload aria-hidden="true"/);
  assert.match(studio, /<FileMusic aria-hidden="true"/);
  assert.match(studio, /<ClipboardCopy aria-hidden="true"/);
  assert.doesNotMatch(studio, />⛶<|>▣<|<b>↥<\/b>|<b>♪<\/b>|<b>⧉<\/b>/);
});

test("centers the mobile MML close icon with the shared line-icon style", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /<X className="mml-header-icon" aria-hidden="true" \/>/);
  assert.doesNotMatch(studio, /aria-label="MML 닫기"[^>]*>×<\/button>/);
  assert.match(css, /\.mml-header-icon \{[^}]*display: block;[^}]*width: 17px;[^}]*height: 17px;[^}]*stroke-width: 2\.25;/s);
  assert.match(css, /@container mml-studio \(max-width: 560px\) \{[\s\S]*?\.mml-header-icon \{[^}]*width: 14px;[^}]*height: 14px;/s);
});

test("keeps the complete outline visible around every track card", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.mml-track-card \{[^}]*border-left:\s*0;/s);
  assert.match(css, /\.mml-track-reorder-handle \{[^}]*position: absolute;[^}]*left: 3px;[^}]*width: 15px;[^}]*transform: translateY\(-50%\);/s);
  assert.match(css, /\.mml-track-grip-dots \{[^}]*width: 10px;[^}]*height: 15px;[^}]*background-size: 5px 5px;/s);
});

test("places timeline navigation beside playback controls instead of the text editor", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  const transportStart = studio.indexOf('<div className="mml-transport"');
  const editorStart = studio.indexOf('<div className="mml-editor-head"');
  const navigationStart = studio.indexOf('<nav className="mml-transport-navigation"');
  assert.ok(transportStart >= 0 && navigationStart > transportStart && navigationStart < editorStart);
  assert.doesNotMatch(studio, /mml-timeline-nav/);
  assert.match(studio, /<SkipBack className="mml-tool-icon"/);
  assert.match(studio, /<SkipForward className="mml-tool-icon"/);
});

test("keeps the mobile MML toolbar clear and the full editor reachable by touch", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const mobileMml = css.slice(css.indexOf("@media (max-height: 650px)"));
  assert.match(studio, /aria-label="녹음 설정"/);
  assert.match(studio, /aria-label="파일 메뉴"/);
  assert.match(studio, /const closeStudio = \(\) => \{[\s\S]*?setTrackSettingsView\(false\);[\s\S]*?setFileMenuView\(false\);[\s\S]*?onClose\(\);/);
  assert.match(studio, /className="mml-close" onClick=\{closeStudio\}/);
  assert.match(mobileMml, /\.mml-studio \.mml-studio-header \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto 26px 26px;[^}]*padding: 5px 7px 5px 9px;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-project-title \{[^}]*align-items: center;[^}]*gap: 6px;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-project-title input \{[^}]*font-size: 14px;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-expand,\s*\.mml-studio \.mml-close \{[^}]*width: 24px;[^}]*height: 24px;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-header-icon \{[^}]*width: 14px;[^}]*height: 14px;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-transport \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(11, minmax\(0, 1fr\)\);[^}]*overflow: hidden;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-transport-primary,[\s\S]*?\.mml-studio \.mml-transport-tools \{[^}]*display: contents;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-transport-tools button:nth-child\(-n \+ 2\) \{[^}]*display: none;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-main-grid \{[^}]*overflow: hidden;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-work-area \{[^}]*min-height: 0;[^}]*grid-template-rows: minmax\(0, 1\.45fr\) 30px minmax\(0, 0\.85fr\) 22px;[^}]*overflow: hidden;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-status-line \{[^}]*min-height: 22px;[^}]*overflow: hidden;[^}]*background: #fffdf7;/s);
  assert.match(studio, /className="mml-editor-done" onClick=\{\(\) => editorRef\.current\?\.blur\(\)\}>완료<\/button>/);
  assert.match(studio, /const moveTrackDrag = \(event: ReactPointerEvent<HTMLElement>\) =>/);
  assert.match(studio, /drag\.axis = Math\.abs\(deltaX\) >= Math\.abs\(deltaY\) \? "x" : "y"/);
  assert.match(studio, /drag\.frame = window\.requestAnimationFrame/);
  assert.match(studio, /trackList\.scrollLeft = current\.targetScrollLeft/);
  assert.match(studio, /onPointerDown=\{beginTrackDrag\}/);
  assert.match(studio, /onWheel=\{scrollTrackListWithWheel\}/);
  assert.match(mobileMml, /\.mml-studio \.mml-track-list \{[^}]*overflow: auto;[^}]*touch-action: auto;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-batch-sidebar \{[^}]*display: none;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-batch-panel\.mml-track-batch-floating \{[^}]*position: absolute;[^}]*left: 162px;[^}]*display: grid;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-quick-settings,\s*\.mml-studio \.mml-track-settings \{[^}]*left: 162px;[^}]*max-height: calc\(100% - 104px\);/s);
  assert.match(mobileMml, /\.mml-studio \.mml-action-menu \{[^}]*top: 96px;[^}]*max-height: calc\(100% - 104px\);[^}]*overflow-y: auto;[^}]*scrollbar-width: thin;/s);
  assert.match(css, /\.mml-action-menu-head \{[^}]*position: sticky;[^}]*top: 0;[^}]*background: #f0e8dc;/s);
  assert.match(mobileMml, /@container mml-studio \(max-width: 560px\) \{[\s\S]*?\.mml-studio \.mml-main-grid \{[^}]*grid-template-rows: 62px 16px minmax\(0, 1fr\);/s);
  assert.match(mobileMml, /@container mml-studio \(max-width: 560px\) \{[\s\S]*?\.mml-studio \.mml-track-list \{[^}]*align-items: center;[^}]*scrollbar-width: none;[^}]*touch-action: none;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-list::\-webkit-scrollbar \{[^}]*display: none;[^}]*height: 0;/s);
  assert.match(studio, /className="mml-track-collapse"/);
  assert.match(studio, /className="mml-track-grip-dots"/);
  assert.match(mobileMml, /\.mml-studio \.mml-main-grid \{[^}]*grid-template-rows: 62px 16px minmax\(0, 1fr\);/s);
  assert.match(mobileMml, /\.mml-studio \.mml-main-grid\.is-track-list-collapsed \{[^}]*grid-template-rows: 0 16px minmax\(0, 1fr\);/s);
  assert.match(mobileMml, /\.mml-studio \.mml-main-grid > \.mml-track-collapse \{[^}]*position: static;[^}]*width: 100%;[^}]*height: 16px;[^}]*grid-row: 2;[^}]*border-radius: 0;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-work-area \{[^}]*grid-row: 3;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-reorder-handle \{[^}]*position: absolute;[^}]*left: 2px;[^}]*width: 15px;[^}]*transform: translateY\(-50%\);/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-list-title \{[^}]*box-sizing: border-box;[^}]*width: 76px;[^}]*grid-template-columns: 18px minmax\(0, 1fr\);[^}]*grid-template-rows: 1fr;[^}]*column-gap: 4px;[^}]*padding: 0 6px;[^}]*border-right:/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-list-title strong \{[^}]*display: none;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-list\.is-mobile-collapsed > \* \{[^}]*display: none;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-list-title \.mml-track-select-all \{[^}]*display: contents;[^}]*margin: 0;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-list-title \.mml-track-select-all input \{[^}]*grid-column: 1;[^}]*grid-row: 1;[^}]*place-self: center;/s);
  assert.match(mobileMml, /\.mml-studio \.mml-track-card \{[^}]*width: 164px;[^}]*grid-template-columns: 18px minmax\(0, 1fr\) 58px;[^}]*padding: 5px 8px 5px 19px;/s);
  assert.doesNotMatch(mobileMml, /scroll-snap-(?:type|align)/);
  assert.match(mobileMml, /@container mml-studio \(max-width: 560px\) \{[\s\S]*?\.mml-studio \.mml-quick-settings,\s*\.mml-studio \.mml-track-settings \{[^}]*top: 144px;[^}]*left: 8px;/s);
  assert.match(mobileMml, /@container mml-studio \(max-width: 560px\) \{[\s\S]*?\.mml-studio \.mml-action-menu \{[^}]*top: 144px;[^}]*overflow: auto;/s);
  assert.match(mobileMml, /\.mml-open \.performance-surface \.transpose-panel \{[^}]*--compact-octave-row-width: calc\(var\(--octave-button-size\) \+ var\(--octave-button-size\) \+ var\(--octave-button-size\) \+ var\(--octave-button-size\) \+ 6px\);[^}]*width: calc\(var\(--compact-octave-row-width\) \+ 92px\);[^}]*justify-self: end;/s);
});

test("stacks the MML editor above the playable keyboard on portrait phones", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const portraitMml = css.slice(css.indexOf("/* Phone portrait MML workspace"));
  assert.match(portraitMml, /@media \(orientation: portrait\) and \(max-width: 600px\)/);
  assert.match(portraitMml, /\.app-viewport\.mml-open \{[^}]*width: 100dvw;[^}]*height: 100dvh;[^}]*transform: none;/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.app-stage \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*grid-template-rows: minmax\(0, 58fr\) minmax\(0, 42fr\);/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.performance-surface \.cat-zone,[\s\S]*?\.performance-footer \{\s*display: none;/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.performance-surface \.top-bar \{[^}]*display: grid;[^}]*height: 100px;[^}]*grid-template-rows: 46px 46px;/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.performance-surface \.top-bar \{[^}]*grid-template-columns: minmax\(0, 1fr\) 46px;[^}]*justify-content: stretch;/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.performance-surface \.top-bar \.octave-area \{[^}]*grid-column: 1;[^}]*grid-row: 1;[^}]*justify-self: start;[^}]*margin-left: clamp\(8px, 4vw, 18px\);/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.performance-surface \.top-bar \.transpose-panel \{[^}]*--mobile-octave-button-row-width: calc\(var\(--octave-button-size\) \+ var\(--octave-button-size\) \+ var\(--octave-button-size\) \+ var\(--octave-button-size\) \+ 9px\);[^}]*width: min\(100%, calc\(98px \+ var\(--mobile-octave-button-row-width\)\)\);[^}]*grid-template-columns: 46px minmax\(0, var\(--mobile-octave-button-row-width\)\) 46px;/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.performance-surface \.top-bar \.header-actions \{[^}]*grid-column: 2;[^}]*grid-row: 1;/s);
  assert.match(portraitMml, /\.app-viewport\.mml-open \.performance-surface \.keyboard-deck\.is-double \{[^}]*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);/s);
});

test("keeps existing top controls while placing touch rest input with the keyboards", async () => {
  const [page, studio, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /className="paw-row paw-row-accidental"[\s\S]*className=\{`mml-rest-button/);
  assert.match(page, /className="mml-rest-mark"[\s\S]*src="\/assets\/themes\/default\/rest\.svg"/);
  assert.match(page, /restControl\.showNoteLabel && <span className="mml-rest-note">R<\/span>/);
  assert.match(page, /className="mml-rest-shortcut"/);
  assert.match(page, /showNoteLabel: settings\.noteLabelMode !== "hidden"/);
  assert.doesNotMatch(page, /<small>쉼표<\/small>/);
  assert.match(page, /mmlInputSinkRef\.current\?\.restOn/);
  assert.match(page, /mmlInputSinkRef\.current\?\.restOff/);
  assert.match(page, /onClick=\{restControl\.onClick\}/);
  assert.match(studio, /restOn: \(at: number\) => void/);
  assert.match(studio, /onRestShortcutChange\?\.\(project\.recording\.restKey\)/);
  assert.match(studio, /setRestInputActive\(true\)/);
  assert.match(studio, /className=\{`mml-beat-visual/);
  assert.match(page, /preparing \? \(accented \? 1760 : 1480\)/);
  assert.match(css, /\.mml-open \.performance-surface \.top-bar \{[^}]*grid-template-columns: 88px minmax\(0, 1fr\) 64px;[^}]*grid-template-rows: calc\(var\(--octave-label-height\) \+ var\(--octave-row-gap\) \+ var\(--octave-button-size\)\) 68px/s);
  assert.match(css, /\.mml-open \.performance-surface \.top-bar \{[^}]*--octave-label-height: 20px;[^}]*--octave-row-gap: 3px;[^}]*--top-control-height: 64px;/s);
  assert.match(css, /\.mml-open \.performance-surface \.settings-button \{[^}]*min-height: 0;[^}]*height: 100%/s);
  assert.match(css, /\.mml-open \.performance-surface \.keyboard-deck\.is-double \{[^}]*top: 42%;[^}]*height: auto/s);
  assert.match(css, /\.mml-open \.performance-surface \.mml-rest-button/);
  assert.match(css, /\.mml-rest-mark \{[^}]*width: 100%;[^}]*object-fit: contain;/s);
  assert.match(css, /\.mml-rest-button\.is-active \{[^}]*drop-shadow/s);
  assert.match(css, /\.mml-rest-labels \{[^}]*top: 63%;[^}]*width: 58%;[^}]*transform: translateX\(-50%\);/s);
  assert.match(css, /\.key-labels \{[^}]*top: 63%;[^}]*width: 52%;[^}]*transform: translateX\(-50%\);/s);
  assert.doesNotMatch(css, /\.key-labels \{[^}]*background:/s);
  assert.match(css, /\.mml-rest-button \{[^}]*pointer-events: auto/s);
  assert.match(css, /\.keyboard-deck:not\(\.is-double\) \{[^}]*height: 190px;/s);
  assert.match(css, /\.mml-rest-button::before \{[^}]*background: #f4ead9;/s);
  assert.match(css, /\.mml-beat-visual\.is-preparing/);
});

test("keeps recording controls recoverable and preserves per-note velocity", async () => {
  const studio = await readFile(new URL("../app/components/mml-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /velocity:\s*note\.velocity/);
  assert.match(studio, /velocityByTrack:\s*Object\.fromEntries/);
  assert.match(studio, /disabled=\{recordState === "idle" && Boolean\(parseError\)\}/);
  assert.match(studio, /disabled=\{Boolean\(parseError\)\}/);
  assert.doesNotMatch(studio, /if \(parseError \|\| tempoConflict/);
  assert.doesNotMatch(studio, /tempo:\s*writesTempo \? options\.bpm/);
});
