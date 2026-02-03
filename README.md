# Sake Scan

A sake discovery app that lets users scan sake labels (like Vivino for wine) to get instant information, ratings, and recommendations.

**Domain:** sakescan.com
**iOS App:** Available on App Store

## Features

### Landing Page (/)
- Hero section with real app screenshot
- Feature highlights (scanning, database, food pairings, reviews)
- How it works step-by-step guide
- Testimonials from users
- Download CTA for iOS
- Footer with navigation

### Company Pages
- `/about` - About Us page with company story, values, and team
- `/careers` - Careers page with open positions
- `/contact` - Contact & Support page with FAQ
- `/privacy` - Privacy Policy
- `/terms` - Terms of Service

### Admin Dashboard (/admin)
Admin area for managing the sake database (connected to Supabase):

- **Dashboard** (`/admin`) - Real-time stats, top rated sakes, quick actions
- **Sakes** (`/admin/sakes`) - Full CRUD for sake database with image upload
- **Breweries** (`/admin/breweries`) - Browse breweries
- **Users** (`/admin/users`) - View user accounts
- **Reviews** (`/admin/reviews`) - View and moderate reviews
- **Settings** (`/admin/settings`) - Admin settings

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Auth + Storage)

## Design System

Japanese-inspired elegant theme:
- Primary color: Deep sake red (赤)
- Accent color: Gold (金)
- Typography: Zen Kaku Gothic New (sans), Noto Serif JP (serif)
- Warm cream background

## Supabase Integration

The admin dashboard is connected to the shared Supabase backend:

**Project:** qpsdebikkmcdzddhphlk
**URL:** https://qpsdebikkmcdzddhphlk.supabase.co

### Database Tables
- `users` - User profiles
- `sake` - Sake catalog (name, brewery, type, region, images, ratings)
- `scans` - User scan history
- `ratings` - User reviews and ratings

### Admin Features
- View real-time stats (total sakes, users, breweries, reviews)
- Add, edit, delete sakes with image upload
- View and search users
- View and delete reviews
- Upload images to Supabase Storage
