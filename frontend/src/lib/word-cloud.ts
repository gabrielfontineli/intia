import type { Message } from '$lib/api';

const WORD_REGEX = /[\p{L}]+/gu;
const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const MIN_WORD_LENGTH = 3;
const MAX_PHRASE_WORDS = 5;

const STOPWORDS = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'com',
  'da',
  'das',
  'de',
  'dei',
  'dela',
  'dele',
  'deles',
  'dizer',
  'do',
  'dos',
  'e',
  'ela',
  'ele',
  'eles',
  'em',
  'era',
  'essa',
  'esse',
  'estava',
  'estive',
  'eu',
  'foi',
  'ja',
  'la',
  'le',
  'lhe',
  'maior',
  'mais',
  'mas',
  'me',
  'mesmo',
  'mim',
  'muita',
  'muitas',
  'muito',
  'muitos',
  'na',
  'nas',
  'nem',
  'no',
  'nos',
  'nossa',
  'nosso',
  'nunca',
  'o',
  'os',
  'ou',
  'para',
  'pelo',
  'pela',
  'por',
  'pra',
  'que',
  'quem',
  'se',
  'sem',
  'ser',
  'sua',
  'suas',
  'tambem',
  'tanto',
  'te',
  'tem',
  'tinha',
  'todas',
  'todos',
  'tu',
  'um',
  'uma',
  'vai',
  'voce',
]);

export type WordCloudSentiment = 'positive' | 'negative';

export interface WordCloudEntry {
  word: string;
  count: number;
  sentiment: WordCloudSentiment;
}

export interface PositionedWordCloudEntry extends WordCloudEntry {
  left: number;
  top: number;
  zIndex: number;
}

interface WordAccumulator {
  count: number;
  display: string;
  sentiment: WordCloudSentiment;
}

function normalizeWord(word: string): string {
  return word.normalize('NFD').replace(DIACRITICS_REGEX, '').toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sumCharCodes(text: string): number {
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) {
    sum += text.charCodeAt(i);
  }
  return sum;
}

function classifySentiment(score: number): WordCloudSentiment | null {
  if (score < 0.4) return 'positive';
  if (score > 0.6) return 'negative';
  return null;
}

export function buildWordCloud(messages: Message[], limit = 40): WordCloudEntry[] {
  const counts = new Map<string, WordAccumulator>();

  for (const { message, message_score } of messages) {
    const sentiment = classifySentiment(message_score);
    if (!sentiment) continue;

    const matches = Array.from(message.matchAll(WORD_REGEX));
    if (!matches.length) continue;

    const tokens = matches.map((match) => {
      const raw = match[0];
      const normalized = normalizeWord(raw);
      return {
        raw,
        normalized,
        isStopword: STOPWORDS.has(normalized),
      };
    });

    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index];

      if (
        token.isStopword ||
        token.normalized.length < MIN_WORD_LENGTH
      ) {
        index += 1;
        continue;
      }

      const phraseTokens = [token];
      let endIndex = index;
      let candidateIndex = index + 1;

      while (
        candidateIndex < tokens.length &&
        phraseTokens.length < MAX_PHRASE_WORDS
      ) {
        const nextToken = tokens[candidateIndex];
        if (!nextToken) break;

        if (nextToken.isStopword) {
          const followingIndex = candidateIndex + 1;
          const followingToken = tokens[followingIndex];

          if (
            followingToken &&
            !followingToken.isStopword &&
            followingToken.normalized.length >= MIN_WORD_LENGTH &&
            phraseTokens.length + 2 <= MAX_PHRASE_WORDS
          ) {
            phraseTokens.push(nextToken);
            phraseTokens.push(followingToken);
            endIndex = followingIndex;
            candidateIndex = followingIndex + 1;
            continue;
          }
          break;
        }

        if (nextToken.normalized.length >= MIN_WORD_LENGTH) {
          phraseTokens.push(nextToken);
          endIndex = candidateIndex;
          candidateIndex += 1;
          continue;
        }

        candidateIndex += 1;
      }

      const normalizedPhrase = phraseTokens.map((part) => part.normalized).join(' ');
      const displayPhrase = phraseTokens.map((part) => part.raw.toLowerCase()).join(' ');
      const key = `${sentiment}:${normalizedPhrase}`;

      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { count: 1, display: displayPhrase, sentiment });
      }

      index = phraseTokens.length > 1 ? endIndex + 1 : index + 1;
    }
  }

  const entries: WordCloudEntry[] = Array.from(counts.values())
    .map(({ count, display, sentiment }) => ({
      word: display,
      count,
      sentiment,
    }))
    .sort((a, b) => {
      if (b.count === a.count) {
        if (a.sentiment === b.sentiment) {
          return a.word.localeCompare(b.word);
        }
        return a.sentiment === 'negative' ? -1 : 1;
      }
      return b.count - a.count;
    });

  return entries.slice(0, limit);
}

export function layoutWordCloud(
  entries: WordCloudEntry[],
  minCount: number,
  maxCount: number,
  spread = 1
): PositionedWordCloudEntry[] {
  if (!entries.length) return [];

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const CANVAS_SIZE = 860;
  const MIN_MARGIN = 40;
  const STEP_RADIUS = 12;
  const STEP_ANGLE = GOLDEN_ANGLE;
  const GAP = 14;

  interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  let positioned: PositionedWordCloudEntry[] = [];
  const boxes: Box[] = [];
  const sorted = entries.slice().sort((a, b) => b.count - a.count);

  const textWidthEstimate = (value: string, fontSizePx: number) =>
    Math.max(fontSizePx * 2.8, fontSizePx * value.length * 0.55 + 12);
  const textHeightEstimate = (fontSizePx: number) => fontSizePx * 1.6;

  const overlaps = (box: Box) =>
    boxes.some((placed) => {
      const horizontalGap = (box.width + placed.width) / 2 + GAP;
      const verticalGap = (box.height + placed.height) / 2 + GAP;
      return Math.abs(box.x - placed.x) < horizontalGap && Math.abs(box.y - placed.y) < verticalGap;
    });

  sorted.forEach((entry, index) => {
    const sizeRem = scaleFontSize(entry.count, minCount, maxCount);
    const fontSizePx = sizeRem * 16;
    const width = textWidthEstimate(entry.word, fontSizePx);
    const height = textHeightEstimate(fontSizePx);

    const seed = sumCharCodes(entry.word);

    let angle = seed % (Math.PI * 2);
    const baseRadius =
      index === 0
        ? 0
        : Math.max(
            80,
            50 + STEP_RADIUS * Math.sqrt(index + 2) * Math.max(0.85, sizeRem * 0.9)
          );
    let radius = baseRadius * spread;
    let placed = false;
    let attempts = 0;
    let posX = CANVAS_SIZE / 2;
    let posY = CANVAS_SIZE / 2;

    const tryPlace = (x: number, y: number): Box => ({
      x,
      y,
      width,
      height,
    });

    while (!placed && attempts < 1200) {
      const candidate = tryPlace(posX, posY);

      const withinBounds =
        candidate.x - candidate.width / 2 >= MIN_MARGIN &&
        candidate.x + candidate.width / 2 <= CANVAS_SIZE - MIN_MARGIN &&
        candidate.y - candidate.height / 2 >= MIN_MARGIN &&
        candidate.y + candidate.height / 2 <= CANVAS_SIZE - MIN_MARGIN;

      if (withinBounds && !overlaps(candidate)) {
        boxes.push(candidate);
        positioned.push({
          ...entry,
          left: clamp((candidate.x / CANVAS_SIZE) * 100, 10, 90),
          top: clamp((candidate.y / CANVAS_SIZE) * 100, 12, 88),
          zIndex: Math.max(1, 1000 - index * 5),
        });
        placed = true;
        break;
      }

      attempts += 1;
      angle += STEP_ANGLE;
      radius += STEP_RADIUS * (0.55 + spread * 0.35);

      const jitter = ((seed + attempts) % 60) / 60 - 0.5;
      const jitterScale = 14 * spread;
      posX = CANVAS_SIZE / 2 + Math.cos(angle) * (radius + jitter * jitterScale);
      posY = CANVAS_SIZE / 2 + Math.sin(angle) * (radius + jitter * jitterScale) * 0.82;
    }

    if (!placed) {
      const fallback = tryPlace(
        clamp(posX, MIN_MARGIN, CANVAS_SIZE - MIN_MARGIN),
        clamp(posY, MIN_MARGIN, CANVAS_SIZE - MIN_MARGIN)
      );
      boxes.push(fallback);
      positioned.push({
        ...entry,
        left: clamp((fallback.x / CANVAS_SIZE) * 100, 10, 90),
        top: clamp((fallback.y / CANVAS_SIZE) * 100, 12, 88),
        zIndex: Math.max(1, 500 - index * 5),
      });
    }
  });

  if (boxes.length) {
    const minX = Math.min(...boxes.map((box) => box.x - box.width / 2));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width / 2));
    const minY = Math.min(...boxes.map((box) => box.y - box.height / 2));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height / 2));

    const cloudWidth = Math.max(20, maxX - minX);
    const cloudHeight = Math.max(20, maxY - minY);
    const targetWidth = CANVAS_SIZE - MIN_MARGIN * 2;
    const targetHeight = CANVAS_SIZE - MIN_MARGIN * 2;

    const rawScale = Math.min(targetWidth / cloudWidth, targetHeight / cloudHeight);
    const scale = clamp(rawScale, 0.75, 1.35);

    if (Math.abs(scale - 1) > 0.06) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      positioned = positioned.map((entry, idx) => {
        const box = boxes[idx];
        const offsetX = box.x - centerX;
        const offsetY = box.y - centerY;
        const newX = CANVAS_SIZE / 2 + offsetX * scale;
        const newY = CANVAS_SIZE / 2 + offsetY * scale;
        return {
          ...entry,
          left: clamp((newX / CANVAS_SIZE) * 100, 8, 92),
          top: clamp((newY / CANVAS_SIZE) * 100, 10, 90),
        };
      });
    }
  }

  return positioned;
}

export function scaleFontSize(count: number, min: number, max: number): number {
  if (max === min) return 1.55;
  const minSize = 1.0;
  const maxSize = 2.4;
  const normalized = (count - min) / (max - min);
  return +(minSize + normalized * (maxSize - minSize)).toFixed(2);
}

