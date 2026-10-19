import LegalPage, { CONTACT_EMAIL, List, Section } from '../components/layout/LegalPage';

const UPDATED = '19 October 2026';

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      subtitle="The rules for using the School Management System."
      updated={UPDATED}
    >
      <Section title="1. About these terms">
        <p>
          These terms apply to everyone who uses SMS Portal, the school management system provided by the school that
          created your account. By signing in, you agree to them. If you do not agree, do not use the system and tell
          the school administrator.
        </p>
      </Section>

      <Section title="2. Accounts">
        <List>
          <li>Accounts are created only by a school administrator. There is no public sign-up.</li>
          <li>You must be the person the account was created for, and the details on it must be accurate.</li>
          <li>One account belongs to one person and must not be shared.</li>
          <li>You are responsible for keeping your password secret and for signing out on shared devices.</li>
          <li>Tell the school administrator immediately if you think someone else knows your password or has used your account.</li>
        </List>
      </Section>

      <Section title="3. Acceptable use">
        <p>You must not:</p>
        <List>
          <li>try to sign in as anyone else, or access a page or record you have not been given;</li>
          <li>copy, scrape, sell or publish other people&rsquo;s information from the system;</li>
          <li>interfere with the system, its security features or its availability;</li>
          <li>upload or send malicious code, or use the system to harass or impersonate anyone;</li>
          <li>use the system for anything unlawful.</li>
        </List>
      </Section>

      <Section title="4. What the school may do">
        <List>
          <li>Create, disable, re-enable or delete accounts, and change the role attached to an account.</li>
          <li>End any signed-in session, for example after a lost device or a suspected compromise.</li>
          <li>Suspend access while an investigation is carried out.</li>
        </List>
        <p>Repeated or serious misuse may lead to an account being disabled or deleted, in line with the school&rsquo;s own rules.</p>
      </Section>

      <Section title="5. Content and ownership">
        <p>
          The system, its design and its software belong to the school and its suppliers. Records you enter remain the
          school&rsquo;s records. You may use them only for the school work your role allows.
        </p>
      </Section>

      <Section title="6. Availability">
        <p>
          The system is provided as it is. It may be unavailable during maintenance, updates, network failures or
          circumstances outside the school&rsquo;s control. Features may change or be withdrawn. Do not rely on the
          system as the only copy of information that matters; keep your own records where the school requires it.
        </p>
      </Section>

      <Section title="7. Privacy">
        <p>
          Personal information is handled as described in the Privacy Policy, which forms part of these terms.
        </p>
      </Section>

      <Section title="8. Limits of responsibility">
        <p>
          To the extent the law allows, the school is not responsible for loss caused by misuse of an account, by
          sharing a password, by interruptions to the service, or by relying on the system instead of official records.
          Nothing in these terms removes rights that cannot be removed by law.
        </p>
      </Section>

      <Section title="9. Ending use">
        <p>
          You may ask an administrator to close your account, or delete your own account from your profile page.
          Records that must be kept for the school&rsquo;s audit and history may remain after an account is closed, as
          described in the Privacy Policy.
        </p>
      </Section>

      <Section title="10. Changes to these terms">
        <p>
          These terms may be updated as the system changes. The date at the top shows the current version. Continuing to
          use the system after an update means the new version applies.
        </p>
      </Section>

      <Section title="11. Governing law">
        <p>These terms are governed by the laws of the Federal Democratic Republic of Ethiopia.</p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these terms can be sent to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:text-brand-800">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
