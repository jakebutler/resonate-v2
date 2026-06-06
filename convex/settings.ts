import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    return settings;
  },
});

export const upsert = mutation({
  args: {
    blogEnabled: v.boolean(),
    blogFrequency: v.string(),
    linkedinEnabled: v.boolean(),
    linkedinFrequency: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("settings", args);
    }
  },
});
