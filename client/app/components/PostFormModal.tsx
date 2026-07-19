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
import { usePost } from "../contexts/PostContext";
import { CreatePostFormData, ItemInput } from "../types/schema";

import AddIcon from "./icons/AddIcon";
import DeleteIcon from "./icons/DeleteIcon";
import TagIcon from "./icons/TagIcon";
import LocationIcon from "./icons/LocationIcon";
import ClockIcon from "./icons/ClockIcon";

export interface PostFormSubmitData {
  title: string;
  content: string;
  location: string;
  tags: string;
  categoryId: number;
  conditionLevel: number;
  expires_at?: Date;
  items: ItemInput[];
  place_id?: string;
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
    tags: "",
    categoryId: null as number | null,
    conditionLevel: null as number | null,
    expires_at: undefined as Date | undefined,
    items: [{ title: "", quantity: "" }] as {
      title: string;
      quantity: number | "";
    }[],
    place_id: undefined as string | undefined,
    province: undefined as string | undefined,
    city: undefined as string | undefined,
    route: undefined as string | undefined,
    zip: undefined as string | undefined,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
  });

  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);

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
        tags: initialData?.tags || "",
        categoryId: initialData?.categoryId || null,
        conditionLevel: initialData?.conditionLevel || null,
        expires_at: initialData?.expires_at || undefined,
        items:
          initialData?.items && initialData.items.length > 0
            ? initialData.items.map((it) => ({
                title: it.title,
                quantity: it.quantity,
              }))
            : [{ title: "", quantity: "" }],
        place_id: initialData?.place_id || undefined,
        province: initialData?.province || undefined,
        city: initialData?.city || undefined,
        route: initialData?.route || undefined,
        zip: initialData?.zip || undefined,
        lat: initialData?.lat || undefined,
        lng: initialData?.lng || undefined,
      });
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
            types: ["geocode"],
            componentRestrictions: { country: "tw" },
            fields: [
              "address_components",
              "formatted_address",
              "geometry",
              "place_id",
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
              location: place.formatted_address || place.name || "",
              place_id: place.place_id,
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
    const itemErrors =
      formData.items.map((item) => {
        const hasTitle = !!item.title.trim();
        const hasQuantity =
          item.quantity !== "" &&
          item.quantity !== null &&
          item.quantity !== undefined;

        // If both are empty, it is considered a valid empty row (skip validation)
        if (!hasTitle && !hasQuantity) {
          return { title: false, quantity: false };
        }

        // If either is filled, both become required and quantity must be >= 1
        return {
          title: !hasTitle,
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
      content: !formData.content.trim(),
      expires_at: !formData.expires_at,
      items: itemErrors,
    };

    setFormErrors(errors);

    return (
      !errors.images &&
      !errors.categoryId &&
      !errors.conditionLevel &&
      !errors.title &&
      !errors.location &&
      !errors.content &&
      !errors.expires_at &&
      !itemErrors.some((item) => item.title || item.quantity)
    );
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const activeImageCount =
      existingImages.filter((img) => !deletedImageIds.includes(img.id)).length +
      selectedImages.length;

    if (activeImageCount + files.length > 5) {
      alert("Limit of 5 images exceeded");
      return;
    }

    const validFiles = files.filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} exceeds 10MB size limit`);
        return false;
      }
      if (!file.type.startsWith("image/")) {
        alert(`${file.name} is not a valid image file`);
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

  const handleSubmitClick = () => {
    if (!validateForm()) {
      alert("Required fields cannot be empty.");
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
      tags: formData.tags,
      categoryId: formData.categoryId!,
      conditionLevel: formData.conditionLevel!,
      expires_at: formData.expires_at,
      items: filteredItems,
      place_id: formData.place_id,
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
        <div className="p-6">
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
                {selectedImages.map((image, index) => (
                  <div key={`new-${index}`} className="group relative">
                    <div className="aspect-square overflow-hidden rounded-lg border-2 border-dashed border-primary bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(image)}
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
                    setFormErrors((prev) => ({
                      ...prev,
                      conditionLevel: false,
                    }));
                    setFormData({
                      ...formData,
                      conditionLevel: parseInt(value),
                    });
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
                    setFormErrors((prev) => ({
                      ...prev,
                      title: false,
                    }));
                    setFormData({
                      ...formData,
                      title: e.target.value,
                    });
                  }}
                />
              </div>

              {/* Hashtag */}
              <div className="flex items-center gap-[5px]">
                <TagIcon className="h-[24px] w-[24px] text-primary" />
                <Input
                  type="text"
                  placeholder="Hashtag separate with commas"
                  value={formData.tags}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tags: e.target.value,
                    })
                  }
                />
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
                      setFormErrors((prev) => ({
                        ...prev,
                        location: false,
                      }));
                      setFormData({
                        ...formData,
                        location: e.target.value,
                      });
                    }}
                  />
                </div>
              </div>

              {/* Expiry Date */}
              <div className="flex items-center gap-[5px]">
                <ClockIcon className="h-[24px] w-[24px] text-primary" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      data-empty={!formData.expires_at}
                      className={`w-[212px] justify-between bg-white text-left font-normal ${invalidFieldBorderClass(
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
                        setFormErrors((prev) => ({
                          ...prev,
                          expires_at: false,
                        }));
                        setFormData({
                          ...formData,
                          expires_at: date || undefined,
                        });
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

              {/* Description */}
              <div>
                <textarea
                  required
                  rows={4}
                  placeholder="description..."
                  className={`w-full rounded-[20px] border px-3 py-2 placeholder:text-lg placeholder:font-semibold placeholder:text-primary-75 ${
                    formErrors.content ? "border-red-500" : "border-gray-300"
                  }`}
                  value={formData.content}
                  onChange={(e) => {
                    setFormErrors((prev) => ({
                      ...prev,
                      content: false,
                    }));
                    setFormData({
                      ...formData,
                      content: e.target.value,
                    });
                  }}
                />
              </div>

              {/* Items */}
              {formData.items.map((item, i) => (
                <div className="flex w-full flex-row gap-2" key={i}>
                  <div
                    className={`!flex-[3] ${invalidInputOnlyClass(formErrors.items?.[i]?.title)}`}
                  >
                    <Input
                      type="text"
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

              <div className="flex space-x-3">
                <Button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      items: [...formData.items, { title: "", quantity: "" }],
                    });
                  }}
                  className="border border-primary-30 bg-white py-[8px] text-[18pt] leading-[18px] text-primary shadow-none"
                >
                  +
                </Button>
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
