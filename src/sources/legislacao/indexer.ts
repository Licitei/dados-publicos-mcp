import * as cheerio from "cheerio";
import { Effect, Match } from "effect";
import { httpResponse } from "../../kernel/http/client";
import type { Node } from "./catalog";

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

  return Match.value(utf8.includes("�")).pipe(
    Match.when(true, () =>
      new TextDecoder("windows-1252", { fatal: false }).decode(buffer)
    ),
    Match.orElse(() => utf8)
  );
};

export const fetchLines = (url: string) =>
  Effect.gen(function* () {
    const response = yield* httpResponse(url, {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    const buffer = yield* response.arrayBuffer;
    return htmlToParagraphs(decodePlanalto(buffer));
  });

export const summarize = (node: Pick<Node, "label" | "heading" | "text">) =>
  `${node.label} ${node.heading || node.text}`.trim();

export const passage = (node: Pick<Node, "label" | "heading" | "text">) =>
  `${node.label} ${node.heading} ${node.text}`.replace(/\s+/g, " ").trim();
