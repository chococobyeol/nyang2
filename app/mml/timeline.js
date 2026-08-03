import { TICKS_PER_QUARTER } from "./core.js";

export function clampTimelineZoom(value) {
  return Math.max(0.5, Math.min(4, Number(value) || 1));
}

export function normalizedWheelSteps(delta, deltaMode = 0, viewportSize = 800, windowsWheelDelta = null) {
  const legacyDelta = Number(windowsWheelDelta);
  if (Number.isFinite(legacyDelta) && legacyDelta !== 0) return -legacyDelta / 120;
  const rawDelta = Number(delta) || 0;
  const unit = deltaMode === 1 ? 40 : deltaMode === 2 ? Math.max(1, Number(viewportSize) || 800) : 1;
  return rawDelta * unit / 120;
}

function validSignature(signature, fallback) {
  return {
    numerator: Math.max(1, Number(signature?.numerator) || fallback.numerator),
    denominator: Math.max(1, Number(signature?.denominator) || fallback.denominator),
  };
}

export function buildTimelineGrid(duration, timeSignatureMap = [], fallback = { numerator: 4, denominator: 4 }) {
  const safeFallback = validSignature(fallback, { numerator: 4, denominator: 4 });
  const markers = [...timeSignatureMap]
    .map((marker) => ({ tick: Math.max(0, Number(marker.tick) || 0), ...validSignature(marker, safeFallback) }))
    .sort((a, b) => a.tick - b.tick)
    .filter((marker, index, list) => index === list.findIndex((candidate) => candidate.tick === marker.tick));
  if (markers[0]?.tick !== 0) markers.unshift({ tick: 0, ...safeFallback });

  const maxTick = Math.max(1, Math.round(duration));
  const measures = [];
  const beats = [];
  let measureNumber = 1;

  markers.forEach((marker, markerIndex) => {
    if (marker.tick > maxTick) return;
    const nextMarkerTick = markers[markerIndex + 1]?.tick ?? Infinity;
    const segmentEnd = Math.min(maxTick, nextMarkerTick);
    const beatTicks = (TICKS_PER_QUARTER * 4) / marker.denominator;
    const measureTicks = beatTicks * marker.numerator;
    if (!Number.isFinite(measureTicks) || measureTicks <= 0) return;

    for (let measureTick = marker.tick; measureTick <= segmentEnd; measureTick += measureTicks) {
      if (markerIndex < markers.length - 1 && measureTick >= nextMarkerTick) break;
      measures.push({
        tick: measureTick,
        number: measureNumber,
        numerator: marker.numerator,
        denominator: marker.denominator,
      });
      measureNumber += 1;
      const measureEnd = Math.min(measureTick + measureTicks, segmentEnd);
      for (let beat = 1; beat < marker.numerator; beat += 1) {
        const beatTick = measureTick + beat * beatTicks;
        if (beatTick >= measureEnd || beatTick > maxTick) break;
        beats.push({ tick: beatTick, beat: beat + 1 });
      }
      if (measureTick + measureTicks > segmentEnd) break;
    }
  });

  return { measures, beats };
}

export function followTimelineScroll(scrollLeft, viewportWidth, contentWidth, playheadX, anchor = 0.65, backAnchor = 0.2) {
  const width = Math.max(0, Number(viewportWidth) || 0);
  const maxScroll = Math.max(0, (Number(contentWidth) || 0) - width);
  const current = Math.max(0, Math.min(maxScroll, Number(scrollLeft) || 0));
  const position = Math.max(0, Number(playheadX) || 0);
  if (width === 0) return current;
  const safeBackAnchor = Math.max(0, Math.min(anchor, Number(backAnchor) || 0));
  if (position < current + width * safeBackAnchor) {
    return Math.max(0, Math.min(maxScroll, position - width * safeBackAnchor));
  }
  if (position <= current + width * anchor) return current;
  return Math.max(current, Math.min(maxScroll, position - width * anchor));
}

export function adjacentMeasureTick(measures, currentTick, direction, endTick) {
  const current = Math.max(0, Number(currentTick) || 0);
  const end = Math.max(0, Number(endTick) || 0);
  const ticks = [...new Set(measures.map((measure) => Math.max(0, Number(measure.tick) || 0)))]
    .filter((tick) => tick <= end)
    .sort((a, b) => a - b);
  if (direction < 0) return [...ticks].reverse().find((tick) => tick < current) ?? 0;
  return ticks.find((tick) => tick > current) ?? end;
}
