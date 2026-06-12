import { Schema } from "effect";

export const NodeKind = Schema.Literals([
  "norma",
  "titulo",
  "capitulo",
  "secao",
  "artigo",
  "paragrafo",
  "inciso",
  "alinea",
]);
export type NodeKind = (typeof NodeKind)["Type"];

export const Node = Schema.Struct({
  path: Schema.String,
  parentPath: Schema.NullOr(Schema.String),
  kind: NodeKind,
  label: Schema.String,
  heading: Schema.String,
  text: Schema.String,
  position: Schema.Number,
});
export type Node = (typeof Node)["Type"];

export type Norma = {
  id: string;
  titulo: string;
  apelidos: string[];
  url: string;
  temas: string[];
};
