import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  //* Allow all access to all page for now.
  return NextResponse.next();

  const { pathname } = request.nextUrl;

  // 1. 只攔截 GET 請求（頁面導航），背景的 POST/PUT 等直接放行
  if (request.method !== "GET") {
    return NextResponse.next();
  }

  // 2. 這些路徑永遠放行，不需要驗證
  if (pathname === "/signin" || pathname.startsWith("/earthday")) {
    return NextResponse.next();
  }

  // 3. 讀取 Cookie 判斷身份
  const sessionId = request.cookies.get("session-id")?.value;
  const userRole = request.cookies.get("user-role")?.value;
  const isAdminOrContributor =
    userRole === "admin" || userRole === "contributor";

  // 4. 授權驗證
  // 只有同時具備 session-id 且身分是 admin 或 contributor 才能通行
  if (sessionId && isAdminOrContributor) {
    return NextResponse.next();
  }

  // 5. 其他所有人（未登入、或權限不足）全部導向 /earthday
  return NextResponse.redirect(new URL("/earthday", request.url));
}

// 設定只有哪些路徑會被 middleware 攔截
export const config = {
  matcher: [
    /*
     * 攔截所有路徑，但是避開以下內容：
     * - api (API 路由)
     * - _next/static, _next/image (Next.js 內部資源)
     * - 靜態素材 (svg, png, jpg, json 等副檔名)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|json|txt)$).*)",
  ],
};
