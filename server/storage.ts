import { 
  projects, dailyReports, photos, distributionLogs, appSettings, userProfiles, projectMembers, invites,
  companies, companyMembers, joinRequests, invoices,
  type Project, type InsertProject,
  type DailyReport, type InsertDailyReport,
  type Photo, type InsertPhoto,
  type DistributionLog, type InsertDistributionLog,
  type AppSetting, type InsertAppSetting,
  type UserProfile, type InsertUserProfile,
  type ProjectMember, type InsertProjectMember,
  type Invite, type InsertInvite,
  type Company, type InsertCompany,
  type CompanyMember, type InsertCompanyMember,
  type JoinRequest, type InsertJoinRequest,
  type DailyReportWithDetails,
  type Invoice,
} from "@shared/schema";
import { users, type User } from "@shared/models/auth";
import { db } from "./db";
import { eq, desc, and, or, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  getProjectByNumber(projectNumber: string): Promise<Project | undefined>;
  getProjectByNumberAndCompany(projectNumber: string, companyId: string): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Daily Reports
  getReports(options?: { inspectorId?: string; companyId?: string; companyIds?: string[] }): Promise<DailyReportWithDetails[]>;
  getReport(id: string): Promise<DailyReportWithDetails | undefined>;
  createReport(data: InsertDailyReport): Promise<DailyReport>;
  updateReport(id: string, data: Partial<InsertDailyReport>): Promise<DailyReport | undefined>;
  deleteReport(id: string): Promise<boolean>;
  getReportStats(options?: { inspectorId?: string; companyId?: string; companyIds?: string[] }): Promise<{ total: number; drafts: number; submitted: number }>;

  // Photos
  getPhotosByReport(reportId: string): Promise<Photo[]>;
  getPhoto(id: string): Promise<Photo | undefined>;
  getPhotoByPath(filePath: string): Promise<Photo | undefined>;
  createPhoto(data: InsertPhoto): Promise<Photo>;
  updatePhotoCaption(id: string, caption: string): Promise<Photo | undefined>;
  deletePhoto(id: string): Promise<boolean>;

  // Distribution Logs
  getDistributionLogs(reportId: string): Promise<DistributionLog[]>;
  createDistributionLog(data: InsertDistributionLog): Promise<DistributionLog>;
  updateDistributionLogStatus(id: string, status: string): Promise<void>;

  // App Settings
  getSettings(): Promise<AppSetting[]>;
  getSetting(key: string): Promise<AppSetting | undefined>;
  setSetting(key: string, value: string): Promise<AppSetting>;

  // User Profiles
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createOrUpdateUserProfile(data: InsertUserProfile): Promise<UserProfile>;
  
  // Users (admin)
  getAllUsers(): Promise<(User & { profile?: UserProfile })[]>;
  updateUserRole(userId: string, role: "inspector" | "admin"): Promise<UserProfile | undefined>;

  // Project Members
  getProjectMembers(projectId: string): Promise<(ProjectMember & { user?: User })[]>;
  getProjectsForUser(userId: string): Promise<string[]>;
  getAllProjectsForUser(userId: string): Promise<Project[]>;
  addProjectMember(projectId: string, userId: string): Promise<ProjectMember>;
  removeProjectMember(projectId: string, userId: string): Promise<boolean>;
  isUserMemberOfProject(projectId: string, userId: string): Promise<boolean>;

  // Invites
  getInvites(): Promise<(Invite & { invitedByUser?: User; projects?: Project[] })[]>;
  getInviteByToken(token: string): Promise<Invite | undefined>;
  getInviteByEmail(email: string): Promise<Invite | undefined>;
  createInvite(data: InsertInvite): Promise<Invite>;
  updateInviteStatus(id: string, status: "pending" | "accepted" | "expired"): Promise<Invite | undefined>;
  deleteInvite(id: string): Promise<boolean>;

  // Join Requests
  getJoinRequest(id: string): Promise<JoinRequest | undefined>;
  getJoinRequestByUserAndCompany(userId: string, companyId: string): Promise<JoinRequest | undefined>;
  getJoinRequestsForCompany(companyId: string): Promise<(JoinRequest & { user?: User })[]>;
  getJoinRequestsForUser(userId: string): Promise<(JoinRequest & { company?: Company })[]>;
  createJoinRequest(data: InsertJoinRequest): Promise<JoinRequest>;
  updateJoinRequestStatus(id: string, status: "pending" | "approved" | "rejected", reviewedBy: string): Promise<JoinRequest | undefined>;
  deleteJoinRequest(id: string): Promise<boolean>;

  // Companies
  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(data: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;

  // Company Members
  getCompanyMembers(companyId: string): Promise<(CompanyMember & { user?: User })[]>;
  getCompanyMember(companyId: string, userId: string): Promise<CompanyMember | undefined>;
  getCompaniesForUser(userId: string): Promise<(CompanyMember & { company?: Company })[]>;
  addCompanyMember(companyId: string, userId: string, role: "inspector" | "admin"): Promise<CompanyMember>;
  updateCompanyMemberRole(companyId: string, userId: string, role: "inspector" | "admin"): Promise<CompanyMember | undefined>;
  removeCompanyMember(companyId: string, userId: string): Promise<boolean>;
  isUserMemberOfCompany(companyId: string, userId: string): Promise<boolean>;

  // Active Company
  setActiveCompany(userId: string, companyId: string | null): Promise<UserProfile | undefined>;
  getProjectsByCompany(companyId: string): Promise<Project[]>;
  clearActiveCompanyForCompany(companyId: string): Promise<void>;

  // Active Project
  setActiveProject(userId: string, projectId: string | null): Promise<UserProfile | undefined>;
  getProjectsForUserInCompany(userId: string, companyId: string): Promise<Project[]>;
  clearActiveProjectForProject(projectId: string): Promise<void>;

  // Reports by project (for cascade checks)
  getReportsByProject(projectId: string): Promise<DailyReport[]>;
  
  // Reports for invoice (within date range)
  getReportsForInvoice(projectId: string, startDate: Date, endDate: Date): Promise<DailyReport[]>;
  
  // Get user by ID
  getUserById(userId: string): Promise<User | undefined>;
  deleteUser(userId: string): Promise<boolean>;

  // Invoices
  getNextInvoiceNumber(): Promise<number>;
  createInvoice(data: {
    invoiceNumber: number;
    projectId: string;
    generatedById: string;
    startDate: Date;
    endDate: Date;
    regularHours: string;
    otHours: string;
    totalHours: string;
    reportCount: number;
  }): Promise<{ id: string; invoiceNumber: number }>;
}

export class DatabaseStorage implements IStorage {
  // Projects
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectByNumber(projectNumber: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.projectNumber, projectNumber));
    return project;
  }

  async getProjectByNumberAndCompany(projectNumber: string, companyId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.projectNumber, projectNumber),
        eq(projects.companyId, companyId)
      )
    );
    return project;
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [project] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id));
    return true;
  }

  // Daily Reports
  async getReports(options?: { inspectorId?: string; companyId?: string; companyIds?: string[] }): Promise<DailyReportWithDetails[]> {
    const { inspectorId, companyId, companyIds } = options || {};
    
    // Build conditions array
    const conditions = [];
    if (inspectorId && companyIds && companyIds.length > 0) {
      // Special case: inspector OR company admin (used for combined access)
      conditions.push(
        or(
          eq(dailyReports.inspectorId, inspectorId),
          inArray(projects.companyId, companyIds)
        )
      );
    } else {
      if (inspectorId) {
        conditions.push(eq(dailyReports.inspectorId, inspectorId));
      }
      if (companyId) {
        conditions.push(eq(projects.companyId, companyId));
      }
      if (companyIds && companyIds.length > 0) {
        conditions.push(inArray(projects.companyId, companyIds));
      }
    }
    
    const results = await db
      .select()
      .from(dailyReports)
      .leftJoin(projects, eq(dailyReports.projectId, projects.id))
      .leftJoin(users, eq(dailyReports.inspectorId, users.id))
      .leftJoin(userProfiles, eq(dailyReports.inspectorId, userProfiles.userId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dailyReports.createdAt));

    return results.map(row => {
      // Prefer profile name, fall back to auth user name, then email
      const profileFirst = row.user_profiles?.firstName;
      const profileLast = row.user_profiles?.lastName;
      const authFirst = row.users?.firstName;
      const authLast = row.users?.lastName;
      
      const firstName = profileFirst || authFirst || '';
      const lastName = profileLast || authLast || '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      return {
        ...row.daily_reports,
        project: row.projects || undefined,
        inspectorName: fullName || row.users?.email || undefined,
      };
    });
  }

  async getReport(id: string): Promise<DailyReportWithDetails | undefined> {
    const [result] = await db
      .select()
      .from(dailyReports)
      .leftJoin(projects, eq(dailyReports.projectId, projects.id))
      .leftJoin(users, eq(dailyReports.inspectorId, users.id))
      .leftJoin(userProfiles, eq(dailyReports.inspectorId, userProfiles.userId))
      .where(eq(dailyReports.id, id));

    if (!result) return undefined;

    const reportPhotos = await this.getPhotosByReport(id);

    // Prefer profile name, fall back to auth user name, then email
    const profileFirst = result.user_profiles?.firstName;
    const profileLast = result.user_profiles?.lastName;
    const authFirst = result.users?.firstName;
    const authLast = result.users?.lastName;
    
    const firstName = profileFirst || authFirst || '';
    const lastName = profileLast || authLast || '';
    const fullName = `${firstName} ${lastName}`.trim();

    return {
      ...result.daily_reports,
      project: result.projects || undefined,
      photos: reportPhotos,
      inspectorName: fullName || result.users?.email || undefined,
    };
  }

  async createReport(data: InsertDailyReport): Promise<DailyReport> {
    const [report] = await db.insert(dailyReports).values(data).returning();
    return report;
  }

  async updateReport(id: string, data: Partial<InsertDailyReport>): Promise<DailyReport | undefined> {
    const [report] = await db
      .update(dailyReports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dailyReports.id, id))
      .returning();
    return report;
  }

  async deleteReport(id: string): Promise<boolean> {
    await db.delete(dailyReports).where(eq(dailyReports.id, id));
    return true;
  }

  async getReportStats(options?: { inspectorId?: string; companyId?: string; companyIds?: string[] }): Promise<{ total: number; drafts: number; submitted: number }> {
    const { inspectorId, companyId, companyIds } = options || {};
    
    // Build conditions array
    const conditions = [];
    const needsProjectJoin = companyId || (companyIds && companyIds.length > 0);
    
    if (inspectorId && companyIds && companyIds.length > 0) {
      // Special case: inspector OR company admin (used for combined access)
      conditions.push(
        or(
          eq(dailyReports.inspectorId, inspectorId),
          inArray(projects.companyId, companyIds)
        )
      );
    } else {
      if (inspectorId) {
        conditions.push(eq(dailyReports.inspectorId, inspectorId));
      }
      if (companyId) {
        conditions.push(eq(projects.companyId, companyId));
      }
      if (companyIds && companyIds.length > 0) {
        conditions.push(inArray(projects.companyId, companyIds));
      }
    }
    
    const query = db
      .select({
        total: sql<number>`count(*)::int`,
        drafts: sql<number>`count(*) filter (where ${dailyReports.status} = 'draft')::int`,
        submitted: sql<number>`count(*) filter (where ${dailyReports.status} = 'submitted')::int`,
      })
      .from(dailyReports);
    
    // Only join projects if we need to filter by company
    if (needsProjectJoin) {
      query.leftJoin(projects, eq(dailyReports.projectId, projects.id));
    }
    
    const [stats] = await query.where(conditions.length > 0 ? and(...conditions) : undefined);

    return stats || { total: 0, drafts: 0, submitted: 0 };
  }

  // Photos
  async getPhotosByReport(reportId: string): Promise<Photo[]> {
    return db.select().from(photos).where(eq(photos.reportId, reportId)).orderBy(photos.createdAt);
  }

  async getPhoto(id: string): Promise<Photo | undefined> {
    const [photo] = await db.select().from(photos).where(eq(photos.id, id));
    return photo;
  }

  async getPhotoByPath(filePath: string): Promise<Photo | undefined> {
    const [photo] = await db.select().from(photos).where(eq(photos.filePath, filePath));
    return photo;
  }

  async createPhoto(data: InsertPhoto): Promise<Photo> {
    const [photo] = await db.insert(photos).values(data).returning();
    return photo;
  }

  async updatePhotoCaption(id: string, caption: string): Promise<Photo | undefined> {
    const [photo] = await db
      .update(photos)
      .set({ caption })
      .where(eq(photos.id, id))
      .returning();
    return photo;
  }

  async deletePhoto(id: string): Promise<boolean> {
    await db.delete(photos).where(eq(photos.id, id));
    return true;
  }

  // Distribution Logs
  async getDistributionLogs(reportId: string): Promise<DistributionLog[]> {
    return db.select().from(distributionLogs).where(eq(distributionLogs.reportId, reportId)).orderBy(desc(distributionLogs.sentAt));
  }

  async createDistributionLog(data: InsertDistributionLog): Promise<DistributionLog> {
    const [log] = await db.insert(distributionLogs).values(data).returning();
    return log;
  }

  async updateDistributionLogStatus(id: string, status: string): Promise<void> {
    await db.update(distributionLogs)
      .set({ status: status as "pending" | "sent" | "failed" })
      .where(eq(distributionLogs.id, id));
  }

  // App Settings
  async getSettings(): Promise<AppSetting[]> {
    return db.select().from(appSettings);
  }

  async getSetting(key: string): Promise<AppSetting | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return setting;
  }

  async setSetting(key: string, value: string): Promise<AppSetting> {
    const [setting] = await db
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // User Profiles
  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createOrUpdateUserProfile(data: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db
      .insert(userProfiles)
      .values(data)
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: data,
      })
      .returning();
    return profile;
  }

  // Users (admin)
  async getAllUsers(): Promise<(User & { profile?: UserProfile })[]> {
    const results = await db
      .select()
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .orderBy(desc(users.createdAt));

    return results.map(row => ({
      ...row.users,
      profile: row.user_profiles || undefined,
    }));
  }

  async updateUserRole(userId: string, role: "inspector" | "admin"): Promise<UserProfile | undefined> {
    const [profile] = await db
      .insert(userProfiles)
      .values({ userId, role })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { role },
      })
      .returning();
    return profile;
  }

  // Project Members
  async getProjectMembers(projectId: string): Promise<(ProjectMember & { user?: User })[]> {
    const results = await db
      .select()
      .from(projectMembers)
      .leftJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(desc(projectMembers.assignedAt));

    return results.map(row => ({
      ...row.project_members,
      user: row.users || undefined,
    }));
  }

  async getProjectsForUser(userId: string): Promise<string[]> {
    const results = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    
    return results.map(r => r.projectId);
  }

  async getAllProjectsForUser(userId: string): Promise<Project[]> {
    const projectIds = await this.getProjectsForUser(userId);
    if (projectIds.length === 0) return [];
    
    return db
      .select()
      .from(projects)
      .where(inArray(projects.id, projectIds))
      .orderBy(desc(projects.createdAt));
  }

  async addProjectMember(projectId: string, userId: string): Promise<ProjectMember> {
    // Check if already a member
    const existing = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ));
    
    if (existing.length > 0) {
      return existing[0];
    }

    const [member] = await db
      .insert(projectMembers)
      .values({ projectId, userId })
      .returning();
    return member;
  }

  async removeProjectMember(projectId: string, userId: string): Promise<boolean> {
    await db
      .delete(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ));
    return true;
  }

  async isUserMemberOfProject(projectId: string, userId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ));
    return !!result;
  }

  // Invites
  async getInvites(): Promise<(Invite & { invitedByUser?: User; projects?: Project[] })[]> {
    const results = await db
      .select()
      .from(invites)
      .leftJoin(users, eq(invites.invitedBy, users.id))
      .orderBy(desc(invites.createdAt));

    const invitesWithProjects = await Promise.all(results.map(async (row) => {
      const projectIds = (row.invites.projectIds as string[]) || [];
      let projectsList: Project[] = [];
      
      if (projectIds.length > 0) {
        projectsList = await db
          .select()
          .from(projects)
          .where(inArray(projects.id, projectIds));
      }

      return {
        ...row.invites,
        invitedByUser: row.users || undefined,
        projects: projectsList,
      };
    }));

    return invitesWithProjects;
  }

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.token, token));
    return invite;
  }

  async getInviteByEmail(email: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(and(
        eq(invites.email, email.toLowerCase()),
        eq(invites.status, "pending")
      ));
    return invite;
  }

  async createInvite(data: InsertInvite): Promise<Invite> {
    const [invite] = await db
      .insert(invites)
      .values({ ...data, email: data.email.toLowerCase() })
      .returning();
    return invite;
  }

  async updateInviteStatus(id: string, status: "pending" | "accepted" | "expired"): Promise<Invite | undefined> {
    const [invite] = await db
      .update(invites)
      .set({ 
        status, 
        acceptedAt: status === "accepted" ? new Date() : undefined 
      })
      .where(eq(invites.id, id))
      .returning();
    return invite;
  }

  async deleteInvite(id: string): Promise<boolean> {
    await db.delete(invites).where(eq(invites.id, id));
    return true;
  }

  // Join Requests
  async getJoinRequest(id: string): Promise<JoinRequest | undefined> {
    const [request] = await db.select().from(joinRequests).where(eq(joinRequests.id, id));
    return request;
  }

  async getJoinRequestByUserAndCompany(userId: string, companyId: string): Promise<JoinRequest | undefined> {
    const [request] = await db
      .select()
      .from(joinRequests)
      .where(and(
        eq(joinRequests.userId, userId),
        eq(joinRequests.companyId, companyId)
      ));
    return request;
  }

  async getJoinRequestsForCompany(companyId: string): Promise<(JoinRequest & { user?: User })[]> {
    const results = await db
      .select()
      .from(joinRequests)
      .leftJoin(users, eq(joinRequests.userId, users.id))
      .where(and(
        eq(joinRequests.companyId, companyId),
        eq(joinRequests.status, "pending")
      ))
      .orderBy(desc(joinRequests.createdAt));
    return results.map(r => ({
      ...r.join_requests,
      user: r.users || undefined,
    }));
  }

  async getJoinRequestsForUser(userId: string): Promise<(JoinRequest & { company?: Company })[]> {
    const results = await db
      .select()
      .from(joinRequests)
      .leftJoin(companies, eq(joinRequests.companyId, companies.id))
      .where(eq(joinRequests.userId, userId))
      .orderBy(desc(joinRequests.createdAt));
    return results.map(r => ({
      ...r.join_requests,
      company: r.companies || undefined,
    }));
  }

  async createJoinRequest(data: InsertJoinRequest): Promise<JoinRequest> {
    const [request] = await db.insert(joinRequests).values(data).returning();
    return request;
  }

  async updateJoinRequestStatus(id: string, status: "pending" | "approved" | "rejected", reviewedBy: string): Promise<JoinRequest | undefined> {
    const [request] = await db
      .update(joinRequests)
      .set({ status, reviewedBy, reviewedAt: new Date() })
      .where(eq(joinRequests.id, id))
      .returning();
    return request;
  }

  async deleteJoinRequest(id: string): Promise<boolean> {
    await db.delete(joinRequests).where(eq(joinRequests.id, id));
    return true;
  }

  // Companies
  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getCompanyByName(name: string): Promise<Company | undefined> {
    const [company] = await db
      .select()
      .from(companies)
      .where(sql`LOWER(${companies.name}) = LOWER(${name})`)
    return company;
  }

  async createCompany(data: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(data).returning();
    return company;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return company;
  }

  async deleteCompany(id: string): Promise<boolean> {
    await db.delete(companies).where(eq(companies.id, id));
    return true;
  }

  // Company Members
  async getCompanyMembers(companyId: string): Promise<(CompanyMember & { user?: User })[]> {
    const results = await db
      .select()
      .from(companyMembers)
      .leftJoin(users, eq(companyMembers.userId, users.id))
      .where(eq(companyMembers.companyId, companyId))
      .orderBy(desc(companyMembers.joinedAt));

    return results.map(row => ({
      ...row.company_members,
      user: row.users || undefined,
    }));
  }

  async getCompanyMember(companyId: string, userId: string): Promise<CompanyMember | undefined> {
    const [member] = await db
      .select()
      .from(companyMembers)
      .where(and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      ));
    return member;
  }

  async getCompaniesForUser(userId: string): Promise<(CompanyMember & { company?: Company })[]> {
    const results = await db
      .select()
      .from(companyMembers)
      .leftJoin(companies, eq(companyMembers.companyId, companies.id))
      .where(eq(companyMembers.userId, userId))
      .orderBy(desc(companyMembers.joinedAt));

    return results.map(row => ({
      ...row.company_members,
      company: row.companies || undefined,
    }));
  }

  async addCompanyMember(companyId: string, userId: string, role: "inspector" | "admin"): Promise<CompanyMember> {
    const existing = await db
      .select()
      .from(companyMembers)
      .where(and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      ));
    
    if (existing.length > 0) {
      return existing[0];
    }

    const [member] = await db
      .insert(companyMembers)
      .values({ companyId, userId, role })
      .returning();
    return member;
  }

  async updateCompanyMemberRole(companyId: string, userId: string, role: "inspector" | "admin"): Promise<CompanyMember | undefined> {
    const [member] = await db
      .update(companyMembers)
      .set({ role })
      .where(and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      ))
      .returning();
    return member;
  }

  async removeCompanyMember(companyId: string, userId: string): Promise<boolean> {
    await db
      .delete(companyMembers)
      .where(and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      ));
    return true;
  }

  async isUserMemberOfCompany(companyId: string, userId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(companyMembers)
      .where(and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      ));
    return !!result;
  }

  // Active Company
  async setActiveCompany(userId: string, companyId: string | null): Promise<UserProfile | undefined> {
    const [profile] = await db
      .update(userProfiles)
      .set({ activeCompanyId: companyId })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async getProjectsByCompany(companyId: string): Promise<Project[]> {
    return db
      .select()
      .from(projects)
      .where(eq(projects.companyId, companyId))
      .orderBy(desc(projects.createdAt));
  }

  async setActiveProject(userId: string, projectId: string | null): Promise<UserProfile | undefined> {
    const [profile] = await db
      .update(userProfiles)
      .set({ activeProjectId: projectId })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async getProjectsForUserInCompany(userId: string, companyId: string): Promise<Project[]> {
    const projectIds = await this.getProjectsForUser(userId);
    if (projectIds.length === 0) return [];
    
    return db
      .select()
      .from(projects)
      .where(and(
        eq(projects.companyId, companyId),
        inArray(projects.id, projectIds)
      ))
      .orderBy(desc(projects.createdAt));
  }

  async clearActiveCompanyForCompany(companyId: string): Promise<void> {
    await db
      .update(userProfiles)
      .set({ activeCompanyId: null })
      .where(eq(userProfiles.activeCompanyId, companyId));
  }

  async clearActiveProjectForProject(projectId: string): Promise<void> {
    await db
      .update(userProfiles)
      .set({ activeProjectId: null })
      .where(eq(userProfiles.activeProjectId, projectId));
  }

  async getReportsByProject(projectId: string): Promise<DailyReport[]> {
    return db
      .select()
      .from(dailyReports)
      .where(eq(dailyReports.projectId, projectId));
  }
  
  async getReportsForInvoice(projectId: string, startDate: Date, endDate: Date): Promise<DailyReport[]> {
    // Set endDate to end of day
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    return db
      .select()
      .from(dailyReports)
      .where(and(
        eq(dailyReports.projectId, projectId),
        sql`${dailyReports.date} >= ${startDate}`,
        sql`${dailyReports.date} <= ${endOfDay}`
      ))
      .orderBy(dailyReports.date);
  }
  
  async getUserById(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async deleteUser(userId: string): Promise<boolean> {
    // Delete in order to respect foreign key constraints
    // 1. Delete user's project memberships
    await db.delete(projectMembers).where(eq(projectMembers.userId, userId));
    
    // 2. Delete user's company memberships
    await db.delete(companyMembers).where(eq(companyMembers.userId, userId));
    
    // 3. Delete user's profile
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
    
    // 4. Delete the user (sessions are managed externally by auth integration)
    const result = await db.delete(users).where(eq(users.id, userId));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextInvoiceNumber(): Promise<number> {
    // Use database sequence for atomic, race-condition-free invoice number generation
    const result = await db.execute(sql`SELECT nextval('invoice_number_seq') as next_num`);
    return Number((result.rows[0] as any)?.next_num || 1);
  }

  async createInvoice(data: {
    invoiceNumber: number;
    projectId: string;
    generatedById: string;
    startDate: Date;
    endDate: Date;
    regularHours: string;
    otHours: string;
    totalHours: string;
    reportCount: number;
  }): Promise<{ id: string; invoiceNumber: number }> {
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: data.invoiceNumber,
        projectId: data.projectId,
        generatedById: data.generatedById,
        startDate: data.startDate,
        endDate: data.endDate,
        regularHours: data.regularHours,
        otHours: data.otHours,
        totalHours: data.totalHours,
        reportCount: data.reportCount,
      })
      .returning();
    return { id: invoice.id, invoiceNumber: invoice.invoiceNumber };
  }
}

export const storage = new DatabaseStorage();
