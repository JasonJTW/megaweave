"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

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
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const controlNavbar = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;

      setIsAtTop(currentScrollY < 10);

      if (currentScrollY < 100) {
        setIsNavbarVisible(true);
      } else if (delta > 8 && currentScrollY > 100) {
        // Only hide when scrolling DOWN by more than 8px 
        // (filters out mobile viewport height changes from browser chrome)
        setIsNavbarVisible(false);
      } else if (delta < -8) {
        // Only show when scrolling UP by more than 8px
        setIsNavbarVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", controlNavbar, { passive: true });
    return () => window.removeEventListener("scroll", controlNavbar);
  }, [lastScrollY]);

  const showNavbar = () => {
    setIsNavbarVisible(true);
  };

  return (
    <NavbarContext.Provider value={{ isNavbarVisible, isAtTop, showNavbar }}>
      {children}
    </NavbarContext.Provider>
  );
};
