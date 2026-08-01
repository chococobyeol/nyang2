import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

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
  assert.match(page, /name: "포근 신스"/);
  assert.match(page, /O3 E 녹음본/);
  assert.match(page, /길게 눌러도 손을 떼면 바로 멈추며/);
  assert.match(page, /서스테인으로 유지된 음은 서스테인을 떼면 멈춥니다/);
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
  assert.match(html, /로컬 저장소에만 보관/);
  assert.match(html, /Cloudflare/);
  assert.match(page, /href="\/privacy"/);
});
