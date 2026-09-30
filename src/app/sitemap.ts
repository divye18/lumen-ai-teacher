import type { MetadataRoute } from "next";
import { publicConfig } from "@/config/public";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/privacy", "/terms"];

  return routes.map((route) => ({
    url: `${publicConfig.appUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.5,
  }));
}
