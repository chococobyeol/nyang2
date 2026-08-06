import type { MetadataRoute } from "next";

const siteUrl = "https://nyang2.pages.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl },
    { url: `${siteUrl}/help` },
    { url: `${siteUrl}/privacy` },
  ];
}
