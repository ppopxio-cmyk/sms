import LegalPage, { CONTACT_EMAIL, List, Section, Table } from '../components/layout/LegalPage';

const UPDATED = '19 October 2026';

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="How the School Management System collects, uses and protects personal information."
      updated={UPDATED}
    >
      <Section title="1. About this policy">
        <p>
          SMS Portal (&ldquo;the system&rdquo;) is the school management system used by the school that created your
          account. The school decides who receives an account and what each person may do. Accounts are created only by
          the school administrator; there is no public sign-up.
        </p>
        <p>
          This policy explains what information the system holds, why it is held, who can see it and how long it is
          kept. It applies to everyone who signs in, whatever their role.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <List>
          <li>
            <strong className="font-semibold text-slate-800">Account details.</strong> Your full name, Gmail address,
            role, account status and whether your email address has been confirmed.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Password.</strong> Stored only as a one-way Argon2 hash.
            The system never stores, displays or emails your plain password.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Sign-in and device information.</strong> IP address,
            browser and operating system, an approximate location derived from the IP address, a random device
            identifier, sign-in and last-seen times, and the number of failed sign-in attempts.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Notifications.</strong> In-app notices addressed to you. If
            you allow browser notifications, a Web Push subscription (a delivery endpoint and encryption keys) held by
            your browser&rsquo;s push service.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Administrative records.</strong> An append-only audit log
            of actions such as creating, disabling or deleting an account, changing a password, or terminating a
            session.
          </li>
          <li>
            <strong className="font-semibold text-slate-800">Emails we send.</strong> Confirmation links, password-reset
            codes, sign-in alerts and password-change notices. These are transactional messages only; the system sends
            no marketing.
          </li>
        </List>
        <p>
          The system does not use advertising identifiers, third-party analytics or tracking pixels, and does not
          collect payment details.
        </p>
      </Section>

      <Section title="3. Cookies and browser storage">
        <p>Only what is needed to keep you signed in and to recognise your devices is stored in your browser.</p>
        <Table
          head={['Name', 'Purpose', 'Lifetime']}
          rows={[
            ['rt', 'Encrypted session cookie that keeps you signed in. HttpOnly, Secure and SameSite=Strict, so page scripts cannot read it.', '7 days, renewed while in use; at most 30 days'],
            ['did', 'Random identifier for this browser, used to recognise a device you have already confirmed.', '400 days'],
            ['sms.device.fp', 'Device fingerprint kept in local storage, used only to count device slots and recognise repeat sign-ins. The server never treats it as proof of identity.', 'Until browser data is cleared'],
            ['sms.pending-verify, sms.setup-flow, sms.reset-flow, sms.resend.*', 'Temporary progress for a half-finished confirmation or password-reset journey, kept in session storage so a refresh does not lose it.', 'Until the tab closes or the journey ends'],
          ]}
        />
        <p>There are no advertising, analytics or cross-site tracking cookies.</p>
      </Section>

      <Section title="4. Why we use this information">
        <List>
          <li>To create and sign in to your account, and to confirm that the email address belongs to you.</li>
          <li>To give you the pages and actions that belong to your role.</li>
          <li>To send the notices you expect: sign-in alerts, confirmation and reset messages, and password-change notices.</li>
          <li>To protect accounts: rate limits, lockout after repeated wrong passwords, device limits and session termination.</li>
          <li>To keep an accurate record of administrative actions and to investigate problems or misuse.</li>
        </List>
      </Section>

      <Section title="5. Who can see it">
        <p>
          Your own details are visible to you. School administrators can see account details, sign-in sessions and the
          audit log for the school. Other users see only what a shared page shows them.
        </p>
        <p>The system relies on a small number of service providers, which process data only on the school&rsquo;s behalf:</p>
        <List>
          <li>Vercel — hosts the web interface.</li>
          <li>Render — runs the application server.</li>
          <li>MongoDB Atlas — stores the database.</li>
          <li>Google (Gmail) — delivers the emails described above.</li>
          <li>Your browser&rsquo;s push service (for example Google, Mozilla or Apple) — delivers browser notifications if you enable them.</li>
        </List>
        <p>
          Information is never sold, rented or used for advertising, and is not shared with anyone else except where the
          law requires it or where it is necessary to protect the system and its users.
        </p>
      </Section>

      <Section title="6. Google API services">
        <p>
          If the school enables email delivery through Google&rsquo;s Gmail API, a single school-owned Google account
          authorises the system to send messages on its own behalf. The authorisation is stored on the server, is never
          sent to a browser, and is used only to send the transactional emails described in this policy.
        </p>
        <p>
          The system does not read the mailbox, does not connect any other person&rsquo;s Google account and does not
          use Google data for advertising. Information received from Google APIs is used in accordance with the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:text-brand-800"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
      </Section>

      <Section title="7. How long we keep it">
        <List>
          <li>Notifications are removed automatically 30 days after they are created.</li>
          <li>Sign-in sessions end when they expire or when you or an administrator signs them out.</li>
          <li>Account details are kept while the account exists.</li>
          <li>
            When an administrator deletes an account, it is deactivated and hidden from normal use. Its identifier and
            historical records are retained so that the audit trail stays accurate; the email address stays reserved to
            that record.
          </li>
          <li>Audit records are kept as long as needed for security and accountability.</li>
        </List>
      </Section>

      <Section title="8. How we protect it">
        <List>
          <li>Traffic between your browser and the system is encrypted with HTTPS.</li>
          <li>Passwords are hashed with Argon2; session cookies are HttpOnly, Secure and SameSite=Strict.</li>
          <li>Short-lived access tokens are held in memory only and are never written to local storage.</li>
          <li>Repeated wrong passwords lock an account temporarily; sessions can be revoked at any time.</li>
          <li>Access follows the role on the account, and administrative actions are recorded.</li>
        </List>
        <p>No system can be completely secure. If you believe your account has been used by someone else, contact the school administrator immediately.</p>
      </Section>

      <Section title="9. Your choices and rights">
        <List>
          <li>Change your name or password, review your devices and delete your own account from your profile page.</li>
          <li>Turn browser notifications off at any time in your browser settings or from your profile page.</li>
          <li>Ask the school administrator to correct information, disable the account or discuss deletion.</li>
          <li>
            Ask questions about this policy at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:text-brand-800">
              {CONTACT_EMAIL}
            </a>
            .
          </li>
        </List>
      </Section>

      <Section title="10. Students and minors">
        <p>
          Accounts for students are created and authorised by the school. The school is responsible for obtaining any
          consent required for a student to use the system, and parents or guardians should raise questions with the
          school office.
        </p>
      </Section>

      <Section title="11. Changes to this policy">
        <p>
          If the way the system handles information changes, this page is updated and the date at the top changes.
          Continued use after an update means the current version applies.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions, requests or concerns about privacy can be sent to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:text-brand-800">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
