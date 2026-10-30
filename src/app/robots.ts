import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/lp/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/l/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
