import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // 如果使用者訪問的路徑不是 /earthday 開頭，就將他們導向 /earthday
  if (!pathname.startsWith('/earthday')) {
    const url = request.nextUrl.clone()
    url.pathname = '/earthday'
    return NextResponse.redirect(url)
  }

  // 如果原本就是訪問 /earthday，則放行
  return NextResponse.next()
}

// 設定只有哪些路徑會被 middleware 攔截
export const config = {
  matcher: [
    /*
     * 攔截所有路徑，但是避開以下內容（確保網站素材能正常載入）：
     * - api (API 路由)
     * - _next/static (Next.js 編譯的靜態資源)
     * - _next/image (Next.js 圖片最佳化服務)
     * - 各種副檔名的靜態圖片素材與 favicon 等
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
  ],
}
