import { z } from "zod";

export const buscarLegislacaoInputSchema = z
  .object({
    termo: z.string().trim().min(1),
    norma: z.string().trim().min(1).optional(),
    limite: z.number().int().positive().max(25).optional(),
  })
  .strict();

export const obterArtigoInputSchema = z
  .object({
    norma: z.string().trim().min(1),
    artigo: z.union([z.string().trim().min(1), z.number()]),
  })
  .strict();

export type SearchInput = z.infer<typeof buscarLegislacaoInputSchema>;
export type ArtigoInput = z.infer<typeof obterArtigoInputSchema>;

export const emptyInputJsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const buscarLegislacaoJsonSchema = {
  type: "object",
  properties: {
    termo: {
      type: "string",
      description: "Termo a buscar. Exemplo: habilitacao tecnica.",
    },
    norma: {
      type: "string",
      description:
        "Opcional. ID ou apelido da norma, como lei-14133-2021 ou 14133.",
    },
    limite: {
      type: "number",
      description: "Quantidade maxima de resultados. Maximo 25.",
    },
  },
  required: ["termo"],
  additionalProperties: false,
} as const;

export const obterArtigoJsonSchema = {
  type: "object",
  properties: {
    norma: {
      type: "string",
      description: "ID ou apelido da norma, como lei-14133-2021 ou 14133.",
    },
    artigo: {
      type: ["string", "number"],
      description: "Numero do artigo. Exemplo: 67.",
    },
  },
  required: ["norma", "artigo"],
  additionalProperties: false,
} as const;
