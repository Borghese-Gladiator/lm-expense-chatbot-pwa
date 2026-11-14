import { authorize } from "./auth";

export async function proxy(request: Request) {
  return (await authorize(request)) ?? undefined;
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
