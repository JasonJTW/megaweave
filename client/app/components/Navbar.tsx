"use client";

import React, { useState, useEffect } from "react";
import { useNavbar } from "../contexts/NavBarContext";
import { useSocket } from "@/hooks/useSocket";
import Link from "next/link";
import Image from "next/image";
import UserIcon from "./icons/UserIcon";
import TeamIcon from "./icons/TeamIcon";
import { usePathname } from "next/navigation";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Menu,
  // Info,
  // Mail,
  GalleryHorizontalEnd,
  SquarePlus,
  Bell,
  // FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const { isNavbarVisible, isAtTop } = useNavbar();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const [userId, setUserId] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Custom socket hook usage inside component after we have userId
  // But hooks must be top level. 
  // Solution: pass userId to a wrapper or just use the hook with skipped connection if null?
  // Let's check useSocket signature. Assuming it handles null/empty string gracefully or we pass string.
  
  // Since we don't know userId yet, we can't call useSocket at top level safely if it depends on it immediately?
  // Usually hooks are fine.
  
  // Let's implement fetchUser first.
  useEffect(() => {
    const fetchUserAndNotifications = async () => {
        try {
            const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
            // 1. Fetch User
            const userRes = await fetch(`${hostName}/api/currentUser`, { credentials: 'include' });
            if (userRes.ok) {
                const userData = await userRes.json();
                if (userData.user) {
                    setUserId(userData.user.userId);
                    
                    // 2. Fetch Unread Count
                    const notifRes = await fetch(`${hostName}/api/notifications?limit=1`, { credentials: 'include' });
                    if (notifRes.ok) {
                        const notifData = await notifRes.json();
                        setUnreadCount(notifData.unreadCount || 0);
                    }
                }
            }
        } catch (e) {
            console.error("Navbar setup failed", e);
        }
    };
    fetchUserAndNotifications();
  }, []);

  // Socket listener
  // We can't conditionally call hooks, so useSocket must always be called.
  // Assuming useSocket handles empty string gracefully (doesn't connect).
  const { socket } = useSocket(userId ? userId.toString() : "");

  useEffect(() => {
    if (!socket || !userId) return;

    const handleNewNotification = () => {
        setUnreadCount(prev => prev + 1);
    };

    socket.on("new_notification", handleNewNotification);

    return () => {
        socket.off("new_notification", handleNewNotification);
    };
  }, [socket, userId]);

  // Listen for local read updates
  useEffect(() => {
    const handleLocalUpdate = () => {
        // Option 1: Decrement count (if we know how many were read)
        // Option 2: Re-fetch count. Safer.
        const fetchCount = async () => {
            try {
                const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
                const notifRes = await fetch(`${hostName}/api/notifications?limit=1`, { credentials: 'include' });
                if (notifRes.ok) {
                    const notifData = await notifRes.json();
                    setUnreadCount(notifData.unreadCount || 0);
                }
            } catch (e) {
                console.error("Failed to update notification count");
            }
        };
        fetchCount();
    };

    window.addEventListener('notification_update', handleLocalUpdate);
    return () => {
        window.removeEventListener('notification_update', handleLocalUpdate);
    };
  }, []);

  // 主要導航項目
  const mainNavItems: MainNavigationItem[] = [
    { href: "/user", label: "Profile", icon: UserIcon },
  ];

  // 下拉菜單項目
  const teamMenuItems: NavigationItem[] = [
    {
      href: "/about",
      title: "Team Overview",
      description: "Meet our amazing team members",
      icon: TeamIcon,
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
      href: "/user",
      title: "Profile",
      description: "User Profile",
      icon: UserIcon,
    },
    {
      href: "/notifications",
      title: "Notifications",
      description: "Notifications",
      icon: Bell,
    },
    {
      href: "/about",
      title: "About Us",
      description: "About Megaweaving",
      icon: TeamIcon,
    },
    {
      href: "/install",
      title: "Install",
      description: "Add to Home Screen",
      icon: SquarePlus,
    },
    // ...teamMenuItems,
    // {
    //   href: "/contact",
    //   title: "Contact",
    //   description: "Get in touch with us",
    //   icon: Mail,
    // },
  ];

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
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-100 ease-in-out ${
          isNavbarVisible ? "translate-y-0" : "-translate-y-full"
        } ${isAtTop ? "bg-transparent" : "bg-primary-30/20 backdrop-blur-lg "}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <div className="flex items-center space-x-3 ">
                <Image
                  src="/icons/weaving.svg"
                  alt="megaweaving icon"
                  width={32}
                  height={32}
                  className="hidden md:block align-middle"
                />
                <div className="text-2xl sm:text-2xl font-bold text-primary font-ddin leading-[32px] justify-self-center text-center">
                  megaweaving
                </div>
              </div>
            </Link>

            {/* desktop nav item */}
            <div className="hidden md:flex items-center space-x-6 mr-6">
                <Link href="/notifications" className="relative group p-2 text-gray-700 hover:bg-primary-30 rounded-full transition-all">
                    <Bell className="w-[20px] h-[20px]" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm animate-in zoom-in duration-200">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </Link>
            </div>
            <div className="font-ddin">
              <NavigationMenu>
                <NavigationMenuList>
                  {/* Team 下拉菜單 */}
                  <NavigationMenuItem className="hidden md:block hover:cursor-pointer">
                    <NavigationMenuTrigger className="bg-transparent hover:bg-primary-30">
                      <TeamIcon className="w-[18px] h-[16px] mr-[8px] " />
                      About
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px]">
                        {teamMenuItems.map((item, index) => (
                          <ListItem
                            key={index}
                            title={item.title}
                            href={item.href}
                            icon={item.icon}
                            className="hover:bg-primary-30"
                          >
                            {item.description}
                          </ListItem>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  {/* main nav item */}
                  {mainNavItems.map((item, index) => (
                    <NavigationMenuItem key={index} className="hidden md:block">
                      <NavigationMenuLink
                        asChild
                        className={cn(
                          navigationMenuTriggerStyle(),
                          "transition-all duration-200 bg-transparent hover:bg-primary-30"
                        )}
                      >
                        <Link
                          href={item.href}
                          className="font-semibold text-[18px]"
                        >
                          <item.icon className="w-[18px] h-[16px] mr-[8px] " />
                          <span className="hidden md:inline">{item.label}</span>
                        </Link>
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  ))}
                </NavigationMenuList>
              </NavigationMenu>
            </div>

            {/* mobile nav bar item */}
            <div className="md:hidden flex items-center space-x-2">
              {/* Profile 按鈕（手機顯示） */}
              <Link href="/user" className="">
                <UserIcon className="h-[16px] w-[18px]" />
                <span className="sr-only">Profile</span>
              </Link>
              <Link href="/notifications" className="relative group">
                <Bell className="h-[16px] w-[18px] text-black transition-transform group-hover:scale-110" fill="black" />
                <span className="sr-only">Notifications</span>
                 {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm animate-in zoom-in duration-200">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
              </Link>
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "p-2 transition-all duration-200",
                      isAtTop
                        ? "text-megaweave-forest-dark "
                        : "text-gray-900 "
                    )}
                  >
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <VisuallyHidden>
                    <SheetTitle>Navigation Menu</SheetTitle>
                    <SheetDescription>
                      Browse through the navigation options
                    </SheetDescription>
                  </VisuallyHidden>
                  <div className="space-y-2">
                    {mobileNavItems.map((item, index) => {
                      const Icon = item.icon;

                      return (
                        <Link
                          key={index}
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "flex items-start space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-[16px] transition-all duration-200 group",
                            isActivePath(item.href)
                              ? "text-gray-900 bg-primary-30 "
                              : "text-white "
                          )}
                        >
                          <div className="flex-shrink-0 mt-3">
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
