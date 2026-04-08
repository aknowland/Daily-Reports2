import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, json, pgEnum, unique, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";
export * from "./models/chat";
import { users, type User } from "./models/auth";

// Certification entry type — used by both user_profiles and team_inspectors
export type CertEntry = {
  name: string;
  expiresAt: string | null;  // ISO date string "YYYY-MM-DD" or null
  certNumber?: string;
};

// Helper: normalize raw certifications JSON (handles legacy plain-string entries)
export function normalizeCerts(raw: unknown): CertEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { name: item, expiresAt: null };
    if (item && typeof item === "object" && "name" in item) return item as CertEntry;
    return { name: String(item), expiresAt: null };
  });
}

// Enums
export const userRoleEnum = pgEnum("user_role", ["inspector", "admin", "owner", "system_owner"]);
export const weatherTypeEnum = pgEnum("weather_type", ["clear", "cloudy", "rain", "wind", "heat", "cold"]);
export const reportStatusEnum = pgEnum("report_status", ["draft", "submitted"]);
export const distributionStatusEnum = pgEnum("distribution_status", ["pending", "sent", "failed"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "expired"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "canceled", "past_due", "trialing", "none"]);

// Contract enums
export const contractStatusEnum = pgEnum("contract_status", [
  "bid_release",
  "bid_received", 
  "under_review",
  "awarded",
  "not_awarded",
  "cancelled",
  "in_execution",
  "substantial_completion",
  "final_closeout"
]);

export const contractTypeEnum = pgEnum("contract_type", [
  "lump_sum",
  "time_and_materials",
  "unit_price",
  "cost_plus",
  "design_build",
  "hourly_rate",
  "other"
]);

// Award status for individual contract options (for partial awards)
export const optionAwardStatusEnum = pgEnum("option_award_status", [
  "pending",    // Not yet decided
  "awarded",    // This option was awarded
  "not_awarded" // This option was not awarded
]);

// Budget tracking mode - how budget utilization is calculated
export const budgetTrackingModeEnum = pgEnum("budget_tracking_mode", [
  "daily_reports",  // Track based on actual logged daily reports
  "scheduled",      // Track based on scheduled hours (working days × rate schedule)
  "hybrid"          // Show both scheduled and actual side-by-side
]);

// Companies table
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  phone: varchar("phone"),
  email: varchar("email"),
  logoPath: varchar("logo_path"),
  website: varchar("website"),
  createdById: varchar("created_by_id"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("none"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company Members table (many-to-many: users <-> companies)
export const companyMembers = pgTable("company_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: userRoleEnum("role").default("inspector").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.userId),
]);

// Pending Member Assignments - pre-assign company roles to emails before they log in
export const pendingMemberAssignments = pgTable("pending_member_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  role: userRoleEnum("role").default("inspector").notNull(),
  createdById: varchar("created_by_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.email, table.companyId),
]);

// Team Inspectors - non-active inspector profiles for people who haven't joined the system yet
export const teamInspectors = pgTable("team_inspectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  // Basic info
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  // Professional info (resume-style)
  title: varchar("title"),
  county: varchar("county"),
  licenseNumber: varchar("license_number"),
  licenseState: varchar("license_state"),
  certifications: json("certifications").$type<CertEntry[]>().default([]),
  // Work history - links to projects they've worked on
  projectHistory: json("project_history").$type<{projectId: string; projectName: string; role?: string; startDate?: string; endDate?: string}[]>().default([]),
  // Additional profile info
  notes: text("notes"),
  resumePath: varchar("resume_path"),
  profilePhotoPath: varchar("profile_photo_path"),
  bio: text("bio"),
  education: json("education").$type<{degree: string; school: string; status?: string}[]>().default([]),
  references: json("references").$type<{name: string; title: string; organization: string; email?: string; phone?: string}[]>().default([]),
  jobHistory: json("job_history").$type<{title: string; company: string; client?: string; projectName?: string; projectNumber?: string; projectValue?: string; startDate?: string; endDate?: string; description?: string}[]>().default([]),
  // Account linking - when they create a real account
  linkedUserId: varchar("linked_user_id").references(() => users.id, { onDelete: "set null" }),
  // Status tracking
  status: varchar("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.email),
]);

// Extended User Profile for app-specific fields
export const userProfiles = pgTable("user_profiles", {
  userId: varchar("user_id").primaryKey(),
  role: userRoleEnum("role").default("inspector").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  email: varchar("email"),
  company: varchar("company"),
  activeCompanyId: varchar("active_company_id").references(() => companies.id),
  activeProjectId: varchar("active_project_id"),
  // Inspector profile fields
  title: varchar("title"),
  licenseNumber: varchar("license_number"),
  licenseState: varchar("license_state"),
  certifications: json("certifications").$type<CertEntry[]>().default([]),
  profilePhotoPath: varchar("profile_photo_path"),
  bio: text("bio"),
  education: json("education").$type<{degree: string; school: string; status?: string}[]>().default([]),
  references: json("references").$type<{name: string; title: string; organization: string; email?: string; phone?: string}[]>().default([]),
  jobHistory: json("job_history").$type<{title: string; company: string; client?: string; projectName?: string; projectNumber?: string; projectValue?: string; startDate?: string; endDate?: string; description?: string}[]>().default([]),
  // Independent contractor fields
  contractorCompanyName: varchar("contractor_company_name"),
  contractorAddress: text("contractor_address"),
  contractorPhone: varchar("contractor_phone"),
  contractorEmail: varchar("contractor_email"),
  // Subscription fields for individual users
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("none"),
  monthlyReportCount: integer("monthly_report_count").default(0),
  reportCountResetAt: timestamp("report_count_reset_at"),
  // Onboarding
  hasSeenOnboarding: boolean("has_seen_onboarding").default(false),
  // Admin mode preference (for system admins)
  preferAdminMode: boolean("prefer_admin_mode").default(true),
  // Theme preference (light/dark)
  themePreference: varchar("theme_preference").default("light"),
  // Inspector availability date (used in workload dashboard)
  availabilityDate: varchar("availability_date"), // ISO date string "YYYY-MM-DD"
});

// Projects table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  contractId: varchar("contract_id"), // References contracts - added separately to avoid circular reference
  contractOptionId: varchar("contract_option_id"), // References contract options for rate/budget tracking
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }), // Link to client record
  name: text("name").notNull(),
  projectNumber: varchar("project_number").notNull().unique(),
  client: text("client"), // Legacy text field for backwards compatibility
  address: text("address"),
  distributionEmails: json("distribution_emails").$type<string[]>().default([]),
  defaultFolderPath: text("default_folder_path"),
  startDate: timestamp("start_date"),
  substantialCompletionDate: timestamp("substantial_completion_date"),
  finalCloseoutDate: timestamp("final_closeout_date"),
  // Project-level budget tracking
  budgetAmount: numeric("budget_amount"), // Total budget for this project (dollar amount)
  budgetedHours: numeric("budgeted_hours"), // Total hours allocated for this project
  baseBudget: numeric("base_budget"), // Pre-billed dollar amount before onboarding
  budgetTrackingMode: budgetTrackingModeEnum("budget_tracking_mode"), // null = inherit from contract
  inheritBillingRates: boolean("inherit_billing_rates").default(true), // true = inherit from contract option, false = use project-specific rates
  scopeOfWork: text("scope_of_work"),
  projectValue: text("project_value"),
  dsaFileNo: varchar("dsa_file_no"), // DSA File Number for school/state projects
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project Billing Rates table - similar to contract option inspectors but for projects
export const projectBillingRates = pgTable("project_billing_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(), // Role/title like "DSA Class 1 Inspector"
  inspectorName: text("inspector_name"), // Optional - name of the inspector
  rate: varchar("rate").notNull(), // Hourly rate
  hours: varchar("hours").notNull(), // Total hours
  scheduleType: varchar("schedule_type").default("fullTime"), // fullTime (8 hrs/day) or partTime (4 hrs/day)
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Base Hours table - for tracking hours used before project was onboarded (per inspector)
export const projectBaseHours = pgTable("project_base_hours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  inspectorName: text("inspector_name").notNull(), // Name of the inspector who worked these hours
  title: text("title"), // Role/title if applicable
  regularHours: varchar("regular_hours").notNull().default("0"), // Regular hours already used
  overtimeHours: varchar("overtime_hours").default("0"), // Overtime hours already used
  billedAmount: varchar("billed_amount"), // Optional: amount already billed for these hours
  notes: text("notes"), // Optional notes about this base hours entry
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Members table (many-to-many: users <-> projects)
export const projectMembers = pgTable("project_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
  // Inspector billing rates for this project (inspector → company)
  regularRate: varchar("regular_rate"), // Hourly rate for regular hours
  overtimeRate: varchar("overtime_rate"), // Hourly rate for overtime hours
  premiumRate: varchar("premium_rate"), // Hourly rate for premium/weekend hours
}, (table) => [
  unique().on(table.projectId, table.userId),
]);

// Trade row type (legacy - kept for backward compatibility)
export const tradeRowSchema = z.object({
  trade: z.string(),
  headcount: z.number().min(0),
});

// Manpower row type (legacy - kept for backward compatibility)
export const manpowerRowSchema = z.object({
  description: z.string(),
  count: z.number().min(0),
});

// Work Activity row type - combines trade/contractor, manpower, and work description
export const workActivityRowSchema = z.object({
  trade: z.string().optional(), // Trade name (e.g., "Iron Workers", "Electricians")
  contractor: z.string(), // Subcontractor name or "GC" for general contractor
  headcount: z.number().min(0),
  workDescription: z.string(),
});

// Equipment row type for structured equipment tracking
export const equipmentRowSchema = z.object({
  equipment: z.string(),
  hours: z.string().optional(),
  status: z.string().optional(), // ACTIVE, STANDBY, IDLE
  usage: z.string().optional(),
});

// Material row type for structured material delivery tracking
export const materialRowSchema = z.object({
  material: z.string(),
  quantity: z.string().optional(),
  status: z.string().optional(), // DELIVERED, DELAYED, ORDERED
  supplierNotes: z.string().optional(),
});

// Visitor row type
export const visitorRowSchema = z.object({
  name: z.string(),
  company: z.string(),
  notes: z.string().optional(),
});

// Daily Reports table
export const dailyReports = pgTable("daily_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id), // Nullable to allow personal/unassigned reports
  customProjectName: text("custom_project_name"), // For unassigned reports - user-entered project name
  inspectorId: varchar("inspector_id").notNull(),
  date: timestamp("date").notNull(),
  weatherType: weatherTypeEnum("weather_type").default("clear"),
  weatherNotes: text("weather_notes"),
  typeOfWork: json("type_of_work").$type<string[]>().default([]),
  workPerformed: text("work_performed"),
  trades: json("trades").$type<z.infer<typeof tradeRowSchema>[]>().default([]),
  manpower: json("manpower").$type<z.infer<typeof manpowerRowSchema>[]>().default([]),
  workActivities: json("work_activities").$type<z.infer<typeof workActivityRowSchema>[]>().default([]),
  visitors: json("visitors").$type<z.infer<typeof visitorRowSchema>[]>().default([]),
  equipment: text("equipment"),
  equipmentRows: json("equipment_rows").$type<z.infer<typeof equipmentRowSchema>[]>().default([]),
  inspections: text("inspections"),
  materialsDelivered: text("materials_delivered"),
  materialRows: json("material_rows").$type<z.infer<typeof materialRowSchema>[]>().default([]),
  issuesFlag: boolean("issues_flag").default(false),
  issuesDetails: text("issues_details"),
  safetyFlag: boolean("safety_flag").default(false),
  safetyDetails: text("safety_details"),
  // Structured safety fields
  safetyIncidents: integer("safety_incidents").default(0),
  safetyNearMisses: integer("safety_near_misses").default(0),
  safetyAttendees: integer("safety_attendees"),
  safetySiteConditions: text("safety_site_conditions"),
  toolboxTalkTopic: text("toolbox_talk_topic"),
  // Split weather conditions
  weatherAM: text("weather_am"),
  weatherPM: text("weather_pm"),
  precipitation: text("precipitation"),
  siteConditions: text("site_conditions"),
  notes: text("notes"),
  // Time tracking fields
  timeIn: varchar("time_in"), // Format: "HH:MM" (24-hour)
  timeOut: varchar("time_out"), // Format: "HH:MM" (24-hour)
  regularHours: varchar("regular_hours"), // Calculated regular hours (decimal)
  otHours: varchar("ot_hours"), // Overtime hours entered manually
  signaturePath: varchar("signature_path"),
  signedAt: timestamp("signed_at"),
  status: reportStatusEnum("status").default("draft"),
  reportNumber: integer("report_number"), // Sequential number assigned when report is submitted
  pdfPath: varchar("pdf_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Photos table
export const photos = pgTable("photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").references(() => dailyReports.id, { onDelete: "cascade" }).notNull(),
  filePath: text("file_path").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Distribution Logs table
export const distributionLogs = pgTable("distribution_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").references(() => dailyReports.id, { onDelete: "cascade" }).notNull(),
  sentTo: text("sent_to"),
  folderPath: text("folder_path"),
  sentAt: timestamp("sent_at").defaultNow(),
  status: distributionStatusEnum("status").default("pending"),
  errorMessage: text("error_message"),
});

// Manual Time Entries table (for inspectors who don't use daily reports)
export const manualTimeEntries = pgTable("manual_time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  inspectorId: varchar("inspector_id").notNull(),
  inspectorName: varchar("inspector_name"), // Name to display on timesheets (overrides profile lookup)
  date: timestamp("date").notNull(),
  regularHours: varchar("regular_hours"), // Decimal string (e.g., "8.00")
  otHours: varchar("ot_hours"), // Overtime hours (e.g., "2.50")
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.projectId, table.inspectorId, table.date),
]);

// App Settings table (for company logo, etc.)
export const appSettings = pgTable("app_settings", {
  key: varchar("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invites table for inviting new users
export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: userRoleEnum("role").default("inspector").notNull(),
  isCompanyAdmin: boolean("is_company_admin").default(false), // True if inviting as company admin (not system admin)
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  projectIds: json("project_ids").$type<string[]>().default([]),
  invitedBy: varchar("invited_by").references(() => users.id).notNull(),
  status: inviteStatusEnum("status").default("pending").notNull(),
  token: varchar("token").notNull().unique(),
  inviteCode: varchar("invite_code", { length: 8 }).unique(),
  isClientPortal: boolean("is_client_portal").default(false),
  clientId: varchar("client_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

// Join request status enum
export const joinRequestStatusEnum = pgEnum("join_request_status", ["pending", "approved", "rejected"]);

// Join Requests table - for users requesting to join existing companies
// Can include a project proposal when inspector creates a project for an unaffiliated company
export const joinRequests = pgTable("join_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  // Optional project details proposed along with the join request
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  proposedProjectName: text("proposed_project_name"),
  proposedProjectNumber: varchar("proposed_project_number"),
  proposedProjectAddress: text("proposed_project_address"),
  proposedProjectClient: text("proposed_project_client"),
  message: text("message"),
  status: joinRequestStatusEnum("status").default("pending").notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.userId, table.companyId),
]);

// Clients table - for tracking clients per company
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  directorOfFacilities: text("director_of_facilities"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Purchase Order status enum
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["active", "closed", "cancelled"]);

// Purchase Orders table - client POs that contracts are billed against
// Hierarchy: Purchase Order → Contract → Project
export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  poNumber: varchar("po_number").notNull(),
  description: text("description"),
  totalAmount: varchar("total_amount"),
  remainingAmount: varchar("remaining_amount"),
  issueDate: timestamp("issue_date"),
  expirationDate: timestamp("expiration_date"),
  status: purchaseOrderStatusEnum("status").default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Contracts table - for tracking construction contracts from bid to closeout
// NOTE: Projects now reference contracts (many projects can be under one contract)
export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  purchaseOrderId: varchar("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  contractNumber: varchar("contract_number").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  contractType: contractTypeEnum("contract_type").default("lump_sum"),
  status: contractStatusEnum("status").default("bid_release").notNull(),
  originalValue: varchar("original_value"),
  currentValue: varchar("current_value"),
  bidReleaseDate: timestamp("bid_release_date"),
  bidDueDate: timestamp("bid_due_date"),
  awardDate: timestamp("award_date"),
  startDate: timestamp("start_date"),
  substantialCompletionDate: timestamp("substantial_completion_date"),
  finalCloseoutDate: timestamp("final_closeout_date"),
  regularRate: varchar("regular_rate"),
  overtimeRate: varchar("overtime_rate"),
  premiumRate: varchar("premium_rate"),
  budgetOverride: varchar("budget_override"),
  budgetedHours: numeric("budgeted_hours"), // Total hours allocated for this contract
  baseBudgetSpent: varchar("base_budget_spent"), // Manual starting point for mid-project onboarding (dollar amount)
  budgetTrackingMode: budgetTrackingModeEnum("budget_tracking_mode").default("daily_reports"), // How budget is calculated
  notes: text("notes"),
  // Extended fields for GPT/bid tracking
  agency: text("agency"),
  serviceType: text("service_type"),
  questionDeadline: timestamp("question_deadline"),
  addendumCount: integer("addendum_count").default(0),
  lastAddendumDate: timestamp("last_addendum_date"),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
  sharepointFolderUrl: text("sharepoint_folder_url"),
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Contract attachments table - for storing files attached to contracts
export const contractAttachments = pgTable("contract_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "cascade" }).notNull(),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Contract options table - each contract can have multiple pricing options (matching proposals structure)
export const contractOptions = pgTable("contract_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "cascade" }).notNull(),
  optionNumber: integer("option_number").notNull(),
  name: text("name"),
  awardStatus: optionAwardStatusEnum("award_status").default("pending"), // For partial awards
  createdAt: timestamp("created_at").defaultNow(),
});

// Contract option inspectors - each option can have multiple inspectors with rates (matching proposals structure)
export const contractOptionInspectors = pgTable("contract_option_inspectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").references(() => contractOptions.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  inspectorName: text("inspector_name"),
  rate: varchar("rate").notNull(),
  hours: varchar("hours").notNull(),
  scheduleType: varchar("schedule_type").default("fullTime"), // fullTime (8 hrs/day) or partTime (4 hrs/day)
  createdAt: timestamp("created_at").defaultNow(),
});

// Contract notification type enum
export const contractNotificationTypeEnum = pgEnum("contract_notification_type", [
  "start_date",
  "substantial_completion",
  "final_closeout",
  "bid_due_date"
]);

// Contract notifications table - tracks sent notifications to prevent duplicates
export const contractNotifications = pgTable("contract_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  notificationType: contractNotificationTypeEnum("notification_type").notNull(),
  daysBefore: integer("days_before").notNull(), // 30, 14, 7, etc.
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  recipientEmails: json("recipient_emails").$type<string[]>().default([]),
}, (table) => [
  // Unique constraint to prevent duplicate notifications for same contract/type/days
  unique().on(table.contractId, table.notificationType, table.daysBefore),
]);

// Budget notifications table - tracks budget milestone alerts to prevent duplicates
export const budgetNotifications = pgTable("budget_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  milestonePercent: integer("milestone_percent").notNull(), // 50, 75, 90, 100
  currentSpend: numeric("current_spend", { precision: 12, scale: 2 }).notNull(),
  budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  recipientEmails: json("recipient_emails").$type<string[]>().default([]),
}, (table) => [
  // Unique constraint to prevent duplicate notifications for same contract/milestone
  unique().on(table.contractId, table.milestonePercent),
]);

// Project budget notifications table
export const projectBudgetNotifications = pgTable("project_budget_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  milestonePercent: integer("milestone_percent").notNull(), // 50, 75, 90, 100
  currentSpend: numeric("current_spend", { precision: 12, scale: 2 }).notNull(),
  budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  recipientEmails: json("recipient_emails").$type<string[]>().default([]),
}, (table) => [
  unique().on(table.projectId, table.milestonePercent),
]);

// Cert expiry notifications — deduplication table to avoid re-sending the same alert
export const certExpiryNotifications = pgTable("cert_expiry_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  inspectorId: varchar("inspector_id").notNull(),       // user ID or team inspector ID
  inspectorType: varchar("inspector_type").notNull(),   // "user" or "team"
  certName: varchar("cert_name").notNull(),
  expiresAt: varchar("expires_at").notNull(),           // ISO date string "YYYY-MM-DD" — full precision
  windowDays: integer("window_days").notNull(),          // 60, 30, 7, 0
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  unique().on(table.inspectorId, table.inspectorType, table.certName, table.expiresAt, table.windowDays),
]);

// Timesheet status enum
export const timesheetStatusEnum = pgEnum("timesheet_status", ["draft", "submitted", "approved"]);

// Timesheets table - tracks monthly timesheets for projects
export const timesheets = pgTable("timesheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  inspectorId: varchar("inspector_id").references(() => users.id).notNull(),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  period1RegularHours: varchar("period1_regular_hours").default("0"),
  period1OvertimeHours: varchar("period1_overtime_hours").default("0"),
  period1PremiumHours: varchar("period1_premium_hours").default("0"),
  period2RegularHours: varchar("period2_regular_hours").default("0"),
  period2OvertimeHours: varchar("period2_overtime_hours").default("0"),
  period2PremiumHours: varchar("period2_premium_hours").default("0"),
  totalRegularHours: varchar("total_regular_hours").default("0"),
  totalOvertimeHours: varchar("total_overtime_hours").default("0"),
  totalPremiumHours: varchar("total_premium_hours").default("0"),
  pdfPath: varchar("pdf_path"),
  status: timesheetStatusEnum("status").default("draft").notNull(),
  districtRepSignature: varchar("district_rep_signature"),
  districtRepSignedAt: timestamp("district_rep_signed_at"),
  estPercentComplete: varchar("est_percent_complete"),
  estCompletionDate: timestamp("est_completion_date"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice status enum
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "overdue", "cancelled"]);

// Invoices table - for billing clients
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  purchaseOrderId: varchar("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  invoiceNumber: varchar("invoice_number").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  regularHours: varchar("regular_hours").default("0"),
  overtimeHours: varchar("overtime_hours").default("0"),
  premiumHours: varchar("premium_hours").default("0"),
  regularRate: varchar("regular_rate"),
  overtimeRate: varchar("overtime_rate"),
  premiumRate: varchar("premium_rate"),
  regularAmount: varchar("regular_amount").default("0"),
  overtimeAmount: varchar("overtime_amount").default("0"),
  premiumAmount: varchar("premium_amount").default("0"),
  subtotal: varchar("subtotal").default("0"),
  taxRate: varchar("tax_rate"),
  taxAmount: varchar("tax_amount"),
  totalAmount: varchar("total_amount").default("0"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  pdfPath: varchar("pdf_path"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Combined monthly reports table - for storing concatenated PDFs
export const monthlyReportBundles = pgTable("monthly_report_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  inspectorId: varchar("inspector_id").references(() => users.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  reportCount: integer("report_count").default(0),
  pdfPath: varchar("pdf_path"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Client Portal - allows external clients to view their project data
export const clientPortalUsers = pgTable("client_portal_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique().on(table.userId, table.companyId),
]);

export const clientPortalProjectAccess = pgTable("client_portal_project_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientPortalUserId: varchar("client_portal_user_id").references(() => clientPortalUsers.id, { onDelete: "cascade" }).notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  grantedAt: timestamp("granted_at").defaultNow(),
}, (table) => [
  unique().on(table.clientPortalUserId, table.projectId),
]);

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  projects: many(projects),
  members: many(companyMembers),
  contracts: many(contracts),
  clients: many(clients),
  purchaseOrders: many(purchaseOrders),
  clientPortalUsers: many(clientPortalUsers),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  company: one(companies, {
    fields: [clients.companyId],
    references: [companies.id],
  }),
  contracts: many(contracts),
  purchaseOrders: many(purchaseOrders),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  company: one(companies, {
    fields: [purchaseOrders.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [purchaseOrders.clientId],
    references: [clients.id],
  }),
  contracts: many(contracts),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  company: one(companies, {
    fields: [contracts.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [contracts.clientId],
    references: [clients.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [contracts.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  projects: many(projects),
  attachments: many(contractAttachments),
  options: many(contractOptions),
}));

export const contractAttachmentsRelations = relations(contractAttachments, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractAttachments.contractId],
    references: [contracts.id],
  }),
}));

export const contractOptionsRelations = relations(contractOptions, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [contractOptions.contractId],
    references: [contracts.id],
  }),
  inspectors: many(contractOptionInspectors),
}));

export const contractOptionInspectorsRelations = relations(contractOptionInspectors, ({ one }) => ({
  option: one(contractOptions, {
    fields: [contractOptionInspectors.optionId],
    references: [contractOptions.id],
  }),
}));

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id],
  }),
}));

export const teamInspectorsRelations = relations(teamInspectors, ({ one }) => ({
  company: one(companies, {
    fields: [teamInspectors.companyId],
    references: [companies.id],
  }),
  linkedUser: one(users, {
    fields: [teamInspectors.linkedUserId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, {
    fields: [projects.companyId],
    references: [companies.id],
  }),
  contract: one(contracts, {
    fields: [projects.contractId],
    references: [contracts.id],
  }),
  dailyReports: many(dailyReports),
  members: many(projectMembers),
  billingRates: many(projectBillingRates),
  baseHours: many(projectBaseHours),
}));

export const projectBillingRatesRelations = relations(projectBillingRates, ({ one }) => ({
  project: one(projects, {
    fields: [projectBillingRates.projectId],
    references: [projects.id],
  }),
}));

export const projectBaseHoursRelations = relations(projectBaseHours, ({ one }) => ({
  project: one(projects, {
    fields: [projectBaseHours.projectId],
    references: [projects.id],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
}));

export const dailyReportsRelations = relations(dailyReports, ({ one, many }) => ({
  project: one(projects, {
    fields: [dailyReports.projectId],
    references: [projects.id],
  }),
  photos: many(photos),
  distributionLogs: many(distributionLogs),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  report: one(dailyReports, {
    fields: [photos.reportId],
    references: [dailyReports.id],
  }),
}));

export const distributionLogsRelations = relations(distributionLogs, ({ one }) => ({
  report: one(dailyReports, {
    fields: [distributionLogs.reportId],
    references: [dailyReports.id],
  }),
}));

// Client Portal Relations
export const clientPortalUsersRelations = relations(clientPortalUsers, ({ one, many }) => ({
  user: one(users, {
    fields: [clientPortalUsers.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [clientPortalUsers.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [clientPortalUsers.clientId],
    references: [clients.id],
  }),
  projectAccess: many(clientPortalProjectAccess),
}));

export const clientPortalProjectAccessRelations = relations(clientPortalProjectAccess, ({ one }) => ({
  clientPortalUser: one(clientPortalUsers, {
    fields: [clientPortalProjectAccess.clientPortalUserId],
    references: [clientPortalUsers.id],
  }),
  project: one(projects, {
    fields: [clientPortalProjectAccess.projectId],
    references: [projects.id],
  }),
}));

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCompanyMemberSchema = createInsertSchema(companyMembers).omit({ id: true, joinedAt: true });
export const insertPendingMemberAssignmentSchema = createInsertSchema(pendingMemberAssignments).omit({ id: true, createdAt: true });
export const insertTeamInspectorSchema = createInsertSchema(teamInspectors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserProfileSchema = createInsertSchema(userProfiles);

export const updateUserProfileSchema = createInsertSchema(userProfiles)
  .pick({
    firstName: true,
    lastName: true,
    phone: true,
    title: true,
    licenseNumber: true,
    licenseState: true,
    certifications: true,
    bio: true,
    education: true,
    references: true,
    jobHistory: true,
    contractorCompanyName: true,
    contractorAddress: true,
    contractorPhone: true,
    contractorEmail: true,
    availabilityDate: true,
  })
  .partial();

export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectBillingRateSchema = createInsertSchema(projectBillingRates).omit({ id: true, createdAt: true });
export const insertProjectBaseHoursSchema = createInsertSchema(projectBaseHours).omit({ id: true, createdAt: true });
export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({ id: true, assignedAt: true });
export const insertDailyReportSchema = createInsertSchema(dailyReports).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPhotoSchema = createInsertSchema(photos).omit({ id: true, createdAt: true });
export const insertDistributionLogSchema = createInsertSchema(distributionLogs).omit({ id: true, sentAt: true });
export const insertManualTimeEntrySchema = createInsertSchema(manualTimeEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppSettingSchema = createInsertSchema(appSettings);
export const insertInviteSchema = createInsertSchema(invites).omit({ id: true, createdAt: true, acceptedAt: true });
export const insertJoinRequestSchema = createInsertSchema(joinRequests).omit({ id: true, createdAt: true, reviewedAt: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractAttachmentSchema = createInsertSchema(contractAttachments).omit({ id: true, createdAt: true });
export const insertContractOptionSchema = createInsertSchema(contractOptions).omit({ id: true, createdAt: true });
export const insertContractOptionInspectorSchema = createInsertSchema(contractOptionInspectors).omit({ id: true, createdAt: true });
export const insertContractNotificationSchema = createInsertSchema(contractNotifications).omit({ id: true, sentAt: true });
export const insertBudgetNotificationSchema = createInsertSchema(budgetNotifications).omit({ id: true, sentAt: true });
export const insertProjectBudgetNotificationSchema = createInsertSchema(projectBudgetNotifications).omit({ id: true, sentAt: true });
export const insertCertExpiryNotificationSchema = createInsertSchema(certExpiryNotifications).omit({ id: true, sentAt: true });
export const insertTimesheetSchema = createInsertSchema(timesheets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMonthlyReportBundleSchema = createInsertSchema(monthlyReportBundles).omit({ id: true, createdAt: true });
export const insertClientPortalUserSchema = createInsertSchema(clientPortalUsers).omit({ id: true, createdAt: true });
export const insertClientPortalProjectAccessSchema = createInsertSchema(clientPortalProjectAccess).omit({ id: true, grantedAt: true });

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type CompanyMember = typeof companyMembers.$inferSelect;
export type InsertCompanyMember = z.infer<typeof insertCompanyMemberSchema>;
export type PendingMemberAssignment = typeof pendingMemberAssignments.$inferSelect;
export type InsertPendingMemberAssignment = z.infer<typeof insertPendingMemberAssignmentSchema>;
export type TeamInspector = typeof teamInspectors.$inferSelect;
export type InsertTeamInspector = z.infer<typeof insertTeamInspectorSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectBillingRate = typeof projectBillingRates.$inferSelect;
export type InsertProjectBillingRate = z.infer<typeof insertProjectBillingRateSchema>;
export type ProjectBaseHours = typeof projectBaseHours.$inferSelect;
export type InsertProjectBaseHours = z.infer<typeof insertProjectBaseHoursSchema>;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;
export type DistributionLog = typeof distributionLogs.$inferSelect;
export type InsertDistributionLog = z.infer<typeof insertDistributionLogSchema>;
export type ManualTimeEntry = typeof manualTimeEntries.$inferSelect;
export type InsertManualTimeEntry = z.infer<typeof insertManualTimeEntrySchema>;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type Invite = typeof invites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type JoinRequest = typeof joinRequests.$inferSelect;
export type InsertJoinRequest = z.infer<typeof insertJoinRequestSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;
export type ContractAttachment = typeof contractAttachments.$inferSelect;
export type InsertContractAttachment = z.infer<typeof insertContractAttachmentSchema>;
export type ContractOption = typeof contractOptions.$inferSelect;
export type InsertContractOption = z.infer<typeof insertContractOptionSchema>;
export type ContractOptionInspector = typeof contractOptionInspectors.$inferSelect;
export type InsertContractOptionInspector = z.infer<typeof insertContractOptionInspectorSchema>;
export type ContractNotification = typeof contractNotifications.$inferSelect;
export type InsertContractNotification = z.infer<typeof insertContractNotificationSchema>;
export type BudgetNotification = typeof budgetNotifications.$inferSelect;
export type InsertBudgetNotification = z.infer<typeof insertBudgetNotificationSchema>;
export type ProjectBudgetNotification = typeof projectBudgetNotifications.$inferSelect;
export type InsertProjectBudgetNotification = z.infer<typeof insertProjectBudgetNotificationSchema>;
export type CertExpiryNotification = typeof certExpiryNotifications.$inferSelect;
export type InsertCertExpiryNotification = z.infer<typeof insertCertExpiryNotificationSchema>;
export type Timesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type MonthlyReportBundle = typeof monthlyReportBundles.$inferSelect;
export type InsertMonthlyReportBundle = z.infer<typeof insertMonthlyReportBundleSchema>;
export type ClientPortalUser = typeof clientPortalUsers.$inferSelect;
export type InsertClientPortalUser = z.infer<typeof insertClientPortalUserSchema>;
export type ClientPortalProjectAccess = typeof clientPortalProjectAccess.$inferSelect;
export type InsertClientPortalProjectAccess = z.infer<typeof insertClientPortalProjectAccessSchema>;

// Contract with related projects, client, and attachments
// Note: contracts can have multiple projects
export type ContractOptionWithInspectors = ContractOption & {
  inspectors?: ContractOptionInspector[];
};

export type ContractWithProjects = Contract & {
  projects?: Project[];
  client?: Client;
  purchaseOrder?: PurchaseOrder;
  attachments?: ContractAttachment[];
  options?: ContractOptionWithInspectors[];
};

// Legacy type for backwards compatibility
export type ContractWithProject = ContractWithProjects;

// Purchase order with client and contracts
export type PurchaseOrderWithClient = PurchaseOrder & {
  client?: Client;
  contracts?: Contract[];
};

// Project with related contract
export type ProjectWithContract = Project & {
  contract?: Contract;
  company?: Company;
};

// Invoice with related data
export type InvoiceWithDetails = Invoice & {
  project?: Project;
  contract?: Contract;
  client?: Client;
  purchaseOrder?: PurchaseOrder;
};

// Extended types for frontend
export type TradeRow = z.infer<typeof tradeRowSchema>;
export type ManpowerRow = z.infer<typeof manpowerRowSchema>;
export type WorkActivityRow = z.infer<typeof workActivityRowSchema>;
export type EquipmentRow = z.infer<typeof equipmentRowSchema>;
export type MaterialRow = z.infer<typeof materialRowSchema>;
export type VisitorRow = z.infer<typeof visitorRowSchema>;

export type DailyReportWithDetails = DailyReport & {
  project?: Project;
  photos?: Photo[];
  inspectorName?: string;
};

// Proposal status enum
export const proposalStatusEnum = pgEnum("proposal_status", ["draft", "sent", "accepted", "declined", "expired"]);

// Proposals table - for quick proposal generation
export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  proposalNumber: varchar("proposal_number").notNull(),
  clientName: text("client_name").notNull(),
  projectName: text("project_name").notNull(),
  projectManager: text("project_manager"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  totalHours: varchar("total_hours"),
  scheduleType: varchar("schedule_type").default("fullTime"),
  rateEscalationNote: text("rate_escalation_note"),
  terms: text("terms"),
  status: proposalStatusEnum("status").default("draft").notNull(),
  sentDate: timestamp("sent_date"),
  acceptedDate: timestamp("accepted_date"),
  pdfPath: varchar("pdf_path"),
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Proposal options - each proposal can have multiple pricing options
export const proposalOptions = pgTable("proposal_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").references(() => proposals.id, { onDelete: "cascade" }).notNull(),
  optionNumber: integer("option_number").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Proposal option inspectors - each option can have multiple inspectors with rates/hours
export const proposalOptionInspectors = pgTable("proposal_option_inspectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").references(() => proposalOptions.id, { onDelete: "cascade" }).notNull(),
  teamInspectorId: varchar("team_inspector_id").references(() => teamInspectors.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  inspectorName: text("inspector_name"),
  rate: varchar("rate").notNull(),
  hours: varchar("hours").notNull(),
  scheduleType: varchar("schedule_type").default("fullTime"), // fullTime (8 hrs/day) or partTime (4 hrs/day)
  createdAt: timestamp("created_at").defaultNow(),
});

// Proposal relations
export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  company: one(companies, {
    fields: [proposals.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [proposals.clientId],
    references: [clients.id],
  }),
  contract: one(contracts, {
    fields: [proposals.contractId],
    references: [contracts.id],
  }),
  project: one(projects, {
    fields: [proposals.projectId],
    references: [projects.id],
  }),
  options: many(proposalOptions),
}));

export const proposalOptionsRelations = relations(proposalOptions, ({ one, many }) => ({
  proposal: one(proposals, {
    fields: [proposalOptions.proposalId],
    references: [proposals.id],
  }),
  inspectors: many(proposalOptionInspectors),
}));

export const proposalOptionInspectorsRelations = relations(proposalOptionInspectors, ({ one }) => ({
  option: one(proposalOptions, {
    fields: [proposalOptionInspectors.optionId],
    references: [proposalOptions.id],
  }),
  teamInspector: one(teamInspectors, {
    fields: [proposalOptionInspectors.teamInspectorId],
    references: [teamInspectors.id],
  }),
}));

// Proposal insert schemas
export const insertProposalSchema = createInsertSchema(proposals).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProposalOptionSchema = createInsertSchema(proposalOptions).omit({ id: true, createdAt: true });
export const insertProposalOptionInspectorSchema = createInsertSchema(proposalOptionInspectors).omit({ id: true, createdAt: true });

// Proposal types
export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type ProposalOption = typeof proposalOptions.$inferSelect;
export type InsertProposalOption = z.infer<typeof insertProposalOptionSchema>;
export type ProposalOptionInspector = typeof proposalOptionInspectors.$inferSelect;
export type InsertProposalOptionInspector = z.infer<typeof insertProposalOptionInspectorSchema>;

// Extended proposal type with nested options and inspectors
export type ProposalOptionWithInspectors = ProposalOption & {
  inspectors: ProposalOptionInspector[];
};

export type ProposalWithDetails = Proposal & {
  options: ProposalOptionWithInspectors[];
  client?: Client;
};

// Chat tables are now in ./models/chat.ts and re-exported above

// IOR (Inspector of Record) Agreements - sets terms for inspector pay
// Can be linked to Team Members (inspectors), Projects, and Contracts
export const iorAgreements = pgTable("ior_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  inspectorId: varchar("inspector_id").references(() => users.id).notNull(),
  agreementNumber: varchar("agreement_number"),
  agreementDate: varchar("agreement_date"),
  clientName: text("client_name"),
  consultantName: text("consultant_name"),
  agentName: text("agent_name"),
  projectLocation: text("project_location"),
  dsaAppNumber: varchar("dsa_app_number"),
  rate: varchar("rate"),
  terms: text("terms"),
  pdfPath: varchar("pdf_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const iorAgreementsRelations = relations(iorAgreements, ({ one }) => ({
  company: one(companies, {
    fields: [iorAgreements.companyId],
    references: [companies.id],
  }),
  contract: one(contracts, {
    fields: [iorAgreements.contractId],
    references: [contracts.id],
  }),
  project: one(projects, {
    fields: [iorAgreements.projectId],
    references: [projects.id],
  }),
  inspector: one(users, {
    fields: [iorAgreements.inspectorId],
    references: [users.id],
  }),
}));

export const insertIorAgreementSchema = createInsertSchema(iorAgreements).omit({ id: true, createdAt: true, updatedAt: true });

export type IorAgreement = typeof iorAgreements.$inferSelect;
export type InsertIorAgreement = z.infer<typeof insertIorAgreementSchema>;

export type IorAgreementWithDetails = IorAgreement & {
  contract?: Contract;
  project?: Project;
  inspector?: User;
};

// Project comments table - for team communication on projects
export const projectComments = pgTable("project_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  authorId: varchar("author_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  mentions: json("mentions").$type<string[]>().default([]), // Array of user IDs mentioned
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectCommentsRelations = relations(projectComments, ({ one }) => ({
  project: one(projects, {
    fields: [projectComments.projectId],
    references: [projects.id],
  }),
  company: one(companies, {
    fields: [projectComments.companyId],
    references: [companies.id],
  }),
  author: one(users, {
    fields: [projectComments.authorId],
    references: [users.id],
  }),
}));

export const insertProjectCommentSchema = createInsertSchema(projectComments).omit({ id: true, createdAt: true, updatedAt: true });

export type ProjectComment = typeof projectComments.$inferSelect;
export type InsertProjectComment = z.infer<typeof insertProjectCommentSchema>;

export type ProjectCommentWithAuthor = ProjectComment & {
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
};

// Meeting type enum
export const meetingTypeEnum = pgEnum("meeting_type", [
  "progress",
  "safety",
  "coordination",
  "oac",
  "pre_construction",
  "other"
]);

// Meeting status enum
export const meetingStatusEnum = pgEnum("meeting_status", [
  "draft",
  "approved",
  "distributed"
]);

// Meetings table
export const meetings = pgTable("meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  meetingNumber: varchar("meeting_number").notNull(),
  meetingType: meetingTypeEnum("meeting_type").notNull(),
  meetingDate: varchar("meeting_date").notNull(),
  startTime: varchar("start_time"),
  endTime: varchar("end_time"),
  location: text("location"),
  preparedBy: text("prepared_by"),
  attendees: text("attendees"),
  absentees: text("absentees"),
  agenda: text("agenda"),
  discussionItems: text("discussion_items"),
  decisions: text("decisions"),
  nextMeetingDate: varchar("next_meeting_date"),
  notes: text("notes"),
  meetingStatus: meetingStatusEnum("meeting_status").default("draft").notNull(),
  previousMeetingId: varchar("previous_meeting_id"),
  seriesId: varchar("series_id"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  distributedAt: timestamp("distributed_at"),
  audioFileKey: varchar("audio_file_key"),
  transcription: text("transcription"),
  aiSummary: text("ai_summary"),
  aiActionItems: text("ai_action_items"),
  aiDecisions: text("ai_decisions"),
  aiKeyPoints: text("ai_key_points"),
  aiGenerationStatus: varchar("ai_generation_status"),
  aiGeneratedAt: timestamp("ai_generated_at"),
  pdfPath: varchar("pdf_path"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const meetingsRelations = relations(meetings, ({ one }) => ({
  project: one(projects, {
    fields: [meetings.projectId],
    references: [projects.id],
  }),
  company: one(companies, {
    fields: [meetings.companyId],
    references: [companies.id],
  }),
  creator: one(users, {
    fields: [meetings.createdBy],
    references: [users.id],
  }),
}));

// Dismissed Alerts table - tracks which dashboard alerts a user has dismissed
export const dismissedAlerts = pgTable("dismissed_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  alertId: varchar("alert_id").notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  dismissedAt: timestamp("dismissed_at").defaultNow(),
}, (table) => ({
  uniqueUserAlert: unique().on(table.userId, table.alertId, table.companyId),
}));

export type DismissedAlert = typeof dismissedAlerts.$inferSelect;

// Company Notes - company-level comments/notes on the dashboard
export const companyNotes = pgTable("company_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  authorId: varchar("author_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  mentions: json("mentions").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companyNotesRelations = relations(companyNotes, ({ one }) => ({
  company: one(companies, {
    fields: [companyNotes.companyId],
    references: [companies.id],
  }),
  author: one(users, {
    fields: [companyNotes.authorId],
    references: [users.id],
  }),
}));

export const insertCompanyNoteSchema = createInsertSchema(companyNotes).omit({ id: true, createdAt: true, updatedAt: true });

export type CompanyNote = typeof companyNotes.$inferSelect;
export type InsertCompanyNote = z.infer<typeof insertCompanyNoteSchema>;

export type CompanyNoteWithAuthor = CompanyNote & {
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profileImageUrl: string | null;
  };
};

export const insertMeetingSchema = createInsertSchema(meetings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  distributedAt: true,
  aiGeneratedAt: true,
});

export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;

// API Keys table — for Custom GPT Actions integration
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  createdByUserId: varchar("created_by_user_id").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, lastUsedAt: true });
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export const recruitingStatusEnum = pgEnum("recruiting_status", [
  "prospect",
  "contacted",
  "interested",
  "not_available",
  "not_interested",
  "hired",
  "responded"
]);

export const inspectorCandidates = pgTable("inspector_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  dsaInspectorId: varchar("dsa_inspector_id"),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  certNumber: varchar("cert_number"),
  certExpDate: varchar("cert_exp_date"),
  county: varchar("county"),
  phone: varchar("phone"),
  class1: boolean("class_1").default(false),
  class2: boolean("class_2").default(false),
  class3: boolean("class_3").default(false),
  status: recruitingStatusEnum("status").default("prospect").notNull(),
  notes: text("notes"),
  lastContactDate: timestamp("last_contact_date"),
  availableBy: timestamp("available_by"),
  timeBase: varchar("time_base"),
  availabilityEmail: varchar("availability_email"),
  availabilityPhone: varchar("availability_phone"),
  availabilityCounties: json("availability_counties").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.dsaInspectorId),
]);

export const inspectorCandidateNotes = pgTable("inspector_candidate_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => inspectorCandidates.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInspectorCandidateSchema = createInsertSchema(inspectorCandidates).omit({ id: true, createdAt: true, updatedAt: true });
export type InspectorCandidate = typeof inspectorCandidates.$inferSelect;
export type InsertInspectorCandidate = z.infer<typeof insertInspectorCandidateSchema>;

export const insertInspectorCandidateNoteSchema = createInsertSchema(inspectorCandidateNotes).omit({ id: true, createdAt: true });
export type InspectorCandidateNote = typeof inspectorCandidateNotes.$inferSelect;
export type InsertInspectorCandidateNote = z.infer<typeof insertInspectorCandidateNoteSchema>;

