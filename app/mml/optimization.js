import { parseTrack, stripComments } from "./core.js";

const INITIAL_LENGTH = "4";

function readDigits(source, start) {
  let end = start;
  while (end < source.length && /[0-9]/.test(source[end])) end += 1;
  return { text: source.slice(start, end), end };
}

function lengthKey(denominator, dots = 0) {
  return `${denominator}${".".repeat(dots)}`;
}

function compactTokens(source) {
  const clean = stripComments(source).replace(/\s+/g, "").replace(/;/g, "").toLowerCase();
  const tokens = [];
  let index = 0;
  let defaultLength = INITIAL_LENGTH;
  let currentTempo = null;
  let currentVelocity = null;
  let currentOctave = null;

  while (index < clean.length) {
    const character = clean[index];

    if (character === "l") {
      const number = readDigits(clean, index + 1);
      let dots = 0;
      while (clean[number.end + dots] === ".") dots += 1;
      defaultLength = lengthKey(number.text, dots);
      index = number.end + dots;
      continue;
    }

    if (["t", "v", "o"].includes(character)) {
      const number = readDigits(clean, index + 1);
      let value = Number(number.text);
      if (character === "v") value = Math.max(0, Math.min(15, value));
      const previous = character === "t" ? currentTempo : character === "v" ? currentVelocity : currentOctave;
      if (value !== previous) tokens.push({ kind: "fixed", text: `${character}${value}` });
      if (character === "t") currentTempo = value;
      else if (character === "v") currentVelocity = value;
      else currentOctave = value;
      index = number.end;
      continue;
    }

    if (character === "<" || character === ">") {
      if (currentOctave !== null) currentOctave += character === ">" ? 1 : -1;
      tokens.push({ kind: "fixed", text: character });
      index += 1;
      continue;
    }

    if (character === "&") {
      tokens.push({ kind: "fixed", text: character });
      index += 1;
      continue;
    }

    if (character === "n") {
      const number = readDigits(clean, index + 1);
      tokens.push({ kind: "event", base: `n${number.text}`, length: defaultLength, explicitLength: false });
      index = number.end;
      continue;
    }

    let base = character;
    index += 1;
    if (character !== "r" && ["+", "#", "-"].includes(clean[index])) {
      base += clean[index];
      index += 1;
    }
    const number = readDigits(clean, index);
    index = number.end;
    let dots = 0;
    while (clean[index] === ".") {
      dots += 1;
      index += 1;
    }
    const denominator = number.text || defaultLength.replace(/\.+$/, "");
    const resolvedDots = number.text || dots > 0 ? dots : (defaultLength.match(/\.+$/)?.[0].length ?? 0);
    tokens.push({ kind: "event", base, length: lengthKey(denominator, resolvedDots), explicitLength: true });
  }

  return tokens;
}

function shortestLengthEncoding(tokens) {
  const lengths = [...new Set([INITIAL_LENGTH, ...tokens.filter((token) => token.kind === "event").map((token) => token.length)])];
  const initialIndex = lengths.indexOf(INITIAL_LENGTH);
  let costs = lengths.map(() => Number.POSITIVE_INFINITY);
  costs[initialIndex] = 0;
  const history = [];

  for (const token of tokens) {
    const nextCosts = lengths.map(() => Number.POSITIVE_INFINITY);
    const previousStates = lengths.map(() => -1);
    const pieces = lengths.map(() => "");

    if (token.kind === "fixed") {
      for (let state = 0; state < lengths.length; state += 1) {
        if (!Number.isFinite(costs[state])) continue;
        nextCosts[state] = costs[state] + token.text.length;
        previousStates[state] = state;
        pieces[state] = token.text;
      }
    } else {
      const eventLengthIndex = lengths.indexOf(token.length);
      for (let state = 0; state < lengths.length; state += 1) {
        if (!Number.isFinite(costs[state])) continue;
        if (state === eventLengthIndex) {
          nextCosts[state] = costs[state] + token.base.length;
          previousStates[state] = state;
          pieces[state] = token.base;
        } else if (token.explicitLength) {
          nextCosts[state] = costs[state] + token.base.length + token.length.length;
          previousStates[state] = state;
          pieces[state] = `${token.base}${token.length}`;
        }

        const switchedCost = costs[state] + 1 + token.length.length + token.base.length;
        if (switchedCost < nextCosts[eventLengthIndex]) {
          nextCosts[eventLengthIndex] = switchedCost;
          previousStates[eventLengthIndex] = state;
          pieces[eventLengthIndex] = `l${token.length}${token.base}`;
        }
      }
    }

    history.push({ previousStates, pieces });
    costs = nextCosts;
  }

  let state = costs.indexOf(Math.min(...costs));
  const result = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const layer = history[index];
    result.push(layer.pieces[state]);
    state = layer.previousStates[state];
  }
  return result.reverse().join("");
}

function effectiveTempos(tempos) {
  const byTick = new Map();
  for (const tempo of tempos) byTick.set(tempo.tick, tempo.bpm);
  const result = [];
  for (const [tick, bpm] of [...byTick].sort((a, b) => a[0] - b[0])) {
    if (result.at(-1)?.bpm !== bpm) result.push({ tick, bpm });
  }
  return result;
}

function musicalFingerprint(parsed) {
  return JSON.stringify({
    duration: parsed.duration,
    notes: parsed.notes.map(({ tick, duration, midi, velocity }) => ({ tick, duration, midi, velocity })),
    rests: parsed.rests.map(({ tick, duration }) => ({ tick, duration })),
    tempos: effectiveTempos(parsed.tempos),
  });
}

export function optimizeMmlText(source) {
  const original = String(source ?? "");
  const before = parseTrack(original);
  const optimized = shortestLengthEncoding(compactTokens(original));
  const after = parseTrack(optimized);
  if (musicalFingerprint(before) !== musicalFingerprint(after)) {
    throw new Error("최적화 결과가 원래 연주와 일치하지 않아 변경하지 않았습니다.");
  }
  return {
    source: optimized,
    changed: optimized !== original,
    beforeLength: original.length,
    afterLength: optimized.length,
    saved: Math.max(0, original.length - optimized.length),
  };
}

export function createMmlRestorePoint(original, optimized) {
  return {
    version: 1,
    original: String(original ?? ""),
    optimized: String(optimized ?? ""),
  };
}

export function restoreMmlText(restorePoint) {
  if (!restorePoint || restorePoint.version !== 1 || typeof restorePoint.original !== "string") {
    throw new Error("복원할 최적화 이전 텍스트가 없습니다.");
  }
  return restorePoint.original;
}
