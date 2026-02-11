# Field Daily Reports

## Overview

Field Daily Reports is a mobile-first web application designed to streamline daily reporting for construction inspectors. It enables efficient documentation of on-site activities through features like photo uploads, digital signatures, and automated PDF generation. The application aims to enhance productivity, reduce administrative overhead, and improve communication within construction inspection teams by providing a robust digital platform for real-time data capture and distribution, ultimately replacing traditional paper-based reporting.

## User Preferences

No specific user preferences were provided in the original `replit.md` file.

## System Architecture

The application is built with a modern web stack, utilizing **React, TypeScript, and Tailwind CSS** for a responsive, mobile-first frontend, complemented by **Node.js and Express** for the backend API. Data persistence is handled by **PostgreSQL with Drizzle ORM**.

**Key Architectural Decisions:**

-   **Mobile-First Design**: UI/UX is optimized for touch interaction and field use.
-   **Role-Based Access Control (RBAC)**: Supports a three-tier role hierarchy: Inspector, Company Admin, and System Admin, each with distinct permissions.
    - Inspectors can view all aggregated project data (reports, photos, issues, team hours) for transparency
    - Inspectors can only access projects they're assigned to
    - Company Admins see all data for their company including contracts and financial information
    - System Admins have full access to all companies and data
    - Contract access (dashboard, options, invoices) is restricted to admins only
-   **Multi-Company Support**: Allows inspectors to work across multiple companies, with data filtered by the active company.
-   **Voice-to-Text Integration**: Leverages OpenAI for speech-to-text transcription and AI-powered structured data extraction for various input fields.
-   **Automated Report Generation**: Generates professional PDF reports with company branding and facilitates email distribution.
-   **Dynamic Billing & Invoicing**: Implements a two-tier rate structure for company-to-client and inspector-to-company billing, supporting invoice and timesheet generation.
-   **Contract-Project Relationship**: Supports linking multiple projects to a single contract and individual projects to specific awarded contract options for precise rate and budget tracking.
-   **"View as Inspector" Mode**: System and Company Admins can view the application from an inspector's perspective.
-   **Proposal Management**: Company admins can create and manage detailed proposals, including dynamic pricing, automatic hours calculation, and PDF generation.
-   **Per-Inspector Schedule Types**: Allows defining Full-Time or Part-Time schedules for individual inspectors within proposals, affecting hour calculations and PDF generation.
-   **Proposal-to-Contract Conversion**: Enables one-click conversion of accepted proposals into contracts, automatically populating data and linking projects.
-   **Award-to-PO Prompt**: Prompts for Purchase Order creation when a contract status is set to "awarded," pre-filling with contract budget.
-   **Contract Multi-Option Rate Structure**: Contracts support multiple rate options, each with individual inspector details, rates, hours, and schedule types.
-   **Per-Option Award Tracking**: Allows partial awards for multi-option contracts, tracking the award status of individual options.
-   **AI Assistant with Task Execution**: Company and System Admins can use an AI chat assistant for questions and actions, including proposal creation, with voice transcription support.
-   **Team Inspectors**: Non-active inspector profiles for people who haven't joined the system yet, with resume-style profiles that can be used in proposals and contracts and merged when they create accounts.

**Core Features:**

-   **Daily Report Creation**: Comprehensive forms for project selection, weather, work activities, notes, issues, safety incidents, photos, and digital signatures.
-   **Previous Report Defaults**: Auto-fills new reports with data from the latest project report.
-   **Unassigned Reports**: Allows creating reports for unassigned projects using custom names.
-   **Inspector Profile**: Users can manage their names for report generation.
-   **Admin Capabilities**: Management of projects, users, company settings, and invitations.
-   **Billing Features**: Generation of timesheet PDFs, client invoices, combined reports, and inspector invoices.
-   **Manual Time Entry**: Inspectors who don't use the daily reporting system can manually enter hours for timesheet generation. The Project Dashboard timesheet dialog provides tabs for switching between "From Daily Reports" and "Manual Entry" modes, with a scrollable date-by-date form for entering regular and overtime hours.
-   **Unified Budget Tracking**: Project and Contract dashboards now combine hours from daily reports, manual time entries, and base hours for comprehensive budget tracking. The Hours Budget card displays total hours with a breakdown by source (Daily Reports vs Manual Entries vs Base Hours), ensuring accurate budget consumption regardless of how hours are recorded.
-   **Base Hours Tracking**: Enables per-inspector tracking of hours logged before the project was onboarded to the system. Admins can enter regular hours, overtime hours, and pre-existing billed amounts for each inspector. Base hours are included in total hours calculations for accurate budget tracking on mid-project onboarding scenarios.
-   **Clients Management**: Full CRUD for managing company clients, with inline creation and project linking.
-   **IOR Agreements**: Creation and management of Inspector of Record agreements by company admins, including PDF generation.
-   **Contract Dashboard**: Provides a visual dashboard for each contract, displaying schedule progress, budget tracking, linked projects, financial summary, bid schedule, billing rates, notes, attached files, and daily reports.
-   **Stacking Budget for Mid-Project Onboarding**: Allows setting a base budget for existing work, which stacks with new daily reports for accurate budget tracking.
-   **Project-Level Budget Tracking**: Individual projects can have their own budgets and base budgets, with progress displayed on the Contract Dashboard and milestone notifications.
-   **Project Billing Rates**: Projects support independent multi-rate billing with optional inheritance from linked contracts. When linked to a contract option, projects can either inherit billing rates automatically or define custom project-specific rates. The billing rates editor supports multiple rate entries with title/role, inspector name, schedule type (FT/PT), hourly rate, and hours fields with automatic total calculation.
-   **Budget Tracking Modes**: Contracts and projects support "Daily Reports," "Scheduled," and "Hybrid" modes for budget calculation, with visual indicators.
-   **Invoice Tracking with Purchase Order Integration**: Manages the full invoice lifecycle, including PO assignment, balance tracking, utilization display, email sending, and status tracking.
-   **Automated Notification System**: Daily scheduler sends email notifications for contract date reminders and budget milestone alerts (50%, 75%, 90%, 100% utilization).
-   **Company Dashboard**: Comprehensive analytics dashboard at `/company/dashboard` featuring:
    - **KPI Cards**: Hours this month, Reports submitted, Active contracts, Revenue billed, Completion rate
    - **Revenue Trends**: Bar chart showing monthly revenue over last 12 months
    - **Contract Timeline**: Visual timeline with progress bars, start/end dates, days remaining
    - **Project Status Overview**: Schedule and budget progress, limited to 10 items with incremental "Show 10 More" pagination
    - **Notifications Center**: Budget alerts and deadline warnings with severity indicators
    - **Inspector Workload**: Hours, projects, and reports per inspector
    - **Recent Activity Feed**: Last 10 daily reports with timestamps
-   **Project Team Comments**: Project Dashboard includes a collapsible Team Communication section where inspectors and admins can post comments, view team discussion history, and use @mentions to tag team members. Comments support markdown-style mentions (`@[Name](userId)`) that are highlighted in the UI, and comments can be deleted by their author or an admin.
-   **Summary Reports**: Comprehensive reporting accessible via dropdown menus on all dashboards:
    - **Report Types**: Weekly Summary (user selects week), Monthly Summary (user selects month), Current Status (today's snapshot)
    - **Dashboard Scopes**: 
      - Project Dashboard: Individual project data
      - Contract Dashboard: All linked projects combined with budget/schedule/invoice data
      - Company Dashboard: All active projects/contracts with company-wide analytics
    - **Weekly Summary PDF**: Stats boxes, weather progress bars, issues/safety side-by-side sections, daily reports table
    - **Monthly Summary PDF**: Dashboard-style with weather summary, milestones, issues, safety incidents
    - **Current Status PDF**: Schedule/budget cards, key metrics, team overview, recent activity
    - **Week Selection**: Calendar picker with quick selection buttons (This Week, Last Week, 2 Weeks Ago, etc.)
    - **Email Distribution**: All report types support email distribution to specified recipients

## Recent Changes (February 2026)

-   **Hours-Based Schedule Progress**: Project Dashboard Schedule Progress card now shows hours-based progress (hours used / budgeted hours) when budget data is available, with fallback to calendar-based progress. Draft reports are included in hours tracking.
-   **Admin-Only Hours Breakdown**: New Hours Breakdown card on Project Dashboard (visible to Company/System Admins only) showing hours by source (Daily Reports, Manual Entries, Base Hours) with regular/overtime/premium split.
-   **Meetings Module**: Full CRUD for meeting minutes management at `/company/meetings` (admin-only). Supports meeting types: Progress, Safety, Coordination, OAC, Pre-Construction, Other. Auto-generates meeting numbers (e.g., PROGRESS-001). Features audio upload with OpenAI Whisper transcription, GPT-4 AI summary/action items/decisions/key points extraction, meeting minutes PDF generation, and detail view with real-time AI processing status polling.
-   **Photo Lightbox**: Full-size photo preview with left/right navigation, keyboard controls, download button, and photo counter on project and contract dashboards
-   **Photo Display Limit**: Increased from 6 to 12 photos on dashboards with "View All" toggle
-   **Hours Budget Card Removed**: Inspectors no longer see budget/financial information on project dashboard
-   **Company Dashboard Notes**: Team Notes section with @mention support for tagging company members. Admin-only CRUD with `company_notes` table, `@[Name](userId)` mention format with highlighted rendering.
-   **Inspector Workload Filtering**: Enhanced Inspector Workload card with Day/Week/Month/Year period filter. Each inspector row is expandable to show per-project hours breakdown (regular, OT, report count). Uses separate `/api/company/inspector-workload` endpoint.
-   **Dismissable Dashboard Notifications**: X button on hover to dismiss alerts, stored in `dismissed_alerts` table per user+company.

## Recent Changes (January 2026)

-   **Subscription Pricing Page**: 3-tier pricing (Starter $99/mo, Professional $299/mo, Enterprise $699/mo) with Stripe checkout integration
-   **Company Creation Flow**: New companies redirect to pricing page after creation (except Knowland Construction Services)
-   **Stripe Integration**: Products created with lookup keys (price_starter_monthly, price_professional_monthly, price_enterprise_monthly)
-   **No Auto-Prompt for Company Creation**: Users manually navigate to My Companies page to join/create companies

## External Dependencies

-   **Replit Auth**: User authentication using OpenID Connect.
-   **Replit Object Storage**: Persistent cloud storage for photos, signatures, PDFs, and company logos.
-   **OpenAI**: Speech-to-text transcription and AI-powered parsing of voice input.
-   **Resend**: Email distribution for reports and other communications.
-   **Stripe**: Payment processing for company subscriptions (sandbox mode).