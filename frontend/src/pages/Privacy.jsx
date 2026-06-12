import React from "react";
import LegalLayout from "../components/LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      testid="privacy-page"
      eyebrow="Privacy"
      title="Privacy Policy"
      lastUpdated="February 2026"
    >
      <p>
        Roobani Capital ("Roobani", "we", "us") is committed to protecting the
        privacy of every visitor and investor. This Privacy Policy explains
        what personal information we collect, how we use it, and the choices
        you have regarding that information.
      </p>

      <h2>1. Information we collect</h2>
      <p>We collect information you provide directly to us, including:</p>
      <ul>
        <li>Identity data such as your name, date of birth, nationality and government-issued identifiers (for KYC/AML).</li>
        <li>Contact data such as email address, phone number and postal address.</li>
        <li>Financial data including transaction details, payment method information and source of funds.</li>
        <li>Account data including login credentials, security questions and authentication factors.</li>
        <li>Communications you send to us via the contact form, email or live chat.</li>
      </ul>
      <p>We also collect technical information automatically, such as device identifiers, IP address, browser type, pages visited and timestamps.</p>

      <h2>2. How we use information</h2>
      <ul>
        <li>To open and operate your investment account and process transactions.</li>
        <li>To comply with applicable Know-Your-Customer (KYC), Anti-Money-Laundering (AML) and tax reporting obligations.</li>
        <li>To provide customer support and respond to your inquiries.</li>
        <li>To improve, secure and personalize our platform.</li>
        <li>To send service updates, performance reports and (with consent) marketing communications.</li>
      </ul>

      <h2>3. Lawful bases for processing</h2>
      <p>We rely on the following lawful bases under applicable data-protection laws (including GDPR and the Kenya Data Protection Act, 2019):</p>
      <ul>
        <li>Performance of a contract with you.</li>
        <li>Compliance with our legal and regulatory obligations.</li>
        <li>Our legitimate interests in operating, securing and improving the service.</li>
        <li>Your consent, where required (which you may withdraw at any time).</li>
      </ul>

      <h2>4. Sharing of information</h2>
      <p>We share personal information only with:</p>
      <ul>
        <li>Regulated service providers (custody, brokerage, payments, KYC verification, cloud hosting) bound by confidentiality and data-processing agreements.</li>
        <li>Regulators, law enforcement and tax authorities where required by law.</li>
        <li>Professional advisors (auditors, lawyers) under duties of confidentiality.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>5. International transfers</h2>
      <p>
        Where personal data is transferred outside your country of residence, we
        rely on appropriate safeguards such as Standard Contractual Clauses,
        adequacy decisions, or your explicit consent.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain personal data for as long as necessary to provide the service
        and to comply with our legal, accounting and reporting obligations
        (typically 7 years after account closure).
      </p>

      <h2>7. Your rights</h2>
      <p>Subject to applicable law, you have the right to:</p>
      <ul>
        <li>Access, correct or delete your personal data.</li>
        <li>Object to or restrict certain processing.</li>
        <li>Receive your data in a portable format.</li>
        <li>Withdraw consent at any time without affecting prior processing.</li>
        <li>Lodge a complaint with the data protection authority in your jurisdiction.</li>
      </ul>
      <p>
        To exercise any of these rights, please contact us at{" "}
        <a href="mailto:privacy@roobani.com">privacy@roobani.com</a>.
      </p>

      <h2>8. Security</h2>
      <p>
        We implement industry-standard technical and organisational measures
        (encryption in transit and at rest, role-based access controls,
        continuous monitoring, periodic penetration testing) to protect your
        information. However, no system can guarantee absolute security.
      </p>

      <h2>9. Children</h2>
      <p>The Roobani platform is intended for users aged 18 and over. We do not knowingly collect personal data from children.</p>

      <h2>10. Updates to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes
        will be communicated via email or an in-product notice prior to the
        effective date.
      </p>

      <h2>11. Contact</h2>
      <p>
        Data Protection Officer — Roobani Capital, Nairobi, Kenya. Email:{" "}
        <a href="mailto:privacy@roobani.com">privacy@roobani.com</a>.
      </p>
    </LegalLayout>
  );
}
