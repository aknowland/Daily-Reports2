import { 
  projects, dailyReports, photos, distributionLogs, appSettings, userProfiles, projectMembers, invites,
  type Project, type InsertProject,
  type DailyReport, type InsertDailyReport,
  type Photo, type InsertPhoto,
  type DistributionLog, type InsertDistributionLog,
  type AppSetting, type InsertAppSetting,
  type UserProfile, type InsertUserProfile,
  type ProjectMember, type InsertProjectMember,
  type Invite, type InsertInvite,
  type DailyReportWithDetails,
} from "@shared/schema";
import { users, type User } from "@shared/models/auth";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Daily Reports
  getReports(inspectorId?: string): Promise<DailyReportWithDetails[]>;
  getReport(id: string): Promise<DailyReportWithDetails | undefined>;
  createReport(data: InsertDailyReport): Promise<DailyReport>;
  updateReport(id: string, data: Partial<InsertDailyReport>): Promise<DailyReport | undefined>;
  deleteReport(id: string): Promise<boolean>;
  getReportStats(inspectorId?: string): Promise<{ total: number; drafts: number; submitted: number }>;

  // Photos
  getPhotosByReport(reportId: string): Promise<Photo[]>;
  createPhoto(data: InsertPhoto): Promise<Photo>;
  deletePhoto(id: string): Promise<boolean>;

  // Distribution Logs
  getDistributionLogs(reportId: string): Promise<DistributionLog[]>;
  createDistributionLog(data: InsertDistributionLog): Promise<DistributionLog>;

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
  async getReports(inspectorId?: string): Promise<DailyReportWithDetails[]> {
    let results;
    
    if (inspectorId) {
      // Inspector-filtered query
      results = await db
        .select()
        .from(dailyReports)
        .leftJoin(projects, eq(dailyReports.projectId, projects.id))
        .leftJoin(users, eq(dailyReports.inspectorId, users.id))
        .where(eq(dailyReports.inspectorId, inspectorId))
        .orderBy(desc(dailyReports.createdAt));
    } else {
      // Admin/all reports query
      results = await db
        .select()
        .from(dailyReports)
        .leftJoin(projects, eq(dailyReports.projectId, projects.id))
        .leftJoin(users, eq(dailyReports.inspectorId, users.id))
        .orderBy(desc(dailyReports.createdAt));
    }

    return results.map(row => ({
      ...row.daily_reports,
      project: row.projects || undefined,
      inspectorName: row.users ? `${row.users.firstName || ''} ${row.users.lastName || ''}`.trim() || row.users.email : undefined,
    }));
  }

  async getReport(id: string): Promise<DailyReportWithDetails | undefined> {
    const [result] = await db
      .select()
      .from(dailyReports)
      .leftJoin(projects, eq(dailyReports.projectId, projects.id))
      .leftJoin(users, eq(dailyReports.inspectorId, users.id))
      .where(eq(dailyReports.id, id));

    if (!result) return undefined;

    const reportPhotos = await this.getPhotosByReport(id);

    return {
      ...result.daily_reports,
      project: result.projects || undefined,
      photos: reportPhotos,
      inspectorName: result.users ? `${result.users.firstName || ''} ${result.users.lastName || ''}`.trim() || result.users.email : undefined,
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

  async getReportStats(inspectorId?: string): Promise<{ total: number; drafts: number; submitted: number }> {
    const baseCondition = inspectorId ? eq(dailyReports.inspectorId, inspectorId) : sql`1=1`;
    
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        drafts: sql<number>`count(*) filter (where ${dailyReports.status} = 'draft')::int`,
        submitted: sql<number>`count(*) filter (where ${dailyReports.status} = 'submitted')::int`,
      })
      .from(dailyReports)
      .where(baseCondition);

    return stats || { total: 0, drafts: 0, submitted: 0 };
  }

  // Photos
  async getPhotosByReport(reportId: string): Promise<Photo[]> {
    return db.select().from(photos).where(eq(photos.reportId, reportId)).orderBy(photos.createdAt);
  }

  async createPhoto(data: InsertPhoto): Promise<Photo> {
    const [photo] = await db.insert(photos).values(data).returning();
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
}

export const storage = new DatabaseStorage();
