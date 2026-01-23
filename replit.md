# Field Daily Reports

## Overview

Field Daily Reports is a mobile-first web application designed to streamline the daily reporting process for construction inspectors. It enables efficient documentation of on-site activities through intuitive features such as photo uploads, digital signatures, and automated PDF generation. The application aims to enhance productivity and communication within construction inspection teams by providing a robust platform for real-time data capture and distribution. Its core purpose is to replace traditional paper-based reporting with a digital solution that improves accuracy, reduces administrative overhead, and ensures timely dissemination of critical project information to all stakeholders.

## User Preferences

No specific user preferences were provided in the original `replit.md` file.

## System Architecture

The application is built with a modern web stack, utilizing **React, TypeScript, and Tailwind CSS** for a responsive, mobile-first frontend, complemented by **Node.js and Express** for the backend API. Data persistence is handled by **PostgreSQL with Drizzle ORM**.

**Key Architectural Decisions:**

- **Mobile-First Design**: UI/UX is optimized for touch interaction and field use, ensuring accessibility and ease of use on mobile devices.
- **Role-Based Access Control (RBAC)**: Supports `Inspector`, `Company Admin`, and `System Admin` roles, each with distinct permissions and data visibility.
- **Multi-Company Support**: Allows inspectors to work across multiple companies, with project data filtered by the active company.
- **Voice-to-Text Integration**: Leverages OpenAI for speech-to-text transcription and AI-powered structured data extraction for work activities and visitors, integrated into various input fields.
- **Automated Report Generation**: Generates professional PDF reports with company branding and facilitates email distribution to stakeholders.
- **Dynamic Billing & Invoicing**: Implements a two-tier rate structure for company-to-client and inspector-to-company billing, supporting invoice and timesheet generation.
- **Contract-Project Relationship**: Enables multiple projects to link to a single contract for streamlined billing rate management.
- **"View as Inspector" Mode**: System and Company Admins can toggle this mode to experience the application from an inspector's perspective without changing accounts.
- **Proposal Management**: Company admins can create and manage detailed proposals for inspection services, including dynamic pricing options, automatic hours calculation, and PDF generation.
- **Per-Inspector Schedule Types**: Each inspector entry in a proposal can be set to Full Time (8 hrs/day) or Part Time (4 hrs/day) independently, allowing mixed staffing within a single proposal (e.g., one FT inspector + one PT inspector). Each inspector row has a FT/PT toggle and a "Calc Hours" button to auto-calculate working hours based on their schedule type and the proposal date range. Working hours exclude weekends and 11 US federal holidays (New Year's, MLK Day, Presidents' Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas). PDF generation displays each inspector's schedule type (FT/PT) in the rate table and shows "Mixed Schedules" in the header when inspectors have different schedule types.
- **Proposal-to-Contract Conversion**: Admins can convert accepted proposals into contracts with one click, automatically creating linked projects and mapping proposal data (rates, hours, dates, and selected option inspectors) to the new contract.
- **Contract Multi-Option Rate Structure**: Contracts support the same per-inspector pricing options as proposals. Each contract can have multiple rate options, and each option can have multiple inspectors with individual title, name, rate, hours, and schedule type (FT/PT). The "Calc Hours" button auto-calculates working hours based on contract date range and schedule type. Contract cards display inspector badges from the first option.
- **AI Assistant with Task Execution**: Company Admins and System Admins can use an AI chat assistant (accessible via chat bubble or /company/chat) that can both answer questions about company data AND perform actions like creating proposals. Features voice transcription for hands-free input.

**Core Features:**

- **Daily Report Creation**: Comprehensive forms for project selection, weather, work activities, notes, issues, safety incidents, photos, and digital signatures.
- **Previous Report Defaults**: Automatically pre-fills new reports with data from the latest project report for efficiency.
- **Unassigned Reports**: Allows creation of reports for projects not formally assigned, using a custom project name.
- **Inspector Profile**: Users can manage their names for report generation.
- **Admin Capabilities**: Management of projects, users, company settings, and invitations.
- **Billing Features**: Generation of timesheet PDFs, client invoices, combined reports, and inspector invoices.
- **Clients Management**: Full CRUD for managing company clients with reusable ClientSelect dropdown for inline client creation in contracts/proposals/projects forms. Clicking a client card navigates to filtered projects view. Projects can be linked to clients via the clientId field for proper relationship tracking.
- **IOR Agreements**: Inspector of Record agreements for setting inspector pay terms on specific projects. Company admins can create, edit, delete agreements and generate professional PDF documents. Access restricted to company admins only.
- **Contract Dashboard**: Comprehensive visual dashboard for each contract accessible via "Dashboard" button on contract cards. Displays:
  - Schedule progress (based on start/substantial completion dates with status indicators)
  - Budget tracking with stacking support (base budget + auto-calculated from reports)
  - Linked Projects section showing all projects under this contract with report counts, per-project budget progress bars, and budget status indicators
  - Bid schedule (all milestone dates from bid release to final closeout)
  - Client billing rates (regular, overtime, premium hourly rates)
  - Inspector billing rates (from IOR agreements linked to contract projects)
  - Project notes
  - Attached files (with download links)
  - Daily reports table (showing reports from all linked projects)
- **Stacking Budget for Mid-Project Onboarding**: When an inspector joins a project mid-way, admins can set a "base budget" representing work done before they joined. This base amount automatically stacks with new daily reports - no manual recalculation needed.
- **Project-Level Budget Tracking**: Each project can have its own budget amount and base budget (for stacking). The Contract Dashboard displays per-project budget progress with color-coded status indicators (under budget, on track, warning at 80%, over budget). Project budget milestone notifications (50%, 75%, 90%, 100%) are sent independently from contract-level notifications.
- **Invoice Tracking with Purchase Order Integration**: Full invoice lifecycle management with PO linking. Features:
  - PO → Contract → Project billing hierarchy
  - Invoice creation with PO assignment and balance tracking
  - PO utilization display showing percentage used vs remaining value
  - Email invoice sending via Resend with customizable recipient, subject, and message
  - Invoice status tracking (draft, sent, paid)
- **Automated Notification System**: Daily scheduler sends email notifications for:
  - Contract date reminders (start date: 30/14/7 days, substantial completion: 120/90/60/30/14/3 days, final closeout: 10/3 days)
  - Budget milestone alerts at 50%, 75%, 90%, and 100% utilization (with stacking support)
  - Color-coded severity levels for budget alerts (green/orange/red)
  - Automatic contract status updates based on key dates

## Technical Notes

### Shared Notification Processor
The file `server/notification-processor.ts` is the single source of truth for notification logic. Both the API route (POST /api/contracts/process-notifications) and the daily scheduler use the shared `processContractNotifications()` function to ensure consistent behavior. Key exports:
- `NOTIFICATION_INTERVALS`: Date reminder intervals per notification type
- `BUDGET_MILESTONES`: Budget alert thresholds (50, 75, 90, 100)
- `computeContractStatusFromDates()`: Auto-compute contract status from dates
- `processContractNotifications()`: Main processing function for all notifications

### IOR Agreement Authorization
All IOR Agreement API routes require company admin authorization. The routes use `isEffectiveCompanyAdmin()` to verify:
- GET /api/ior-agreements - Lists agreements for active company (admin only)
- GET /api/ior-agreements/:id - Get single agreement (admin only, company scoped)
- POST /api/ior-agreements - Create agreement (admin only)
- PATCH /api/ior-agreements/:id - Update agreement (admin only)
- DELETE /api/ior-agreements/:id - Delete agreement (admin only)
- POST /api/ior-agreements/:id/pdf - Generate PDF (admin only)

### Query Key Pattern for Clients API
The clients API uses the server-side `profile.activeCompanyId` to filter results, not a URL path parameter. Therefore, all clients queries must use a custom `queryFn` that fetches from `/api/clients` directly while including the companyId in the queryKey for cache segmentation:
```javascript
const { data: clients } = useQuery<Client[]>({
  queryKey: ["/api/clients", activeCompany?.id],
  queryFn: async () => {
    const response = await fetch("/api/clients", { credentials: "include" });
    if (!response.ok) throw new Error("Failed to fetch clients");
    return response.json();
  },
  enabled: !!activeCompany?.id,
});
```
This is necessary because the default queryFn joins queryKey parts with "/" to form the URL.

## External Dependencies

- **Replit Auth**: For user authentication (OpenID Connect).
- **Replit Object Storage**: For persistent cloud storage of photos, signatures, PDFs, and company logos.
- **OpenAI**: Used for speech-to-text transcription and AI-powered parsing of voice input.
- **Resend**: For email distribution of reports and other communications.