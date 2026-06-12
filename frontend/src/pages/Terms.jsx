import React from "react";
import LegalLayout from "../components/LegalLayout";

export default function Terms() {
  return (
    <LegalLayout
      testid="terms-page"
      eyebrow="Terms"
      title="Terms of Service"
      lastUpdated="February 2026"
    >
      <p>
        These Terms of Service ("Terms") govern your access to and use of the
        Roobani Capital investment platform ("Service"). By creating an
        account or using the Service you agree to be bound by these Terms.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 18 years old and legally capable of entering into
        binding contracts in your jurisdiction to use the Service. We may
        refuse, restrict or terminate accounts that do not meet our
        eligibility criteria.
      </p>

      <h2>2. Account registration</h2>
      <ul>
        <li>You agree to provide accurate, current and complete information and to keep it updated.</li>
        <li>You are responsible for safeguarding your credentials and for all activity on your account.</li>
        <li>We may require KYC verification before permitting deposits, investments or withdrawals.</li>
      </ul>

      <h2>3. Investment services</h2>
      <p>
        Roobani offers curated, professionally managed investment plans across
        multiple asset classes. All investments carry risk, including the risk
        of partial or total loss of capital. Past performance is not indicative
        of future results. Targeted returns are estimates, not guarantees.
      </p>

      <h2>4. Fees</h2>
      <ul>
        <li>Management fees are charged annually as a percentage of assets under management.</li>
        <li>Performance fees, where applicable, are charged on the gains net of any high-water mark.</li>
        <li>Third-party charges (payment processing, custody, network fees) may apply and are disclosed at checkout.</li>
      </ul>

      <h2>5. Deposits and withdrawals</h2>
      <p>
        Deposits are accepted via the payment methods displayed at checkout.
        Withdrawals are processed to the originating funding source where
        practicable and may be subject to security review, KYC re-verification
        or regulatory holds.
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful, fraudulent, or harmful purpose.</li>
        <li>Attempt to gain unauthorised access to the Service or interfere with its operation.</li>
        <li>Use the Service to launder funds, evade sanctions or finance terrorism.</li>
        <li>Reverse-engineer, scrape or copy any part of the Service without authorisation.</li>
      </ul>

      <h2>7. Intellectual property</h2>
      <p>
        All content on the Service — including text, graphics, logos, software
        and data — is the property of Roobani or its licensors and is protected
        by intellectual-property laws.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Service is provided on an "as is" and "as available" basis. To the
        maximum extent permitted by law we disclaim all warranties, express or
        implied, including merchantability, fitness for a particular purpose
        and non-infringement.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Roobani's aggregate liability
        for any claim arising out of or relating to the Service shall not
        exceed the fees paid by you to Roobani in the twelve (12) months
        preceding the event giving rise to the claim.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may close your account at any time, subject to the settlement of
        any outstanding holdings. We may suspend or terminate your access if
        you breach these Terms or as required by law.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Republic of Kenya. Any
        dispute will be resolved exclusively in the courts of Nairobi, unless
        mandatory consumer-protection laws of your country of residence
        provide otherwise.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may revise these Terms from time to time. Material changes will be
        notified by email or in-product notice at least 14 days before they
        take effect.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href="mailto:legal@roobani.com">legal@roobani.com</a>.
      </p>
    </LegalLayout>
  );
}
