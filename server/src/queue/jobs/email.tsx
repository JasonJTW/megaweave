import { Job } from "bullmq";
import EmailTemplate, { EmailTemplateProps } from "../../emails/EmailTemplate";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function processSendEmail(
  job: Job<EmailTemplateProps>,
): Promise<void> {
  const props = job.data;

  await job.log(`Starting to send email to ${props.toEmail}`);

  const { data, error } = await resend.emails.send({
    from: "JasonJTW <no-reply@notification.megaweaving.net>",
    to: props.toEmail,
    subject: props.title,
    react: <EmailTemplate {...props} />,
  });

  if (error) {
    await job.log(
      `⚠️ Failed to send email to ${props.toEmail}: ${error.message}`,
    );
    throw Error(`Failed to send email to ${props.toEmail}: ${error.message}`);
  }

  await job.log(`✅ Email sent to ${props.toEmail}(ID: ${data?.id})`);
}
