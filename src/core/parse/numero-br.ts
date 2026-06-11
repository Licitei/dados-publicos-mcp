/**
 * Converte numero no formato brasileiro para number.
 * "5.000,00" -> 5000; "1.234,56" -> 1234.56; vazio/invalido -> null.
 * Aceita tambem ponto decimal ("5000.00") quando nao houver virgula.
 */
export function parseNumeroBr(s: string | undefined | null): number | null {
  if (s === undefined || s === null) return null;

  const trimmed = String(s).trim();

  if (!trimmed) return null;

  const hasComma = trimmed.includes(",");
  // Formato BR: pontos sao milhar, virgula e decimal.
  // Sem virgula: ponto pode ser decimal (formato neutro), entao mantem.
  const normalized = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const cleaned = normalized.replace(/[^\d.\-]/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }

  const value = Number(cleaned);

  return Number.isFinite(value) ? value : null;
}
