import { parseAsString, parseAsInteger, parseAsArrayOf, createParser } from 'nuqs/server';

// Custom parser for DateFilter
export const parseAsDateFilter = createParser({
  parse(queryValue) {
    try {
      return JSON.parse(queryValue);
    } catch {
      return { preset: "all" };
    }
  },
  serialize(value) {
    return JSON.stringify(value);
  },
});

// Custom parser for ColumnFilters
export const parseAsColumnFilters = createParser({
  parse(queryValue) {
    try {
      return JSON.parse(queryValue);
    } catch {
      return [];
    }
  },
  serialize(value) {
    return JSON.stringify(value);
  },
});

export const searchParams = {
  pipeline: parseAsString.withDefault('all'),
  responsible: parseAsString.withDefault('all'),
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
  size: parseAsInteger.withDefault(50),
  date: parseAsDateFilter.withDefault({ preset: "all" }),
  cols: parseAsArrayOf(parseAsString).withDefault([]),
  filters: parseAsColumnFilters.withDefault([]),
};
