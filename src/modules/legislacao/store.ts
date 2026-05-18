import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Result, type Result as ResultType } from "better-result";
import { z } from "zod";
import type { Norma } from "./catalog";
import { getDatasetFilePath } from "../../datasets";
import { causeMessage, IndexReadError, IndexWriteError } from "./errors";

export type DocumentoIndexado = {
  norma: Norma;
  paragrafos: string[];
};

export type IndiceLegislacao = {
  versao: 1;
  criadoEm: string;
  fonte: "planalto";
  documentos: DocumentoIndexado[];
};

const normaSchema: z.ZodType<Norma> = z
  .object({
    id: z.union([
      z.literal("lei-14133-2021"),
      z.literal("lei-8666-1993"),
      z.literal("lei-13303-2016"),
      z.literal("lc-123-2006"),
      z.literal("decreto-11462-2023"),
    ]),
    titulo: z.string(),
    apelidos: z.array(z.string()),
    url: z.string(),
    temas: z.array(z.string()),
  })
  .strict();

const documentoIndexadoSchema: z.ZodType<DocumentoIndexado> = z
  .object({
    norma: normaSchema,
    paragrafos: z.array(z.string()),
  })
  .strict();

const indiceLegislacaoSchema: z.ZodType<IndiceLegislacao> = z
  .object({
    versao: z.literal(1),
    criadoEm: z.string(),
    fonte: z.literal("planalto"),
    documentos: z.array(documentoIndexadoSchema),
  })
  .strict();

export function getIndexPath() {
  return getDatasetFilePath("legislacao", "index.json");
}

export async function loadIndex(): Promise<
  ResultType<IndiceLegislacao | null, IndexReadError>
> {
  const path = getIndexPath();

  const loaded = await Result.tryPromise({
    try: async () => {
      const file = Bun.file(path);

      if (!(await file.exists())) return null;

      return (await file.json()) as unknown;
    },
    catch: (cause) =>
      new IndexReadError({
        message: `Falha ao ler indice local em ${path}: ${causeMessage(cause)}`,
        path,
      }),
  });

  if (Result.isError(loaded)) return loaded;
  if (!loaded.value) return Result.ok(null);

  const parsed = indiceLegislacaoSchema.safeParse(loaded.value);

  if (!parsed.success) {
    return Result.err(
      new IndexReadError({
        message: `Indice local invalido em ${path}: ${parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
        path,
      })
    );
  }

  return Result.ok(parsed.data);
}

export async function saveIndex(
  indice: IndiceLegislacao
): Promise<ResultType<string, IndexWriteError>> {
  const path = getIndexPath();

  return Result.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await Bun.write(path, `${JSON.stringify(indice, null, 2)}\n`);

      return path;
    },
    catch: (cause) =>
      new IndexWriteError({
        message: `Falha ao salvar indice local em ${path}: ${causeMessage(cause)}`,
        path,
      }),
  });
}
