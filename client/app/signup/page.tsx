//* Implement sign in page
"use client";

import React from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Eye, EyeClosed } from "lucide-react";
import { siGithub, siGoogle } from "simple-icons";
import { useRouter } from "next/navigation";
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

  const handleSubmit = async (e: React.FormEvent) => {
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
      router.push("/user");
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
      <div className="min-h-screen bg-gradient-to-br from-stone-800 to-teal-600 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-primary-950   rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="text-left space-y-1">
              <h1 className="text-3xl font-mono tracking-wider text-primary-400">
                Sign up
              </h1>
              <p className="text-muted-foreground font-mono tracking-tighter text-sm">
                Good to have you here!
              </p>
              {signupError && (
                <div className="text-red-400 text-sm justify-self-end">
                  * {signupError}
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-primary-400">
                    UserName
                  </Label>
                  <Input
                    type="username"
                    id="username"
                    value={username}
                    onChange={(e) => setUserName(e.target.value)}
                    required
                    placeholder="Enter your username"
                    className="bg-primary-800 text-primary-400 border-emerald-300"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-primary-400">
                    Email
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter your email"
                    className="bg-primary-800 text-primary-400 border-emerald-300"
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
                      className="bg-primary-800 text-primary-400 border-emerald-300"
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
                      className="text-primary-400 underline hover:text-emerald-700"
                    >
                      Forgot Password?
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center mt-4">
                <Button
                  type="submit"
                  className="w-full bg-primary-500 text-primary-900 hover:bg-gradient-to-br from-primary-200 to-primary-500 hover:shadow-primary-50 shadow-2xl transition-all duration-200 hover:mb-8"
                  disabled={!username || !email || !password || loading}
                >
                  {loading ? "Signing up..." : "Sign up"}
                </Button>
              </div>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-primary-300" />
              </div>
              <div className="relative flex justify-center text-xs text-primary-400 uppercase">
                <span className="bg-primary-950 px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button className="w-full bg-primary-500 text-primary-900 hover:bg-primary-400 transition-all duration-200">
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  className="w-5 h-5 mr-2"
                  fill="currentColor"
                >
                  <path d={siGithub.path} />
                </svg>
                Github
              </Button>
              <Button className="w-full bg-primary-500 text-primary-900 hover:bg-primary-400 transition-all duration-200">
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
            </div>
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <a
                href="/signin"
                className="text-primary-400 underline text-sm hover:text-emerald-700"
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
