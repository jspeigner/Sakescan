import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { List } from "lucide-react";

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px" }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className="space-y-1" aria-label="Table of contents">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
        <List className="w-4 h-4" />
        Table of Contents
      </div>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={cn(
            "block text-sm py-1 border-l-2 transition-colors hover:text-foreground",
            item.level === 3 ? "pl-6" : "pl-3",
            activeId === item.id
              ? "border-primary text-primary font-medium"
              : "border-transparent text-muted-foreground"
          )}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          {item.text}
        </a>
      ))}
    </nav>
  );
}
