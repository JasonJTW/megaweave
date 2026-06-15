import { Img, Section, Link } from "react-email";
const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL;
const BANNER_URL = `${CLOUDFRONT_URL}/email/EmailBanner.png`;

const EmailBanner = () => (
  <Section>
    <Link href="https://megaweaving.net/" style={{ display: "block" }}>
      <Img
        src={BANNER_URL}
        alt="MegaWeaving"
        width="600"
        style={{ display: "block", width: "100%" }}
      />
    </Link>
  </Section>
);

export default EmailBanner;
