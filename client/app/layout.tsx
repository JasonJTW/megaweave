import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import localFont from "next/font/local";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Script from "next/script";
import { TeamProvider } from "./contexts/TeamContext";
import Navbar from "./components/Navbar";
// import AdSense from "@/components/AdSense";
import dotenv from "dotenv";
dotenv.config();
// const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID!;
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
  ],
  variable: "--font-ddin-pro",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Megaweave",
  description: "Create by megaweaveHQ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6758243674658799"
          crossOrigin="anonymous"
        ></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ddinPro.variable} antialiased`}
      >
        <Navbar />
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
        <GoogleOAuthProvider
          clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
        >
          <TeamProvider>{children}</TeamProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
