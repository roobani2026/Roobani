import React from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

/**
 * Per-page SEO + Open Graph + structured-data injector.
 *
 * Usage:
 *   <SEO
 *     title="Investment Plans"
 *     description="Curated multi-asset plans..."
 *     image="/brand/plan_foundation.webp"
 *     structuredData={{...JSON-LD object...}}
 *     keywords={["wealth management Kenya", "..."]}
 *     noindex={false}
 *   />
 *
 * The title automatically appends "· Roobani" so we keep a consistent
 * trailing brand mark across the search-result snippet. Description is
 * trimmed to ~160 chars to stay inside Google's snippet width.
 */
const SITE_URL = process.env.REACT_APP_PUBLIC_URL || "https://roobani.com";
const DEFAULT_IMAGE = "/brand/hero_visual.webp";

function clampDescription(d) {
  if (!d) return "";
  const s = d.replace(/\s+/g, " ").trim();
  if (s.length <= 165) return s;
  // Trim at the last word boundary inside the budget.
  const slice = s.slice(0, 162);
  return slice.slice(0, slice.lastIndexOf(" ")).trimEnd() + "…";
}

export default function SEO({
  title,
  description,
  image,
  imageAlt,
  structuredData,
  noindex = false,
  type = "website",
  keywords,
  canonical,
}) {
  const loc = useLocation();
  const fullTitle = title ? `${title} · Roobani` : "Roobani — Concierge wealth, audited returns.";
  const desc = clampDescription(description || "Roobani pairs you with a dedicated portfolio manager and curated multi-asset plans across equities, sukuk-style fixed income, real assets, and digital assets.");
  const img = (image || DEFAULT_IMAGE).startsWith("http") ? image : `${SITE_URL}${image || DEFAULT_IMAGE}`;
  const url = canonical || `${SITE_URL}${loc.pathname}${loc.search || ""}`;

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {keywords && keywords.length > 0 && <meta name="keywords" content={keywords.join(", ")} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      {imageAlt && <meta property="og:image:alt" content={imageAlt} />}
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Roobani" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
      {imageAlt && <meta name="twitter:image:alt" content={imageAlt} />}

      {/* Per-page structured data on top of the Organization JSON-LD we ship
          from index.html. We stringify here so JSX doesn't try to parse it. */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
}
