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
    .input(buscarLegislacaoInputSchema)
    .handler(({ input }) => buscarLegislacao(input))
    .callable(),
  obterArtigo: os
    .input(obterArtigoInputSchema)
    .handler(({ input }) => obterArtigo(input))
    .callable(),
  statusIndice: os.handler(() => statusIndice()).callable(),
  recriarIndice: os.handler(() => recriarIndice()).callable(),
};
