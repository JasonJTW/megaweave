"use client";
import Link from "next/link";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  Users,
  Globe,
  Recycle,
  Heart,
  Search,
  MessageCircle,
  Share2,
  ChevronDown,
  Facebook,
  Mail,
} from "lucide-react";

const MegaweaveLanding = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    setIsVisible(true);
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 3);
    }, 3000);

    // Set comprehensive background styles to prevent white overscroll
    const backgroundGradient =
      "linear-gradient(135deg, #2d3e2d 0%, #1a2a1a 50%, #0f1f0f 100%)";
    const fallbackColor = "#1a2a1a";

    // Apply to multiple elements to ensure coverage
    document.body.style.background = backgroundGradient;
    document.body.style.backgroundColor = fallbackColor;
    document.documentElement.style.background = backgroundGradient;
    document.documentElement.style.backgroundColor = fallbackColor;

    // Additional iOS Safari specific fixes
    document.body.style.minHeight = "100vh";
    document.documentElement.style.minHeight = "100vh";

    // Prevent overscroll behavior on iOS
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      clearInterval(interval);
      // Clean up styles on unmount
      document.body.style.background = "";
      document.body.style.backgroundColor = "";
      document.documentElement.style.background = "";
      document.documentElement.style.backgroundColor = "";
      document.body.style.minHeight = "";
      document.documentElement.style.minHeight = "";
      document.body.style.overscrollBehavior = "";
      document.documentElement.style.overscrollBehavior = "";
    };
  }, []);

  const features = [
    {
      icon: <Search className="h-8 w-8" />,
      title: "Discover Resources",
      description:
        "Find exactly what you need from our community of 10,000+ members",
    },
    {
      icon: <Share2 className="h-8 w-8" />,
      title: "Share Commons",
      description: "Contribute to the permanent commons for collective access",
    },
    {
      icon: <MessageCircle className="h-8 w-8" />,
      title: "Connect & Match",
      description:
        "Direct messaging and forums to facilitate seamless exchanges",
    },
  ];

  const stats = [
    { number: "10,000+", label: "Active Members" },
    { number: "50,000+", label: "Resources Shared" },
    { number: "150+", label: "Countries" },
    { number: "95%", label: "Match Success Rate" },
  ];

  return (
    <div
      className="min-h-screen overflow-hidden bg-megaweave-forest text-white"
      style={{
        background:
          "linear-gradient(135deg, #2d3e2d 0%, #1a2a1a 50%, #0f1f0f 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Animated Background Elements */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-1/2 -top-1/2 h-full w-full animate-pulse rounded-full bg-gradient-to-br from-megaweave-gold/20 to-transparent"></div>
        <div className="absolute -bottom-1/2 -left-1/2 h-full w-full animate-pulse rounded-full bg-gradient-to-tr from-megaweave-gold-light/20 to-transparent delay-700"></div>
        <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-gradient-to-br from-megaweave-sand/10 to-transparent delay-1000"></div>
        <div className="absolute right-1/4 top-3/4 h-64 w-64 animate-pulse rounded-full bg-gradient-to-br from-megaweave-stone/15 to-transparent delay-500"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between p-6 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <Image
            src="/favicon.ico"
            alt="megaweaving icon"
            width={32}
            height={32}
            className="rounded-sm"
          />
          <span className="font-ddin text-2xl font-semibold text-white">
            megaweaving
          </span>
        </div>
        <div className="hidden space-x-8 md:flex">
          <a
            href="#features"
            className="font-medium text-megaweave-sand transition-colors hover:text-megaweave-gold-light"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="font-medium text-megaweave-sand transition-colors hover:text-megaweave-gold-light"
          >
            How It Works
          </a>
          <a
            href="#community"
            className="font-medium text-megaweave-sand transition-colors hover:text-megaweave-gold-light"
          >
            Community
          </a>
        </div>
        <Link
          href="/signup"
          className="transform rounded-full bg-megaweave-sand px-6 py-2 font-semibold text-megaweave-forest-dark shadow-lg transition-all duration-300 hover:scale-105"
        >
          Join Now
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 py-20 text-center">
        <div
          className={`mx-auto max-w-6xl transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
          }`}
        >
          <h1 className="mb-8 text-5xl font-bold leading-tight md:text-7xl">
            <span className="text-megaweave-red-light">
              &quot; Weaving &quot;
            </span>
            <br />
            <span className="bg-gradient-to-r from-megaweave-cream via-megaweave-gold to-megaweave-red-light bg-clip-text text-transparent">
              Commons
            </span>
            <br />
            <span className="text-megaweave-red-light">
              of Shared Resources
            </span>
          </h1>
          <p className="mx-auto mb-12 max-w-4xl text-xl leading-relaxed text-megaweave-sand md:text-2xl">
            Transform surplus into opportunity. Connect communities worldwide
            through a transparent, database-driven platform that bridges the gap
            between overflow and need.
          </p>

          {/* CTA Buttons */}
          <div className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button className="bg-megaweave-primary group flex transform items-center space-x-2 rounded-full px-8 py-4 text-lg font-semibold text-megaweave-forest-dark shadow-xl transition-all duration-300 hover:scale-105">
              <span>Start Sharing</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
            <Link
              href="/posts"
              className="rounded-full border-2 border-megaweave-gold-light px-8 py-4 text-lg font-semibold text-megaweave-cream backdrop-blur-sm transition-all duration-300 hover:bg-megaweave-gold-light/10"
            >
              Explore Resources
            </Link>
          </div>

          {/* Stats */}
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="bg-gradient-to-r from-megaweave-gold-light to-megaweave-gold bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
                  {stat.number}
                </div>
                <div className="mt-2 font-medium text-megaweave-stone">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 transform animate-bounce">
          <ChevronDown className="h-8 w-8 text-megaweave-gold-light" />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-16 text-center text-4xl font-bold md:text-5xl">
            <span className="text-megaweave-cream">Built for </span>
            <span className="text-megaweave-gold-light">Community</span>
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`rounded-2xl border border-megaweave-sand/20 p-8 shadow-lg backdrop-blur-sm transition-all duration-500 hover:scale-105 hover:transform ${
                  activeFeature === index
                    ? "bg-megaweave-cream/15 ring-2 ring-megaweave-gold-light"
                    : "bg-megaweave-cream/10"
                }`}
              >
                <div className="mb-4 text-megaweave-gold-light">
                  {feature.icon}
                </div>
                <h3 className="mb-4 text-2xl font-bold text-megaweave-cream">
                  {feature.title}
                </h3>
                <p className="leading-relaxed text-megaweave-sand">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="relative z-10 bg-megaweave-forest-dark/30 px-6 py-20 backdrop-blur-sm"
      >
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-16 text-center text-4xl font-bold md:text-5xl">
            <span className="text-megaweave-cream">How It </span>
            <span className="text-megaweave-gold">Works</span>
          </h2>

          <div className="grid items-center gap-12 md:grid-cols-2">
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-megaweave-gold-light font-bold text-megaweave-forest-dark">
                  1
                </div>
                <div>
                  <h3 className="mb-2 text-xl font-bold text-megaweave-cream">
                    Share Your Resources
                  </h3>
                  <p className="text-megaweave-sand">
                    Upload photos and descriptions of items you no longer need.
                    Tag them for easy discovery.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-megaweave-gold font-bold text-megaweave-cream">
                  2
                </div>
                <div>
                  <h3 className="mb-2 text-xl font-bold text-megaweave-cream">
                    Connect & Match
                  </h3>
                  <p className="text-megaweave-sand">
                    Use our platform to find what you need or respond to
                    others&apos; requests. Direct messaging facilitates
                    connections.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-megaweave-forest-light font-bold text-megaweave-cream">
                  3
                </div>
                <div>
                  <h3 className="mb-2 text-xl font-bold text-megaweave-cream">
                    Join the Commons
                  </h3>
                  <p className="text-megaweave-sand">
                    Opt into Share Commons for permanent community access,
                    creating a distributed resource network.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="flex h-80 w-full items-center justify-center rounded-2xl border border-megaweave-sand/20 bg-gradient-to-br from-megaweave-sand/20 to-megaweave-gold/20 shadow-xl backdrop-blur-sm">
                <div className="text-center">
                  <Globe className="mx-auto mb-4 h-16 w-16 text-megaweave-gold-light" />
                  <p className="text-lg font-semibold text-megaweave-cream">
                    Global Resource Network
                  </p>
                  <p className="mt-2 text-megaweave-stone">
                    Connecting communities worldwide
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community Values */}
      <section id="community" className="relative z-10 px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-8 text-4xl font-bold md:text-5xl">
            <span className="text-megaweave-cream">Our </span>
            <span className="text-megaweave-red-light">Values</span>
          </h2>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            <div className="space-y-4 rounded-2xl border border-megaweave-sand/20 bg-megaweave-cream/10 p-8 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:transform">
              <Recycle className="mx-auto h-12 w-12 text-megaweave-forest-light" />
              <h3 className="text-xl font-bold text-megaweave-cream">
                Sustainability
              </h3>
              <p className="text-megaweave-sand">
                Reduce waste by giving resources a second life in communities
                that need them.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-megaweave-sand/20 bg-megaweave-cream/10 p-8 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:transform">
              <Users className="mx-auto h-12 w-12 text-megaweave-blue" />
              <h3 className="text-xl font-bold text-megaweave-cream">
                Community
              </h3>
              <p className="text-megaweave-sand">
                Build connections and mutual aid networks that strengthen local
                and global communities.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-megaweave-sand/20 bg-megaweave-cream/10 p-8 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:transform">
              <Heart className="mx-auto h-12 w-12 text-megaweave-red-light" />
              <h3 className="text-xl font-bold text-megaweave-cream">Equity</h3>
              <p className="text-megaweave-sand">
                Ensure everyone has access to basic resources regardless of
                economic circumstances.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 bg-gradient-to-br from-megaweave-gold/30 to-megaweave-gold-light/30 px-6 py-20 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-8 text-4xl font-bold text-megaweave-cream md:text-5xl">
            Ready to Start Weaving?
          </h2>
          <p className="mb-12 text-xl text-megaweave-sand">
            Join thousands of community members creating a more sustainable and
            equitable world through resource sharing.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button className="bg-megaweave-primary transform rounded-full px-8 py-4 text-lg font-semibold text-megaweave-forest-dark shadow-xl transition-all duration-300 hover:scale-105">
              Join the Platform
            </button>
            <button className="rounded-full border-2 border-megaweave-cream/50 px-8 py-4 text-lg font-semibold text-megaweave-cream backdrop-blur-sm transition-all duration-300 hover:bg-megaweave-cream/10">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-megaweave-sand/20 bg-megaweave-forest-dark/50 px-6 py-12 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 flex items-center space-x-3 md:mb-0">
              <div className="bg-megaweave-primary flex h-8 w-8 items-center justify-center rounded-lg shadow-lg">
                <div className="h-4 w-4 rounded-sm bg-megaweave-cream opacity-90"></div>
              </div>
              <span className="text-xl font-bold text-megaweave-cream">
                Megaweave
              </span>
            </div>

            <div className="flex space-x-6">
              <Facebook
                className="h-6 w-6 cursor-pointer text-megaweave-stone transition-colors hover:text-megaweave-gold-light"
                onClick={() =>
                  window.open(
                    "https://www.facebook.com/groups/1596603907320118/?locale=zh_TW",
                    "_blank",
                  )
                }
              />

              <Mail className="h-6 w-6 cursor-pointer text-megaweave-stone transition-colors hover:text-megaweave-gold-light" />
            </div>
          </div>

          <div className="mt-8 border-t border-megaweave-sand/20 pt-8 text-center text-megaweave-stone">
            <p>
              &copy; 2025 MEGAWEAVE. Building commons for a sustainable future.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MegaweaveLanding;
