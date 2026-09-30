import { defineTable } from "convex/server";
import { v } from "convex/values";
import { brandIdValidator } from "./campaignAccess";

export const visualStorageTables = {
  v2StorageUploads: defineTable({
    storageId: v.id("_storage"), userId: v.string(), brandId: v.union(v.null(), brandIdValidator),
    sha256: v.string(), bytes: v.number(), contentType: v.string(), fileName: v.string(), createdAt: v.number(),
  }).index("by_storageId", ["storageId"]),
};
