//* Implement sign in page
"use client";

import React from "react";
import { useEffect } from "react";
import { useState } from "react";
import { easeInOut, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Eye, EyeClosed } from "lucide-react";
import { siFacebook, siGoogle } from "simple-icons";
import { useRouter } from "next/navigation";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import toast from "react-hot-toast";
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
export default function Signup() {
  const router = useRouter();
  const [username, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFBReady, setIsFBReady] = useState(false);
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
        setSignupError(data.errorMessage || "Facebook sign in failed");
        return;
      }

      console.log("Facebook backend response:", data);
      handleSignupSuccess();
    } catch (error) {
      console.error("Error sending Facebook token to backend:", error);
      setSignupError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Facebook sign in",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSuccess = () => {
    router.push("/");
  };

  const handleGoogleSignin = async (credentialResponse: CredentialResponse) => {
    console.log("Credential Response:", credentialResponse);

    /// clear previous errors
    setSignupError(null);
    setLoading(true);

    if (!credentialResponse.credential) {
      setSignupError("Google sign in failed. Please try again.");
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
        setSignupError(data.errorMessage || "Google sign in failed");
        return;
      }

      console.log("Google sign in response data:", data);
      handleSignupSuccess();
    } catch (error) {
      console.error("Error during Google sign in:", error);
      setSignupError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Google sign in",
      );
    } finally {
      setLoading(false);
    }
  };

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
      toast.success(`Welcome to MegaWeave🥳🎉! ${username}`);
      handleSignupSuccess();
    } catch (error) {
      console.log(error);
      setSignupError(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = () => {
    if (!isFBReady || !window.FB) {
      setSignupError("Facebook SDK is not ready. Please try again.");
      return;
    }

    /// clear previous errors
    setSignupError(null);
    setLoading(true);

    window.FB.login(
      (response: fb.StatusResponse) => {
        if (response.status === "connected") {
          const accessToken = response.authResponse?.accessToken;

          if (!accessToken) {
            console.error("Facebook login failed or no access token received");
            setSignupError("Facebook login failed: No access token received");
            setLoading(false);
            return;
          }

          console.log("Facebook login successful:", response.authResponse);
          sendToYourBackend(accessToken);
        } else if (response.status === "not_authorized") {
          setSignupError("Facebook login failed: App not authorized");
          setLoading(false);
        } else {
          setSignupError("Facebook login was cancelled or failed");
          setLoading(false);
        }
      },
      { scope: "email,public_profile" },
    );
  };

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-stone-800 to-primary"></div>
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -60, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.5, ease: easeInOut }}
          className="w-full max-w-md"
        >
          <div className="m-6 space-y-6 rounded-2xl bg-secondary p-8 shadow-2xl">
            <div className="space-y-1 text-left">
              <h1 className="font-mono text-3xl tracking-wider text-primary">
                Sign up
              </h1>
              <p className="font-mono text-sm tracking-tighter text-muted-foreground">
                Good to have you here!
              </p>
              {signupError && (
                <div className="justify-self-end text-sm text-red-400">
                  * {signupError}
                </div>
              )}
            </div>
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
                    className="border-primary bg-secondary text-primary"
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
                    className="bg-secondary text-primary"
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
                      className="bg-secondary text-primary"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowPassword(!showPassword);
                        console.log(showPassword);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transform text-emerald-300 transition duration-300 hover:text-emerald-700"
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

              <div className="mt-4 flex items-center">
                <Button
                  type="submit"
                  className="z-10 w-full bg-primary-50 from-primary to-primary-50 text-black shadow-2xl transition-all duration-200 hover:mb-8 hover:bg-gradient-to-br hover:shadow-primary-15"
                  disabled={!username || !email || !password || loading}
                >
                  {loading ? "Signing up..." : "Sign up"}
                </Button>
              </div>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-primary" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-primary">
                <span className="bg-secondary px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button
                className="w-full bg-primary-50 text-black transition-all duration-200 hover:bg-primary-30"
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
                {isFBReady ? "Facebook" : "Loading Facebook..."}
              </Button>
              <Button
                className="w-full bg-primary-50 text-black transition-all duration-200 hover:bg-primary-30"
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
                Google
              </Button>

              <div className="hidden">
                <GoogleLogin
                  containerProps={{ id: "hidden-google-signin" }}
                  onSuccess={handleGoogleSignin}
                  onError={() => {
                    console.log("Signin with google Failed");
                    setSignupError("Google sign in failed. Please try again.");
                    setLoading(false);
                  }}
                />
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <a
                href="/signin"
                className="text-sm text-primary underline hover:text-emerald-700"
              >
                Sign in
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
