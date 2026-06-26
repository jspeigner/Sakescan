export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function sakeSlug(name: string, id: string): string {
  return `${slugify(name)}-${id.slice(0, 8)}`;
}
