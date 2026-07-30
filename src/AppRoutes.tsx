import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/admin";
import Index from "./pages/Index";
import Contact from "./pages/Contact";
import About from "./pages/About";
import Careers from "./pages/Careers";
import CareerJob from "./pages/CareerJob";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import CityGuides from "./pages/CityGuides";
import CityGuide from "./pages/CityGuide";
import SakeExplore from "./pages/SakeExplore";
import SakeDetail from "./pages/SakeDetail";
import BreweryDetail from "./pages/BreweryDetail";
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminSakes from "./pages/admin/Sakes";
import AdminBreweries from "./pages/admin/Breweries";
import AdminUsers from "./pages/admin/Users";
import AdminReviews from "./pages/admin/Reviews";
import AdminSettings from "./pages/admin/Settings";
import AdminImport from "./pages/admin/Import";
import AuthCallback from "./pages/AuthCallback";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/about" element={<About />} />
      <Route path="/careers" element={<Careers />} />
      <Route path="/careers/:slug" element={<CareerJob />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/guides" element={<CityGuides />} />
      <Route path="/guides/:city" element={<CityGuide />} />
      <Route path="/explore" element={<SakeExplore />} />
      <Route path="/sake/:slug" element={<SakeDetail />} />
      <Route path="/brewery/:slug" element={<BreweryDetail />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/sakes" element={<ProtectedRoute><AdminSakes /></ProtectedRoute>} />
      <Route path="/admin/breweries" element={<ProtectedRoute><AdminBreweries /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/reviews" element={<ProtectedRoute><AdminReviews /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
      <Route path="/admin/import" element={<ProtectedRoute><AdminImport /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
