import type { MetadataRoute } from "next";
import { publicConfig } from "@/config/public";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/studio", "/learn", "/login", "/signup", "/api"],
    },
    sitemap: `${publicConfig.appUrl}/sitemap.xml`,
  };
}
