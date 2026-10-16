import { Job } from "bullmq";
import EmailTemplate, { EmailTemplateProps } from "../../emails/EmailTemplate";
import DeliveryNoticeEmail, {
  DeliveryNoticeEmailProps,
} from "../../emails/DeliveryNoticeEmail";

export type DeliveryNoticeEmailJobData = DeliveryNoticeEmailProps & {
  template: "delivery-notice";
};

/** 未帶 template 的舊 job 視為 weave 通知信 */
export type SendEmailJobData = EmailTemplateProps | DeliveryNoticeEmailJobData;

function isDeliveryNotice(data: SendEmailJobData): data is DeliveryNoticeEmailJobData {
  return "template" in data && data.template === "delivery-notice";
}
import { Resend } from "resend";

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

export async function processSendEmail(
  job: Job<SendEmailJobData>,
): Promise<void> {
  const props = job.data;

  await job.log(
    `Starting to send email to ${props.toEmail}, title: ${props.title}`,
  );

  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: "JasonJTW <no-reply@notification.megaweaving.net>",
    to: props.toEmail,
    subject: props.title,
    react: isDeliveryNotice(props) ? (
      <DeliveryNoticeEmail {...props} />
    ) : (
      <EmailTemplate {...props} />
    ),
  });

  if (error) {
    await job.log(
      `⚠️ Failed to send email to ${props.toEmail}: ${error.message}`,
    );
    throw Error(`Failed to send email to ${props.toEmail}: ${error.message}`);
  }

  await job.log(`✅ Email sent to ${props.toEmail}(ID: ${data?.id})`);
}
