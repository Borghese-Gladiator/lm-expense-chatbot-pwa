import { handle, sharedCtx } from "@/server/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ path: string[] }> };

async function route(req: Request, { params }: Params) {
  return handle(await sharedCtx(), req, (await params).path);
}

export { route as DELETE, route as GET, route as PATCH, route as POST, route as PUT };
