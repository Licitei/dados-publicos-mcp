import { panic } from "better-result";

/**
 * Normaliza texto para busca: remove acentos, lowercase,
 * troca qualquer coisa que nao seja letra/numero por espaco e faz trim.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

/** Remove tudo que nao for digito (para casar CNPJ/CPF entre fontes). */
export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Normaliza CNPJ para 14 digitos. Lanca se invalido. */
export function normalizeCnpj(s: string): string {
  const digits = onlyDigits(s);

  if (!/^\d{14}$/.test(digits)) {
    panic(`CNPJ invalido: ${s}. Use 14 digitos.`);
  }

  return digits;
}
