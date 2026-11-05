import { Http } from "../../kernel/http/client";
import { Context, DateTime, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { fetchSnapshot } from "./indexer";

export const capagEstadoTable: DuckTable = {
  name: "capag_estado",
  key: "id",
  columns: {
    id: "VARCHAR",
    uf: "VARCHAR",
    ano: "INTEGER",
    indicador1: "DOUBLE",
    nota1: "VARCHAR",
    indicador2: "DOUBLE",
    nota2: "VARCHAR",
    indicador3: "DOUBLE",
    nota3: "VARCHAR",
    capag: "VARCHAR",
    qualidadeInfo: "VARCHAR",
    observacao: "VARCHAR",
  },
};

export const capagMunicipioTable: DuckTable = {
  name: "capag_municipio",
  key: "id",
  columns: {
    id: "VARCHAR",
    codIbge: "VARCHAR",
    nome: "VARCHAR",
    nomeNorm: "VARCHAR",
    uf: "VARCHAR",
    anoBase: "INTEGER",
    posicao: "VARCHAR",
    indicador1: "DOUBLE",
    nota1: "VARCHAR",
    indicador2: "DOUBLE",
    nota2: "VARCHAR",
    indicador3: "DOUBLE",
    nota3: "VARCHAR",
    capag: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const siconfiEnteTable: DuckTable = {
  name: "siconfi_ente",
  key: "codIbge",
  columns: {
    codIbge: "VARCHAR",
    ente: "VARCHAR",
    uf: "VARCHAR",
    esfera: "VARCHAR",
    regiao: "VARCHAR",
    populacao: "INTEGER",
    cnpj: "VARCHAR",
    exercicio: "INTEGER",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const makeCapag = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const indexAno = (ceilingYear: number) =>
    Effect.gen(function* () {
      const snapshot = yield* fetchSnapshot(ceilingYear).pipe(Effect.provideService(Http, http));
      const estados = Arr.map(snapshot.estados, (row) => ({ ...row, id: `${row.uf}:${row.ano}` }));
      const municipios = Arr.map(snapshot.municipios, (row) => ({
        ...row,
        id: `${row.codIbge}:${row.anoBase}`,
      }));
      yield* duck.transaction(
        duck
          .replace(capagEstadoTable, estados)
          .pipe(
            Effect.andThen(duck.replace(capagMunicipioTable, municipios)),
            Effect.andThen(duck.replace(siconfiEnteTable, snapshot.entes))
          )
      );
      yield* fuzzy.write(
        "capag_municipio",
        Arr.map(municipios, (row): readonly [string, string] => [row.id, row.busca])
      );
      yield* fuzzy.write(
        "siconfi_ente",
        Arr.map(snapshot.entes, (row): readonly [string, string] => [row.codIbge, row.busca])
      );
      return {
        estados: snapshot.estados.length,
        municipios: snapshot.municipios.length,
        entes: snapshot.entes.length,
      };
    });

  const index = Effect.flatMap(DateTime.now, (now) => indexAno(DateTime.getPartUtc(now, "year")));

  return { index, indexAno };
});

export class Capag extends Context.Service<Capag, Effect.Success<typeof makeCapag>>()(
  "dados-publicos-mcp/sources/capag/store/Capag"
) {}

export const CapagLive = Layer.effect(Capag)(makeCapag);
