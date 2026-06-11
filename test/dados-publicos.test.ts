import { Result } from "better-result";
import { expect, test } from "bun:test";
import {
  normalizeCnpj,
  parseNumeroControlePncp,
  splitDateBuckets,
} from "../src/modules/dados-publicos/utils";

test("normaliza CNPJ com pontuacao", () => {
  expect(normalizeCnpj("00.000.000/0001-91")).toBe("00000000000191");
});

test("extrai identificador PNCP do numero de controle", () => {
  const parsed = parseNumeroControlePncp("00000000000191-1-000123/2026");
  expect(Result.isOk(parsed)).toBe(true);
  if (Result.isOk(parsed)) {
    expect(parsed.value).toEqual({
      orgaoCnpj: "00000000000191",
      ano: 2026,
      sequencial: 123,
    });
  }
});

test("numeroControlePNCP invalido retorna erro declarativo do catalogo", () => {
  const parsed = parseNumeroControlePncp("formato-errado");
  expect(Result.isError(parsed)).toBe(true);
  if (Result.isError(parsed)) {
    expect(parsed.error.code).toBe("dados-publicos.NUMERO_CONTROLE_INVALIDO");
  }
});

test("quebra janela mensal para agregacao", () => {
  expect(
    splitDateBuckets({
      dataInicial: "20260115",
      dataFinal: "20260302",
      granularidade: "mes",
    })
  ).toEqual([
    { chave: "2026-01", dataInicial: "20260115", dataFinal: "20260131" },
    { chave: "2026-02", dataInicial: "20260201", dataFinal: "20260228" },
    { chave: "2026-03", dataInicial: "20260301", dataFinal: "20260302" },
  ]);
});
