import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // 不再需要认证，所有用户通过设备指纹识别
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
