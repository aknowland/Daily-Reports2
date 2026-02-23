# Field Daily Reports

## Overview

Field Daily Reports is a mobile-first web application designed to streamline daily reporting for construction inspectors. It aims to enhance productivity, reduce administrative overhead, and improve communication within construction inspection teams by providing a robust digital platform for real-time data capture and distribution, replacing traditional paper-based reporting. Key capabilities include efficient documentation through photo uploads, digital signatures, and automated PDF generation. The project envisions significant market potential by offering a comprehensive solution for construction field reporting.

## User Preferences

No specific user preferences were provided in the original `replit.md` file.

## System Architecture

The application is built with a modern web stack, utilizing **React, TypeScript, and Tailwind CSS** for a responsive, mobile-first frontend, complemented by **Node.js and Express** for the backend API. Data persistence is handled by **PostgreSQL with Drizzle ORM**.

**Key Architectural Decisions:**

-   **Mobile-First Design**: UI/UX is optimized for touch interaction and field use.
-   **Role-Based Access Control (RBAC)**: Supports Inspector, Company Admin, and System Admin roles with distinct permissions, including multi-company support. Inspectors can view aggregated project data and access assigned projects; Company Admins have full access to their company's data; System Admins have full access across all companies.
-   **AI Integration**: Leverages OpenAI for voice-to-text transcription, AI-powered structured data extraction, and an AI chat assistant for admins.
-   **Automated Report Generation**: Generates professional, branded PDF reports, including daily reports, weekly/monthly summaries, and current status reports, with email distribution capabilities.
-   **Dynamic Billing & Invoicing**: Implements a two-tier rate structure for company-to-client and inspector-to-company billing, supporting invoice, timesheet, and proposal generation with multi-option rate structures and award tracking.
-   **Comprehensive Budget Tracking**: Unified budget tracking for projects and contracts, combining hours from daily reports, manual entries, and base hours, with milestone notifications and various budget calculation modes (Daily Reports, Scheduled, Hybrid).
-   **Proposal and Contract Management**: Features full lifecycle management from proposal creation (with dynamic pricing and schedule types) to one-click conversion to contracts, including purchase order integration and IOR agreements.
-   **Admin Tools & Dashboards**: Provides company and contract dashboards with KPIs, revenue trends, timelines, project status, inspector workload, and a notification system. Includes "View as Inspector" mode for admins.
-   **Communication Features**: Project and Company dashboards include comment sections with @mentions for team communication, and dismissible dashboard notifications.
-   **Meetings Module**: Admin-only module for managing meeting minutes, featuring audio transcription, AI summary extraction, and PDF generation.
-   **Client Portal**: Allows external clients read-only access to project data, including reports, photos, and issues.
-   **Resume Generation**: Generates professional two-column PDF resumes for inspectors and team members based on profile data.

**Core Features:**

-   **Daily Report Creation**: Comprehensive forms with photo uploads, digital signatures, and auto-filling from previous reports.
-   **Time Tracking**: Manual time entry for inspectors not using daily reports, with detailed hours breakdown.
-   **Project and Client Management**: CRUD operations for projects and clients, including project linking to contracts and custom billing rates.
-   **Automated Notifications**: Daily email reminders for contract dates and budget utilization milestones.
-   **Inspector Profile Management**: Users can manage their profile details and upload profile photos.

## External Dependencies

-   **Replit Auth**: User authentication.
-   **Replit Object Storage**: Cloud storage for photos, signatures, PDFs, and company logos.
-   **OpenAI**: Speech-to-text transcription, AI content summarization, and structured data extraction.
-   **Resend**: Email distribution.
-   **Stripe**: Payment processing for company subscriptions.