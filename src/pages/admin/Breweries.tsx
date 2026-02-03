import { AdminLayout } from "@/components/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, MoreHorizontal, Filter, MapPin } from "lucide-react";

const breweries = [
  {
    id: 1,
    name: "Asahi Shuzo",
    region: "Yamaguchi",
    established: "1948",
    sakeCount: 12,
    status: "verified",
  },
  {
    id: 2,
    name: "Hakkaisan Brewery",
    region: "Niigata",
    established: "1922",
    sakeCount: 18,
    status: "verified",
  },
  {
    id: 3,
    name: "Takagi Shuzo",
    region: "Yamagata",
    established: "1615",
    sakeCount: 8,
    status: "verified",
  },
  {
    id: 4,
    name: "Kokuryu Sake Brewing",
    region: "Fukui",
    established: "1804",
    sakeCount: 15,
    status: "verified",
  },
  {
    id: 5,
    name: "Dewazakura Sake Brewery",
    region: "Yamagata",
    established: "1892",
    sakeCount: 22,
    status: "pending",
  },
];

export default function AdminBreweries() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold">Breweries</h1>
            <p className="text-muted-foreground">Manage sake breweries</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Brewery
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search breweries..." className="pl-9" />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </Button>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Region</TableHead>
                <TableHead className="hidden md:table-cell">Established</TableHead>
                <TableHead className="hidden lg:table-cell">Sakes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breweries.map((brewery) => (
                <TableRow key={brewery.id}>
                  <TableCell className="font-medium">{brewery.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                      {brewery.region}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{brewery.established}</TableCell>
                  <TableCell className="hidden lg:table-cell">{brewery.sakeCount} sakes</TableCell>
                  <TableCell>
                    <Badge variant={brewery.status === "verified" ? "default" : "secondary"}>
                      {brewery.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Pagination placeholder */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Showing 5 of 1,847 breweries</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
