import { createRouterClient } from "@orpc/server";
import { appRouter } from "./router";

export const appClient = createRouterClient(appRouter);
