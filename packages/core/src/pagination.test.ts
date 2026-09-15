import { describe, it, expect } from "vitest";

import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  buildPage,
  parsePageQuery,
} from "./pagination.js";

describe("parsePageQuery", () => {
  it("usa padroes quando a entrada e vazia", () => {
    expect(parsePageQuery()).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
    expect(parsePageQuery({})).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
  });

  it("aceita numeros e strings numericas", () => {
    expect(parsePageQuery({ limit: 10, offset: 5 })).toEqual({ limit: 10, offset: 5 });
    expect(parsePageQuery({ limit: "10", offset: "5" })).toEqual({
      limit: 10,
      offset: 5,
    });
  });

  it("aplica o limite maximo", () => {
    expect(parsePageQuery({ limit: 9999 }).limit).toBe(MAX_PAGE_LIMIT);
  });

  it("forca limit minimo de 1 e offset minimo de 0", () => {
    expect(parsePageQuery({ limit: 0 }).limit).toBe(1);
    expect(parsePageQuery({ limit: -5 }).limit).toBe(1);
    expect(parsePageQuery({ offset: -5 }).offset).toBe(0);
  });

  it("cai no padrao para valores invalidos", () => {
    expect(parsePageQuery({ limit: "abc", offset: "xyz" })).toEqual({
      limit: DEFAULT_PAGE_LIMIT,
      offset: 0,
    });
    expect(parsePageQuery({ limit: Number.NaN })).toEqual({
      limit: DEFAULT_PAGE_LIMIT,
      offset: 0,
    });
  });

  it("trunca valores fracionarios", () => {
    expect(parsePageQuery({ limit: 10.9, offset: 3.2 })).toEqual({
      limit: 10,
      offset: 3,
    });
  });
});

describe("buildPage", () => {
  it("monta o resultado paginado com metadados da consulta", () => {
    const query = parsePageQuery({ limit: 2, offset: 4 });
    const page = buildPage(["a", "b"], 42, query);
    expect(page).toEqual({ items: ["a", "b"], total: 42, limit: 2, offset: 4 });
  });

  it("aceita lista vazia", () => {
    const page = buildPage([], 0, parsePageQuery());
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});
