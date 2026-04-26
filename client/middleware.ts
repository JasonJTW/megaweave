import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 只攔截 GET 請求（頁面導航），背景的 POST/PUT 等直接放行
  if (request.method !== "GET") {
    return NextResponse.next();
  }

  // 2. 這些路徑永遠放行，不需要驗證
  if (pathname === "/signin" || pathname.startsWith("/earthday")) {
    return NextResponse.next();
  }

  // 3. 讀取 session-id cookie（判斷是否有登入）
  const sessionId = request.cookies.get("session-id")?.value;

  // 4. 如果沒有登入，導向登入頁面（帶上 returnTo 參數）
  if (!sessionId) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(url);
  }

  // 5. 直接從 Cookie 讀取 role，不需要打 API
  // 這個 Cookie 由後端在登入時設置，與 session-id 同時存在
  const userRole = request.cookies.get("user-role")?.value;
  const isAdminOrContributor =
    userRole === "admin" || userRole === "contributor";

  // 6. 根據角色決定去處
  if (isAdminOrContributor) {
    return NextResponse.next();
  } else {
    return NextResponse.redirect(new URL("/earthday", request.url));
  }
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
