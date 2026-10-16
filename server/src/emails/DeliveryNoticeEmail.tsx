import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Row,
  Column,
  Heading,
  Text,
  Button,
  Hr,
} from "react-email";
import EmailBanner from "./EmailBanner";

export interface DeliveryNoticeEmailProps {
  locale: "zh-TW" | "en";
  username: string;
  toEmail: string;
  title: string;
  description: string;
  merchantTradeNo: string;
  amount: number;
  ctaUrl: string;
}

const COPY = {
  "zh-TW": {
    badge: "🚚 外送訂單通知",
    greeting: (name: string) => `${name} 您好，`,
    details: "訂單資訊",
    tradeNo: "訂單編號",
    amount: "金額",
    cta: "查看訂單狀態 →",
    footer: (email: string) => `如有任何問題，請聯繫客服。此通知寄送至 ${email}。`,
  },
  en: {
    badge: "🚚 Delivery update",
    greeting: (name: string) => `Hi ${name},`,
    details: "Order details",
    tradeNo: "Order no.",
    amount: "Amount",
    cta: "View order status →",
    footer: (email: string) =>
      `If you have any questions, please contact our support team. This notification was sent to ${email}.`,
  },
} as const;

const DeliveryNoticeEmail = ({
  locale,
  username,
  toEmail,
  title,
  description,
  merchantTradeNo,
  amount,
  ctaUrl,
}: DeliveryNoticeEmailProps) => {
  const copy = COPY[locale] ?? COPY["zh-TW"];

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{title}</Preview>

      <Body
        style={{
          backgroundColor: "#f4f4f5",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            maxWidth: 600,
            margin: "32px auto",
            backgroundColor: "#ffffff",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e4e4e7",
          }}
        >
          <Section style={{ padding: "32px 32px 24px" }}>
            <Text
              style={{
                display: "inline-block",
                backgroundColor: "#FFF7ED",
                color: "#C2410C",
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 999,
                margin: "0 0 20px",
              }}
            >
              {copy.badge}
            </Text>

            <Heading
              as="h1"
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: "#111827",
                margin: "0 0 12px",
                lineHeight: 1.3,
              }}
            >
              {title}
            </Heading>

            <Text
              style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.7, margin: "0 0 24px" }}
            >
              {copy.greeting(username)}
              <br />
              {description}
            </Text>

            <Section
              style={{
                backgroundColor: "#f9fafb",
                borderRadius: 8,
                padding: "16px 20px",
                marginBottom: 24,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: "0 0 12px",
                  fontWeight: 600,
                }}
              >
                {copy.details}
              </Text>
              <Row>
                <Column>
                  <Text style={{ fontSize: 14, color: "#6b7280", margin: "4px 0" }}>
                    {copy.tradeNo}
                  </Text>
                </Column>
                <Column align="right">
                  <Text
                    style={{ fontSize: 14, color: "#111827", margin: "4px 0", fontFamily: "monospace" }}
                  >
                    {merchantTradeNo}
                  </Text>
                </Column>
              </Row>
              <Row>
                <Column>
                  <Text style={{ fontSize: 14, color: "#6b7280", margin: "4px 0" }}>
                    {copy.amount}
                  </Text>
                </Column>
                <Column align="right">
                  <Text style={{ fontSize: 14, color: "#111827", margin: "4px 0" }}>
                    NT${amount}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Row>
              <Column align="center">
                <Button
                  href={ctaUrl}
                  style={{
                    backgroundColor: "#F97316",
                    color: "#ffffff",
                    padding: "14px 32px",
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  {copy.cta}
                </Button>
              </Column>
            </Row>
          </Section>

          <Hr style={{ borderColor: "#e5e7eb", margin: "0 32px" }} />

          <Section style={{ padding: "16px 32px 24px" }}>
            <Text style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>
              {copy.footer(toEmail)}
            </Text>
          </Section>

          <EmailBanner />
        </Container>
      </Body>
    </Html>
  );
};

export default DeliveryNoticeEmail;
