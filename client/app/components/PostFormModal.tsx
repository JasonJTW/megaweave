"use client";

import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { X, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePost } from "../contexts/PostContext";
import { CreatePostFormData, ItemInput, Post } from "../types/schema";

import AddIcon from "./icons/AddIcon";
import DeleteIcon from "./icons/DeleteIcon";
import TagIcon from "./icons/TagIcon";
import LocationIcon from "./icons/LocationIcon";
import ClockIcon from "./icons/ClockIcon";
import toast from "react-hot-toast";
const MAX_CONTENT_LENGTH = 1000;
const MIN_CONTENT_LENGTH = 3;
const MAX_ITEMS_COUNT = 20;
const MAX_ITEM_TITLE_LENGTH = 20;

export interface PostFormSubmitData {
  title: string;
  content: string;
  location: string;
  tags: string;
  categoryId: number;
  conditionLevel: number;
  status: Post["status"];
  expires_at?: Date;
  items: ItemInput[];
  place_id?: string;
  location_name?: string;
  location_url?: string;
  province?: string;
  city?: string;
  route?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  newImages: File[];
  deletedImageIds: number[];
}

interface PostFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  submitButtonText: string;
  isSubmitting: boolean;
  initialData?: Omit<CreatePostFormData, "type">;
  existingImages?: { id: number; image_url: string }[];
  onSubmit: (data: PostFormSubmitData) => Promise<void>;
}

export default function PostFormModal({
  isOpen,
  onClose,
  title,
  submitButtonText,
  isSubmitting,
  initialData,
  existingImages = [],
  onSubmit,
}: PostFormModalProps) {
  const { categories, conditions } = usePost();
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteInstanceRef =
    useRef<google.maps.places.Autocomplete | null>(null);
  // Track previous isOpen to detect false→true transitions
  const prevIsOpenRef = useRef(false);

  // Form States
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    location: "",
    categoryId: null as number | null,
    conditionLevel: null as number | null,
    expires_at: undefined as Date | undefined,
    items: [{ title: "", quantity: "" }] as {
      title: string;
      quantity: number | "";
    }[],
    status: "active" as Post["status"],
    place_id: undefined as string | undefined,
    location_name: undefined as string | undefined,
    location_url: undefined as string | undefined,
    province: undefined as string | undefined,
    city: undefined as string | undefined,
    route: undefined as string | undefined,
    zip: undefined as string | undefined,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
  });

  // Tags chip state
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);

  // Manage preview URLs lifecycle to avoid calling URL.createObjectURL on re-renders
  useEffect(() => {
    const urls = selectedImages.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedImages]);

  // Validation Errors State
  const [formErrors, setFormErrors] = useState<{
    images?: boolean;
    categoryId?: boolean;
    conditionLevel?: boolean;
    title?: boolean;
    location?: boolean;
    content?: boolean;
    expires_at?: boolean;
    items?: Array<{ title?: boolean; quantity?: boolean }>;
  }>({});

  // Initialize/Reset form states ONLY when modal opens (false→true transition)
  // Intentionally NOT resetting on every initialData reference change: the parent
  // (PostDetail) recreates initialFormData on every render (e.g. setIsUpdating),
  // which would cause the form to flash back to original values mid-edit.
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (justOpened) {
      setFormData({
        title: initialData?.title || "",
        content: initialData?.content || "",
        location: initialData?.location || "",
        categoryId: initialData?.categoryId || null,
        conditionLevel: initialData?.conditionLevel || null,
        expires_at: initialData?.expires_at || undefined,
        status: initialData?.status || "active",
        items:
          initialData?.items && initialData.items.length > 0
            ? initialData.items.map((it) => ({
                title: it.title,
                quantity: it.quantity,
              }))
            : [{ title: "", quantity: "" }],
        place_id: initialData?.place_id || undefined,
        location_name: initialData?.location_name || undefined,
        location_url: initialData?.location_url || undefined,
        province: initialData?.province || undefined,
        city: initialData?.city || undefined,
        route: initialData?.route || undefined,
        zip: initialData?.zip || undefined,
        lat: initialData?.lat || undefined,
        lng: initialData?.lng || undefined,
      });
      // Parse existing tags from comma-separated string
      const parsedTags = initialData?.tags
        ? initialData.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      setTags(parsedTags);
      setTagInput("");
      setSelectedImages([]);
      setDeletedImageIds([]);
      setFormErrors({});
    }
  }, [isOpen, initialData]);

  // Google Places Autocomplete Loader
  useEffect(() => {
    if (!isOpen || !locationInputRef.current) return;

    let checkGoogleInterval: NodeJS.Timeout;

    const initAutocomplete = () => {
      if (
        typeof window === "undefined" ||
        !window.google?.maps?.places ||
        !locationInputRef.current
      ) {
        return;
      }

      try {
        const autocomplete = new google.maps.places.Autocomplete(
          locationInputRef.current,
          {
            // types: ["geocode"],
            componentRestrictions: { country: "tw" },
            fields: [
              "name",
              "address_components",
              "formatted_address",
              "geometry",
              "place_id",
              "url",
            ],
          },
        );

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (place && place.geometry && place.geometry.location) {
            // Extract address details
            let province = "";
            let city = "";
            let route = "";
            let zip = "";

            console.log(place);

            if (place.address_components) {
              place.address_components.forEach((comp) => {
                const types = comp.types;
                if (types.includes("administrative_area_level_1")) {
                  province = comp.long_name;
                }
                if (
                  types.includes("sublocality_level_1") ||
                  types.includes("administrative_area_level_2")
                ) {
                  city = comp.long_name;
                }
                if (types.includes("route")) {
                  route = comp.long_name;
                }
                if (types.includes("postal_code")) {
                  zip = comp.long_name;
                }
              });
            }

            setFormErrors((prev) => ({
              ...prev,
              location: false,
            }));

            setFormData((prev) => ({
              ...prev,
              location: place.formatted_address || "",
              place_id: place.place_id,
              location_name: place.name || undefined,
              location_url: place.url || undefined,
              province,
              city,
              route,
              zip,
              lat: place.geometry?.location?.lat(),
              lng: place.geometry?.location?.lng(),
            }));
          }
        });

        autocompleteInstanceRef.current = autocomplete;
        if (checkGoogleInterval) {
          clearInterval(checkGoogleInterval);
        }
      } catch (error) {
        console.warn("Failed to initialize location autocomplete:", error);
      }
    };

    if (typeof window !== "undefined" && window.google?.maps?.places) {
      initAutocomplete();
    } else if (typeof window !== "undefined") {
      checkGoogleInterval = setInterval(() => {
        if (window.google?.maps?.places) {
          initAutocomplete();
        }
      }, 500);
    }

    return () => {
      if (checkGoogleInterval) {
        clearInterval(checkGoogleInterval);
      }
      if (autocompleteInstanceRef.current) {
        google.maps.event.clearInstanceListeners(
          autocompleteInstanceRef.current,
        );
        autocompleteInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  const invalidFieldBorderClass = (hasError?: boolean) =>
    hasError ? "border-red-500" : "";

  const invalidInputOnlyClass = (hasError?: boolean) =>
    hasError ? "[&_input]:!border-red-500" : "";

  const validateForm = () => {
    // Count occurrences of non-empty titles (case-insensitive or trimmed)
    const titleCounts = new Map<string, number>();
    formData.items.forEach((item) => {
      const trimmedTitle = item.title.trim().toLowerCase();
      if (trimmedTitle) {
        titleCounts.set(trimmedTitle, (titleCounts.get(trimmedTitle) || 0) + 1);
      }
    });

    const itemErrors =
      formData.items.map((item) => {
        const trimmedTitle = item.title.trim();
        const hasTitle = !!trimmedTitle;
        const hasQuantity =
          item.quantity !== "" &&
          item.quantity !== null &&
          item.quantity !== undefined;

        // If both are empty, it is considered a valid empty row
        if (!hasTitle && !hasQuantity) {
          return { title: false, quantity: false };
        }

        // Title duplicate check
        const isDuplicateTitle =
          hasTitle && (titleCounts.get(trimmedTitle.toLowerCase()) || 0) > 1;
        const isTitleTooLong =
          hasTitle && trimmedTitle.length > MAX_ITEM_TITLE_LENGTH;

        // If either is filled, both become required, quantity must be >= 1, and title must be unique & <= 20 chars
        return {
          title: !hasTitle || isDuplicateTitle || isTitleTooLong,
          quantity: !hasQuantity || Number(item.quantity) < 1,
        };
      }) ?? [];

    const activeImageCount =
      existingImages.filter((img) => !deletedImageIds.includes(img.id)).length +
      selectedImages.length;

    const errors = {
      images: activeImageCount === 0,
      categoryId: !formData.categoryId,
      conditionLevel:
        formData.conditionLevel === null ||
        formData.conditionLevel === undefined,
      title: !formData.title.trim(),
      location: !formData.location.trim(),
      content:
        !formData.content.trim() ||
        formData.content.trim().length < MIN_CONTENT_LENGTH ||
        formData.content.length > MAX_CONTENT_LENGTH,
      expires_at: !formData.expires_at,
      items: itemErrors,
    };

    setFormErrors(errors);

    const hasMissingFields =
      errors.images ||
      errors.categoryId ||
      errors.conditionLevel ||
      errors.title ||
      errors.location ||
      errors.content ||
      errors.expires_at ||
      itemErrors.some(
        (item, index) =>
          (!formData.items[index].title.trim() &&
            formData.items[index].quantity !== "" &&
            formData.items[index].quantity !== null &&
            formData.items[index].quantity !== undefined) ||
          (formData.items[index].title.trim() &&
            (formData.items[index].quantity === "" ||
              formData.items[index].quantity === null ||
              formData.items[index].quantity === undefined ||
              Number(formData.items[index].quantity) < 1 ||
              formData.items[index].title.trim().length >
                MAX_ITEM_TITLE_LENGTH)),
      );

    const hasDuplicateItemTitles = itemErrors.some(
      (item, index) =>
        !!formData.items[index].title.trim() &&
        (titleCounts.get(formData.items[index].title.trim().toLowerCase()) ||
          0) > 1,
    );

    if (formData.items.length > MAX_ITEMS_COUNT) {
      return "too_many_items";
    }
    if (hasDuplicateItemTitles) {
      return "duplicate_items";
    }
    if (hasMissingFields) {
      return "missing_fields";
    }
    return "ok";
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const activeImageCount =
      existingImages.filter((img) => !deletedImageIds.includes(img.id)).length +
      selectedImages.length;

    if (activeImageCount + files.length > 5) {
      toast.error("Limit of 5 images exceeded");
      return;
    }

    const validFiles = files.filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB size limit`);
        return false;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not a valid image file`);
        return false;
      }
      return true;
    });

    setSelectedImages((prev) => {
      const next = [...prev, ...validFiles];
      if (next.length > 0 || existingImages.length > deletedImageIds.length) {
        setFormErrors((errors) => ({ ...errors, images: false }));
      }
      return next;
    });
  };

  const removeSelectedImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleExistingImageDeletion = (id: number) => {
    setDeletedImageIds((prev) => {
      const isDeleted = prev.includes(id);
      let updated: number[];
      if (isDeleted) {
        updated = prev.filter((item) => item !== id);
      } else {
        updated = [...prev, id];
      }

      // Re-validate image existence
      const activeImageCount =
        existingImages.filter((img) => !updated.includes(img.id)).length +
        selectedImages.length;
      setFormErrors((errors) => ({
        ...errors,
        images: activeImageCount === 0,
      }));

      return updated;
    });
  };

  // --- Tag chip handlers ---
  const commitTagInput = () => {
    const value = tagInput.trim().replace(/^#/, "");
    if (value && !tags.includes(value)) {
      setTags((prev) => [...prev, value]);
    }
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ignore Space/Enter while IME is composing (e.g. Zhuyin / Pinyin)
    if (e.nativeEvent.isComposing) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      commitTagInput();
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };
  // --- End tag chip handlers ---

  const handleSubmitClick = () => {
    // Commit any in-progress tag before submitting
    const pendingTag = tagInput.trim().replace(/^#/, "");
    const finalTags =
      pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    const validationResult = validateForm();
    if (validationResult === "too_many_items") {
      toast.error(`At most ${MAX_ITEMS_COUNT} items are allowed.`);
      return;
    } else if (validationResult === "duplicate_items") {
      toast.error("Item titles cannot be duplicated.");
      return;
    } else if (validationResult === "missing_fields") {
      toast.error("Required fields cannot be empty.");
      return;
    }

    const filteredItems = formData.items
      .filter(
        (item) =>
          item.title.trim() !== "" ||
          (item.quantity !== "" &&
            item.quantity !== null &&
            item.quantity !== undefined),
      )
      .map((item) => ({
        title: item.title.trim(),
        quantity: item.quantity === "" ? "" : Number(item.quantity),
      })) as ItemInput[];

    onSubmit({
      title: formData.title,
      content: formData.content,
      location: formData.location,
      tags: finalTags.join(", "),
      categoryId: formData.categoryId!,
      conditionLevel: formData.conditionLevel!,
      status: formData.status,
      expires_at: formData.expires_at,
      items: filteredItems,
      place_id: formData.place_id,
      location_name: formData.location_name,
      location_url: formData.location_url,
      province: formData.province,
      city: formData.city,
      route: formData.route,
      zip: formData.zip,
      lat: formData.lat,
      lng: formData.lng,
      newImages: selectedImages,
      deletedImageIds,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex justify-center overflow-y-auto bg-primary-5 font-ddin">
      <div className="min-h-screen w-full max-w-2xl rounded-lg bg-primary-5 md:max-w-5xl">
        <div className="px-7 py-6">
          <div className="relative flex items-center justify-center border-b pb-2">
            <h2 className="text-2xl font-bold capitalize text-gray-900">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="absolute -right-2 -top-1 text-gray-400 hover:text-gray-600"
            >
              <DeleteIcon />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
            {/* 圖片上傳區域 */}
            <div className="w-full md:w-1/2 md:shrink-0">
              <div className="">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="image-upload"
                  disabled={
                    existingImages.filter(
                      (img) => !deletedImageIds.includes(img.id),
                    ).length +
                      selectedImages.length >=
                    5
                  }
                />
              </div>

              {/* 圖片預覽區域 (既存圖片與新圖片) */}
              <div className="grid grid-cols-5 gap-2">
                {/* 既存圖片 */}
                {existingImages.map((img, index) => {
                  const isDeleted = deletedImageIds.includes(img.id);
                  return (
                    <div key={`existing-${img.id}`} className="group relative">
                      <div
                        className={`aspect-square overflow-hidden rounded-lg bg-gray-100 ${
                          isDeleted ? "border-2 border-red-500 opacity-30" : ""
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.image_url}
                          alt={`Existing ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {!isDeleted ? (
                        <button
                          type="button"
                          onClick={() => toggleExistingImageDeletion(img.id)}
                          className="absolute -right-1 -top-1 rounded-full bg-red-600 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleExistingImageDeletion(img.id)}
                          className="absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-green-600 p-0.5 text-[10px] text-white"
                          style={{ width: "16px", height: "16px" }}
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* 新選擇的圖片 */}
                {selectedImages.map((_, index) => (
                  <div key={`new-${index}`} className="group relative">
                    <div className="aspect-square overflow-hidden rounded-lg border-2 border-dashed border-primary bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrls[index]}
                        alt={`New preview ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSelectedImage(index)}
                      className="absolute -right-1 -top-1 rounded-full bg-red-600 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* 上傳按鈕 */}
              <div
                className={`flex min-h-[150px] items-center justify-center rounded-lg bg-primary-30 p-6 md:min-h-[250px] ${
                  formErrors.images ? "border border-red-500" : ""
                }`}
              >
                <label
                  htmlFor="image-upload"
                  className={`inline-flex cursor-pointer items-center px-4 py-2 transition-all duration-200 ease-in-out hover:scale-125 ${
                    existingImages.filter(
                      (img) => !deletedImageIds.includes(img.id),
                    ).length +
                      selectedImages.length >=
                    5
                      ? "pointer-events-none cursor-not-allowed opacity-50"
                      : ""
                  }`}
                >
                  <AddIcon className="text-white" />
                </label>
              </div>
            </div>

            {/* 表單欄位區域 */}
            <div className="w-full space-y-[10px] md:w-1/2">
              {/* Category */}
              <div>
                <Select
                  value={formData.categoryId?.toString()}
                  onValueChange={(value) => {
                    setFormErrors((prev) => ({
                      ...prev,
                      categoryId: false,
                    }));
                    setFormData({
                      ...formData,
                      categoryId: parseInt(value),
                    });
                  }}
                  required
                >
                  <SelectTrigger
                    className={`w-full bg-white ${invalidFieldBorderClass(
                      formErrors.categoryId,
                    )}`}
                  >
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>

                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Condition */}
              <div>
                <Select
                  value={
                    formData.conditionLevel !== null
                      ? String(formData.conditionLevel)
                      : undefined
                  }
                  onValueChange={(value) => {
                    setFormErrors((prev) =>
                      prev.conditionLevel
                        ? { ...prev, conditionLevel: false }
                        : prev,
                    );
                    setFormData((prev) => ({
                      ...prev,
                      conditionLevel: parseInt(value),
                    }));
                  }}
                  required
                >
                  <SelectTrigger
                    className={`w-full bg-white ${invalidFieldBorderClass(
                      formErrors.conditionLevel,
                    )}`}
                  >
                    <SelectValue placeholder="Condition">
                      {formData.conditionLevel !== null &&
                        conditions.find(
                          (c) => c.level === formData.conditionLevel,
                        )?.name}
                    </SelectValue>
                  </SelectTrigger>

                  <SelectContent>
                    {conditions.map((condition) => (
                      <SelectItem
                        key={condition.id}
                        value={String(condition.level)}
                      >
                        {condition.name} - {condition.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className={invalidInputOnlyClass(formErrors.title)}>
                <Input
                  type="text"
                  required
                  placeholder="Title"
                  value={formData.title}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormErrors((prev) =>
                      prev.title ? { ...prev, title: false } : prev,
                    );
                    setFormData((prev) => ({
                      ...prev,
                      title: value,
                    }));
                  }}
                />
              </div>

              {/* Hashtag – tag chips */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-[5px]">
                  <TagIcon className="h-[24px] w-[24px] shrink-0 text-primary" />
                  <input
                    type="text"
                    placeholder="Add tag, press Space"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={commitTagInput}
                    className="h-9 w-full rounded-[20px] border border-gray-300 bg-white px-3 py-1 text-[18px] placeholder:text-[18px] placeholder:font-medium placeholder:text-primary-75 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {tags.length > 0 && (
                  <div className="ml-8 flex flex-wrap gap-1.5 pt-0.5">
                    {tags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removeTag(i)}
                          className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/20 hover:text-primary"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Location */}
              <div className="flex items-center gap-[5px]">
                <LocationIcon className="h-[24px] w-[24px] text-primary" />
                <div
                  className={`flex-1 ${invalidInputOnlyClass(formErrors.location)}`}
                >
                  <Input
                    ref={locationInputRef}
                    type="text"
                    required
                    placeholder="Location (City)"
                    value={formData.location}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormErrors((prev) =>
                        prev.location ? { ...prev, location: false } : prev,
                      );
                      setFormData((prev) => ({
                        ...prev,
                        location: value,
                      }));
                    }}
                  />
                </div>
              </div>

              {/* Expiry Date & Public/Hidden Switch */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-[5px]">
                  <ClockIcon className="h-[24px] w-[24px] text-primary" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        data-empty={!formData.expires_at}
                        className={`w-[212px] justify-between bg-white text-left font-medium tracking-normal text-primary-75 ${invalidFieldBorderClass(
                          formErrors.expires_at,
                        )}`}
                      >
                        {formData.expires_at ? (
                          format(formData.expires_at, "PPP")
                        ) : (
                          <span className="text-[18px] font-medium tracking-normal text-primary-75">
                            Expiry date
                          </span>
                        )}
                        <CalendarIcon className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.expires_at}
                        onSelect={(date) => {
                          setFormErrors((prev) =>
                            prev.expires_at
                              ? { ...prev, expires_at: false }
                              : prev,
                          );
                          setFormData((prev) => ({
                            ...prev,
                            expires_at: date || undefined,
                          }));
                        }}
                        defaultMonth={formData.expires_at}
                        disabled={(date) => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return date < today;
                        }}
                        required
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Status Switch (Public / Hidden) */}
                <div className="flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-1.5 font-ddin">
                  <span
                    className={`text-[15px] font-medium transition-colors ${
                      formData.status === "active"
                        ? "font-bold text-megaweave-forest-dark"
                        : "text-gray-400"
                    }`}
                  >
                    {formData.status === "active" ? "Public" : "Hidden"}
                  </span>
                  <Switch
                    checked={formData.status === "active"}
                    onCheckedChange={(checked) => {
                      setFormData((prev) => ({
                        ...prev,
                        status: checked ? "active" : "inactive",
                      }));
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <textarea
                  required
                  rows={4}
                  maxLength={MAX_CONTENT_LENGTH}
                  placeholder="description..."
                  className={`w-full rounded-[20px] border px-3 py-2 placeholder:text-lg placeholder:font-semibold placeholder:text-primary-75 ${
                    formErrors.content ? "border-red-500" : "border-gray-300"
                  }`}
                  value={formData.content}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormErrors((prev) =>
                      prev.content ? { ...prev, content: false } : prev,
                    );
                    setFormData((prev) => ({
                      ...prev,
                      content: value,
                    }));
                  }}
                />
                <div
                  className={`mt-0.5 pr-2 text-right text-xs ${
                    formData.content.length >= MAX_CONTENT_LENGTH
                      ? "font-bold text-red-500"
                      : "text-gray-400"
                  }`}
                >
                  {formData.content.length} / {MAX_CONTENT_LENGTH}
                </div>
              </div>

              {/* Items */}
              {formData.items.map((item, i) => (
                <div className="flex w-full flex-row gap-2" key={i}>
                  <div
                    className={`!flex-[3] ${invalidInputOnlyClass(formErrors.items?.[i]?.title)}`}
                  >
                    <Input
                      type="text"
                      maxLength={MAX_ITEM_TITLE_LENGTH}
                      placeholder={`Item (Optional)`}
                      value={item.title}
                      forceShowClear={true}
                      onClear={() => {
                        const hasValue =
                          item.title && String(item.title).trim().length > 0;
                        if (hasValue) {
                          const items = [...formData.items];
                          items[i].title = "";
                          setFormData({
                            ...formData,
                            items,
                          });
                        } else {
                          const items = formData.items.filter(
                            (_, idx) => idx !== i,
                          );
                          setFormErrors((prev) => {
                            const nextItems = [...(prev.items ?? [])].filter(
                              (_, idx) => idx !== i,
                            );
                            return { ...prev, items: nextItems };
                          });
                          setFormData({
                            ...formData,
                            items,
                          });
                        }
                      }}
                      onChange={(e) => {
                        const items = [...formData.items];
                        items[i].title = e.target.value;
                        setFormErrors((prev) => {
                          const nextItems = [...(prev.items ?? [])];
                          nextItems[i] = {
                            ...nextItems[i],
                            title: false,
                          };
                          return { ...prev, items: nextItems };
                        });
                        setFormData({
                          ...formData,
                          items,
                        });
                      }}
                    />
                  </div>
                  <div
                    className={`!flex-[1] ${invalidInputOnlyClass(formErrors.items?.[i]?.quantity)}`}
                  >
                    <Input
                      type="number"
                      min={1}
                      className="!flex-[1] text-center text-[18px] placeholder:text-center placeholder:text-[14px]"
                      placeholder="Quantity"
                      value={item.quantity ?? ""}
                      onChange={(e) => {
                        const items = [...formData.items];
                        items[i].quantity = e.target.value
                          ? parseInt(e.target.value)
                          : "";
                        setFormErrors((prev) => {
                          const nextItems = [...(prev.items ?? [])];
                          nextItems[i] = {
                            ...nextItems[i],
                            quantity: false,
                          };
                          return { ...prev, items: nextItems };
                        });
                        setFormData({
                          ...formData,
                          items,
                        });
                      }}
                    />
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between space-x-3">
                <Button
                  type="button"
                  disabled={formData.items.length >= MAX_ITEMS_COUNT}
                  onClick={() => {
                    if (formData.items.length >= MAX_ITEMS_COUNT) {
                      toast.error(
                        `At most ${MAX_ITEMS_COUNT} items are allowed`,
                      );
                      return;
                    }
                    setFormData({
                      ...formData,
                      items: [...formData.items, { title: "", quantity: "" }],
                    });
                  }}
                  className="border border-primary-30 bg-white py-[8px] text-[18pt] leading-[18px] text-primary shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </Button>
                {formData.items.length > 0 && (
                  <span
                    className={`text-xs ${
                      formData.items.length >= MAX_ITEMS_COUNT
                        ? "font-bold text-red-500"
                        : "text-gray-400"
                    }`}
                  >
                    {formData.items.length} / {MAX_ITEMS_COUNT} items
                  </span>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={isSubmitting}
                  className="py-5 disabled:opacity-50"
                >
                  {isSubmitting ? "Processing..." : submitButtonText}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
