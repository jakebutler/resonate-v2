import type { Id, TableNames } from "@/convex/_generated/dataModel";

/**
 * The one audited cast site for string IDs that cross into Convex calls
 * (route params, loosely-typed query results). The branded return type makes
 * cross-table misuse a compile-time error, and Convex re-validates the real
 * value at the function boundary, so a malformed route param fails at the
 * mutation instead of silently adopting the wrong identity.
 */
export function typedId<TableName extends TableNames>(id: string): Id<TableName> {
  if (!id) throw new Error("Expected a non-empty Convex document ID.");
  return id as Id<TableName>;
}

/**
 * Maps a list of raw string IDs through `typedId` for array-valued args.
 */
export function typedIds<TableName extends TableNames>(
  ids: string[],
): Id<TableName>[] {
  return ids.map((id) => typedId<TableName>(id));
}
