//* Implement sign in page
"use client";

import React, { Suspense } from "react";
import { useState, useEffect } from "react";
import { easeInOut, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Eye, EyeClosed } from "lucide-react";
import { siFacebook, siGoogle } from "simple-icons";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localizePath } from "@/i18n/routing";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import Image from "next/image";
import toast from "react-hot-toast";
import { useCallback } from "react";
import { useUser } from "@/app/contexts/UserContext";

function SigninForm() {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const [username, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, loading: userLoading, mutate } = useUser();
  const [mode, setMode] = useState<"login" | "register">("login");
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const home = localizePath(useLocale(), "/");
  const t = useTranslations("Auth");

  //* After successful sign in, redirect to the page
  const handleSigninSignupSuccess = useCallback(() => {
    if (returnTo) {
      // 使用 window.location.href 強制完整頁面跳轉
      // 確保瀏覽器在新請求時帶上已設置的 session Cookie
      window.location.href = decodeURIComponent(returnTo);
    } else {
      window.location.href = home;
    }
  }, [returnTo, home]);

  //* Dismiss overlay → always return home
  const handleDismiss = useCallback(() => {
    window.location.href = home;
  }, [home]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDismiss]);

  //* Google Sign in
  const handleGoogleSignin = async (credentialResponse: CredentialResponse) => {
    console.log("Credential Response:", credentialResponse);

    setLoading(true);

    if (!credentialResponse.credential) {
      toast.error(t("googleFailed"));
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${hostName}/api/signin/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Google sign in failed:", data.errorMessage);
        toast.error(data.errorMessage || t("googleFailed"));
        return;
      }

      console.log("Google sign in response data:", data);
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error during Google sign in:", error);
      toast.error(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  //* No longer need local fetchUser as we use useUser() hook
  useEffect(() => {
    if (user && !userLoading) {
      handleSigninSignupSuccess();
    }
  }, [user, userLoading, handleSigninSignupSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!email || !password) {
      toast.error(t("allFieldsRequired"));
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${hostName}/api/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();
      console.log("data:", data);
      // /// handle error
      if (!response.ok) {
        toast.error(data.errorMessage || t("signInFailed"));
        console.error("Sign in failed", data.errorMessage);
        return;
      }
      /// Sign in success
      console.log("response data:", data);
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error during sign in:", error);
      toast.error(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  // Removed local fetchUser effect

  //* Facebook Sign in
  const [isFBReady, setIsFBReady] = useState(false);

  useEffect(() => {
    // Check if Facebook SDK is loaded
    const checkFBReady = () => {
      if (window.FB) {
        setIsFBReady(true);
      } else {
        setTimeout(checkFBReady, 100);
      }
    };
    checkFBReady();
  }, []);

  const handleFacebookLogin = () => {
    if (!isFBReady || !window.FB) {
      toast.error(t("facebookNotReady"));
      return;
    }

    setLoading(true);

    window.FB.login(
      (response: fb.StatusResponse) => {
        if (response.status === "connected") {
          const accessToken = response.authResponse?.accessToken;

          if (!accessToken) {
            console.error("Facebook login failed or no access token received");
            toast.error(t("facebookNoToken"));
            setLoading(false);
            return;
          }

          console.log("Facebook login successful:", response.authResponse);
          sendToYourBackend(accessToken);
        } else if (response.status === "not_authorized") {
          toast.error(t("facebookNotAuthorized"));
          setLoading(false);
        } else {
          toast.error(t("facebookCancelled"));
          setLoading(false);
        }
      },
      { scope: "email,public_profile" },
    );
  };

  const sendToYourBackend = async (accessToken: string) => {
    try {
      const response = await fetch(`${hostName}/api/signin/facebook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessToken }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Facebook backend signin failed:", data.errorMessage);
        toast.error(data.errorMessage || t("facebookFailed"));
        return;
      }

      console.log("Facebook backend response:", data);
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error sending Facebook token to backend:", error);
      toast.error(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  const handleLoginClick = () => {
    setMode("login");
  };

  const handleRegisterClick = () => {
    setMode("register");
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    /// Validate input
    if (!username || !email || !password) {
      toast.error(t("allFieldsRequired"));
      setLoading(false);
      return;
    }

    const newUser = {
      username: username,
      email: email,
      password: password,
    };

    try {
      const response = await fetch(`${hostName}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
        credentials: "include", // Include cookies in the request
      });

      const data = await response.json();
      // /// handle error
      if (!response.ok) {
        toast.error(data.errorMessage || t("signUpFailed"));
        return;
      }
      /// Sign up success
      toast.success(t("welcomeToast", { username }));
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error during sign up:", error);
      toast.error(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-secondary font-ddin md:bg-[#000000]/80"
        onClick={handleDismiss}
        role="presentation"
      >
        <motion.div
          initial={{ opacity: 0, y: -60, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.5, ease: easeInOut }}
          className="z-10 w-full max-w-md md:max-w-[640px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center space-y-6 rounded-2xl bg-secondary p-8 shadow-none md:space-y-8 md:rounded-[60px] md:bg-white md:px-16 md:py-12 md:shadow-2xl">
            <div className="flex w-full justify-center">
              <div className="relative">
                <Image
                  src="/icons/weaving.svg"
                  alt={t("logoAlt")}
                  width={150}
                  height={150}
                  className="object-cover md:h-[130px] md:w-[130px]"
                  priority
                />
                {/* The '+' overlay seen in Figma */}
                <div className="absolute inset-0 hidden items-center justify-center text-4xl font-bold text-white md:flex">
                  +
                </div>
              </div>
            </div>

            {/* title */}
            <div className="flex w-full flex-col items-center text-center">
              <div className="hidden text-[48px] font-bold leading-tight text-megaweave-forest-dark md:block md:text-[36px]">
                {t("welcome")}
              </div>
              <div className="text-[48px] font-bold leading-tight text-megaweave-forest-dark md:hidden">
                {mode === "register" ? t("register") : t("logIn")}
              </div>
              <div className="type-body-t3 mt-2 hidden text-[#888888] md:block">
                {mode === "register"
                  ? t("registerSubtitle")
                  : t("logInSubtitle")}
              </div>
            </div>

            <div className="relative flex h-[50px] w-full items-center overflow-hidden rounded-full bg-secondary p-1 md:h-[60px] md:bg-gray-100">
              {/* Single Sliding Pill - Explicit horizontal motion only */}
              <motion.div
                className="absolute bottom-1 left-1 top-1 z-0 rounded-full bg-megaweave-forest"
                initial={false}
                animate={{
                  x: mode === "login" ? "0%" : "100%",
                  y: 0,
                  opacity: 1,
                  width: "calc(50% - 4px)",
                }}
                transition={{ type: "spring", bounce: 0.1, duration: 0.4 }}
              />
              <button
                className={`type-button-b2 relative z-10 flex h-full flex-1 items-center justify-center transition-colors duration-300 md:type-button-b1 ${
                  mode === "login" ? "text-white" : "text-megaweave-forest-dark"
                }`}
                onClick={handleLoginClick}
              >
                {t("logIn")}
              </button>
              <button
                className={`type-button-b2 relative z-10 flex h-full flex-1 items-center justify-center transition-colors duration-300 md:type-button-b1 ${
                  mode === "register"
                    ? "text-white"
                    : "text-megaweave-forest-dark"
                }`}
                onClick={handleRegisterClick}
              >
                {t("register")}
              </button>
            </div>

            <div className="mb-2 h-[1px] w-full bg-megaweave-stone/20" />

            <div className="flex w-full flex-col gap-4 px-4">
              <Button
                variant={"outline"}
                className="type-button-b1 w-full border text-megaweave-forest-dark transition-all duration-200 hover:bg-gray-50 md:h-12 md:rounded-full md:border-gray-300"
                disabled={loading}
                onClick={() => {
                  const container = document.getElementById(
                    "hidden-google-signin",
                  );
                  const googleButton =
                    container?.querySelector('[role="button"]');

                  if (googleButton) {
                    (googleButton as HTMLElement).click();
                  } else {
                    console.log("Google button not found");
                  }
                }}
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  className="mr-2 h-5 w-5"
                  fill="currentColor"
                >
                  <path d={siGoogle.path} />
                </svg>
                {t("logInWithGoogle")}
              </Button>
              <div className="hidden">
                <GoogleLogin
                  containerProps={{ id: "hidden-google-signin" }}
                  onSuccess={handleGoogleSignin}
                  onError={() => {
                    console.log("Signin with google Failed");
                    toast.error(t("googleFailed"));
                    setLoading(false);
                  }}
                />
              </div>
              <Button
                variant={"outline"}
                className="type-button-b1 w-full border text-megaweave-forest-dark transition-all duration-200 hover:bg-gray-50 md:h-12 md:rounded-full md:border-gray-300"
                onClick={handleFacebookLogin}
                disabled={!isFBReady || loading}
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  className="mr-2 h-5 w-5"
                  fill="currentColor"
                >
                  <path d={siFacebook.path} />
                </svg>
                {isFBReady ? t("logInWithFacebook") : t("loadingFacebook")}
              </Button>
            </div>
            <div className="relative">
              <div className="relative flex justify-center font-ddin font-semibold text-megaweave-forest-dark">
                <span className="select-none bg-transparent px-2">
                  {t("or")}
                </span>
              </div>
            </div>

            {mode === "login" && (
              <form onSubmit={handleSubmit} className="w-full space-y-6 px-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-secondary-foreground px-1 md:hidden"
                    >
                      {t("email")}
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder={t("emailPlaceholder")}
                      className="bg-secondary text-primary md:h-12 md:rounded-full md:border-none md:bg-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-secondary-foreground px-1 md:hidden"
                    >
                      {t("password")}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder={t("passwordPlaceholder")}
                        className="bg-secondary text-primary md:h-12 md:rounded-full md:border-none md:bg-gray-100"
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword ? t("hidePassword") : t("showPassword")
                        }
                        onClick={() => {
                          setShowPassword(!showPassword);
                        }}
                        className="absolute right-9 top-1/2 -translate-y-1/2 transform text-gray-400 transition duration-300 hover:text-emerald-700"
                      >
                        {showPassword ? (
                          <EyeClosed size={20} />
                        ) : (
                          <Eye size={20} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember"
                        className="border-emerald-300 md:border-gray-300"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(!!checked)}
                      />
                      <Label
                        htmlFor="remember"
                        className="text-primary-400 md:text-gray-500"
                      >
                        {t("rememberMe")}
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <Button
                    type="submit"
                    className="z-10 w-full bg-primary-75 transition-all duration-200 md:h-12"
                    disabled={!email || !password || loading}
                  >
                    {loading ? t("loggingIn") : t("logIn")}
                  </Button>
                </div>
              </form>
            )}

            {mode === "register" && (
              <form
                onSubmit={handleSignupSubmit}
                className="w-full space-y-6 px-4"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="username"
                      className="text-secondary-foreground px-1 md:hidden"
                    >
                      {t("username")}
                    </Label>
                    <Input
                      type="text"
                      id="username"
                      value={username}
                      onChange={(e) => setUserName(e.target.value)}
                      required
                      placeholder={t("usernamePlaceholder")}
                      className="bg-secondary text-primary md:h-12 md:rounded-full md:border-none md:bg-gray-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-secondary-foreground px-1 md:hidden"
                    >
                      {t("email")}
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder={t("emailPlaceholder")}
                      className="bg-secondary text-primary md:h-12 md:rounded-full md:border-none md:bg-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-secondary-foreground px-1 md:hidden"
                    >
                      {t("password")}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder={t("passwordPlaceholder")}
                        className="bg-secondary text-primary md:h-12 md:rounded-full md:border-none md:bg-gray-100"
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword ? t("hidePassword") : t("showPassword")
                        }
                        onClick={() => {
                          setShowPassword(!showPassword);
                        }}
                        className="absolute right-9 top-1/2 -translate-y-1/2 transform text-gray-400 transition duration-300 hover:text-emerald-700"
                      >
                        {showPassword ? (
                          <EyeClosed size={20} />
                        ) : (
                          <Eye size={20} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember"
                        className="border-emerald-300 md:border-gray-300"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(!!checked)}
                      />
                      <Label
                        htmlFor="remember"
                        className="text-primary md:text-gray-500"
                      >
                        {t("rememberMe")}
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <Button
                    type="submit"
                    className="z-10 w-full bg-primary-75 transition-all duration-200 md:h-12"
                    disabled={!username || !email || !password || loading}
                  >
                    {loading ? t("signingUp") : t("signUp")}
                  </Button>
                </div>
              </form>
            )}
            <div className="mt-5 flex justify-center text-[12px] md:text-sm">
              <a
                href=""
                className="items-center font-bold text-primary hover:text-emerald-700 md:text-megaweave-forest-dark"
              >
                {t("forgotPassword")}
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}

export default function Signin() {
  const t = useTranslations("Auth");
  return (
    <Suspense fallback={<div>{t("loading")}</div>}>
      <SigninForm />
    </Suspense>
  );
}
