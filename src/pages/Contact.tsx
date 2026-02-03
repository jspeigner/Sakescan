import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, MessageCircle, FileText } from "lucide-react";

export default function Contact() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-4">
              Contact & Support
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Have questions about Sake Scan? We're here to help. Reach out to our team and we'll get back to you as soon as possible.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Email */}
            <Card className="p-6 text-center">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Email Us</h3>
              <p className="text-sm text-muted-foreground mb-3">
                For general inquiries and support
              </p>
              <a href="mailto:support@sakescan.com" className="text-primary hover:underline text-sm">
                support@sakescan.com
              </a>
            </Card>

            {/* FAQ */}
            <Card className="p-6 text-center">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">FAQ</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Find answers to common questions
              </p>
              <a href="#faq" className="text-primary hover:underline text-sm">
                View FAQ
              </a>
            </Card>

            {/* Live Chat */}
            <Card className="p-6 text-center">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">In-App Support</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Get help directly in the app
              </p>
              <span className="text-sm text-muted-foreground">
                Settings → Help & Support
              </span>
            </Card>
          </div>

          {/* Contact Form */}
          <Card className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold mb-6">Send us a message</h2>
            <form className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="your@email.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" placeholder="How can we help?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Tell us more about your question or feedback..."
                  rows={5}
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">
                Send Message
              </Button>
            </form>
          </Card>

          {/* FAQ Section */}
          <div id="faq" className="mt-16">
            <h2 className="text-2xl font-serif font-bold mb-8 text-center">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {[
                {
                  q: "How does the sake scanning work?",
                  a: "Simply point your camera at any sake label and our AI-powered recognition system will identify the sake and provide you with detailed information including ratings, tasting notes, and food pairings."
                },
                {
                  q: "Is the app free to use?",
                  a: "Sake Scan offers a free tier with basic scanning features. Premium features like unlimited scans, detailed analytics, and personalized recommendations are available with a subscription."
                },
                {
                  q: "What if a sake isn't in your database?",
                  a: "If we don't recognize a sake, you can submit it for review. Our team will research and add it to our database, typically within 48 hours."
                },
                {
                  q: "Can I use Sake Scan offline?",
                  a: "Basic information for your saved sakes is available offline. However, scanning new labels and accessing community reviews requires an internet connection."
                },
                {
                  q: "How do I delete my account?",
                  a: "You can delete your account from the app by going to Settings → Account → Delete Account. This will permanently remove all your data."
                }
              ].map((faq, index) => (
                <Card key={index} className="p-5">
                  <h3 className="font-semibold mb-2">{faq.q}</h3>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
