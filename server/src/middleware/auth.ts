//* middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { UserRole, UserSession } from "../schema";
import { getUserFromCookie } from "../session";
import dotenv from "dotenv";
dotenv.config();

// 擴展 Express Request 類型以包含 user 屬性
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

/**
 * 驗證用戶身份的中間件
 * 如果驗證失敗，直接返回 401 錯誤
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = await getUserFromCookie(req);

    if (!user) {
      return res.status(401).json({
        errorMessage: "Please login first",
      });
    }

    // 驗證用戶數據的完整性
    if (!user.userId || !user.email) {
      return res.status(401).json({
        errorMessage: "Invalid session data. Please login again.",
      });
    }

    // 將用戶信息附加到 request 對象
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      errorMessage: "Authentication service error",
    });
  }
}

/**
 * 可選的身份驗證中間件
 * 如果有 session 則附加用戶信息，沒有也不會阻擋請求
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const user = await getUserFromCookie(req);
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    // 對於可選驗證，錯誤不應該阻擋請求
    next();
  }
}

/**
 * 角色驗證中間件工廠函數
 * 檢查用戶是否具有指定的角色 (限定 UserRole: "user" | "admin" | "contributor")
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        errorMessage: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        errorMessage: "Insufficient permissions",
      });
    }

    next();
  };
}

// 擴展 Request 接口
export interface AuthenticatedRequest extends Request {
  user?: UserSession;
}
