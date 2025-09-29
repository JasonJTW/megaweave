"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Menu,
  Home,
  UserCog,
  Info,
  Mail,
  GalleryHorizontalEnd,
  // FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

// 型別定義
type MainNavigationItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavigationItem = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const Navbar = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // 主要導航項目
  const mainNavItems: MainNavigationItem[] = [
    { href: "/", label: "Home", icon: Home },
    { href: "/user", label: "Profile", icon: UserCog },
  ];

  // 下拉菜單項目
  const teamMenuItems: NavigationItem[] = [
    {
      href: "/about",
      title: "Team Overview",
      description: "Meet our amazing team members",
      icon: UserCog,
    },
    {
      href: "/about",
      title: "Timeline",
      description: "Our timeline and milestones",
      icon: GalleryHorizontalEnd,
    },
  ];

  // 移動端菜單項目（統一格式）
  const mobileNavItems: NavigationItem[] = [
    {
      href: "/",
      title: "Posts",
      description: "Navigate to Posts",
      icon: Home,
    },
    {
      href: "/user",
      title: "Profile",
      description: "User Profile",
      icon: UserCog,
    },
    {
      href: "/about",
      title: "About",
      description: "Navigate to About",
      icon: Info,
    },
    ...teamMenuItems,
    {
      href: "/contact",
      title: "Contact",
      description: "Get in touch with us",
      icon: Mail,
    },
  ];

  useEffect(() => {
    const controlNavbar = () => {
      const currentScrollY = window.scrollY;

      setIsAtTop(currentScrollY < 10);

      if (currentScrollY < 100) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
        setIsMobileMenuOpen(false);
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", controlNavbar);
    return () => window.removeEventListener("scroll", controlNavbar);
  }, [lastScrollY]);

  const isActivePath = (path: string) => {
    if (path === "/") {
      return pathname === path;
    }
    return pathname.startsWith(path);
  };

  return (
    <>
      {/* 導航欄 */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
          isVisible ? "translate-y-0" : "-translate-y-full"
        } ${
          isAtTop
            ? "bg-transparent"
            : "bg-megaweave-red-light/20 backdrop-blur-lg shadow-lg"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-24">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0 group">
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-3">
                  <Image
                    src="/favicon.ico"
                    alt="megaweaving icon"
                    width={32}
                    height={32}
                    className="rounded-sm"
                  />
                  <span className="text-2xl sm:text-2xl font-semibold text-megaweave-forest font-ddin ">
                    megaweaving
                  </span>
                </div>
              </div>
            </Link>

            {/* 桌面導航 */}
            <div className="hidden lg:block">
              <NavigationMenu>
                <NavigationMenuList>
                  {/* 主要導航項目 */}
                  {mainNavItems.map((item) => (
                    <NavigationMenuItem key={item.href}>
                      <NavigationMenuLink
                        asChild
                        className={cn(
                          navigationMenuTriggerStyle(),
                          "transition-all duration-200",
                          isActivePath(item.href)
                            ? isAtTop
                              ? "text-gray-50 bg-primary-75 font-semibold"
                              : "text-gray-50 bg-primary-75 font-semibold "
                            : isAtTop
                            ? "text-green/90 hover:text-blue bg-transparent hover:bg-white/10"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                        )}
                      >
                        <Link href={item.href}>
                          <item.icon className="w-4 h-4 mr-2" />
                          {item.label}
                        </Link>
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  ))}

                  {/* Team 下拉菜單 */}
                  <NavigationMenuItem>
                    <NavigationMenuTrigger
                      className={cn(
                        "transition-all duration-200",
                        isAtTop
                          ? "text-primary-75 hover:text-white data-[state=open]:text-megaweave-blue bg-transparent"
                          : "text-primary-75 hover:text-gray-900 data-[state=open]:text-megaweave-blue "
                      )}
                    >
                      <UserCog className="w-4 h-4 mr-2" />
                      Team
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px]">
                        {teamMenuItems.map((item) => (
                          <ListItem
                            key={item.href}
                            title={item.title}
                            href={item.href}
                            icon={item.icon}
                          >
                            {item.description}
                          </ListItem>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  {/* Contact 連結 */}
                  <NavigationMenuItem>
                    <NavigationMenuLink
                      asChild
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "transition-all duration-200",
                        isActivePath("/contact")
                          ? isAtTop
                            ? "text-gray-50 bg-primary-75 font-semibold"
                            : "text-gray-50 bg-primary/55 font-semibold "
                          : isAtTop
                          ? "text-green/90 hover:text-blue bg-transparent hover:bg-white/10"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      <Link href="/contact">
                        <Mail className="w-4 h-4 mr-2" />
                        Contact
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </div>

            {/* 移動端菜單按鈕 */}
            <div className="lg:hidden">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "p-2 transition-all duration-200",
                      isAtTop
                        ? "text-megaweave-forest-dark hover:bg-white/10 hover:text-megaweave-forest-light"
                        : "text-gray-900 hover:bg-gray-100"
                    )}
                  >
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 sm:w-96">
                  <div className="space-y-2">
                    {mobileNavItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "flex items-start space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                            isActivePath(item.href)
                              ? "text-gray-900 bg-gray-100 border border-gray-200"
                              : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                          )}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      {/* 佔位符 */}
      <div className="h-16" />
    </>
  );
};

// 下拉菜單項目組件
const ListItem = React.forwardRef<
  React.ComponentRef<typeof Link>,
  React.ComponentPropsWithoutRef<typeof Link> & {
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
  }
>(({ className, title, children, icon: Icon, href = "#", ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          ref={ref}
          href={href}
          className={cn(
            "block select-none space-y-1 rounded-lg p-4 leading-none no-underline outline-none transition-all duration-200 hover:bg-gray-50 hover:text-gray-900 focus:bg-gray-50 focus:text-gray-900 group",
            className
          )}
          {...props}
        >
          <div className="flex items-center space-x-3">
            {Icon && (
              <Icon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
            )}
            <div className="text-sm font-medium leading-none group-hover:text-gray-900">
              {title}
            </div>
          </div>
          <p className="line-clamp-2 text-sm leading-snug text-gray-600 group-hover:text-gray-700 ml-8">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export default Navbar;
