import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <article className="max-w-3xl mx-auto px-6 prose prose-gray dark:prose-invert">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 1, 2025</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground mb-4">
              Sake Scan ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Service").
            </p>
            <p className="text-muted-foreground">
              Please read this Privacy Policy carefully. By using the Service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>

            <h3 className="text-lg font-medium mt-6 mb-3">Personal Information</h3>
            <p className="text-muted-foreground mb-4">
              When you create an account, we collect:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
              <li>Email address</li>
              <li>Name (optional)</li>
              <li>Profile photo (optional)</li>
              <li>Password (stored securely using industry-standard encryption)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Usage Information</h3>
            <p className="text-muted-foreground mb-4">
              We automatically collect certain information when you use the Service:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
              <li>Device information (model, operating system, unique identifiers)</li>
              <li>Log data (access times, pages viewed, app crashes)</li>
              <li>Sake scanning history and ratings</li>
              <li>Reviews and comments you post</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">Camera and Photos</h3>
            <p className="text-muted-foreground">
              Our app requires camera access to scan sake labels. Photos are processed to identify sake bottles and are not stored on our servers unless you explicitly save them to your profile.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="text-muted-foreground mb-4">We use your information to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Provide and maintain the Service</li>
              <li>Identify sake bottles through image recognition</li>
              <li>Personalize your experience and recommendations</li>
              <li>Process and display your reviews and ratings</li>
              <li>Send you updates and notifications (with your consent)</li>
              <li>Improve our Service and develop new features</li>
              <li>Detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Sharing Your Information</h2>
            <p className="text-muted-foreground mb-4">
              We do not sell your personal information. We may share your information with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Service providers:</strong> Third parties that help us operate the Service (hosting, analytics, customer support)</li>
              <li><strong>Other users:</strong> Your public profile, reviews, and ratings are visible to other users</li>
              <li><strong>Legal requirements:</strong> When required by law or to protect our rights</li>
              <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Data Security</h2>
            <p className="text-muted-foreground">
              We implement appropriate technical and organizational measures to protect your personal information. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Your Rights</h2>
            <p className="text-muted-foreground mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Access, correct, or delete your personal information</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
              <li>Request restriction of processing</li>
              <li>Lodge a complaint with a supervisory authority</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your personal information for as long as your account is active or as needed to provide you services. You can delete your account at any time through the app settings, which will remove your personal data within 30 days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Children's Privacy</h2>
            <p className="text-muted-foreground">
              The Service is not intended for users under the age of 21 (or the legal drinking age in your jurisdiction). We do not knowingly collect information from children.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">9. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">10. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Email:</strong> privacy@sakescan.com<br />
              <strong>Address:</strong> Sake Scan Inc., San Francisco, CA
            </p>
          </section>
        </article>
      </main>
      <Footer />
    </div>
  );
}
