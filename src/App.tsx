import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/use-auth";
import { ScrollToTop } from "@/components/ScrollToTop";
import { AppRoutes } from "@/AppRoutes";

declare global {
  interface Window {
    __REACT_QUERY_STATE__?: ReturnType<typeof dehydrate>;
  }
}

const queryClient = new QueryClient();
const dehydratedState = typeof window !== "undefined" ? window.__REACT_QUERY_STATE__ : undefined;

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <ScrollToTop />
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
