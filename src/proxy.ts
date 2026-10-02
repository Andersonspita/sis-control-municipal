import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerToken } from "@/lib/auth/token";

const ROTAS_PUBLICAS = ["/login", "/propostas-visuais"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publica = ROTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const sid = await lerToken(request.cookies.get(COOKIE_SESSAO)?.value);

  if (!sid && !publica) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("voltar", pathname);
    return NextResponse.redirect(url);
  }
  // Usuário já logado em /login é tratado na própria página, após conferir a sessão no banco
  // (um token válido pode pertencer a uma sessão já revogada).
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
