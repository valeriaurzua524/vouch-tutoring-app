# Vouch — CS 4800 Assignment 2 base app

A **customer-facing functional prototype** of a campus peer-tutoring marketplace, based on the Vouch project documents. Built with React, TypeScript and Vite. No backend or database is connected yet.

## Quick start

Install Node.js 20.19+ or 22.12+, then in this folder run:

```bash
npm install
npm run dev
```

Open the localhost URL shown by Vite (usually http://localhost:5173).

## Build

```bash
npm run build
```

## What works now
- Responsive home page and navigation
- Search and filter sample tutor profiles by name, course, topic, and day
- Open tutor profile details
- Save/remove favorites (local browser storage)
- Create and remove structured tutoring requests (local browser storage)
- View requests in My Requests
- Tutor onboarding informational page

## Honest limitations
- All tutor profiles, ratings, and session counts are **fictional demo data**.
- Requests are saved only to the current browser's `localStorage`; no tutor receives them.
- No login, API, database, real booking, availability verification, weighted matching engine, or tamper-evident ledger yet.
- `Find a tutor` is an optional UX demo directory; the project backlog ultimately favors matching through structured requests instead.
- Google Fonts require internet; fallback fonts are included.

## Suggested three-person handoff
1. **Base app:** upload this scaffold, confirm `npm run dev` and `npm run build` work.
2. **Frontend:** refine React components, design, accessibility and user journeys.
3. **Backend/data:** add Express API, PostgreSQL schema, tutor/profile/request endpoints and manual matching. Replace `localStorage` with API calls.

Create separate branches (`frontend`, `backend`) and merge changes by pull request. Agree on API response shapes before coding.

## Suggested API contracts for backend teammate
- `GET /api/tutors?course=CS%202400&day=Monday`
- `GET /api/courses`
- `POST /api/requests` body `{course, topic, day, mode, notes}`
- `GET /api/requests` (authenticated student's requests)
- `POST /api/requests/:id/assign` (admin only; assign tutor)

These are **suggestions**, not implemented endpoints.

## AI disclosure
Initial React + TypeScript prototype generated with ChatGPT (OpenAI) using the team's Vouch project documents. Team members should review and test all generated code before submission.
