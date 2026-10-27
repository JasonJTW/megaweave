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
import { getTranslator } from "../utils/i18n";
import type { Locale } from "../validations";

export interface DeliveryNoticeEmailProps {
  locale: Locale;
  username: string;
  toEmail: string;
  title: string;
  description: string;
  merchantTradeNo: string;
  amount: number;
  ctaUrl: string;
}

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
  const t = getTranslator(locale, "Email");

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
              {t("delivery.badge")}
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
              {t("greeting", { name: username })}
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
                {t("delivery.details")}
              </Text>
              <Row>
                <Column>
                  <Text style={{ fontSize: 14, color: "#6b7280", margin: "4px 0" }}>
                    {t("delivery.tradeNo")}
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
                    {t("delivery.amount")}
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
                  {t("delivery.cta")}
                </Button>
              </Column>
            </Row>
          </Section>

          <Hr style={{ borderColor: "#e5e7eb", margin: "0 32px" }} />

          <Section style={{ padding: "16px 32px 24px" }}>
            <Text style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>
              {t("footerNotice", { email: toEmail })}
            </Text>
          </Section>

          <EmailBanner />
        </Container>
      </Body>
    </Html>
  );
};

export default DeliveryNoticeEmail;
