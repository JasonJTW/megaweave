import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionId = request.cookies.get("session-id")?.value;
  if (pathname === "/signin" || pathname.startsWith("/earthday")) {
    return NextResponse.next();
  }

  if (!sessionId) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(url);
  }

  let isAdminOrContributor = false;
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  try {
    const response = await fetch(`${hostName}/api/currentUser`, {
      headers: {
        Cookie: `session-id=${sessionId}`,
      },
    });

    if (response.status === 200) {
      const data = await response.json();
      console.log("Middleware auth check user data:", data);
      if (data?.user?.role === "admin" || data?.user?.role === "contributor") {
        isAdminOrContributor = true;
      }
    }
  } catch (error) {
    console.error("Middleware auth check failed:", error);
  }

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
     * 調整後的 Matcher：
     * 1. 排除 api
     * 2. 排除 _next 內部檔案
     * 3. 排除所有常見靜態檔案副檔名 (加上了 .json, .ico, .txt 等)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|json|txt)$).*)",
  ],
};
