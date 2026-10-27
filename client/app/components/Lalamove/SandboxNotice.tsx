import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";

interface SandboxNoticeProps {
  showTestCard?: boolean;
  className?: string;
}

/**
 * 綠界與 Lalamove 目前皆串接測試環境，提醒使用者付款不會扣款、也不會真的派車。
 */
export default function SandboxNotice({
  showTestCard = false,
  className = "",
}: SandboxNoticeProps) {
  const t = useTranslations("SandboxNotice");

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800 ${className}`}
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div>
        <p className="font-semibold">{t("title")}</p>
        <p className="mt-0.5 leading-relaxed">{t("body")}</p>
        {showTestCard && (
          <p className="mt-1 leading-relaxed">
            {t("testCard", { card: "4311-9522-2222-2222", cvv: "222" })}
          </p>
        )}
      </div>
    </div>
  );
}
