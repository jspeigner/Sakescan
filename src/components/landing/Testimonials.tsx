import { Card } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Michael Chen",
    role: "Sake Enthusiast",
    avatar: "MC",
    rating: 5,
    text: "This app completely changed how I explore sake. I used to feel lost at izakayas, but now I can confidently order knowing exactly what I'm getting.",
  },
  {
    name: "Sarah Williams",
    role: "Restaurant Owner",
    avatar: "SW",
    rating: 5,
    text: "We use Sake Scan to train our staff. The detailed tasting notes and food pairing suggestions are invaluable for our service.",
  },
  {
    name: "Kenji Tanaka",
    role: "Certified Sake Sommelier",
    avatar: "KT",
    rating: 5,
    text: "Even as a professional, I find the database incredibly comprehensive. It's become an essential tool for my work and personal exploration.",
  },
  {
    name: "Emma Rodriguez",
    role: "Food Blogger",
    avatar: "ER",
    rating: 5,
    text: "The scanning feature is like magic! I love being able to instantly share detailed sake info with my followers.",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-serif font-bold mb-4">
            Loved by Sake Enthusiasts
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join thousands of users who have transformed their sake journey with Sake Scan.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {testimonials.map((testimonial) => (
            <Card
              key={testimonial.name}
              className="p-6 bg-card border-border/50 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-semibold text-sm">
                    {testimonial.avatar}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{testimonial.name}</h4>
                      <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                    </div>
                    <Quote className="w-8 h-8 text-primary/20 flex-shrink-0" />
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-0.5 mb-3">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                    ))}
                  </div>

                  {/* Quote */}
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    "{testimonial.text}"
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
