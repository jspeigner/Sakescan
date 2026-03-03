import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Smartphone, Star, Scan } from "lucide-react";

interface BlogCTAProps {
  variant?: "inline" | "banner";
}

export function BlogCTA({ variant = "inline" }: BlogCTAProps) {
  if (variant === "banner") {
    return (
      <Card className="bg-primary/5 border-primary/20 p-8 text-center my-10">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Scan className="w-7 h-7 text-primary" />
          </div>
        </div>
        <h3 className="text-xl font-serif font-bold mb-2">
          Start Your Sake Journey Today
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Download SakeScan and scan any sake label for instant ratings, tasting notes, food pairings, and personalized recommendations.
        </p>
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">4.9 rating · 25,000+ users</span>
        </div>
        <Button size="lg" className="gap-2">
          <Smartphone className="w-4 h-4" />
          Download Free on iOS
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 border my-6 not-prose">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Scan className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium mb-1">
          Want to identify any sake instantly?
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          Download SakeScan and scan your next sake menu for ratings, pairings, and tasting notes.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Smartphone className="w-3.5 h-3.5" />
          Get SakeScan Free
        </Button>
      </div>
    </div>
  );
}
