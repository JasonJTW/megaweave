"use client";

import { useEffect } from "react";

type AdUnitProps = {
  slot: string;
  test?: boolean;
  style?: React.CSSProperties;
};

export default function AdSense({ slot, test = false, style }: AdUnitProps) {
  useEffect(() => {
    try {
      // @ts-expect-error adsense
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdsbyGoogle push error:", e);
    }
  }, [slot]);

  return (
    <ins
      className="adsbygoogle"
      style={style || { display: "block" }}
      data-ad-client="ca-pub-3940256099942544"
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
      {...(test ? { "data-adtest": "on" } : {})}
    />
  );
}
