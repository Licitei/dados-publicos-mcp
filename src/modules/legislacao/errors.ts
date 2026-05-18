import { TaggedError } from "better-result";

export class IndexNotFoundError extends TaggedError("IndexNotFoundError")<{
  message: string;
  path: string;
}>() {}

export class IndexReadError extends TaggedError("IndexReadError")<{
  message: string;
  path: string;
}>() {}

export class IndexWriteError extends TaggedError("IndexWriteError")<{
  message: string;
  path: string;
}>() {}

export class NormaNotFoundError extends TaggedError("NormaNotFoundError")<{
  message: string;
  norma: string;
}>() {}

export class NormaNotIndexedError extends TaggedError("NormaNotIndexedError")<{
  message: string;
  norma: string;
}>() {}

export class PlanaltoFetchError extends TaggedError("PlanaltoFetchError")<{
  message: string;
  url: string;
}>() {}

export class PlanaltoParseError extends TaggedError("PlanaltoParseError")<{
  message: string;
  url: string;
}>() {}

export type LegislacaoError =
  | IndexNotFoundError
  | IndexReadError
  | IndexWriteError
  | NormaNotFoundError
  | NormaNotIndexedError
  | PlanaltoFetchError
  | PlanaltoParseError;

export function errorMessage(error: LegislacaoError) {
  return error.message;
}

export function causeMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;

  return "Erro desconhecido";
}
