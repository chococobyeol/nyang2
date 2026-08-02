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
  assert.match(studio, /const tick = recordingStartTickRef\.current[\s\S]*?setPlayhead\(tick\)/);
});
