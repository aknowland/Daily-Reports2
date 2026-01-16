# Field Daily Reports

A mobile-first web application for construction inspectors to create daily field reports with photo uploads, digital signatures, and PDF generation.

## Overview

Field Daily Reports helps construction inspection teams document their daily work efficiently with:
- **Mobile-first forms**: Touch-optimized interfaces for field use
- **Voice-to-text dictation**: Hands-free data entry using device microphone and AI transcription
- **Photo documentation**: Upload and caption site photos
- **Digital signatures**: Canvas-based signature capture
- **PDF generation**: Professional reports with company branding
- **Email distribution**: Send reports to project stakeholders

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect)
- **File Storage**: Local filesystem (storage/)

## Project Structure

```
├── client/                 # Frontend React application
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── pages/          # Page components
│       ├── hooks/          # Custom React hooks
│       └── lib/            # Utilities
├── server/                 # Backend Express server
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # Database operations
│   └── replit_integrations/ # Auth integration
├── shared/                 # Shared types and schemas
│   ├── schema.ts           # Drizzle database schema
│   └── models/             # Auth models
└── storage/                # File uploads
    ├── uploads/            # Report photos
    ├── signatures/         # Digital signatures
    └── reports/            # Generated PDFs
```

## Key Features

### User Roles
- **Inspector**: Create, edit, and submit daily reports
- **Admin**: Manage projects, users, and settings

### Daily Report Fields
- Project selection
- Date and weather conditions
- Work Activities (unified entries combining contractor/trade, headcount, and work description)
- Additional work notes
- Visitors log
- Issues/delays (yes/no with details)
- Safety incidents (yes/no with details)
- Notes and observations
- Photo uploads with captions
- Digital signature

### Inspector Profile
- Inspectors can set their firstName and lastName in their profile
- These names are used in daily reports and PDF generation
- Falls back to auth user name, then email if profile name is not set

### Voice-to-Text Feature
- VoiceInput component uses MediaRecorder API for audio capture
- 120-second max recording time with visual countdown and auto-stop
- Audio sent as base64 WebM to /api/transcribe endpoint
- OpenAI integration for speech-to-text transcription
- AI-powered parsing for structured data extraction (work activities, visitors)
- Integrated into all major text fields (inspections, notes, equipment, materials, issues, safety)

### API Endpoints

```
Authentication:
GET  /api/login           - Start login flow
GET  /api/logout          - Logout
GET  /api/auth/user       - Get current user

Projects:
GET    /api/projects      - List all projects
POST   /api/projects      - Create project
PATCH  /api/projects/:id  - Update project
DELETE /api/projects/:id  - Delete project

Reports:
GET    /api/reports       - List reports with stats
GET    /api/reports/:id   - Get report details
POST   /api/reports       - Create report
PATCH  /api/reports/:id   - Update report
DELETE /api/reports/:id   - Delete report

Photos/Signatures:
POST   /api/reports/:id/photos    - Upload photos
PATCH  /api/photos/:id            - Update photo caption
DELETE /api/photos/:id            - Delete photo
POST   /api/reports/:id/signature - Save signature
POST   /api/reports/:id/pdf       - Generate PDF
POST   /api/reports/:id/distribute - Send to recipients

Admin:
GET    /api/admin/users              - List all users
PATCH  /api/admin/users/:id/role     - Update user role
GET    /api/admin/users/:id/projects - Get user's assigned projects
PUT    /api/admin/users/:id/projects - Update user's project assignments
GET    /api/admin/settings           - Get app settings
POST   /api/admin/settings           - Update settings
POST   /api/admin/logo               - Upload company logo
GET    /api/admin/invites            - List all invites
POST   /api/admin/invites            - Create new invite
DELETE /api/admin/invites/:id        - Delete invite

Invites:
GET    /api/invites/:token        - Get invite by token (public)
POST   /api/invites/:token/accept - Accept invite (requires auth)

Voice/Transcription:
POST   /api/transcribe            - Transcribe audio to text
POST   /api/parse-report-voice    - Parse transcript into structured data
```

## Development

The application runs on port 5000 with:
- Vite for frontend development (HMR enabled)
- Express for API routes
- PostgreSQL database

## Database Schema

- **users**: Auth user accounts
- **sessions**: Session storage
- **user_profiles**: Extended user data with roles and active company
- **companies**: Construction companies
- **company_members**: User-to-company assignments (many-to-many)
- **projects**: Construction projects (linked to companies)
- **project_members**: User-to-project assignments
- **daily_reports**: Field inspection reports
- **photos**: Report photo attachments
- **distribution_logs**: Email/folder distribution history
- **app_settings**: Company branding and config
- **invites**: Pending user invitations with role, company, and project assignments

## Multi-Company Support

Inspectors can work for multiple companies:
- Each project belongs to a company
- Users can be members of multiple companies
- Company switcher in header allows switching between companies
- Projects filter based on active company
- Company info is read-only for inspectors (admins manage companies)

## Role-Based Access Control

Three role levels with different access permissions:

### System Admin (role="admin")
- Sees ALL projects across all companies
- Sees ALL reports from all inspectors
- Can manage all users, settings, and invites
- System admin emails configured via ADMIN_EMAILS environment variable

### Company Admin (company member with role="admin")
- Sees all projects in companies where they are admin
- Sees all reports for those company's projects (not just their own reports)
- Can manage company settings, invites, and project assignments
- Access spans ALL companies where they have admin role (not just activeCompanyId)

### Inspector (regular user)
- Sees only projects they are assigned to
- Sees only their own reports
- Can create reports for assigned projects

### Implementation Details
- `getCompaniesForUser(userId)` retrieves all company memberships to determine admin access
- Storage functions (`getReports`, `getReportStats`) support `companyIds` array for efficient OR filtering
- Database queries avoid N+1 patterns by filtering at the SQL level using `inArray` and `or` conditions
