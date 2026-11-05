import { Effect, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { CamaraDeputados } from "../sources/camara-deputados/store";
import { Capag } from "../sources/capag/store";
import { CatmatCatser } from "../sources/catmat-catser/store";
import { CmedAnvisa } from "../sources/cmed-anvisa/store";
import { Cnae } from "../sources/cnae/store";
import { IbgeEconomia } from "../sources/ibge-economia/store";
import { IbgeLocalidades } from "../sources/ibge-localidades/store";
import { Legislacao } from "../sources/legislacao/store";
import { PainelPrecos } from "../sources/painel-precos/store";
import { defaultModalidades } from "../sources/pncp/catalog";
import { Pncp } from "../sources/pncp/store";
import { QueridoDiario } from "../sources/querido-diario/store";
import { ReceitaCnpj } from "../sources/receita-cnpj/store";
import { SancoesCgu } from "../sources/sancoes-cgu/store";
import { SenadoFederal } from "../sources/senado/store";
import { Sicaf } from "../sources/sicaf-fornecedores/store";
import { SiconfiFiscal } from "../sources/siconfi-fiscal/store";
import { Sinapi } from "../sources/sinapi/store";
import { Transferegov } from "../sources/transferegov/store";
import { TcuInidoneos } from "../sources/tcu-inidoneos/store";
import { TransparenciaDespesas } from "../sources/transparencia-despesas/store";
import { TseEleitoral } from "../sources/tse-eleitoral/store";
import { failureText, type AppServices } from "./tool";

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
  "cmed-anvisa",
  "siconfi-fiscal",
  "transferegov",
  "painel-precos",
  "transparencia-despesas",
  "sinapi",
]);
export type FonteKey = (typeof FonteKey)["Type"];

export type Scope = {
  readonly ufs?: readonly string[];
  readonly anos?: readonly number[];
  readonly mes?: string;
};

export class IndexFailure extends Schema.TaggedError<
  IndexFailure,
  { readonly brand: unique symbol }
>()("IndexFailure", { text: Schema.String }) {
  override get message() {
    return this.text;
  }
}

export type IndexEntry = {
  readonly heavy: boolean;
  readonly run: (
    scope: Scope
  ) => Effect.Effect<unknown, IndexFailure, AppServices>;
};

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const lastDayOf = (year: number, month: number) =>
  Match.value(month).pipe(
    Match.when(2, () => (isLeapYear(year) ? 29 : 28)),
    Match.whenOr(4, 6, 9, 11, () => 30),
    Match.orElse(() => 31)
  );

const pad2 = (value: number) => Str.padStart(2, "0")(String(value));

const monthWindow = (mes: string | undefined) =>
  Option.fromNullishOr(mes).pipe(
    Option.map((value) => Arr.map(Str.split(value, "-"), Number)),
    Option.flatMap((parts) =>
      Option.all([Arr.get(parts, 0), Arr.get(parts, 1)])
    ),
    Option.map(([year, month]) => ({
      dataInicial: `${year}-${pad2(month)}-01`,
      dataFinal: `${year}-${pad2(month)}-${pad2(lastDayOf(year, month))}`,
    }))
  );

const nonEmptyAnos = (scope: Scope) =>
  Option.fromNullishOr(scope.anos).pipe(
    Option.filter(Arr.isReadonlyArrayNonEmpty)
  );

const nonEmptyUfs = (scope: Scope) =>
  Option.fromNullishOr(scope.ufs).pipe(
    Option.filter(Arr.isReadonlyArrayNonEmpty)
  );

const entry = <A, E, R extends AppServices>(
  heavy: boolean,
  run: (scope: Scope) => Effect.Effect<A, E, R>
): IndexEntry => ({
  heavy,
  run: (scope) =>
    run(scope).pipe(
      Effect.mapError((error) => IndexFailure.make({ text: failureText(error) }))
    ),
});

const byAnos = <E, R, E2, R2>(
  scope: Scope,
  onAnos: (
    anos: Arr.NonEmptyReadonlyArray<number>
  ) => Effect.Effect<unknown, E, R>,
  otherwise: Effect.Effect<unknown, E2, R2>
): Effect.Effect<unknown, E | E2, R | R2> =>
  nonEmptyAnos(scope).pipe(
    Option.match({
      onNone: () => otherwise,
      onSome: onAnos,
    })
  );

const latestAno = (anos: Arr.NonEmptyReadonlyArray<number>) =>
  Math.max(...anos);

export const indexRegistry: Record<FonteKey, IndexEntry> = {
  legislacao: entry(false, () =>
    Legislacao.pipe(Effect.flatMap((service) => service.indexAll))
  ),
  "ibge-localidades": entry(false, () =>
    IbgeLocalidades.pipe(Effect.flatMap((service) => service.index))
  ),
  cnae: entry(false, () => Cnae.pipe(Effect.flatMap((service) => service.index))),
  "catmat-catser": entry(false, () =>
    CatmatCatser.pipe(Effect.flatMap((service) => service.index))
  ),
  "sicaf-fornecedores": entry(false, () =>
    Sicaf.pipe(Effect.flatMap((service) => service.index))
  ),
  "sancoes-cgu": entry(false, () =>
    SancoesCgu.pipe(Effect.flatMap((service) => service.index))
  ),
  "receita-cnpj": entry(true, () =>
    ReceitaCnpj.pipe(Effect.flatMap((service) => service.index))
  ),
  "tse-eleitoral": entry(true, (scope) =>
    TseEleitoral.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAnos(anos), service.index)
      )
    )
  ),
  "camara-deputados": entry(true, (scope) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAnos(anos), service.index)
      )
    )
  ),
  "querido-diario": entry(true, (scope) =>
    QueridoDiario.pipe(
      Effect.flatMap((service) =>
        Option.all({ ufs: nonEmptyUfs(scope), anos: nonEmptyAnos(scope) }).pipe(
          Option.match({
            onNone: () => service.index,
            onSome: ({ ufs, anos }) =>
              service.indexScope(
                Arr.flatMap(ufs, (uf) => Arr.map(anos, (ano) => ({ uf, ano })))
              ),
          })
        )
      )
    )
  ),
  capag: entry(false, (scope) =>
    Capag.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAno(latestAno(anos)), service.index)
      )
    )
  ),
  pncp: entry(true, (scope) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        monthWindow(scope.mes).pipe(
          Option.match({
            onNone: () => service.index,
            onSome: (window) =>
              service.indexScope({
                dataInicial: window.dataInicial,
                dataFinal: window.dataFinal,
                modalidades: [...defaultModalidades],
              }),
          })
        )
      )
    )
  ),
  "tcu-inidoneos": entry(false, () =>
    TcuInidoneos.pipe(Effect.flatMap((service) => service.index))
  ),
  "ibge-economia": entry(false, (scope) =>
    IbgeEconomia.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAno(latestAno(anos)), service.index)
      )
    )
  ),
  senado: entry(false, (scope) =>
    SenadoFederal.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAno(latestAno(anos)), service.index)
      )
    )
  ),
  "cmed-anvisa": entry(false, () =>
    CmedAnvisa.pipe(Effect.flatMap((service) => service.index))
  ),
  "siconfi-fiscal": entry(true, (scope) =>
    SiconfiFiscal.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAno(latestAno(anos)), service.index)
      )
    )
  ),
  transferegov: entry(true, () =>
    Transferegov.pipe(Effect.flatMap((service) => service.index))
  ),
  "painel-precos": entry(true, () =>
    PainelPrecos.pipe(Effect.flatMap((service) => service.index))
  ),
  "transparencia-despesas": entry(true, (scope) =>
    TransparenciaDespesas.pipe(
      Effect.flatMap((service) =>
        Option.fromNullishOr(scope.mes).pipe(
          Option.match({
            onNone: () => service.index,
            onSome: (mes) => service.indexMes(mes),
          })
        )
      )
    )
  ),
  sinapi: entry(true, (scope) =>
    Sinapi.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAno(latestAno(anos)), service.index)
      )
    )
  ),
};
