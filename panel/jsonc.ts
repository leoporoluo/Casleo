/**
 * Reading and editing opencode.json / opencode.jsonc without collateral
 * damage.
 *
 * `parseConfig` accepts comments, trailing commas and a UTF-8 BOM.
 * `applyTopLevelEdits` splices new values for top-level keys (`providers`,
 * the legacy `provider`) into the original text instead of re-serializing
 * the whole file, so every comment and every unrelated setting survives
 * byte for byte. When the file's shape is not something the splicer
 * recognizes it returns null and the caller falls back to a plain rewrite.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const isObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

/** One top-level key to set; `value: undefined` removes the key. */
export type TopLevelEdit = { key: string; value: Json | undefined };

/* --------------------------------------------------------------- parsing */

/** Drop line and block comments that sit outside strings. */
const stripComments = (text: string): string => {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];
    if (inLine) {
      if (char === '\n') {
        inLine = false;
        out += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLine = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlock = true;
      index += 1;
      continue;
    }
    out += char;
  }
  return out;
};

/** Drop trailing commas that sit outside strings. */
const stripTrailingCommas = (text: string): string => {
  let out = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      out += char;
      if (char === '\\') {
        out += text[index + 1] ?? '';
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === ',') {
      let look = index + 1;
      while (look < text.length && /\s/.test(text[look]!)) look += 1;
      if (text[look] === '}' || text[look] === ']') continue;
    }
    out += char;
  }
  return out;
};

export const parseConfig = (raw: string): JsonObject => {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const asRoot = (value: unknown): JsonObject => {
    if (!isObject(value)) throw new Error('The config root must be a JSON object.');
    return value;
  };
  try {
    return asRoot(JSON.parse(text));
  } catch {
    return asRoot(JSON.parse(stripTrailingCommas(stripComments(text))));
  }
};

/* ---------------------------------------------------------- text splicing */

const isSpace = (char: string): boolean => /\s/.test(char);

/** Skips whitespace and both comment styles. */
const skipGap = (text: string, from: number): number => {
  let index = from;
  while (index < text.length) {
    const char = text[index]!;
    if (isSpace(char)) {
      index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      index += 2;
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    break;
  }
  return index;
};

/** Index just past the closing quote of the string that starts at `start`. */
const stringEnd = (text: string, start: number): number => {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index]!;
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '"') return index + 1;
    index += 1;
  }
  return index;
};

/** Index just past the JSON value that starts at `start` (no leading gap). */
const valueEnd = (text: string, start: number): number => {
  const char = text[start]!;
  if (char === '"') return stringEnd(text, start);
  if (char === '{' || char === '[') {
    let depth = 0;
    let index = start;
    while (index < text.length) {
      const c = text[index]!;
      if (c === '"') {
        index = stringEnd(text, index);
        continue;
      }
      if (c === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
        index = skipGap(text, index);
        continue;
      }
      if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
      index += 1;
    }
    return index;
  }
  let index = start;
  while (index < text.length) {
    const c = text[index]!;
    if (c === ',' || c === '}' || c === ']') break;
    if (c === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) break;
    index += 1;
  }
  let end = index;
  while (end > start && isSpace(text[end - 1]!)) end -= 1;
  return end;
};

type RootProperty = { name: string; keyStart: number; valueStart: number; valueEnd: number };
type RootInfo = { open: number; close: number; properties: RootProperty[] };

/** Scans the root object: its braces and every top-level property span. */
const scanRoot = (text: string): RootInfo | null => {
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  index = skipGap(text, index);
  if (text[index] !== '{') return null;
  const open = index;
  index += 1;
  const properties: RootProperty[] = [];
  while (index < text.length) {
    index = skipGap(text, index);
    const char = text[index]!;
    if (char === '}') return { open, close: index, properties };
    if (char === ',') {
      index += 1;
      continue;
    }
    if (char !== '"') return null;
    const keyStart = index;
    const keyEnd = stringEnd(text, index);
    let name: string;
    try {
      name = JSON.parse(text.slice(keyStart, keyEnd)) as string;
    } catch {
      return null;
    }
    index = skipGap(text, keyEnd);
    if (text[index] !== ':') return null;
    index = skipGap(text, index + 1);
    if (index >= text.length) return null;
    const end = valueEnd(text, index);
    if (end <= index) return null;
    properties.push({ name, keyStart, valueStart: index, valueEnd: end });
    index = end;
  }
  return null;
};

/** Leading whitespace of the line that contains `position`. */
const indentAt = (text: string, position: number): string => {
  const lineStart = text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  let end = lineStart;
  while (end < text.length && (text[end] === ' ' || text[end] === '\t')) end += 1;
  return text.slice(lineStart, end);
};

/** Pretty JSON whose continuation lines sit at `indent`. */
const serializeAt = (value: Json, indent: string): string => (
  JSON.stringify(value, null, 2).split('\n').join(`\n${indent}`)
);

const applyOne = (text: string, edit: TopLevelEdit): string | null => {
  const root = scanRoot(text);
  if (!root) return null;
  const property = root.properties.find((item) => item.name === edit.key);

  if (edit.value === undefined) {
    if (!property) return text;
    let start = property.keyStart;
    let end = property.valueEnd;
    const after = skipGap(text, end);
    if (text[after] === ',') {
      end = after + 1;
    } else {
      const previous = root.properties[root.properties.indexOf(property) - 1];
      if (previous) {
        const gap = skipGap(text, previous.valueEnd);
        if (text[gap] === ',') start = gap;
      }
    }
    return text.slice(0, start) + text.slice(end);
  }

  if (property) {
    const replacement = serializeAt(edit.value, indentAt(text, property.keyStart));
    return text.slice(0, property.valueStart) + replacement + text.slice(property.valueEnd);
  }

  const indent = root.properties.length > 0 ? indentAt(text, root.properties[0]!.keyStart) : '  ';
  const entry = `"${edit.key}": ${serializeAt(edit.value, indent)}`;
  if (root.properties.length === 0) {
    const first = skipGap(text, root.open + 1);
    if (text[first] !== '}') return null;
    return text.slice(0, first) + entry + text.slice(first);
  }
  const last = root.properties[root.properties.length - 1]!;
  const gap = skipGap(text, last.valueEnd);
  if (text[gap] === ',') {
    return text.slice(0, gap + 1) + `\n${indent}${entry}` + text.slice(gap + 1);
  }
  return text.slice(0, last.valueEnd) + `,\n${indent}${entry}` + text.slice(last.valueEnd);
};

/**
 * Applies the edits in order and returns the patched text, or null when the
 * file's shape is not what the splicer expects (callers fall back to a plain
 * re-serialization).
 */
export const applyTopLevelEdits = (text: string, edits: TopLevelEdit[]): string | null => {
  let result: string | null = text;
  for (const edit of edits) {
    result = applyOne(result!, edit);
    if (result === null) return null;
  }
  return result;
};
