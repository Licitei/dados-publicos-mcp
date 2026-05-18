import * as cheerio from "cheerio";
import { Result, type Result as ResultType } from "better-result";
import { causeMessage, PlanaltoParseError } from "./errors";

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

export function parsePlanaltoHtml(
  html: string,
  url: string
): ResultType<string[], PlanaltoParseError> {
  return Result.try({
    try: () => htmlToParagraphs(html),
    catch: (cause) =>
      new PlanaltoParseError({
        message: `Falha ao parsear HTML do Planalto em ${url}: ${causeMessage(cause)}`,
        url,
      }),
  });
}
