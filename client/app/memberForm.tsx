// import React, { useState, useEffect } from "react";
// import { motion } from "framer-motion";
// import { useForm } from "react-hook-form";
// import {
//   Form,
//   FormControl,
//   FormField,
//   FormItem,
//   FormLabel,
// } from "@/components/ui/form";
// import { Switch } from "@/components/ui/switch";
// import { Alert, AlertDescription } from "@/components/ui/alert";
// import { Users, Edit3, Save, X, Building, MapPin, Globe } from "lucide-react";
// import renderTextWithUrls from "@/utils/renderTextWithUrl";

// // Member Form 資料型別
// type MemberFormValues = {
//   company?: string;
//   position?: string;
//   location?: string;
//   website?: string;
//   linkedin?: string;
//   github?: string;
//   companyVisible: boolean;
//   positionVisible: boolean;
//   locationVisible: boolean;
//   websiteVisible: boolean;
//   linkedinVisible: boolean;
//   githubVisible: boolean;
// };

// const defaultMemberValues: MemberFormValues = {
//   company: "",
//   position: "",
//   location: "",
//   website: "",
//   linkedin: "",
//   github: "",
//   companyVisible: false,
//   positionVisible: false,
//   locationVisible: false,
//   websiteVisible: false,
//   linkedinVisible: false,
//   githubVisible: false,
// };

// interface MemberFormProps {
//   isContributor: boolean;
// }

// const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

// const MemberForm: React.FC<MemberFormProps> = ({ isContributor }) => {
//   // State management
//   const [isEditingMember, setIsEditingMember] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [loading, setLoading] = useState(false);

//   // Form state
//   const memberForm = useForm<MemberFormValues>({
//     defaultValues: defaultMemberValues,
//   });

//   // API functions
//   const fetchMemberData = async () => {
//     try {
//       setLoading(true);
//       const response = await fetch(`${hostName}/api/userprofile/member`, {
//         cache: "no-store",
//         method: "GET",
//         credentials: "include",
//       });

//       if (!response.ok) {
//         const result = await response.json();
//         throw new Error(result.errorMessage || "Failed to fetch member data");
//       }

//       const result = await response.json();

//       // Update form with fetched data
//       memberForm.reset({
//         company: result.company || "",
//         position: result.position || "",
//         location: result.location || "",
//         website: result.website || "",
//         linkedin: result.linkedin || "",
//         github: result.github || "",
//         companyVisible: result.companyVisible || false,
//         positionVisible: result.positionVisible || false,
//         locationVisible: result.locationVisible || false,
//         websiteVisible: result.websiteVisible || false,
//         linkedinVisible: result.linkedinVisible || false,
//         githubVisible: result.githubVisible || false,
//       });

//       setError(null);
//     } catch (error) {
//       console.error("Error fetching member data:", error);
//       setError(
//         error instanceof Error ? error.message : "Failed to fetch member data"
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   const saveMemberData = async (data: MemberFormValues) => {
//     try {
//       const response = await fetch(`${hostName}/api/userprofile/member`, {
//         cache: "no-store",
//         method: "POST",
//         credentials: "include",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(data),
//       });

//       if (!response.ok) {
//         const result = await response.json();
//         throw new Error(result.errorMessage || "Failed to save member data");
//       }

//       const result = await response.json();
//       console.log("Member data saved successfully:", result);
//       setError(null);
//       return result;
//     } catch (error) {
//       console.error("Error saving member data:", error);
//       setError(
//         error instanceof Error ? error.message : "Failed to save member data"
//       );
//       throw error;
//     }
//   };

//   // Event handlers
//   const handleEditMember = () => {
//     setIsEditingMember(true);
//   };

//   const handleSaveMember = async () => {
//     try {
//       const formData = memberForm.getValues();
//       await saveMemberData(formData);
//       setIsEditingMember(false);
//     } catch (error) {
//       // Error handling is done in saveMemberData
//       console.log("Error saving member data, staying in edit mode.", error);
//     }
//   };

//   const handleCancelMember = () => {
//     // Reset form to original values
//     fetchMemberData();
//     setIsEditingMember(false);
//     setError(null);
//   };

//   const onMemberFormSubmit = async (data: MemberFormValues) => {
//     await handleSaveMember();
//   };

//   // Load data on component mount
//   useEffect(() => {
//     if (isContributor) {
//       fetchMemberData();
//     }
//   }, [isContributor]);

//   // Don't render if not contributor
//   if (!isContributor) {
//     return null;
//   }

//   if (loading) {
//     return (
//       <motion.div
//         initial={{ opacity: 0, y: 20 }}
//         animate={{ opacity: 1, y: 0 }}
//         className="max-w-6xl mx-auto px-6 py-4"
//       >
//         <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/30 rounded-2xl p-6">
//           <div className="flex items-center justify-center py-8">
//             <div className="w-8 h-8 border-2 border-megaweave-gold/30 border-t-megaweave-red-light rounded-full animate-spin"></div>
//           </div>
//         </div>
//       </motion.div>
//     );
//   }

//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 20 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ delay: 0.3 }}
//       className="max-w-6xl mx-auto px-6 py-4"
//     >
//       <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/30 rounded-2xl p-6 hover:border-gray-600/40 transition-all duration-300">
//         {/* Header */}
//         <div className="flex items-center justify-between mb-8">
//           <h3 className="text-xl font-semibold flex items-center space-x-2">
//             <Users className="w-5 h-5" />
//             <span>Member Information</span>
//           </h3>
//           {!isEditingMember ? (
//             <button
//               onClick={handleEditMember}
//               className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200 text-sm"
//             >
//               <Edit3 className="w-3 h-3" />
//               <span>Edit</span>
//             </button>
//           ) : (
//             <div className="flex space-x-2">
//               <button
//                 onClick={handleSaveMember}
//                 className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 transition-all duration-200 text-sm text-green-400"
//               >
//                 <Save className="w-3 h-3" />
//                 <span>Save</span>
//               </button>
//               <button
//                 onClick={handleCancelMember}
//                 className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-600/20 hover:bg-gray-600/30 transition-all duration-200 text-sm text-gray-400"
//               >
//                 <X className="w-3 h-3" />
//                 <span>Cancel</span>
//               </button>
//             </div>
//           )}
//         </div>

//         {/* Error Alert */}
//         {error && (
//           <Alert className="mb-6 bg-red-950/50 border-red-500/30">
//             <AlertDescription className="text-red-300">
//               {error}
//             </AlertDescription>
//           </Alert>
//         )}

//         {/* Form */}
//         <Form {...memberForm}>
//           <form
//             onSubmit={memberForm.handleSubmit(onMemberFormSubmit)}
//             className="space-y-6"
//           >
//             {/* Company & Position */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//               {/* Company */}
//               <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
//                 <div className="flex items-center justify-between">
//                   <div className="flex items-center space-x-2">
//                     <Building className="w-4 h-4" />
//                     <FormLabel className="text-base font-medium">
//                       Company
//                     </FormLabel>
//                   </div>
//                   <FormField
//                     control={memberForm.control}
//                     name="companyVisible"
//                     render={({ field }) => (
//                       <FormItem>
//                         <div className="flex items-center space-x-2">
//                           <span
//                             className={`text-sm transition-colors duration-200 ${
//                               field.value ? "text-green-400" : "text-gray-400"
//                             }`}
//                           >
//                             {field.value ? "Public" : "Private"}
//                           </span>
//                           <FormControl>
//                             <Switch
//                               checked={field.value}
//                               onCheckedChange={field.onChange}
//                               className="data-[state=checked]:bg-blue-500"
//                             />
//                           </FormControl>
//                         </div>
//                       </FormItem>
//                     )}
//                   />
//                 </div>
//                 <FormField
//                   control={memberForm.control}
//                   name="company"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormControl>
//                         {isEditingMember ? (
//                           <input
//                             {...field}
//                             type="text"
//                             placeholder="Enter your company"
//                             className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
//                           />
//                         ) : (
//                           <div className="text-gray-300 rounded-lg min-h-[2.5rem] flex items-center">
//                             {renderTextWithUrls(
//                               field.value || "No company provided"
//                             )}
//                           </div>
//                         )}
//                       </FormControl>
//                     </FormItem>
//                   )}
//                 />
//               </div>

//               {/* Position */}
//               <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
//                 <div className="flex items-center justify-between">
//                   <FormLabel className="text-base font-medium">
//                     Position
//                   </FormLabel>
//                   <FormField
//                     control={memberForm.control}
//                     name="positionVisible"
//                     render={({ field }) => (
//                       <FormItem>
//                         <div className="flex items-center space-x-2">
//                           <span
//                             className={`text-sm transition-colors duration-200 ${
//                               field.value ? "text-green-400" : "text-gray-400"
//                             }`}
//                           >
//                             {field.value ? "Public" : "Private"}
//                           </span>
//                           <FormControl>
//                             <Switch
//                               checked={field.value}
//                               onCheckedChange={field.onChange}
//                               className="data-[state=checked]:bg-blue-500"
//                             />
//                           </FormControl>
//                         </div>
//                       </FormItem>
//                     )}
//                   />
//                 </div>
//                 <FormField
//                   control={memberForm.control}
//                   name="position"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormControl>
//                         {isEditingMember ? (
//                           <input
//                             {...field}
//                             type="text"
//                             placeholder="Enter your position"
//                             className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
//                           />
//                         ) : (
//                           <div className="text-gray-300 rounded-lg min-h-[2.5rem] flex items-center">
//                             {field.value || "No position provided"}
//                           </div>
//                         )}
//                       </FormControl>
//                     </FormItem>
//                   )}
//                 />
//               </div>
//             </div>

//             {/* Location */}
//             <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
//               <div className="flex items-center justify-between">
//                 <div className="flex items-center space-x-2">
//                   <MapPin className="w-4 h-4" />
//                   <FormLabel className="text-base font-medium">
//                     Location
//                   </FormLabel>
//                 </div>
//                 <FormField
//                   control={memberForm.control}
//                   name="locationVisible"
//                   render={({ field }) => (
//                     <FormItem>
//                       <div className="flex items-center space-x-2">
//                         <span
//                           className={`text-sm transition-colors duration-200 ${
//                             field.value ? "text-green-400" : "text-gray-400"
//                           }`}
//                         >
//                           {field.value ? "Public" : "Private"}
//                         </span>
//                         <FormControl>
//                           <Switch
//                             checked={field.value}
//                             onCheckedChange={field.onChange}
//                             className="data-[state=checked]:bg-blue-500"
//                           />
//                         </FormControl>
//                       </div>
//                     </FormItem>
//                   )}
//                 />
//               </div>
//               <FormField
//                 control={memberForm.control}
//                 name="location"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormControl>
//                       {isEditingMember ? (
//                         <input
//                           {...field}
//                           type="text"
//                           placeholder="Enter your location"
//                           className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
//                         />
//                       ) : (
//                         <div className="text-gray-300 rounded-lg">
//                           {field.value || "No location provided"}
//                         </div>
//                       )}
//                     </FormControl>
//                   </FormItem>
//                 )}
//               />
//             </div>

//             {/* Social Links */}
//             <div className="space-y-6">
//               <h4 className="text-lg font-medium flex items-center space-x-2">
//                 <Globe className="w-4 h-4" />
//                 <span>Social Links</span>
//               </h4>

//               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//                 {/* Website */}
//                 <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
//                   <div className="flex items-center justify-between">
//                     <FormLabel className="text-base font-medium">
//                       Website
//                     </FormLabel>
//                     <FormField
//                       control={memberForm.control}
//                       name="websiteVisible"
//                       render={({ field }) => (
//                         <FormItem>
//                           <div className="flex items-center space-x-2">
//                             <span
//                               className={`text-sm transition-colors duration-200 ${
//                                 field.value ? "text-green-400" : "text-gray-400"
//                               }`}
//                             >
//                               {field.value ? "Public" : "Private"}
//                             </span>
//                             <FormControl>
//                               <Switch
//                                 checked={field.value}
//                                 onCheckedChange={field.onChange}
//                                 className="data-[state=checked]:bg-blue-500"
//                               />
//                             </FormControl>
//                           </div>
//                         </FormItem>
//                       )}
//                     />
//                   </div>
//                   <FormField
//                     control={memberForm.control}
//                     name="website"
//                     render={({ field }) => (
//                       <FormItem>
//                         <FormControl>
//                           {isEditingMember ? (
//                             <input
//                               {...field}
//                               type="url"
//                               placeholder="https://your-website.com"
//                               className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
//                             />
//                           ) : (
//                             <div className="text-gray-300 rounded-lg min-h-[2.5rem] flex items-center">
//                               {renderTextWithUrls(
//                                 field.value || "No website provided"
//                               )}
//                             </div>
//                           )}
//                         </FormControl>
//                       </FormItem>
//                     )}
//                   />
//                 </div>

//                 {/* LinkedIn */}
//                 <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
//                   <div className="flex items-center justify-between">
//                     <FormLabel className="text-base font-medium">
//                       LinkedIn
//                     </FormLabel>
//                     <FormField
//                       control={memberForm.control}
//                       name="linkedinVisible"
//                       render={({ field }) => (
//                         <FormItem>
//                           <div className="flex items-center space-x-2">
//                             <span
//                               className={`text-sm transition-colors duration-200 ${
//                                 field.value ? "text-green-400" : "text-gray-400"
//                               }`}
//                             >
//                               {field.value ? "Public" : "Private"}
//                             </span>
//                             <FormControl>
//                               <Switch
//                                 checked={field.value}
//                                 onCheckedChange={field.onChange}
//                                 className="data-[state=checked]:bg-blue-500"
//                               />
//                             </FormControl>
//                           </div>
//                         </FormItem>
//                       )}
//                     />
//                   </div>
//                   <FormField
//                     control={memberForm.control}
//                     name="linkedin"
//                     render={({ field }) => (
//                       <FormItem>
//                         <FormControl>
//                           {isEditingMember ? (
//                             <input
//                               {...field}
//                               type="url"
//                               placeholder="https://linkedin.com/in/username"
//                               className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
//                             />
//                           ) : (
//                             <div className="text-gray-300 rounded-lg min-h-[2.5rem] flex items-center">
//                               {renderTextWithUrls(
//                                 field.value || "No LinkedIn provided"
//                               )}
//                             </div>
//                           )}
//                         </FormControl>
//                       </FormItem>
//                     )}
//                   />
//                 </div>
//               </div>

//               {/* GitHub */}
//               <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
//                 <div className="flex items-center justify-between">
//                   <FormLabel className="text-base font-medium">
//                     GitHub
//                   </FormLabel>
//                   <FormField
//                     control={memberForm.control}
//                     name="githubVisible"
//                     render={({ field }) => (
//                       <FormItem>
//                         <div className="flex items-center space-x-2">
//                           <span
//                             className={`text-sm transition-colors duration-200 ${
//                               field.value ? "text-green-400" : "text-gray-400"
//                             }`}
//                           >
//                             {field.value ? "Public" : "Private"}
//                           </span>
//                           <FormControl>
//                             <Switch
//                               checked={field.value}
//                               onCheckedChange={field.onChange}
//                               className="data-[state=checked]:bg-blue-500"
//                             />
//                           </FormControl>
//                         </div>
//                       </FormItem>
//                     )}
//                   />
//                 </div>
//                 <FormField
//                   control={memberForm.control}
//                   name="github"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormControl>
//                         {isEditingMember ? (
//                           <input
//                             {...field}
//                             type="url"
//                             placeholder="https://github.com/username"
//                             className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
//                           />
//                         ) : (
//                           <div className="text-gray-300 rounded-lg">
//                             {renderTextWithUrls(
//                               field.value || "No GitHub provided"
//                             )}
//                           </div>
//                         )}
//                       </FormControl>
//                     </FormItem>
//                   )}
//                 />
//               </div>
//             </div>
//           </form>
//         </Form>
//       </div>
//     </motion.div>
//   );
// };

// export default MemberForm;
