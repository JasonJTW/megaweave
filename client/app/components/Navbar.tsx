"use client";

import React, { useState } from "react";
import { useNavbar } from "../contexts/NavBarContext";
import { useConversations, useChatSocket } from "@/hooks/useChat";
import Link from "next/link";
import UserIcon from "./icons/UserIcon";
import TeamIcon from "./icons/TeamIcon";
import MenuIcon from "./icons/MenuIcon";
import MessageIcon from "./icons/MessageIcon";
import { usePathname } from "next/navigation";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useUser } from "../contexts/UserContext";
import NotificationIcon from "./icons/NotificationIcon";
import {
  // Info,
  // Mail,
  // GalleryHorizontalEnd,
  SquarePlus,
  NewspaperIcon,
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
};

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
  const { user } = useUser(); // Check if user is logged in
  const messageUnreadCount = conversations.reduce(
    (acc, c) => acc + c.unread_count,
    0,
  );

  // 主要導航項目
  const mainNavItems: MainNavigationItem[] = [
    { href: "/messages", label: "Messages", icon: MessageIcon },
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
          "fixed top-0 left-0 right-0 transition-all duration-100 ease-in-out",
          isMobileMenuOpen ? "z-[60]" : "z-50",
          isNavbarVisible ? "translate-y-0" : "-translate-y-full",
          isAtTop ? "bg-transparent" : "bg-primary-30/20 backdrop-blur-lg",
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-[50px]">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <div className="flex items-center space-x-3 sm:space-x-5 ">
                <WeavingIcon
                  className={cn(
                    "w-8 h-8 hidden xl:block align-middle transition-colors duration-200",
                    isMobileMenuOpen ? "text-white" : "text-primary",
                  )}
                />
                <div
                  className={cn(
                    "text-2xl sm:text-4xl font-bold font-ddin justify-self-center text-center transition-colors duration-200",
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
                "flex items-center space-x-2 sm:space-x-4 font-ddin transition-all duration-300",
                isMobileMenuOpen
                  ? "opacity-20 brightness-50 pointer-events-none"
                  : "opacity-100",
              )}
            >
              {/* //* mobile nav bar top item (Visible only on mobile) */}
              <div className="sm:hidden flex items-center space-x-2">
                {!user && (
                  <Link href="/user" className="">
                    <UserIcon className="h-[16px] w-[18px] text-megaweave-forest-dark" />
                    <span className="sr-only">Profile</span>
                  </Link>
                )}

                {user && (
                  <>
                    <Link href="/messages" className="relative group mr-2">
                      <MessageIcon className="h-[16px] w-[18px] text-megaweave-forest-dark" />
                      <span className="sr-only">Messages</span>
                      {messageUnreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white shadow-sm animate-in zoom-in duration-200">
                          {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                        </span>
                      )}
                    </Link>
                    <Link href="/notifications" className="relative group">
                      <NotificationIcon className="h-[16px] w-[18px] text-megaweave-forest-dark" />
                      <span className="sr-only">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm animate-in zoom-in duration-200">
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
                            "transition-all duration-200 bg-transparent hover:bg-primary-30 px-3",
                          )}
                        >
                          <Link
                            href={item.href}
                            className="font-semibold group text-[18px] flex items-center"
                          >
                            <div className="relative flex items-center">
                              <item.icon className="w-[18px] h-[16px] text-megaweave-forest-dark" />
                              {showBadge && (
                                <span
                                  className={`absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ${badgeColor} text-[9px] font-bold text-white shadow-sm animate-in zoom-in duration-200 pointer-events-none`}
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
                      "p-2 transition-all duration-200 w-6",
                      isAtTop
                        ? "text-megaweave-forest-dark "
                        : "text-gray-900 ",
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
                  <div className="space-y-2 flex flex-col justify-center sm:items-center h-full">
                    <div className="items-start">
                      {mobileNavItems.map((item, index) => {
                        const Icon = item.icon;

                        return (
                          <Link
                            key={index}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-[16px] transition-all duration-200 group",
                              isActivePath(item.href)
                                ? "text-gray-900 bg-primary-30 "
                                : "text-white ",
                            )}
                          >
                            <div className="flex-shrink-0">
                              <Icon className="w-5 h-5 " />
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
            "block select-none space-y-1 rounded-lg p-4 leading-none no-underline outline-none transition-all duration-200 hover:bg-gray-50 hover:text-gray-900 focus:bg-gray-50 focus:text-gray-900 group",
            className,
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
