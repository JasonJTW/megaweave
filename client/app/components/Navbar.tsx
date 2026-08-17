"use client";

import React, { useState } from "react";
import { useNavbar } from "../contexts/NavBarContext";
import { useConversations, useChatSocket } from "@/hooks/useChat";
import Link from "next/link";
import UserIcon from "./icons/UserIcon";
import TeamIcon from "./icons/TeamIcon";
import MenuIcon from "./icons/MenuIcon";
import DirectMessageIcon from "./icons/DirectMessageIcon";
import { usePathname } from "next/navigation";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useUser } from "../contexts/UserContext";
import NotificationIcon from "./icons/NotificationIcon";
import {
  // Info,
  // Mail,
  // GalleryHorizontalEnd,
  LogOut,
  SquarePlus,
  NewspaperIcon,
  // FileText,
} from "lucide-react";
import { googleLogout } from "@react-oauth/google";
import toast from "react-hot-toast";
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
  // NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  // NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { RefractiveNav } from "./Refractive.client";
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
  action?: "logout";
};

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

import { useNotification } from "../contexts/NotificationContext";
import WeavingIcon from "./icons/WeavingIcon";

// cleaned up
const Navbar = () => {
  const { isNavbarVisible, isAtTop } = useNavbar();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { unreadCount } = useNotification(); // Notifications

  // Listen for new messages globally
  useChatSocket(null);

  const { conversations } = useConversations(); // Chat messages
  const { user, mutate } = useUser(); // Check if user is logged in

  const handleSignOut = async () => {
    try {
      try {
        googleLogout();
      } catch (googleError) {
        console.warn("Error during Google logout:", googleError);
      }

      const response = await fetch(`${hostName}/api/signout`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error("You are not signed in");
          return;
        }

        const errorMessage = await response.json();
        throw new Error(errorMessage.errorMessage);
      }

      await mutate({ user: null }, false);
      setIsMobileMenuOpen(false);
      window.location.href = "/";
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    }
  };
  const messageUnreadCount = conversations.reduce(
    (acc, c) => acc + c.unread_count,
    0,
  );

  // 主要導航項目
  const mainNavItems: MainNavigationItem[] = [
    { href: "/messages", label: "Messages", icon: DirectMessageIcon },
    { href: "/notifications", label: "Notifications", icon: NotificationIcon },
    { href: "/user", label: "Profile", icon: UserIcon },
  ];

  // 下拉菜單項目
  // const teamMenuItems: NavigationItem[] = [
  //   {
  //     href: "/about",
  //     title: "Team Overview",
  //     description: "Meet our amazing team members",
  //     icon: TeamIcon,
  //   },
  //   {
  //     href: "/about",
  //     title: "Timeline",
  //     description: "Our timeline and milestones",
  //     icon: GalleryHorizontalEnd,
  //   },
  // ];

  //* mobile hamburger menu
  const mobileNavItems: NavigationItem[] = [
    {
      href: "/user",
      title: "Profile",
      description: "User Profile",
      icon: UserIcon,
    },
    {
      href: "/about",
      title: "About Us",
      description: "About Megaweaving",
      icon: TeamIcon,
    },
    {
      href: "/earthday",
      title: "Jumbo",
      description: "Earth Day",
      icon: NewspaperIcon,
    },
    {
      href: "/install",
      title: "Install",
      description: "Add to Home Screen",
      icon: SquarePlus,
    },
    ...(user
      ? [
          {
            href: "#",
            title: "Sign Out",
            description: "Log out of your account",
            icon: LogOut,
            action: "logout" as const,
          },
        ]
      : []),
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

  if (pathname === "/earthday") return null;

  return (
    <>
      {/* 導航欄 */}
      <RefractiveNav
        refraction={{
          radius: 40,
          blur: 4,
          bezelWidth: 20,
        }}
        className={cn(
          "relative left-0 right-0 top-0 transition-all duration-100 ease-in-out",
          isMobileMenuOpen ? "z-[60]" : "z-50",
          isNavbarVisible ? "translate-y-0" : "-translate-y-full",
          isAtTop ? "bg-transparent" : "bg-primary-30/20 backdrop-blur-lg",
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-[50px]">
          <div className="flex h-20 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <div className="flex items-center space-x-3 sm:space-x-5">
                <WeavingIcon
                  className={cn(
                    "hidden h-8 w-8 align-middle transition-colors duration-200 xl:block",
                    isMobileMenuOpen ? "text-white" : "text-primary",
                  )}
                />
                <div
                  className={cn(
                    "justify-self-center text-center font-ddin text-2xl font-bold transition-colors duration-200 sm:text-4xl",
                    isMobileMenuOpen ? "text-white" : "text-primary",
                  )}
                >
                  megaweaving
                </div>
              </div>
            </Link>

            {/* //* Right Side Actions (Mobile icons, Desktop Nav, Hamburger) */}
            <div
              className={cn(
                "flex items-center space-x-2 font-ddin transition-all duration-300 sm:space-x-4",
                isMobileMenuOpen
                  ? "pointer-events-none opacity-20 brightness-50"
                  : "opacity-100",
              )}
            >
              {/* //* mobile nav bar top item (Visible only on mobile) */}
              <div className="flex items-center space-x-2 sm:hidden">
                {!user && (
                  <Link href="/user" className="">
                    <UserIcon className="h-[16px] w-[18px] text-megaweave-forest-dark" />
                    <span className="sr-only">Profile</span>
                  </Link>
                )}

                {user && (
                  <>
                    <Link href="/messages" className="group relative mr-2">
                      <DirectMessageIcon className="h-[16px] w-[18px] text-megaweave-forest-dark" />
                      <span className="sr-only">Messages</span>
                      {messageUnreadCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 animate-in items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white shadow-sm duration-200 zoom-in">
                          {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                        </span>
                      )}
                    </Link>
                    <Link href="/notifications" className="group relative">
                      <NotificationIcon className="h-[16px] w-[18px] text-megaweave-forest-dark" />
                      <span className="sr-only">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 animate-in items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm duration-200 zoom-in">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}
              </div>

              <NavigationMenu className="mt-0">
                <NavigationMenuList>
                  {/* Team 下拉菜單 */}
                  {/* <NavigationMenuItem className="hidden md:block hover:cursor-pointer">
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
                  </NavigationMenuItem> */}

                  {/* main nav item */}
                  {mainNavItems.map((item, index) => {
                    const isMessage = item.href === "/messages";
                    const isNotification = item.href === "/notifications";
                    const showBadge =
                      (isMessage && messageUnreadCount > 0) ||
                      (isNotification && unreadCount > 0);
                    const count = isMessage ? messageUnreadCount : unreadCount;
                    const badgeColor = isMessage ? "bg-blue-500" : "bg-red-500";

                    return (
                      <NavigationMenuItem
                        key={index}
                        className="hidden sm:block"
                      >
                        <NavigationMenuLink
                          asChild
                          className={cn(
                            navigationMenuTriggerStyle(),
                            "bg-transparent px-3 transition-all duration-200 hover:bg-primary-30",
                          )}
                        >
                          <Link
                            href={item.href}
                            className="group flex items-center text-[18px] font-semibold"
                          >
                            <div className="relative flex items-center">
                              <item.icon className="h-[16px] w-[18px] text-megaweave-forest-dark" />
                              {showBadge && (
                                <span
                                  className={`absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ${badgeColor} pointer-events-none animate-in text-[9px] font-bold text-white shadow-sm duration-200 zoom-in`}
                                >
                                  {count > 99 ? "99+" : count}
                                </span>
                              )}
                            </div>
                            {/* <span className="hidden md:inline text-megaweave-forest-dark">
                              {item.label}
                            </span> */}
                          </Link>
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    );
                  })}
                </NavigationMenuList>
              </NavigationMenu>
              {/* //* nav bar hamburger menu */}
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-6 p-2 transition-all duration-200",
                      isAtTop ? "text-megaweave-forest-dark" : "text-gray-900",
                    )}
                  >
                    <MenuIcon className="h-6 w-6" />
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
                  <div className="flex h-full flex-col justify-center space-y-2 sm:items-center">
                    <div className="items-start">
                      {mobileNavItems.map((item, index) => {
                        const Icon = item.icon;
                        const itemClassName = cn(
                          "flex w-full items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-[16px] transition-all duration-200 group",
                          item.action === "logout"
                            ? "text-white"
                            : isActivePath(item.href)
                              ? "text-gray-900 bg-primary-30 "
                              : "text-white ",
                        );

                        if (item.action === "logout") {
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={handleSignOut}
                              className={itemClassName}
                            >
                              <div className="flex-shrink-0">
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                <div className="font-medium">{item.title}</div>
                                <div className="mt-0.5 text-xs text-gray-500">
                                  {item.description}
                                </div>
                              </div>
                            </button>
                          );
                        }

                        return (
                          <Link
                            key={index}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={itemClassName}
                          >
                            <div className="flex-shrink-0">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{item.title}</div>
                              <div className="mt-0.5 text-xs text-gray-500">
                                {item.description}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </RefractiveNav>

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
            "group block select-none space-y-1 rounded-lg p-4 leading-none no-underline outline-none transition-all duration-200 hover:bg-gray-50 hover:text-gray-900 focus:bg-gray-50 focus:text-gray-900",
            className,
          )}
          {...props}
        >
          <div className="flex items-center space-x-3">
            {Icon && (
              <Icon className="h-5 w-5 text-gray-400 transition-colors group-hover:text-gray-600" />
            )}
            <div className="text-sm font-medium leading-none group-hover:text-gray-900">
              {title}
            </div>
          </div>
          <p className="ml-8 line-clamp-2 text-sm leading-snug text-gray-600 group-hover:text-gray-700">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export default Navbar;
