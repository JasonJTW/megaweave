import React from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MemberDetailProps {
  member: {
    id: string;
    name: string;
    title: string;
    avatar: string;
    location: string;
    department: string;
    bio: string;
    experience: Array<{
      year: string;
      position: string;
      company: string;
      description: string;
    }>;
    projects: Array<{
      name: string;
      description: string;
      image?: string;
    }>;
    skills: string[];
    contact?: {
      email?: string;
      website?: string;
      linkedin?: string;
    };
  };
  onClose?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

const MemberDetailPage: React.FC<MemberDetailProps> = ({
  member,
  onClose,
  onPrevious,
  onNext,
}) => {
  return (
    <div className="min-h-screen bg-primary-75 overflow-hidden relative">
      {/* Navigation Controls */}
      <div className="fixed top-8 left-8 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrevious}
          className="bg-black text-white hover:bg-gray-800 rounded-full px-6 py-2 mr-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Prev
        </Button>
      </div>

      <div className="fixed top-8 right-8 z-50 flex gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onNext}
          className="bg-black text-white hover:bg-gray-800 rounded-full px-6 py-2"
        >
          Next
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="bg-black text-white hover:bg-gray-800 rounded-full p-2"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="px-10 md:px-20">
        {/* Header with Member Location */}
        <div className="pt-20 pb-10">
          <div className="flex items-center justify-between">
            <div className="bg-black text-white px-4 py-2 text-sm rounded-full">
              {member.location}
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20 pb-20">
          {/* Left Column - Member Image and Basic Info */}
          <div className="space-y-8">
            {/* Member Image */}
            <div className="relative">
              <img
                src={member.avatar}
                alt={member.name}
                className="w-full aspect-[3/4] object-cover bg-gray-200 rounded-xl shadow-lg"
              />
              <div className="absolute top-4 left-4 bg-black text-white px-4 py-2 text-sm rounded-full">
                {member.title}
              </div>
            </div>

            {/* Member Name and Department */}
            <div>
              <h1 className="text-4xl md:text-5xl text-secondary font-bold mb-2">
                {member.name}
              </h1>
              <p className="text-xl text-secondary-75 mb-4">
                {member.department}
              </p>
            </div>

            {/* Contact Information */}
            {member.contact && (
              <div className="space-y-3">
                {member.contact.email && (
                  <div>
                    <p className="text-sm text-secondary-75 uppercase tracking-wide mb-1">
                      Email
                    </p>
                    <a
                      href={`mailto:${member.contact.email}`}
                      className="text-secondary hover:text-secondary-75 transition-colors"
                    >
                      {member.contact.email}
                    </a>
                  </div>
                )}
                {member.contact.website && (
                  <div>
                    <p className="text-sm text-secondary-75 uppercase tracking-wide mb-1">
                      Website
                    </p>
                    <a
                      href={member.contact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary hover:text-secondary-75 transition-colors"
                    >
                      {member.contact.website}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Detailed Information */}
          <div className="space-y-12">
            {/* Profile Section */}
            <div>
              <h2 className="text-2xl text-secondary mb-6 pb-4 border-b border-megaweave-stone">
                Profile
              </h2>
              <p className="text-lg text-secondary leading-relaxed">
                {member.bio}
              </p>
            </div>

            {/* Experience Section */}
            {member.experience && member.experience.length > 0 && (
              <div>
                <h2 className="text-2xl text-secondary mb-6 pb-4 border-b border-megaweave-stone">
                  Experience
                </h2>
                <div className="space-y-6">
                  {member.experience.map((exp, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-secondary">
                            {exp.position}
                          </h3>
                          <p className="text-secondary-75 mb-2">
                            {exp.company}
                          </p>
                          <p className="text-secondary leading-relaxed">
                            {exp.description}
                          </p>
                        </div>
                        <div className="text-sm text-secondary-75 ml-4 flex-shrink-0">
                          {exp.year}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills Section */}
            {member.skills && member.skills.length > 0 && (
              <div>
                <h2 className="text-2xl text-secondary mb-6 pb-4 border-b border-megaweave-stone">
                  Skills & Expertise
                </h2>
                <div className="flex flex-wrap gap-3">
                  {member.skills.map((skill, index) => (
                    <span
                      key={index}
                      className="bg-secondary-75 text-white px-4 py-2 rounded-full text-sm"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Projects Section */}
            {member.projects && member.projects.length > 0 && (
              <div>
                <h2 className="text-2xl text-secondary mb-6 pb-4 border-b border-megaweave-stone">
                  Projects
                </h2>
                <div className="space-y-6">
                  {member.projects.map((project, index) => (
                    <div key={index} className="space-y-3">
                      {project.image && (
                        <img
                          src={project.image}
                          alt={project.name}
                          className="w-full h-48 object-cover rounded-lg"
                        />
                      )}
                      <h3 className="text-lg font-semibold text-secondary">
                        {project.name}
                      </h3>
                      <p className="text-secondary leading-relaxed">
                        {project.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberDetailPage;
