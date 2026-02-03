import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <article className="max-w-3xl mx-auto px-6 prose prose-gray dark:prose-invert">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 1, 2025</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing or using Sake Scan ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of the terms, you may not access the Service. These Terms apply to all visitors, users, and others who access or use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground">
              Sake Scan is a mobile application and website that allows users to scan sake bottle labels to retrieve information, ratings, reviews, and recommendations. The Service includes features for tracking personal sake collections, writing reviews, and discovering new sakes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. Age Requirement</h2>
            <p className="text-muted-foreground">
              You must be of legal drinking age in your jurisdiction (21 years old in the United States) to use this Service. By using Sake Scan, you represent and warrant that you meet this age requirement. We do not promote the consumption of alcohol, only the appreciation and understanding of sake culture.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. User Accounts</h2>
            <p className="text-muted-foreground mb-4">
              When you create an account with us, you must provide accurate, complete, and current information. You are responsible for:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Maintaining the confidentiality of your account and password</li>
              <li>Restricting access to your account</li>
              <li>All activities that occur under your account</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              You must notify us immediately of any unauthorized use of your account or any other security breach.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. User Content</h2>
            <p className="text-muted-foreground mb-4">
              Our Service allows you to post, link, store, share, and otherwise make available certain information, text, graphics, or other material ("User Content"). You are responsible for the User Content you post, and you agree not to post content that:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Is unlawful, harmful, threatening, abusive, harassing, defamatory, or invasive of privacy</li>
              <li>Infringes any patent, trademark, trade secret, copyright, or other intellectual property rights</li>
              <li>Contains false or misleading information about sakes or breweries</li>
              <li>Promotes excessive alcohol consumption or underage drinking</li>
              <li>Contains spam, advertising, or solicitations</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              By posting User Content, you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, and display such content in connection with the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Intellectual Property</h2>
            <p className="text-muted-foreground">
              The Service and its original content (excluding User Content), features, and functionality are and will remain the exclusive property of Sake Scan Inc. and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks may not be used in connection with any product or service without our prior written consent.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Sake Information Disclaimer</h2>
            <p className="text-muted-foreground">
              The information provided about sakes, breweries, tasting notes, and food pairings is for informational purposes only. While we strive for accuracy, we make no warranties about the completeness, reliability, or accuracy of this information. Any reliance you place on such information is strictly at your own risk.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Third-Party Links</h2>
            <p className="text-muted-foreground">
              Our Service may contain links to third-party websites or services that are not owned or controlled by Sake Scan. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party websites or services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">9. Termination</h2>
            <p className="text-muted-foreground">
              We may terminate or suspend your account immediately, without prior notice or liability, for any reason, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease. You may also delete your account at any time through the app settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">10. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              In no event shall Sake Scan Inc., nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">11. Disclaimer</h2>
            <p className="text-muted-foreground">
              Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">12. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be resolved in the courts of San Francisco County, California.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">13. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We reserve the right to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">14. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Email:</strong> legal@sakescan.com<br />
              <strong>Address:</strong> Sake Scan Inc., San Francisco, CA
            </p>
          </section>
        </article>
      </main>
      <Footer />
    </div>
  );
}
