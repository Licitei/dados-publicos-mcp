/**
 * Converte data nos formatos "AAAAMMDD" ou "dd/mm/aaaa" para "AAAA-MM-DD".
 * "0" / "00000000" / vazio / invalido -> null.
 */
export function parseDataBr(s: string | undefined | null): string | null {
  if (s === undefined || s === null) return null;

  const trimmed = String(s).trim();

  if (!trimmed) return null;
  if (/^0+$/.test(trimmed)) return null;

  // AAAAMMDD
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (compact) {
    return buildDate(compact[1], compact[2], compact[3]);
  }

  // dd/mm/aaaa (aceita "-" como separador tambem)
  const slashed = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (slashed) {
    return buildDate(
      slashed[3],
      slashed[2].padStart(2, "0"),
      slashed[1].padStart(2, "0"),
    );
  }

  // aaaa-mm-dd ja normalizado
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (iso) {
    return buildDate(iso[1], iso[2], iso[3]);
  }

  return null;
}

function buildDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 1) return null;

  return `${year}-${month}-${day}`;
}
