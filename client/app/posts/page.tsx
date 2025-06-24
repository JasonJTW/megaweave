"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
} from "lucide-react";

export default function PostsGrid() {
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [visiblePosts, setVisiblePosts] = useState(9);
  const [loading, setLoading] = useState(false);

  // Extended free items posts data
  const allPosts = [
    {
      id: 1,
      author: "SarahM",
      avatar:
        "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=400&fit=crop",
      title: "Vintage Bookshelf",
      type: "FREE",
      content:
        "Moving out and need to give away this beautiful wooden bookshelf. Perfect condition, just needs a new home! Great for books, plants, or decorative items. Pick up only from downtown area.",
      likes: 248,
      comments: 32,
      time: "2 hours ago",
    },
    {
      id: 2,
      author: "MikeD",
      avatar:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=400&fit=crop",
      title: "Office Chair & Desk Set",
      type: "FREE",
      content:
        "Upgrading my home office setup! This ergonomic chair and matching desk are still in excellent condition. Would prefer to give them to someone who really needs them for work or study.",
      likes: 156,
      comments: 28,
      time: "4 hours ago",
    },
    {
      id: 3,
      author: "JennyL",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=400&h=400&fit=crop",
      title: "Baby Clothes 0-12 months",
      type: "WANTED",
      content:
        "New mom here! Looking for gently used baby clothes, especially onesies and sleepers. Any size from 0-12 months would be amazing. Happy to pick up anywhere in the city. Thank you!",
      likes: 189,
      comments: 45,
      time: "6 hours ago",
    },
    {
      id: 4,
      author: "DavidK",
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop",
      title: "Kitchen Appliances Bundle",
      type: "FREE",
      content:
        "Renovating kitchen and giving away these working appliances: microwave, toaster, coffee maker, and blender. All in good working condition. Perfect starter set for students or new apartment!",
      likes: 324,
      comments: 67,
      time: "8 hours ago",
    },
    {
      id: 5,
      author: "EmmaR",
      avatar:
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
      title: "Art Supplies for Kids",
      type: "WANTED",
      content:
        "Teacher here! Looking for donated art supplies for my classroom - crayons, markers, colored paper, glue sticks, anything creative! My students would be so grateful for any contributions.",
      likes: 112,
      comments: 19,
      time: "10 hours ago",
    },
    {
      id: 6,
      author: "TechTom",
      avatar:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&h=400&fit=crop",
      title: "Old Laptop & Monitor",
      type: "FREE",
      content:
        "Clearing out old tech! This laptop still works great for basic tasks and comes with an external monitor. Perfect for someone learning to code or needing a backup computer. Charger included!",
      likes: 276,
      comments: 54,
      time: "12 hours ago",
    },
    {
      id: 7,
      author: "GreenGardener",
      avatar:
        "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=400&fit=crop",
      title: "Garden Tools & Plant Pots",
      type: "FREE",
      content:
        "Downsizing my garden and have extra tools and terracotta pots to give away. Includes hand trowels, watering can, and various sized pots. Great for someone starting their gardening journey!",
      likes: 198,
      comments: 36,
      time: "14 hours ago",
    },
    {
      id: 8,
      author: "BookwormBeth",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=400&fit=crop",
      title: "Children's Books",
      type: "WANTED",
      content:
        "Starting a little free library in our neighborhood! Looking for donations of children's books in good condition. Picture books, chapter books, anything that kids would enjoy reading!",
      likes: 143,
      comments: 41,
      time: "16 hours ago",
    },
    {
      id: 9,
      author: "FitnessFreak",
      avatar:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop",
      title: "Exercise Equipment",
      type: "FREE",
      content:
        "Moving to a smaller place and can't take my home gym with me. Giving away dumbbells, yoga mat, resistance bands, and a stability ball. All barely used and in excellent condition!",
      likes: 367,
      comments: 82,
      time: "18 hours ago",
    },
    {
      id: 10,
      author: "MusicMaker",
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop",
      title: "Electric Guitar & Amp",
      type: "FREE",
      content:
        "My son left for college and his guitar is just collecting dust. Includes amplifier, cable, and guitar picks. Would love to see it go to someone who will actually play it! Some wear but sounds great.",
      likes: 445,
      comments: 73,
      time: "20 hours ago",
    },
    {
      id: 11,
      author: "CraftQueen",
      avatar:
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=400&h=400&fit=crop",
      title: "Fabric Scraps & Yarn",
      type: "WANTED",
      content:
        "Crafting enthusiast looking for leftover fabric pieces and yarn for my quilting and knitting projects. Any colors, patterns, or materials welcome! I can pick up or you can drop off.",
      likes: 89,
      comments: 15,
      time: "22 hours ago",
    },
    {
      id: 12,
      author: "PetLover99",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400&h=400&fit=crop",
      title: "Cat Tree & Pet Supplies",
      type: "FREE",
      content:
        "Our cat passed away recently and we want her things to help other furry friends. Large cat tree, food bowls, toys, and scratching posts. Everything is clean and in good condition.",
      likes: 234,
      comments: 48,
      time: "1 day ago",
    },
    {
      id: 13,
      author: "StudyBuddy",
      avatar:
        "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=400&fit=crop",
      title: "College Textbooks",
      type: "WANTED",
      content:
        "Starting university next semester and textbooks are so expensive! Looking for used textbooks for biology, chemistry, and math courses. Any edition is fine, just need them for studying.",
      likes: 167,
      comments: 29,
      time: "1 day ago",
    },
    {
      id: 14,
      author: "RetiredTeacher",
      avatar:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop",
      title: "Educational Games & Puzzles",
      type: "FREE",
      content:
        "Retired from teaching and have boxes of educational games, puzzles, and learning materials. Perfect for homeschooling families or parents looking for educational fun activities!",
      likes: 298,
      comments: 52,
      time: "1 day ago",
    },
    {
      id: 15,
      author: "TechStartup",
      avatar:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=400&fit=crop",
      title: "Office Furniture Clearance",
      type: "FREE",
      content:
        "Startup office closing down! Have multiple desks, office chairs, filing cabinets, and whiteboards to give away. Perfect for home offices or other small businesses. Must pick up this week!",
      likes: 523,
      comments: 91,
      time: "1 day ago",
    },
    {
      id: 16,
      author: "FamilyFirst",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop",
      title: "Stroller & Baby Gear",
      type: "WANTED",
      content:
        "Expecting our first baby and trying to prepare on a tight budget. Looking for a stroller, high chair, baby carrier, or any other baby essentials. Gently used is perfectly fine!",
      likes: 156,
      comments: 34,
      time: "1 day ago",
    },
    {
      id: 17,
      author: "GreenThumb",
      avatar:
        "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=400&h=400&fit=crop",
      title: "Indoor Plants & Planters",
      type: "FREE",
      content:
        "Moving overseas and can't take my plant babies with me! Various indoor plants including pothos, snake plants, and succulents. Comes with pots and plant care instructions.",
      likes: 312,
      comments: 67,
      time: "2 days ago",
    },
    {
      id: 18,
      author: "MovieBuff",
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=400&fit=crop",
      title: "DVD Collection & Player",
      type: "FREE",
      content:
        "Switching to streaming and clearing out my DVD collection! Over 200 movies and TV series, plus a working DVD player. Mix of genres - action, comedy, drama, documentaries.",
      likes: 445,
      comments: 78,
      time: "2 days ago",
    },
    {
      id: 19,
      author: "HomeCook",
      avatar:
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop",
      title: "Cooking Equipment",
      type: "WANTED",
      content:
        "New apartment doesn't have much kitchen equipment! Looking for basic cooking tools - pots, pans, utensils, cutting boards. Starting from scratch and would appreciate any donations!",
      likes: 123,
      comments: 21,
      time: "2 days ago",
    },
    {
      id: 20,
      author: "GameCollector",
      avatar:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=400&h=400&fit=crop",
      title: "Board Games Collection",
      type: "FREE",
      content:
        "Kids have outgrown these games and we need the space. Classic board games including Monopoly, Scrabble, Risk, and several others. All pieces included and in good condition.",
      likes: 267,
      comments: 43,
      time: "2 days ago",
    },
    {
      id: 21,
      author: "SportsFan",
      avatar:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop",
      title: "Sports Equipment",
      type: "FREE",
      content:
        "Cleaning out the garage and found old sports gear! Tennis rackets, basketballs, soccer balls, and some baseball equipment. Most items barely used, great for kids getting into sports.",
      likes: 189,
      comments: 31,
      time: "2 days ago",
    },
    {
      id: 22,
      author: "ArtStudent",
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400&h=400&fit=crop",
      title: "Art Canvas & Paints",
      type: "WANTED",
      content:
        "Art student on a budget looking for painting supplies! Need canvases of any size and acrylic or oil paints. Even old, partially used supplies would be incredibly helpful for my studies.",
      likes: 94,
      comments: 16,
      time: "3 days ago",
    },
    {
      id: 23,
      author: "Fashionista",
      avatar:
        "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=400&fit=crop",
      title: "Women's Clothing Lot",
      type: "FREE",
      content:
        "Closet cleanout! Sizes S-M women's clothing including dresses, blouses, jeans, and jackets. All in good condition, just doesn't fit my style anymore. Perfect for someone starting fresh!",
      likes: 356,
      comments: 64,
      time: "3 days ago",
    },
    {
      id: 24,
      author: "HandyPerson",
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=400&fit=crop",
      title: "Power Tools & Hardware",
      type: "FREE",
      content:
        "Upgraded my workshop and have duplicate tools to give away. Includes drill, circular saw, various screwdrivers, and boxes of screws/nails. Perfect for DIY enthusiasts or professionals!",
      likes: 423,
      comments: 87,
      time: "3 days ago",
    },
    {
      id: 25,
      author: "BusyMom",
      avatar:
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1503602642458-232111445657?w=400&h=400&fit=crop",
      title: "Kids' Bicycles",
      type: "WANTED",
      content:
        "Looking for used bicycles for my two kids, ages 8 and 10. They're growing so fast and outgrow bikes quickly! Training wheels not needed but helmets would be a bonus. Thank you!",
      likes: 178,
      comments: 25,
      time: "3 days ago",
    },
    {
      id: 26,
      author: "ElderlyHelper",
      avatar:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400&h=400&fit=crop",
      title: "Medical Equipment",
      type: "FREE",
      content:
        "My father no longer needs these mobility aids. Giving away a walker, shower chair, and bed rails. All in excellent condition and could really help someone else maintain their independence.",
      likes: 234,
      comments: 42,
      time: "3 days ago",
    },
    {
      id: 27,
      author: "TechRecycler",
      avatar:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face",
      image:
        "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=400&h=400&fit=crop",
      title: "Broken Electronics",
      type: "WANTED",
      content:
        "Electronics repair hobbyist looking for broken phones, tablets, computers, or any electronic devices. I enjoy fixing things and learning how they work. Condition doesn't matter!",
      likes: 145,
      comments: 18,
      time: "4 days ago",
    },
  ];

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (loading) return;

    const scrollTop = document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight - 1000) {
      if (visiblePosts < allPosts.length) {
        setLoading(true);
        setTimeout(() => {
          setVisiblePosts((prev) => Math.min(prev + 6, allPosts.length));
          setLoading(false);
        }, 800); // Simulate loading delay
      }
    }
  }, [loading, visiblePosts, allPosts.length]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const handleLike = (postId) => {
    setLikedPosts((prev) => {
      const newLiked = new Set(prev);
      if (newLiked.has(postId)) {
        newLiked.delete(postId);
      } else {
        newLiked.add(postId);
      }
      return newLiked;
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            MegaWeave
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allPosts.slice(0, visiblePosts).map((post) => (
            <article
              key={post.id}
              className="bg-gray-900/50 rounded-2xl overflow-hidden border border-gray-800/50 hover:border-gray-700/50 transition-all duration-300 hover:transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10"
            >
              {/* Post Image */}
              <div className="relative overflow-hidden">
                <img
                  src={post.image}
                  alt={post.title}
                  className="w-full h-64 object-cover transition-transform duration-500 hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              </div>

              {/* Post Content */}
              <div className="p-6">
                {/* Author Info */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={post.avatar}
                      alt={post.author}
                      className="w-10 h-10 rounded-full border-2 border-gray-700"
                    />
                    <div>
                      <h3 className="font-semibold text-sm">{post.author}</h3>
                      <p className="text-gray-400 text-xs">{post.time}</p>
                    </div>
                  </div>
                  <button className="text-gray-400 hover:text-white transition-colors">
                    <MoreHorizontal size={20} />
                  </button>
                </div>

                {/* Post Title & Content */}
                <div className="flex justify-between">
                  <h2 className="font-bold text-lg mb-3 line-clamp-2">
                    {post.title}
                  </h2>
                  <div
                    className={`h-8 items-center justify-center rounded-full backdrop-blur-md border-[0.5px] text-opacity-65 font-semibold tracking-wider text-xs pt-2 pb-2 pl-4 pr-4 mt-2 ml-6 w-fit leading-none ${
                      post.type === "WANTED"
                        ? "bg-red-400 bg-opacity-[10%] border-gray-700 text-primary-300"
                        : "bg-green-400 bg-opacity-[10%] border-gray-700 text-primary-300"
                    }`}
                  >
                    {post.type}
                  </div>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-4 line-clamp-3">
                  {post.content}
                </p>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleLike(post.id)}
                      className={`flex items-center gap-2 transition-colors ${
                        likedPosts.has(post.id)
                          ? "text-red-500"
                          : "text-gray-400 hover:text-red-500"
                      }`}
                    >
                      <Heart
                        size={18}
                        fill={likedPosts.has(post.id) ? "currentColor" : "none"}
                      />
                      <span className="text-sm">
                        {likedPosts.has(post.id) ? post.likes + 1 : post.likes}
                      </span>
                    </button>

                    <button className="flex items-center gap-2 text-gray-400 hover:text-blue-500 transition-colors">
                      <MessageCircle size={18} />
                      <span className="text-sm">{post.comments}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button className="text-gray-400 hover:text-green-500 transition-colors">
                      <Share2 size={18} />
                    </button>
                    <button className="text-gray-400 hover:text-yellow-500 transition-colors">
                      <Bookmark size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-gray-400">
          <p>© 2025 Megaweave</p>
        </div>
      </footer>
    </div>
  );
}
