"use client";

import { useEffect } from "react";
// const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
// const testId = process.env.NEXT_PUBLIC_ADSENSE_TEST_ID;

type AdUnitProps = {
  style?: React.CSSProperties;
};
declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdSense({ style }: AdUnitProps) {
  useEffect(() => {
    try {
      // 這行很重要：告訴 adsbygoogle 去填充廣告
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("Adsense error:", e);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={style || { display: "block", minHeight: "250px" }}
      data-ad-client="ca-pub-3940256099942544"
      data-ad-slot="6300978111"
      data-ad-format="auto"
      data-full-width-responsive="true"
      data-adtest="on"
    />
  );
}
