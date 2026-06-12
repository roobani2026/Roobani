import React from "react";

/**
 * Shared layout for the boilerplate legal pages (Privacy, Terms, Cookies).
 * Keeps the visual language consistent with the rest of the site.
 */
export default function LegalLayout({ eyebrow, title, lastUpdated, children, testid }) {
  return (
    <div data-testid={testid}>
      <section className="pt-40 pb-10 md:pt-48 md:pb-14 relative overflow-hidden">
        <div className="rb-grain absolute inset-0" />
        <div className="relative max-w-[1100px] mx-auto px-6 md:px-12">
          <div className="rb-mono text-[11px] uppercase tracking-[0.22em] text-rb-text2">{eyebrow}</div>
          <h1 className="rb-display text-5xl md:text-7xl text-rb-navy leading-[0.95] mt-3">{title}</h1>
          {lastUpdated && (
            <div className="rb-mono text-[11px] uppercase tracking-[0.18em] text-rb-text2 mt-6">
              Last updated :: {lastUpdated}
            </div>
          )}
        </div>
      </section>
      <section className="pb-24">
        <article
          className="max-w-[1100px] mx-auto px-6 md:px-12 space-y-8 text-rb-text leading-relaxed [&_h2]:rb-display [&_h2]:text-2xl [&_h2]:md:text-3xl [&_h2]:text-rb-heading [&_h2]:mt-12 [&_h2]:mb-3 [&_h3]:rb-display [&_h3]:text-xl [&_h3]:text-rb-heading [&_h3]:mt-8 [&_h3]:mb-2 [&_p]:text-rb-text2 [&_li]:text-rb-text2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_a]:rb-underline [&_a]:text-rb-heading"
        >
          {children}
        </article>
      </section>
    </div>
  );
}
