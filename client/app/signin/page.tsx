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
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import Image from "next/image";
import toast from "react-hot-toast";
import { useCallback } from "react";
import { useUser } from "../contexts/UserContext";

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

  //* After successful sign in, redirect to the page
  const handleSigninSignupSuccess = useCallback(() => {
    if (returnTo) {
      // 使用 window.location.href 強制完整頁面跳轉
      // 確保瀏覽器在新請求時帶上已設置的 session Cookie
      window.location.href = decodeURIComponent(returnTo);
    } else {
      window.location.href = "/";
    }
  }, [returnTo]);

  //* Google Sign in
  const handleGoogleSignin = async (credentialResponse: CredentialResponse) => {
    console.log("Credential Response:", credentialResponse);

    setLoading(true);

    if (!credentialResponse.credential) {
      toast.error("Google sign in failed. Please try again.");
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
        toast.error(data.errorMessage || "Google sign in failed");
        return;
      }

      console.log("Google sign in response data:", data);
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error during Google sign in:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Google sign in",
      );
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
      toast.error("All fields are required.");
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
        toast.error(data.errorMessage || "Sign in failed");
        console.error("Sign in failed", data.errorMessage);
        return;
      }
      /// Sign in success
      console.log("response data:", data);
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
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
      toast.error("Facebook SDK is not ready. Please try again.");
      return;
    }

    setLoading(true);

    window.FB.login(
      (response: fb.StatusResponse) => {
        if (response.status === "connected") {
          const accessToken = response.authResponse?.accessToken;

          if (!accessToken) {
            console.error("Facebook login failed or no access token received");
            toast.error("Facebook login failed: No access token received");
            setLoading(false);
            return;
          }

          console.log("Facebook login successful:", response.authResponse);
          sendToYourBackend(accessToken);
        } else if (response.status === "not_authorized") {
          toast.error("Facebook login failed: App not authorized");
          setLoading(false);
        } else {
          toast.error("Facebook login was cancelled or failed");
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
        toast.error(data.errorMessage || "Facebook sign in failed");
        return;
      }

      console.log("Facebook backend response:", data);
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error sending Facebook token to backend:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Facebook sign in",
      );
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
      toast.error("All fields are required.");
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
        toast.error(data.errorMessage || "Sign in failed");
        if (data.details) {
          console.error("ErrorDetails", data.details);
        }
        throw new Error(data.errorMessage || "Sign in failed");
      }
      /// Sign in success

      /// Add a 5-second delay to inspect the button text
      // await new Promise((resolve) => setTimeout(resolve, 300));
      toast.success(`Welcome to MegaWeave🥳🎉! ${username}`);
      await mutate(); // Update global user context
      handleSigninSignupSuccess();
    } catch (error) {
      console.log(error);
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-secondary md:bg-[#000000]/80 overflow-x-hidden font-ddin relative">
        <motion.div
          initial={{ opacity: 0, y: -60, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.5, ease: easeInOut }}
          className="w-full max-w-md md:max-w-[640px] z-10"
        >
          <div className="bg-secondary md:bg-white rounded-2xl md:rounded-[60px] p-8 md:px-16 md:py-12 space-y-6 md:space-y-8 flex flex-col items-center shadow-none md:shadow-2xl">
            <div className="flex w-full justify-center">
              <div className="relative">
                <Image
                  src="/icons/weaving.svg"
                  alt="megaweaving icon"
                  width={150}
                  height={150}
                  className="object-cover md:w-[130px] md:h-[130px]"
                  priority
                />
                {/* The '+' overlay seen in Figma */}
                <div className="hidden md:flex absolute inset-0 items-center justify-center text-white text-4xl font-bold">
                  +
                </div>
              </div>
            </div>

            {/* title */}
            <div className="flex flex-col items-center w-full text-center">
              <div className="hidden md:block text-[48px] md:text-[36px] font-bold text-megaweave-forest-dark leading-tight">
                Welcome to megaweaving!
              </div>
              <div className="md:hidden text-[48px] font-bold text-megaweave-forest-dark leading-tight">
                {mode === "register" ? "Register" : "Log in"}
              </div>
              <div className="hidden md:block text-[#888888] type-body-t3 mt-2">
                {mode === "register"
                  ? "Register before start weaving."
                  : "Log in to continue weaving."}
              </div>
            </div>

            <div className="relative flex items-center bg-secondary md:bg-gray-100 rounded-full p-1 w-full h-[50px] md:h-[60px] overflow-hidden">
              {/* Single Sliding Pill - Explicit horizontal motion only */}
              <motion.div
                className="absolute top-1 bottom-1 left-1 bg-megaweave-forest rounded-full z-0"
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
                className={`relative flex-1 h-full flex items-center justify-center transition-colors duration-300 z-10 type-button-b2 md:type-button-b1 ${
                  mode === "login" ? "text-white" : "text-megaweave-forest-dark"
                }`}
                onClick={handleLoginClick}
              >
                Log in
              </button>
              <button
                className={`relative flex-1 h-full flex items-center justify-center transition-colors duration-300 z-10 type-button-b2 md:type-button-b1 ${
                  mode === "register"
                    ? "text-white"
                    : "text-megaweave-forest-dark"
                }`}
                onClick={handleRegisterClick}
              >
                Register
              </button>
            </div>

            <div className="w-full h-[1px] bg-megaweave-stone/20 mb-2" />

            <div className="flex flex-col gap-4 w-full px-4">
              <Button
                variant={"outline"}
                className="w-full md:rounded-full border md:border-gray-300 md:h-12 hover:bg-gray-50 transition-all duration-200 plaqueable-event-name=SigninWithGoogle text-megaweave-forest-dark type-button-b1"
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
                  className="w-5 h-5 mr-2"
                  fill="currentColor"
                >
                  <path d={siGoogle.path} />
                </svg>
                Log in with Google
              </Button>
              <div className="hidden">
                <GoogleLogin
                  containerProps={{ id: "hidden-google-signin" }}
                  onSuccess={handleGoogleSignin}
                  onError={() => {
                    console.log("Signin with google Failed");
                    toast.error("Google sign in failed. Please try again.");
                    setLoading(false);
                  }}
                />
              </div>
              <Button
                variant={"outline"}
                className="w-full md:rounded-full border md:border-gray-300 md:h-12 hover:bg-gray-50 transition-all duration-200 plausible-event-name=SigninWithFacebook text-megaweave-forest-dark type-button-b1"
                onClick={handleFacebookLogin}
                disabled={!isFBReady || loading}
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  className="w-5 h-5 mr-2"
                  fill="currentColor"
                >
                  <path d={siFacebook.path} />
                </svg>
                {isFBReady ? "Log in with Facebook" : "Loading Facebook..."}
              </Button>
            </div>
            <div className="relative">
              <div className="relative flex justify-center text-megaweave-forest-dark font-ddin font-semibold">
                <span className="bg-transparent px-2 select-none">or</span>
              </div>
            </div>

            {mode === "login" && (
              <form onSubmit={handleSubmit} className="w-full px-4 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-secondary-foreground md:hidden px-1"
                    >
                      Email
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="Enter your email"
                      className="bg-secondary md:bg-gray-100 md:border-none md:rounded-full md:h-12 md:px-6 text-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-secondary-foreground md:hidden px-1"
                    >
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="Enter your password"
                        className="bg-secondary md:bg-gray-100 md:border-none md:rounded-full md:h-12 md:px-6 text-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowPassword(!showPassword);
                        }}
                        className="absolute right-9 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-emerald-700 transition duration-300"
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
                        Remember me
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <Button
                    type="submit"
                    className="w-full bg-primary-75 md:h-12 transition-all duration-200 z-10"
                    disabled={!email || !password || loading}
                  >
                    {loading ? "Logging in..." : "Log in"}
                  </Button>
                </div>
              </form>
            )}

            {mode === "register" && (
              <form
                onSubmit={handleSignupSubmit}
                className="w-full px-4 space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="username"
                      className="text-secondary-foreground md:hidden px-1"
                    >
                      UserName
                    </Label>
                    <Input
                      type="text"
                      id="username"
                      value={username}
                      onChange={(e) => setUserName(e.target.value)}
                      required
                      placeholder="Enter your username"
                      className="bg-secondary md:bg-gray-100 md:border-none md:rounded-full md:h-12 md:px-6 text-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-secondary-foreground md:hidden px-1"
                    >
                      Email
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="Enter your email"
                      className="bg-secondary md:bg-gray-100 md:border-none md:rounded-full md:h-12 md:px-6 text-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="text-secondary-foreground md:hidden px-1"
                    >
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="Enter your password"
                        className="bg-secondary md:bg-gray-100 md:border-none md:rounded-full md:h-12 md:px-6 text-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowPassword(!showPassword);
                        }}
                        className="absolute right-9 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-emerald-700 transition duration-300"
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
                        Remember me
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <Button
                    type="submit"
                    className="w-full bg-primary-75 md:h-12 transition-all duration-200 z-10"
                    disabled={!username || !email || !password || loading}
                  >
                    {loading ? "Registering..." : "Sign up"}
                  </Button>
                </div>
              </form>
            )}
            <div className="flex justify-center text-[12px] md:text-sm mt-5">
              <a
                href=""
                className="text-primary md:text-megaweave-forest-dark items-center hover:text-emerald-700 font-bold"
              >
                Forget password?
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}

export default function Signin() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SigninForm />
    </Suspense>
  );
}
