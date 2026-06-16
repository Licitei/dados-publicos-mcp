import { Effect, Match, Schema } from "effect";
import { CamaraDeputados } from "../sources/camara-deputados/store";
import { Capag } from "../sources/capag/store";
import { CatmatCatser } from "../sources/catmat-catser/store";
import { Cnae } from "../sources/cnae/store";
import { IbgeEconomia } from "../sources/ibge-economia/store";
import { IbgeLocalidades } from "../sources/ibge-localidades/store";
import { Legislacao } from "../sources/legislacao/store";
import { defaultModalidades } from "../sources/pncp/catalog";
import { Pncp } from "../sources/pncp/store";
import { QueridoDiario } from "../sources/querido-diario/store";
import { ReceitaCnpj } from "../sources/receita-cnpj/store";
import { SancoesCgu } from "../sources/sancoes-cgu/store";
import { SenadoFederal } from "../sources/senado/store";
import { Sicaf } from "../sources/sicaf-fornecedores/store";
import { TcuInidoneos } from "../sources/tcu-inidoneos/store";
import { TseEleitoral } from "../sources/tse-eleitoral/store";
import type { AppServices } from "./tool";

export const FonteKey = Schema.Literals([
  "legislacao",
  "ibge-localidades",
  "cnae",
  "catmat-catser",
  "sicaf-fornecedores",
  "sancoes-cgu",
  "receita-cnpj",
  "tse-eleitoral",
  "camara-deputados",
  "querido-diario",
  "capag",
  "pncp",
  "tcu-inidoneos",
  "ibge-economia",
  "senado",
]);
export type FonteKey = (typeof FonteKey)["Type"];

export type Scope = {
  readonly ufs?: readonly string[];
  readonly anos?: readonly number[];
  readonly mes?: string;
};

export type IndexEntry = {
  readonly heavy: boolean;
  readonly run: (scope: Scope) => Effect.Effect<unknown, unknown, AppServices>;
};

const monthWindow = (mes: string | undefined) =>
  Match.value(mes).pipe(
    Match.when(Match.string, (value) => {
      const [year, month] = value.split("-").map((part) => Number(part));
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        dataInicial: `${year}-${pad(month)}-01`,
        dataFinal: `${year}-${pad(month)}-${pad(lastDay)}`,
      };
    }),
    Match.orElse(() => undefined)
  );

export const indexRegistry: Record<FonteKey, IndexEntry> = {
  legislacao: {
    heavy: false,
    run: () => Legislacao.pipe(Effect.flatMap((service) => service.indexAll)),
  },
  "ibge-localidades": {
    heavy: false,
    run: () => IbgeLocalidades.pipe(Effect.flatMap((service) => service.index)),
  },
  cnae: {
    heavy: false,
    run: () => Cnae.pipe(Effect.flatMap((service) => service.index)),
  },
  "catmat-catser": {
    heavy: false,
    run: () => CatmatCatser.pipe(Effect.flatMap((service) => service.index)),
  },
  "sicaf-fornecedores": {
    heavy: false,
    run: () => Sicaf.pipe(Effect.flatMap((service) => service.index)),
  },
  "sancoes-cgu": {
    heavy: false,
    run: () => SancoesCgu.pipe(Effect.flatMap((service) => service.index)),
  },
  "receita-cnpj": {
    heavy: true,
    run: () => ReceitaCnpj.pipe(Effect.flatMap((service) => service.index)),
  },
  "tse-eleitoral": {
    heavy: true,
    run: (scope) =>
      TseEleitoral.pipe(
        Effect.flatMap((service) =>
          Match.value(scope.anos).pipe(
            Match.when(
              (anos: readonly number[] | undefined): anos is readonly number[] =>
                anos !== undefined && anos.length > 0,
              (anos) => service.indexAnos(anos)
            ),
            Match.orElse(() => service.index)
          )
        )
      ),
  },
  "camara-deputados": {
    heavy: true,
    run: (scope) =>
      CamaraDeputados.pipe(
        Effect.flatMap((service) =>
          Match.value(scope.anos).pipe(
            Match.when(
              (anos: readonly number[] | undefined): anos is readonly number[] =>
                anos !== undefined && anos.length > 0,
              (anos) => service.indexAnos(anos)
            ),
            Match.orElse(() => service.index)
          )
        )
      ),
  },
  "querido-diario": {
    heavy: true,
    run: (scope) =>
      QueridoDiario.pipe(
        Effect.flatMap((service) =>
          Match.value({ ufs: scope.ufs, anos: scope.anos }).pipe(
            Match.when(
              (s: {
                readonly ufs?: readonly string[];
                readonly anos?: readonly number[];
              }): s is { ufs: readonly string[]; anos: readonly number[] } =>
                s.ufs !== undefined &&
                s.ufs.length > 0 &&
                s.anos !== undefined &&
                s.anos.length > 0,
              (s) =>
                service.indexScope(
                  s.ufs.flatMap((uf) => s.anos.map((ano) => ({ uf, ano })))
                )
            ),
            Match.orElse(() => service.index)
          )
        )
      ),
  },
  capag: {
    heavy: false,
    run: (scope) =>
      Capag.pipe(
        Effect.flatMap((service) =>
          Match.value(scope.anos).pipe(
            Match.when(
              (anos: readonly number[] | undefined): anos is readonly number[] =>
                anos !== undefined && anos.length > 0,
              (anos) => service.indexAno(Math.max(...anos))
            ),
            Match.orElse(() => service.index)
          )
        )
      ),
  },
  pncp: {
    heavy: true,
    run: (scope) =>
      Pncp.pipe(
        Effect.flatMap((service) =>
          Match.value(monthWindow(scope.mes)).pipe(
            Match.when(Match.undefined, () => service.index),
            Match.orElse((window) =>
              service.indexScope({
                dataInicial: window.dataInicial,
                dataFinal: window.dataFinal,
                modalidades: [...defaultModalidades],
              })
            )
          )
        )
      ),
  },
  "tcu-inidoneos": {
    heavy: false,
    run: () => TcuInidoneos.pipe(Effect.flatMap((service) => service.index)),
  },
  "ibge-economia": {
    heavy: false,
    run: (scope) =>
      IbgeEconomia.pipe(
        Effect.flatMap((service) =>
          Match.value(scope.anos).pipe(
            Match.when(
              (anos: readonly number[] | undefined): anos is readonly number[] =>
                anos !== undefined && anos.length > 0,
              (anos) => service.indexAno(Math.max(...anos))
            ),
            Match.orElse(() => service.index)
          )
        )
      ),
  },
  senado: {
    heavy: false,
    run: (scope) =>
      SenadoFederal.pipe(
        Effect.flatMap((service) =>
          Match.value(scope.anos).pipe(
            Match.when(
              (anos: readonly number[] | undefined): anos is readonly number[] =>
                anos !== undefined && anos.length > 0,
              (anos) => service.indexAno(Math.max(...anos))
            ),
            Match.orElse(() => service.index)
          )
        )
      ),
  },
};
