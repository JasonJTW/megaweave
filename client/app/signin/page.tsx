//* Implement sign in page
"use client";

import React from "react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Eye, EyeClosed } from "lucide-react";
import { siFacebook, siGoogle } from "simple-icons";
import { useRouter } from "next/navigation";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";

export default function Signin() {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signinError, setSigninError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      router.push("/user");
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
      router.push("/user");
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
      router.push("/user");
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

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-stone-800 to-primary flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-secondary rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="text-left space-y-1">
              <h1 className="text-3xl font-mono tracking-wider text-primary">
                Sign in
              </h1>
              <p className="text-muted-foreground font-mono tracking-tighter text-sm">
                Enter your credential to access your account
              </p>
              {(signinError || error) && (
                <div className="text-red-400 text-sm justify-self-end">
                  * {signinError || error}
                </div>
              )}
            </div>
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
                    className="bg-secondary text-primary border-emerald-300"
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
                      className="bg-secondary text-primary border-emerald-300"
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
                  className="w-full bg-primary-50 text-black hover:bg-gradient-to-br from-primary  to-primary-50 hover:shadow-primary-15 shadow-2xl transition-all duration-200 hover:mb-8"
                  disabled={!email || !password || loading}
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-primary" />
              </div>
              <div className="relative flex justify-center text-xs text-primary uppercase">
                <span className="bg-secondary px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button
                className="w-full bg-primary-50 text-black
                               hover:bg-primary-30 transition-all duration-200"
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
                {isFBReady ? "Facebook" : "Loading Facebook..."}
              </Button>
              <Button
                className="w-full bg-primary-50 text-black hover:bg-primary-30 transition-all duration-200"
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
                Google
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
            </div>
            <div className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <a
                href="/signin"
                className="text-primary underline text-sm hover:text-emerald-700"
              >
                Sign up
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
