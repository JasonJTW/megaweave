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
      icon: <Search className="w-8 h-8" />,
      title: "Discover Resources",
      description:
        "Find exactly what you need from our community of 10,000+ members",
    },
    {
      icon: <Share2 className="w-8 h-8" />,
      title: "Share Commons",
      description: "Contribute to the permanent commons for collective access",
    },
    {
      icon: <MessageCircle className="w-8 h-8" />,
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
      className="min-h-screen text-white overflow-hidden bg-megaweave-forest"
      style={{
        background:
          "linear-gradient(135deg, #2d3e2d 0%, #1a2a1a 50%, #0f1f0f 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full rounded-full animate-pulse bg-gradient-to-br from-megaweave-gold/20 to-transparent"></div>
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full rounded-full animate-pulse delay-700 bg-gradient-to-tr from-megaweave-gold-light/20 to-transparent"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full animate-pulse delay-1000 bg-gradient-to-br from-megaweave-sand/10 to-transparent"></div>
        <div className="absolute top-3/4 right-1/4 w-64 h-64 rounded-full animate-pulse delay-500 bg-gradient-to-br from-megaweave-stone/15 to-transparent"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 p-6 flex justify-between items-center backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <Image
            src="/favicon.ico"
            alt="megaweaving icon"
            width={32}
            height={32}
            className="rounded-sm"
          />
          <span className="text-2xl font-semibold text-white font-ddin">
            megaweaving
          </span>
        </div>
        <div className="hidden md:flex space-x-8">
          <a
            href="#features"
            className="font-medium text-megaweave-sand hover:text-megaweave-gold-light transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="font-medium text-megaweave-sand hover:text-megaweave-gold-light transition-colors"
          >
            How It Works
          </a>
          <a
            href="#community"
            className="font-medium text-megaweave-sand hover:text-megaweave-gold-light transition-colors"
          >
            Community
          </a>
        </div>
        <Link
          href="/signup"
          className="px-6 py-2 rounded-full font-semibold shadow-lg transition-all duration-300 transform hover:scale-105 bg-megaweave-sand text-megaweave-forest-dark"
        >
          Join Now
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 py-20 text-center">
        <div
          className={`max-w-6xl mx-auto transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
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
          <p className="text-xl md:text-2xl mb-12 max-w-4xl mx-auto leading-relaxed text-megaweave-sand">
            Transform surplus into opportunity. Connect communities worldwide
            through a transparent, database-driven platform that bridges the gap
            between overflow and need.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button className="group px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-xl bg-megaweave-primary text-megaweave-forest-dark">
              <span>Start Sharing</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <Link
              href="/posts"
              className="px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 backdrop-blur-sm border-2 border-megaweave-gold-light text-megaweave-cream hover:bg-megaweave-gold-light/10"
            >
              Explore Resources
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-megaweave-gold-light to-megaweave-gold bg-clip-text text-transparent">
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
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-8 h-8 text-megaweave-gold-light" />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            <span className="text-megaweave-cream">Built for </span>
            <span className="text-megaweave-gold-light">Community</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`backdrop-blur-sm rounded-2xl p-8 transition-all duration-500 hover:transform hover:scale-105 shadow-lg border border-megaweave-sand/20 ${
                  activeFeature === index
                    ? "ring-2 ring-megaweave-gold-light bg-megaweave-cream/15"
                    : "bg-megaweave-cream/10"
                }`}
              >
                <div className="mb-4 text-megaweave-gold-light">
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-bold mb-4 text-megaweave-cream">
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
        className="relative z-10 px-6 py-20 backdrop-blur-sm bg-megaweave-forest-dark/30"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            <span className="text-megaweave-cream">How It </span>
            <span className="text-megaweave-gold">Works</span>
          </h2>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold bg-megaweave-gold-light text-megaweave-forest-dark">
                  1
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-megaweave-cream">
                    Share Your Resources
                  </h3>
                  <p className="text-megaweave-sand">
                    Upload photos and descriptions of items you no longer need.
                    Tag them for easy discovery.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold bg-megaweave-gold text-megaweave-cream">
                  2
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-megaweave-cream">
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
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold bg-megaweave-forest-light text-megaweave-cream">
                  3
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-megaweave-cream">
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
              <div className="w-full h-80 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-xl border border-megaweave-sand/20 bg-gradient-to-br from-megaweave-sand/20 to-megaweave-gold/20">
                <div className="text-center">
                  <Globe className="w-16 h-16 mx-auto mb-4 text-megaweave-gold-light" />
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
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-8">
            <span className="text-megaweave-cream">Our </span>
            <span className="text-megaweave-red-light">Values</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="space-y-4 p-8 rounded-2xl backdrop-blur-sm border border-megaweave-sand/20 transition-all duration-300 hover:transform hover:scale-105 bg-megaweave-cream/10">
              <Recycle className="w-12 h-12 mx-auto text-megaweave-forest-light" />
              <h3 className="text-xl font-bold text-megaweave-cream">
                Sustainability
              </h3>
              <p className="text-megaweave-sand">
                Reduce waste by giving resources a second life in communities
                that need them.
              </p>
            </div>

            <div className="space-y-4 p-8 rounded-2xl backdrop-blur-sm border border-megaweave-sand/20 transition-all duration-300 hover:transform hover:scale-105 bg-megaweave-cream/10">
              <Users className="w-12 h-12 mx-auto text-megaweave-blue" />
              <h3 className="text-xl font-bold text-megaweave-cream">
                Community
              </h3>
              <p className="text-megaweave-sand">
                Build connections and mutual aid networks that strengthen local
                and global communities.
              </p>
            </div>

            <div className="space-y-4 p-8 rounded-2xl backdrop-blur-sm border border-megaweave-sand/20 transition-all duration-300 hover:transform hover:scale-105 bg-megaweave-cream/10">
              <Heart className="w-12 h-12 mx-auto text-megaweave-red-light" />
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
      <section className="relative z-10 px-6 py-20 backdrop-blur-sm bg-gradient-to-br from-megaweave-gold/30 to-megaweave-gold-light/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-8 text-megaweave-cream">
            Ready to Start Weaving?
          </h2>
          <p className="text-xl mb-12 text-megaweave-sand">
            Join thousands of community members creating a more sustainable and
            equitable world through resource sharing.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-xl bg-megaweave-primary text-megaweave-forest-dark">
              Join the Platform
            </button>
            <button className="border-2 px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 backdrop-blur-sm border-megaweave-cream/50 text-megaweave-cream hover:bg-megaweave-cream/10">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-12 border-t backdrop-blur-sm bg-megaweave-forest-dark/50 border-megaweave-sand/20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg bg-megaweave-primary">
                <div className="w-4 h-4 rounded-sm opacity-90 bg-megaweave-cream"></div>
              </div>
              <span className="text-xl font-bold text-megaweave-cream">
                Megaweave
              </span>
            </div>

            <div className="flex space-x-6">
              <Facebook
                className="w-6 h-6 cursor-pointer transition-colors text-megaweave-stone hover:text-megaweave-gold-light"
                onClick={() =>
                  window.open(
                    "https://www.facebook.com/groups/1596603907320118/?locale=zh_TW",
                    "_blank"
                  )
                }
              />

              <Mail className="w-6 h-6 cursor-pointer transition-colors text-megaweave-stone hover:text-megaweave-gold-light" />
            </div>
          </div>

          <div className="mt-8 pt-8 border-t text-center border-megaweave-sand/20 text-megaweave-stone">
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
