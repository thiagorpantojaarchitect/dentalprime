/**
 * Contrato de paginacao compartilhado.
 *
 * Padroniza como os servicos expoem listagens paginadas: uma consulta
 * (`PageQuery`) com `limit`/`offset` normalizados e um resultado (`Paginated<T>`)
 * com os itens da pagina e o total. Manter isto no core evita divergencia entre
 * os modulos e garante limites sensatos (protege o banco de consultas sem teto).
 *
 * Ver `.kiro/steering/architecture.md` (contratos versionados e compartilhados).
 */

/** Limite padrao de itens por pagina quando nao informado. */
export const DEFAULT_PAGE_LIMIT = 20;

/** Limite maximo de itens por pagina. Protege contra consultas sem teto. */
export const MAX_PAGE_LIMIT = 100;

/** Consulta de paginacao normalizada (sempre com limit/offset validos). */
export interface PageQuery {
  readonly limit: number;
  readonly offset: number;
}

/** Resultado paginado: itens da pagina corrente e o total de registros. */
export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** Entrada crua de paginacao (ex.: query string), antes da normalizacao. */
export interface RawPageQuery {
  readonly limit?: unknown;
  readonly offset?: unknown;
}

function toBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const truncated = Math.trunc(parsed);
  if (truncated < min) {
    return min;
  }
  if (truncated > max) {
    return max;
  }
  return truncated;
}

/**
 * Normaliza uma entrada crua em uma `PageQuery` valida.
 * - `limit`: 1..MAX_PAGE_LIMIT, padrao DEFAULT_PAGE_LIMIT.
 * - `offset`: >= 0, padrao 0.
 * Valores invalidos ou ausentes caem no padrao (nunca lanca).
 */
export function parsePageQuery(raw: RawPageQuery = {}): PageQuery {
  const limit = toBoundedInt(raw.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const offset = toBoundedInt(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  return { limit, offset };
}

/** Monta um resultado paginado a partir dos itens da pagina e do total. */
export function buildPage<T>(
  items: readonly T[],
  total: number,
  query: PageQuery,
): Paginated<T> {
  return {
    items,
    total,
    limit: query.limit,
    offset: query.offset,
  };
}
