import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
      <Link to="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
        <Home className="w-3.5 h-3.5" />
        <span className="sr-only">Home</span>
      </Link>
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          {item.href ? (
            <Link to={item.href} className="hover:text-foreground transition-colors truncate max-w-[200px]">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground truncate max-w-[250px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
