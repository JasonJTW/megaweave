import type { Metadata } from "next";
import * as Sentry from "@sentry/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import localFont from "next/font/local";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Script from "next/script";
import { TeamProvider } from "./contexts/TeamContext";
import { PostProvider } from "./contexts/PostContext";
import { NavbarProvider } from "./contexts/NavBarContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { SocketProvider } from "./contexts/SocketContext";
import Navbar from "./components/Navbar";
import { Toaster } from "react-hot-toast";
// import AdSense from "@/components/AdSense";
import dotenv from "dotenv";
import Footer from "./components/Footer";
import { ChatPopupProvider } from "./contexts/ChatPopupContext";
import { ChatPopup } from "./components/Chat/ChatPopup";
import { LocationProvider } from "./contexts/LocationContext";

dotenv.config();
// const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID!;
import { UserProvider } from "./contexts/UserContext";
import { SWRConfig } from "swr";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const ddinPro = localFont({
  src: [
    {
      path: "../public/fonts/D-DIN-PRO-400-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/D-DIN-PRO-500-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/D-DIN-PRO-600-SemiBold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/D-DIN-PRO-700-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/D-DIN-PRO-800-ExtraBold.otf",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/D-DIN-PRO-900-Heavy.otf",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-ddin-pro",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "megaweaving",
  description: "Create by megaweavingHQ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "megaweaving", // 主畫面上顯示的名稱
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  other: {
    ...Sentry.getTraceData(),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head />
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ddinPro.variable} antialiased`}
      >
        <Script
          id="adsense-loader"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3940256099942544"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />

        {/* Umami */}
        {process.env.NODE_ENV === "production" && (
          <Script
            id="umami-analytics"
            defer
            src="https://stats.megaweaving.net/script.js"
            data-website-id="405ee142-6613-4505-ae33-4b1167ca4a87"
            strategy="afterInteractive"
          />
        )}
        <Toaster
          position="top-center"
          containerStyle={{ top: "100px" }}
          toastOptions={{
            duration: 3500,
            style: {
              borderRadius: "15px",
              padding: "0.5rem 1rem",
              fontSize: "14px",
              fontWeight: 500,
              boxShadow:
                "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
            },
            blank: {
              style: {
                background: "#9eb098", // 例如設定成藍色
                color: "#fff",
              },
            },
            success: {
              style: {
                background: "#48bb78",
                color: "#fff",
              },
              iconTheme: {
                primary: "#fff",
                secondary: "#48bb78",
              },
            },
            error: {
              style: {
                background: "#f56565",
                color: "#fff",
              },
              iconTheme: {
                primary: "#fff",
                secondary: "#f56565",
              },
            },
          }}
        />
        <SWRConfig value={{}}>
          <UserProvider>
            <LocationProvider>
              <SocketProvider>
                <NavbarProvider>
                  <NotificationProvider>
                    <ChatPopupProvider>
                      <Navbar />
                      <ChatPopup />

                      {/* Facebook SDK */}
                      <Script id="facebook-sdk" strategy="afterInteractive">
                        {`
                  window.fbAsyncInit = function() {
                    FB.init({
                      appId      : '${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}',
                      cookie     : true,
                      xfbml      : true,
                      version    : 'v18.0'
                    });
                    
                    FB.AppEvents.logPageView();   
                  };
      
                  (function(d, s, id){
                     var js, fjs = d.getElementsByTagName(s)[0];
                     if (d.getElementById(id)) {return;}
                     js = d.createElement(s); js.id = id;
                     js.src = "https://connect.facebook.net/en_US/sdk.js";
                     fjs.parentNode.insertBefore(js, fjs);
                   }(document, 'script', 'facebook-jssdk'));
                `}
                      </Script>
                      <Script
                        id="google-maps"
                        strategy="afterInteractive"
                        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&language=zh-TW&region=TW&loading=async`}
                      />
                      <GoogleOAuthProvider
                        clientId={
                          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""
                        }
                      >
                        <TeamProvider>
                          <PostProvider>{children}</PostProvider>
                        </TeamProvider>
                      </GoogleOAuthProvider>
                      <Footer />
                    </ChatPopupProvider>
                  </NotificationProvider>
                </NavbarProvider>
              </SocketProvider>
            </LocationProvider>
          </UserProvider>
        </SWRConfig>
      </body>
    </html>
  );
}
