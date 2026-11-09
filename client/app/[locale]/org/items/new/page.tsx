"use client";

//* 上架組織物品（PRD 0001 §5.1 E2-1、E3-1、E4-1、E6-2）
//* 物品屬於單位：窗口有多個單位時先選單位。類別帶預設單件重量（避免排放量係數表，ADR 0005），
//* 沒有預設值的類別（如塑膠製品）重量必填。只能是 Share，上架後在 Internal，不開放付款與配送。
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { useSWRConfig } from "swr";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { usePost } from "@/app/contexts/PostContext";
import { useConditionText } from "@/i18n/referenceNames";
import { uploadImagesToS3Staging } from "@/services/imageUploadService";
import { OrgSwitcher } from "@/components/org/OrgSwitcher";
import { NoUnitsNotice } from "@/components/org/NoUnitsNotice";
import {
  hostName,
  OrgAccess,
  requestJson,
  useOrgItemCategories,
  useSelectedOrg,
} from "@/lib/orgApi";
import { isOrgListingKey } from "@/lib/orgSwrKeys";

//* 與一般貼文相同（PostFormModal 的 MAX_IMAGES_COUNT、server 的 UPLOAD_IMAGE_LIMIT 預設值）
const MAX_PHOTOS = 5;

interface FormState {
  unitId: string;
  orgCategory: string;
  title: string;
  content: string;
  conditionLevel: string;
  quantity: string;
  unitWeightKg: string;
  assetNumber: string;
  estimatedValueTwd: string;
}

function toNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

//* 本機預覽：每個檔案一個 object URL，卸載或換檔時釋放
function PhotoThumbnail({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

function ItemForm({ org }: { org: OrgAccess }) {
  const t = useTranslations("Org.form");
  const apiErrorMessage = useApiErrorMessage();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const categories = useOrgItemCategories();
  const { conditions } = usePost();
  const conditionText = useConditionText();
  const units = org.manageableUnits;

  const [form, setForm] = useState<FormState>({
    unitId: units.length === 1 ? String(units[0].id) : "",
    orgCategory: "",
    title: "",
    content: "",
    conditionLevel: "",
    quantity: "1",
    unitWeightKg: "",
    assetNumber: "",
    estimatedValueTwd: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const category = categories.find((c) => c.id === form.orgCategory);
  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  function chooseCategory(id: string) {
    const next = categories.find((c) => c.id === id);
    //* 換類別時帶入該類別的預設重量；沒有預設值就清空，讓使用者自己填
    set({
      orgCategory: id,
      unitWeightKg:
        next?.defaultWeightKg != null ? String(next.defaultWeightKg) : "",
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.unitId || !form.orgCategory || !form.conditionLevel) {
      toast.error(t("missingSelection"));
      return;
    }
    setSubmitting(true);
    try {
      const stagingKeys = await uploadImagesToS3Staging(
        photos.map((file) => ({ blob: file, filename: file.name })),
      );
      await requestJson(`${hostName}/api/orgs/${org.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          unitId: Number(form.unitId),
          orgCategory: form.orgCategory,
          title: form.title,
          content: form.content,
          conditionLevel: Number(form.conditionLevel),
          quantity: toNumber(form.quantity),
          unitWeightKg: toNumber(form.unitWeightKg),
          assetNumber: form.assetNumber.trim() || null,
          estimatedValueTwd: toNumber(form.estimatedValueTwd) ?? null,
          stagingKeys,
        }),
      });
      //* 導回組織頁前讓清單重新抓，否則 dedupe 區間內會顯示沒有新物品的舊快取
      void mutate(isOrgListingKey(hostName, org.id));
      toast.success(t("created"));
      router.push(`/org?org=${org.id}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, t("createFailed")));
      setSubmitting(false);
    }
  }

  if (units.length === 0) {
    return <NoUnitsNotice org={org} notContactMessage={t("noUnits")} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="org-item-unit">{t("unit")}</Label>
            <Select
              value={form.unitId}
              onValueChange={(unitId) => set({ unitId })}
            >
              <SelectTrigger id="org-item-unit">
                <SelectValue placeholder={t("unitPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={String(unit.id)}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-item-category">{t("category")}</Label>
            <Select value={form.orgCategory} onValueChange={chooseCategory}>
              <SelectTrigger id="org-item-category">
                <SelectValue placeholder={t("categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category && (
              <p className="text-xs text-muted-foreground">
                {category.examples}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-item-title">{t("itemTitle")}</Label>
            <Input
              id="org-item-title"
              required
              maxLength={60}
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-item-content">{t("content")}</Label>
            <textarea
              id="org-item-content"
              maxLength={1000}
              rows={4}
              placeholder={t("contentPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.content}
              onChange={(e) => set({ content: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-item-condition">{t("condition")}</Label>
            <Select
              value={form.conditionLevel}
              onValueChange={(conditionLevel) => set({ conditionLevel })}
            >
              <SelectTrigger id="org-item-condition">
                <SelectValue placeholder={t("conditionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {conditions.map((c) => (
                  <SelectItem key={c.level} value={String(c.level)}>
                    {conditionText.name(c.level, c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-item-quantity">{t("quantity")}</Label>
              <Input
                id="org-item-quantity"
                type="number"
                inputMode="numeric"
                required
                min={1}
                step={1}
                value={form.quantity}
                onChange={(e) => set({ quantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-item-weight">{t("unitWeight")}</Label>
              <Input
                id="org-item-weight"
                type="number"
                inputMode="decimal"
                required
                min={0.001}
                step="any"
                value={form.unitWeightKg}
                onChange={(e) => set({ unitWeightKg: e.target.value })}
              />
              {category && (
                <p className="text-xs text-muted-foreground">
                  {category.defaultWeightSource ? (
                    <a
                      href={category.defaultWeightSource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {t("weightDefaultHint", {
                        publisher: category.defaultWeightSource.publisher,
                        year: category.defaultWeightSource.year,
                      })}
                    </a>
                  ) : (
                    t("weightRequiredHint")
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-item-asset">{t("assetNumber")}</Label>
              <Input
                id="org-item-asset"
                maxLength={100}
                value={form.assetNumber}
                onChange={(e) => set({ assetNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-item-value">{t("estimatedValue")}</Label>
              <Input
                id="org-item-value"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.estimatedValueTwd}
                onChange={(e) => set({ estimatedValueTwd: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">
              {t("photos", { max: MAX_PHOTOS })}
            </p>
            {/* 原生檔案欄位在每次選完後會清空（顯示「未選擇檔案」），改用按鈕顯示已選張數 */}
            <label
              htmlFor="org-item-photos"
              aria-disabled={photos.length >= MAX_PHOTOS}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary-30 px-4 py-2 text-sm font-medium has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              {t("choosePhotos", { count: photos.length, max: MAX_PHOTOS })}
            </label>
            <input
              id="org-item-photos"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={photos.length >= MAX_PHOTOS}
              onChange={(e) => {
                //* 每次選的照片累加上去；清空 input 讓同一張可以移除後再選
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (photos.length + files.length > MAX_PHOTOS) {
                  toast.error(t("tooManyPhotos", { max: MAX_PHOTOS }));
                }
                setPhotos((prev) => [...prev, ...files].slice(0, MAX_PHOTOS));
              }}
            />
            {photos.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((file, index) => (
                  <li
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="relative"
                  >
                    <PhotoThumbnail
                      file={file}
                      alt={t("photoAlt", { index: index + 1, name: file.name })}
                    />
                    <button
                      type="button"
                      aria-label={t("removePhoto", { index: index + 1 })}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      onClick={() =>
                        setPhotos((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NewOrgItemContent() {
  const t = useTranslations("Org");
  const { orgs, org, error, isLoading } = useSelectedOrg();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link
        href={org ? `/org?org=${org.id}` : "/org"}
        className="text-sm underline"
      >
        {t("backToOrg")}
      </Link>
      {error && <p className="text-sm text-destructive">{t("loadFailed")}</p>}
      {isLoading && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {!isLoading && !error && orgs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noOrgs")}</p>
      )}
      {org && (
        <>
          <OrgSwitcher orgs={orgs} org={org} basePath="/org/items/new" />
          <ItemForm key={org.id} org={org} />
        </>
      )}
    </div>
  );
}

export default function NewOrgItemPage() {
  return (
    <Suspense>
      <NewOrgItemContent />
    </Suspense>
  );
}
