import { readFileSync } from "node:fs";

export type SourceFile = { readonly path: string; readonly source: string };
export type CloneBlock = {
  readonly first: string;
  readonly firstLines: readonly [number, number];
  readonly second: string;
  readonly secondLines: readonly [number, number];
  readonly tokens: number;
};

const cloneRoots = ["src"];
const cloneWindow = 50;
const duplicatedTokenBudget = 0.015;
const tokenPattern =
  /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|\d[\w.]*|=>|\.\.\.|[^\s]/gu;

const withoutImports = (source: string) =>
  source.replace(/^import\b[\s\S]*?;$/gmu, (statement) => statement.replace(/[^\n]/gu, " "));

const scanTokens = (file: SourceFile) => {
  const source = withoutImports(file.source);
  return [...source.matchAll(tokenPattern)].map((match) => ({
    text: match[0],
    line: source.slice(0, match.index).split("\n").length,
  }));
};

const windowHash = (ids: Int32Array, start: number, size: number) =>
  ids
    .subarray(start, start + size)
    .reduce((hash, id) => Math.imul(hash ^ id, 16777619), 2166136261) >>> 0;

const sameWindow = (
  left: Int32Array,
  leftStart: number,
  right: Int32Array,
  rightStart: number,
  size: number
) =>
  Array.from({ length: size }, (_, offset) => offset).every(
    (offset) => left[leftStart + offset] === right[rightStart + offset]
  );

export const detectClones = (files: ReadonlyArray<SourceFile>, size: number = cloneWindow) => {
  const vocabulary = new Map<string, number>();
  const scanned = files.map((file) => {
    const tokens = scanTokens(file);
    const ids = Int32Array.from(tokens, (token) => {
      const known = vocabulary.get(token.text);
      if (known !== undefined) return known;
      vocabulary.set(token.text, vocabulary.size);
      return vocabulary.size - 1;
    });
    return { path: file.path, tokens, ids };
  });
  const seen = new Map<number, { readonly file: number; readonly start: number }>();
  const covered = scanned.map((file) => new Uint8Array(file.ids.length));
  const runs = new Map<string, Array<number>>();
  scanned.forEach((file, fileIndex) => {
    for (const start of Array.from(
      { length: Math.max(0, file.ids.length - size + 1) },
      (_, index) => index
    )) {
      const hash = windowHash(file.ids, start, size);
      const earlier = seen.get(hash);
      if (earlier === undefined) {
        seen.set(hash, { file: fileIndex, start });
        continue;
      }
      if (earlier.file === fileIndex && start - earlier.start < size) continue;
      const original = scanned[earlier.file];
      if (original === undefined || !sameWindow(original.ids, earlier.start, file.ids, start, size))
        continue;
      covered[fileIndex]?.fill(1, start, start + size);
      covered[earlier.file]?.fill(1, earlier.start, earlier.start + size);
      const key = `${earlier.file}:${fileIndex}:${start - earlier.start}`;
      runs.set(key, [...(runs.get(key) ?? []), earlier.start]);
    }
  });
  const blocks = [...runs.entries()].flatMap(([key, starts]) => {
    const [firstFile = 0, secondFile = 0, delta = 0] = key.split(":").map(Number);
    const first = scanned[firstFile];
    const second = scanned[secondFile];
    if (first === undefined || second === undefined) return [];
    const segments = starts.reduce<ReadonlyArray<readonly [number, number]>>((all, start) => {
      const last = all.at(-1);
      return last !== undefined && start === last[1] + 1
        ? [...all.slice(0, -1), [last[0], start] as const]
        : [...all, [start, start] as const];
    }, []);
    return segments.map(([from, to]): CloneBlock => {
      const line = (file: typeof first, index: number) => file.tokens[index]?.line ?? 0;
      return {
        first: first.path,
        firstLines: [line(first, from), line(first, to + size - 1)],
        second: second.path,
        secondLines: [line(second, from + delta), line(second, to + size - 1 + delta)],
        tokens: to - from + size,
      };
    });
  });
  const total = scanned.reduce((sum, file) => sum + file.ids.length, 0);
  const duplicated = covered.reduce(
    (sum, marks) => sum + marks.reduce((count, mark) => count + mark, 0),
    0
  );
  return {
    blocks: blocks.toSorted((left, right) => right.tokens - left.tokens),
    ratio: duplicated / Math.max(total, 1),
  };
};

const readSources = (root: string): ReadonlyArray<SourceFile> =>
  cloneRoots
    .flatMap((directory) =>
      Array.from(new Bun.Glob(`${directory}/**/*.ts`).scanSync({ cwd: root }))
    )
    .toSorted((left, right) => left.localeCompare(right))
    .map((path) => ({ path, source: readFileSync(`${root}/${path}`, "utf8") }));

if (import.meta.main) {
  const root = process.argv[2] ?? ".";
  const clones = detectClones(readSources(root));
  console.error(
    [
      ...clones.blocks.map(
        (block) =>
          `warning duplicated-block ${block.tokens} tokens: ${block.first}:${block.firstLines[0]}-${block.firstLines[1]} = ${block.second}:${block.secondLines[0]}-${block.secondLines[1]}`
      ),
      `duplicated tokens ${(clones.ratio * 100).toFixed(2)}% (budget ${(duplicatedTokenBudget * 100).toFixed(2)}%) across ${clones.blocks.length} blocks`,
    ].join("\n")
  );
  if (clones.ratio > duplicatedTokenBudget) process.exitCode = 1;
}
