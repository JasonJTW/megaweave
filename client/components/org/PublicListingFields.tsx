"use client";

//* 公開確認框裡的公開資訊欄位（server: orgPublicListing）：地點、到期日、分類必填，標籤選填，
//* 與一般貼文表單（PostFormModal）同一套元件與文字。地點要從 Google 地點建議選，只打字不算
import { useEffect, useId, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { enUS, zhTW, type Locale as DateFnsLocale } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { useCategoryName } from "@/i18n/referenceNames";
import { usePost } from "@/app/contexts/PostContext";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  GOOGLE_AUTOCOMPLETE_FIELDS,
  parseGooglePlace,
} from "@/utils/locationUtils";
import {
  pickedLocationFrom,
  type PublicListingDraft,
  type PublicListingField,
} from "@/lib/publicListing";

const CALENDAR_LOCALES: Record<Locale, DateFnsLocale> = {
  "zh-TW": zhTW,
  en: enUS,
};

const invalidBorder = "border-red-500 ring-1 ring-red-500";

export function PublicListingFields({
  draft,
  onChange,
  invalid,
}: {
  draft: PublicListingDraft;
  onChange: (update: (prev: PublicListingDraft) => PublicListingDraft) => void;
  /** 送出時還缺的欄位；沒按過送出為空 */
  invalid: readonly PublicListingField[];
}) {
  const t = useTranslations("Org.manage");
  const tForm = useTranslations("PostForm");
  const formatter = useFormatter();
  const locale = useLocale() as Locale;
  const { categories } = usePost();
  const categoryName = useCategoryName();
  const ids = {
    category: useId(),
    location: useId(),
    expiry: useId(),
    tags: useId(),
  };
  const locationRef = useRef<HTMLInputElement | null>(null);
  const [tagInput, setTagInput] = useState("");

  //* Google 地點建議：script 由 layout 非同步載入，載好前每 300ms 再試
  useEffect(() => {
    let autocomplete: google.maps.places.Autocomplete | null = null;
    const attach = () => {
      if (!window.google?.maps?.places || !locationRef.current) return false;
      autocomplete = new google.maps.places.Autocomplete(locationRef.current, {
        componentRestrictions: { country: "tw" },
        fields: GOOGLE_AUTOCOMPLETE_FIELDS,
      });
      autocomplete.addListener("place_changed", () => {
        const parsed = parseGooglePlace(autocomplete?.getPlace());
        const location = pickedLocationFrom(parsed);
        onChange((prev) => ({
          ...prev,
          location,
          locationText: location ? location.full_address : prev.locationText,
        }));
      });
      return true;
    };
    let timer: number | undefined;
    if (!attach()) {
      timer = window.setInterval(() => {
        if (attach()) window.clearInterval(timer);
      }, 300);
    }
    return () => {
      if (timer) window.clearInterval(timer);
      if (autocomplete) google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [onChange]);

  const commitTag = () => {
    const value = tagInput.trim().replace(/^#/, "");
    if (value && !draft.tags.includes(value)) {
      onChange((prev) => ({ ...prev, tags: [...prev.tags, value] }));
    }
    setTagInput("");
  };

  const isInvalid = (field: PublicListingField) => invalid.includes(field);

  return (
    <div className="space-y-2">
      <p className="text-amber-900/80">{t("publicListingIntro")}</p>

      <div className="space-y-1">
        <label htmlFor={ids.location} className="text-xs font-medium">
          {t("publicListingLocation")}
        </label>
        <Input
          id={ids.location}
          ref={locationRef}
          type="text"
          autoComplete="off"
          placeholder={t("publicListingLocationPlaceholder")}
          value={draft.locationText}
          aria-invalid={isInvalid("location")}
          className={cn(
            "h-8 bg-white text-sm",
            isInvalid("location") && invalidBorder,
          )}
          onChange={(e) => {
            const text = e.target.value;
            //* 改了文字就不是剛才選的地點了，要重新從建議選
            onChange((prev) => ({
              ...prev,
              locationText: text,
              location: null,
            }));
          }}
          //* 建議清單用 Enter 選取，不要順便送出外層表單
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        {isInvalid("location") && (
          <p className="text-xs text-red-600">
            {t("publicListingLocationMissing")}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <span id={ids.expiry} className="block text-xs font-medium">
          {t("publicListingExpiry")}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-labelledby={ids.expiry}
              aria-invalid={isInvalid("expiresOn")}
              className={cn(
                "h-8 w-full justify-between bg-white text-sm font-normal",
                isInvalid("expiresOn") && invalidBorder,
              )}
            >
              {draft.expiresOn
                ? formatter.dateTime(draft.expiresOn, { dateStyle: "long" })
                : tForm("expiryDate")}
              <CalendarIcon className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={CALENDAR_LOCALES[locale]}
              labels={{
                labelPrevious: () => tForm("previousMonth"),
                labelNext: () => tForm("nextMonth"),
              }}
              selected={draft.expiresOn}
              defaultMonth={draft.expiresOn}
              onSelect={(date) =>
                onChange((prev) => ({ ...prev, expiresOn: date ?? undefined }))
              }
              disabled={(date) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return date < today;
              }}
              required
            />
          </PopoverContent>
        </Popover>
        {isInvalid("expiresOn") && (
          <p className="text-xs text-red-600">
            {t("publicListingExpiryMissing")}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <span id={ids.category} className="block text-xs font-medium">
          {t("publicListingCategory")}
        </span>
        <Select
          value={draft.categoryId?.toString()}
          onValueChange={(value) =>
            onChange((prev) => ({ ...prev, categoryId: Number(value) }))
          }
        >
          <SelectTrigger
            aria-labelledby={ids.category}
            aria-invalid={isInvalid("categoryId")}
            className={cn(
              "h-8 w-full bg-white text-sm",
              isInvalid("categoryId") && invalidBorder,
            )}
          >
            <SelectValue placeholder={tForm("categoryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id.toString()}>
                {categoryName(category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isInvalid("categoryId") && (
          <p className="text-xs text-red-600">
            {t("publicListingCategoryMissing")}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.tags} className="text-xs font-medium">
          {t("publicListingTags")}
        </label>
        <Input
          id={ids.tags}
          type="text"
          placeholder={tForm("tagPlaceholder")}
          value={tagInput}
          className="h-8 bg-white text-sm"
          onChange={(e) => setTagInput(e.target.value)}
          onBlur={commitTag}
          onKeyDown={(e) => {
            //* 注音、拼音選字中的空白與 Enter 不算
            if (e.nativeEvent.isComposing) return;
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              commitTag();
            } else if (
              e.key === "Backspace" &&
              tagInput === "" &&
              draft.tags.length > 0
            ) {
              onChange((prev) => ({ ...prev, tags: prev.tags.slice(0, -1) }));
            }
          }}
        />
        {draft.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {draft.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                #{tag}
                <button
                  type="button"
                  aria-label={tForm("removeTag", { tag })}
                  className="rounded-full text-primary/60 hover:text-primary"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      tags: prev.tags.filter((x) => x !== tag),
                    }))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
