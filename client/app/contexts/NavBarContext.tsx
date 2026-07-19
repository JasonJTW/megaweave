"use client";
import React, { createContext, useContext, useState, useEffect, useRef } from "react";

interface NavbarContextType {
  isNavbarVisible: boolean;
  isAtTop: boolean;
  showNavbar: () => void;
}

const NavbarContext = createContext<NavbarContextType>({
  isNavbarVisible: true,
  isAtTop: true,
  showNavbar: () => {},
});

export const useNavbar = () => useContext(NavbarContext);

export const NavbarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);
  // Use a ref instead of state so writing scroll position never triggers a rerender
  // and the effect does NOT need it as a dependency — listener is mounted only once.
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const controlNavbar = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollYRef.current;
      lastScrollYRef.current = currentScrollY; // write to ref, no rerender

      setIsAtTop(currentScrollY < 10);

      if (currentScrollY < 100) {
        setIsNavbarVisible(true);
      } else if (delta > 8 && currentScrollY > 100) {
        // Only hide when scrolling DOWN by more than 8px
        // (filters out mobile viewport height changes from browser chrome)
        setIsNavbarVisible(false);
      } else if (delta < -8) {
        // Show navbar when scrolling UP by more than 8px
        setIsNavbarVisible(true);
      }
    };

    window.addEventListener("scroll", controlNavbar, { passive: true });
    return () => window.removeEventListener("scroll", controlNavbar);
  }, []); // empty deps — listener is registered once and never re-subscribed

  const showNavbar = () => {
    setIsNavbarVisible(true);
  };

  return (
    <NavbarContext.Provider value={{ isNavbarVisible, isAtTop, showNavbar }}>
      {children}
    </NavbarContext.Provider>
  );
};
