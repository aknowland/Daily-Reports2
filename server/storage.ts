import { 
  projects, dailyReports, photos, distributionLogs, appSettings, userProfiles, projectMembers, invites,
  companies, companyMembers, joinRequests, invoices, contracts, clients, contractAttachments, contractOptions, contractOptionInspectors, timesheets, monthlyReportBundles,
  proposals, proposalOptions, proposalOptionInspectors, iorAgreements, purchaseOrders, contractNotifications, budgetNotifications, projectBudgetNotifications, certExpiryNotifications, pendingMemberAssignments, teamInspectors, manualTimeEntries, projectBillingRates, projectBaseHours, projectComments, meetings, dismissedAlerts, companyNotes,
  clientPortalUsers, clientPortalProjectAccess,
  type Project, type InsertProject,
  type ProjectBillingRate, type InsertProjectBillingRate,
  type ProjectBaseHours, type InsertProjectBaseHours,
  type DailyReport, type InsertDailyReport,
  type Photo, type InsertPhoto,
  type DistributionLog, type InsertDistributionLog,
  type ManualTimeEntry, type InsertManualTimeEntry,
  type AppSetting, type InsertAppSetting,
  type UserProfile, type InsertUserProfile,
  type ProjectMember, type InsertProjectMember,
  type Invite, type InsertInvite,
  type Company, type InsertCompany,
  type CompanyMember, type InsertCompanyMember,
  type JoinRequest, type InsertJoinRequest,
  type DailyReportWithDetails,
  type Invoice, type InsertInvoice, type InvoiceWithDetails,
  type Contract, type InsertContract, type ContractWithProjects,
  type Client, type InsertClient,
  type PurchaseOrder, type InsertPurchaseOrder, type PurchaseOrderWithClient,
  type ContractAttachment, type InsertContractAttachment,
  type ContractOption, type InsertContractOption, type ContractOptionWithInspectors,
  type ContractOptionInspector, type InsertContractOptionInspector,
  type ContractNotification, type InsertContractNotification,
  type BudgetNotification, type InsertBudgetNotification,
  type ProjectBudgetNotification, type InsertProjectBudgetNotification,
  type CertExpiryNotification, type InsertCertExpiryNotification, normalizeCerts, type CertEntry,
  type Timesheet, type InsertTimesheet,
  type MonthlyReportBundle, type InsertMonthlyReportBundle,
  type Proposal, type InsertProposal, type ProposalWithDetails,
  type ProposalOption, type InsertProposalOption,
  type ProposalOptionInspector, type InsertProposalOptionInspector,
  type IorAgreement, type InsertIorAgreement, type IorAgreementWithDetails,
  type PendingMemberAssignment, type InsertPendingMemberAssignment,
  type TeamInspector, type InsertTeamInspector,
  type Meeting, type InsertMeeting,
  type ClientPortalUser, type InsertClientPortalUser,
  type ClientPortalProjectAccess, type InsertClientPortalProjectAccess,
  apiKeys, type ApiKey, type InsertApiKey,
  inspectorCandidates, inspectorCandidateNotes,
  type InspectorCandidate, type InsertInspectorCandidate,
  type InspectorCandidateNote, type InsertInspectorCandidateNote,
  inspectorDocuments,
  type InspectorDocument, type InsertInspectorDocument,
  inspectorAnnouncements, announcementReads,
  type InspectorAnnouncement, type InsertAnnouncement,
} from "@shared/schema";
import { users, type User } from "@shared/models/auth";
import { db } from "./db";
import { eq, desc, asc, and, or, sql, inArray, isNull, gte, lte } from "drizzle-orm";

// Re-export db and schema tables for use in other modules
export { db, projectComments, projectMembers, projects, users, meetings, companyNotes, clientPortalUsers, clientPortalProjectAccess };

// Initialize database sequences (ensures they exist on fresh deployments)
export async function initDatabaseSequences() {
  try {
    // Create report number sequence if it doesn't exist and always sync to max(report_number)
    await db.execute(sql`
      DO $$
      DECLARE
        max_num INTEGER;
      BEGIN
        -- Create sequence if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'report_number_seq') THEN
          CREATE SEQUENCE report_number_seq START WITH 1 INCREMENT BY 1;
        END IF;
        
        -- Always sync sequence to max existing report_number to prevent drift/duplicates
        SELECT COALESCE(MAX(report_number), 0) INTO max_num FROM daily_reports;
        PERFORM setval('report_number_seq', GREATEST(max_num, 1), max_num > 0);
      END $$;
    `);
    console.log("Database sequences initialized successfully");
  } catch (error) {
    console.error("Error initializing database sequences:", error);
  }
}

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
  getLatestReportForProject(projectId: string): Promise<DailyReport | undefined>;
  createReport(data: InsertDailyReport): Promise<DailyReport>;
  updateReport(id: string, data: Partial<InsertDailyReport>): Promise<DailyReport | undefined>;
  deleteReport(id: string): Promise<boolean>;
  getReportStats(options?: { inspectorId?: string; companyId?: string; companyIds?: string[]; personalReportUserIds?: string[] }): Promise<{ total: number; drafts: number; submitted: number }>;
  getNextReportNumber(): Promise<number>;

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

  // Manual Time Entries
  getManualTimeEntry(id: string): Promise<ManualTimeEntry | undefined>;
  getManualTimeEntries(projectId: string, inspectorId: string, startDate: Date, endDate: Date): Promise<ManualTimeEntry[]>;
  getAllManualTimeEntriesForProject(projectId: string): Promise<ManualTimeEntry[]>;
  createManualTimeEntry(data: InsertManualTimeEntry): Promise<ManualTimeEntry>;
  updateManualTimeEntry(id: string, data: Partial<InsertManualTimeEntry>): Promise<ManualTimeEntry | undefined>;
  deleteManualTimeEntry(id: string): Promise<boolean>;

  // App Settings
  getSettings(): Promise<AppSetting[]>;
  getSetting(key: string): Promise<AppSetting | undefined>;
  setSetting(key: string, value: string): Promise<AppSetting>;

  // User Profiles
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createOrUpdateUserProfile(data: InsertUserProfile): Promise<UserProfile>;
  updateUserStripeInfo(userId: string, data: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionStatus?: string }): Promise<UserProfile | undefined>;
  incrementReportCount(userId: string): Promise<void>;
  resetReportCount(userId: string): Promise<void>;
  
  // Users (admin)
  getAllUsers(): Promise<(User & { profile?: UserProfile })[]>;
  updateUserRole(userId: string, role: "inspector" | "admin" | "owner"): Promise<UserProfile | undefined>;

  // Project Members
  getProjectMembers(projectId: string): Promise<(ProjectMember & { user?: User })[]>;
  getProjectsForUser(userId: string): Promise<string[]>;
  getAllProjectsForUser(userId: string): Promise<Project[]>;
  addProjectMember(projectId: string, userId: string, rates?: { regularRate?: string; overtimeRate?: string; premiumRate?: string }): Promise<ProjectMember>;
  updateProjectMemberRates(projectId: string, userId: string, rates: { regularRate?: string; overtimeRate?: string; premiumRate?: string }): Promise<ProjectMember | undefined>;
  getProjectMember(projectId: string, userId: string): Promise<ProjectMember | undefined>;
  removeProjectMember(projectId: string, userId: string): Promise<boolean>;
  isUserMemberOfProject(projectId: string, userId: string): Promise<boolean>;

  // Project Billing Rates
  getProjectBillingRates(projectId: string): Promise<ProjectBillingRate[]>;
  setProjectBillingRates(projectId: string, rates: InsertProjectBillingRate[]): Promise<ProjectBillingRate[]>;

  // Project Base Hours
  getProjectBaseHours(projectId: string): Promise<ProjectBaseHours[]>;
  setProjectBaseHours(projectId: string, entries: InsertProjectBaseHours[]): Promise<ProjectBaseHours[]>;

  // Invites
  getInvites(): Promise<(Invite & { invitedByUser?: User; projects?: Project[]; company?: Company })[]>;
  getInviteByToken(token: string): Promise<Invite | undefined>;
  getInviteByCode(code: string): Promise<Invite | undefined>;
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
  getMemberUserIdsForCompanies(companyIds: string[]): Promise<string[]>;
  addCompanyMember(companyId: string, userId: string, role: "inspector" | "admin"): Promise<CompanyMember>;
  updateCompanyMemberRole(companyId: string, userId: string, role: "inspector" | "admin"): Promise<CompanyMember | undefined>;
  removeCompanyMember(companyId: string, userId: string): Promise<boolean>;
  isUserMemberOfCompany(companyId: string, userId: string): Promise<boolean>;

  // Pending Member Assignments
  getPendingAssignmentsForEmail(email: string): Promise<PendingMemberAssignment[]>;
  getPendingAssignmentsForCompany(companyId: string): Promise<PendingMemberAssignment[]>;
  createPendingAssignment(data: InsertPendingMemberAssignment): Promise<PendingMemberAssignment>;
  deletePendingAssignment(id: string): Promise<boolean>;
  deletePendingAssignmentByEmail(email: string, companyId: string): Promise<boolean>;

  // Team Inspectors (non-active inspector profiles)
  getTeamInspectors(companyId: string): Promise<TeamInspector[]>;
  getTeamInspector(id: string): Promise<TeamInspector | undefined>;
  getTeamInspectorByEmail(companyId: string, email: string): Promise<TeamInspector | undefined>;
  createTeamInspector(data: InsertTeamInspector): Promise<TeamInspector>;
  updateTeamInspector(id: string, data: Partial<InsertTeamInspector>): Promise<TeamInspector | undefined>;
  deleteTeamInspector(id: string): Promise<boolean>;
  mergeTeamInspectorWithUser(teamInspectorId: string, userId: string): Promise<TeamInspector | undefined>;

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
  getNextInvoiceNumber(): Promise<string>;
  createInvoice(data: {
    companyId: string;
    projectId: string;
    contractId?: string;
    clientId?: string;
    purchaseOrderId?: string;
    invoiceNumber: string;
    month: number;
    year: number;
    regularHours: string;
    overtimeHours: string;
    premiumHours: string;
    regularRate?: string;
    overtimeRate?: string;
    premiumRate?: string;
    regularAmount: string;
    overtimeAmount: string;
    premiumAmount: string;
    subtotal: string;
    totalAmount: string;
    dueDate?: Date;
    notes?: string;
    pdfPath?: string;
    status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  }): Promise<{ id: string; invoiceNumber: string }>;

  // Contracts
  getContracts(companyId: string): Promise<ContractWithProjects[]>;
  getContract(id: string): Promise<ContractWithProjects | undefined>;
  createContract(data: InsertContract): Promise<Contract>;
  updateContract(id: string, data: Partial<InsertContract>): Promise<Contract | undefined>;
  deleteContract(id: string): Promise<boolean>;

  // Clients
  getClients(companyId: string): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;

  // Purchase Orders
  getPurchaseOrders(companyId: string): Promise<PurchaseOrderWithClient[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrderWithClient | undefined>;
  getPurchaseOrdersByClient(clientId: string): Promise<PurchaseOrder[]>;
  createPurchaseOrder(data: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined>;
  deletePurchaseOrder(id: string): Promise<boolean>;
  getInvoicesByPurchaseOrder(purchaseOrderId: string): Promise<Invoice[]>;
  getPurchaseOrderBalance(purchaseOrderId: string): Promise<{ totalValue: number; billedAmount: number; remainingBalance: number }>;

  // Invoices
  getInvoices(companyId: string): Promise<InvoiceWithDetails[]>;
  getInvoice(id: string): Promise<InvoiceWithDetails | undefined>;
  getInvoicesByProject(projectId: string): Promise<Invoice[]>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<boolean>;

  // Contract Attachments
  getContractAttachments(contractId: string): Promise<ContractAttachment[]>;
  getContractAttachment(id: string): Promise<ContractAttachment | undefined>;
  createContractAttachment(data: InsertContractAttachment): Promise<ContractAttachment>;
  deleteContractAttachment(id: string): Promise<boolean>;

  // Contract Options
  getContractOptions(contractId: string): Promise<ContractOptionWithInspectors[]>;
  createContractOption(data: InsertContractOption): Promise<ContractOption>;
  deleteContractOptions(contractId: string): Promise<boolean>;
  
  // Contract Option Inspectors
  createContractOptionInspector(data: InsertContractOptionInspector): Promise<ContractOptionInspector>;

  // Contract Notifications
  getContractNotifications(contractId: string): Promise<ContractNotification[]>;
  hasNotificationBeenSent(contractId: string, notificationType: string, daysBefore: number): Promise<boolean>;
  createContractNotification(data: InsertContractNotification): Promise<ContractNotification>;
  getAllContractsWithUpcomingDates(): Promise<ContractWithProjects[]>;
  getCompanyAdminEmails(companyId: string): Promise<string[]>;

  // Proposals
  getProposals(companyId: string): Promise<ProposalWithDetails[]>;
  getProposal(id: string): Promise<ProposalWithDetails | undefined>;
  getProposalByProjectId(projectId: string): Promise<ProposalWithDetails | undefined>;
  createProposal(data: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, data: Partial<InsertProposal>): Promise<Proposal | undefined>;
  deleteProposal(id: string): Promise<boolean>;
  getNextProposalNumber(companyId: string): Promise<string>;
  
  // Proposal Options
  createProposalOption(data: InsertProposalOption): Promise<ProposalOption>;
  deleteProposalOptions(proposalId: string): Promise<boolean>;
  
  // Proposal Option Inspectors
  createProposalOptionInspector(data: InsertProposalOptionInspector): Promise<ProposalOptionInspector>;

  // IOR Agreements
  getIorAgreements(companyId: string): Promise<IorAgreementWithDetails[]>;
  getIorAgreement(id: string): Promise<IorAgreementWithDetails | undefined>;
  getIorAgreementByProjectAndInspector(projectId: string, inspectorId: string): Promise<IorAgreement | undefined>;
  createIorAgreement(data: InsertIorAgreement): Promise<IorAgreement>;
  updateIorAgreement(id: string, data: Partial<InsertIorAgreement>): Promise<IorAgreement | undefined>;
  deleteIorAgreement(id: string): Promise<boolean>;
  getNextIorAgreementNumber(companyId: string): Promise<string>;
  
  // Budget tracking
  getInvoicesByContract(contractId: string): Promise<{ totalAmount: string; regularHours: string; overtimeHours: string; premiumHours: string }[]>;
  getContractBudgetSummary(contractId: string): Promise<{ 
    totalBilled: number; 
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    premiumHours: number;
  }>;
  
  // Dashboard data
  getProjectsByContract(contractId: string): Promise<Project[]>;
  getIorAgreementsByProject(projectId: string): Promise<IorAgreementWithDetails[]>;
  getReportsByContractProjects(contractId: string): Promise<(DailyReport & { projectName?: string })[]>;

  // Meetings
  getMeetings(companyId: string, options?: { projectId?: string }): Promise<Meeting[]>;
  getMeeting(id: string): Promise<Meeting | undefined>;
  createMeeting(data: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: string, data: Partial<InsertMeeting>): Promise<Meeting | undefined>;
  deleteMeeting(id: string): Promise<boolean>;
  getNextMeetingNumber(companyId: string, meetingType: string): Promise<string>;
  
  // Dismissed Alerts
  getDismissedAlerts(userId: string, companyId: string): Promise<string[]>;
  dismissAlert(userId: string, alertId: string, companyId: string): Promise<void>;

  // API Keys
  getApiKeysByCompany(companyId: string): Promise<ApiKey[]>;
  getApiKeyByHash(hash: string): Promise<ApiKey | undefined>;
  createApiKey(data: InsertApiKey): Promise<ApiKey>;
  revokeApiKey(id: string, companyId: string): Promise<boolean>;
  touchApiKey(id: string): Promise<void>;

  // Client Portal
  getClientPortalUser(userId: string, companyId: string): Promise<ClientPortalUser | undefined>;
  getClientPortalUsersByUserId(userId: string): Promise<(ClientPortalUser & { company?: Company; client?: Client })[]>;
  createClientPortalUser(data: InsertClientPortalUser): Promise<ClientPortalUser>;
  deleteClientPortalUser(id: string): Promise<boolean>;
  getClientPortalProjectAccess(clientPortalUserId: string): Promise<(ClientPortalProjectAccess & { project?: Project })[]>;
  addClientPortalProjectAccess(clientPortalUserId: string, projectId: string): Promise<ClientPortalProjectAccess>;
  removeClientPortalProjectAccess(clientPortalUserId: string, projectId: string): Promise<boolean>;
  getClientPortalUsersForCompany(companyId: string): Promise<(ClientPortalUser & { user?: User; client?: Client; projectAccess?: (ClientPortalProjectAccess & { project?: Project })[] })[]>;
  getClientPortalUsersForProject(projectId: string): Promise<(ClientPortalUser & { user?: User })[]>;
  updateClientPortalUserAccessLevel(id: string, allProjectsAccess: boolean): Promise<ClientPortalUser>;

  // Inspector Candidates (Recruiting)
  getInspectorCandidates(companyId: string): Promise<InspectorCandidate[]>;
  getInspectorCandidate(id: string): Promise<InspectorCandidate | undefined>;
  getInspectorCandidateByDsaId(companyId: string, dsaInspectorId: string): Promise<InspectorCandidate | undefined>;
  getInspectorCandidateByCertNumber(companyId: string, certNumber: string): Promise<InspectorCandidate | undefined>;
  createInspectorCandidate(data: InsertInspectorCandidate): Promise<InspectorCandidate>;
  updateInspectorCandidate(id: string, data: Partial<InsertInspectorCandidate>): Promise<InspectorCandidate | undefined>;
  deleteInspectorCandidate(id: string): Promise<boolean>;
  upsertInspectorCandidate(data: InsertInspectorCandidate): Promise<InspectorCandidate>;

  // Inspector Candidate Notes
  getInspectorCandidateNotes(candidateId: string): Promise<(InspectorCandidateNote & { user?: User })[]>;
  createInspectorCandidateNote(data: InsertInspectorCandidateNote): Promise<InspectorCandidateNote>;

  // Announcements
  createAnnouncement(data: InsertAnnouncement): Promise<InspectorAnnouncement>;
  getCompanyAnnouncements(companyId: string): Promise<(InspectorAnnouncement & { senderName?: string })[]>;
  getInspectorAnnouncements(userId: string, companyIds: string[]): Promise<InspectorAnnouncement[]>;
  getUnreadAnnouncementCount(userId: string, companyIds: string[]): Promise<number>;
  markAnnouncementRead(announcementId: string, userId: string): Promise<void>;
  isAnnouncementRead(announcementId: string, userId: string): Promise<boolean>;
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
  async getReports(options?: { inspectorId?: string; companyId?: string; companyIds?: string[]; personalReportUserIds?: string[] }): Promise<DailyReportWithDetails[]> {
    const { inspectorId, companyId, companyIds, personalReportUserIds } = options || {};
    
    // Build conditions array
    const conditions = [];
    if (inspectorId && companyIds && companyIds.length > 0) {
      // Special case: inspector OR company admin (used for combined access)
      // Include: user's own reports OR reports from company projects OR personal reports from company members
      const orConditions = [
        eq(dailyReports.inspectorId, inspectorId),
        inArray(projects.companyId, companyIds)
      ];
      
      // Also include personal reports (no projectId) from company members
      if (personalReportUserIds && personalReportUserIds.length > 0) {
        // Personal reports are those with no projectId, from users in the company
        orConditions.push(
          sql`${dailyReports.projectId} IS NULL AND ${dailyReports.inspectorId} IN (${sql.join(personalReportUserIds.map(id => sql`${id}`), sql`, `)})`
        );
      }
      
      conditions.push(or(...orConditions));
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

  async getLatestReportForProject(projectId: string): Promise<DailyReport | undefined> {
    const [result] = await db
      .select()
      .from(dailyReports)
      .where(eq(dailyReports.projectId, projectId))
      .orderBy(desc(dailyReports.date), desc(dailyReports.createdAt))
      .limit(1);
    
    return result;
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

  async getReportStats(options?: { inspectorId?: string; companyId?: string; companyIds?: string[]; personalReportUserIds?: string[] }): Promise<{ total: number; drafts: number; submitted: number }> {
    const { inspectorId, companyId, companyIds, personalReportUserIds } = options || {};
    
    // Build conditions array
    const conditions = [];
    const needsProjectJoin = companyId || (companyIds && companyIds.length > 0);
    
    if (inspectorId && companyIds && companyIds.length > 0) {
      // Special case: inspector OR company admin (used for combined access)
      // Include: user's own reports OR reports from company projects OR personal reports from company members
      const orConditions = [
        eq(dailyReports.inspectorId, inspectorId),
        inArray(projects.companyId, companyIds)
      ];
      
      // Also include personal reports (no projectId) from company members
      if (personalReportUserIds && personalReportUserIds.length > 0) {
        orConditions.push(
          sql`${dailyReports.projectId} IS NULL AND ${dailyReports.inspectorId} IN (${sql.join(personalReportUserIds.map(id => sql`${id}`), sql`, `)})`
        );
      }
      
      conditions.push(or(...orConditions));
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

  async getNextReportNumber(): Promise<number> {
    // Use PostgreSQL sequence for atomic, thread-safe sequential numbering
    const result = await db.execute(sql`SELECT nextval('report_number_seq') as next_number`);
    const row = result.rows?.[0] as { next_number?: string | number } | undefined;
    return Number(row?.next_number) || 1;
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

  // Manual Time Entries
  async getManualTimeEntry(id: string): Promise<ManualTimeEntry | undefined> {
    const [entry] = await db.select().from(manualTimeEntries).where(eq(manualTimeEntries.id, id));
    return entry;
  }

  async getManualTimeEntries(projectId: string, inspectorId: string, startDate: Date, endDate: Date): Promise<ManualTimeEntry[]> {
    return db.select().from(manualTimeEntries)
      .where(
        and(
          eq(manualTimeEntries.projectId, projectId),
          eq(manualTimeEntries.inspectorId, inspectorId),
          gte(manualTimeEntries.date, startDate),
          lte(manualTimeEntries.date, endDate)
        )
      )
      .orderBy(asc(manualTimeEntries.date));
  }

  async getAllManualTimeEntriesForProject(projectId: string): Promise<ManualTimeEntry[]> {
    return db.select().from(manualTimeEntries)
      .where(eq(manualTimeEntries.projectId, projectId))
      .orderBy(asc(manualTimeEntries.date));
  }

  async createManualTimeEntry(data: InsertManualTimeEntry): Promise<ManualTimeEntry> {
    const [entry] = await db.insert(manualTimeEntries).values(data).returning();
    return entry;
  }

  async updateManualTimeEntry(id: string, data: Partial<InsertManualTimeEntry>): Promise<ManualTimeEntry | undefined> {
    const [entry] = await db.update(manualTimeEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(manualTimeEntries.id, id))
      .returning();
    return entry;
  }

  async deleteManualTimeEntry(id: string): Promise<boolean> {
    const result = await db.delete(manualTimeEntries).where(eq(manualTimeEntries.id, id));
    return result.rowCount > 0;
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
    const { userId, ...updateFields } = data as any;
    const [profile] = await db
      .insert(userProfiles)
      .values(data)
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: updateFields,
      })
      .returning();
    return profile;
  }

  async updateUserStripeInfo(userId: string, data: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionStatus?: string }): Promise<UserProfile | undefined> {
    const updateData: any = {};
    if (data.stripeCustomerId !== undefined) updateData.stripeCustomerId = data.stripeCustomerId;
    if (data.stripeSubscriptionId !== undefined) updateData.stripeSubscriptionId = data.stripeSubscriptionId;
    if (data.subscriptionStatus !== undefined) updateData.subscriptionStatus = data.subscriptionStatus;
    
    const [profile] = await db
      .update(userProfiles)
      .set(updateData)
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async incrementReportCount(userId: string): Promise<void> {
    await db
      .update(userProfiles)
      .set({ 
        monthlyReportCount: sql`COALESCE(${userProfiles.monthlyReportCount}, 0) + 1`
      })
      .where(eq(userProfiles.userId, userId));
  }

  async resetReportCount(userId: string): Promise<void> {
    await db
      .update(userProfiles)
      .set({ 
        monthlyReportCount: 0,
        reportCountResetAt: new Date()
      })
      .where(eq(userProfiles.userId, userId));
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

  async updateUserRole(userId: string, role: "inspector" | "admin" | "owner"): Promise<UserProfile | undefined> {
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

  async addProjectMember(projectId: string, userId: string, rates?: { regularRate?: string; overtimeRate?: string; premiumRate?: string }): Promise<ProjectMember> {
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
      .values({ 
        projectId, 
        userId,
        regularRate: rates?.regularRate,
        overtimeRate: rates?.overtimeRate,
        premiumRate: rates?.premiumRate,
      })
      .returning();
    return member;
  }

  async updateProjectMemberRates(projectId: string, userId: string, rates: { regularRate?: string; overtimeRate?: string; premiumRate?: string }): Promise<ProjectMember | undefined> {
    const [member] = await db
      .update(projectMembers)
      .set({
        regularRate: rates.regularRate,
        overtimeRate: rates.overtimeRate,
        premiumRate: rates.premiumRate,
      })
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ))
      .returning();
    return member;
  }

  async getProjectMember(projectId: string, userId: string): Promise<ProjectMember | undefined> {
    const [member] = await db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ));
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

  // Project Billing Rates
  async getProjectBillingRates(projectId: string): Promise<ProjectBillingRate[]> {
    return await db
      .select()
      .from(projectBillingRates)
      .where(eq(projectBillingRates.projectId, projectId))
      .orderBy(asc(projectBillingRates.createdAt));
  }

  async setProjectBillingRates(projectId: string, rates: InsertProjectBillingRate[]): Promise<ProjectBillingRate[]> {
    // Delete existing rates for this project
    await db.delete(projectBillingRates).where(eq(projectBillingRates.projectId, projectId));
    
    // Insert new rates if any
    if (rates.length === 0) {
      return [];
    }
    
    const insertedRates = await db
      .insert(projectBillingRates)
      .values(rates.map(rate => ({
        ...rate,
        projectId,
      })))
      .returning();
    
    return insertedRates;
  }

  // Project Base Hours
  async getProjectBaseHours(projectId: string): Promise<ProjectBaseHours[]> {
    return await db
      .select()
      .from(projectBaseHours)
      .where(eq(projectBaseHours.projectId, projectId))
      .orderBy(asc(projectBaseHours.createdAt));
  }

  async setProjectBaseHours(projectId: string, entries: InsertProjectBaseHours[]): Promise<ProjectBaseHours[]> {
    // Delete existing base hours entries for this project
    await db.delete(projectBaseHours).where(eq(projectBaseHours.projectId, projectId));
    
    // Insert new entries if any
    if (entries.length === 0) {
      return [];
    }
    
    const insertedEntries = await db
      .insert(projectBaseHours)
      .values(entries.map(entry => ({
        ...entry,
        projectId,
      })))
      .returning();
    
    return insertedEntries;
  }

  // Invites
  async getInvites(): Promise<(Invite & { invitedByUser?: User; projects?: Project[]; company?: Company })[]> {
    const results = await db
      .select()
      .from(invites)
      .leftJoin(users, eq(invites.invitedBy, users.id))
      .leftJoin(companies, eq(invites.companyId, companies.id))
      .orderBy(desc(invites.createdAt));

    const invitesWithDetails = await Promise.all(results.map(async (row) => {
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
        company: row.companies || undefined,
      };
    }));

    return invitesWithDetails;
  }

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.token, token));
    return invite;
  }

  async getInviteByCode(code: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.inviteCode, code.toUpperCase()));
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

  async getMemberUserIdsForCompanies(companyIds: string[]): Promise<string[]> {
    if (companyIds.length === 0) return [];
    
    const results = await db
      .selectDistinct({ userId: companyMembers.userId })
      .from(companyMembers)
      .where(inArray(companyMembers.companyId, companyIds));
    
    return results.map(row => row.userId);
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

  // Pending Member Assignments
  async getPendingAssignmentsForEmail(email: string): Promise<PendingMemberAssignment[]> {
    return db
      .select()
      .from(pendingMemberAssignments)
      .where(eq(pendingMemberAssignments.email, email.toLowerCase()));
  }

  async getPendingAssignmentsForCompany(companyId: string): Promise<PendingMemberAssignment[]> {
    return db
      .select()
      .from(pendingMemberAssignments)
      .where(eq(pendingMemberAssignments.companyId, companyId));
  }

  async createPendingAssignment(data: InsertPendingMemberAssignment): Promise<PendingMemberAssignment> {
    const [assignment] = await db
      .insert(pendingMemberAssignments)
      .values({ ...data, email: data.email.toLowerCase() })
      .returning();
    return assignment;
  }

  async deletePendingAssignment(id: string): Promise<boolean> {
    await db
      .delete(pendingMemberAssignments)
      .where(eq(pendingMemberAssignments.id, id));
    return true;
  }

  async deletePendingAssignmentByEmail(email: string, companyId: string): Promise<boolean> {
    await db
      .delete(pendingMemberAssignments)
      .where(and(
        eq(pendingMemberAssignments.email, email.toLowerCase()),
        eq(pendingMemberAssignments.companyId, companyId)
      ));
    return true;
  }

  // Team Inspectors (non-active inspector profiles)
  async getTeamInspectors(companyId: string): Promise<TeamInspector[]> {
    return db.select().from(teamInspectors).where(eq(teamInspectors.companyId, companyId)).orderBy(desc(teamInspectors.createdAt));
  }

  async getTeamInspector(id: string): Promise<TeamInspector | undefined> {
    const [inspector] = await db.select().from(teamInspectors).where(eq(teamInspectors.id, id));
    return inspector;
  }

  async getTeamInspectorByEmail(companyId: string, email: string): Promise<TeamInspector | undefined> {
    const [inspector] = await db.select().from(teamInspectors).where(
      and(
        eq(teamInspectors.companyId, companyId),
        eq(teamInspectors.email, email.toLowerCase())
      )
    );
    return inspector;
  }

  async createTeamInspector(data: InsertTeamInspector): Promise<TeamInspector> {
    const [inspector] = await db.insert(teamInspectors).values({
      ...data,
      email: data.email?.toLowerCase(),
    }).returning();
    return inspector;
  }

  async updateTeamInspector(id: string, data: Partial<InsertTeamInspector>): Promise<TeamInspector | undefined> {
    const updateData = {
      ...data,
      email: data.email?.toLowerCase(),
      updatedAt: new Date(),
    };
    const [inspector] = await db.update(teamInspectors).set(updateData).where(eq(teamInspectors.id, id)).returning();
    return inspector;
  }

  async deleteTeamInspector(id: string): Promise<boolean> {
    await db.delete(teamInspectors).where(eq(teamInspectors.id, id));
    return true;
  }

  async mergeTeamInspectorWithUser(teamInspectorId: string, userId: string): Promise<TeamInspector | undefined> {
    const [inspector] = await db.update(teamInspectors).set({
      linkedUserId: userId,
      status: "active",
      updatedAt: new Date(),
    }).where(eq(teamInspectors.id, teamInspectorId)).returning();
    return inspector;
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

  async getNextInvoiceNumber(): Promise<string> {
    // Generate invoice number based on max existing + 1
    const result = await db.execute(sql`SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1 as next_num FROM invoices WHERE invoice_number ~ '^[0-9]+$'`);
    const nextNum = Number((result.rows[0] as any)?.next_num || 1);
    return String(nextNum).padStart(5, '0');
  }

  async createInvoice(data: {
    companyId: string;
    projectId: string;
    contractId?: string;
    clientId?: string;
    purchaseOrderId?: string;
    invoiceNumber: string;
    month: number;
    year: number;
    regularHours: string;
    overtimeHours: string;
    premiumHours: string;
    regularRate?: string;
    overtimeRate?: string;
    premiumRate?: string;
    regularAmount: string;
    overtimeAmount: string;
    premiumAmount: string;
    subtotal: string;
    totalAmount: string;
    dueDate?: Date;
    notes?: string;
    pdfPath?: string;
    status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  }): Promise<{ id: string; invoiceNumber: string }> {
    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId: data.companyId,
        projectId: data.projectId,
        contractId: data.contractId || null,
        clientId: data.clientId || null,
        purchaseOrderId: data.purchaseOrderId || null,
        invoiceNumber: data.invoiceNumber,
        month: data.month,
        year: data.year,
        regularHours: data.regularHours,
        overtimeHours: data.overtimeHours,
        premiumHours: data.premiumHours,
        regularRate: data.regularRate || null,
        overtimeRate: data.overtimeRate || null,
        premiumRate: data.premiumRate || null,
        regularAmount: data.regularAmount,
        overtimeAmount: data.overtimeAmount,
        premiumAmount: data.premiumAmount,
        subtotal: data.subtotal,
        totalAmount: data.totalAmount,
        dueDate: data.dueDate || null,
        notes: data.notes || null,
        pdfPath: data.pdfPath || null,
        status: data.status || 'draft',
      })
      .returning();
    return { id: invoice.id, invoiceNumber: invoice.invoiceNumber };
  }

  // Contracts
  async getContracts(companyId: string): Promise<ContractWithProjects[]> {
    const contractList = await db
      .select()
      .from(contracts)
      .where(eq(contracts.companyId, companyId))
      .orderBy(desc(contracts.createdAt));
    
    const contractsWithProjects: ContractWithProjects[] = [];
    for (const contract of contractList) {
      let client: Client | undefined;
      // Fetch projects that reference this contract
      const contractProjects = await db.select().from(projects).where(eq(projects.contractId, contract.id));
      if (contract.clientId) {
        const [c] = await db.select().from(clients).where(eq(clients.id, contract.clientId));
        client = c;
      }
      const attachments = await db.select().from(contractAttachments).where(eq(contractAttachments.contractId, contract.id)).orderBy(desc(contractAttachments.createdAt));
      
      // Fetch options with inspectors
      const optionsList = await db
        .select()
        .from(contractOptions)
        .where(eq(contractOptions.contractId, contract.id))
        .orderBy(contractOptions.optionNumber);
      
      const optionsWithInspectors: ContractOptionWithInspectors[] = [];
      for (const option of optionsList) {
        const inspectors = await db
          .select()
          .from(contractOptionInspectors)
          .where(eq(contractOptionInspectors.optionId, option.id));
        optionsWithInspectors.push({ ...option, inspectors });
      }
      
      contractsWithProjects.push({ ...contract, projects: contractProjects, client, attachments, options: optionsWithInspectors });
    }
    return contractsWithProjects;
  }

  async getContract(id: string): Promise<ContractWithProjects | undefined> {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    if (!contract) return undefined;
    
    let client: Client | undefined;
    // Fetch projects that reference this contract
    const contractProjects = await db.select().from(projects).where(eq(projects.contractId, contract.id));
    if (contract.clientId) {
      const [c] = await db.select().from(clients).where(eq(clients.id, contract.clientId));
      client = c;
    }
    const attachments = await db.select().from(contractAttachments).where(eq(contractAttachments.contractId, id)).orderBy(desc(contractAttachments.createdAt));
    
    // Fetch options with inspectors
    const optionsList = await db
      .select()
      .from(contractOptions)
      .where(eq(contractOptions.contractId, id))
      .orderBy(contractOptions.optionNumber);
    
    const optionsWithInspectors: ContractOptionWithInspectors[] = [];
    for (const option of optionsList) {
      const inspectors = await db
        .select()
        .from(contractOptionInspectors)
        .where(eq(contractOptionInspectors.optionId, option.id));
      optionsWithInspectors.push({ ...option, inspectors });
    }
    
    return { ...contract, projects: contractProjects, client, attachments, options: optionsWithInspectors };
  }

  async createContract(data: InsertContract): Promise<Contract> {
    const [contract] = await db.insert(contracts).values(data).returning();
    return contract;
  }

  async updateContract(id: string, data: Partial<InsertContract>): Promise<Contract | undefined> {
    const [contract] = await db
      .update(contracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();
    return contract;
  }

  async deleteContract(id: string): Promise<boolean> {
    const result = await db.delete(contracts).where(eq(contracts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Clients
  async getClients(companyId: string): Promise<Client[]> {
    return db
      .select()
      .from(clients)
      .where(eq(clients.companyId, companyId))
      .orderBy(clients.name);
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(data: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(data).returning();
    return client;
  }

  async updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [client] = await db
      .update(clients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return client;
  }

  async deleteClient(id: string): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Purchase Orders
  async getPurchaseOrders(companyId: string): Promise<PurchaseOrderWithClient[]> {
    const pos = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.companyId, companyId))
      .orderBy(desc(purchaseOrders.createdAt));
    
    const result: PurchaseOrderWithClient[] = [];
    for (const po of pos) {
      const client = po.clientId ? await this.getClient(po.clientId) : undefined;
      const poContracts = await db
        .select()
        .from(contracts)
        .where(eq(contracts.purchaseOrderId, po.id));
      result.push({ ...po, client, contracts: poContracts });
    }
    return result;
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrderWithClient | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po) return undefined;
    
    const client = po.clientId ? await this.getClient(po.clientId) : undefined;
    const poContracts = await db
      .select()
      .from(contracts)
      .where(eq(contracts.purchaseOrderId, po.id));
    return { ...po, client, contracts: poContracts };
  }

  async getPurchaseOrdersByClient(clientId: string): Promise<PurchaseOrder[]> {
    return db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.clientId, clientId))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async createPurchaseOrder(data: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [po] = await db.insert(purchaseOrders).values(data).returning();
    return po;
  }

  async updatePurchaseOrder(id: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    const [po] = await db
      .update(purchaseOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    return po;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    const result = await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getInvoicesByPurchaseOrder(purchaseOrderId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.purchaseOrderId, purchaseOrderId))
      .orderBy(desc(invoices.createdAt));
  }

  async getPurchaseOrderBalance(purchaseOrderId: string): Promise<{ totalValue: number; billedAmount: number; remainingBalance: number }> {
    const po = await this.getPurchaseOrder(purchaseOrderId);
    if (!po) {
      return { totalValue: 0, billedAmount: 0, remainingBalance: 0 };
    }
    
    const totalValue = parseFloat(po.totalAmount || '0');
    
    // Get all invoices linked to this PO (both directly and via contracts)
    const directInvoices = await this.getInvoicesByPurchaseOrder(purchaseOrderId);
    
    // Also get invoices from contracts linked to this PO
    const contractsLinkedToPO = po.contracts || [];
    let contractInvoices: Invoice[] = [];
    for (const contract of contractsLinkedToPO) {
      const invs = await db
        .select()
        .from(invoices)
        .where(eq(invoices.contractId, contract.id));
      contractInvoices.push(...invs);
    }
    
    // Combine and deduplicate invoices
    const allInvoices = [...directInvoices];
    const directIds = new Set(directInvoices.map(i => i.id));
    for (const inv of contractInvoices) {
      if (!directIds.has(inv.id)) {
        allInvoices.push(inv);
      }
    }
    
    // Only count non-cancelled invoices
    const billedAmount = allInvoices
      .filter(inv => inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + parseFloat(inv.totalAmount || '0'), 0);
    
    return {
      totalValue,
      billedAmount,
      remainingBalance: totalValue - billedAmount,
    };
  }

  // Invoices
  async getInvoices(companyId: string): Promise<InvoiceWithDetails[]> {
    const invoiceList = await db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId))
      .orderBy(desc(invoices.createdAt));
    
    const result: InvoiceWithDetails[] = [];
    for (const inv of invoiceList) {
      const project = inv.projectId ? await this.getProject(inv.projectId) : undefined;
      const contract = inv.contractId ? await this.getContract(inv.contractId) : undefined;
      const client = inv.clientId ? await this.getClient(inv.clientId) : undefined;
      let purchaseOrder: PurchaseOrder | undefined;
      if (contract?.purchaseOrderId) {
        const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, contract.purchaseOrderId));
        purchaseOrder = po;
      }
      result.push({ ...inv, project, contract, client, purchaseOrder });
    }
    return result;
  }

  async getInvoice(id: string): Promise<InvoiceWithDetails | undefined> {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!inv) return undefined;
    
    const project = inv.projectId ? await this.getProject(inv.projectId) : undefined;
    const contract = inv.contractId ? await this.getContract(inv.contractId) : undefined;
    const client = inv.clientId ? await this.getClient(inv.clientId) : undefined;
    let purchaseOrder: PurchaseOrder | undefined;
    if (contract?.purchaseOrderId) {
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, contract.purchaseOrderId));
      purchaseOrder = po;
    }
    return { ...inv, project, contract, client, purchaseOrder };
  }

  async getInvoicesByProject(projectId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, projectId))
      .orderBy(desc(invoices.createdAt));
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [inv] = await db
      .update(invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return inv;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    const result = await db.delete(invoices).where(eq(invoices.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Contract Attachments
  async getContractAttachments(contractId: string): Promise<ContractAttachment[]> {
    return db.select().from(contractAttachments).where(eq(contractAttachments.contractId, contractId)).orderBy(desc(contractAttachments.createdAt));
  }

  async getContractAttachment(id: string): Promise<ContractAttachment | undefined> {
    const [attachment] = await db.select().from(contractAttachments).where(eq(contractAttachments.id, id));
    return attachment;
  }

  async createContractAttachment(data: InsertContractAttachment): Promise<ContractAttachment> {
    const [attachment] = await db.insert(contractAttachments).values(data).returning();
    return attachment;
  }

  async deleteContractAttachment(id: string): Promise<boolean> {
    const result = await db.delete(contractAttachments).where(eq(contractAttachments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Contract Options
  async getContractOptions(contractId: string): Promise<ContractOptionWithInspectors[]> {
    const optionsList = await db
      .select()
      .from(contractOptions)
      .where(eq(contractOptions.contractId, contractId))
      .orderBy(contractOptions.optionNumber);
    
    const optionsWithInspectors: ContractOptionWithInspectors[] = [];
    for (const option of optionsList) {
      const inspectors = await db
        .select()
        .from(contractOptionInspectors)
        .where(eq(contractOptionInspectors.optionId, option.id));
      optionsWithInspectors.push({ ...option, inspectors });
    }
    return optionsWithInspectors;
  }

  async createContractOption(data: InsertContractOption): Promise<ContractOption> {
    const [option] = await db.insert(contractOptions).values(data).returning();
    return option;
  }

  async deleteContractOptions(contractId: string): Promise<boolean> {
    const result = await db.delete(contractOptions).where(eq(contractOptions.contractId, contractId));
    return (result.rowCount ?? 0) > 0;
  }

  async createContractOptionInspector(data: InsertContractOptionInspector): Promise<ContractOptionInspector> {
    const [inspector] = await db.insert(contractOptionInspectors).values(data).returning();
    return inspector;
  }

  // Contract Notifications
  async getContractNotifications(contractId: string): Promise<ContractNotification[]> {
    return await db
      .select()
      .from(contractNotifications)
      .where(eq(contractNotifications.contractId, contractId))
      .orderBy(desc(contractNotifications.sentAt));
  }

  async hasNotificationBeenSent(contractId: string, notificationType: string, daysBefore: number): Promise<boolean> {
    const existing = await db
      .select()
      .from(contractNotifications)
      .where(
        and(
          eq(contractNotifications.contractId, contractId),
          eq(contractNotifications.notificationType, notificationType as any),
          eq(contractNotifications.daysBefore, daysBefore)
        )
      )
      .limit(1);
    return existing.length > 0;
  }

  async createContractNotification(data: InsertContractNotification): Promise<ContractNotification> {
    const [notification] = await db.insert(contractNotifications).values(data).returning();
    return notification;
  }

  async getAllContractsWithUpcomingDates(): Promise<ContractWithProjects[]> {
    // Get all contracts that have at least one upcoming date
    const allContracts = await db
      .select()
      .from(contracts)
      .orderBy(desc(contracts.createdAt));
    
    const result: ContractWithProjects[] = [];
    
    for (const contract of allContracts) {
      // Get related data
      const contractProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.contractId, contract.id));
      
      let client: Client | undefined;
      if (contract.clientId) {
        const [c] = await db.select().from(clients).where(eq(clients.id, contract.clientId));
        client = c;
      }
      
      let purchaseOrder: PurchaseOrder | undefined;
      if (contract.purchaseOrderId) {
        const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, contract.purchaseOrderId));
        purchaseOrder = po;
      }
      
      result.push({
        ...contract,
        projects: contractProjects,
        client,
        purchaseOrder,
      });
    }
    
    return result;
  }

  async getCompanyAdminEmails(companyId: string): Promise<string[]> {
    // Get all company members with admin role
    const adminMembers = await db
      .select({
        userId: companyMembers.userId,
      })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, companyId),
          or(
            eq(companyMembers.role, 'admin'),
            eq(companyMembers.role, 'owner')
          )
        )
      );
    
    const emails: string[] = [];
    
    for (const member of adminMembers) {
      // Try to get email from user profile first
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, member.userId));
      
      if (profile?.email) {
        emails.push(profile.email);
      } else {
        // Fall back to auth user email
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, member.userId));
        
        if (user?.email) {
          emails.push(user.email);
        }
      }
    }
    
    return emails;
  }

  // Budget Notifications
  async hasBudgetNotificationBeenSent(contractId: string, milestonePercent: number): Promise<boolean> {
    const existing = await db
      .select()
      .from(budgetNotifications)
      .where(
        and(
          eq(budgetNotifications.contractId, contractId),
          eq(budgetNotifications.milestonePercent, milestonePercent)
        )
      )
      .limit(1);
    return existing.length > 0;
  }

  async createBudgetNotification(data: InsertBudgetNotification): Promise<BudgetNotification> {
    const [notification] = await db.insert(budgetNotifications).values(data).returning();
    return notification;
  }

  async getBudgetNotificationsForContract(contractId: string): Promise<BudgetNotification[]> {
    return db
      .select()
      .from(budgetNotifications)
      .where(eq(budgetNotifications.contractId, contractId))
      .orderBy(desc(budgetNotifications.sentAt));
  }

  // Project Budget Notifications
  async hasProjectBudgetNotificationBeenSent(projectId: string, milestonePercent: number): Promise<boolean> {
    const existing = await db
      .select()
      .from(projectBudgetNotifications)
      .where(
        and(
          eq(projectBudgetNotifications.projectId, projectId),
          eq(projectBudgetNotifications.milestonePercent, milestonePercent)
        )
      )
      .limit(1);
    return existing.length > 0;
  }

  async createProjectBudgetNotification(data: InsertProjectBudgetNotification): Promise<ProjectBudgetNotification> {
    const [notification] = await db.insert(projectBudgetNotifications).values(data).returning();
    return notification;
  }

  async getProjectBudgetNotifications(projectId: string): Promise<ProjectBudgetNotification[]> {
    return db
      .select()
      .from(projectBudgetNotifications)
      .where(eq(projectBudgetNotifications.projectId, projectId))
      .orderBy(desc(projectBudgetNotifications.sentAt));
  }

  async getProjectsWithBudgets(): Promise<Project[]> {
    return db
      .select()
      .from(projects)
      .where(sql`${projects.budgetAmount} IS NOT NULL AND CAST(${projects.budgetAmount} AS NUMERIC) > 0`);
  }

  // Cert Expiry Notifications
  async hasCertExpiryNotificationBeenSent(
    inspectorId: string,
    inspectorType: string,
    certName: string,
    expiresAt: string,
    windowDays: number
  ): Promise<boolean> {
    const existing = await db
      .select()
      .from(certExpiryNotifications)
      .where(
        and(
          eq(certExpiryNotifications.inspectorId, inspectorId),
          eq(certExpiryNotifications.inspectorType, inspectorType),
          eq(certExpiryNotifications.certName, certName),
          eq(certExpiryNotifications.expiresAt, expiresAt),
          eq(certExpiryNotifications.windowDays, windowDays)
        )
      )
      .limit(1);
    return existing.length > 0;
  }

  async createCertExpiryNotification(data: InsertCertExpiryNotification): Promise<CertExpiryNotification> {
    const [notification] = await db.insert(certExpiryNotifications).values(data).returning();
    return notification;
  }

  async getAllInspectorsWithCerts(): Promise<{
    users: Array<{ id: string; companyId: string; name: string; email: string | null; certifications: CertEntry[] }>;
    teamInspectors: Array<{ id: string; companyId: string; name: string; email: string | null; certifications: CertEntry[] }>;
  }> {
    // User inspectors: join company_members to get companyId since userProfiles doesn't have it
    const [userRows, teamRows] = await Promise.all([
      db.select({
        id: userProfiles.userId,
        companyId: companyMembers.companyId,
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
        certifications: userProfiles.certifications,
        email: users.email,
      }).from(userProfiles)
        .innerJoin(companyMembers, eq(companyMembers.userId, userProfiles.userId))
        .leftJoin(users, eq(users.id, userProfiles.userId))
        .where(sql`${userProfiles.certifications} IS NOT NULL`),
      db.select({
        id: teamInspectors.id,
        companyId: teamInspectors.companyId,
        name: teamInspectors.name,
        email: teamInspectors.email,
        certifications: teamInspectors.certifications,
      }).from(teamInspectors).where(sql`${teamInspectors.certifications} IS NOT NULL`),
    ]);

    // Deduplicate user rows (a user may belong to multiple companies; keep one row per user per company)
    const userResults: Array<{ id: string; companyId: string; name: string; email: string | null; certifications: CertEntry[] }> = [];
    const seen = new Set<string>();
    for (const r of userRows) {
      if (!r.id || !r.companyId) continue;
      const key = `${r.id}:${r.companyId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const certs = normalizeCerts(r.certifications);
      if (certs.length === 0) continue;
      userResults.push({
        id: r.id,
        companyId: r.companyId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.id,
        email: r.email || null,
        certifications: certs,
      });
    }

    return {
      users: userResults,
      teamInspectors: teamRows.map((r) => ({
        id: r.id!,
        companyId: r.companyId!,
        name: r.name || r.id!,
        email: r.email || null,
        certifications: normalizeCerts(r.certifications),
      })).filter((r) => r.certifications.length > 0),
    };
  }

  // Proposals
  async getProposals(companyId: string): Promise<ProposalWithDetails[]> {
    const proposalList = await db
      .select()
      .from(proposals)
      .where(eq(proposals.companyId, companyId))
      .orderBy(desc(proposals.createdAt));
    
    const proposalsWithDetails: ProposalWithDetails[] = [];
    for (const proposal of proposalList) {
      let client: Client | undefined;
      if (proposal.clientId) {
        const [c] = await db.select().from(clients).where(eq(clients.id, proposal.clientId));
        client = c;
      }
      
      // Get options with inspectors
      const optionsList = await db
        .select()
        .from(proposalOptions)
        .where(eq(proposalOptions.proposalId, proposal.id))
        .orderBy(proposalOptions.optionNumber);
      
      const optionsWithInspectors = [];
      for (const option of optionsList) {
        const inspectors = await db
          .select()
          .from(proposalOptionInspectors)
          .where(eq(proposalOptionInspectors.optionId, option.id));
        optionsWithInspectors.push({ ...option, inspectors });
      }
      
      proposalsWithDetails.push({ ...proposal, options: optionsWithInspectors, client });
    }
    return proposalsWithDetails;
  }

  async getProposal(id: string): Promise<ProposalWithDetails | undefined> {
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id));
    if (!proposal) return undefined;
    
    let client: Client | undefined;
    if (proposal.clientId) {
      const [c] = await db.select().from(clients).where(eq(clients.id, proposal.clientId));
      client = c;
    }
    
    // Get options with inspectors
    const optionsList = await db
      .select()
      .from(proposalOptions)
      .where(eq(proposalOptions.proposalId, proposal.id))
      .orderBy(proposalOptions.optionNumber);
    
    const optionsWithInspectors = [];
    for (const option of optionsList) {
      const inspectors = await db
        .select()
        .from(proposalOptionInspectors)
        .where(eq(proposalOptionInspectors.optionId, option.id));
      optionsWithInspectors.push({ ...option, inspectors });
    }
    
    return { ...proposal, options: optionsWithInspectors, client };
  }

  async getProposalByProjectId(projectId: string): Promise<ProposalWithDetails | undefined> {
    const [proposal] = await db.select().from(proposals).where(eq(proposals.projectId, projectId));
    if (!proposal) return undefined;
    
    let client: Client | undefined;
    if (proposal.clientId) {
      const [c] = await db.select().from(clients).where(eq(clients.id, proposal.clientId));
      client = c;
    }
    
    // Get options with inspectors
    const optionsList = await db
      .select()
      .from(proposalOptions)
      .where(eq(proposalOptions.proposalId, proposal.id))
      .orderBy(proposalOptions.optionNumber);
    
    const optionsWithInspectors = [];
    for (const option of optionsList) {
      const inspectors = await db
        .select()
        .from(proposalOptionInspectors)
        .where(eq(proposalOptionInspectors.optionId, option.id));
      optionsWithInspectors.push({ ...option, inspectors });
    }
    
    return { ...proposal, options: optionsWithInspectors, client };
  }

  async createProposal(data: InsertProposal): Promise<Proposal> {
    const [proposal] = await db.insert(proposals).values(data).returning();
    return proposal;
  }

  async updateProposal(id: string, data: Partial<InsertProposal>): Promise<Proposal | undefined> {
    const [proposal] = await db
      .update(proposals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning();
    return proposal;
  }

  async deleteProposal(id: string): Promise<boolean> {
    const result = await db.delete(proposals).where(eq(proposals.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextProposalNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(proposals)
      .where(
        and(
          eq(proposals.companyId, companyId),
          sql`EXTRACT(YEAR FROM ${proposals.createdAt}) = ${year}`
        )
      );
    const count = (result?.count || 0) + 1;
    return `PROP-${year}-${String(count).padStart(4, '0')}`;
  }

  // Proposal Options
  async createProposalOption(data: InsertProposalOption): Promise<ProposalOption> {
    const [option] = await db.insert(proposalOptions).values(data).returning();
    return option;
  }

  async deleteProposalOptions(proposalId: string): Promise<boolean> {
    const result = await db.delete(proposalOptions).where(eq(proposalOptions.proposalId, proposalId));
    return (result.rowCount ?? 0) > 0;
  }

  // Proposal Option Inspectors
  async createProposalOptionInspector(data: InsertProposalOptionInspector): Promise<ProposalOptionInspector> {
    const [inspector] = await db.insert(proposalOptionInspectors).values(data).returning();
    return inspector;
  }

  // IOR Agreements
  async getIorAgreements(companyId: string): Promise<IorAgreementWithDetails[]> {
    const agreements = await db
      .select()
      .from(iorAgreements)
      .where(eq(iorAgreements.companyId, companyId))
      .orderBy(desc(iorAgreements.createdAt));
    
    const agreementsWithDetails: IorAgreementWithDetails[] = [];
    for (const agreement of agreements) {
      let contract: Contract | undefined;
      let project: Project | undefined;
      let inspector: User | undefined;
      
      if (agreement.contractId) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, agreement.contractId));
        contract = c;
      }
      
      if (agreement.projectId) {
        const [p] = await db.select().from(projects).where(eq(projects.id, agreement.projectId));
        project = p;
      }
      
      if (agreement.inspectorId) {
        const [u] = await db.select().from(users).where(eq(users.id, agreement.inspectorId));
        inspector = u;
      }
      
      agreementsWithDetails.push({ ...agreement, contract, project, inspector });
    }
    
    return agreementsWithDetails;
  }

  async getIorAgreement(id: string): Promise<IorAgreementWithDetails | undefined> {
    const [agreement] = await db.select().from(iorAgreements).where(eq(iorAgreements.id, id));
    if (!agreement) return undefined;
    
    let contract: Contract | undefined;
    let project: Project | undefined;
    let inspector: User | undefined;
    
    if (agreement.contractId) {
      const [c] = await db.select().from(contracts).where(eq(contracts.id, agreement.contractId));
      contract = c;
    }
    
    if (agreement.projectId) {
      const [p] = await db.select().from(projects).where(eq(projects.id, agreement.projectId));
      project = p;
    }
    
    if (agreement.inspectorId) {
      const [u] = await db.select().from(users).where(eq(users.id, agreement.inspectorId));
      inspector = u;
    }
    
    return { ...agreement, contract, project, inspector };
  }

  async getIorAgreementByProjectAndInspector(projectId: string, inspectorId: string): Promise<IorAgreement | undefined> {
    const [agreement] = await db
      .select()
      .from(iorAgreements)
      .where(and(eq(iorAgreements.projectId, projectId), eq(iorAgreements.inspectorId, inspectorId)));
    return agreement;
  }

  async createIorAgreement(data: InsertIorAgreement): Promise<IorAgreement> {
    const [agreement] = await db.insert(iorAgreements).values(data).returning();
    return agreement;
  }

  async updateIorAgreement(id: string, data: Partial<InsertIorAgreement>): Promise<IorAgreement | undefined> {
    const [agreement] = await db
      .update(iorAgreements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(iorAgreements.id, id))
      .returning();
    return agreement;
  }

  async deleteIorAgreement(id: string): Promise<boolean> {
    const result = await db.delete(iorAgreements).where(eq(iorAgreements.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextIorAgreementNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(iorAgreements)
      .where(
        and(
          eq(iorAgreements.companyId, companyId),
          sql`EXTRACT(YEAR FROM ${iorAgreements.createdAt}) = ${year}`
        )
      );
    const count = (result?.count || 0) + 1;
    return `IOR-${year}-${String(count).padStart(4, '0')}`;
  }

  async getInvoicesByContract(contractId: string): Promise<{ totalAmount: string; regularHours: string; overtimeHours: string; premiumHours: string }[]> {
    const results = await db
      .select({
        totalAmount: invoices.totalAmount,
        regularHours: invoices.regularHours,
        overtimeHours: invoices.overtimeHours,
        premiumHours: invoices.premiumHours,
      })
      .from(invoices)
      .where(eq(invoices.contractId, contractId));
    
    return results.map(r => ({
      totalAmount: r.totalAmount || '0',
      regularHours: r.regularHours || '0',
      overtimeHours: r.overtimeHours || '0',
      premiumHours: r.premiumHours || '0',
    }));
  }

  async getContractBudgetSummary(contractId: string): Promise<{ 
    totalBilled: number; 
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    premiumHours: number;
  }> {
    const invoiceData = await this.getInvoicesByContract(contractId);
    
    let totalBilled = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    let premiumHours = 0;
    
    for (const inv of invoiceData) {
      totalBilled += parseFloat(inv.totalAmount || '0');
      regularHours += parseFloat(inv.regularHours || '0');
      overtimeHours += parseFloat(inv.overtimeHours || '0');
      premiumHours += parseFloat(inv.premiumHours || '0');
    }
    
    return {
      totalBilled,
      totalHours: regularHours + overtimeHours + premiumHours,
      regularHours,
      overtimeHours,
      premiumHours,
    };
  }

  async getProjectsByContract(contractId: string): Promise<Project[]> {
    return db
      .select()
      .from(projects)
      .where(eq(projects.contractId, contractId))
      .orderBy(desc(projects.createdAt));
  }

  async getIorAgreementsByProject(projectId: string): Promise<IorAgreementWithDetails[]> {
    const agreements = await db
      .select()
      .from(iorAgreements)
      .where(eq(iorAgreements.projectId, projectId))
      .orderBy(desc(iorAgreements.createdAt));
    
    const agreementsWithDetails: IorAgreementWithDetails[] = [];
    for (const agreement of agreements) {
      let contract: Contract | undefined;
      let project: Project | undefined;
      let inspector: User | undefined;
      
      if (agreement.contractId) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, agreement.contractId));
        contract = c;
      }
      if (agreement.projectId) {
        const [p] = await db.select().from(projects).where(eq(projects.id, agreement.projectId));
        project = p;
      }
      if (agreement.inspectorId) {
        const [u] = await db.select().from(users).where(eq(users.id, agreement.inspectorId));
        inspector = u;
      }
      
      agreementsWithDetails.push({
        ...agreement,
        contract,
        project,
        inspector,
      });
    }
    
    return agreementsWithDetails;
  }

  async getReportsByContractProjects(contractId: string): Promise<(DailyReport & { projectName?: string })[]> {
    const contractProjects = await this.getProjectsByContract(contractId);
    if (contractProjects.length === 0) return [];
    
    const projectIds = contractProjects.map(p => p.id);
    const projectMap = new Map(contractProjects.map(p => [p.id, p.name]));
    
    const reports = await db
      .select()
      .from(dailyReports)
      .where(inArray(dailyReports.projectId, projectIds))
      .orderBy(desc(dailyReports.date));
    
    return reports.map(r => ({
      ...r,
      projectName: r.projectId ? projectMap.get(r.projectId) : undefined,
    }));
  }

  // Meetings
  async getMeetings(companyId: string, options?: { projectId?: string }): Promise<Meeting[]> {
    const conditions = [eq(meetings.companyId, companyId)];
    if (options?.projectId) {
      conditions.push(eq(meetings.projectId, options.projectId));
    }
    return await db
      .select()
      .from(meetings)
      .where(and(...conditions))
      .orderBy(desc(meetings.meetingDate));
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
    return meeting;
  }

  async createMeeting(data: InsertMeeting): Promise<Meeting> {
    const [meeting] = await db.insert(meetings).values(data).returning();
    return meeting;
  }

  async updateMeeting(id: string, data: Partial<InsertMeeting>): Promise<Meeting | undefined> {
    const [meeting] = await db
      .update(meetings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(meetings.id, id))
      .returning();
    return meeting;
  }

  async deleteMeeting(id: string): Promise<boolean> {
    const result = await db.delete(meetings).where(eq(meetings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextMeetingNumber(companyId: string, meetingType: string): Promise<string> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(meetings)
      .where(
        and(
          eq(meetings.companyId, companyId),
          eq(meetings.meetingType, meetingType as any)
        )
      );
    const nextNumber = (result?.count ?? 0) + 1;
    const prefix = meetingType.toUpperCase();
    return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
  }

  async getDismissedAlerts(userId: string, companyId: string): Promise<string[]> {
    const results = await db
      .select({ alertId: dismissedAlerts.alertId })
      .from(dismissedAlerts)
      .where(
        and(
          eq(dismissedAlerts.userId, userId),
          eq(dismissedAlerts.companyId, companyId)
        )
      );
    return results.map(r => r.alertId);
  }

  async dismissAlert(userId: string, alertId: string, companyId: string): Promise<void> {
    await db
      .insert(dismissedAlerts)
      .values({ userId, alertId, companyId })
      .onConflictDoNothing();
  }

  // Client Portal
  async getClientPortalUser(userId: string, companyId: string): Promise<ClientPortalUser | undefined> {
    const result = await db.query.clientPortalUsers.findFirst({
      where: and(
        eq(clientPortalUsers.userId, userId),
        eq(clientPortalUsers.companyId, companyId)
      ),
    });
    return result;
  }

  async getClientPortalUsersByUserId(userId: string): Promise<(ClientPortalUser & { company?: Company; client?: Client })[]> {
    const results = await db.query.clientPortalUsers.findMany({
      where: and(
        eq(clientPortalUsers.userId, userId),
        eq(clientPortalUsers.isActive, true)
      ),
      with: {
        company: true,
        client: true,
      },
    });
    return results;
  }

  async createClientPortalUser(data: InsertClientPortalUser): Promise<ClientPortalUser> {
    const [result] = await db.insert(clientPortalUsers).values(data).returning();
    return result;
  }

  async deleteClientPortalUser(id: string): Promise<boolean> {
    const result = await db.delete(clientPortalUsers).where(eq(clientPortalUsers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getClientPortalProjectAccess(clientPortalUserId: string): Promise<(ClientPortalProjectAccess & { project?: Project })[]> {
    const results = await db.query.clientPortalProjectAccess.findMany({
      where: eq(clientPortalProjectAccess.clientPortalUserId, clientPortalUserId),
      with: {
        project: true,
      },
    });
    return results;
  }

  async addClientPortalProjectAccess(clientPortalUserId: string, projectId: string): Promise<ClientPortalProjectAccess> {
    const [result] = await db
      .insert(clientPortalProjectAccess)
      .values({ clientPortalUserId, projectId })
      .onConflictDoNothing()
      .returning();
    return result;
  }

  async removeClientPortalProjectAccess(clientPortalUserId: string, projectId: string): Promise<boolean> {
    const result = await db
      .delete(clientPortalProjectAccess)
      .where(
        and(
          eq(clientPortalProjectAccess.clientPortalUserId, clientPortalUserId),
          eq(clientPortalProjectAccess.projectId, projectId)
        )
      );
    return (result.rowCount ?? 0) > 0;
  }

  // API Keys
  async getApiKeysByCompany(companyId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys)
      .where(and(eq(apiKeys.companyId, companyId), eq(apiKeys.isActive, true)))
      .orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(hash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)));
    return key;
  }

  async createApiKey(data: InsertApiKey): Promise<ApiKey> {
    const [key] = await db.insert(apiKeys).values(data).returning();
    return key;
  }

  async revokeApiKey(id: string, companyId: string): Promise<boolean> {
    const result = await db.update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async touchApiKey(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async getClientPortalUsersForCompany(companyId: string): Promise<(ClientPortalUser & { user?: User; client?: Client; projectAccess?: (ClientPortalProjectAccess & { project?: Project })[] })[]> {
    const results = await db.query.clientPortalUsers.findMany({
      where: eq(clientPortalUsers.companyId, companyId),
      with: {
        user: true,
        client: true,
        projectAccess: {
          with: {
            project: true,
          },
        },
      },
    });
    return results;
  }

  async getClientPortalUsersForProject(projectId: string): Promise<(ClientPortalUser & { user?: User })[]> {
    // Get users with explicit per-project access
    const accessRows = await db.query.clientPortalProjectAccess.findMany({
      where: eq(clientPortalProjectAccess.projectId, projectId),
      with: {
        clientPortalUser: {
          with: {
            user: true,
          },
        },
      },
    });
    type AccessRowWithUser = typeof accessRows[number] & {
      clientPortalUser: (ClientPortalUser & { user?: User }) | null;
    };
    const perProjectUsers = (accessRows as AccessRowWithUser[])
      .map(row => row.clientPortalUser)
      .filter((u): u is ClientPortalUser & { user?: User } => u !== null && u !== undefined);

    // Also include users with allProjectsAccess=true for the project's company/client
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!project) return perProjectUsers;

    const allAccessUsers = await db.query.clientPortalUsers.findMany({
      where: and(
        eq(clientPortalUsers.companyId, project.companyId),
        eq(clientPortalUsers.allProjectsAccess, true),
        eq(clientPortalUsers.isActive, true),
        project.clientId ? eq(clientPortalUsers.clientId, project.clientId) : undefined
      ),
      with: { user: true },
    });

    // Merge, deduplicate by portal user id
    const seen = new Set(perProjectUsers.map(u => u.id));
    for (const u of allAccessUsers) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        perProjectUsers.push(u as ClientPortalUser & { user?: User });
      }
    }
    return perProjectUsers;
  }

  async updateClientPortalUserAccessLevel(id: string, allProjectsAccess: boolean): Promise<ClientPortalUser> {
    const [result] = await db
      .update(clientPortalUsers)
      .set({ allProjectsAccess })
      .where(eq(clientPortalUsers.id, id))
      .returning();
    return result;
  }

  async getInspectorCandidates(companyId: string): Promise<InspectorCandidate[]> {
    return db.select().from(inspectorCandidates)
      .where(eq(inspectorCandidates.companyId, companyId))
      .orderBy(asc(inspectorCandidates.lastName), asc(inspectorCandidates.firstName));
  }

  async getInspectorCandidate(id: string): Promise<InspectorCandidate | undefined> {
    const [candidate] = await db.select().from(inspectorCandidates).where(eq(inspectorCandidates.id, id));
    return candidate;
  }

  async getInspectorCandidateByDsaId(companyId: string, dsaInspectorId: string): Promise<InspectorCandidate | undefined> {
    const [candidate] = await db.select().from(inspectorCandidates)
      .where(and(eq(inspectorCandidates.companyId, companyId), eq(inspectorCandidates.dsaInspectorId, dsaInspectorId)));
    return candidate;
  }

  async getInspectorCandidateByCertNumber(companyId: string, certNumber: string): Promise<InspectorCandidate | undefined> {
    const [candidate] = await db.select().from(inspectorCandidates)
      .where(and(eq(inspectorCandidates.companyId, companyId), eq(inspectorCandidates.certNumber, certNumber)));
    return candidate;
  }

  async createInspectorCandidate(data: InsertInspectorCandidate): Promise<InspectorCandidate> {
    const [candidate] = await db.insert(inspectorCandidates).values(data).returning();
    return candidate;
  }

  async updateInspectorCandidate(id: string, data: Partial<InsertInspectorCandidate>): Promise<InspectorCandidate | undefined> {
    const [candidate] = await db.update(inspectorCandidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inspectorCandidates.id, id))
      .returning();
    return candidate;
  }

  async deleteInspectorCandidate(id: string): Promise<boolean> {
    await db.delete(inspectorCandidates).where(eq(inspectorCandidates.id, id));
    return true;
  }

  async upsertInspectorCandidate(data: InsertInspectorCandidate): Promise<InspectorCandidate> {
    const existing = data.dsaInspectorId ? await this.getInspectorCandidateByDsaId(data.companyId, data.dsaInspectorId) : null;
    if (existing) {
      const updated = await this.updateInspectorCandidate(existing.id, {
        firstName: data.firstName,
        lastName: data.lastName,
        certNumber: data.certNumber,
        certExpDate: data.certExpDate,
        county: data.county,
        phone: data.phone,
        class1: data.class1 || existing.class1,
        class2: data.class2 || existing.class2,
        class3: data.class3 || existing.class3,
      });
      return updated!;
    }
    return this.createInspectorCandidate(data);
  }

  async getInspectorCandidateNotes(candidateId: string): Promise<(InspectorCandidateNote & { user?: User })[]> {
    const results = await db.select()
      .from(inspectorCandidateNotes)
      .leftJoin(users, eq(inspectorCandidateNotes.userId, users.id))
      .where(eq(inspectorCandidateNotes.candidateId, candidateId))
      .orderBy(desc(inspectorCandidateNotes.createdAt));
    return results.map(r => ({ ...r.inspector_candidate_notes, user: r.users || undefined }));
  }

  async createInspectorCandidateNote(data: InsertInspectorCandidateNote): Promise<InspectorCandidateNote> {
    const [note] = await db.insert(inspectorCandidateNotes).values(data).returning();
    return note;
  }

  // Inspector Document Vault
  async getInspectorDocuments(companyId: string, inspectorId: string): Promise<InspectorDocument[]> {
    return db.select()
      .from(inspectorDocuments)
      .where(and(
        eq(inspectorDocuments.companyId, companyId),
        eq(inspectorDocuments.inspectorId, inspectorId),
      ))
      .orderBy(desc(inspectorDocuments.uploadedAt));
  }

  async getInspectorDocument(id: string): Promise<InspectorDocument | undefined> {
    const [doc] = await db.select().from(inspectorDocuments).where(eq(inspectorDocuments.id, id));
    return doc;
  }

  async createInspectorDocument(data: InsertInspectorDocument): Promise<InspectorDocument> {
    const [doc] = await db.insert(inspectorDocuments).values(data).returning();
    return doc;
  }

  async deleteInspectorDocument(id: string): Promise<void> {
    await db.delete(inspectorDocuments).where(eq(inspectorDocuments.id, id));
  }

  // ─── Announcements ────────────────────────────────────────────────────────
  async createAnnouncement(data: InsertAnnouncement): Promise<InspectorAnnouncement> {
    const [row] = await db.insert(inspectorAnnouncements).values(data).returning();
    return row;
  }

  async getCompanyAnnouncements(companyId: string): Promise<(InspectorAnnouncement & { senderName?: string })[]> {
    const rows = await db
      .select({
        announcement: inspectorAnnouncements,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(inspectorAnnouncements)
      .leftJoin(users, eq(inspectorAnnouncements.sentById, users.id))
      .where(eq(inspectorAnnouncements.companyId, companyId))
      .orderBy(desc(inspectorAnnouncements.sentAt));
    return rows.map(r => {
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ");
      const senderName = fullName || r.email || undefined;
      return { ...r.announcement, senderName };
    });
  }

  async getInspectorAnnouncements(userId: string, companyIds: string[]): Promise<InspectorAnnouncement[]> {
    if (companyIds.length === 0) return [];
    const rows = await db
      .select()
      .from(inspectorAnnouncements)
      .where(
        and(
          inArray(inspectorAnnouncements.companyId, companyIds),
          sql`${inspectorAnnouncements.recipientUserIds}::jsonb @> ${JSON.stringify([userId])}::jsonb`
        )
      )
      .orderBy(desc(inspectorAnnouncements.sentAt));
    return rows;
  }

  async getUnreadAnnouncementCount(userId: string, companyIds: string[]): Promise<number> {
    if (companyIds.length === 0) return 0;
    const visible = await this.getInspectorAnnouncements(userId, companyIds);
    if (visible.length === 0) return 0;
    const visibleIds = visible.map(a => a.id);
    const readRows = await db
      .select({ announcementId: announcementReads.announcementId })
      .from(announcementReads)
      .where(and(eq(announcementReads.userId, userId), inArray(announcementReads.announcementId, visibleIds)));
    const readSet = new Set(readRows.map(r => r.announcementId));
    return visibleIds.filter(id => !readSet.has(id)).length;
  }

  async markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
    await db.insert(announcementReads)
      .values({ announcementId, userId })
      .onConflictDoNothing();
  }

  async isAnnouncementRead(announcementId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(announcementReads)
      .where(and(eq(announcementReads.announcementId, announcementId), eq(announcementReads.userId, userId)));
    return !!row;
  }
}

export const storage = new DatabaseStorage();
