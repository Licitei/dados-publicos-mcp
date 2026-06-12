import type { Node, NodeKind } from "./data";

type MutableNode = { -readonly [K in keyof Node]: Node[K] };

type Marker = {
  kind: NodeKind;
  level: number;
  pattern: RegExp;
  parse: (match: RegExpMatchArray) => { label: string; segment: string };
};

const roman = (value: string) => value.toLowerCase().replace(/[^ivxlcdm]/g, "");

const markers: Marker[] = [
  {
    kind: "titulo",
    level: 1,
    pattern: /^t[íi]tulo\s+([ivxlcdm]+|[úu]nico)/i,
    parse: (m) => ({ label: m[0].trim(), segment: `tit_${roman(m[1]) || "u"}` }),
  },
  {
    kind: "capitulo",
    level: 2,
    pattern: /^cap[íi]tulo\s+([ivxlcdm]+|[úu]nico)/i,
    parse: (m) => ({ label: m[0].trim(), segment: `cap_${roman(m[1]) || "u"}` }),
  },
  {
    kind: "secao",
    level: 3,
    pattern: /^se[çc][ãa]o\s+([ivxlcdm]+|[úu]nica)/i,
    parse: (m) => ({ label: m[0].trim(), segment: `sec_${roman(m[1]) || "u"}` }),
  },
  {
    kind: "artigo",
    level: 4,
    pattern: /^art\.?\s*(\d+)/i,
    parse: (m) => ({ label: `Art. ${m[1]}`, segment: `art${m[1]}` }),
  },
  {
    kind: "paragrafo",
    level: 5,
    pattern: /^(?:§\s*(\d+)|par[áa]grafo\s+[úu]nico)/i,
    parse: (m) =>
      m[1]
        ? { label: `§ ${m[1]}`, segment: `p${m[1]}` }
        : { label: "Parágrafo único", segment: "pu" },
  },
  {
    kind: "inciso",
    level: 6,
    pattern: /^([ivxlcdm]+)\s*[–-]\s+/i,
    parse: (m) => ({
      label: `Inciso ${m[1].toUpperCase()}`,
      segment: `inc_${roman(m[1])}`,
    }),
  },
  {
    kind: "alinea",
    level: 7,
    pattern: /^([a-z])\)\s+/i,
    parse: (m) => ({
      label: `Alínea ${m[1].toLowerCase()}`,
      segment: `ali_${m[1].toLowerCase()}`,
    }),
  },
];

const rootSegment = (id: string) =>
  id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function buildTree(
  norma: { id: string; titulo: string },
  lines: readonly string[]
): Node[] {
  const root: MutableNode = {
    path: rootSegment(norma.id),
    parentPath: null,
    kind: "norma",
    label: norma.titulo,
    heading: norma.titulo,
    text: "",
    position: 0,
  };

  const nodes = [root];
  const used = new Set([root.path]);
  const stack = [{ path: root.path, level: 0 }];
  let current = root;
  let position = 0;

  for (const line of lines) {
    const marker = markers.find((candidate) => candidate.pattern.test(line));

    if (!marker) {
      current.text = current.text ? `${current.text} ${line}` : line;
      continue;
    }

    const match = line.match(marker.pattern) ?? [line];
    const { label, segment } = marker.parse(match);

    while (stack[stack.length - 1].level >= marker.level) stack.pop();
    const parent = stack[stack.length - 1];

    const base = `${parent.path}.${segment}`;
    const path = used.has(base) ? `${base}_${position + 1}` : base;
    used.add(path);

    const node: MutableNode = {
      path,
      parentPath: parent.path,
      kind: marker.kind,
      label,
      heading: line,
      text: line
        .slice(match[0]?.length ?? 0)
        .replace(/^[º°.\s–-]+/, "")
        .trim(),
      position: (position += 1),
    };

    nodes.push(node);
    stack.push({ path, level: marker.level });
    current = node;
  }

  return nodes;
}
