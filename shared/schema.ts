import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, json, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";
import { users } from "./models/auth";

// Enums
export const userRoleEnum = pgEnum("user_role", ["inspector", "admin"]);
export const weatherTypeEnum = pgEnum("weather_type", ["clear", "cloudy", "rain", "wind", "heat", "cold"]);
export const reportStatusEnum = pgEnum("report_status", ["draft", "submitted"]);
export const distributionStatusEnum = pgEnum("distribution_status", ["pending", "sent", "failed"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "expired"]);

// Companies table
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  phone: varchar("phone"),
  email: varchar("email"),
  logoPath: varchar("logo_path"),
  createdById: varchar("created_by_id"),
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
  phone: varchar("phone"),
  company: varchar("company"),
  activeCompanyId: varchar("active_company_id").references(() => companies.id),
  activeProjectId: varchar("active_project_id"),
  // Inspector profile fields
  title: varchar("title"),
  licenseNumber: varchar("license_number"),
  licenseState: varchar("license_state"),
  certifications: json("certifications").$type<string[]>().default([]),
  emergencyContact: varchar("emergency_contact"),
  emergencyPhone: varchar("emergency_phone"),
});

// Projects table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  projectNumber: varchar("project_number").notNull().unique(),
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
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  inspectorId: varchar("inspector_id").notNull(),
  date: timestamp("date").notNull(),
  weatherType: weatherTypeEnum("weather_type").default("clear"),
  weatherNotes: text("weather_notes"),
  workPerformed: text("work_performed"),
  trades: json("trades").$type<z.infer<typeof tradeRowSchema>[]>().default([]),
  manpower: json("manpower").$type<z.infer<typeof manpowerRowSchema>[]>().default([]),
  workActivities: json("work_activities").$type<z.infer<typeof workActivityRowSchema>[]>().default([]),
  visitors: json("visitors").$type<z.infer<typeof visitorRowSchema>[]>().default([]),
  issuesFlag: boolean("issues_flag").default(false),
  issuesDetails: text("issues_details"),
  safetyFlag: boolean("safety_flag").default(false),
  safetyDetails: text("safety_details"),
  notes: text("notes"),
  signaturePath: varchar("signature_path"),
  signedAt: timestamp("signed_at"),
  status: reportStatusEnum("status").default("draft"),
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
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  projectIds: json("project_ids").$type<string[]>().default([]),
  invitedBy: varchar("invited_by").references(() => users.id).notNull(),
  status: inviteStatusEnum("status").default("pending").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  projects: many(projects),
  members: many(companyMembers),
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
    phone: true,
    title: true,
    licenseNumber: true,
    licenseState: true,
    certifications: true,
    emergencyContact: true,
    emergencyPhone: true,
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
