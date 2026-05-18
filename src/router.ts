import { legislacaoRouter } from "./modules/legislacao/router";

export const appRouter = {
  legislacao: legislacaoRouter,
};

export type AppRouter = typeof appRouter;
