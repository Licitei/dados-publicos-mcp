import { Effect, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import * as Rec from "effect/Record";
import {
  CamaraDeputados,
  cotaTable,
  deputadoTable,
  proposicaoAutorTable,
  proposicaoTable,
} from "../sources/camara-deputados/store";
import {
  Capag,
  capagEstadoTable,
  capagMunicipioTable,
  siconfiEnteTable,
} from "../sources/capag/store";
import { catmatMaterialTable, catserServiceTable } from "../sources/catmat-catser/catalog";
import { CmedAnvisa, medicamentoCmedTable } from "../sources/cmed-anvisa/store";
import { Cnae, cnaeTable } from "../sources/cnae/store";
import { IbgeEconomia, municipioEconomiaTable } from "../sources/ibge-economia/store";
import { IbgeLocalidades, municipioTable } from "../sources/ibge-localidades/store";
import { precoPraticadoTable } from "../sources/painel-precos/catalog";
import {
  ataTable,
  contratacaoTable,
  contratoFornecedorTable,
  contratoTable,
  defaultModalidades,
} from "../sources/pncp/catalog";
import { QueridoDiario, diarioCnpjTable, diarioTable } from "../sources/querido-diario/store";
import { sancaoTable } from "../sources/sancoes-cgu/catalog";
import { SenadoFederal, ceapsTable, senadorTable } from "../sources/senado/store";
import { fornecedorTable } from "../sources/sicaf-fornecedores/catalog";
import { SiconfiFiscal, siconfiFatoTable } from "../sources/siconfi-fiscal/store";
import { Sinapi, sinapiInsumoTable } from "../sources/sinapi/store";
import { tcuInidoneoTable } from "../sources/tcu-inidoneos/catalog";
import { convenioTable } from "../sources/transferegov/catalog";
import { despesaFederalTable } from "../sources/transparencia-despesas/catalog";
import {
  TseEleitoral,
  bemTable,
  candidatoTable,
  despesaTable,
  receitaOriginarioTable,
  receitaTable,
} from "../sources/tse-eleitoral/store";
import { CatmatCatser } from "../sources/catmat-catser/store";
import type { DuckTable } from "../kernel/duck/duck";
import { CorpusGit, corpusDir } from "../kernel/search/corpus";
import { PainelPrecos } from "../sources/painel-precos/store";
import { Pncp } from "../sources/pncp/store";
import { ReceitaCnpj } from "../sources/receita-cnpj/store";
import { SancoesCgu } from "../sources/sancoes-cgu/store";
import { Sicaf } from "../sources/sicaf-fornecedores/store";
import { Transferegov } from "../sources/transferegov/store";
import { TcuInidoneos } from "../sources/tcu-inidoneos/store";
import { TransparenciaDespesas } from "../sources/transparencia-despesas/store";
import { type AppServices, failureText } from "./tool";

export const FonteKey = Schema.Literals([
  "leis",
  "precedentes",
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
  readonly tables: readonly DuckTable[];
  readonly version?: Effect.Effect<string, IndexFailure, AppServices>;
  readonly run: (scope: Scope) => Effect.Effect<unknown, IndexFailure, AppServices>;
};

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

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
    Option.flatMap((parts) => Option.all([Arr.get(parts, 0), Arr.get(parts, 1)])),
    Option.map(([year, month]) => ({
      dataInicial: `${year}-${pad2(month)}-01`,
      dataFinal: `${year}-${pad2(month)}-${pad2(lastDayOf(year, month))}`,
    }))
  );

const nonEmptyAnos = (scope: Scope) =>
  Option.fromNullishOr(scope.anos).pipe(Option.filter(Arr.isReadonlyArrayNonEmpty));

const nonEmptyUfs = (scope: Scope) =>
  Option.fromNullishOr(scope.ufs).pipe(Option.filter(Arr.isReadonlyArrayNonEmpty));

const versioned = <E, R extends AppServices>(version: Effect.Effect<string, E, R>) =>
  version.pipe(Effect.mapError((error) => IndexFailure.make({ text: failureText(error) })));

const entry = <A, E, R extends AppServices>(
  heavy: boolean,
  run: (scope: Scope) => Effect.Effect<A, E, R>
): Omit<IndexEntry, "tables"> => ({
  heavy,
  run: (scope) =>
    run(scope).pipe(Effect.mapError((error) => IndexFailure.make({ text: failureText(error) }))),
});

const byAnos = <E, R, E2, R2>(
  scope: Scope,
  onAnos: (anos: Arr.NonEmptyReadonlyArray<number>) => Effect.Effect<unknown, E, R>,
  otherwise: Effect.Effect<unknown, E2, R2>
): Effect.Effect<unknown, E | E2, R | R2> =>
  nonEmptyAnos(scope).pipe(
    Option.match({
      onNone: () => otherwise,
      onSome: onAnos,
    })
  );

const latestAno = (anos: Arr.NonEmptyReadonlyArray<number>) => Math.max(...anos);

const entries: Record<FonteKey, Omit<IndexEntry, "tables">> = {
  leis: {
    ...entry(true, () =>
      Effect.gen(function* () {
        const git = yield* CorpusGit;
        const dir = yield* corpusDir("leis");
        return yield* git.sync("leis", { dir, paths: [] });
      })
    ),
    version: versioned(CorpusGit.pipe(Effect.flatMap((git) => git.remoteHead("leis")))),
  },
  precedentes: {
    ...entry(false, () =>
      Effect.gen(function* () {
        const git = yield* CorpusGit;
        const dir = yield* corpusDir("precedentes");
        return yield* git.sync("precedentes", { dir, paths: [] });
      })
    ),
    version: versioned(CorpusGit.pipe(Effect.flatMap((git) => git.remoteHead("precedentes")))),
  },
  "ibge-localidades": entry(false, () =>
    IbgeLocalidades.pipe(Effect.flatMap((service) => service.index))
  ),
  cnae: entry(false, () => Cnae.pipe(Effect.flatMap((service) => service.index))),
  "catmat-catser": entry(false, () =>
    CatmatCatser.pipe(Effect.flatMap((service) => service.index))
  ),
  "sicaf-fornecedores": entry(false, () => Sicaf.pipe(Effect.flatMap((service) => service.index))),
  "sancoes-cgu": entry(false, () => SancoesCgu.pipe(Effect.flatMap((service) => service.index))),
  "receita-cnpj": entry(true, () => ReceitaCnpj.pipe(Effect.flatMap((service) => service.index))),
  "tse-eleitoral": entry(true, (scope) =>
    TseEleitoral.pipe(
      Effect.flatMap((service) => byAnos(scope, (anos) => service.indexAnos(anos), service.index))
    )
  ),
  "camara-deputados": entry(true, (scope) =>
    CamaraDeputados.pipe(
      Effect.flatMap((service) => byAnos(scope, (anos) => service.indexAnos(anos), service.index))
    )
  ),
  "querido-diario": entry(true, (scope) =>
    QueridoDiario.pipe(
      Effect.flatMap((service) =>
        Option.all({ ufs: nonEmptyUfs(scope), anos: nonEmptyAnos(scope) }).pipe(
          Option.match({
            onNone: () => service.index,
            onSome: ({ ufs, anos }) =>
              service.indexScope(Arr.flatMap(ufs, (uf) => Arr.map(anos, (ano) => ({ uf, ano })))),
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
  "cmed-anvisa": entry(false, () => CmedAnvisa.pipe(Effect.flatMap((service) => service.index))),
  "siconfi-fiscal": entry(true, (scope) =>
    SiconfiFiscal.pipe(
      Effect.flatMap((service) =>
        byAnos(scope, (anos) => service.indexAno(latestAno(anos)), service.index)
      )
    )
  ),
  transferegov: entry(true, () => Transferegov.pipe(Effect.flatMap((service) => service.index))),
  "painel-precos": entry(true, () => PainelPrecos.pipe(Effect.flatMap((service) => service.index))),
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

const fonteTables: Record<FonteKey, readonly DuckTable[]> = {
  leis: [],
  precedentes: [],
  "ibge-localidades": [municipioTable],
  cnae: [cnaeTable],
  "catmat-catser": [catmatMaterialTable, catserServiceTable],
  "sicaf-fornecedores": [fornecedorTable],
  "sancoes-cgu": [sancaoTable],
  "receita-cnpj": [],
  "tse-eleitoral": [candidatoTable, bemTable, receitaTable, despesaTable, receitaOriginarioTable],
  "camara-deputados": [deputadoTable, cotaTable, proposicaoTable, proposicaoAutorTable],
  "querido-diario": [diarioTable, diarioCnpjTable],
  capag: [capagEstadoTable, capagMunicipioTable, siconfiEnteTable],
  pncp: [contratacaoTable, contratoTable, contratoFornecedorTable, ataTable],
  "tcu-inidoneos": [tcuInidoneoTable],
  "ibge-economia": [municipioEconomiaTable],
  senado: [senadorTable, ceapsTable],
  "cmed-anvisa": [medicamentoCmedTable],
  "siconfi-fiscal": [siconfiFatoTable],
  transferegov: [convenioTable],
  "painel-precos": [precoPraticadoTable],
  "transparencia-despesas": [despesaFederalTable],
  sinapi: [sinapiInsumoTable],
};

export const indexRegistry: Record<FonteKey, IndexEntry> = Rec.map(entries, (base, fonte) => ({
  ...base,
  tables: fonteTables[fonte],
}));
