import React from "react";
import LegalLayout from "../components/LegalLayout";

export default function Cookies() {
  return (
    <LegalLayout
      testid="cookies-page"
      eyebrow="Cookies"
      title="Cookie Policy"
      lastUpdated="February 2026"
    >
      <p>
        This Cookie Policy explains how Roobani Capital uses cookies and
        similar tracking technologies when you visit our website or use our
        platform. It should be read alongside our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>1. What is a cookie?</h2>
      <p>
        A cookie is a small text file stored on your device by your browser
        when you visit a website. Cookies allow the site to remember your
        actions and preferences (such as login, language and currency
        selection) for a period of time.
      </p>

      <h2>2. The categories of cookies we use</h2>
      <h3>Strictly necessary</h3>
      <p>
        These cookies are essential for the site to function — for example,
        to keep you logged in, remember your security preferences and protect
        against fraud. They cannot be disabled.
      </p>
      <h3>Functional</h3>
      <p>
        These cookies remember the choices you make (theme, currency,
        language) so that we can provide a more personalised experience.
      </p>
      <h3>Analytics</h3>
      <p>
        These cookies help us understand how visitors interact with the site
        so that we can measure and improve performance.
      </p>
      <h3>Marketing</h3>
      <p>
        These cookies may be set through our site by advertising partners to
        build a profile of your interests and show you relevant ads on other
        sites. They do not directly store personal information.
      </p>

      <h2>3. Managing your preferences</h2>
      <p>
        You can change your cookie preferences at any time by clicking the
        "Manage" link in the cookie banner shown on your first visit, or by
        using your browser's built-in controls to block or delete cookies.
        Please note that disabling certain categories may impact the
        functionality of the Service.
      </p>

      <h2>4. Third parties</h2>
      <p>
        Some cookies are placed by third parties acting on our behalf — for
        example, payment processors, analytics providers and customer-support
        tools. We require all third parties to handle data in line with
        applicable data protection laws.
      </p>

      <h2>5. Changes to this policy</h2>
      <p>
        We may update this Cookie Policy from time to time. The "last updated"
        date at the top of the page indicates when the policy was last revised.
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions about cookies? Email{" "}
        <a href="mailto:privacy@roobani.com">privacy@roobani.com</a>.
      </p>
    </LegalLayout>
  );
}
