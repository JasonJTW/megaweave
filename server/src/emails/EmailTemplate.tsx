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
import { WeaveStatus } from "../utils/weaveService";

export interface EmailTemplateProps {
  username: string;
  title: string;
  description: string;
  weaveId: string;
  weaving_status: WeaveStatus;
  itemOffered: string;
  itemReceived: string;
  ctaUrl: string;
  toEmail: string;
}

const EmailTemplate = ({
  username,
  title,
  description,
  weaveId,
  weaving_status,
  itemOffered,
  itemReceived,
  ctaUrl,
  toEmail,
}: EmailTemplateProps) => {
  return (
    <Html lang="en">
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
          {/* Body */}
          <Section style={{ padding: "32px 32px 24px" }}>
            {/* Badge */}
            <Text
              style={{
                display: "inline-block",
                backgroundColor: "#EEF2FF",
                color: "#4338CA",
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 999,
                margin: "0 0 20px",
              }}
            >
              🔔 New notification
            </Text>

            {/* Title */}
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

            {/* Description */}
            <Text
              style={{
                fontSize: 15,
                color: "#6b7280",
                lineHeight: 1.7,
                margin: "0 0 24px",
              }}
            >
              Hi {username}, {description}
            </Text>

            {/* Transaction detail card */}
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
                Transaction details
              </Text>

              {/* Order ID */}
              <Row
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: 6,
                  marginBottom: 6,
                }}
              >
                <Column>
                  <Text style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                    Order ID
                  </Text>
                </Column>
                <Column align="right">
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {weaveId}
                  </Text>
                </Column>
              </Row>

              {/* Item offered */}
              <Row
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: 6,
                  marginBottom: 6,
                }}
              >
                <Column>
                  <Text style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                    Item offered
                  </Text>
                </Column>
                <Column align="right">
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {itemOffered}
                  </Text>
                </Column>
              </Row>

              {/* Item received */}
              <Row
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: 6,
                  marginBottom: 6,
                }}
              >
                <Column>
                  <Text style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                    Item received
                  </Text>
                </Column>
                <Column align="right">
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {itemReceived}
                  </Text>
                </Column>
              </Row>

              {/* Status */}
              <Row>
                <Column>
                  <Text style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                    Status
                  </Text>
                </Column>
                <Column align="right">
                  <Text
                    style={{
                      display: "inline-block",
                      backgroundColor: "#D1FAE5",
                      color: "#065F46",
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 999,
                      margin: 0,
                    }}
                  >
                    {weaving_status}
                  </Text>
                </Column>
              </Row>
            </Section>

            {/* CTA Button */}
            <Row>
              <Column align="center">
                <Button
                  href={ctaUrl}
                  style={{
                    backgroundColor: "#4F46E5",
                    color: "#ffffff",
                    padding: "14px 32px",
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  View transaction →
                </Button>
              </Column>
            </Row>
          </Section>

          <Hr style={{ borderColor: "#e5e7eb", margin: "0 32px" }} />

          {/* Security note */}
          <Section style={{ padding: "16px 32px 24px" }}>
            <Text
              style={{
                fontSize: 13,
                color: "#9ca3af",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              If you didn&apos;t initiate this transaction or have any
              questions, please contact our support team immediately. This
              notification was sent to{" "}
              <span style={{ color: "#6b7280" }}>{toEmail}</span>.
            </Text>
          </Section>

          {/* Footer */}
          <Section
            style={{
              backgroundColor: "#f9fafb",
              borderTop: "1px solid #e5e7eb",
              padding: "20px 32px",
            }}
          >
            <Row>
              <Column>
                <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                  © 2024 MegaWeaving · All rights reserved
                </Text>
              </Column>
              <Column align="right">
                <Text style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                  <a
                    href="#"
                    style={{
                      color: "#9ca3af",
                      textDecoration: "none",
                      marginRight: 16,
                    }}
                  >
                    Unsubscribe
                  </a>
                  <a
                    href="#"
                    style={{ color: "#9ca3af", textDecoration: "none" }}
                  >
                    Privacy policy
                  </a>
                </Text>
              </Column>
            </Row>
          </Section>
          {/* Banner */}
          <EmailBanner />
        </Container>
      </Body>
    </Html>
  );
};

export default EmailTemplate;
