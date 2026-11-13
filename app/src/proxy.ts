import { authorize } from "./auth";

export function proxy(request: Request) {
  return authorize(request) ?? undefined;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
