import type { MutationCtx } from "../../_generated/server";
import type { Id, TableNames } from "../../_generated/dataModel";

type StoredDoc = Record<string, unknown> & { _id: string };

function nextId(table: string, counter: number) {
  return `${table}:${counter}` as Id<TableNames>;
}

function matchesIndex(
  indexName: string,
  doc: StoredDoc,
  filters: Array<{ field: string; value: unknown }>
) {
  if (indexName === "by_idea") {
    return filters.every((filter) => doc[filter.field] === filter.value);
  }
  if (indexName === "by_brand_and_channel") {
    return filters.every((filter) => doc[filter.field] === filter.value);
  }
  if (indexName === "by_user_and_brand") {
    return filters.every((filter) => doc[filter.field] === filter.value);
  }
  return filters.every((filter) => doc[filter.field] === filter.value);
}

export function createMockMutationCtx(options: {
  userId: string;
  seed?: Partial<Record<TableNames, StoredDoc[]>>;
}) {
  const tables = new Map<TableNames, StoredDoc[]>();
  const counters = new Map<TableNames, number>();

  for (const [table, docs] of Object.entries(options.seed ?? {})) {
    tables.set(table as TableNames, docs.map((doc) => ({ ...doc })));
    counters.set(
      table as TableNames,
      docs.reduce((max, doc) => {
        const suffix = Number(String(doc._id).split(":")[1] ?? 0);
        return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
      }, 0)
    );
  }

  function tableDocs(table: TableNames) {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  }

  const db = {
    get(id: Id<TableNames>) {
      for (const docs of tables.values()) {
        const found = docs.find((doc) => doc._id === id);
        if (found) return found;
      }
      return null;
    },
    insert<T extends TableNames>(table: T, doc: Omit<StoredDoc, "_id">) {
      const next = (counters.get(table) ?? 0) + 1;
      counters.set(table, next);
      const stored = { ...doc, _id: nextId(table, next) } as StoredDoc;
      tableDocs(table).push(stored);
      return stored._id as Id<T>;
    },
    patch(id: Id<TableNames>, patch: Partial<StoredDoc>) {
      for (const docs of tables.values()) {
        const index = docs.findIndex((doc) => doc._id === id);
        if (index >= 0) {
          docs[index] = { ...docs[index], ...patch };
          return;
        }
      }
      throw new Error(`Document not found: ${String(id)}`);
    },
    query(table: TableNames) {
      return {
        withIndex(indexName: string, builder: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) {
          const filters: Array<{ field: string; value: unknown }> = [];
          const queryBuilder = {
            eq(field: string, value: unknown) {
              filters.push({ field, value });
              return queryBuilder;
            },
          };
          builder(queryBuilder);

          const results = tableDocs(table).filter((doc) =>
            matchesIndex(indexName, doc, filters)
          );

          return {
            first: async () => results[0] ?? null,
            collect: async () => [...results],
          };
        },
      };
    },
  };

  const ctx = {
    auth: {
      getUserIdentity: async () => ({ subject: options.userId }),
    },
    db,
  } as unknown as MutationCtx;

  return {
    ctx,
    tables,
    tableDocs,
  };
}
