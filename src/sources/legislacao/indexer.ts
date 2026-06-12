import * as cheerio from "cheerio";
import { Effect } from "effect";
import type { Norma } from "./data";
import { httpResponse } from "../../kernel/http/client";
import { Embedder } from "../../kernel/embed/embedder";
import { buildTree } from "./tree";
import { normas } from "./catalog";
import { replaceNorma, type NodeRow } from "./store";

export function htmlToParagraphs(html: string) {
  const $ = cheerio.load(html);

  $("script, style").remove();

  const paragraphText = $("p, li, h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((element) => $(element).text())
    .join("\n");
  const text = paragraphText || $("body").text() || $.root().text();

  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const decodePlanalto = (buffer: ArrayBuffer) => {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  return utf8.includes("�")
    ? new TextDecoder("windows-1252", { fatal: false }).decode(buffer)
    : utf8;
};

const fetchLines = (url: string) =>
  Effect.gen(function* () {
    const response = yield* httpResponse(url, {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    const buffer = yield* response.arrayBuffer;
    return htmlToParagraphs(decodePlanalto(buffer));
  });

const summarize = (node: { label: string; heading: string; text: string }) =>
  `${node.label} ${node.heading || node.text}`.trim();

const passage = (node: { label: string; heading: string; text: string }) =>
  `${node.label} ${node.heading} ${node.text}`.replace(/\s+/g, " ").trim();

export const indexNorma = (norma: Norma) =>
  Effect.gen(function* () {
    const embedder = yield* Embedder;
    const lines = yield* fetchLines(norma.url);
    const nodes = buildTree(norma, lines);
    const embeddings = yield* embedder.embed("passage", nodes.map(passage));
    const rows = nodes.map(
      (node, position) =>
        ({
          path: node.path,
          normaId: norma.id,
          parentPath: node.parentPath,
          kind: node.kind,
          label: node.label,
          heading: node.heading,
          text: node.text,
          summary: summarize(node),
          position: node.position,
          embedding: embeddings[position],
        }) satisfies NodeRow
    );
    yield* replaceNorma(norma.id, rows);
    return rows.length;
  });

export const indexAll = Effect.forEach(normas, indexNorma, { concurrency: 2 });
