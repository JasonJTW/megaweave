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
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import Image from "next/image";

function SigninForm() {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const [username, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signinError, setSigninError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  //* After successful sign in, redirect to the page
  const handleSigninSignupSuccess = () => {
    if (returnTo) {
      router.push(decodeURIComponent(returnTo));
    } else {
      router.push("/user");
    }
  };

  //* Google Sign in
  const handleGoogleSignin = async (credentialResponse: CredentialResponse) => {
    console.log("Credential Response:", credentialResponse);

    /// clear previous errors
    setSigninError(null);
    setLoading(true);

    if (!credentialResponse.credential) {
      setSigninError("Google sign in failed. Please try again.");
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
        setSigninError(data.errorMessage || "Google sign in failed");
        return;
      }

      console.log("Google sign in response data:", data);
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error during Google sign in:", error);
      setSigninError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Google sign in"
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    //* Check if user is already logged in
    try {
      const response = await fetch(`${hostName}/api/currentUser`, {
        cache: "no-store",
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorMessage = await response.json();
        console.log("Error fetching user data:", errorMessage.errorMessage);
        if (response.status === 401) {
          /// User is not authenticated, keep signin
          return;
        }
        throw new Error(` ${errorMessage.errorMessage}`);
      }
      //* User has valid session in cookie, redirect to user page
      setLoading(true);
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!email || !password) {
      setSigninError("All fields are required.");
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
        setSigninError(data.errorMessage || "Sign in failed");
        console.error("Sign in failed", data.errorMessage);
        return;
      }
      /// Sign in success
      setSigninError(null);
      console.log("response data:", data);
    } catch (error) {
      setSigninError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmit]);

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
      setSigninError("Facebook SDK is not ready. Please try again.");
      return;
    }

    /// clear previous errors
    setSigninError(null);
    setLoading(true);

    window.FB.login(
      (response: fb.StatusResponse) => {
        if (response.status === "connected") {
          const accessToken = response.authResponse?.accessToken;

          if (!accessToken) {
            console.error("Facebook login failed or no access token received");
            setSigninError("Facebook login failed: No access token received");
            setLoading(false);
            return;
          }

          console.log("Facebook login successful:", response.authResponse);
          sendToYourBackend(accessToken);
        } else if (response.status === "not_authorized") {
          setSigninError("Facebook login failed: App not authorized");
          setLoading(false);
        } else {
          setSigninError("Facebook login was cancelled or failed");
          setLoading(false);
        }
      },
      { scope: "email,public_profile" }
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
        setSigninError(data.errorMessage || "Facebook sign in failed");
        return;
      }

      console.log("Facebook backend response:", data);
      handleSigninSignupSuccess();
    } catch (error) {
      console.error("Error sending Facebook token to backend:", error);
      setSigninError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Facebook sign in"
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
      setSignupError("All fields are required.");
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
        setSignupError(data.errorMessage || "Sign in failed");
        if (data.details) {
          console.error("ErrorDetails", data.details);
        }
        throw new Error(data.errorMessage || "Sign in failed");
      }
      /// Sign in success

      /// Add a 5-second delay to inspect the button text
      // await new Promise((resolve) => setTimeout(resolve, 300));
      alert(`Welcome to MegaWeave🥳🎉! ${username}`);
      handleSigninSignupSuccess();
    } catch (error) {
      console.log(error);
      setSignupError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-secondary  -z-10"></div>
      <div className="min-h-screen flex bg-secondary items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -60, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.5, ease: easeInOut }}
          className="w-full max-w-md"
        >
          <div className="bg-secondary rounded-2xl  p-8 space-y-6">
            {(signinError || signupError || error) && (
              <div className="text-red-400 text-sm justify-self-end">
                * {signinError || error}
              </div>
            )}

            {/* icon */}
            <div className="flex w-full justify-center">
              <Image
                src="/icons/weaving.svg"
                alt="megaweaving icon"
                width={150}
                height={150}
                className="object-cover"
                priority
              />
            </div>
            {/* title */}
            <div className="flex w-full text-[48px] font-ddin font-semibold text-center justify-center">
              {mode == "register" ? "Register" : "Log in"}
            </div>
            <div className="flex flex-col-2 max-w-full ">
              <Button
                className={
                  mode === "login"
                    ? "pointer-events-none"
                    : "bg-transparent shadow-none text-megaweave-forest-dark"
                }
                onClick={handleLoginClick}
              >
                Log in
              </Button>
              <Button
                className={
                  mode === "register"
                    ? "pointer-events-none"
                    : "bg-transparent shadow-none text-megaweave-forest-dark"
                }
                onClick={handleRegisterClick}
              >
                Register
              </Button>
            </div>

            <div className="grid grid-rows-2 gap-4">
              <Button
                variant={"outline"}
                className="w-full hover:bg-primary-30 transition-all duration-200 "
                disabled={loading}
                onClick={() => {
                  const container = document.getElementById(
                    "hidden-google-signin"
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
                    setSigninError("Google sign in failed. Please try again.");
                    setLoading(false);
                  }}
                />
              </div>
              <Button
                variant={"outline"}
                className="w-full hover:bg-primary-30 transition-all duration-200"
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
                <span className="bg-secondary px-2 select-none">or</span>
              </div>
            </div>

            {mode === "login" && (
              <form onSubmit={handleSubmit} className="">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-primary">
                      Email
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="Enter your email"
                      className="bg-secondary text-primary "
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-primary-400">
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
                        className="bg-secondary text-primary "
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowPassword(!showPassword);
                          console.log(showPassword);
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-emerald-300 hover:text-emerald-700 transition duration-300"
                      >
                        {showPassword ? (
                          <EyeClosed size={20} />
                        ) : (
                          <Eye size={20} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember"
                        className="border-emerald-300"
                        onClick={() => {
                          setRememberMe(!rememberMe);
                          console.log(rememberMe);
                        }}
                      />
                      <Label htmlFor="remember" className="text-primary-400">
                        Remember me
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center mt-4">
                  <Button
                    type="submit"
                    className="w-full bg-primary-75  hover:shadow-primary-15 shadow-2xl transition-all duration-200 z-10"
                    disabled={!email || !password || loading}
                  >
                    {loading ? "Logging in..." : "Log in"}
                  </Button>
                </div>
              </form>
            )}

            {mode === "register" && (
              <form onSubmit={handleSignupSubmit} className="">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-primary-75">
                      UserName
                    </Label>
                    <Input
                      type="username"
                      id="username"
                      value={username}
                      onChange={(e) => setUserName(e.target.value)}
                      required
                      placeholder="Enter your username"
                      className="bg-secondary text-primary "
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-primary">
                      Email
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="Enter your email"
                      className="bg-secondary text-primary "
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-primary">
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
                        className="bg-secondary text-primary "
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowPassword(!showPassword);
                          console.log(showPassword);
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-emerald-300 hover:text-emerald-700 transition duration-300"
                      >
                        {showPassword ? (
                          <EyeClosed size={20} />
                        ) : (
                          <Eye size={20} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember"
                        className="border-emerald-300"
                        onClick={() => {
                          setRememberMe(!rememberMe);
                          console.log(rememberMe);
                        }}
                      />
                      <Label htmlFor="remember" className="text-primary">
                        Remember me
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <a
                        href=""
                        className="text-primary underline hover:text-emerald-700"
                      >
                        Forgot Password?
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex items-center mt-4">
                  <Button
                    type="submit"
                    className="w-full bg-primary-75 hover:shadow-primary-15 shadow-2xl transition-all duration-200 z-10 "
                    disabled={!username || !email || !password || loading}
                  >
                    {loading ? "Registering..." : "Register"}
                  </Button>
                </div>
              </form>
            )}
            <div className="flex justify-center text-[12px] mt-5">
              <a
                href=""
                className="text-primary items-center hover:text-emerald-700"
              >
                Forgot Password?
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
