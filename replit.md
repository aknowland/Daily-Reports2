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
- **Proposal Management**: Company admins can create and manage detailed proposals for inspection services, including dynamic pricing options and PDF generation.
- **Proposal-to-Contract Conversion**: Admins can convert accepted proposals into contracts with one click, automatically creating linked projects and mapping proposal data (rates, hours, dates) to the new contract.

**Core Features:**

- **Daily Report Creation**: Comprehensive forms for project selection, weather, work activities, notes, issues, safety incidents, photos, and digital signatures.
- **Previous Report Defaults**: Automatically pre-fills new reports with data from the latest project report for efficiency.
- **Unassigned Reports**: Allows creation of reports for projects not formally assigned, using a custom project name.
- **Inspector Profile**: Users can manage their names for report generation.
- **Admin Capabilities**: Management of projects, users, company settings, and invitations.
- **Billing Features**: Generation of timesheet PDFs, client invoices, combined reports, and inspector invoices.

## External Dependencies

- **Replit Auth**: For user authentication (OpenID Connect).
- **Replit Object Storage**: For persistent cloud storage of photos, signatures, PDFs, and company logos.
- **OpenAI**: Used for speech-to-text transcription and AI-powered parsing of voice input.
- **Resend**: For email distribution of reports and other communications.