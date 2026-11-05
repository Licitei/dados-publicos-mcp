import * as cheerio from "cheerio";
import { Effect, Match, pipe } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Http } from "../../kernel/http/client";
import type { Node } from "./catalog";

export function htmlToParagraphs(html: string) {
  const $ = cheerio.load(html);

  $("script, style").remove();

  const paragraphText = pipe(
    $("p, li, h1, h2, h3, h4, h5, h6").toArray(),
    Arr.map((element) => $(element).text()),
    Arr.join("\n")
  );
  const bodyText = $("body").text();
  const text = Match.value(paragraphText).pipe(
    Match.when("", () => (bodyText === "" ? $.root().text() : bodyText)),
    Match.orElse((found) => found)
  );

  return pipe(
    text,
    Str.split("\n"),
    Arr.map((line) => pipe(line, Str.replace(/\s+/g, " "), Str.trim)),
    Arr.filter((line) => line !== "")
  );
}

const decodePlanalto = (buffer: Uint8Array) => {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  return Match.value(pipe(utf8, Str.includes("�"))).pipe(
    Match.when(true, () =>
      new TextDecoder("windows-1252", { fatal: false }).decode(buffer)
    ),
    Match.orElse(() => utf8)
  );
};

export const fetchLines = (url: string) =>
  Effect.gen(function* () {
    const http = yield* Http;
    const bytes = yield* http.bytes(url, {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    return htmlToParagraphs(decodePlanalto(bytes));
  });

export const summarize = (node: Pick<Node, "label" | "heading" | "text">) =>
  pipe(
    `${node.label} ${node.heading !== "" ? node.heading : node.text}`,
    Str.trim
  );

export const passage = (node: Pick<Node, "label" | "heading" | "text">) =>
  pipe(
    `${node.label} ${node.heading} ${node.text}`,
    Str.replace(/\s+/g, " "),
    Str.trim
  );
