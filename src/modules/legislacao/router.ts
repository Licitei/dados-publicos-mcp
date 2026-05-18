import { os } from "@orpc/server";
import {
  buscarLegislacao,
  listarNormas,
  obterArtigo,
  recriarIndice,
  statusIndice,
} from "./service";
import {
  buscarLegislacaoInputSchema,
  obterArtigoInputSchema,
} from "./schemas";

export const legislacaoRouter = {
  listarNormas: os.handler(() => listarNormas()).callable(),
  buscar: os
    .handler(({ input }) =>
      buscarLegislacao(buscarLegislacaoInputSchema.parse(input))
    )
    .callable(),
  obterArtigo: os
    .handler(({ input }) => obterArtigo(obterArtigoInputSchema.parse(input)))
    .callable(),
  statusIndice: os.handler(() => statusIndice()).callable(),
  recriarIndice: os.handler(() => recriarIndice()).callable(),
};
