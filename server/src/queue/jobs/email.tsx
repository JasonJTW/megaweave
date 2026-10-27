import { Job } from "bullmq";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { RowDataPacket } from "mysql2/promise";
import dbPool from "../../utils/db";
import EmailTemplate, { WeaveItem } from "../../emails/EmailTemplate";
import DeliveryNoticeEmail from "../../emails/DeliveryNoticeEmail";
import { getTranslator, resolveLocale } from "../../utils/i18n";
import {
  getDeliveryNoticeCopy,
  type DeliveryNoticeEvent,
} from "../../services/deliveryNoticeCopy";
import type { WeaveActionType, WeaveRole, WeaveStatus } from "../../utils/weaveService";
import type { Locale } from "../../validations";

/**
 * Job data carries the event, not rendered text: the job looks up the recipient
 * and renders the email in their account language (users.locale).
 */
export interface WeaveEmailJobData {
  template: "weave-status";
  recipientId: number;
  action: WeaveActionType;
  actorName: string;
  postTitle: string;
  weaveId: number;
  items: WeaveItem[];
  recipientRole: WeaveRole;
  ctaUrl: string;
}

export interface DeliveryNoticeEmailJobData {
  template: "delivery-notice";
  recipientId: number;
  event: DeliveryNoticeEvent;
  /** 退款原因（例如 LALAMOVE_EXPIRED），用於 REFUNDED 文案 */
  reason?: string;
  merchantTradeNo: string;
  amount: number;
  ctaUrl: string;
}

export type SendEmailJobData = WeaveEmailJobData | DeliveryNoticeEmailJobData;

interface Recipient {
  username: string;
  email: string;
  locale: Locale;
}

interface RenderedEmail {
  subject: string;
  react: ReactElement;
}

// Email 的狀態徽章：confirmed 是單方確認，Weave 仍在 approved
const WEAVE_EMAIL_STATUS: Record<WeaveActionType, WeaveStatus> = {
  requested: "requested",
  approved: "approved",
  declined: "declined",
  cancelled: "cancelled",
  withdrawn: "withdrawn",
  confirmed: "approved",
  completed: "completed",
};

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Configuration Error: Missing RESEND_API_KEY environment variable.");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

async function findRecipient(userId: number): Promise<Recipient | null> {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
       u.email,
       u.locale
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.id = ?`,
    [userId],
  );
  const row = rows[0];
  if (!row?.email) return null;
  return { username: row.username, email: row.email, locale: resolveLocale(row.locale) };
}

function renderEmail(data: SendEmailJobData, to: Recipient): RenderedEmail {
  if (data.template === "delivery-notice") {
    const copy = getDeliveryNoticeCopy(data.event, to.locale, {
      tradeNo: data.merchantTradeNo,
      amount: data.amount,
      reason: data.reason,
    });
    return {
      subject: copy.title,
      react: (
        <DeliveryNoticeEmail
          locale={to.locale}
          username={to.username}
          toEmail={to.email}
          title={copy.title}
          description={copy.content}
          merchantTradeNo={data.merchantTradeNo}
          amount={data.amount}
          ctaUrl={data.ctaUrl}
        />
      ),
    };
  }

  const t = getTranslator(to.locale, "WeaveNotice");
  const values = { actorName: data.actorName, postTitle: data.postTitle };
  const subject = t(`${data.action}.title`, values);
  return {
    subject,
    react: (
      <EmailTemplate
        locale={to.locale}
        username={to.username}
        toEmail={to.email}
        title={subject}
        description={t(`${data.action}.content`, values)}
        weaveId={data.weaveId}
        weaving_status={WEAVE_EMAIL_STATUS[data.action]}
        items={data.items}
        recipientRole={data.recipientRole}
        ctaUrl={data.ctaUrl}
      />
    ),
  };
}

export async function processSendEmail(
  job: Job<SendEmailJobData>,
): Promise<void> {
  const { template, recipientId } = job.data;

  // 部署前已入列的舊 job 帶的是已渲染的英文內容、沒有 recipientId，無法依語系重新產生
  if (!recipientId) {
    await job.log("Skipped legacy email job without recipientId");
    return;
  }

  const recipient = await findRecipient(recipientId);
  if (!recipient) {
    await job.log(`Skipped ${template} email: user ${recipientId} has no email address`);
    return;
  }

  const { subject, react } = renderEmail(job.data, recipient);
  await job.log(
    `Starting to send ${template} email (${recipient.locale}) to ${recipient.email}, subject: ${subject}`,
  );

  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: "JasonJTW <no-reply@notification.megaweaving.net>",
    to: recipient.email,
    subject,
    react,
  });

  if (error) {
    await job.log(
      `⚠️ Failed to send email to ${recipient.email}: ${error.message}`,
    );
    throw Error(`Failed to send email to ${recipient.email}: ${error.message}`);
  }

  await job.log(`✅ Email sent to ${recipient.email}(ID: ${data?.id})`);
}
