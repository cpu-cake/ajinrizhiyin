import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// 所有过程都是公开的，因为认证已移除
export const protectedProcedure = t.procedure;
export const adminProcedure = t.procedure;
