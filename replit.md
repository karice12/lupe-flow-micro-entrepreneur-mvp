# Lupe Flow

A React/Vite frontend application for business management ("Assuma o controle do seu negócio"). Built with React, TypeScript, Tailwind CSS, and shadcn/ui components.

## Architecture

- **Framework**: React 18 + TypeScript
- **Build tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui component library
- **Routing**: React Router DOM v6
- **State**: React Context (GoalsContext) + TanStack React Query
- **Forms**: React Hook Form + Zod validation

## Project Structure

```
src/
  App.tsx           - Root component with routing
  main.tsx          - Entry point
  index.css         - Global styles + Tailwind
  pages/
    Auth.tsx        - Login/signup page
    Index.tsx       - Dashboard page
    Onboarding.tsx  - Onboarding flow
    NotFound.tsx    - 404 page
  components/
    NavLink.tsx     - Navigation link component
    ui/             - shadcn/ui components
  contexts/
    GoalsContext.tsx - Goals state management
  hooks/
    use-mobile.tsx
    use-toast.ts
  lib/
    utils.ts        - Utility functions
```

## Running the App

The app runs on port 5000 via `npm run dev`.

## Key Notes

- Migrated from Lovable to Replit: removed `lovable-tagger` plugin from Vite config
- CSS `@import` moved before Tailwind directives to fix build warning
- Pure frontend app — no backend server required
