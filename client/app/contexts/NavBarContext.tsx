"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { usePathname } from "next/navigation";

interface NavbarContextType {
  isNavbarVisible: boolean;
  isAtTop: boolean;
  hasUserScrolled: boolean;
  showNavbar: () => void;
}

const NavbarContext = createContext<NavbarContextType>({
  isNavbarVisible: true,
  isAtTop: true,
  hasUserScrolled: false,
  showNavbar: () => {},
});

export const useNavbar = () => useContext(NavbarContext);

const HIDDEN_BY_DEFAULT_ROUTES = ["/about", "/members"];

export const NavbarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const pathname = usePathname();
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  const hasScrolledRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const isNavigatingRef = useRef(false); // 標記是否剛完成路由跳轉

  // 當路由變更時，設定初始狀態並開啓跳轉保護
  useEffect(() => {
    const isHiddenRoute = HIDDEN_BY_DEFAULT_ROUTES.some((route) =>
      pathname.startsWith(route),
    );

    isNavigatingRef.current = true; // 開啓保護：忽略跳轉產生的自動滾動

    if (isHiddenRoute) {
      setIsNavbarVisible(false);
      setHasUserScrolled(false);
      hasScrolledRef.current = false;
    } else {
      setIsNavbarVisible(true);
      setHasUserScrolled(true);
      hasScrolledRef.current = true;
    }

    lastScrollYRef.current = typeof window !== "undefined" ? window.scrollY : 0;

    // 200ms 後關閉保護，恢復正常的滾動偵測
    const timer = setTimeout(() => {
      isNavigatingRef.current = false;
      lastScrollYRef.current =
        typeof window !== "undefined" ? window.scrollY : 0;
    }, 1000);

    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const controlNavbar = () => {
      // 若處於頁面跳轉置頂的冷卻期，直接忽略並同步當前 scrollY
      if (isNavigatingRef.current) {
        lastScrollYRef.current = window.scrollY;
        return;
      }

      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollYRef.current;
      lastScrollYRef.current = currentScrollY;

      setIsAtTop(currentScrollY < 10);

      const isHiddenRoute = HIDDEN_BY_DEFAULT_ROUTES.some((route) =>
        pathname.startsWith(route),
      );

      // 若在預設隱藏頁面且尚未觸發過手動滾動
      if (isHiddenRoute && !hasScrolledRef.current) {
        // 只有當「向下滾動超過 5px」或「滾動距離大於 30px」時，才判定為使用者手動開始滑動
        if (delta > 5 || currentScrollY > 30) {
          hasScrolledRef.current = true;
          setHasUserScrolled(true);
          setIsNavbarVisible(true); // 使用者手動滑動，顯示 Navbar
        }
        return;
      }

      // 一般顯示/隱藏邏輯（輕鬆滑出與隱藏）
      if (delta > 3 && currentScrollY > 60) {
        // 往下滑動輕鬆隱藏
        setIsNavbarVisible(false);
      } else if (delta < -2) {
        // 只要向上輕微滑動即可輕鬆滑出顯示
        setIsNavbarVisible(true);
      } else if (currentScrollY <= 10) {
        // 捲動回到最頂部時顯示（非預設隱藏頁面）
        if (!isHiddenRoute) {
          setIsNavbarVisible(true);
        }
      }
    };

    window.addEventListener("scroll", controlNavbar, { passive: true });
    return () => window.removeEventListener("scroll", controlNavbar);
  }, [pathname]);

  const showNavbar = () => {
    setIsNavbarVisible(true);
  };

  return (
    <NavbarContext.Provider
      value={{ isNavbarVisible, isAtTop, hasUserScrolled, showNavbar }}
    >
      {children}
    </NavbarContext.Provider>
  );
};
