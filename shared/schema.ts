import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, json, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";
import { users } from "./models/auth";

// Enums
export const userRoleEnum = pgEnum("user_role", ["inspector", "admin", "owner"]);
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
  "other"
]);

// Companies table
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  phone: varchar("phone"),
  email: varchar("email"),
  logoPath: varchar("logo_path"),
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
  certifications: json("certifications").$type<string[]>().default([]),
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
});

// Projects table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  projectNumber: varchar("project_number").notNull().unique(),
  client: text("client"),
  address: text("address"),
  distributionEmails: json("distribution_emails").$type<string[]>().default([]),
  defaultFolderPath: text("default_folder_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project Members table (many-to-many: users <-> projects)
export const projectMembers = pgTable("project_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
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
  contractor: z.string(), // Subcontractor name or "GC" for general contractor
  headcount: z.number().min(0),
  workDescription: z.string(),
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
  inspections: text("inspections"),
  materialsDelivered: text("materials_delivered"),
  issuesFlag: boolean("issues_flag").default(false),
  issuesDetails: text("issues_details"),
  safetyFlag: boolean("safety_flag").default(false),
  safetyDetails: text("safety_details"),
  notes: text("notes"),
  // Time tracking fields
  timeIn: varchar("time_in"), // Format: "HH:MM" (24-hour)
  lunchStart: varchar("lunch_start"), // Format: "HH:MM" (24-hour)
  lunchEnd: varchar("lunch_end"), // Format: "HH:MM" (24-hour)
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
  role: userRoleEnum("role").default("inspector").notNull(),
  isCompanyAdmin: boolean("is_company_admin").default(false), // True if inviting as company admin (not system admin)
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  projectIds: json("project_ids").$type<string[]>().default([]),
  invitedBy: varchar("invited_by").references(() => users.id).notNull(),
  status: inviteStatusEnum("status").default("pending").notNull(),
  token: varchar("token").notNull().unique(),
  inviteCode: varchar("invite_code", { length: 8 }).unique(), // Short alphanumeric code for manual entry
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

// Join request status enum
export const joinRequestStatusEnum = pgEnum("join_request_status", ["pending", "approved", "rejected"]);

// Join Requests table - for users requesting to join existing companies
export const joinRequests = pgTable("join_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
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
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Contracts table - for tracking construction contracts from bid to closeout
export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
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
  notes: text("notes"),
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

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  projects: many(projects),
  members: many(companyMembers),
  contracts: many(contracts),
  clients: many(clients),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  company: one(companies, {
    fields: [clients.companyId],
    references: [companies.id],
  }),
  contracts: many(contracts),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  company: one(companies, {
    fields: [contracts.companyId],
    references: [companies.id],
  }),
  project: one(projects, {
    fields: [contracts.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [contracts.clientId],
    references: [clients.id],
  }),
  attachments: many(contractAttachments),
}));

export const contractAttachmentsRelations = relations(contractAttachments, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractAttachments.contractId],
    references: [contracts.id],
  }),
}));

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, {
    fields: [projects.companyId],
    references: [companies.id],
  }),
  dailyReports: many(dailyReports),
  members: many(projectMembers),
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

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCompanyMemberSchema = createInsertSchema(companyMembers).omit({ id: true, joinedAt: true });
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
    contractorCompanyName: true,
    contractorAddress: true,
    contractorPhone: true,
    contractorEmail: true,
  })
  .partial();

export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({ id: true, assignedAt: true });
export const insertDailyReportSchema = createInsertSchema(dailyReports).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPhotoSchema = createInsertSchema(photos).omit({ id: true, createdAt: true });
export const insertDistributionLogSchema = createInsertSchema(distributionLogs).omit({ id: true, sentAt: true });
export const insertAppSettingSchema = createInsertSchema(appSettings);
export const insertInviteSchema = createInsertSchema(invites).omit({ id: true, createdAt: true, acceptedAt: true });
export const insertJoinRequestSchema = createInsertSchema(joinRequests).omit({ id: true, createdAt: true, reviewedAt: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractAttachmentSchema = createInsertSchema(contractAttachments).omit({ id: true, createdAt: true });

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type CompanyMember = typeof companyMembers.$inferSelect;
export type InsertCompanyMember = z.infer<typeof insertCompanyMemberSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;
export type DistributionLog = typeof distributionLogs.$inferSelect;
export type InsertDistributionLog = z.infer<typeof insertDistributionLogSchema>;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type Invite = typeof invites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type JoinRequest = typeof joinRequests.$inferSelect;
export type InsertJoinRequest = z.infer<typeof insertJoinRequestSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;
export type ContractAttachment = typeof contractAttachments.$inferSelect;
export type InsertContractAttachment = z.infer<typeof insertContractAttachmentSchema>;

// Contract with related project, client, and attachments
export type ContractWithProject = Contract & {
  project?: Project;
  client?: Client;
  attachments?: ContractAttachment[];
};

// Extended types for frontend
export type TradeRow = z.infer<typeof tradeRowSchema>;
export type ManpowerRow = z.infer<typeof manpowerRowSchema>;
export type WorkActivityRow = z.infer<typeof workActivityRowSchema>;
export type VisitorRow = z.infer<typeof visitorRowSchema>;

export type DailyReportWithDetails = DailyReport & {
  project?: Project;
  photos?: Photo[];
  inspectorName?: string;
};

// Chat tables for AI integrations
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Invoices table for tracking generated invoices
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: integer("invoice_number").notNull().unique(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  generatedById: varchar("generated_by_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  regularHours: varchar("regular_hours"),
  otHours: varchar("ot_hours"),
  totalHours: varchar("total_hours"),
  reportCount: integer("report_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
