import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage, db, projectComments, projectMembers, users, companyNotes, clientPortalUsers, projects } from "./storage";
import { sql, eq, and, desc, inArray, count, sum, countDistinct } from "drizzle-orm";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { insertProjectSchema, insertDailyReportSchema, updateUserProfileSchema, WorkActivityRow, VisitorRow, EquipmentRow, MaterialRow, insertContractSchema, insertClientSchema, InsertInspectorCandidate, companyMembers, userProfiles, dailyReports as dailyReportsTable, normalizeCerts, manualTimeEntries, inspectorDocuments, INSPECTOR_DOCUMENT_TYPES, type InspectorDocument } from "@shared/schema";
import { ObjectStorageService, registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID, randomBytes, createHash } from "crypto";
import zlib from "zlib";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDocument } from "pdf-lib";
import { format } from "date-fns";
import { speechToText, openai } from "./replit_integrations/audio/client";
import { generateTimesheetPdf, aggregateReportsToTimesheetData, aggregateManualEntriesToTimesheetData, generateInvoicePdf, InvoiceData, generateInspectorInvoicePdf, InspectorInvoiceData, generateMonthlySummaryPdf, generateWeeklySummaryPdf, generateCurrentStatusPdf } from "./billing-pdf";
import { generateResumePDF } from "./resume-pdf";
import { sendEmail } from "./replit_integrations/email/client";
import { registerChatRoutes } from "./replit_integrations/chat";
import { calculateScheduledBudget, calculateBaseBudgetBreakdown, type InspectorRate, type ScheduledBudgetResult, type BaseBudgetBreakdown, type BudgetTrackingMode } from "./budget-utils";

// Initialize object storage service for persistent file storage
const objectStorage = new ObjectStorageService();

// Ensure upload directories exist
const UPLOAD_DIR = path.join(process.cwd(), "storage");
const PHOTOS_DIR = path.join(UPLOAD_DIR, "uploads");
const SIGNATURES_DIR = path.join(UPLOAD_DIR, "signatures");
const REPORTS_DIR = path.join(UPLOAD_DIR, "reports");
const LOGOS_DIR = path.join(UPLOAD_DIR, "logos");
const ASSETS_DIR = path.join(process.cwd(), "public", "assets");

[PHOTOS_DIR, SIGNATURES_DIR, REPORTS_DIR, LOGOS_DIR, ASSETS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Role-based authorization middleware (respects inspector mode)
const isAdmin: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profile = await storage.getUserProfile(userId);
    
    // Use effective admin check that respects inspector mode
    if (!isEffectiveSystemAdmin(profile)) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Helper to check if user is System Owner (highest level)
// System Owner can manage System Admins
const isSystemOwner = (profile: any): boolean => {
  return profile?.role === "system_owner";
};

// Helper to check if user is System Admin (admin role) or higher (system_owner)
// Note: "owner" is legacy and treated as equivalent to "admin"
const isSystemAdmin = (profile: any): boolean => {
  return profile?.role === "admin" || profile?.role === "owner" || profile?.role === "system_owner";
};

// Helper to check if user is effectively acting as system admin (or system owner)
// Returns true only if user has admin/owner/system_owner role AND has admin mode enabled (not in inspector mode)
const isEffectiveSystemAdmin = (profile: any): boolean => {
  return (profile?.role === "admin" || profile?.role === "owner" || profile?.role === "system_owner") && profile?.preferAdminMode !== false;
};

// Knowland Construction Services - members bypass all subscription limits
const KNOWLAND_COMPANY_NAME = "Knowland Construction Services";

// Helper to check if user is a member of Knowland Construction Services
const isKnowlandMember = async (userId: string): Promise<boolean> => {
  const companies = await storage.getCompaniesForUser(userId);
  return companies.some(c => (c as any).company?.name === KNOWLAND_COMPANY_NAME);
};

// Import shared notification processing utilities
import { 
  computeContractStatusFromDates, 
  NOTIFICATION_INTERVALS, 
  processContractNotifications 
} from './notification-processor';

// Helper to get Knowland company if exists
const getKnowlandCompany = async (): Promise<{ id: string; name: string } | null> => {
  const companies = await storage.getCompanies();
  return companies.find(c => c.name === KNOWLAND_COMPANY_NAME) || null;
};

// Helper to check if user is effectively acting as company admin for a given company
// Returns true if user is a company admin AND has admin mode enabled
const isEffectiveCompanyAdmin = async (userId: string, companyId: string, profile: any): Promise<boolean> => {
  if (profile?.preferAdminMode === false) {
    return false; // In inspector mode, no admin powers
  }
  const membership = await storage.getCompanyMember(companyId, userId);
  return membership?.role === "admin";
};

// Multer config for photos - use memory storage for object storage upload
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for documents
});

// Multer config for app logo (admin settings) - use memory storage for object storage
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Multer config for company logos - use memory storage for object storage
const companyLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Multer config for resume upload (PDF, DOCX)
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, DOC, and TXT files are allowed"));
    }
  },
});

// Multer config for inspector vault documents (PDF, JPG, PNG, DOCX)
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPG, PNG, and DOCX files are allowed"));
    }
  },
});

// Multer config for audio files
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for audio
});

const availabilityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    cb(null, file.originalname.endsWith('.xlsx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  },
});

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  projectNumber: z.string().min(1, "Project number is required"),
  companyId: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  contractOptionId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  client: z.string().optional(),
  address: z.string().optional(),
  distributionEmails: z.array(z.string().email()).optional().default([]),
  defaultFolderPath: z.string().optional(),
  startDate: z.string().or(z.date()).transform(val => {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return new Date(val + 'T12:00:00');
    return new Date(val);
  }).nullable().optional(),
  substantialCompletionDate: z.string().or(z.date()).transform(val => {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return new Date(val + 'T12:00:00');
    return new Date(val);
  }).nullable().optional(),
  finalCloseoutDate: z.string().or(z.date()).transform(val => {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return new Date(val + 'T12:00:00');
    return new Date(val);
  }).nullable().optional(),
  budgetAmount: z.string().or(z.number()).transform(val => val ? String(val) : null).nullable().optional(),
  budgetedHours: z.string().or(z.number()).transform(val => val ? String(val) : null).nullable().optional(),
  baseBudget: z.string().or(z.number()).transform(val => val ? String(val) : null).nullable().optional(),
  budgetTrackingMode: z.enum(["daily_reports", "scheduled", "hybrid"]).nullable().optional(),
  inheritBillingRates: z.boolean().optional().default(true),
  scopeOfWork: z.string().nullable().optional(),
  projectValue: z.string().nullable().optional(),
  dsaFileNo: z.string().nullable().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const createReportSchema = z.object({
  projectId: z.string().min(1).nullable().optional(), // Optional to allow personal reports without a project
  date: z.string().or(z.date()).transform(val => {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return new Date(val + 'T12:00:00');
    }
    return new Date(val);
  }),
  weatherType: z.enum(["clear", "cloudy", "rain", "wind", "heat", "cold"]).optional(),
  weatherNotes: z.string().optional(),
  weatherAM: z.string().optional(),
  weatherPM: z.string().optional(),
  precipitation: z.string().optional(),
  siteConditions: z.string().optional(),
  typeOfWork: z.array(z.string()).optional().default([]),
  workPerformed: z.string().optional(),
  trades: z.array(z.object({ trade: z.string(), headcount: z.number() })).optional().default([]),
  manpower: z.array(z.object({ description: z.string(), count: z.number() })).optional().default([]),
  workActivities: z.array(z.object({ 
    trade: z.string().optional(),
    contractor: z.string(), 
    headcount: z.number(), 
    workDescription: z.string() 
  })).optional().default([]),
  visitors: z.array(z.object({ name: z.string(), company: z.string(), notes: z.string().optional() })).optional().default([]),
  equipment: z.string().optional(),
  equipmentRows: z.array(z.object({
    equipment: z.string(),
    hours: z.string().optional(),
    status: z.string().optional(),
    usage: z.string().optional(),
  })).optional().default([]),
  inspections: z.string().optional(),
  materialsDelivered: z.string().optional(),
  materialRows: z.array(z.object({
    material: z.string(),
    quantity: z.string().optional(),
    status: z.string().optional(),
    supplierNotes: z.string().optional(),
  })).optional().default([]),
  issuesFlag: z.boolean().optional(),
  issuesDetails: z.string().optional(),
  safetyFlag: z.boolean().optional(),
  safetyDetails: z.string().optional(),
  safetyIncidents: z.number().optional(),
  safetyNearMisses: z.number().optional(),
  safetyAttendees: z.number().nullable().optional(),
  safetySiteConditions: z.string().optional(),
  toolboxTalkTopic: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "submitted"]).optional(),
  // Time tracking fields
  timeIn: z.string().optional(),
  timeOut: z.string().optional(),
  regularHours: z.string().optional(),
  otHours: z.string().optional(),
});

const updateReportSchema = createReportSchema.partial();

const addProjectMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Set up auth before other routes
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Register object storage routes for persistent file storage
  registerObjectStorageRoutes(app);
  
  // Register AI chat routes
  registerChatRoutes(app);

  // Serve object storage files (authenticated access with ownership check)
  app.use("/objects", isAuthenticated, async (req: any, res, next) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // The full object path
      const objectPath = `/objects${req.path}`;

      // System admins can access all files (when in admin mode)
      if (isEffectiveSystemAdmin(profile)) {
        try {
          const objectFile = await objectStorage.getObjectEntityFile(objectPath);
          return await objectStorage.downloadObject(objectFile, res);
        } catch (err: any) {
          console.error("Error serving file for admin:", objectPath, err?.message || err);
          if (err?.name === 'ObjectNotFoundError') {
            return res.status(404).json({ message: "File not found" });
          }
          return res.status(500).json({ message: "Failed to serve file" });
        }
      }

      // Helper to check if user can access a report's files
      const canAccessReportFile = async (report: any): Promise<boolean> => {
        if (report.inspectorId === userId) return true;
        if (report.projectId) {
          const isMember = await storage.isUserMemberOfProject(report.projectId, userId);
          if (isMember) return true;
          const project = await storage.getProject(report.projectId);
          if (project?.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile)) {
            return true;
          }
        }
        return false;
      };

      // Parse the path to determine file type and permissions
      const pathParts = req.path.split('/');
      const folder = pathParts[1]; // photos, signatures, reports, logos
      const filename = pathParts[2];

      if (folder === 'photos') {
        // Photo files - check if user owns the report or is company admin
        const photo = await storage.getPhotoByPath(objectPath);
        if (photo) {
          const report = await storage.getReport(photo.reportId);
          if (report && await canAccessReportFile(report)) {
            try {
              const objectFile = await objectStorage.getObjectEntityFile(objectPath);
              return await objectStorage.downloadObject(objectFile, res);
            } catch (err: any) {
              console.error("Error serving photo:", objectPath, err?.message || err);
              if (err?.name === 'ObjectNotFoundError') {
                return res.status(404).json({ message: "Photo file not found" });
              }
              return res.status(500).json({ message: "Failed to serve photo" });
            }
          }
        }
      } else if (folder === 'signatures' || folder === 'reports') {
        // Signature and PDF files are named with report ID
        const reportId = filename?.replace(/\.(png|pdf)$/, '');
        console.log(`[PDF Debug] Requesting ${folder}/${filename}, reportId=${reportId}, objectPath=${objectPath}`);
        if (reportId) {
          const report = await storage.getReport(reportId);
          console.log(`[PDF Debug] Report lookup: found=${!!report}, inspectorId=${report?.inspectorId}, projectId=${report?.projectId}`);
          if (report && await canAccessReportFile(report)) {
            try {
              console.log(`[PDF Debug] Access granted, fetching from object storage...`);
              const objectFile = await objectStorage.getObjectEntityFile(objectPath);
              // Disable caching for PDFs to ensure latest version is served
              const isPdf = filename?.endsWith('.pdf');
              console.log(`[PDF Debug] Streaming file, isPdf=${isPdf}`);
              return await objectStorage.downloadObject(objectFile, res, isPdf ? 0 : 3600);
            } catch (err: any) {
              console.error("[PDF Debug] Error serving signature/PDF:", objectPath, err?.message || err);
              if (err?.name === 'ObjectNotFoundError') {
                return res.status(404).json({ message: "File not found. Please regenerate the PDF." });
              }
              return res.status(500).json({ message: "Failed to serve file" });
            }
          } else {
            console.log(`[PDF Debug] Access denied - report exists: ${!!report}`);
          }
        }
      } else if (folder === 'profile-photos') {
        try {
          const objectFile = await objectStorage.getObjectEntityFile(objectPath);
          return await objectStorage.downloadObject(objectFile, res, 3600);
        } catch (err: any) {
          if (err?.name === 'ObjectNotFoundError') {
            return res.status(404).json({ message: "Profile photo not found" });
          }
          return res.status(500).json({ message: "Failed to serve profile photo" });
        }
      } else if (folder === 'logos') {
        // Company logos - allow access for authenticated users who are members of the company
        const companies = await storage.getCompanies();
        const owningCompany = companies.find(c => c.logoPath === objectPath);
        
        if (owningCompany) {
          const isMember = await storage.isUserMemberOfCompany(owningCompany.id, userId);
          if (isMember) {
            try {
              const objectFile = await objectStorage.getObjectEntityFile(objectPath);
              return await objectStorage.downloadObject(objectFile, res);
            } catch (err: any) {
              console.error("Error serving logo:", objectPath, err?.message || err);
              if (err?.name === 'ObjectNotFoundError') {
                return res.status(404).json({ message: "Logo file not found" });
              }
              return res.status(500).json({ message: "Failed to serve logo" });
            }
          }
        }
      }

      return res.status(403).json({ message: "Access denied" });
    } catch (error) {
      console.error("Error serving object storage file:", error);
      return res.status(500).json({ message: "Failed to serve file" });
    }
  });

  // Serve static files from storage (authenticated access with ownership check - legacy support)
  app.use("/storage", isAuthenticated, async (req: any, res, next) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Safely resolve path within UPLOAD_DIR (prevent path traversal)
      const requestedPath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.resolve(UPLOAD_DIR, '.' + requestedPath);
      
      // Ensure resolved path is within UPLOAD_DIR
      if (!filePath.startsWith(UPLOAD_DIR)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Check if file exists locally; if not, we'll try object storage later for migrated files
      const fileExistsLocally = fs.existsSync(filePath);

      // System admins can access all files (when in admin mode)
      if (isEffectiveSystemAdmin(profile)) {
        if (fileExistsLocally) {
          return res.sendFile(filePath);
        }
        // Try object storage for migrated files
        const pathParts = req.path.split('/');
        if (pathParts[1] === 'uploads') {
          const filename = pathParts[2];
          try {
            const objectPath = `/objects/photos/${filename}`;
            const objectFile = await objectStorage.getObjectEntityFile(objectPath);
            return await objectStorage.downloadObject(objectFile, res);
          } catch (err) {
            return res.status(404).json({ message: "File not found" });
          }
        }
        return res.status(404).json({ message: "File not found" });
      }

      // Helper to check if user can access a report's files
      const canAccessReportFile = async (report: any): Promise<boolean> => {
        // Owner can always access
        if (report.inspectorId === userId) return true;
        
        // Company admin (when in admin mode) can access reports in their company
        if (report.projectId) {
          const project = await storage.getProject(report.projectId);
          if (project?.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile)) {
            return true;
          }
        }
        return false;
      };

      // Check ownership based on file type
      const pathParts = req.path.split('/');
      
      if (pathParts[1] === 'uploads') {
        // Photo files - check if user owns the report or is company admin
        const filename = pathParts[2];
        const photoPath = `/storage/uploads/${filename}`;
        const photo = await storage.getPhotoByPath(photoPath);
        if (photo) {
          const report = await storage.getReport(photo.reportId);
          if (report && await canAccessReportFile(report)) {
            // Try local file first, then object storage for migrated files
            if (fileExistsLocally) {
              return res.sendFile(filePath);
            }
            // Try object storage for migrated files
            const objectPath = `/objects/photos/${filename}`;
            try {
              const objectFile = await objectStorage.getObjectEntityFile(objectPath);
              return await objectStorage.downloadObject(objectFile, res);
            } catch (err) {
              console.error('Photo not found in object storage:', objectPath, err);
              return res.status(404).json({ message: "Photo file not found" });
            }
          }
        }
      } else if (pathParts[1] === 'signatures' || pathParts[1] === 'reports') {
        // Signature and PDF files are named with report ID
        const filename = pathParts[2];
        const reportId = filename?.replace(/\.(png|pdf)$/, '');
        if (reportId) {
          const report = await storage.getReport(reportId);
          if (report && await canAccessReportFile(report)) {
            return res.sendFile(filePath);
          }
        }
      } else if (pathParts[1] === 'logos') {
        // Company logos - allow access for authenticated users who are members of the company
        const filename = pathParts[2];
        const logoPath = `/storage/logos/${filename}`;
        
        // Find which company owns this logo
        const companies = await storage.getCompanies();
        const owningCompany = companies.find(c => c.logoPath === logoPath);
        
        if (owningCompany) {
          // Check if user is a member of this company
          const isMember = await storage.isUserMemberOfCompany(owningCompany.id, userId);
          if (isMember) {
            return res.sendFile(filePath);
          }
        }
      }

      return res.status(403).json({ message: "Access denied" });
    } catch (error) {
      console.error("Error serving file:", error);
      return res.status(500).json({ message: "Failed to serve file" });
    }
  });

  // ========== PROJECTS ==========
  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Get user's assigned projects (needed for inspector mode or regular inspectors)
      const assignedProjectIds = await storage.getProjectsForUser(userId);
      
      // If preferAdminMode is false (inspector toggle ON), show only assigned projects
      if (profile?.preferAdminMode === false) {
        const projectsList = await storage.getProjects();
        const filtered = projectsList.filter(p => assignedProjectIds.includes(p.id));
        return res.json(filtered);
      }
      
      let projectsList = await storage.getProjects();
      
      // System admins see ALL projects (when in admin mode)
      if (isEffectiveSystemAdmin(profile)) {
        res.json(projectsList);
        return;
      }
      
      // Get all companies where user is an admin
      const userCompanyMemberships = await storage.getCompaniesForUser(userId);
      const adminCompanyIds = userCompanyMemberships
        .filter(m => m.role === "admin")
        .map(m => m.companyId);
      
      // Filter projects: include if user is company admin OR assigned to project
      projectsList = projectsList.filter(p => 
        (p.companyId && adminCompanyIds.includes(p.companyId)) || 
        assignedProjectIds.includes(p.id)
      );
      
      res.json(projectsList);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // System admins can view any project (when in admin mode)
      if (isEffectiveSystemAdmin(profile)) {
        return res.json(project);
      }
      
      // Company admins can view any project in their company (when in admin mode)
      if (project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile)) {
        return res.json(project);
      }
      
      // Regular inspectors (or admins in inspector mode) can only view projects they're assigned to
      const isProjectMember = await storage.isUserMemberOfProject(req.params.id, userId);
      if (!isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.get("/api/projects/:id/daily-reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const hasAccess = isEffectiveSystemAdmin(profile) ||
        (project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile)) ||
        await storage.isUserMemberOfProject(req.params.id, userId);
      if (!hasAccess) return res.status(403).json({ message: "Access denied" });

      const { offset = '0', limit = '10', sortBy = 'date', sortOrder = 'desc', startDate, endDate, inspectorId, search } = req.query;

      const allReports = await storage.getReportsByProject(req.params.id);

      let filtered = [...allReports];

      if (startDate) {
        const start = new Date(startDate as string);
        filtered = filtered.filter(r => new Date(r.date) >= start);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(r => new Date(r.date) <= end);
      }
      if (inspectorId) {
        filtered = filtered.filter(r => r.inspectorId === inspectorId);
      }
      if (search) {
        const s = (search as string).toLowerCase();
        filtered = filtered.filter(r =>
          (r.workPerformed || '').toLowerCase().includes(s) ||
          (r.notes || '').toLowerCase().includes(s) ||
          (r.issuesDetails || '').toLowerCase().includes(s) ||
          (r.equipment || '').toLowerCase().includes(s)
        );
      }

      filtered.sort((a, b) => {
        if (sortBy === 'date') {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          return sortOrder === 'asc' ? da - db : db - da;
        }
        return 0;
      });

      const total = filtered.length;
      const off = parseInt(offset as string, 10);
      const lim = parseInt(limit as string, 10);
      const paginated = filtered.slice(off, off + lim);

      const inspectorIds = [...new Set(allReports.map(r => r.inspectorId))];
      const inspectors: { id: string; name: string }[] = [];
      for (const iId of inspectorIds) {
        const p = await storage.getUserProfile(iId);
        const u = await storage.getUserById(iId);
        const name = p?.firstName && p?.lastName ? `${p.firstName} ${p.lastName}` : u?.firstName && u?.lastName ? `${u.firstName} ${u.lastName}` : u?.email || 'Unknown';
        inspectors.push({ id: iId, name });
      }

      const inspectorMap = Object.fromEntries(inspectors.map(i => [i.id, i.name]));
      const reportsWithNames = paginated.map(r => ({
        ...r,
        inspectorName: inspectorMap[r.inspectorId] || 'Unknown',
      }));

      res.json({ reports: reportsWithNames, total, inspectors });
    } catch (error) {
      console.error("Error fetching project daily reports:", error);
      res.status(500).json({ message: "Failed to fetch daily reports" });
    }
  });

  // Get project dashboard data for inspectors (limited info - no financial data)
  app.get("/api/projects/:id/dashboard", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const project = await storage.getProject(req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      const isCompAdmin = project.companyId ? await isEffectiveCompanyAdmin(userId, project.companyId, profile) : false;
      const isMember = project.companyId ? await storage.isUserMemberOfCompany(project.companyId, userId) : false;
      const isProjectMember = await storage.isUserMemberOfProject(req.params.id, userId);
      
      if (!isMember && !isSysAdmin && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Determine if user has admin access for certain admin-only features
      const hasAdminAccess = isSysAdmin || isCompAdmin;
      
      // Calculate schedule progress
      const now = new Date();
      let scheduleProgress = 0;
      let daysRemaining: number | null = null;
      let daysOverdue: number | null = null;
      let scheduleStatus: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete' = 'not_started';
      
      if (project.startDate && project.substantialCompletionDate) {
        const startDate = new Date(project.startDate);
        const endDate = new Date(project.substantialCompletionDate);
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        
        if (now < startDate) {
          scheduleProgress = 0;
          scheduleStatus = 'not_started';
          daysRemaining = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        } else if (now > endDate) {
          scheduleProgress = 100;
          daysOverdue = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = 'overdue';
        } else {
          scheduleProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
          daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = scheduleProgress >= 80 ? 'warning' : 'on_track';
        }
      }
      
      // Get daily reports for this project - show all reports for transparency
      const allDailyReports = await storage.getReportsByProject(req.params.id);
      const dailyReports = allDailyReports; // All inspectors see all project data for transparency
      
      // Calculate hours from ALL daily reports for budget tracking (no dollar amounts - only hours)
      // This uses allDailyReports to ensure budget calculations are accurate
      let dailyReportRegularHours = 0;
      let dailyReportOvertimeHours = 0;
      let dailyReportPremiumHours = 0;
      
      for (const report of allDailyReports) {
        dailyReportRegularHours += parseFloat(report.regularHours || '0');
        dailyReportOvertimeHours += parseFloat(report.otHours || '0');
        dailyReportPremiumHours += parseFloat((report as any).premiumHours || '0');
      }
      
      const dailyReportHoursUsed = dailyReportRegularHours + dailyReportOvertimeHours + dailyReportPremiumHours;
      
      // Get manual time entries for budget tracking (timesheet hours)
      const manualEntries = await storage.getAllManualTimeEntriesForProject(req.params.id);
      let manualRegularHours = 0;
      let manualOvertimeHours = 0;
      
      for (const entry of manualEntries) {
        manualRegularHours += parseFloat(entry.regularHours || '0');
        manualOvertimeHours += parseFloat(entry.otHours || '0');
      }
      
      const manualHoursUsed = manualRegularHours + manualOvertimeHours;
      
      // Get base hours entries (pre-onboarding hours per inspector)
      const baseHoursEntries = await storage.getProjectBaseHours(req.params.id);
      let baseHoursRegular = 0;
      let baseHoursOvertime = 0;
      let baseHoursBilledAmount = 0;
      
      for (const entry of baseHoursEntries) {
        baseHoursRegular += parseFloat(entry.regularHours || '0');
        baseHoursOvertime += parseFloat(entry.overtimeHours || '0');
        baseHoursBilledAmount += parseFloat(entry.billedAmount || '0');
      }
      
      const baseHoursTotal = baseHoursRegular + baseHoursOvertime;
      
      // Combined totals for budget tracking (daily reports + manual entries + base hours)
      const totalRegularHours = dailyReportRegularHours + manualRegularHours + baseHoursRegular;
      const totalOvertimeHours = dailyReportOvertimeHours + manualOvertimeHours + baseHoursOvertime;
      const totalPremiumHours = dailyReportPremiumHours;
      const totalHoursUsed = dailyReportHoursUsed + manualHoursUsed + baseHoursTotal;
      
      // Get budgeted hours from project (or contract if linked)
      let budgetedHours: number | null = null;
      
      // baseBudget is a dollar amount (pre-billed amount before onboarding), NOT hours
      // The actual base hours come from projectBaseHours entries (already included in totalHoursUsed via baseHoursTotal)
      const baseBudgetAmount = project.baseBudget ? parseFloat(project.baseBudget) : 0;
      
      if (project.budgetedHours) {
        // Use the dedicated budgeted hours field
        budgetedHours = parseFloat(project.budgetedHours);
      }
      
      // If project is linked to a contract option, get budgeted hours from there
      if (project.contractOptionId && project.contractId) {
        const contractOptions = await storage.getContractOptions(project.contractId);
        const contractOption = contractOptions.find(opt => opt.id === project.contractOptionId);
        if (contractOption?.inspectors) {
          budgetedHours = contractOption.inspectors.reduce((sum: number, i: { hours?: string }) => sum + parseFloat(i.hours || '0'), 0);
        }
      }
      
      // Budget progress (hours-based only)
      // totalHoursUsed already includes base hours from projectBaseHours entries
      let budgetProgress = 0;
      let budgetStatus: 'under' | 'on_track' | 'warning' | 'over' = 'on_track';
      const effectiveBudgetedHours = budgetedHours || 0;
      const effectiveTotalHours = totalHoursUsed; // Base hours already included in totalHoursUsed
      
      if (effectiveBudgetedHours > 0) {
        budgetProgress = (effectiveTotalHours / effectiveBudgetedHours) * 100;
        if (budgetProgress >= 100) {
          budgetStatus = 'over';
        } else if (budgetProgress >= 80) {
          budgetStatus = 'warning';
        } else if (budgetProgress < 50) {
          budgetStatus = 'under';
        }
      }
      
      // Activity Timeline - Recent activities from reports
      const activityTimeline = dailyReports
        .slice(0, 20)
        .map(r => ({
          id: r.id,
          type: 'report' as const,
          date: r.createdAt ? r.createdAt.toISOString() : (r.date instanceof Date ? r.date.toISOString() : String(r.date)),
          title: `Daily Report`,
          description: r.date ? `Report for ${r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date)}` : 'New report submitted',
          status: r.status,
          inspectorId: r.inspectorId,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Photo Gallery - Recent photos from reports
      const allPhotos: { id: string; path: string; caption: string | null; reportDate: string; createdAt: string | null }[] = [];
      for (const report of dailyReports.slice(0, 30)) {
        const reportPhotos = await storage.getPhotosByReport(report.id);
        for (const photo of reportPhotos) {
          allPhotos.push({
            id: photo.id,
            path: photo.filePath,
            caption: photo.caption,
            reportDate: report.date instanceof Date ? report.date.toISOString().split('T')[0] : String(report.date),
            createdAt: photo.createdAt ? photo.createdAt.toISOString() : null,
          });
        }
      }
      const photoGallery = allPhotos
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 12);
      
      // Issues Summary
      const issuesReports = dailyReports.filter(r => r.issuesFlag);
      const issuesSummary = {
        totalCount: issuesReports.length,
        recentIssues: issuesReports.slice(0, 10).map(r => ({
          id: r.id,
          date: r.date,
          details: r.issuesDetails,
        })),
      };
      
      // Safety Incidents
      const safetyReports = dailyReports.filter(r => r.safetyFlag);
      const safetySummary = {
        totalCount: safetyReports.length,
        recentIncidents: safetyReports.slice(0, 10).map(r => ({
          id: r.id,
          date: r.date,
          details: r.safetyDetails,
        })),
      };
      
      // Weather Summary - show all project weather data for transparency
      const weatherCounts: Record<string, number> = {};
      for (const report of allDailyReports) {
        const weather = report.weatherType || 'unknown';
        weatherCounts[weather] = (weatherCounts[weather] || 0) + 1;
      }
      const weatherSummary = {
        totalReports: allDailyReports.length,
        breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
          type,
          count,
          percentage: allDailyReports.length > 0 ? Math.round((count / allDailyReports.length) * 100) : 0,
        })).sort((a, b) => b.count - a.count),
        recentWeather: allDailyReports.slice(0, 7).map(r => ({
          date: r.date,
          type: r.weatherType,
          notes: r.weatherNotes,
        })),
      };
      
      // Inspector hours breakdown (only hours, no rates) - show all for transparency
      const inspectorHours: Record<string, { inspectorId: string; regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const report of allDailyReports) {
        const inspectorId = report.inspectorId || 'unknown';
        if (!inspectorHours[inspectorId]) {
          inspectorHours[inspectorId] = { inspectorId, regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        }
        inspectorHours[inspectorId].regular += parseFloat(report.regularHours || '0');
        inspectorHours[inspectorId].overtime += parseFloat(report.otHours || '0');
        inspectorHours[inspectorId].premium += parseFloat((report as any).premiumHours || '0');
        inspectorHours[inspectorId].reportCount += 1;
      }
      
      // Fetch IOR agreements for this project to get inspector names
      const projectIorAgreements = await storage.getIorAgreementsByProject(req.params.id);
      
      // Build a map of inspector names from IOR agreements first
      const inspectorNameMap = new Map<string, string>();
      const iorInspectorIds = new Set<string>();
      
      for (const ior of projectIorAgreements) {
        if (ior.inspectorId) {
          iorInspectorIds.add(ior.inspectorId);
          // Use consultant name from IOR if available, otherwise use inspector's profile name
          if (ior.consultantName) {
            inspectorNameMap.set(ior.inspectorId, ior.consultantName);
          } else if (ior.inspector) {
            const name = `${ior.inspector.firstName || ''} ${ior.inspector.lastName || ''}`.trim();
            if (name) inspectorNameMap.set(ior.inspectorId, name);
          }
        }
      }
      
      // Fetch user profiles for any inspectors not in IOR agreements
      const inspectorIds = Object.keys(inspectorHours).filter(id => id !== 'unknown');
      const allInspectorIds = [...new Set([...inspectorIds, ...Array.from(iorInspectorIds)])];
      const missingProfileIds = allInspectorIds.filter(id => !inspectorNameMap.has(id));
      
      if (missingProfileIds.length > 0) {
        const inspectorProfiles = await Promise.all(
          missingProfileIds.map(id => storage.getUserProfile(id))
        );
        for (const p of inspectorProfiles) {
          if (p) {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Inspector';
            inspectorNameMap.set(p.userId, name);
          }
        }
      }
      
      // Ensure all IOR inspectors are included in inspectorHours (even with 0 hours)
      for (const inspectorId of Array.from(iorInspectorIds)) {
        if (!inspectorHours[inspectorId]) {
          inspectorHours[inspectorId] = { inspectorId, regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        }
      }
      
      // Team overview - show all inspector data for transparency
      const teamOverview = Object.values(inspectorHours)
        .map(i => ({
          ...i,
          name: inspectorNameMap.get(i.inspectorId) || 'Unknown Inspector',
          totalHours: i.regular + i.overtime + i.premium,
        }))
        .sort((a, b) => b.totalHours - a.totalHours);
      
      // Upcoming Milestones for this project
      const milestones: { date: string; label: string; type: string; daysUntil: number; isPast: boolean }[] = [];
      const milestoneFields = [
        { field: 'startDate', label: 'Project Start' },
        { field: 'substantialCompletionDate', label: 'Substantial Completion' },
        { field: 'finalCloseoutDate', label: 'Final Closeout' },
      ];
      for (const m of milestoneFields) {
        const dateValue = (project as any)[m.field];
        if (dateValue) {
          const date = new Date(dateValue);
          const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          milestones.push({
            date: dateValue,
            label: m.label,
            type: m.field,
            daysUntil,
            isPast: daysUntil < 0,
          });
        }
      }
      const upcomingMilestones = milestones
        .filter(m => m.daysUntil >= -7)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      
      // Get client info if available
      let clientInfo = null;
      if (project.clientId) {
        const client = await storage.getClient(project.clientId);
        if (client) {
          clientInfo = {
            name: client.name,
            contactName: client.contactName,
            contactEmail: client.email,
          };
        }
      }
      
      // Hours Forecast Calculation
      // Calculate working days (excluding weekends) between two dates
      const countWorkingDays = (startDate: Date, endDate: Date): number => {
        let count = 0;
        const current = new Date(startDate);
        while (current <= endDate) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
            count++;
          }
          current.setDate(current.getDate() + 1);
        }
        return count;
      };
      
      // Get daily capacity from contract option inspectors (full-time = 8 hrs, part-time = 4 hrs)
      let dailyCapacity = 8; // Default to full-time
      let scheduleType = 'fullTime';
      
      if (project.contractOptionId && project.contractId) {
        const contractOptions = await storage.getContractOptions(project.contractId);
        const contractOption = contractOptions.find(opt => opt.id === project.contractOptionId);
        // Check schedule type from the first inspector in the option (or majority)
        if (contractOption?.inspectors && contractOption.inspectors.length > 0) {
          // Use the first inspector's schedule type as the default
          const firstInspectorSchedule = (contractOption.inspectors[0] as any).scheduleType;
          if (firstInspectorSchedule) {
            scheduleType = firstInspectorSchedule;
            dailyCapacity = scheduleType === 'partTime' ? 4 : 8;
          }
        }
      }
      
      // Calculate forecast
      let forecast: {
        workingDaysRemaining: number;
        dailyCapacity: number;
        scheduleType: string;
        maxPossibleHours: number;
        hoursRemaining: number;
        burnRate: number; // hours per working day used so far
        projectedCompletion: 'on_track' | 'at_risk' | 'over_budget' | 'unknown';
        recommendation: string;
        suggestedDailyHours: number | null;
        additionalHoursNeeded: number;
      } | null = null;
      
      const hoursRemaining = Math.max(0, effectiveBudgetedHours - effectiveTotalHours);
      
      if (project.substantialCompletionDate && effectiveBudgetedHours > 0) {
        const endDate = new Date(project.substantialCompletionDate);
        const workingDaysRemaining = countWorkingDays(now, endDate);
        
        // Calculate burn rate (hours per working day so far)
        let workingDaysElapsed = 0;
        if (project.startDate) {
          const startDate = new Date(project.startDate);
          if (now > startDate) {
            workingDaysElapsed = countWorkingDays(startDate, now);
          }
        }
        const burnRate = workingDaysElapsed > 0 ? totalHoursUsed / workingDaysElapsed : 0;
        
        // Max possible hours with current schedule
        const maxPossibleHours = workingDaysRemaining * dailyCapacity;
        
        // Determine forecast status and recommendation
        let projectedCompletion: 'on_track' | 'at_risk' | 'over_budget' | 'unknown' = 'unknown';
        let recommendation = '';
        let suggestedDailyHours: number | null = null;
        let additionalHoursNeeded = 0;
        
        if (now > endDate) {
          // Project is past completion date
          if (hoursRemaining > 0) {
            projectedCompletion = 'over_budget';
            recommendation = 'Project is past completion date with hours remaining. Consider requesting timeline extension.';
            additionalHoursNeeded = hoursRemaining;
          } else {
            projectedCompletion = 'on_track';
            recommendation = 'Project hours have been fully utilized.';
          }
        } else if (workingDaysRemaining > 0) {
          // Required daily hours to finish remaining budget on time
          suggestedDailyHours = hoursRemaining / workingDaysRemaining;
          
          if (hoursRemaining <= 0) {
            // Budget exhausted
            projectedCompletion = 'over_budget';
            recommendation = 'Hours budget exhausted. Request additional hours from client if work continues.';
          } else if (suggestedDailyHours <= dailyCapacity * 0.8) {
            // Can finish comfortably within schedule
            projectedCompletion = 'on_track';
            recommendation = `On track. Work ${suggestedDailyHours.toFixed(1)} hrs/day to use remaining budget by completion.`;
          } else if (suggestedDailyHours <= dailyCapacity) {
            // Can finish but need to work close to capacity
            projectedCompletion = 'at_risk';
            recommendation = `At risk. Need ${suggestedDailyHours.toFixed(1)} hrs/day (near full capacity) to complete on time.`;
          } else {
            // Cannot finish within current schedule capacity
            projectedCompletion = 'at_risk';
            additionalHoursNeeded = hoursRemaining - maxPossibleHours;
            if (additionalHoursNeeded > 0) {
              recommendation = `Capacity shortage. Would need ${suggestedDailyHours.toFixed(1)} hrs/day but capacity is ${dailyCapacity} hrs. Consider reducing scope or extending timeline.`;
            } else {
              recommendation = `Tight schedule. Need ${suggestedDailyHours.toFixed(1)} hrs/day to complete. Monitor closely.`;
            }
          }
        } else {
          // No working days remaining
          if (hoursRemaining > 0) {
            projectedCompletion = 'over_budget';
            recommendation = 'Deadline reached with unused hours. Review if additional work is expected.';
          } else {
            projectedCompletion = 'on_track';
            recommendation = 'Project completed on schedule.';
          }
        }
        
        forecast = {
          workingDaysRemaining,
          dailyCapacity,
          scheduleType,
          maxPossibleHours,
          hoursRemaining,
          burnRate: Math.round(burnRate * 100) / 100,
          projectedCompletion,
          recommendation,
          suggestedDailyHours: suggestedDailyHours !== null ? Math.round(suggestedDailyHours * 100) / 100 : null,
          additionalHoursNeeded: Math.max(0, Math.round(additionalHoursNeeded * 100) / 100),
        };
      }
      
      // All project data is shown to all assigned inspectors for transparency
      res.json({
        hasAdminAccess,
        project: {
          id: project.id,
          name: project.name,
          projectNumber: project.projectNumber,
          address: project.address,
          client: project.client || clientInfo?.name || null,
          clientInfo,
          startDate: project.startDate,
          substantialCompletionDate: project.substantialCompletionDate,
          finalCloseoutDate: project.finalCloseoutDate,
          distributionEmails: project.distributionEmails,
        },
        schedule: {
          progress: Math.round(scheduleProgress * 100) / 100,
          status: scheduleStatus,
          daysRemaining,
          daysOverdue,
          startDate: project.startDate,
          endDate: project.substantialCompletionDate,
        },
        hours: {
          budgeted: effectiveBudgetedHours,
          baseBudget: baseBudgetAmount, // Dollar amount pre-billed (not hours)
          used: totalHoursUsed, // Includes base hours from per-inspector entries
          remaining: Math.max(0, effectiveBudgetedHours - effectiveTotalHours),
          progress: Math.round(budgetProgress * 100) / 100,
          status: budgetStatus,
          breakdown: {
            regular: totalRegularHours,
            overtime: totalOvertimeHours,
            premium: totalPremiumHours,
          },
          sources: {
            dailyReports: {
              total: dailyReportHoursUsed,
              regular: dailyReportRegularHours,
              overtime: dailyReportOvertimeHours,
              premium: dailyReportPremiumHours,
            },
            manualEntries: {
              total: manualHoursUsed,
              regular: manualRegularHours,
              overtime: manualOvertimeHours,
            },
            baseHours: {
              total: baseHoursTotal,
              regular: baseHoursRegular,
              overtime: baseHoursOvertime,
              billedAmount: baseHoursBilledAmount,
              entryCount: baseHoursEntries.length,
            },
          },
        },
        dailyReports: dailyReports.slice(0, 50).map(r => ({
          id: r.id,
          date: r.date,
          status: r.status,
          weatherType: r.weatherType,
          regularHours: r.regularHours,
          otHours: r.otHours,
          signedAt: r.signedAt,
        })),
        activityTimeline,
        photoGallery,
        issuesSummary,
        safetySummary,
        weatherSummary,
        teamOverview,
        upcomingMilestones,
        forecast,
      });
    } catch (error) {
      console.error("Error fetching project dashboard:", error);
      res.status(500).json({ message: "Failed to fetch project dashboard" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { companyId, ...projectData } = req.body;
      
      console.log("[POST /api/projects] Received request:", { companyId, projectData, userId });
      
      // If companyId is provided, check if user is a member of that company (any role) or system admin
      if (companyId) {
        const isSystemAdmin = isEffectiveSystemAdmin(profile);
        const isMember = await storage.isUserMemberOfCompany(companyId, userId);
        
        if (!isSystemAdmin && !isMember) {
          return res.status(403).json({ message: "You must be a member of this company to create projects for it" });
        }
      }
      
      // Normalize empty budget strings to null
      if (projectData.budgetAmount === '' || projectData.budgetAmount === undefined) {
        projectData.budgetAmount = null;
      }
      if (projectData.baseBudget === '' || projectData.baseBudget === undefined) {
        projectData.baseBudget = null;
      }
      
      const validated = createProjectSchema.parse({ ...projectData, companyId: companyId || null });
      console.log("[POST /api/projects] Validated data:", validated);
      
      const project = await storage.createProject(validated);
      console.log("[POST /api/projects] Created project:", project);
      
      // Automatically assign the creator to the project
      if (userId && project.id) {
        await storage.addProjectMember(project.id, userId);
      }
      
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[POST /api/projects] Validation error:", error.errors);
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("[POST /api/projects] Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const profile = await storage.getUserProfile(userId);
      const { companyId: newCompanyId, ...otherUpdates } = req.body;
      
      // Get the project to check ownership
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check authorization (respects inspector mode): only effective system admin or effective company admin can edit projects
      // Inspectors/project members can view projects but cannot modify them
      const effectiveSysAdmin = isEffectiveSystemAdmin(profile);
      let effectiveCompAdmin = false;
      if (existingProject.companyId) {
        effectiveCompAdmin = await isEffectiveCompanyAdmin(userId, existingProject.companyId, profile);
      }
      
      const canEdit = effectiveSysAdmin || effectiveCompAdmin;
      
      if (!canEdit) {
        return res.status(403).json({ message: "Access denied. Only admins can edit projects." });
      }
      
      // Handle companyId assignment separately with extra authorization (respects inspector mode)
      let updateData = { ...otherUpdates };
      
      // Convert empty contractId to null
      if (updateData.contractId === '' || updateData.contractId === 'none') {
        updateData.contractId = null;
      }
      
      // Normalize empty budget strings to null
      if (updateData.budgetAmount === '' || updateData.budgetAmount === undefined) {
        updateData.budgetAmount = null;
      }
      if (updateData.baseBudget === '' || updateData.baseBudget === undefined) {
        updateData.baseBudget = null;
      }
      
      if (newCompanyId !== undefined) {
        // If assigning to a new company, user must be effective admin of that company
        if (newCompanyId) {
          const hasTargetAccess = effectiveSysAdmin || await isEffectiveCompanyAdmin(userId, newCompanyId, profile);
          if (!hasTargetAccess) {
            return res.status(403).json({ message: "You must be an admin of the target company to assign projects" });
          }
        }
        // Also check user can remove from current company (if it has one)
        if (existingProject.companyId && newCompanyId !== existingProject.companyId) {
          const hasCurrentAccess = effectiveSysAdmin || await isEffectiveCompanyAdmin(userId, existingProject.companyId, profile);
          if (!hasCurrentAccess) {
            return res.status(403).json({ message: "You must be an admin of the current company to reassign projects" });
          }
        }
        updateData.companyId = newCompanyId;
      }
      
      const validated = updateProjectSchema.parse(updateData);
      const project = await storage.updateProject(projectId, validated);
      res.json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const profile = await storage.getUserProfile(userId);
      
      // Get project to check permissions
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check permissions: system admin or company admin (respects inspector mode)
      const canDelete = isEffectiveSystemAdmin(profile) || 
        (project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile));
      
      if (!canDelete) {
        return res.status(403).json({ message: "Access denied. Only admins can delete projects." });
      }
      
      // Check if project has any reports
      const projectReports = await storage.getReportsByProject(projectId);
      if (projectReports.length > 0) {
        return res.status(400).json({ 
          message: `Cannot delete project with ${projectReports.length} existing report(s). Please delete the reports first.` 
        });
      }
      
      // Clean up project members
      const members = await storage.getProjectMembers(projectId);
      for (const member of members) {
        await storage.removeProjectMember(projectId, member.userId);
      }
      
      // Clear activeProjectId for users who have this project selected
      await storage.clearActiveProjectForProject(projectId);
      
      await storage.deleteProject(projectId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // ========== PROJECT MEMBERS ==========
  // Helper to check admin access for project (respects preferAdminMode)
  async function checkProjectAdminAccess(userId: string, projectId: string): Promise<{ allowed: boolean; project?: any }> {
    const profile = await storage.getUserProfile(userId);
    const project = await storage.getProject(projectId);
    if (!project) return { allowed: false };
    
    // System admin access (respects inspector mode)
    if (isEffectiveSystemAdmin(profile)) return { allowed: true, project };
    
    // Company admin access (respects inspector mode)
    if (project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile)) {
      return { allowed: true, project };
    }
    
    return { allowed: false, project };
  }

  app.get("/api/projects/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { allowed, project } = await checkProjectAdminAccess(userId, req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const members = await storage.getProjectMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  app.post("/api/projects/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { allowed, project } = await checkProjectAdminAccess(userId, req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validated = addProjectMemberSchema.parse(req.body);
      const rates = {
        regularRate: req.body.regularRate,
        overtimeRate: req.body.overtimeRate,
        premiumRate: req.body.premiumRate,
      };
      const member = await storage.addProjectMember(req.params.id, validated.userId, rates);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error adding project member:", error);
      res.status(500).json({ message: "Failed to add project member" });
    }
  });

  // Update project member rates (inspector billing rates)
  app.patch("/api/projects/:id/members/:userId/rates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { allowed, project } = await checkProjectAdminAccess(userId, req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { regularRate, overtimeRate, premiumRate } = req.body;
      const member = await storage.updateProjectMemberRates(req.params.id, req.params.userId, {
        regularRate,
        overtimeRate,
        premiumRate,
      });
      
      if (!member) {
        return res.status(404).json({ message: "Project member not found" });
      }
      
      res.json(member);
    } catch (error) {
      console.error("Error updating project member rates:", error);
      res.status(500).json({ message: "Failed to update project member rates" });
    }
  });

  app.delete("/api/projects/:id/members/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { allowed, project } = await checkProjectAdminAccess(userId, req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.removeProjectMember(req.params.id, req.params.userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing project member:", error);
      res.status(500).json({ message: "Failed to remove project member" });
    }
  });

  // ========== PROJECT LINKED PROPOSAL ==========
  
  // Get the proposal linked to this project (if any)
  app.get("/api/projects/:id/linked-proposal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const project = await storage.getProject(req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = project.companyId && await storage.isUserMemberOfCompany(project.companyId, userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isMember && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const proposal = await storage.getProposalByProjectId(req.params.id);
      res.json(proposal || null);
    } catch (error) {
      console.error("Error fetching linked proposal:", error);
      res.status(500).json({ message: "Failed to fetch linked proposal" });
    }
  });

  // ========== PROJECT BILLING RATES (Company → Client) ==========
  
  // Get project billing rates
  app.get("/api/projects/:id/billing-rates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const project = await storage.getProject(req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check if user has access to this project (member or company admin)
      const isMember = await storage.isUserMemberOfProject(req.params.id, userId);
      let isCompanyAdmin = false;
      if (project.companyId) {
        const membership = await storage.getCompanyMembership(userId, project.companyId);
        isCompanyAdmin = membership?.role === "admin" || membership?.role === "system_admin";
      }
      
      if (!isMember && !isCompanyAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const rates = await storage.getProjectBillingRates(req.params.id);
      res.json(rates);
    } catch (error) {
      console.error("Error fetching project billing rates:", error);
      res.status(500).json({ message: "Failed to fetch project billing rates" });
    }
  });

  // Set project billing rates (replaces all existing rates)
  app.put("/api/projects/:id/billing-rates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { allowed, project } = await checkProjectAdminAccess(userId, req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { rates } = req.body;
      if (!Array.isArray(rates)) {
        return res.status(400).json({ message: "Rates must be an array" });
      }
      
      // Validate each rate entry
      for (const rate of rates) {
        if (!rate.title || !rate.rate || !rate.hours) {
          return res.status(400).json({ message: "Each rate must have title, rate, and hours" });
        }
      }
      
      const updatedRates = await storage.setProjectBillingRates(req.params.id, rates);
      res.json(updatedRates);
    } catch (error) {
      console.error("Error updating project billing rates:", error);
      res.status(500).json({ message: "Failed to update project billing rates" });
    }
  });

  // ========== PROJECT BASE HOURS ==========
  // Get project base hours (for mid-project onboarding)
  app.get("/api/projects/:id/base-hours", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const project = await storage.getProject(req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check if user has access to this project (member or company admin)
      const isMember = await storage.isUserMemberOfProject(req.params.id, userId);
      let isCompanyAdmin = false;
      if (project.companyId) {
        const membership = await storage.getCompanyMembership(userId, project.companyId);
        isCompanyAdmin = membership?.role === "admin" || membership?.role === "system_admin";
      }
      
      if (!isMember && !isCompanyAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const baseHours = await storage.getProjectBaseHours(req.params.id);
      res.json(baseHours);
    } catch (error) {
      console.error("Error fetching project base hours:", error);
      res.status(500).json({ message: "Failed to fetch project base hours" });
    }
  });

  // Set project base hours (replaces all existing entries)
  app.put("/api/projects/:id/base-hours", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { allowed, project } = await checkProjectAdminAccess(userId, req.params.id);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        return res.status(400).json({ message: "Entries must be an array" });
      }
      
      // Validate each entry
      for (const entry of entries) {
        if (!entry.inspectorName) {
          return res.status(400).json({ message: "Each entry must have inspectorName" });
        }
      }
      
      const updatedEntries = await storage.setProjectBaseHours(req.params.id, entries);
      res.json(updatedEntries);
    } catch (error) {
      console.error("Error updating project base hours:", error);
      res.status(500).json({ message: "Failed to update project base hours" });
    }
  });

  // ========== PROJECT COMMENTS ==========
  
  // Get all comments for a project
  app.get("/api/projects/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub as string;
      const projectId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check user can access this project
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check access: user must be company member or project member
      const companyMember = await storage.getCompanyMember(project.companyId, userId);
      const projectMember = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      });
      
      if (!companyMember && !projectMember) {
        return res.status(403).json({ message: "You don't have access to this project" });
      }
      
      const comments = await db.query.projectComments.findMany({
        where: eq(projectComments.projectId, projectId),
        orderBy: [desc(projectComments.createdAt)],
      });
      
      // Get author details for each comment
      const commentsWithAuthors = await Promise.all(
        comments.map(async (comment) => {
          const author = await db.query.users.findFirst({
            where: eq(users.id, comment.authorId),
            columns: { id: true, firstName: true, lastName: true, email: true, profileImageUrl: true }
          });
          return {
            ...comment,
            author: author || { id: comment.authorId, firstName: null, lastName: null, email: null, profileImageUrl: null }
          };
        })
      );
      
      res.json(commentsWithAuthors);
    } catch (error) {
      console.error("Error fetching project comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });
  
  // Schema for comment creation request body
  const createCommentSchema = z.object({
    content: z.string().transform(s => s.trim()).pipe(z.string().min(1, "Comment content is required").max(10000, "Comment is too long")),
    mentions: z.array(z.string()).optional().default([]),
  });
  
  // Add a comment to a project
  app.post("/api/projects/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub as string;
      const projectId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Validate request body with Zod
      const validationResult = createCommentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const { content, mentions } = validationResult.data;
      
      // Check user can access this project
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Ensure project has a company association
      if (!project.companyId) {
        return res.status(400).json({ message: "Project must be associated with a company to add comments" });
      }
      
      // Check access: user must be company member or project member
      const companyMember = await storage.getCompanyMember(project.companyId, userId);
      const projectMember = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      });
      
      if (!companyMember && !projectMember) {
        return res.status(403).json({ message: "You don't have access to this project" });
      }
      
      // Create the comment
      const [newComment] = await db.insert(projectComments).values({
        projectId: projectId,
        companyId: project.companyId,
        authorId: userId,
        content: content, // Already trimmed by Zod schema
        mentions: mentions,
      }).returning();
      
      // Get author details
      const author = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, firstName: true, lastName: true, profileImageUrl: true }
      });
      
      res.status(201).json({
        ...newComment,
        author: author || { id: userId, firstName: null, lastName: null, profileImageUrl: null }
      });
    } catch (error) {
      console.error("Error creating project comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });
  
  // Delete a comment (only author or admin can delete)
  app.delete("/api/projects/:id/comments/:commentId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub as string;
      const { id: projectId, commentId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check comment exists
      const comment = await db.query.projectComments.findFirst({
        where: eq(projectComments.id, commentId)
      });
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Check if user is author or admin (roles: inspector, admin, owner, system_owner)
      const companyMember = await storage.getCompanyMember(project.companyId, userId);
      const isAdmin = companyMember?.role === "admin" || companyMember?.role === "owner" || companyMember?.role === "system_owner";
      const isAuthor = comment.authorId === userId;
      
      if (!isAuthor && !isAdmin) {
        return res.status(403).json({ message: "You can only delete your own comments" });
      }
      
      await db.delete(projectComments).where(eq(projectComments.id, commentId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting project comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });
  
  // Get team members for @mention suggestions
  app.get("/api/projects/:id/team-members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub as string;
      const projectId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check project exists and user has access
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const companyMember = await storage.getCompanyMember(project.companyId, userId);
      const projectMember = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      });
      
      if (!companyMember && !projectMember) {
        return res.status(403).json({ message: "You don't have access to this project" });
      }
      
      // Get all project members
      const members = await db.query.projectMembers.findMany({
        where: eq(projectMembers.projectId, projectId),
      });
      
      // Get user details for each member
      const teamMembers = await Promise.all(
        members.map(async (member) => {
          const user = await db.query.users.findFirst({
            where: eq(users.id, member.userId),
            columns: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          });
          const cm = await storage.getCompanyMember(project.companyId, member.userId);
          return {
            id: member.userId,
            firstName: user?.firstName || null,
            lastName: user?.lastName || null,
            profileImageUrl: user?.profileImageUrl || null,
            role: cm?.role || 'inspector'
          };
        })
      );
      
      // Also get company admins who aren't project members (roles: admin, owner, system_owner)
      const allCompanyMembers = await storage.getCompanyMembers(project.companyId);
      const adminMembers = allCompanyMembers.filter(
        cm => (cm.role === 'admin' || cm.role === 'owner' || cm.role === 'system_owner') && 
              !members.some(m => m.userId === cm.userId)
      );
      
      const adminUsers = await Promise.all(
        adminMembers.map(async (admin) => {
          const user = await db.query.users.findFirst({
            where: eq(users.id, admin.userId),
            columns: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          });
          return {
            id: admin.userId,
            firstName: user?.firstName || null,
            lastName: user?.lastName || null,
            profileImageUrl: user?.profileImageUrl || null,
            role: admin.role
          };
        })
      );
      
      res.json([...teamMembers, ...adminUsers]);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // ========== INVOICE HOURS CALCULATION ==========
  app.get("/api/projects/:id/invoice-hours", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      // Validate dates
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      if (start > end) {
        return res.status(400).json({ message: "Start date must be before end date" });
      }
      
      // Check access to project
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Allow access if user is system admin, company admin, or member of project
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get all reports for this project within date range
      const reports = await storage.getReportsForInvoice(projectId, new Date(startDate as string), new Date(endDate as string));
      
      // Calculate totals
      let totalRegularHours = 0;
      let totalOTHours = 0;
      const reportDetails: Array<{
        id: string;
        date: Date;
        inspectorName: string;
        timeIn: string | null;
        timeOut: string | null;
        regularHours: number;
        otHours: number;
      }> = [];
      
      for (const report of reports) {
        const regHrs = parseFloat(report.regularHours || "0") || 0;
        const otHrs = parseFloat(report.otHours || "0") || 0;
        totalRegularHours += regHrs;
        totalOTHours += otHrs;
        
        // Get inspector name
        const inspectorProfile = await storage.getUserProfile(report.inspectorId);
        const inspectorUser = await storage.getUserById(report.inspectorId);
        const inspectorName = inspectorProfile?.firstName && inspectorProfile?.lastName
          ? `${inspectorProfile.firstName} ${inspectorProfile.lastName}`
          : inspectorUser?.firstName && inspectorUser?.lastName
          ? `${inspectorUser.firstName} ${inspectorUser.lastName}`
          : inspectorUser?.email || 'Unknown';
        
        reportDetails.push({
          id: report.id,
          date: report.date,
          inspectorName,
          timeIn: report.timeIn,
          timeOut: report.timeOut,
          regularHours: regHrs,
          otHours: otHrs,
        });
      }
      
      res.json({
        project: {
          id: project.id,
          name: project.name,
          projectNumber: project.projectNumber,
          client: project.client,
        },
        dateRange: {
          startDate,
          endDate,
        },
        totals: {
          regularHours: totalRegularHours,
          otHours: totalOTHours,
          totalHours: totalRegularHours + totalOTHours,
          reportCount: reports.length,
        },
        reports: reportDetails,
      });
    } catch (error) {
      console.error("Error calculating invoice hours:", error);
      res.status(500).json({ message: "Failed to calculate invoice hours" });
    }
  });

  // Invoice PDF generation
  app.get("/api/projects/:id/invoice-pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      // Validate dates
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      if (start > end) {
        return res.status(400).json({ message: "Start date must be before end date" });
      }
      
      // Check access to project
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Allow access if user is system admin, company admin, or member of project
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info if project has a company
      let company = null;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
      }
      
      // Get app settings for logo
      const logoSetting = await storage.getSetting("companyLogo");
      let logoBuffer: Buffer | null = null;
      if (logoSetting?.value) {
        try {
          logoBuffer = await objectStorage.downloadBuffer(logoSetting.value);
        } catch (e) {
          console.log("Could not load company logo for invoice PDF");
        }
      }
      
      // Get all reports for this project within date range
      const reports = await storage.getReportsForInvoice(projectId, start, end);
      
      // Calculate totals and get inspector names
      let totalRegularHours = 0;
      let totalOTHours = 0;
      const reportDetails: Array<{
        date: Date;
        inspectorName: string;
        regularHours: number;
        otHours: number;
      }> = [];
      
      for (const report of reports) {
        const regHrs = parseFloat(report.regularHours || "0") || 0;
        const otHrs = parseFloat(report.otHours || "0") || 0;
        totalRegularHours += regHrs;
        totalOTHours += otHrs;
        
        const inspectorProfile = await storage.getUserProfile(report.inspectorId);
        const inspectorUser = await storage.getUserById(report.inspectorId);
        const inspectorName = inspectorProfile?.firstName && inspectorProfile?.lastName
          ? `${inspectorProfile.firstName} ${inspectorProfile.lastName}`
          : inspectorUser?.firstName && inspectorUser?.lastName
          ? `${inspectorUser.firstName} ${inspectorUser.lastName}`
          : inspectorUser?.email || 'Unknown';
        
        reportDetails.push({
          date: report.date,
          inspectorName,
          regularHours: regHrs,
          otHours: otHrs,
        });
      }
      
      const totalHours = totalRegularHours + totalOTHours;
      
      // Create invoice record with new schema
      const expectedInvoiceNumber = await storage.getNextInvoiceNumber();
      const invoiceResult = await storage.createInvoice({
        companyId: project.companyId || '',
        projectId: projectId,
        invoiceNumber: expectedInvoiceNumber,
        month: start.getMonth() + 1,
        year: start.getFullYear(),
        regularHours: totalRegularHours.toFixed(2),
        overtimeHours: totalOTHours.toFixed(2),
        premiumHours: '0',
        regularAmount: '0',
        overtimeAmount: '0',
        premiumAmount: '0',
        subtotal: '0',
        totalAmount: totalHours.toFixed(2),
      });
      
      // Use the actual invoice number returned
      const invoiceNumber = invoiceResult.invoiceNumber;
      
      // Generate PDF with the confirmed invoice number
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        const dateStr = format(start, "yyyy-MM-dd") + "_to_" + format(end, "yyyy-MM-dd");
        const filename = `Invoice_${invoiceNumber}_${project.projectNumber || project.name}_${dateStr}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
      });
      
      const pageWidth = doc.page.width - 100;
      const startX = 50;
      
      // Header with logo
      let headerY = 50;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, startX, headerY, { width: 205, height: 77, fit: [205, 77] });
          headerY += 72;
        } catch (e) {
          console.log("Could not render logo in invoice PDF");
        }
      }
      
      // Title with Invoice Number
      doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', startX, headerY, { align: 'center', width: pageWidth });
      doc.moveDown(0.3);
      
      // Invoice number
      const paddedInvoiceNum = String(invoiceNumber).padStart(5, '0');
      doc.fontSize(12).font('Helvetica-Bold').text(`Invoice #: INV-${paddedInvoiceNum}`, { align: 'center', width: pageWidth });
      doc.moveDown(0.3);
      
      // Date range
      const dateRangeStr = `${format(start, "MMMM d, yyyy")} - ${format(end, "MMMM d, yyyy")}`;
      doc.fontSize(11).font('Helvetica').text(dateRangeStr, { align: 'center', width: pageWidth });
      doc.moveDown(1.5);
      
      // FROM section - Use contractor info from user profile if available, otherwise fall back to company
      const hasContractorInfo = profile?.contractorCompanyName;
      if (hasContractorInfo) {
        doc.fontSize(10).font('Helvetica-Bold').text('FROM:', startX);
        doc.fontSize(10).font('Helvetica').text(profile.contractorCompanyName!, startX);
        if (profile.contractorAddress) doc.text(profile.contractorAddress);
        if (profile.contractorPhone) doc.text(`Phone: ${profile.contractorPhone}`);
        if (profile.contractorEmail) doc.text(`Email: ${profile.contractorEmail}`);
        doc.moveDown();
      } else if (company) {
        doc.fontSize(10).font('Helvetica-Bold').text('FROM:', startX);
        doc.fontSize(10).font('Helvetica').text(company.name, startX);
        if (company.address) doc.text(company.address);
        if (company.phone) doc.text(`Phone: ${company.phone}`);
        if (company.email) doc.text(`Email: ${company.email}`);
        doc.moveDown();
      }
      
      // Get linked client name (from project.clientId or contract)
      let linkedClientName = project.client || '';
      if (project.clientId) {
        const linkedClient = await storage.getClient(project.clientId);
        if (linkedClient) linkedClientName = linkedClient.name;
      }
      if (!linkedClientName && project.companyId) {
        const allContracts = await storage.getContracts(project.companyId);
        const linkedContract = allContracts.find((c: any) => c.projects?.some((p: any) => p.id === projectId));
        if (linkedContract?.clientId) {
          const contractClient = await storage.getClient(linkedContract.clientId);
          if (contractClient) linkedClientName = contractClient.name;
        }
      }

      // Project info section
      doc.fontSize(10).font('Helvetica-Bold').text('PROJECT:', startX);
      doc.fontSize(10).font('Helvetica').text(`${project.name} (${project.projectNumber || 'N/A'})`, startX, undefined, { width: pageWidth });
      if (linkedClientName) doc.text(`Client: ${linkedClientName}`, startX, undefined, { width: pageWidth });
      if (project.address) doc.text(`Address: ${project.address}`, startX, undefined, { width: pageWidth });
      doc.moveDown(1.5);
      
      // Summary section
      doc.fontSize(12).font('Helvetica-Bold').text('HOURS SUMMARY', startX);
      doc.moveDown(0.5);
      
      const summaryY = doc.y;
      const colWidth = pageWidth / 4;
      
      // Summary boxes
      doc.rect(startX, summaryY, colWidth - 5, 45).stroke();
      doc.fontSize(9).font('Helvetica').text('Reports', startX + 5, summaryY + 5);
      doc.fontSize(16).font('Helvetica-Bold').text(String(reports.length), startX + 5, summaryY + 22);
      
      doc.rect(startX + colWidth, summaryY, colWidth - 5, 45).stroke();
      doc.fontSize(9).font('Helvetica').text('Regular Hours', startX + colWidth + 5, summaryY + 5);
      doc.fontSize(16).font('Helvetica-Bold').text(totalRegularHours.toFixed(2), startX + colWidth + 5, summaryY + 22);
      
      doc.rect(startX + colWidth * 2, summaryY, colWidth - 5, 45).stroke();
      doc.fontSize(9).font('Helvetica').text('OT Hours', startX + colWidth * 2 + 5, summaryY + 5);
      doc.fontSize(16).font('Helvetica-Bold').text(totalOTHours.toFixed(2), startX + colWidth * 2 + 5, summaryY + 22);
      
      doc.rect(startX + colWidth * 3, summaryY, colWidth - 5, 45).stroke();
      doc.fontSize(9).font('Helvetica').text('Total Hours', startX + colWidth * 3 + 5, summaryY + 5);
      doc.fontSize(16).font('Helvetica-Bold').text((totalRegularHours + totalOTHours).toFixed(2), startX + colWidth * 3 + 5, summaryY + 22);
      
      doc.y = summaryY + 60;
      
      // Daily breakdown table
      if (reportDetails.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('DAILY BREAKDOWN', startX);
        doc.moveDown(0.5);
        
        const tableTop = doc.y;
        const dateColW = 100;
        const inspColW = 200;
        const regColW = 80;
        const otColW = 80;
        const rowHeight = 20;
        
        // Table header
        doc.rect(startX, tableTop, pageWidth, rowHeight).fill('#f0f0f0').stroke('#ccc');
        doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
        doc.text('Date', startX + 5, tableTop + 5);
        doc.text('Inspector', startX + dateColW + 5, tableTop + 5);
        doc.text('Reg Hrs', startX + dateColW + inspColW + 5, tableTop + 5);
        doc.text('OT Hrs', startX + dateColW + inspColW + regColW + 5, tableTop + 5);
        
        let currentY = tableTop + rowHeight;
        
        for (const report of reportDetails) {
          // Check if we need a new page
          if (currentY + rowHeight > doc.page.height - 80) {
            doc.addPage();
            currentY = 50;
          }
          
          doc.rect(startX, currentY, pageWidth, rowHeight).stroke('#ddd');
          doc.fontSize(9).font('Helvetica').fillColor('#000');
          doc.text(format(new Date(report.date), 'MMM d, yyyy'), startX + 5, currentY + 5);
          doc.text(report.inspectorName, startX + dateColW + 5, currentY + 5);
          doc.text(report.regularHours.toFixed(2), startX + dateColW + inspColW + 5, currentY + 5);
          doc.text(report.otHours.toFixed(2), startX + dateColW + inspColW + regColW + 5, currentY + 5);
          
          currentY += rowHeight;
        }
        
        // Totals row
        doc.rect(startX, currentY, pageWidth, rowHeight).fill('#f0f0f0').stroke('#ccc');
        doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
        doc.text('TOTAL', startX + 5, currentY + 5);
        doc.text(totalRegularHours.toFixed(2), startX + dateColW + inspColW + 5, currentY + 5);
        doc.text(totalOTHours.toFixed(2), startX + dateColW + inspColW + regColW + 5, currentY + 5);
      } else {
        doc.fontSize(10).font('Helvetica').text('No reports found for the selected date range.', startX);
      }
      
      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#666');
      doc.text(`Generated on ${format(new Date(), 'MMMM d, yyyy')}`, startX, doc.page.height - 50, { align: 'center', width: pageWidth });
      
      doc.end();
    } catch (error) {
      console.error("Error generating invoice PDF:", error);
      res.status(500).json({ message: "Failed to generate invoice PDF" });
    }
  });

  // Monthly Summary PDF generation
  app.get("/api/projects/:id/monthly-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const { month, year } = req.query;
      
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      
      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);
      
      if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "Invalid month or year" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
        if (company?.logoUrl) {
          try {
            logoBuffer = await objectStorage.downloadBuffer(company.logoUrl);
          } catch (e) {
            console.log("Could not load company logo for monthly summary");
          }
        }
      }
      
      // Get all reports for this project in the specified month
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0); // Last day of month
      
      const allReports = await storage.getReportsByProject(projectId);
      const monthlyReports = allReports.filter(r => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Calculate schedule progress
      const now = new Date();
      let scheduleProgress = 0;
      let scheduleStatus = 'not_started';
      let daysRemaining: number | null = null;
      
      if (project.startDate && project.substantialCompletionDate) {
        const projStart = new Date(project.startDate);
        const projEnd = new Date(project.substantialCompletionDate);
        const totalDuration = projEnd.getTime() - projStart.getTime();
        const elapsed = now.getTime() - projStart.getTime();
        
        if (now < projStart) {
          scheduleProgress = 0;
          scheduleStatus = 'not_started';
        } else if (now > projEnd) {
          scheduleProgress = 100;
          scheduleStatus = 'overdue';
        } else {
          scheduleProgress = Math.min(100, (elapsed / totalDuration) * 100);
          scheduleStatus = scheduleProgress >= 80 ? 'warning' : 'on_track';
          daysRemaining = Math.ceil((projEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
      
      // Calculate hours
      let totalRegular = 0;
      let totalOT = 0;
      let totalPremium = 0;
      
      for (const report of monthlyReports) {
        totalRegular += parseFloat(report.regularHours || '0');
        totalOT += parseFloat(report.otHours || '0');
        totalPremium += parseFloat((report as any).premiumHours || '0');
      }
      
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      let budgetedHours = project.budgetedHours ? parseFloat(project.budgetedHours) : 0;
      const baseBudget = project.baseBudget ? parseFloat(project.baseBudget) : 0;
      
      // Get inspector names for reports
      const inspectorIds = [...new Set(monthlyReports.map(r => r.inspectorId).filter(Boolean))];
      const inspectorProfiles = await Promise.all(inspectorIds.map(id => storage.getUserProfile(id)));
      const inspectorNameMap = new Map(
        inspectorProfiles.filter(p => p).map(p => [p!.id, `${p!.firstName || ''} ${p!.lastName || ''}`.trim() || 'Unknown'])
      );
      
      // Build daily reports data
      const dailyReportsData = monthlyReports.map(r => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId) || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat((r as any).premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Weather summary
      const weatherCounts: Record<string, number> = {};
      for (const r of monthlyReports) {
        const weather = r.weatherType || 'unknown';
        weatherCounts[weather] = (weatherCounts[weather] || 0) + 1;
      }
      const weatherSummary = {
        totalReports: monthlyReports.length,
        breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
          type,
          count,
          percentage: monthlyReports.length > 0 ? Math.round((count / monthlyReports.length) * 100) : 0,
        })),
      };
      
      // Issues summary
      const issuesReports = monthlyReports.filter(r => r.issuesFlag);
      const issuesSummary = {
        totalCount: issuesReports.length,
        issues: issuesReports.map(r => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          details: r.issuesDetails || '',
        })),
      };
      
      // Safety summary
      const safetyReports = monthlyReports.filter(r => r.safetyFlag);
      const safetySummary = {
        totalCount: safetyReports.length,
        incidents: safetyReports.map(r => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          details: r.safetyDetails || '',
        })),
      };
      
      // Team overview
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of monthlyReports) {
        const inspId = r.inspectorId || 'unknown';
        if (!teamHours[inspId]) {
          teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        }
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      const teamOverview = Object.entries(teamHours).map(([inspId, hours]) => ({
        inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
        regular: hours.regular,
        overtime: hours.overtime,
        premium: hours.premium,
        reportCount: hours.reportCount,
      }));
      
      // Get client name
      let clientName = project.client || '';
      if (project.clientId) {
        const client = await storage.getClient(project.clientId);
        if (client) clientName = client.name;
      }
      
      // Calculate upcoming milestones
      const milestones: { date: string; label: string; type: string; daysUntil: number; isPast: boolean }[] = [];
      const milestoneFields = [
        { field: 'startDate', label: 'Project Start' },
        { field: 'substantialCompletionDate', label: 'Substantial Completion' },
        { field: 'finalCloseoutDate', label: 'Final Closeout' },
      ];
      for (const m of milestoneFields) {
        const dateValue = (project as any)[m.field];
        if (dateValue) {
          const date = new Date(dateValue);
          const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          milestones.push({
            date: String(dateValue),
            label: m.label,
            type: m.field,
            daysUntil,
            isPast: daysUntil < 0,
          });
        }
      }
      const upcomingMilestones = milestones
        .filter(m => m.daysUntil >= -7)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      
      // Generate PDF
      const pdfBuffer = await generateMonthlySummaryPdf({
        projectName: project.name,
        projectNumber: project.projectNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        month: monthNum,
        year: yearNum,
        schedule: {
          progress: scheduleProgress,
          status: scheduleStatus,
          startDate: project.startDate ? String(project.startDate) : null,
          endDate: project.substantialCompletionDate ? String(project.substantialCompletionDate) : null,
          daysRemaining,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - totalHoursUsed),
          progress: budgetedHours > 0 ? (totalHoursUsed / budgetedHours) * 100 : 0,
          breakdown: {
            regular: totalRegular,
            overtime: totalOT,
            premium: totalPremium,
          },
        },
        dailyReports: dailyReportsData,
        weatherSummary,
        issuesSummary,
        safetySummary,
        teamOverview,
        upcomingMilestones,
      });
      
      // Merge summary PDF with individual daily report PDFs
      const mergedPdf = await PDFLibDocument.create();
      
      // Add summary pages first
      const summaryDoc = await PDFLibDocument.load(pdfBuffer);
      const summaryPages = await mergedPdf.copyPages(summaryDoc, summaryDoc.getPageIndices());
      summaryPages.forEach(page => mergedPdf.addPage(page));
      
      // Add individual daily report PDFs (sorted by date)
      const reportsWithPdfs = monthlyReports.filter((r: any) => r.pdfPath);
      reportsWithPdfs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (const report of reportsWithPdfs) {
        try {
          let pdfBytes: Uint8Array;
          if (report.pdfPath!.startsWith('/objects/')) {
            const buffer = await objectStorage.downloadBuffer(report.pdfPath!);
            pdfBytes = new Uint8Array(buffer);
          } else {
            const localPath = path.join(process.cwd(), report.pdfPath!.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              pdfBytes = new Uint8Array(fs.readFileSync(localPath));
            } else {
              continue;
            }
          }
          
          const reportPdfDoc = await PDFLibDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(reportPdfDoc, reportPdfDoc.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
          console.error(`Error adding daily report ${report.id} to monthly summary PDF:`, err);
        }
      }
      
      const finalPdfBytes = await mergedPdf.save();
      const finalPdfBuffer = Buffer.from(finalPdfBytes);
      
      const monthName = format(startDate, 'MMMM_yyyy');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_Monthly_Summary_${monthName}.pdf"`);
      res.send(finalPdfBuffer);
    } catch (error) {
      console.error("Error generating monthly summary PDF:", error);
      res.status(500).json({ message: "Failed to generate monthly summary" });
    }
  });

  // Email monthly summary to distribution list
  app.post("/api/projects/:id/monthly-summary/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const { month, year, additionalEmails } = req.body;
      
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
        if (company?.logoUrl) {
          try {
            logoBuffer = await objectStorage.downloadBuffer(company.logoUrl);
          } catch (e) {
            console.log("Could not load company logo");
          }
        }
      }
      
      // Collect recipient emails
      const recipients: string[] = [];
      
      // Add project distribution emails
      if (project.distributionEmails && Array.isArray(project.distributionEmails)) {
        recipients.push(...project.distributionEmails);
      }
      
      // Add additional emails from request
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      
      // Remove duplicates
      const uniqueRecipients = [...new Set(recipients)];
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      // Generate the PDF (same logic as GET endpoint)
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0);
      
      const allReports = await storage.getReportsByProject(projectId);
      const monthlyReports = allReports.filter(r => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Calculate progress and hours (simplified for email)
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const report of monthlyReports) {
        totalRegular += parseFloat(report.regularHours || '0');
        totalOT += parseFloat(report.otHours || '0');
        totalPremium += parseFloat((report as any).premiumHours || '0');
      }
      
      const inspectorIds = [...new Set(monthlyReports.map(r => r.inspectorId).filter(Boolean))];
      const inspectorProfiles = await Promise.all(inspectorIds.map(id => storage.getUserProfile(id)));
      const inspectorNameMap = new Map(
        inspectorProfiles.filter(p => p).map(p => [p!.id, `${p!.firstName || ''} ${p!.lastName || ''}`.trim() || 'Unknown'])
      );
      
      const dailyReportsData = monthlyReports.map(r => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId) || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat((r as any).premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const weatherCounts: Record<string, number> = {};
      for (const r of monthlyReports) {
        weatherCounts[r.weatherType || 'unknown'] = (weatherCounts[r.weatherType || 'unknown'] || 0) + 1;
      }
      
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of monthlyReports) {
        const inspId = r.inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      let clientName = project.client || '';
      if (project.clientId) {
        const client = await storage.getClient(project.clientId);
        if (client) clientName = client.name;
      }
      
      const budgetedHours = project.budgetedHours ? parseFloat(project.budgetedHours) : 0;
      const baseBudget = project.baseBudget ? parseFloat(project.baseBudget) : 0;
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      // Calculate upcoming milestones
      const now = new Date();
      const emailMilestones: { date: string; label: string; type: string; daysUntil: number; isPast: boolean }[] = [];
      const milestoneFieldsEmail = [
        { field: 'startDate', label: 'Project Start' },
        { field: 'substantialCompletionDate', label: 'Substantial Completion' },
        { field: 'finalCloseoutDate', label: 'Final Closeout' },
      ];
      for (const m of milestoneFieldsEmail) {
        const dateValue = (project as any)[m.field];
        if (dateValue) {
          const date = new Date(dateValue);
          const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          emailMilestones.push({
            date: String(dateValue),
            label: m.label,
            type: m.field,
            daysUntil,
            isPast: daysUntil < 0,
          });
        }
      }
      const emailUpcomingMilestones = emailMilestones
        .filter(m => m.daysUntil >= -7)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      
      const pdfBuffer = await generateMonthlySummaryPdf({
        projectName: project.name,
        projectNumber: project.projectNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        month: monthNum,
        year: yearNum,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: project.startDate ? String(project.startDate) : null,
          endDate: project.substantialCompletionDate ? String(project.substantialCompletionDate) : null,
          daysRemaining: null,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - totalHoursUsed),
          progress: budgetedHours > 0 ? (totalHoursUsed / budgetedHours) * 100 : 0,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        dailyReports: dailyReportsData,
        weatherSummary: {
          totalReports: monthlyReports.length,
          breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
            type, count, percentage: monthlyReports.length > 0 ? Math.round((count / monthlyReports.length) * 100) : 0,
          })),
        },
        issuesSummary: {
          totalCount: monthlyReports.filter(r => r.issuesFlag).length,
          issues: monthlyReports.filter(r => r.issuesFlag).map(r => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.issuesDetails || '',
          })),
        },
        safetySummary: {
          totalCount: monthlyReports.filter(r => r.safetyFlag).length,
          incidents: monthlyReports.filter(r => r.safetyFlag).map(r => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.safetyDetails || '',
          })),
        },
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          ...hours,
        })),
        upcomingMilestones: emailUpcomingMilestones,
      });
      
      // Merge summary PDF with individual daily report PDFs
      const mergedPdf = await PDFLibDocument.create();
      
      // Add summary pages first
      const summaryDoc = await PDFLibDocument.load(pdfBuffer);
      const summaryPages = await mergedPdf.copyPages(summaryDoc, summaryDoc.getPageIndices());
      summaryPages.forEach(page => mergedPdf.addPage(page));
      
      // Add individual daily report PDFs (sorted by date)
      const reportsWithPdfs = monthlyReports.filter((r: any) => r.pdfPath);
      reportsWithPdfs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (const report of reportsWithPdfs) {
        try {
          let pdfBytes: Uint8Array;
          if (report.pdfPath!.startsWith('/objects/')) {
            const buffer = await objectStorage.downloadBuffer(report.pdfPath!);
            pdfBytes = new Uint8Array(buffer);
          } else {
            const localPath = path.join(process.cwd(), report.pdfPath!.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              pdfBytes = new Uint8Array(fs.readFileSync(localPath));
            } else {
              continue;
            }
          }
          
          const reportPdfDoc = await PDFLibDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(reportPdfDoc, reportPdfDoc.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
          console.error(`Error adding daily report ${report.id} to monthly email PDF:`, err);
        }
      }
      
      const finalPdfBytes = await mergedPdf.save();
      const finalPdfBuffer = Buffer.from(finalPdfBytes);
      
      const monthName = format(startDate, 'MMMM yyyy');
      const fileName = `${project.name.replace(/[^a-z0-9]/gi, '_')}_Monthly_Summary_${format(startDate, 'MMMM_yyyy')}.pdf`;
      
      // Send email
      await sendEmail({
        to: uniqueRecipients,
        subject: `Monthly Summary: ${project.name} - ${monthName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Monthly Project Summary</h2>
            <p>Please find attached the monthly summary report for <strong>${project.name}</strong> for <strong>${monthName}</strong>.</p>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Quick Summary</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Total Reports:</strong> ${monthlyReports.length}</li>
                <li><strong>Total Hours:</strong> ${totalHoursUsed.toFixed(1)} hours</li>
                <li><strong>Regular:</strong> ${totalRegular.toFixed(1)} hrs | <strong>OT:</strong> ${totalOT.toFixed(1)} hrs | <strong>Premium:</strong> ${totalPremium.toFixed(1)} hrs</li>
              </ul>
            </div>
            
            <p style="color: #666; font-size: 14px;">This report was generated automatically from the Field Daily Reports system.</p>
            <p style="color: #999; font-size: 12px;">${company?.name || ''}</p>
          </div>
        `,
        attachments: [{
          filename: fileName,
          content: finalPdfBuffer,
        }],
      });
      
      res.json({ 
        success: true, 
        message: `Monthly summary sent to ${uniqueRecipients.length} recipient(s)`,
        recipients: uniqueRecipients,
      });
    } catch (error) {
      console.error("Error emailing monthly summary:", error);
      res.status(500).json({ message: "Failed to send monthly summary email" });
    }
  });

  // Weekly summary PDF for a project
  app.get("/api/projects/:id/weekly-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const { weekStart, weekEnd } = req.query;
      
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ message: "Week start and end dates are required" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info and logo
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
        if (company?.logoPath) {
          try {
            logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
          } catch (e) {
            console.log("Could not load company logo");
          }
        }
      }
      
      const startDate = new Date(weekStart as string);
      const endDate = new Date(weekEnd as string);
      
      // Get daily reports for the week
      const allReports = await storage.getReportsByProject(projectId);
      const weeklyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(weeklyReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      // Calculate hours
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of weeklyReports) {
        totalRegular += parseFloat((r as any).regularHours || '0');
        totalOT += parseFloat((r as any).otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      
      // Build daily reports data
      const dailyReportsData = weeklyReports.map((r: any) => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId || '') || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat(r.premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Weather summary
      const weatherCounts: Record<string, number> = {};
      for (const r of weeklyReports) {
        const weather = (r as any).weatherType || 'unknown';
        weatherCounts[weather] = (weatherCounts[weather] || 0) + 1;
      }
      const weatherSummary = {
        totalReports: weeklyReports.length,
        breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
          type,
          count,
          percentage: weeklyReports.length > 0 ? Math.round((count / weeklyReports.length) * 100) : 0,
        })),
      };
      
      // Issues and safety
      const issuesSummary = {
        totalCount: weeklyReports.filter((r: any) => r.issuesFlag).length,
        issues: weeklyReports.filter((r: any) => r.issuesFlag).map((r: any) => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          details: r.issuesDetails || '',
        })),
      };
      
      const safetySummary = {
        totalCount: weeklyReports.filter((r: any) => r.safetyFlag).length,
        incidents: weeklyReports.filter((r: any) => r.safetyFlag).map((r: any) => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          details: r.safetyDetails || '',
        })),
      };
      
      // Team overview
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of weeklyReports) {
        const inspId = r.inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      const teamOverview = Object.entries(teamHours).map(([inspId, hours]) => ({
        inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
        regular: hours.regular,
        overtime: hours.overtime,
        premium: hours.premium,
        reportCount: hours.reportCount,
      }));
      
      // Get client name
      let clientName = project.client || '';
      if (project.clientId) {
        const client = await storage.getClient(project.clientId);
        if (client) clientName = client.name;
      }
      
      const budgetedHours = project.budgetedHours ? parseFloat(project.budgetedHours) : 0;
      const baseBudget = project.baseBudget ? parseFloat(project.baseBudget) : 0;
      
      // Generate PDF
      const pdfBuffer = await generateWeeklySummaryPdf({
        projectName: project.name,
        projectNumber: project.projectNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        weekStart: weekStart as string,
        weekEnd: weekEnd as string,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: project.startDate ? String(project.startDate) : null,
          endDate: project.substantialCompletionDate ? String(project.substantialCompletionDate) : null,
          daysRemaining: null,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget,
          used: totalRegular + totalOT + totalPremium,
          remaining: Math.max(0, budgetedHours - totalRegular - totalOT - totalPremium),
          progress: budgetedHours > 0 ? ((totalRegular + totalOT + totalPremium) / budgetedHours) * 100 : 0,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        dailyReports: dailyReportsData,
        weatherSummary,
        issuesSummary,
        safetySummary,
        teamOverview,
      });
      
      // Merge summary PDF with individual daily report PDFs
      const mergedPdf = await PDFLibDocument.create();
      
      // Add summary pages first
      const summaryDoc = await PDFLibDocument.load(pdfBuffer);
      const summaryPages = await mergedPdf.copyPages(summaryDoc, summaryDoc.getPageIndices());
      summaryPages.forEach(page => mergedPdf.addPage(page));
      
      // Add individual daily report PDFs (sorted by date)
      const reportsWithPdfs = weeklyReports.filter((r: any) => r.pdfPath);
      reportsWithPdfs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (const report of reportsWithPdfs) {
        try {
          let pdfBytes: Uint8Array;
          if (report.pdfPath!.startsWith('/objects/')) {
            const buffer = await objectStorage.downloadBuffer(report.pdfPath!);
            pdfBytes = new Uint8Array(buffer);
          } else {
            const localPath = path.join(process.cwd(), report.pdfPath!.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              pdfBytes = new Uint8Array(fs.readFileSync(localPath));
            } else {
              continue;
            }
          }
          
          const reportPdfDoc = await PDFLibDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(reportPdfDoc, reportPdfDoc.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
          console.error(`Error adding daily report ${report.id} to weekly summary PDF:`, err);
        }
      }
      
      const finalPdfBytes = await mergedPdf.save();
      const finalPdfBuffer = Buffer.from(finalPdfBytes);
      
      const weekLabel = format(startDate, 'MMM_d') + '_to_' + format(endDate, 'MMM_d_yyyy');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_Weekly_Summary_${weekLabel}.pdf"`);
      res.send(finalPdfBuffer);
    } catch (error) {
      console.error("Error generating weekly summary PDF:", error);
      res.status(500).json({ message: "Failed to generate weekly summary" });
    }
  });

  // Current status PDF for a project
  app.get("/api/projects/:id/current-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info and logo
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
        if (company?.logoPath) {
          try {
            logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
          } catch (e) {
            console.log("Could not load company logo");
          }
        }
      }
      
      // Get all daily reports
      const allReports = await storage.getReportsByProject(projectId);
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(allReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      // Calculate total hours
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of allReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      // Calculate schedule progress
      const now = new Date();
      let scheduleProgress = 0;
      let scheduleStatus = 'not_started';
      let daysRemaining: number | null = null;
      let daysOverdue: number | null = null;
      
      if (project.startDate && project.substantialCompletionDate) {
        const start = new Date(project.startDate);
        const end = new Date(project.substantialCompletionDate);
        const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const elapsedDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        
        if (now < start) {
          scheduleProgress = 0;
          scheduleStatus = 'not_started';
        } else if (now > end) {
          scheduleProgress = 100;
          daysOverdue = Math.ceil((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = 'overdue';
        } else {
          scheduleProgress = Math.min(100, (elapsedDays / totalDays) * 100);
          daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = scheduleProgress > 75 ? 'warning' : 'on_track';
        }
      }
      
      // Budget calculations
      const budgetedHours = project.budgetedHours ? parseFloat(project.budgetedHours) : 0;
      const baseBudget = project.baseBudget ? parseFloat(project.baseBudget) : 0;
      const effectiveTotalHours = totalHoursUsed + baseBudget;
      const budgetProgress = budgetedHours > 0 ? (effectiveTotalHours / budgetedHours) * 100 : 0;
      const budgetStatus = budgetProgress >= 100 ? 'over' : budgetProgress >= 75 ? 'warning' : 'on_track';
      
      // Calculate milestones
      const milestones: { date: string; label: string; type: string; daysUntil: number; isPast: boolean }[] = [];
      const milestoneFields = [
        { field: 'startDate', label: 'Project Start' },
        { field: 'substantialCompletionDate', label: 'Substantial Completion' },
        { field: 'finalCloseoutDate', label: 'Final Closeout' },
      ];
      for (const m of milestoneFields) {
        const dateValue = (project as any)[m.field];
        if (dateValue) {
          const date = new Date(dateValue);
          const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          milestones.push({
            date: String(dateValue),
            label: m.label,
            type: m.field,
            daysUntil,
            isPast: daysUntil < 0,
          });
        }
      }
      
      // Team overview
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of allReports) {
        const inspId = r.inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      const teamOverview = Object.entries(teamHours).map(([inspId, hours]) => ({
        inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
        regular: hours.regular,
        overtime: hours.overtime,
        premium: hours.premium,
        reportCount: hours.reportCount,
      }));
      
      // Recent reports
      const recentReports = allReports
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map((r: any) => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          inspectorName: inspectorNameMap.get(r.inspectorId || '') || 'Unknown',
          weatherType: r.weatherType,
          workDescription: r.workPerformed,
        }));
      
      // Get client name
      let clientName = project.client || '';
      if (project.clientId) {
        const client = await storage.getClient(project.clientId);
        if (client) clientName = client.name;
      }
      
      // Issues and safety counts
      const issuesCount = allReports.filter((r: any) => r.issuesFlag).length;
      const safetyCount = allReports.filter((r: any) => r.safetyFlag).length;
      
      // Generate PDF
      const pdfBuffer = await generateCurrentStatusPdf({
        projectName: project.name,
        projectNumber: project.projectNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        schedule: {
          progress: scheduleProgress,
          status: scheduleStatus,
          startDate: project.startDate ? String(project.startDate) : null,
          endDate: project.substantialCompletionDate ? String(project.substantialCompletionDate) : null,
          daysRemaining,
          daysOverdue,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - effectiveTotalHours),
          progress: budgetProgress,
          status: budgetStatus,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        milestones,
        teamOverview,
        recentReports,
        totalReports: allReports.length,
        issuesCount,
        safetyCount,
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_Current_Status_${format(now, 'MMM_d_yyyy')}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating current status PDF:", error);
      res.status(500).json({ message: "Failed to generate current status" });
    }
  });

  // Email weekly summary to distribution list
  app.post("/api/projects/:id/weekly-summary/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const { weekStart, weekEnd, additionalEmails } = req.body;
      
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ message: "Week start and end dates are required" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Collect recipients
      const recipients: string[] = [];
      if (project.distributionEmails && Array.isArray(project.distributionEmails)) {
        recipients.push(...project.distributionEmails);
      }
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      // Get company info and logo
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
        if (company?.logoPath) {
          try {
            logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
          } catch (e) {
            console.log("Could not load company logo");
          }
        }
      }
      
      const startDate = new Date(weekStart);
      const endDate = new Date(weekEnd);
      
      // Get daily reports for the week
      const allReports = await storage.getReportsByProject(projectId);
      const weeklyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Calculate totals
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const report of weeklyReports) {
        totalRegular += parseFloat(report.regularHours || '0');
        totalOT += parseFloat(report.otHours || '0');
        totalPremium += parseFloat((report as any).premiumHours || '0');
      }
      
      const inspectorIds = Array.from(new Set(weeklyReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      const dailyReportsData = weeklyReports.map((r: any) => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId) || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat((r as any).premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Weather summary
      const weatherCounts: Record<string, number> = {};
      for (const r of weeklyReports) {
        weatherCounts[(r as any).weatherType || 'unknown'] = (weatherCounts[(r as any).weatherType || 'unknown'] || 0) + 1;
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of weeklyReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      let clientName = project.client || '';
      if (project.clientId) {
        const client = await storage.getClient(project.clientId);
        if (client) clientName = client.name;
      }
      
      const budgetedHours = project.budgetedHours ? parseFloat(project.budgetedHours) : 0;
      const baseBudget = project.baseBudget ? parseFloat(project.baseBudget) : 0;
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      // Generate PDF
      const pdfBuffer = await generateWeeklySummaryPdf({
        projectName: project.name,
        projectNumber: project.projectNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        weekStart,
        weekEnd,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: project.startDate ? String(project.startDate) : null,
          endDate: project.substantialCompletionDate ? String(project.substantialCompletionDate) : null,
          daysRemaining: null,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - totalHoursUsed),
          progress: budgetedHours > 0 ? (totalHoursUsed / budgetedHours) * 100 : 0,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        dailyReports: dailyReportsData,
        weatherSummary: {
          totalReports: weeklyReports.length,
          breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
            type, count, percentage: weeklyReports.length > 0 ? Math.round((count / weeklyReports.length) * 100) : 0,
          })),
        },
        issuesSummary: {
          totalCount: weeklyReports.filter((r: any) => r.issuesFlag).length,
          issues: weeklyReports.filter((r: any) => r.issuesFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.issuesDetails || '',
          })),
        },
        safetySummary: {
          totalCount: weeklyReports.filter((r: any) => r.safetyFlag).length,
          incidents: weeklyReports.filter((r: any) => r.safetyFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.safetyDetails || '',
          })),
        },
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          ...hours,
        })),
      });
      
      // Merge summary PDF with individual daily report PDFs
      const mergedPdf = await PDFLibDocument.create();
      
      // Add summary pages first
      const summaryDoc = await PDFLibDocument.load(pdfBuffer);
      const summaryPages = await mergedPdf.copyPages(summaryDoc, summaryDoc.getPageIndices());
      summaryPages.forEach(page => mergedPdf.addPage(page));
      
      // Add individual daily report PDFs (sorted by date)
      const reportsWithPdfs = weeklyReports.filter((r: any) => r.pdfPath);
      reportsWithPdfs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      for (const report of reportsWithPdfs) {
        try {
          let pdfBytes: Uint8Array;
          if (report.pdfPath!.startsWith('/objects/')) {
            const buffer = await objectStorage.downloadBuffer(report.pdfPath!);
            pdfBytes = new Uint8Array(buffer);
          } else {
            const localPath = path.join(process.cwd(), report.pdfPath!.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              pdfBytes = new Uint8Array(fs.readFileSync(localPath));
            } else {
              continue;
            }
          }
          
          const reportPdfDoc = await PDFLibDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(reportPdfDoc, reportPdfDoc.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
          console.error(`Error adding daily report ${report.id} to weekly email PDF:`, err);
        }
      }
      
      const finalPdfBytes = await mergedPdf.save();
      const finalPdfBuffer = Buffer.from(finalPdfBytes);
      
      const weekLabel = format(startDate, 'MMM d') + ' - ' + format(endDate, 'MMM d, yyyy');
      const fileName = `${project.name.replace(/[^a-z0-9]/gi, '_')}_Weekly_Summary_${format(startDate, 'MMM_d')}_to_${format(endDate, 'MMM_d_yyyy')}.pdf`;
      
      // Send email
      await sendEmail({
        to: uniqueRecipients,
        subject: `Weekly Summary: ${project.name} - ${weekLabel}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Weekly Project Summary</h2>
            <p>Please find attached the weekly summary report for <strong>${project.name}</strong> for <strong>${weekLabel}</strong>.</p>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Quick Summary</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Total Reports:</strong> ${weeklyReports.length}</li>
                <li><strong>Total Hours:</strong> ${totalHoursUsed.toFixed(1)} hours</li>
                <li><strong>Regular:</strong> ${totalRegular.toFixed(1)} hrs | <strong>OT:</strong> ${totalOT.toFixed(1)} hrs | <strong>Premium:</strong> ${totalPremium.toFixed(1)} hrs</li>
              </ul>
            </div>
            
            <p style="color: #666; font-size: 14px;">This report was generated automatically from the Field Daily Reports system.</p>
            <p style="color: #999; font-size: 12px;">${company?.name || ''}</p>
          </div>
        `,
        attachments: [{
          filename: fileName,
          content: finalPdfBuffer,
        }],
      });
      
      res.json({ 
        success: true, 
        message: `Weekly summary sent to ${uniqueRecipients.length} recipient(s)`,
        recipients: uniqueRecipients,
      });
    } catch (error) {
      console.error("Error emailing weekly summary:", error);
      res.status(500).json({ message: "Failed to send weekly summary email" });
    }
  });

  // Email current status to distribution list
  app.post("/api/projects/:id/current-status/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const projectId = req.params.id;
      const { additionalEmails } = req.body;
      
      const profile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Collect recipients
      const recipients: string[] = [];
      if (project.distributionEmails && Array.isArray(project.distributionEmails)) {
        recipients.push(...project.distributionEmails);
      }
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      // Get company info and logo
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
        if (company?.logoPath) {
          try {
            logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
          } catch (e) {
            console.log("Could not load company logo");
          }
        }
      }
      
      // Get all daily reports
      const allReports = await storage.getReportsByProject(projectId);
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(allReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      // Calculate total hours
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of allReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      // Calculate schedule progress
      const now = new Date();
      let scheduleProgress = 0;
      let scheduleStatus = 'not_started';
      let daysRemaining: number | null = null;
      let daysOverdue: number | null = null;
      
      if (project.startDate && project.substantialCompletionDate) {
        const start = new Date(project.startDate);
        const end = new Date(project.substantialCompletionDate);
        const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const elapsedDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        
        if (now < start) {
          scheduleProgress = 0;
          scheduleStatus = 'not_started';
        } else if (now > end) {
          scheduleProgress = 100;
          daysOverdue = Math.ceil((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = 'overdue';
        } else {
          scheduleProgress = Math.min(100, (elapsedDays / totalDays) * 100);
          daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = scheduleProgress > 75 ? 'warning' : 'on_track';
        }
      }
      
      // Budget calculations
      const budgetedHours = project.budgetedHours ? parseFloat(project.budgetedHours) : 0;
      const baseBudget = project.baseBudget ? parseFloat(project.baseBudget) : 0;
      const effectiveTotalHours = totalHoursUsed + baseBudget;
      const budgetProgress = budgetedHours > 0 ? (effectiveTotalHours / budgetedHours) * 100 : 0;
      const budgetStatus = budgetProgress >= 100 ? 'over' : budgetProgress >= 75 ? 'warning' : 'on_track';
      
      // Calculate milestones
      const milestones: { date: string; label: string; type: string; daysUntil: number; isPast: boolean }[] = [];
      const milestoneFields = [
        { field: 'startDate', label: 'Project Start' },
        { field: 'substantialCompletionDate', label: 'Substantial Completion' },
        { field: 'finalCloseoutDate', label: 'Final Closeout' },
      ];
      for (const m of milestoneFields) {
        const dateValue = (project as any)[m.field];
        if (dateValue) {
          const date = new Date(dateValue);
          const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          milestones.push({
            date: String(dateValue),
            label: m.label,
            type: m.field,
            daysUntil,
            isPast: daysUntil < 0,
          });
        }
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of allReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      // Recent reports
      const recentReports = allReports
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map((r: any) => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          inspectorName: inspectorNameMap.get(r.inspectorId || '') || 'Unknown',
          weatherType: r.weatherType,
          workDescription: r.workPerformed,
        }));
      
      // Get client name
      let clientName = project.client || '';
      if (project.clientId) {
        const client = await storage.getClient(project.clientId);
        if (client) clientName = client.name;
      }
      
      // Issues and safety counts
      const issuesCount = allReports.filter((r: any) => r.issuesFlag).length;
      const safetyCount = allReports.filter((r: any) => r.safetyFlag).length;
      
      // Generate PDF
      const pdfBuffer = await generateCurrentStatusPdf({
        projectName: project.name,
        projectNumber: project.projectNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        schedule: {
          progress: scheduleProgress,
          status: scheduleStatus,
          startDate: project.startDate ? String(project.startDate) : null,
          endDate: project.substantialCompletionDate ? String(project.substantialCompletionDate) : null,
          daysRemaining,
          daysOverdue,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - effectiveTotalHours),
          progress: budgetProgress,
          status: budgetStatus,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        milestones,
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          regular: hours.regular,
          overtime: hours.overtime,
          premium: hours.premium,
          reportCount: hours.reportCount,
        })),
        recentReports: recentReports,
        totalReports: allReports.length,
        issuesCount,
        safetyCount,
      });
      
      const dateLabel = format(now, 'MMM d, yyyy');
      const fileName = `${project.name.replace(/[^a-z0-9]/gi, '_')}_Current_Status_${format(now, 'MMM_d_yyyy')}.pdf`;
      
      // Send email
      await sendEmail({
        to: uniqueRecipients,
        subject: `Current Status: ${project.name} - ${dateLabel}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Project Current Status</h2>
            <p>Please find attached the current status report for <strong>${project.name}</strong> as of <strong>${dateLabel}</strong>.</p>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Quick Summary</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Total Reports:</strong> ${allReports.length}</li>
                <li><strong>Total Hours:</strong> ${totalHoursUsed.toFixed(1)} hours</li>
                <li><strong>Budget Used:</strong> ${budgetProgress.toFixed(0)}%</li>
                <li><strong>Schedule Progress:</strong> ${scheduleProgress.toFixed(0)}%</li>
              </ul>
            </div>
            
            <p style="color: #666; font-size: 14px;">This report was generated automatically from the Field Daily Reports system.</p>
            <p style="color: #999; font-size: 12px;">${company?.name || ''}</p>
          </div>
        `,
        attachments: [{
          filename: fileName,
          content: pdfBuffer,
        }],
      });
      
      res.json({ 
        success: true, 
        message: `Current status sent to ${uniqueRecipients.length} recipient(s)`,
        recipients: uniqueRecipients,
      });
    } catch (error) {
      console.error("Error emailing current status:", error);
      res.status(500).json({ message: "Failed to send current status email" });
    }
  });

  // Company Monthly Summary PDF
  app.get("/api/company/monthly-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { month, year } = req.query;
      
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const companyId = profile.activeCompanyId;
      const isMember = await storage.isUserMemberOfCompany(companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      const company = await storage.getCompany(companyId);
      let logoBuffer: Buffer | undefined = undefined;
      if (company?.logoPath) {
        try {
          logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
        } catch (e) {
          console.log("Could not load company logo");
        }
      }
      
      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0);
      
      // Get all reports for this company in the month
      const allReports = await storage.getReports({ companyId });
      const monthlyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Calculate totals
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of monthlyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(monthlyReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      const dailyReportsData = monthlyReports.map((r: any) => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId) || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat((r as any).premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Weather summary
      const weatherCounts: Record<string, number> = {};
      for (const r of monthlyReports) {
        weatherCounts[(r as any).weatherType || 'unknown'] = (weatherCounts[(r as any).weatherType || 'unknown'] || 0) + 1;
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of monthlyReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const pdfBuffer = await generateMonthlySummaryPdf({
        projectName: company?.name || 'Company',
        projectNumber: 'Company-Wide Report',
        clientName: '',
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        month: monthNum,
        year: yearNum,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: null,
          endDate: null,
          daysRemaining: null,
        },
        hours: {
          budgeted: 0,
          baseBudget: 0,
          used: totalHoursUsed,
          remaining: 0,
          progress: 0,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        dailyReports: dailyReportsData,
        weatherSummary: {
          totalReports: monthlyReports.length,
          breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
            type, count, percentage: monthlyReports.length > 0 ? Math.round((count / monthlyReports.length) * 100) : 0,
          })),
        },
        issuesSummary: {
          totalCount: monthlyReports.filter((r: any) => r.issuesFlag).length,
          issues: monthlyReports.filter((r: any) => r.issuesFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.issuesDetails || '',
          })),
        },
        safetySummary: {
          totalCount: monthlyReports.filter((r: any) => r.safetyFlag).length,
          incidents: monthlyReports.filter((r: any) => r.safetyFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.safetyDetails || '',
          })),
        },
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          ...hours,
        })),
        upcomingMilestones: [],
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${(company?.name || 'Company').replace(/[^a-z0-9]/gi, '_')}_Monthly_Summary_${format(startDate, 'MMMM_yyyy')}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating company monthly summary:", error);
      res.status(500).json({ message: "Failed to generate monthly summary" });
    }
  });

  // Company Weekly Summary PDF
  app.get("/api/company/weekly-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { weekStart, weekEnd } = req.query;
      
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ message: "Week start and end dates are required" });
      }
      
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const companyId = profile.activeCompanyId;
      const isMember = await storage.isUserMemberOfCompany(companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      const company = await storage.getCompany(companyId);
      let logoBuffer: Buffer | undefined = undefined;
      if (company?.logoPath) {
        try {
          logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
        } catch (e) {
          console.log("Could not load company logo");
        }
      }
      
      const startDate = new Date(weekStart as string);
      const endDate = new Date(weekEnd as string);
      
      // Get all reports for this company in the week
      const allReports = await storage.getReports({ companyId });
      const weeklyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Calculate totals
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of weeklyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(weeklyReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      const dailyReportsData = weeklyReports.map((r: any) => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId) || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat((r as any).premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Weather summary
      const weatherCounts: Record<string, number> = {};
      for (const r of weeklyReports) {
        weatherCounts[(r as any).weatherType || 'unknown'] = (weatherCounts[(r as any).weatherType || 'unknown'] || 0) + 1;
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of weeklyReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const pdfBuffer = await generateWeeklySummaryPdf({
        projectName: company?.name || 'Company',
        projectNumber: 'Company-Wide Report',
        clientName: '',
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        weekStart: weekStart as string,
        weekEnd: weekEnd as string,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: null,
          endDate: null,
          daysRemaining: null,
        },
        hours: {
          budgeted: 0,
          baseBudget: 0,
          used: totalHoursUsed,
          remaining: 0,
          progress: 0,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        dailyReports: dailyReportsData,
        weatherSummary: {
          totalReports: weeklyReports.length,
          breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
            type, count, percentage: weeklyReports.length > 0 ? Math.round((count / weeklyReports.length) * 100) : 0,
          })),
        },
        issuesSummary: {
          totalCount: weeklyReports.filter((r: any) => r.issuesFlag).length,
          issues: weeklyReports.filter((r: any) => r.issuesFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.issuesDetails || '',
          })),
        },
        safetySummary: {
          totalCount: weeklyReports.filter((r: any) => r.safetyFlag).length,
          incidents: weeklyReports.filter((r: any) => r.safetyFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.safetyDetails || '',
          })),
        },
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          ...hours,
        })),
      });
      
      const weekLabel = format(startDate, 'MMM_d') + '_to_' + format(endDate, 'MMM_d_yyyy');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${(company?.name || 'Company').replace(/[^a-z0-9]/gi, '_')}_Weekly_Summary_${weekLabel}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating company weekly summary:", error);
      res.status(500).json({ message: "Failed to generate weekly summary" });
    }
  });

  // Company Current Status PDF
  app.get("/api/company/current-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const companyId = profile.activeCompanyId;
      const isMember = await storage.isUserMemberOfCompany(companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      const company = await storage.getCompany(companyId);
      let logoBuffer: Buffer | undefined = undefined;
      if (company?.logoPath) {
        try {
          logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
        } catch (e) {
          console.log("Could not load company logo");
        }
      }
      
      // Get all reports for this company
      const allReports = await storage.getReports({ companyId });
      
      // Calculate totals
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of allReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(allReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of allReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      // Recent reports
      const now = new Date();
      const recentReports = allReports
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map((r: any) => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          inspectorName: inspectorNameMap.get(r.inspectorId || '') || 'Unknown',
          weatherType: r.weatherType,
          workDescription: r.workPerformed,
        }));
      
      const pdfBuffer = await generateCurrentStatusPdf({
        projectName: company?.name || 'Company',
        projectNumber: 'Company-Wide Report',
        clientName: '',
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: null,
          endDate: null,
          daysRemaining: null,
          daysOverdue: null,
        },
        hours: {
          budgeted: 0,
          baseBudget: 0,
          used: totalHoursUsed,
          remaining: 0,
          progress: 0,
          status: 'on_track',
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        milestones: [],
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          regular: hours.regular,
          overtime: hours.overtime,
          premium: hours.premium,
          reportCount: hours.reportCount,
        })),
        recentReports: recentReports,
        totalReports: allReports.length,
        issuesCount: allReports.filter((r: any) => r.issuesFlag).length,
        safetyCount: allReports.filter((r: any) => r.safetyFlag).length,
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${(company?.name || 'Company').replace(/[^a-z0-9]/gi, '_')}_Current_Status_${format(now, 'MMM_d_yyyy')}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating company current status:", error);
      res.status(500).json({ message: "Failed to generate current status" });
    }
  });

  // Company Weekly Summary Email
  app.post("/api/company/weekly-summary/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { weekStart, weekEnd, additionalEmails } = req.body;
      
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ message: "Week start and end dates are required" });
      }
      
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isEffectiveSystemAdmin(profile) && !isMember && !isCompAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const recipients: string[] = [];
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      const company = await storage.getCompany(profile.activeCompanyId);
      const startDate = new Date(weekStart);
      const endDate = new Date(weekEnd);
      const allReports = await storage.getCompanyReports(profile.activeCompanyId);
      const weeklyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of weeklyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const weekLabel = format(startDate, 'MMM d') + ' - ' + format(endDate, 'MMM d, yyyy');
      
      await sendEmail({
        to: uniqueRecipients,
        subject: `Weekly Company Summary: ${company?.name || 'Company'} - ${weekLabel}`,
        html: `<div style="font-family: Arial, sans-serif;"><h2>Weekly Company Summary</h2><p>Company: <strong>${company?.name || ''}</strong><br/>Week: ${weekLabel}</p><p>Total Reports: ${weeklyReports.length}<br/>Total Hours: ${totalHoursUsed.toFixed(1)}</p></div>`,
      });
      
      res.json({ success: true, message: `Weekly summary sent to ${uniqueRecipients.length} recipient(s)`, recipients: uniqueRecipients });
    } catch (error) {
      console.error("Error emailing company weekly summary:", error);
      res.status(500).json({ message: "Failed to send weekly summary email" });
    }
  });

  // Company Monthly Summary Email
  app.post("/api/company/monthly-summary/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { month, year, additionalEmails } = req.body;
      
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isEffectiveSystemAdmin(profile) && !isMember && !isCompAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const recipients: string[] = [];
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      const company = await storage.getCompany(profile.activeCompanyId);
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0);
      
      const allReports = await storage.getCompanyReports(profile.activeCompanyId);
      const monthlyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of monthlyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      const monthLabel = format(startDate, 'MMMM yyyy');
      
      await sendEmail({
        to: uniqueRecipients,
        subject: `Monthly Company Summary: ${company?.name || 'Company'} - ${monthLabel}`,
        html: `<div style="font-family: Arial, sans-serif;"><h2>Monthly Company Summary</h2><p>Company: <strong>${company?.name || ''}</strong><br/>Month: ${monthLabel}</p><p>Total Reports: ${monthlyReports.length}<br/>Total Hours: ${totalHoursUsed.toFixed(1)}</p></div>`,
      });
      
      res.json({ success: true, message: `Monthly summary sent to ${uniqueRecipients.length} recipient(s)`, recipients: uniqueRecipients });
    } catch (error) {
      console.error("Error emailing company monthly summary:", error);
      res.status(500).json({ message: "Failed to send monthly summary email" });
    }
  });

  // Company Current Status Email
  app.post("/api/company/current-status/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { additionalEmails } = req.body;
      
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isEffectiveSystemAdmin(profile) && !isMember && !isCompAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const recipients: string[] = [];
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      const company = await storage.getCompany(profile.activeCompanyId);
      const allReports = await storage.getCompanyReports(profile.activeCompanyId);
      
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of allReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const now = new Date();
      const dateLabel = format(now, 'MMM d, yyyy');
      
      await sendEmail({
        to: uniqueRecipients,
        subject: `Company Current Status: ${company?.name || 'Company'} - ${dateLabel}`,
        html: `<div style="font-family: Arial, sans-serif;"><h2>Company Current Status</h2><p>Company: <strong>${company?.name || ''}</strong><br/>As of: ${dateLabel}</p><p>Total Reports: ${allReports.length}<br/>Total Hours: ${totalHoursUsed.toFixed(1)}</p></div>`,
      });
      
      res.json({ success: true, message: `Current status sent to ${uniqueRecipients.length} recipient(s)`, recipients: uniqueRecipients });
    } catch (error) {
      console.error("Error emailing company current status:", error);
      res.status(500).json({ message: "Failed to send current status email" });
    }
  });

  // ========== CONTRACTS ==========
  const contractStatusLabels: Record<string, string> = {
    bid_release: "Bid Release",
    bid_received: "Bid Received",
    under_review: "Under Review",
    awarded: "Awarded",
    not_awarded: "Not Awarded",
    cancelled: "Cancelled",
    in_execution: "In Execution",
    substantial_completion: "Substantial Completion",
    final_closeout: "Final Closeout"
  };

  const contractTypeLabels: Record<string, string> = {
    lump_sum: "Lump Sum",
    time_and_materials: "Time & Materials",
    unit_price: "Unit Price",
    cost_plus: "Cost Plus",
    design_build: "Design Build",
    hourly_rate: "Hourly Rate",
    other: "Other"
  };

  // Get contracts for active company (admin-only - contracts contain financial data)
  app.get("/api/contracts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json([]);
      }
      
      // Contracts contain financial data - restrict to admins only
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied - admin required" });
      }
      
      const contracts = await storage.getContracts(profile.activeCompanyId);
      res.json(contracts);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  // Get dashboard summary for all contracts (for company dashboard visualization)
  app.get("/api/contracts/dashboard-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json([]);
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isMember && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const allContracts = await storage.getContracts(profile.activeCompanyId);
      const now = new Date();
      
      // Filter to show all upcoming and active contracts until closeout
      // Includes: bid_release, bid_received, under_review, in_execution, substantial_completion
      // Excludes: final_closeout (complete), not_awarded (archived), cancelled (archived)
      const archivedStatuses = ['final_closeout', 'not_awarded', 'cancelled'];
      const contracts = allContracts.filter(c => !archivedStatuses.includes(c.status));
      
      // Calculate schedule and budget progress for each contract
      // Pre-fetch all clients for efficiency
      const clients = await storage.getClients(profile.activeCompanyId);
      const clientMap = new Map(clients.map(c => [c.id, c]));
      
      const dashboardData = await Promise.all(contracts.map(async (contract) => {
        // Calculate schedule progress
        let scheduleProgress = 0;
        let daysRemaining: number | null = null;
        let daysOverdue: number | null = null;
        let scheduleStatus: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete' | 'upcoming' = 'not_started';
        
        // Check if contract is in bid/pre-execution phase
        const isBidPhase = ['bid_release', 'bid_received', 'under_review'].includes(contract.status);
        const isComplete = contract.status === 'substantial_completion';
        
        if (isComplete) {
          // Contract has reached substantial completion
          scheduleProgress = 100;
          scheduleStatus = 'complete';
        } else if (isBidPhase) {
          // Contract is in bid phase - show as upcoming
          scheduleProgress = 0;
          scheduleStatus = 'upcoming';
          if (contract.startDate) {
            const startDate = new Date(contract.startDate);
            const daysToStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            daysRemaining = daysToStart > 0 ? daysToStart : null;
          }
        } else if (contract.startDate && contract.substantialCompletionDate) {
          const startDate = new Date(contract.startDate);
          const endDate = new Date(contract.substantialCompletionDate);
          const totalDuration = endDate.getTime() - startDate.getTime();
          const elapsed = now.getTime() - startDate.getTime();
          
          // Guard against invalid date ranges (endDate before startDate)
          if (totalDuration <= 0) {
            scheduleProgress = 0;
            scheduleStatus = 'not_started';
          } else if (now < startDate) {
            scheduleProgress = 0;
            scheduleStatus = 'upcoming';
            daysRemaining = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          } else if (now > endDate) {
            scheduleProgress = 100;
            daysOverdue = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
            scheduleStatus = 'overdue';
          } else {
            scheduleProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
            daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            scheduleStatus = scheduleProgress >= 80 ? 'warning' : 'on_track';
          }
        }
        
        // Calculate budget progress
        const budgetSummary = await storage.getContractBudgetSummary(contract.id);
        const totalBudget = contract.budgetOverride 
          ? parseFloat(contract.budgetOverride) 
          : parseFloat(contract.currentValue || contract.originalValue || '0');
        
        const baseBudgetSpent = parseFloat(contract.baseBudgetSpent || '0');
        const calculatedSpent = budgetSummary.totalBilled;
        const budgetSpent = baseBudgetSpent + calculatedSpent;
        const budgetRemaining = totalBudget - budgetSpent;
        
        // Handle edge cases for budget calculation
        let budgetProgress = 0;
        let budgetStatus: 'under' | 'on_track' | 'warning' | 'over' = 'on_track';
        
        if (totalBudget <= 0) {
          // No budget set - if there's spending, mark as warning
          budgetProgress = budgetSpent > 0 ? 100 : 0;
          budgetStatus = budgetSpent > 0 ? 'warning' : 'on_track';
        } else {
          budgetProgress = (budgetSpent / totalBudget) * 100;
          if (budgetProgress >= 100) {
            budgetStatus = 'over';
          } else if (budgetProgress >= 80) {
            budgetStatus = 'warning';
          } else if (budgetProgress < 50) {
            budgetStatus = 'under';
          }
        }
        
        // Get client name
        const client = contract.clientId ? clientMap.get(contract.clientId) : null;
        
        return {
          id: contract.id,
          name: contract.name,
          contractNumber: contract.contractNumber,
          status: contract.status,
          bidDueDate: contract.bidDueDate,
          clientName: client?.name || null,
          schedule: {
            progress: Math.round(scheduleProgress),
            status: scheduleStatus,
            daysRemaining,
            daysOverdue,
            startDate: contract.startDate,
            endDate: contract.substantialCompletionDate,
          },
          budget: {
            totalBudget,
            spent: budgetSpent,
            remaining: budgetRemaining,
            progress: Math.round(budgetProgress),
            status: budgetStatus,
          },
        };
      }));
      
      res.json(dashboardData);
    } catch (error) {
      console.error("Error fetching contracts dashboard summary:", error);
      res.status(500).json({ message: "Failed to fetch dashboard summary" });
    }
  });

  // Get comprehensive company dashboard data
  app.get("/api/company/dashboard", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json({ error: 'No active company' });
      }
      
      const companyId = profile.activeCompanyId;
      const isMember = await storage.isUserMemberOfCompany(companyId, userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isMember && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const now = new Date();
      
      // Fetch all needed data in parallel
      const [contracts, projects, companyMembers, allReports] = await Promise.all([
        storage.getContracts(companyId),
        storage.getProjectsByCompany(companyId),
        storage.getCompanyMembers(companyId),
        storage.getReports({ companyId }),
      ]);
      
      // 1. Inspector Workload - hours per inspector (last 30 days only)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const inspectorWorkload: Record<string, { userId: string; name: string; regularHours: number; overtimeHours: number; reportCount: number; projectIds: Set<string> }> = {};
      
      const recentReports = allReports.filter(report => {
        if (!report.date) return false;
        const reportDate = new Date(report.date);
        return reportDate >= thirtyDaysAgo;
      });
      
      for (const report of recentReports) {
        const inspectorId = report.inspectorId;
        if (!inspectorWorkload[inspectorId]) {
          inspectorWorkload[inspectorId] = { 
            userId: inspectorId, 
            name: '', 
            regularHours: 0, 
            overtimeHours: 0, 
            reportCount: 0, 
            projectIds: new Set() 
          };
        }
        inspectorWorkload[inspectorId].regularHours += parseFloat(report.regularHours || '0');
        inspectorWorkload[inspectorId].overtimeHours += parseFloat(report.otHours || '0');
        inspectorWorkload[inspectorId].reportCount += 1;
        if (report.projectId) {
          inspectorWorkload[inspectorId].projectIds.add(report.projectId);
        }
      }
      
      // Fetch inspector names
      const inspectorIds = Object.keys(inspectorWorkload);
      const inspectorProfiles = await Promise.all(inspectorIds.map(id => storage.getUserProfile(id)));
      for (const profile of inspectorProfiles) {
        if (profile && inspectorWorkload[profile.userId]) {
          inspectorWorkload[profile.userId].name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Inspector';
        }
      }
      
      const inspectorWorkloadList = Object.values(inspectorWorkload)
        .map(i => ({
          userId: i.userId,
          name: i.name || 'Unknown',
          regularHours: Math.round(i.regularHours * 10) / 10,
          overtimeHours: Math.round(i.overtimeHours * 10) / 10,
          totalHours: Math.round((i.regularHours + i.overtimeHours) * 10) / 10,
          reportCount: i.reportCount,
          projectCount: i.projectIds.size,
        }))
        .sort((a, b) => b.totalHours - a.totalHours);
      
      // 2. Contract Timeline - for calendar view
      const contractTimeline = contracts
        .filter(c => c.startDate || c.substantialCompletionDate)
        .map(c => ({
          id: c.id,
          name: c.name,
          contractNumber: c.contractNumber,
          status: c.status,
          startDate: c.startDate,
          endDate: c.substantialCompletionDate,
          color: c.status === 'in_execution' ? 'blue' : 
                 c.status === 'awarded' ? 'green' :
                 c.status === 'substantial_completion' ? 'gray' :
                 ['bid_release', 'bid_received', 'under_review'].includes(c.status) ? 'yellow' : 'gray',
        }))
        .sort((a, b) => {
          const aDate = a.startDate ? new Date(a.startDate).getTime() : Infinity;
          const bDate = b.startDate ? new Date(b.startDate).getTime() : Infinity;
          return aDate - bDate;
        });
      
      // 3. Notifications/Alerts - upcoming deadlines and budget alerts
      const alerts: { id: string; type: string; severity: 'info' | 'warning' | 'critical'; title: string; message: string; date: string; contractId?: string }[] = [];
      
      for (const contract of contracts) {
        // Check for upcoming milestone dates
        if (contract.substantialCompletionDate) {
          const completionDate = new Date(contract.substantialCompletionDate);
          const daysUntil = Math.ceil((completionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntil >= 0 && daysUntil <= 30 && !['substantial_completion', 'final_closeout'].includes(contract.status)) {
            alerts.push({
              id: `completion-${contract.id}`,
              type: 'deadline',
              severity: daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'warning' : 'info',
              title: 'Completion Approaching',
              message: `${contract.name} - ${daysUntil === 0 ? 'Due today' : `${daysUntil} days remaining`}`,
              date: contract.substantialCompletionDate instanceof Date 
                ? contract.substantialCompletionDate.toISOString() 
                : String(contract.substantialCompletionDate),
              contractId: contract.id,
            });
          }
        }
        
        // Check budget status
        const budgetSummary = await storage.getContractBudgetSummary(contract.id);
        const totalBudget = contract.budgetOverride 
          ? parseFloat(contract.budgetOverride) 
          : parseFloat(contract.currentValue || contract.originalValue || '0');
        
        if (totalBudget > 0) {
          const spent = parseFloat(contract.baseBudgetSpent || '0') + budgetSummary.totalBilled;
          const budgetProgress = (spent / totalBudget) * 100;
          
          if (budgetProgress >= 90) {
            alerts.push({
              id: `budget-${contract.id}`,
              type: 'budget',
              severity: budgetProgress >= 100 ? 'critical' : 'warning',
              title: budgetProgress >= 100 ? 'Over Budget' : 'Budget Warning',
              message: `${contract.name} - ${Math.round(budgetProgress)}% of budget used`,
              date: now.toISOString(),
              contractId: contract.id,
            });
          }
        }
      }
      
      // Sort alerts by severity then date
      alerts.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      
      // Filter out dismissed alerts
      const dismissedAlertIds = await storage.getDismissedAlerts(userId, companyId);
      const dismissedSet = new Set(dismissedAlertIds);
      const filteredAlerts = alerts.filter(a => !dismissedSet.has(a.id));
      
      // 4. Recent Activity - latest reports submitted
      const recentActivity = allReports
        .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
        .slice(0, 20)
        .map(r => {
          const project = projects.find(p => p.id === r.projectId);
          return {
            id: r.id,
            type: 'report' as const,
            date: r.createdAt?.toISOString() || (r.date instanceof Date ? r.date.toISOString() : r.date),
            title: `Daily Report - ${project?.name || r.projectId || 'Unknown'}`,
            status: r.status,
            inspectorId: r.inspectorId,
          };
        });
      
      // 5. Revenue Analytics - monthly totals
      const monthlyRevenue: Record<string, number> = {};
      const monthlyHours: Record<string, number> = {};
      
      for (const report of allReports) {
        const reportDate = report.date instanceof Date ? report.date : new Date(report.date);
        const monthKey = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;
        
        const regularHours = parseFloat(report.regularHours || '0');
        const otHours = parseFloat(report.otHours || '0');
        const totalHours = regularHours + otHours;
        
        monthlyHours[monthKey] = (monthlyHours[monthKey] || 0) + totalHours;
        
        // Estimate revenue using average rate (simplified)
        // In production, this would use actual billing rates
        const estimatedRate = 75; // Average hourly rate
        monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + (regularHours * estimatedRate) + (otHours * estimatedRate * 1.5);
      }
      
      // Convert to array sorted by month
      const revenueAnalytics = Object.entries(monthlyRevenue)
        .map(([month, revenue]) => ({
          month,
          revenue: Math.round(revenue),
          hours: Math.round((monthlyHours[month] || 0) * 10) / 10,
        }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12); // Last 12 months
      
      // 6. Summary Stats
      const activeContracts = contracts.filter(c => c.status === 'in_execution').length;
      const upcomingContracts = contracts.filter(c => ['bid_release', 'bid_received', 'under_review', 'awarded'].includes(c.status)).length;
      const completedContracts = contracts.filter(c => ['substantial_completion', 'final_closeout'].includes(c.status)).length;
      const activeProjects = projects.filter(p => (p as any).status === 'active').length;
      
      const totalHoursThisMonth = allReports
        .filter(r => {
          const reportDate = r.date instanceof Date ? r.date : new Date(r.date);
          return reportDate.getMonth() === now.getMonth() && reportDate.getFullYear() === now.getFullYear();
        })
        .reduce((sum, r) => sum + parseFloat(r.regularHours || '0') + parseFloat(r.otHours || '0'), 0);
      
      // 7. At-Risk Projects - projects with less than 20% of budgeted hours remaining
      const atRiskProjects: {
        id: string;
        name: string;
        contractId?: string;
        contractName?: string;
        hoursRemaining: number;
        budgetedHours: number;
        percentRemaining: number;
        status: 'orange' | 'red';
        recommendation: string;
      }[] = [];
      
      for (const project of projects) {
        // Get budgeted hours from linked contract option or project budget
        let budgetedHours = 0;
        let contractInfo: { id?: string; name?: string } = {};
        
        const projectAny = project as any;
        if (projectAny.contractId) {
          const contract = contracts.find(c => c.id === projectAny.contractId);
          if (contract) {
            contractInfo = { id: contract.id, name: contract.name };
          }
          
          // Get contract options for budgeted hours
          const contractOptions = await storage.getContractOptions(projectAny.contractId);
          const linkedOption = projectAny.contractOptionId 
            ? contractOptions.find(opt => opt.id === projectAny.contractOptionId)
            : contractOptions[0];
          
          if (linkedOption?.inspectors) {
            budgetedHours = linkedOption.inspectors.reduce((sum: number, i: any) => sum + parseFloat(i.hours || '0'), 0);
          }
        } else if (projectAny.budgetedHours) {
          budgetedHours = parseFloat(projectAny.budgetedHours);
        }
        
        if (budgetedHours <= 0) continue;
        
        // Calculate used hours from reports
        const projectReports = allReports.filter(r => r.projectId === project.id);
        let usedHours = 0;
        for (const report of projectReports) {
          usedHours += parseFloat(report.regularHours || '0');
          usedHours += parseFloat(report.otHours || '0');
          usedHours += parseFloat((report as any).premiumHours || '0');
        }
        
        // Add manual entries
        const manualEntries = await storage.getAllManualTimeEntriesForProject(project.id);
        for (const entry of manualEntries) {
          usedHours += parseFloat(entry.regularHours || '0');
          usedHours += parseFloat(entry.otHours || '0');
        }
        
        const hoursRemaining = Math.max(0, budgetedHours - usedHours);
        const percentRemaining = budgetedHours > 0 ? (hoursRemaining / budgetedHours) : 1;
        
        // Only flag projects in orange (<20%) or red (≤10%) zones
        if (percentRemaining < 0.2) {
          const isRed = percentRemaining <= 0.1;
          
          let recommendation = '';
          if (isRed) {
            if (hoursRemaining <= 0) {
              recommendation = 'Budget exhausted. Request additional hours if work continues.';
            } else {
              recommendation = `Critical: Only ${hoursRemaining.toFixed(1)} hours (${Math.round(percentRemaining * 100)}%) remaining.`;
            }
          } else {
            recommendation = `Warning: ${hoursRemaining.toFixed(1)} hours (${Math.round(percentRemaining * 100)}%) remaining. Monitor closely.`;
          }
          
          atRiskProjects.push({
            id: project.id,
            name: project.name,
            contractId: contractInfo.id,
            contractName: contractInfo.name,
            hoursRemaining: Math.round(hoursRemaining * 10) / 10,
            budgetedHours,
            percentRemaining: Math.round(percentRemaining * 100),
            status: isRed ? 'red' : 'orange',
            recommendation,
          });
        }
      }
      
      // Sort by severity (red first) then by percent remaining
      atRiskProjects.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'red' ? -1 : 1;
        return a.percentRemaining - b.percentRemaining;
      });
      
      // 8. Project Progress - schedule and budget progress for all active projects
      const projectProgress: {
        id: string;
        name: string;
        projectNumber: string;
        contractId: string | null;
        contractName: string | null;
        scheduleProgress: number;
        budgetProgress: number;
        scheduleStatus: 'on_track' | 'warning' | 'over';
        budgetStatus: 'on_track' | 'warning' | 'over';
        startDate: string | null;
        endDate: string | null;
        budgetedHours: number;
        usedHours: number;
      }[] = [];
      
      for (const project of projects) {
        const pAny = project as any;
        
        let scheduleProgress = 0;
        const pStart = project.startDate ? new Date(project.startDate) : null;
        const pEnd = project.substantialCompletionDate ? new Date(project.substantialCompletionDate) : null;
        
        if (pStart && pEnd && pEnd.getTime() > pStart.getTime()) {
          const totalDuration = pEnd.getTime() - pStart.getTime();
          const elapsed = now.getTime() - pStart.getTime();
          scheduleProgress = Math.max(0, Math.min(150, (elapsed / totalDuration) * 100));
        } else if (pStart && !pEnd) {
          scheduleProgress = 0;
        }
        
        let budgetedHours = 0;
        let contractName: string | null = null;
        let contractId: string | null = pAny.contractId || null;
        
        if (contractId) {
          const contract = contracts.find(c => c.id === contractId);
          if (contract) {
            contractName = contract.name;
          }
          const contractOptions = await storage.getContractOptions(contractId);
          const linkedOption = pAny.contractOptionId 
            ? contractOptions.find((opt: any) => opt.id === pAny.contractOptionId)
            : contractOptions[0];
          if (linkedOption?.inspectors) {
            budgetedHours = linkedOption.inspectors.reduce((sum: number, i: any) => sum + parseFloat(i.hours || '0'), 0);
          }
        }
        if (budgetedHours <= 0 && pAny.budgetedHours) {
          budgetedHours = parseFloat(pAny.budgetedHours);
        }
        
        const projectReports = allReports.filter(r => r.projectId === project.id);
        let usedHours = 0;
        for (const report of projectReports) {
          usedHours += parseFloat(report.regularHours || '0');
          usedHours += parseFloat(report.otHours || '0');
        }
        
        const manualEntries = await storage.getAllManualTimeEntriesForProject(project.id);
        for (const entry of manualEntries) {
          usedHours += parseFloat(entry.regularHours || '0');
          usedHours += parseFloat(entry.otHours || '0');
        }
        
        const baseHoursEntries = await storage.getProjectBaseHours(project.id);
        for (const bh of baseHoursEntries) {
          usedHours += parseFloat(bh.regularHours || '0');
          usedHours += parseFloat(bh.otHours || '0');
        }
        
        const budgetProgress = budgetedHours > 0 ? Math.min(150, (usedHours / budgetedHours) * 100) : 0;
        
        const scheduleStatus = scheduleProgress > 100 ? 'over' : scheduleProgress > 80 ? 'warning' : 'on_track';
        const budgetStatus = budgetProgress > 100 ? 'over' : budgetProgress > 80 ? 'warning' : 'on_track';
        
        projectProgress.push({
          id: project.id,
          name: project.name,
          projectNumber: project.projectNumber,
          contractId,
          contractName,
          scheduleProgress: Math.round(scheduleProgress * 10) / 10,
          budgetProgress: Math.round(budgetProgress * 10) / 10,
          scheduleStatus,
          budgetStatus,
          startDate: pStart ? pStart.toISOString() : null,
          endDate: pEnd ? pEnd.toISOString() : null,
          budgetedHours: Math.round(budgetedHours * 10) / 10,
          usedHours: Math.round(usedHours * 10) / 10,
        });
      }
      
      projectProgress.sort((a, b) => b.scheduleProgress - a.scheduleProgress);
      
      res.json({
        summary: {
          activeContracts,
          upcomingContracts,
          completedContracts,
          totalContracts: contracts.length,
          activeProjects,
          totalProjects: projects.length,
          totalInspectors: inspectorWorkloadList.length,
          totalReports: allReports.length,
          hoursThisMonth: Math.round(totalHoursThisMonth * 10) / 10,
        },
        inspectorWorkload: inspectorWorkloadList,
        contractTimeline,
        alerts: filteredAlerts.slice(0, 20),
        recentActivity,
        revenueAnalytics,
        atRiskProjects,
        projectProgress,
      });
    } catch (error) {
      console.error("Error fetching company dashboard:", error);
      res.status(500).json({ message: "Failed to fetch company dashboard" });
    }
  });

  // Dismiss a dashboard alert
  app.post("/api/alerts/:alertId/dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      const { alertId } = req.params;
      await storage.dismissAlert(userId, alertId, profile.activeCompanyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing alert:", error);
      res.status(500).json({ message: "Failed to dismiss alert" });
    }
  });

  // ===== Company Notes API =====
  
  const createCompanyNoteSchema = z.object({
    content: z.string().transform(s => s.trim()).pipe(z.string().min(1, "Note content is required").max(10000, "Note is too long")),
    mentions: z.array(z.string()).optional().default([]),
  });

  app.get("/api/company/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      const companyId = profile.activeCompanyId;
      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const notes = await db.query.companyNotes.findMany({
        where: eq(companyNotes.companyId, companyId),
        orderBy: [desc(companyNotes.createdAt)],
      });

      const notesWithAuthors = await Promise.all(
        notes.map(async (note) => {
          const author = await db.query.users.findFirst({
            where: eq(users.id, note.authorId),
            columns: { id: true, firstName: true, lastName: true, email: true, profileImageUrl: true }
          });
          const profile = await storage.getUserProfile(note.authorId);
          const firstName = profile?.firstName || author?.firstName || null;
          const lastName = profile?.lastName || author?.lastName || null;
          return {
            ...note,
            author: {
              id: note.authorId,
              firstName,
              lastName,
              email: profile?.email || author?.email || null,
              profileImageUrl: author?.profileImageUrl || null
            }
          };
        })
      );

      res.json(notesWithAuthors);
    } catch (error) {
      console.error("Error fetching company notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.post("/api/company/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      const companyId = profile.activeCompanyId;
      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const validationResult = createCompanyNoteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ message: "Invalid request body", errors: validationResult.error.flatten().fieldErrors });
      }

      const { content, mentions } = validationResult.data;

      const [newNote] = await db.insert(companyNotes).values({
        companyId,
        authorId: userId,
        content,
        mentions,
      }).returning();

      const author = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, firstName: true, lastName: true, email: true, profileImageUrl: true }
      });
      const authorProfile = await storage.getUserProfile(userId);

      res.status(201).json({
        ...newNote,
        author: {
          id: userId,
          firstName: authorProfile?.firstName || author?.firstName || null,
          lastName: authorProfile?.lastName || author?.lastName || null,
          email: authorProfile?.email || author?.email || null,
          profileImageUrl: author?.profileImageUrl || null
        }
      });
    } catch (error) {
      console.error("Error creating company note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  app.delete("/api/company/notes/:noteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      const companyId = profile.activeCompanyId;
      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { noteId } = req.params;
      const note = await db.query.companyNotes.findFirst({
        where: and(eq(companyNotes.id, noteId), eq(companyNotes.companyId, companyId)),
      });

      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }

      await db.delete(companyNotes).where(eq(companyNotes.id, noteId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting company note:", error);
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  // Get single contract
  app.get("/api/contracts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      
      // Contracts contain financial data - restrict to admins only
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied - admin required" });
      }
      
      res.json(contract);
    } catch (error) {
      console.error("Error fetching contract:", error);
      res.status(500).json({ message: "Failed to fetch contract" });
    }
  });

  // Get projects for a contract
  app.get("/api/contracts/:id/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      
      // Contracts contain financial data - restrict to admins only
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied - admin required" });
      }
      
      const projects = await storage.getProjectsByContract(req.params.id);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching contract projects:", error);
      res.status(500).json({ message: "Failed to fetch contract projects" });
    }
  });

  // Get rate lookup info for proposal creation - includes contract options and IOR agreements
  app.get("/api/contracts/:id/rate-lookup", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isMember && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get contract rate options (client billing rates)
      const contractOptions = await storage.getContractOptions(req.params.id);
      
      // Get all IOR agreements for projects under this contract (optimized batch fetch)
      const contractProjects = await storage.getProjectsByContract(req.params.id);
      
      // Collect all agreements first
      const allAgreements: { agreement: any; projectName: string }[] = [];
      for (const project of contractProjects) {
        const projectAgreements = await storage.getIorAgreementsByProject(project.id);
        for (const agreement of projectAgreements) {
          allAgreements.push({ agreement, projectName: project.name });
        }
      }
      
      // Batch fetch all unique inspector profiles
      const uniqueInspectorIds = [...new Set(allAgreements.map(a => a.agreement.inspectorId))];
      const inspectorProfiles = new Map<string, { firstName?: string; lastName?: string }>();
      await Promise.all(
        uniqueInspectorIds.map(async (inspectorId) => {
          const profile = await storage.getUserProfile(inspectorId);
          if (profile) {
            inspectorProfiles.set(inspectorId, profile);
          }
        })
      );
      
      // Build IOR agreements with inspector names
      const iorAgreements = allAgreements.map(({ agreement, projectName }) => {
        const inspector = inspectorProfiles.get(agreement.inspectorId);
        return {
          ...agreement,
          projectName,
          inspectorName: inspector ? `${inspector.firstName || ''} ${inspector.lastName || ''}`.trim() : 'Unknown',
        };
      });
      
      // Build a rate lookup map by inspector name/title for easy UI lookup
      const clientRates: { [key: string]: { rate: string; hours: string; title: string; optionName?: string } } = {};
      for (const option of contractOptions) {
        if (option.inspectors) {
          for (const inspector of option.inspectors) {
            const key = (inspector.inspectorName || inspector.title || '').toLowerCase().trim();
            if (key) {
              clientRates[key] = {
                rate: inspector.rate,
                hours: inspector.hours,
                title: inspector.title,
                optionName: option.name || `Option ${option.optionNumber}`,
              };
            }
          }
        }
      }
      
      const inspectorPayRates: { [key: string]: { rate: string; inspectorId: string; projectName: string } } = {};
      for (const agreement of iorAgreements) {
        const key = (agreement.inspectorName || '').toLowerCase().trim();
        if (key && agreement.rate) {
          inspectorPayRates[key] = {
            rate: agreement.rate,
            inspectorId: agreement.inspectorId,
            projectName: agreement.projectName,
          };
        }
      }
      
      res.json({
        contractOptions: contractOptions.map(opt => ({
          id: opt.id,
          optionNumber: opt.optionNumber,
          name: opt.name,
          inspectors: opt.inspectors || [],
        })),
        iorAgreements: iorAgreements.map(a => ({
          id: a.id,
          projectId: a.projectId,
          projectName: a.projectName,
          inspectorId: a.inspectorId,
          inspectorName: a.inspectorName,
          rate: a.rate,
        })),
        clientRates,
        inspectorPayRates,
      });
    } catch (error) {
      console.error("Error fetching rate lookup:", error);
      res.status(500).json({ message: "Failed to fetch rate lookup data" });
    }
  });

  // Get contract dashboard data (schedule progress + budget)
  app.get("/api/contracts/:id/dashboard", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      
      // Contract dashboard contains financial data - restrict to admins only
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied - admin required" });
      }
      
      // Calculate schedule progress
      const now = new Date();
      let scheduleProgress = 0;
      let daysRemaining: number | null = null;
      let daysOverdue: number | null = null;
      let scheduleStatus: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete' = 'not_started';
      
      // Contracts in bid phase should never show as overdue
      const isInBidPhase = ['bid_release', 'bid_received', 'under_review'].includes(contract.status);
      
      if (contract.startDate && contract.substantialCompletionDate) {
        const startDate = new Date(contract.startDate);
        const endDate = new Date(contract.substantialCompletionDate);
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        
        if (now < startDate) {
          scheduleProgress = 0;
          scheduleStatus = 'not_started';
          daysRemaining = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        } else if (now > endDate) {
          scheduleProgress = 100;
          daysOverdue = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
          // Never show overdue for bid phase contracts (including under_review)
          if (contract.status === 'substantial_completion' || contract.status === 'final_closeout') {
            scheduleStatus = 'complete';
          } else if (isInBidPhase) {
            scheduleStatus = 'not_started';
            daysOverdue = null;  // Clear overdue days for bid phase
          } else {
            scheduleStatus = 'overdue';
          }
        } else {
          scheduleProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
          daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          // Warning if more than 80% of time elapsed
          if (scheduleProgress >= 80) {
            scheduleStatus = 'warning';
          } else {
            scheduleStatus = 'on_track';
          }
        }
      }
      
      // Calculate budget with stacking support (base + calculated from reports)
      const budgetSummary = await storage.getContractBudgetSummary(req.params.id);
      const totalBudget = contract.budgetOverride 
        ? parseFloat(contract.budgetOverride) 
        : parseFloat(contract.currentValue || contract.originalValue || '0');
      
      // Base budget = manual starting point for mid-project onboarding
      const baseBudgetSpent = parseFloat(contract.baseBudgetSpent || '0');
      // Calculated = hours from daily reports/invoices
      const calculatedSpent = budgetSummary.totalBilled;
      // Total spent = base + calculated (stacking)
      const budgetSpent = baseBudgetSpent + calculatedSpent;
      const budgetProgress = totalBudget > 0 ? (budgetSpent / totalBudget) * 100 : 0;
      const budgetRemaining = totalBudget - budgetSpent;
      
      let budgetStatus: 'under' | 'on_track' | 'warning' | 'over' = 'on_track';
      if (budgetProgress >= 100) {
        budgetStatus = 'over';
      } else if (budgetProgress >= 80) {
        budgetStatus = 'warning';
      } else if (budgetProgress < 50) {
        budgetStatus = 'under';
      }
      
      // Fetch additional dashboard data
      const attachments = await storage.getContractAttachments(req.params.id);
      const contractProjects = await storage.getProjectsByContract(req.params.id);
      
      // Get IOR agreements for all projects
      const iorAgreements: any[] = [];
      for (const project of contractProjects) {
        const projectAgreements = await storage.getIorAgreementsByProject(project.id);
        iorAgreements.push(...projectAgreements.map(a => ({
          ...a,
          projectName: project.name,
        })));
      }
      
      // Get daily reports for all projects under this contract
      const dailyReports = await storage.getReportsByContractProjects(req.params.id);
      
      // Get all manual time entries for projects under this contract
      let allContractManualEntries: any[] = [];
      for (const project of contractProjects) {
        const projectManualEntries = await storage.getAllManualTimeEntriesForProject(project.id);
        allContractManualEntries.push(...projectManualEntries);
      }
      
      // Get all base hours entries for projects under this contract (pre-onboarding hours)
      let contractBaseHours = { regular: 0, overtime: 0, total: 0, billedAmount: 0, entryCount: 0 };
      for (const project of contractProjects) {
        const projectBaseHoursEntries = await storage.getProjectBaseHours(project.id);
        for (const entry of projectBaseHoursEntries) {
          const regHrs = parseFloat(entry.regularHours || '0');
          const otHrs = parseFloat(entry.overtimeHours || '0');
          contractBaseHours.regular += regHrs;
          contractBaseHours.overtime += otHrs;
          contractBaseHours.total += regHrs + otHrs;
          contractBaseHours.billedAmount += parseFloat(entry.billedAmount || '0');
          contractBaseHours.entryCount++;
        }
      }
      
      // Get contract rate options for client billing rates
      const contractRateOptions = await storage.getContractOptions(req.params.id);
      
      // Calculate scheduled budget from contract options (first awarded option or first option)
      const trackingMode = ((contract as any).budgetTrackingMode || 'daily_reports') as BudgetTrackingMode;
      const awardedOptions = contractRateOptions.filter(opt => opt.awardStatus === 'awarded');
      const primaryOption = awardedOptions.length > 0 ? awardedOptions[0] : contractRateOptions[0];
      
      // Transform inspectors to the format needed for budget calculation
      const inspectorsForBudget: InspectorRate[] = primaryOption?.inspectors?.map(i => ({
        title: i.title,
        inspectorName: i.inspectorName,
        rate: i.rate,
        hours: i.hours,
        scheduleType: i.scheduleType,
      })) || [];
      
      // Calculate scheduled budget based on contract dates and inspector schedules
      const hasBaseBudget = parseFloat(contract.baseBudgetSpent || '0') > 0;
      const scheduledBudget = calculateScheduledBudget(
        contract.startDate,
        contract.substantialCompletionDate,
        inspectorsForBudget,
        undefined, // asOfDate
        hasBaseBudget
      );
      
      // Calculate base budget hours breakdown
      const baseBudgetBreakdown = calculateBaseBudgetBreakdown(
        contract.baseBudgetSpent,
        inspectorsForBudget
      );
      
      // Calculate Financial Summary (Revenue vs Cost analysis)
      // Revenue = client billing rates × hours
      // Cost = inspector pay rates × hours
      // Profit = Revenue - Cost
      
      // Options are mutually exclusive - only awarded options contribute to budget
      // Only pending options (not not_awarded) should show as "pending award"
      const pendingOptions = contractRateOptions.filter(o => o.awardStatus === "pending" || !o.awardStatus);
      const isPendingAward = awardedOptions.length === 0 && pendingOptions.length > 0;
      
      // Budgeted revenue: sum of all inspectors (rate × hours) from awarded options only
      // Options are mutually exclusive - don't sum all options together
      let budgetedRevenue = 0;
      let budgetedRevenueRangeMin = 0;
      let budgetedRevenueRangeMax = 0;
      
      if (isPendingAward) {
        // Calculate each PENDING option's total revenue for range display
        const optionRevenues = pendingOptions.map(opt => {
          let revenue = 0;
          if (opt?.inspectors) {
            for (const inspector of opt.inspectors) {
              revenue += parseFloat(inspector.rate || '0') * parseFloat(inspector.hours || '0');
            }
          }
          return revenue;
        });
        if (optionRevenues.length > 0) {
          budgetedRevenueRangeMin = Math.min(...optionRevenues);
          budgetedRevenueRangeMax = Math.max(...optionRevenues);
        }
        budgetedRevenue = 0; // Revenue is pending
      } else {
        for (const option of awardedOptions) {
          if (option?.inspectors) {
            for (const inspector of option.inspectors) {
              budgetedRevenue += parseFloat(inspector.rate || '0') * parseFloat(inspector.hours || '0');
            }
          }
        }
      }
      
      // Budgeted cost: estimate from IOR agreements using same hours as client billing
      // We'll calculate an average inspector pay rate and apply it to budgeted hours
      let budgetedCost = 0;
      let avgInspectorPayRate = 0;
      if (iorAgreements.length > 0) {
        const validRates = iorAgreements.filter(a => a.rate).map(a => parseFloat(a.rate));
        if (validRates.length > 0) {
          avgInspectorPayRate = validRates.reduce((sum, r) => sum + r, 0) / validRates.length;
        }
        // Apply average pay rate to total budgeted hours
        const totalBudgetedHours = inspectorsForBudget.reduce((sum, i) => sum + parseFloat(i.hours || '0'), 0);
        budgetedCost = avgInspectorPayRate * totalBudgetedHours;
      }
      
      // Actual revenue: calculated from daily reports × client rates
      const actualRevenue = calculatedSpent; // Already calculated from reports × client rates
      
      // Actual cost: calculate from daily reports × average inspector pay rate
      let actualCost = 0;
      if (avgInspectorPayRate > 0) {
        // Use total hours from budget summary × average inspector pay rate
        actualCost = budgetSummary.totalHours * avgInspectorPayRate;
      }
      
      // Calculate profits and margins
      const budgetedProfit = budgetedRevenue - budgetedCost;
      const budgetedMargin = budgetedRevenue > 0 ? (budgetedProfit / budgetedRevenue) * 100 : 0;
      
      const actualProfit = actualRevenue - actualCost;
      const actualMargin = actualRevenue > 0 ? (actualProfit / actualRevenue) * 100 : 0;
      
      // Calculate contract-level manual entry hours totals
      let contractManualHours = { regular: 0, overtime: 0, total: 0 };
      for (const entry of allContractManualEntries) {
        const regHrs = parseFloat(entry.regularHours || '0');
        const otHrs = parseFloat(entry.otHours || '0');
        contractManualHours.regular += regHrs;
        contractManualHours.overtime += otHrs;
        contractManualHours.total += regHrs + otHrs;
      }
      
      // Calculate total budgeted hours from awarded contract options only
      // Options are mutually exclusive - only awarded options contribute to budget
      // pendingOptions and isPendingAward are already calculated above
      let totalBudgetedHours = 0;
      
      // Calculate hours range for pending awards (min/max of ONLY pending options)
      let budgetRangeMin = 0;
      let budgetRangeMax = 0;
      
      if (isPendingAward) {
        // Calculate each pending option's total hours
        const optionHours = pendingOptions.map(opt => {
          let hours = 0;
          if (opt?.inspectors) {
            for (const inspector of opt.inspectors) {
              hours += parseFloat(inspector.hours || '0');
            }
          }
          return hours;
        });
        if (optionHours.length > 0) {
          budgetRangeMin = Math.min(...optionHours);
          budgetRangeMax = Math.max(...optionHours);
        }
        totalBudgetedHours = 0; // Budget is pending
      } else {
        // Only count awarded options - they are mutually exclusive
        for (const option of awardedOptions) {
          if (option?.inspectors) {
            for (const inspector of option.inspectors) {
              totalBudgetedHours += parseFloat(inspector.hours || '0');
            }
          }
        }
      }
      
      // Total used hours = daily reports + manual entries + base hours
      // Base hours can come from two sources:
      // 1. projectBaseHours entries (explicit per-inspector hours) - preferred when available
      // 2. baseBudgetSpent / average billing rate (calculated from dollar amount) - used as fallback
      // To avoid double-counting, only use baseBudgetHours when there are no projectBaseHours entries
      const hasExplicitBaseHours = contractBaseHours.total > 0;
      const baseBudgetHours = (!hasExplicitBaseHours && baseBudgetBreakdown?.baseHours) ? baseBudgetBreakdown.baseHours : 0;
      const totalUsedHours = budgetSummary.totalHours + contractManualHours.total + contractBaseHours.total + baseBudgetHours;
      const remainingHours = Math.max(0, totalBudgetedHours - totalUsedHours);
      
      // === NEW DASHBOARD FEATURES ===
      
      // 1. Activity Timeline - Recent activities from reports
      const activityTimeline = dailyReports
        .slice(0, 20)
        .map(r => ({
          id: r.id,
          type: 'report' as const,
          date: r.createdAt ? r.createdAt.toISOString() : (r.date instanceof Date ? r.date.toISOString() : r.date),
          title: `Daily Report - ${r.projectName || 'Unknown Project'}`,
          description: r.date ? `Report for ${r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date}` : 'New report submitted',
          status: r.status,
          inspectorId: r.inspectorId,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // 2. Photo Gallery - Recent photos from reports
      const allPhotos: { id: string; path: string; caption: string | null; reportDate: string; projectName: string; createdAt: string | null }[] = [];
      for (const report of dailyReports.slice(0, 30)) {
        const reportPhotos = await storage.getPhotosByReport(report.id);
        for (const photo of reportPhotos) {
          allPhotos.push({
            id: photo.id,
            path: photo.filePath,
            caption: photo.caption,
            reportDate: report.date instanceof Date ? report.date.toISOString().split('T')[0] : report.date,
            projectName: report.projectName || 'Unknown Project',
            createdAt: photo.createdAt ? photo.createdAt.toISOString() : null,
          });
        }
      }
      const photoGallery = allPhotos
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 12);
      
      // 3. Issues Summary - Aggregate issues from reports
      const issuesReports = dailyReports.filter(r => r.issuesFlag);
      const issuesSummary = {
        totalCount: issuesReports.length,
        recentIssues: issuesReports.slice(0, 10).map(r => ({
          id: r.id,
          date: r.date,
          projectName: r.projectName || 'Unknown Project',
          details: r.issuesDetails,
        })),
      };
      
      // 4. Safety Incidents - Aggregate safety incidents
      const safetyReports = dailyReports.filter(r => r.safetyFlag);
      const safetySummary = {
        totalCount: safetyReports.length,
        recentIncidents: safetyReports.slice(0, 10).map(r => ({
          id: r.id,
          date: r.date,
          projectName: r.projectName || 'Unknown Project',
          details: r.safetyDetails,
        })),
      };
      
      // 5. Weather Summary - Aggregate weather data
      const weatherCounts: Record<string, number> = {};
      for (const report of dailyReports) {
        const weather = report.weatherType || 'unknown';
        weatherCounts[weather] = (weatherCounts[weather] || 0) + 1;
      }
      const weatherSummary = {
        totalReports: dailyReports.length,
        breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
          type,
          count,
          percentage: dailyReports.length > 0 ? Math.round((count / dailyReports.length) * 100) : 0,
        })).sort((a, b) => b.count - a.count),
        recentWeather: dailyReports.slice(0, 7).map(r => ({
          date: r.date,
          type: r.weatherType,
          notes: r.weatherNotes,
        })),
      };
      
      // 6. Team Overview - Inspectors and their hours
      const inspectorHours: Record<string, { inspectorId: string; regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const report of dailyReports) {
        const inspectorId = report.inspectorId || 'unknown';
        if (!inspectorHours[inspectorId]) {
          inspectorHours[inspectorId] = { inspectorId, regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        }
        inspectorHours[inspectorId].regular += parseFloat(report.regularHours || '0');
        inspectorHours[inspectorId].overtime += parseFloat(report.otHours || '0');
        inspectorHours[inspectorId].premium += parseFloat((report as any).premiumHours || '0');
        inspectorHours[inspectorId].reportCount += 1;
      }
      
      // Fetch inspector names
      const inspectorIds = Object.keys(inspectorHours).filter(id => id !== 'unknown');
      const inspectorProfiles = await Promise.all(
        inspectorIds.map(id => storage.getUserProfile(id))
      );
      const inspectorNameMap = new Map(
        inspectorProfiles
          .filter((p): p is NonNullable<typeof p> => p !== null && p !== undefined)
          .map(p => [p.userId, `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Inspector'])
      );
      
      const teamOverview = Object.values(inspectorHours)
        .map(i => ({
          ...i,
          name: inspectorNameMap.get(i.inspectorId) || 'Unknown Inspector',
          totalHours: i.regular + i.overtime + i.premium,
        }))
        .sort((a, b) => b.totalHours - a.totalHours);
      
      // 7. Upcoming Milestones - Key dates approaching
      const milestones: { date: string; label: string; type: string; daysUntil: number; isPast: boolean }[] = [];
      const milestoneFields = [
        { field: 'bidReleaseDate', label: 'Bid Release' },
        { field: 'bidDueDate', label: 'Bid Due' },
        { field: 'awardDate', label: 'Contract Award' },
        { field: 'startDate', label: 'Project Start' },
        { field: 'substantialCompletionDate', label: 'Substantial Completion' },
        { field: 'finalCloseoutDate', label: 'Final Closeout' },
      ];
      for (const m of milestoneFields) {
        const dateValue = (contract as any)[m.field];
        if (dateValue) {
          const date = new Date(dateValue);
          const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          milestones.push({
            date: dateValue,
            label: m.label,
            type: m.field,
            daysUntil,
            isPast: daysUntil < 0,
          });
        }
      }
      const upcomingMilestones = milestones
        .filter(m => m.daysUntil >= -7) // Include recently past (within a week) and future
        .sort((a, b) => a.daysUntil - b.daysUntil);
      
      // Calculate at-risk projects (projects with less than 20% of budgeted hours remaining)
      const countWorkingDays = (startDate: Date, endDate: Date): number => {
        let count = 0;
        const current = new Date(startDate);
        while (current <= endDate) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
            count++;
          }
          current.setDate(current.getDate() + 1);
        }
        return count;
      };
      
      const atRiskProjects: {
        id: string;
        name: string;
        hoursRemaining: number;
        budgetedHours: number;
        percentRemaining: number;
        status: 'orange' | 'red';
        recommendation: string;
      }[] = [];
      
      for (const p of contractProjects) {
        // Get project's linked contract option for budgeted hours
        const projectOption = (p as any).contractOptionId 
          ? contractRateOptions.find(opt => opt.id === (p as any).contractOptionId)
          : primaryOption;
        
        let projectBudgetedHours = 0;
        if (projectOption?.inspectors) {
          projectBudgetedHours = projectOption.inspectors.reduce((sum: number, i: any) => sum + parseFloat(i.hours || '0'), 0);
        }
        
        // Get project's hours used
        const projectReports = dailyReports.filter(r => r.projectId === p.id);
        let projectUsedHours = 0;
        for (const report of projectReports) {
          projectUsedHours += parseFloat(report.regularHours || '0');
          projectUsedHours += parseFloat(report.otHours || '0');
          projectUsedHours += parseFloat((report as any).premiumHours || '0');
        }
        
        // Add manual entries
        const projectManualEntries = await storage.getAllManualTimeEntriesForProject(p.id);
        for (const entry of projectManualEntries) {
          projectUsedHours += parseFloat(entry.regularHours || '0');
          projectUsedHours += parseFloat(entry.otHours || '0');
        }
        
        const projectHoursRemaining = Math.max(0, projectBudgetedHours - projectUsedHours);
        const percentRemaining = projectBudgetedHours > 0 ? (projectHoursRemaining / projectBudgetedHours) : 1;
        
        // Only flag projects in orange (<20%) or red (≤10%) zones
        if (percentRemaining < 0.2 && projectBudgetedHours > 0) {
          const isRed = percentRemaining <= 0.1;
          
          // Calculate forecast info for recommendation
          let recommendation = '';
          if (isRed) {
            if (projectHoursRemaining <= 0) {
              recommendation = 'Budget exhausted. Request additional hours if work continues.';
            } else {
              recommendation = `Critical: Only ${projectHoursRemaining.toFixed(1)} hours (${Math.round(percentRemaining * 100)}%) remaining.`;
            }
          } else {
            recommendation = `Warning: ${projectHoursRemaining.toFixed(1)} hours (${Math.round(percentRemaining * 100)}%) remaining. Monitor closely.`;
          }
          
          atRiskProjects.push({
            id: p.id,
            name: p.name,
            hoursRemaining: Math.round(projectHoursRemaining * 10) / 10,
            budgetedHours: projectBudgetedHours,
            percentRemaining: Math.round(percentRemaining * 100),
            status: isRed ? 'red' : 'orange',
            recommendation,
          });
        }
      }
      
      // Sort by severity (red first) then by percent remaining
      atRiskProjects.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'red' ? -1 : 1;
        return a.percentRemaining - b.percentRemaining;
      });
      
      res.json({
        contract: {
          id: contract.id,
          name: contract.name,
          contractNumber: contract.contractNumber,
          status: contract.status,
          startDate: contract.startDate,
          substantialCompletionDate: contract.substantialCompletionDate,
          originalValue: contract.originalValue,
          currentValue: contract.currentValue,
          budgetOverride: contract.budgetOverride,
          baseBudgetSpent: contract.baseBudgetSpent,
          notes: contract.notes,
          budgetTrackingMode: trackingMode,
        },
        schedule: {
          progress: Math.round(scheduleProgress * 100) / 100,
          status: scheduleStatus,
          daysRemaining,
          daysOverdue,
          startDate: contract.startDate,
          endDate: contract.substantialCompletionDate,
        },
        budget: {
          totalBudget,
          spent: budgetSpent,
          baseBudgetSpent,  // Manual starting point for mid-project
          calculatedSpent,  // Auto-calculated from reports/invoices
          remaining: budgetRemaining,
          progress: Math.round(budgetProgress * 100) / 100,
          status: budgetStatus,
          trackingMode,
          isPendingAward,  // True when no options are awarded yet
          budgetRange: isPendingAward ? { min: budgetedRevenueRangeMin, max: budgetedRevenueRangeMax } : null,
          hoursRange: isPendingAward ? { min: budgetRangeMin, max: budgetRangeMax } : null,
          hours: {
            budgeted: totalBudgetedHours,
            used: totalUsedHours,
            remaining: remainingHours,
            regular: budgetSummary.regularHours + contractManualHours.regular + contractBaseHours.regular,
            overtime: budgetSummary.overtimeHours + contractManualHours.overtime + contractBaseHours.overtime,
            premium: budgetSummary.premiumHours,
            total: budgetSummary.totalHours + contractManualHours.total + contractBaseHours.total,
            sources: {
              dailyReports: {
                regular: budgetSummary.regularHours,
                overtime: budgetSummary.overtimeHours,
                premium: budgetSummary.premiumHours,
                total: budgetSummary.totalHours,
              },
              manualEntries: {
                regular: contractManualHours.regular,
                overtime: contractManualHours.overtime,
                total: contractManualHours.total,
              },
              baseHours: {
                regular: contractBaseHours.regular,
                overtime: contractBaseHours.overtime,
                total: contractBaseHours.total,
              },
              // Only include fromBaseBudget when it's actually being used (no explicit base hours entries)
              // and when we have a valid calculation (averageRate > 0)
              ...(baseBudgetHours > 0 && baseBudgetBreakdown && baseBudgetBreakdown.averageRate > 0 ? {
                fromBaseBudget: {
                  total: baseBudgetHours,
                  averageRate: baseBudgetBreakdown.averageRate,
                  baseBudgetAmount: baseBudgetBreakdown.baseBudget,
                },
              } : {}),
            },
          },
          scheduled: {
            amount: scheduledBudget.scheduledAmount,
            hours: scheduledBudget.scheduledHours,
            workingDaysElapsed: scheduledBudget.workingDaysElapsed,
            totalWorkingDays: scheduledBudget.totalWorkingDays,
            inspectorBreakdowns: scheduledBudget.inspectorBreakdowns,
          },
          baseBudgetBreakdown: baseBudgetBreakdown ? {
            baseHours: baseBudgetBreakdown.baseHours,
            averageRate: baseBudgetBreakdown.averageRate,
            inspectorBreakdowns: baseBudgetBreakdown.inspectorBreakdowns,
          } : null,
        },
        financialSummary: {
          budgeted: {
            revenue: Math.round(budgetedRevenue * 100) / 100,
            cost: Math.round(budgetedCost * 100) / 100,
            profit: Math.round(budgetedProfit * 100) / 100,
            margin: Math.round(budgetedMargin * 100) / 100,
          },
          actual: {
            revenue: Math.round(actualRevenue * 100) / 100,
            cost: Math.round(actualCost * 100) / 100,
            profit: Math.round(actualProfit * 100) / 100,
            margin: Math.round(actualMargin * 100) / 100,
          },
          hasIorAgreements: iorAgreements.length > 0,
          avgInspectorPayRate: Math.round(avgInspectorPayRate * 100) / 100,
        },
        bidSchedule: {
          bidReleaseDate: contract.bidReleaseDate,
          bidDueDate: contract.bidDueDate,
          awardDate: contract.awardDate,
          startDate: contract.startDate,
          substantialCompletionDate: contract.substantialCompletionDate,
          finalCloseoutDate: contract.finalCloseoutDate,
        },
        billingRates: {
          clientRateOptions: contractRateOptions.map(option => ({
            id: option.id,
            optionNumber: option.optionNumber,
            name: option.name,
            inspectors: (option.inspectors || []).map(inspector => ({
              id: inspector.id,
              title: inspector.title,
              inspectorName: inspector.inspectorName,
              rate: inspector.rate,
              hours: inspector.hours,
              scheduleType: inspector.scheduleType,
            })),
          })),
          inspectorAgreements: iorAgreements.map(a => ({
            id: a.id,
            projectName: a.projectName,
            inspectorName: a.inspector ? `${a.inspector.firstName || ''} ${a.inspector.lastName || ''}`.trim() : 'Unknown',
            rate: a.rate,
            terms: a.terms,
          })),
        },
        attachments: attachments.map(a => ({
          id: a.id,
          fileName: a.fileName,
          filePath: a.filePath,
          fileType: a.fileType,
          fileSize: a.fileSize,
          createdAt: a.createdAt,
        })),
        dailyReports: dailyReports.slice(0, 50).map(r => ({
          id: r.id,
          date: r.date,
          projectName: r.projectName,
          status: r.status,
          weatherType: r.weatherType,
          regularHours: r.regularHours,
          otHours: r.otHours,
          signedAt: r.signedAt,
        })),
        // New dashboard features
        activityTimeline,
        photoGallery,
        issuesSummary,
        safetySummary,
        weatherSummary,
        teamOverview,
        upcomingMilestones,
        atRiskProjects,
        projects: await Promise.all(contractProjects.map(async (p) => {
          // Get report count and budget for this project
          const projectReports = dailyReports.filter(r => r.projectId === p.id);
          const reportCount = projectReports.length;
          
          // Get manual time entries for this project
          const projectManualEntries = await storage.getAllManualTimeEntriesForProject(p.id);
          
          // Calculate project budget from its reports
          let projectBilledFromReports = 0;
          let dailyReportHours = { regular: 0, overtime: 0, premium: 0 };
          for (const report of projectReports) {
            const regularHours = parseFloat(report.regularHours || '0');
            const otHours = parseFloat(report.otHours || '0');
            const premiumHours = parseFloat((report as any).premiumHours || '0');
            
            dailyReportHours.regular += regularHours;
            dailyReportHours.overtime += otHours;
            dailyReportHours.premium += premiumHours;
            
            // Use first rate option's first inspector rate as base
            const firstOption = contractRateOptions[0];
            const firstInspector = firstOption?.inspectors?.[0];
            const hourlyRate = parseFloat(firstInspector?.rate || '0');
            
            projectBilledFromReports += (regularHours + otHours * 1.5 + premiumHours * 2) * hourlyRate;
          }
          
          // Calculate hours from manual entries (for hours tracking only, not billing)
          let manualEntryHours = { regular: 0, overtime: 0 };
          for (const entry of projectManualEntries) {
            const regularHours = parseFloat(entry.regularHours || '0');
            const otHours = parseFloat(entry.otHours || '0');
            
            manualEntryHours.regular += regularHours;
            manualEntryHours.overtime += otHours;
          }
          
          // Get base hours entries (pre-onboarding hours per inspector)
          const projectBaseHoursEntries = await storage.getProjectBaseHours(p.id);
          let baseHoursData = { regular: 0, overtime: 0, billedAmount: 0, entryCount: 0 };
          for (const entry of projectBaseHoursEntries) {
            baseHoursData.regular += parseFloat(entry.regularHours || '0');
            baseHoursData.overtime += parseFloat(entry.overtimeHours || '0');
            baseHoursData.billedAmount += parseFloat(entry.billedAmount || '0');
            baseHoursData.entryCount++;
          }
          
          // Project billed amount comes only from daily reports (not manual entries)
          // Manual entries are for hours tracking, not billing
          const projectBilled = projectBilledFromReports;
          
          // Calculate per-project schedule progress
          let projectScheduleProgress = 0;
          let projectScheduleStatus: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete' = 'not_started';
          const projectStatus = (p as any).status || 'active';
          
          if ((p as any).startDate && (p as any).substantialCompletionDate) {
            const projectStartDate = new Date((p as any).startDate);
            const projectEndDate = new Date((p as any).substantialCompletionDate);
            const projectTotalDuration = projectEndDate.getTime() - projectStartDate.getTime();
            const projectElapsed = now.getTime() - projectStartDate.getTime();
            
            if (now < projectStartDate) {
              projectScheduleProgress = 0;
              projectScheduleStatus = 'not_started';
            } else if (now > projectEndDate) {
              projectScheduleProgress = 100;
              // Check if project is complete based on status or final closeout date
              const isComplete = projectStatus === 'complete' || projectStatus === 'closed' || 
                ((p as any).finalCloseoutDate && new Date((p as any).finalCloseoutDate) <= now);
              projectScheduleStatus = isComplete ? 'complete' : 'overdue';
            } else {
              projectScheduleProgress = Math.min(100, Math.max(0, (projectElapsed / projectTotalDuration) * 100));
              projectScheduleStatus = projectScheduleProgress >= 80 ? 'warning' : 'on_track';
            }
          } else if (projectStatus === 'complete' || projectStatus === 'closed') {
            // Project is complete but has no schedule dates
            projectScheduleProgress = 100;
            projectScheduleStatus = 'complete';
          }
          
          // Project-level budget tracking with stacking
          const projectBudgetAmount = parseFloat((p as any).budgetAmount || '0');
          const projectBaseBudget = parseFloat((p as any).baseBudget || '0');
          const projectTotalSpent = projectBaseBudget + projectBilled;
          const projectBudgetProgress = projectBudgetAmount > 0 
            ? Math.round((projectTotalSpent / projectBudgetAmount) * 10000) / 100
            : 0;
          
          let projectBudgetStatus: 'under' | 'on_track' | 'warning' | 'over' = 'on_track';
          if (projectBudgetProgress >= 100) {
            projectBudgetStatus = 'over';
          } else if (projectBudgetProgress >= 80) {
            projectBudgetStatus = 'warning';
          } else if (projectBudgetProgress < 50) {
            projectBudgetStatus = 'under';
          }
          
          // Get linked option name if contractOptionId is set
          const linkedOption = (p as any).contractOptionId 
            ? contractRateOptions.find(opt => opt.id === (p as any).contractOptionId)
            : null;
          
          // Determine project budget tracking mode (inherit from contract if empty)
          const projectTrackingMode = ((p as any).budgetTrackingMode || trackingMode) as BudgetTrackingMode;
          
          // Get inspectors for project-specific scheduled budget (use linked option or primary)
          const projectOption = linkedOption || primaryOption;
          const projectInspectors: InspectorRate[] = projectOption?.inspectors?.map((i: any) => ({
            title: i.title,
            inspectorName: i.inspectorName,
            rate: i.rate,
            hours: i.hours,
            scheduleType: i.scheduleType,
          })) || [];
          
          // Calculate project-level scheduled budget
          const projectHasBaseBudget = projectBaseBudget > 0;
          const projectScheduledBudget = calculateScheduledBudget(
            (p as any).startDate || contract.startDate,
            (p as any).substantialCompletionDate || contract.substantialCompletionDate,
            projectInspectors,
            undefined, // asOfDate
            projectHasBaseBudget
          );
          
          return {
            id: p.id,
            name: p.name,
            projectNumber: p.projectNumber,
            status: (p as any).status || 'active',
            reportCount,
            manualEntryCount: projectManualEntries.length,
            budgetSpent: projectTotalSpent,
            budgetAmount: projectBudgetAmount,
            baseBudget: projectBaseBudget,
            calculatedSpent: projectBilled,
            budgetProgress: projectBudgetProgress,
            budgetStatus: projectBudgetStatus,
            budgetRemaining: projectBudgetAmount > 0 ? projectBudgetAmount - projectTotalSpent : 0,
            budgetTrackingMode: projectTrackingMode,
            scheduledBudget: {
              amount: projectScheduledBudget.scheduledAmount,
              hours: projectScheduledBudget.scheduledHours,
              workingDaysElapsed: projectScheduledBudget.workingDaysElapsed,
              totalWorkingDays: projectScheduledBudget.totalWorkingDays,
            },
            hoursSources: {
              dailyReports: {
                total: dailyReportHours.regular + dailyReportHours.overtime + dailyReportHours.premium,
                regular: dailyReportHours.regular,
                overtime: dailyReportHours.overtime,
                premium: dailyReportHours.premium,
              },
              manualEntries: {
                total: manualEntryHours.regular + manualEntryHours.overtime,
                regular: manualEntryHours.regular,
                overtime: manualEntryHours.overtime,
              },
              baseHours: {
                total: baseHoursData.regular + baseHoursData.overtime,
                regular: baseHoursData.regular,
                overtime: baseHoursData.overtime,
                billedAmount: baseHoursData.billedAmount,
                entryCount: baseHoursData.entryCount,
              },
            },
            startDate: (p as any).startDate,
            substantialCompletionDate: (p as any).substantialCompletionDate,
            finalCloseoutDate: (p as any).finalCloseoutDate,
            scheduleProgress: Math.round(projectScheduleProgress * 100) / 100,
            scheduleStatus: projectScheduleStatus,
            contractOptionId: (p as any).contractOptionId || null,
            contractOptionName: linkedOption ? `Option ${linkedOption.optionNumber}${linkedOption.name ? `: ${linkedOption.name}` : ''}` : null,
            inheritBillingRates: (p as any).inheritBillingRates !== false, // default true
          };
        })),
      });
    } catch (error) {
      console.error("Error fetching contract dashboard:", error);
      res.status(500).json({ message: "Failed to fetch contract dashboard" });
    }
  });

  // Helper to preprocess contract data - converts date strings to Date objects
  const preprocessContractData = (data: any) => {
    const dateFields = ['bidReleaseDate', 'bidDueDate', 'awardDate', 'startDate', 'substantialCompletionDate', 'finalCloseoutDate', 'questionDeadline', 'lastAddendumDate'];
    const numericFields = ['originalValue', 'currentValue', 'budgetedHours', 'regularRate', 'overtimeRate', 'premiumRate'];
    const processed = { ...data };
    
    for (const field of dateFields) {
      if (processed[field] !== undefined) {
        if (processed[field] === '' || processed[field] === null) {
          processed[field] = null;
        } else if (typeof processed[field] === 'string') {
          if (/^\d{4}-\d{2}-\d{2}$/.test(processed[field])) {
            processed[field] = new Date(processed[field] + 'T12:00:00');
          } else {
            processed[field] = new Date(processed[field]);
          }
        }
      }
    }
    
    // Convert empty numeric fields to null
    for (const field of numericFields) {
      if (processed[field] !== undefined) {
        if (processed[field] === '' || processed[field] === null) {
          processed[field] = null;
        }
      }
    }
    
    // Convert empty clientId to null
    if (processed.clientId === '' || processed.clientId === 'none') {
      processed.clientId = null;
    }
    
    // Convert empty purchaseOrderId to null
    if (processed.purchaseOrderId === '' || processed.purchaseOrderId === 'none') {
      processed.purchaseOrderId = null;
    }

    // Convert empty assignedToUserId to null
    if (processed.assignedToUserId === '' || processed.assignedToUserId === 'none') {
      processed.assignedToUserId = null;
    }

    // Convert addendumCount string to integer
    if (processed.addendumCount !== undefined) {
      if (processed.addendumCount === '' || processed.addendumCount === null) {
        processed.addendumCount = 0;
      } else {
        const n = parseInt(processed.addendumCount, 10);
        processed.addendumCount = isNaN(n) ? 0 : n;
      }
    }
    
    return processed;
  };

  // Create contract
  app.post("/api/contracts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company selected" });
      }
      
      // Only admins can create contracts
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can create contracts" });
      }
      
      const { options, ...bodyWithoutOptions } = req.body;
      
      // Preprocess data to convert date strings
      const preprocessed = preprocessContractData(bodyWithoutOptions);
      
      // Validate request body with Zod schema
      const baseSchema = insertContractSchema.omit({ companyId: true, createdById: true });
      const validationResult = baseSchema.safeParse(preprocessed);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid contract data", 
          errors: validationResult.error.format() 
        });
      }
      
      const contractData = {
        ...validationResult.data,
        companyId: profile.activeCompanyId,
        createdById: userId,
      };
      
      const contract = await storage.createContract(contractData);
      
      // Create options and their inspectors
      if (options && Array.isArray(options)) {
        for (let i = 0; i < options.length; i++) {
          const optionData = options[i];
          const option = await storage.createContractOption({
            contractId: contract.id,
            optionNumber: i + 1,
            name: optionData.name || null,
            awardStatus: optionData.awardStatus || "pending", // For partial awards
          });
          
          // Create inspectors for this option
          if (optionData.inspectors && Array.isArray(optionData.inspectors)) {
            for (const inspectorData of optionData.inspectors) {
              await storage.createContractOptionInspector({
                optionId: option.id,
                title: inspectorData.title || "Inspector",
                inspectorName: inspectorData.inspectorName || null,
                rate: inspectorData.rate || "0",
                hours: inspectorData.hours || "0",
                scheduleType: inspectorData.scheduleType || "fullTime",
              });
            }
          }
        }
      }
      
      // Send bid due date notification to admins if applicable
      if (contract.bidDueDate) {
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { sendBidCreatedNotification } = await import('./notification-processor');
          const client = contract.clientId ? await storage.getClient(contract.clientId) : null;
          await sendBidCreatedNotification(resend, {
            type: 'contract',
            name: contract.name,
            number: contract.contractNumber,
            clientName: client?.name || null,
            bidDueDate: contract.bidDueDate,
            companyId: profile.activeCompanyId,
            description: contract.description || null,
          });
        } catch (notifError) {
          console.error("Failed to send bid notification:", notifError);
        }
      }

      // Return contract with options
      const fullContract = await storage.getContract(contract.id);
      res.status(201).json(fullContract);
    } catch (error) {
      console.error("Error creating contract:", error);
      res.status(500).json({ message: "Failed to create contract" });
    }
  });

  // Contract Monthly Summary PDF
  app.get("/api/contracts/:id/monthly-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contractId = req.params.id;
      const { month, year } = req.query;
      
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      
      const contract = await storage.getContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      company = await storage.getCompany(contract.companyId);
      if (company?.logoPath) {
        try {
          logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
        } catch (e) {
          console.log("Could not load company logo");
        }
      }
      
      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0);
      
      // Get all reports from all projects under this contract
      const allReports = await storage.getReportsByContractProjects(contractId);
      const monthlyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Calculate totals
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of monthlyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(monthlyReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      const dailyReportsData = monthlyReports.map((r: any) => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId) || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat((r as any).premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Weather summary
      const weatherCounts: Record<string, number> = {};
      for (const r of monthlyReports) {
        weatherCounts[(r as any).weatherType || 'unknown'] = (weatherCounts[(r as any).weatherType || 'unknown'] || 0) + 1;
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of monthlyReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      // Get client name
      let clientName = '';
      if (contract.clientId) {
        const client = await storage.getClient(contract.clientId);
        if (client) clientName = client.name;
      }
      
      const budgetedHours = parseFloat(contract.budgetedHours || '0');
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const pdfBuffer = await generateMonthlySummaryPdf({
        projectName: contract.name,
        projectNumber: contract.contractNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        month: monthNum,
        year: yearNum,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: contract.startDate ? String(contract.startDate) : null,
          endDate: contract.substantialCompletionDate ? String(contract.substantialCompletionDate) : null,
          daysRemaining: null,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget: 0,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - totalHoursUsed),
          progress: budgetedHours > 0 ? (totalHoursUsed / budgetedHours) * 100 : 0,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        dailyReports: dailyReportsData,
        weatherSummary: {
          totalReports: monthlyReports.length,
          breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
            type, count, percentage: monthlyReports.length > 0 ? Math.round((count / monthlyReports.length) * 100) : 0,
          })),
        },
        issuesSummary: {
          totalCount: monthlyReports.filter((r: any) => r.issuesFlag).length,
          issues: monthlyReports.filter((r: any) => r.issuesFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.issuesDetails || '',
          })),
        },
        safetySummary: {
          totalCount: monthlyReports.filter((r: any) => r.safetyFlag).length,
          incidents: monthlyReports.filter((r: any) => r.safetyFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.safetyDetails || '',
          })),
        },
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          ...hours,
        })),
        upcomingMilestones: [],
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${contract.name.replace(/[^a-z0-9]/gi, '_')}_Monthly_Summary_${format(startDate, 'MMMM_yyyy')}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating contract monthly summary:", error);
      res.status(500).json({ message: "Failed to generate monthly summary" });
    }
  });

  // Contract Weekly Summary PDF
  app.get("/api/contracts/:id/weekly-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contractId = req.params.id;
      const { weekStart, weekEnd } = req.query;
      
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ message: "Week start and end dates are required" });
      }
      
      const contract = await storage.getContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      company = await storage.getCompany(contract.companyId);
      if (company?.logoPath) {
        try {
          logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
        } catch (e) {
          console.log("Could not load company logo");
        }
      }
      
      const startDate = new Date(weekStart as string);
      const endDate = new Date(weekEnd as string);
      
      // Get all reports from all projects under this contract
      const allReports = await storage.getReportsByContractProjects(contractId);
      const weeklyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      // Calculate totals
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of weeklyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(weeklyReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      const dailyReportsData = weeklyReports.map((r: any) => ({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
        inspectorName: inspectorNameMap.get(r.inspectorId) || 'Unknown',
        regularHours: parseFloat(r.regularHours || '0'),
        otHours: parseFloat(r.otHours || '0'),
        premiumHours: parseFloat((r as any).premiumHours || '0'),
        weatherType: r.weatherType,
        workDescription: r.workPerformed,
        notes: r.notes,
        issues: r.issuesDetails,
        safetyIncidents: r.safetyDetails,
      })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Weather summary
      const weatherCounts: Record<string, number> = {};
      for (const r of weeklyReports) {
        weatherCounts[(r as any).weatherType || 'unknown'] = (weatherCounts[(r as any).weatherType || 'unknown'] || 0) + 1;
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of weeklyReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      // Get client name
      let clientName = '';
      if (contract.clientId) {
        const client = await storage.getClient(contract.clientId);
        if (client) clientName = client.name;
      }
      
      const budgetedHours = parseFloat(contract.budgetedHours || '0');
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const pdfBuffer = await generateWeeklySummaryPdf({
        projectName: contract.name,
        projectNumber: contract.contractNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        weekStart: weekStart as string,
        weekEnd: weekEnd as string,
        schedule: {
          progress: 0,
          status: 'on_track',
          startDate: contract.startDate ? String(contract.startDate) : null,
          endDate: contract.substantialCompletionDate ? String(contract.substantialCompletionDate) : null,
          daysRemaining: null,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget: 0,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - totalHoursUsed),
          progress: budgetedHours > 0 ? (totalHoursUsed / budgetedHours) * 100 : 0,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        dailyReports: dailyReportsData,
        weatherSummary: {
          totalReports: weeklyReports.length,
          breakdown: Object.entries(weatherCounts).map(([type, count]) => ({
            type, count, percentage: weeklyReports.length > 0 ? Math.round((count / weeklyReports.length) * 100) : 0,
          })),
        },
        issuesSummary: {
          totalCount: weeklyReports.filter((r: any) => r.issuesFlag).length,
          issues: weeklyReports.filter((r: any) => r.issuesFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.issuesDetails || '',
          })),
        },
        safetySummary: {
          totalCount: weeklyReports.filter((r: any) => r.safetyFlag).length,
          incidents: weeklyReports.filter((r: any) => r.safetyFlag).map((r: any) => ({
            date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
            details: r.safetyDetails || '',
          })),
        },
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          ...hours,
        })),
      });
      
      const weekLabel = format(startDate, 'MMM_d') + '_to_' + format(endDate, 'MMM_d_yyyy');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${contract.name.replace(/[^a-z0-9]/gi, '_')}_Weekly_Summary_${weekLabel}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating contract weekly summary:", error);
      res.status(500).json({ message: "Failed to generate weekly summary" });
    }
  });

  // Contract Current Status PDF
  app.get("/api/contracts/:id/current-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contractId = req.params.id;
      
      const contract = await storage.getContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get company info
      let company = null;
      let logoBuffer: Buffer | undefined = undefined;
      company = await storage.getCompany(contract.companyId);
      if (company?.logoPath) {
        try {
          logoBuffer = await objectStorage.downloadBuffer(company.logoPath);
        } catch (e) {
          console.log("Could not load company logo");
        }
      }
      
      // Get all reports from all projects under this contract
      const allReports = await storage.getReportsByContractProjects(contractId);
      
      // Calculate totals
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of allReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      // Get inspector names
      const inspectorIds = Array.from(new Set(allReports.map((r: any) => r.inspectorId).filter(Boolean))) as string[];
      const inspectorNameMap = new Map<string, string>();
      for (const inspId of inspectorIds) {
        const inspProfile = await storage.getUserProfile(inspId);
        if (inspProfile) {
          inspectorNameMap.set(inspId, `${inspProfile.firstName || ''} ${inspProfile.lastName || ''}`.trim() || 'Unknown');
        }
      }
      
      // Team hours
      const teamHours: Record<string, { regular: number; overtime: number; premium: number; reportCount: number }> = {};
      for (const r of allReports) {
        const inspId = (r as any).inspectorId || 'unknown';
        if (!teamHours[inspId]) teamHours[inspId] = { regular: 0, overtime: 0, premium: 0, reportCount: 0 };
        teamHours[inspId].regular += parseFloat(r.regularHours || '0');
        teamHours[inspId].overtime += parseFloat(r.otHours || '0');
        teamHours[inspId].premium += parseFloat((r as any).premiumHours || '0');
        teamHours[inspId].reportCount += 1;
      }
      
      // Calculate schedule progress
      const now = new Date();
      let scheduleProgress = 0;
      let scheduleStatus = 'not_started';
      let daysRemaining: number | null = null;
      let daysOverdue: number | null = null;
      
      if (contract.startDate && contract.substantialCompletionDate) {
        const start = new Date(contract.startDate);
        const end = new Date(contract.substantialCompletionDate);
        const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const elapsedDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        
        if (now < start) {
          scheduleProgress = 0;
          scheduleStatus = 'not_started';
        } else if (now > end) {
          scheduleProgress = 100;
          daysOverdue = Math.ceil((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = 'overdue';
        } else {
          scheduleProgress = Math.min(100, (elapsedDays / totalDays) * 100);
          daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = scheduleProgress > 75 ? 'warning' : 'on_track';
        }
      }
      
      const budgetedHours = parseFloat(contract.budgetedHours || '0');
      const budgetProgress = budgetedHours > 0 ? (totalHoursUsed / budgetedHours) * 100 : 0;
      const budgetStatus = budgetProgress >= 100 ? 'over' : budgetProgress >= 75 ? 'warning' : 'on_track';
      
      // Get client name
      let clientName = '';
      if (contract.clientId) {
        const client = await storage.getClient(contract.clientId);
        if (client) clientName = client.name;
      }
      
      // Recent reports
      const recentReports = allReports
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map((r: any) => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          inspectorName: inspectorNameMap.get(r.inspectorId || '') || 'Unknown',
          weatherType: r.weatherType,
          workDescription: r.workPerformed,
        }));
      
      const pdfBuffer = await generateCurrentStatusPdf({
        projectName: contract.name,
        projectNumber: contract.contractNumber || '',
        clientName,
        companyName: company?.name || '',
        companyLogoBuffer: logoBuffer,
        schedule: {
          progress: scheduleProgress,
          status: scheduleStatus,
          startDate: contract.startDate ? String(contract.startDate) : null,
          endDate: contract.substantialCompletionDate ? String(contract.substantialCompletionDate) : null,
          daysRemaining,
          daysOverdue,
        },
        hours: {
          budgeted: budgetedHours,
          baseBudget: 0,
          used: totalHoursUsed,
          remaining: Math.max(0, budgetedHours - totalHoursUsed),
          progress: budgetProgress,
          status: budgetStatus,
          breakdown: { regular: totalRegular, overtime: totalOT, premium: totalPremium },
        },
        milestones: [],
        teamOverview: Object.entries(teamHours).map(([inspId, hours]) => ({
          inspectorName: inspectorNameMap.get(inspId) || 'Unknown',
          regular: hours.regular,
          overtime: hours.overtime,
          premium: hours.premium,
          reportCount: hours.reportCount,
        })),
        recentReports: recentReports,
        totalReports: allReports.length,
        issuesCount: allReports.filter((r: any) => r.issuesFlag).length,
        safetyCount: allReports.filter((r: any) => r.safetyFlag).length,
      });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${contract.name.replace(/[^a-z0-9]/gi, '_')}_Current_Status_${format(now, 'MMM_d_yyyy')}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating contract current status:", error);
      res.status(500).json({ message: "Failed to generate current status" });
    }
  });

  // Contract Weekly Summary Email
  app.post("/api/contracts/:id/weekly-summary/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contractId = req.params.id;
      const { weekStart, weekEnd, additionalEmails } = req.body;
      
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ message: "Week start and end dates are required" });
      }
      
      const contract = await storage.getContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Collect recipients
      const recipients: string[] = [];
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      // Get company info
      const company = await storage.getCompany(contract.companyId);
      let logoBuffer: Buffer | undefined;
      if (company?.logoPath) {
        try { logoBuffer = await objectStorage.downloadBuffer(company.logoPath); } catch (e) {}
      }
      
      const startDate = new Date(weekStart);
      const endDate = new Date(weekEnd);
      const allReports = await storage.getReportsByContractProjects(contractId);
      const weeklyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of weeklyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const weekLabel = format(startDate, 'MMM d') + ' - ' + format(endDate, 'MMM d, yyyy');
      
      await sendEmail({
        to: uniqueRecipients,
        subject: `Weekly Summary: ${contract.name} - ${weekLabel}`,
        html: `<div style="font-family: Arial, sans-serif;"><h2>Weekly Contract Summary</h2><p>Contract: <strong>${contract.name}</strong><br/>Week: ${weekLabel}</p><p>Total Reports: ${weeklyReports.length}<br/>Total Hours: ${totalHoursUsed.toFixed(1)}</p><p style="color:#999;font-size:12px;">${company?.name || ''}</p></div>`,
      });
      
      res.json({ success: true, message: `Weekly summary sent to ${uniqueRecipients.length} recipient(s)`, recipients: uniqueRecipients });
    } catch (error) {
      console.error("Error emailing contract weekly summary:", error);
      res.status(500).json({ message: "Failed to send weekly summary email" });
    }
  });

  // Contract Monthly Summary Email
  app.post("/api/contracts/:id/monthly-summary/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contractId = req.params.id;
      const { month, year, additionalEmails } = req.body;
      
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      
      const contract = await storage.getContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Collect recipients
      const recipients: string[] = [];
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      const company = await storage.getCompany(contract.companyId);
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0);
      
      const allReports = await storage.getReportsByContractProjects(contractId);
      const monthlyReports = allReports.filter((r: any) => {
        const reportDate = new Date(r.date);
        return reportDate >= startDate && reportDate <= endDate;
      });
      
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of monthlyReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      const monthLabel = format(startDate, 'MMMM yyyy');
      
      await sendEmail({
        to: uniqueRecipients,
        subject: `Monthly Summary: ${contract.name} - ${monthLabel}`,
        html: `<div style="font-family: Arial, sans-serif;"><h2>Monthly Contract Summary</h2><p>Contract: <strong>${contract.name}</strong><br/>Month: ${monthLabel}</p><p>Total Reports: ${monthlyReports.length}<br/>Total Hours: ${totalHoursUsed.toFixed(1)}</p><p style="color:#999;font-size:12px;">${company?.name || ''}</p></div>`,
      });
      
      res.json({ success: true, message: `Monthly summary sent to ${uniqueRecipients.length} recipient(s)`, recipients: uniqueRecipients });
    } catch (error) {
      console.error("Error emailing contract monthly summary:", error);
      res.status(500).json({ message: "Failed to send monthly summary email" });
    }
  });

  // Contract Current Status Email
  app.post("/api/contracts/:id/current-status/email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contractId = req.params.id;
      const { additionalEmails } = req.body;
      
      const contract = await storage.getContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isEffectiveSystemAdmin(profile) && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Collect recipients
      const recipients: string[] = [];
      if (additionalEmails && Array.isArray(additionalEmails)) {
        recipients.push(...additionalEmails.filter((e: string) => e && e.includes('@')));
      }
      const uniqueRecipients = Array.from(new Set(recipients));
      
      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ message: "No recipients specified" });
      }
      
      const company = await storage.getCompany(contract.companyId);
      const allReports = await storage.getReportsByContractProjects(contractId);
      
      let totalRegular = 0, totalOT = 0, totalPremium = 0;
      for (const r of allReports) {
        totalRegular += parseFloat(r.regularHours || '0');
        totalOT += parseFloat(r.otHours || '0');
        totalPremium += parseFloat((r as any).premiumHours || '0');
      }
      const totalHoursUsed = totalRegular + totalOT + totalPremium;
      
      const now = new Date();
      const dateLabel = format(now, 'MMM d, yyyy');
      
      await sendEmail({
        to: uniqueRecipients,
        subject: `Current Status: ${contract.name} - ${dateLabel}`,
        html: `<div style="font-family: Arial, sans-serif;"><h2>Contract Current Status</h2><p>Contract: <strong>${contract.name}</strong><br/>As of: ${dateLabel}</p><p>Total Reports: ${allReports.length}<br/>Total Hours: ${totalHoursUsed.toFixed(1)}</p><p style="color:#999;font-size:12px;">${company?.name || ''}</p></div>`,
      });
      
      res.json({ success: true, message: `Current status sent to ${uniqueRecipients.length} recipient(s)`, recipients: uniqueRecipients });
    } catch (error) {
      console.error("Error emailing contract current status:", error);
      res.status(500).json({ message: "Failed to send current status email" });
    }
  });

  // Update contract
  app.patch("/api/contracts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can update contracts" });
      }
      
      const { options, ...bodyWithoutOptions } = req.body;
      
      // Preprocess data to convert date strings
      const preprocessed = preprocessContractData(bodyWithoutOptions);
      
      // Validate request body with partial Zod schema for updates
      const updateSchema = insertContractSchema.omit({ companyId: true, createdById: true }).partial();
      const validationResult = updateSchema.safeParse(preprocessed);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid contract data", 
          errors: validationResult.error.format() 
        });
      }
      
      await storage.updateContract(req.params.id, validationResult.data);
      
      // If options are provided, recreate them
      if (options && Array.isArray(options)) {
        await storage.deleteContractOptions(req.params.id);
        
        for (let i = 0; i < options.length; i++) {
          const optionData = options[i];
          const option = await storage.createContractOption({
            contractId: req.params.id,
            optionNumber: i + 1,
            name: optionData.name || null,
            awardStatus: optionData.awardStatus || "pending", // For partial awards
          });
          
          // Create inspectors for this option
          if (optionData.inspectors && Array.isArray(optionData.inspectors)) {
            for (const inspectorData of optionData.inspectors) {
              await storage.createContractOptionInspector({
                optionId: option.id,
                title: inspectorData.title || "Inspector",
                inspectorName: inspectorData.inspectorName || null,
                rate: inspectorData.rate || "0",
                hours: inspectorData.hours || "0",
                scheduleType: inspectorData.scheduleType || "fullTime",
              });
            }
          }
        }
      }
      
      // Return updated contract with options
      const fullContract = await storage.getContract(req.params.id);
      res.json(fullContract);
    } catch (error) {
      console.error("Error updating contract:", error);
      res.status(500).json({ message: "Failed to update contract" });
    }
  });

  // Delete contract
  app.delete("/api/contracts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can delete contracts" });
      }
      
      await storage.deleteContract(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contract:", error);
      res.status(500).json({ message: "Failed to delete contract" });
    }
  });

  // ========== ADD OPTIONS TO EXISTING CONTRACT ==========
  
  // Append new options to an existing contract (for proposal conversion)
  app.post("/api/contracts/:id/add-options", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const contractId = req.params.id;
      const contract = await storage.getContract(contractId);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can add options to contracts" });
      }
      
      const { options } = req.body;
      
      if (!options || !Array.isArray(options) || options.length === 0) {
        return res.status(400).json({ message: "Options array is required" });
      }
      
      // Get the current highest option number for this contract
      const existingOptions = contract.options || [];
      let maxOptionNumber = existingOptions.reduce((max: number, opt: any) => 
        Math.max(max, opt.optionNumber || 0), 0);
      
      const createdOptions = [];
      
      for (const optionData of options) {
        maxOptionNumber++;
        const option = await storage.createContractOption({
          contractId: contractId,
          optionNumber: maxOptionNumber,
          name: optionData.name || null,
          awardStatus: optionData.awardStatus || "pending", // For partial awards
        });
        
        // Create inspectors for this option
        if (optionData.inspectors && Array.isArray(optionData.inspectors)) {
          for (const inspectorData of optionData.inspectors) {
            await storage.createContractOptionInspector({
              optionId: option.id,
              title: inspectorData.title || "Inspector",
              inspectorName: inspectorData.inspectorName || null,
              rate: inspectorData.rate || "0",
              hours: inspectorData.hours || "0",
              scheduleType: inspectorData.scheduleType || "fullTime",
            });
          }
        }
        
        createdOptions.push(option);
      }
      
      // Recalculate and update contract value
      const fullContract = await storage.getContract(contractId);
      if (fullContract?.options && fullContract.options.length > 0) {
        // Calculate total value from all options
        let totalValue = 0;
        for (const opt of fullContract.options) {
          for (const ins of opt.inspectors || []) {
            totalValue += (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
          }
        }
        await storage.updateContract(contractId, { 
          currentValue: totalValue.toFixed(2),
        });
      }
      
      // Return updated contract with all options
      const updatedContract = await storage.getContract(contractId);
      res.json(updatedContract);
    } catch (error) {
      console.error("Error adding options to contract:", error);
      res.status(500).json({ message: "Failed to add options to contract" });
    }
  });

  // ========== CONTRACT ATTACHMENTS ==========

  // Upload attachments to a contract
  app.post("/api/contracts/:id/attachments", isAuthenticated, attachmentUpload.array("attachments", 10), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      // Only admins can add attachments
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can add attachments" });
      }
      
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files provided" });
      }
      
      const createdAttachments = [];
      
      for (const file of files) {
        const ext = path.extname(file.originalname);
        const filename = `${randomUUID()}${ext}`;
        const objectPath = await objectStorage.uploadBuffer({
          buffer: file.buffer,
          filename: filename,
          contentType: file.mimetype,
          folder: `contracts/${req.params.id}`,
        });
        
        const attachment = await storage.createContractAttachment({
          contractId: req.params.id,
          filePath: objectPath,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
        });
        createdAttachments.push(attachment);
      }
      
      res.status(201).json(createdAttachments);
    } catch (error) {
      console.error("Error uploading contract attachments:", error);
      res.status(500).json({ message: "Failed to upload attachments" });
    }
  });

  // Get attachments for a contract
  app.get("/api/contracts/:id/attachments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const contract = await storage.getContract(req.params.id);
      
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      // Check membership in contract's company
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const attachments = await storage.getContractAttachments(req.params.id);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching contract attachments:", error);
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  // Download an attachment
  app.get("/api/contract-attachments/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const attachment = await storage.getContractAttachment(req.params.id);
      
      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      
      const contract = await storage.getContract(attachment.contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      // Check membership in contract's company
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const url = await objectStorage.getSignedDownloadUrl(attachment.filePath, 300); // 5 minute expiry
      res.json({ url, fileName: attachment.fileName });
    } catch (error) {
      console.error("Error downloading attachment:", error);
      res.status(500).json({ message: "Failed to download attachment" });
    }
  });

  // Delete an attachment
  app.delete("/api/contract-attachments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const attachment = await storage.getContractAttachment(req.params.id);
      
      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      
      const contract = await storage.getContract(attachment.contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract not found" });
      }
      
      // Only admins can delete attachments
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, contract.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can delete attachments" });
      }
      
      // Delete from object storage
      try {
        await objectStorage.deleteObject(attachment.filePath);
      } catch (err) {
        console.warn("Failed to delete file from object storage:", err);
      }
      
      await storage.deleteContractAttachment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  // ========== CONTRACT NOTIFICATIONS ==========
  
  // Process contract notifications and update statuses - can be triggered daily via cron or manually
  app.post("/api/contracts/process-notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Only system admins or company admins can trigger notification processing
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      let companyIdFilter: string | null = null;
      
      if (!isSysAdmin && profile?.activeCompanyId) {
        const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
        if (!isCompAdmin) {
          return res.status(403).json({ message: "Admin access required" });
        }
        companyIdFilter = profile.activeCompanyId;
      } else if (!isSysAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Import Resend for sending emails
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      // Use shared notification processing function
      const results = await processContractNotifications(resend, {
        companyIdFilter,
        sendEmails: true,
      });
      
      res.json({
        success: true,
        ...results,
      });
    } catch (error: any) {
      console.error("Error processing contract notifications:", error);
      res.status(500).json({ message: "Failed to process notifications", error: error.message });
    }
  });

  // Send test notification emails (for preview purposes) - System Owner only
  app.post("/api/contracts/send-test-notifications", isAuthenticated, isSystemOwner, async (req: any, res) => {
    try {
      const { emails } = req.body;
      
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ message: "Please provide an array of email addresses" });
      }
      
      // Import the email helper that uses Replit's Resend integration
      const { sendEmail: sendResendEmail } = await import('./replit_integrations/email/client');
      const results: { sent: string[]; errors: string[] } = { sent: [], errors: [] };
      
      // Sample contract data for test emails
      const sampleContract = {
        name: "Downtown Office Building Renovation",
        contractNumber: "CON-2025-001",
        clientName: "Acme Construction Corp",
        companyName: "Knowland Construction Inspections",
      };
      
      const formatCurrency = (amount: number) => 
        amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      
      // Helper to send email
      const sendEmail = async (subject: string, html: string, type: string) => {
        try {
          await sendResendEmail({
            to: emails,
            subject,
            html,
          });
          results.sent.push(type);
        } catch (err: any) {
          results.errors.push(`${type}: ${err.message}`);
        }
      };
      
      // 1. Contract Start Date Reminder (7 days)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7);
      const formattedStartDate = startDate.toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      });
      
      await sendEmail(
        `Contract Reminder: ${sampleContract.name} - Contract Start Date in 7 days`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a365d;">Contract Date Reminder</h2>
            <p>This is a reminder about an upcoming contract milestone:</p>
            
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #2d3748;">${sampleContract.name}</h3>
              <p style="margin: 5px 0;"><strong>Contract #:</strong> ${sampleContract.contractNumber}</p>
              <p style="margin: 5px 0;"><strong>Client:</strong> ${sampleContract.clientName}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Contract Start Date:</strong> ${formattedStartDate}</p>
              <p style="margin: 5px 0; color: #c05621;"><strong>Days Until:</strong> 7 days</p>
            </div>
            
            <p style="color: #718096; font-size: 14px;">
              This is an automated reminder from ${sampleContract.companyName}.
            </p>
          </div>
        `,
        "Contract Start Date (7 days)"
      );
      
      // 2. Substantial Completion Date Reminder (30 days)
      const substantialDate = new Date();
      substantialDate.setDate(substantialDate.getDate() + 30);
      const formattedSubstantialDate = substantialDate.toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      });
      
      await sendEmail(
        `Contract Reminder: ${sampleContract.name} - Substantial Completion Date in 30 days`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a365d;">Contract Date Reminder</h2>
            <p>This is a reminder about an upcoming contract milestone:</p>
            
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #2d3748;">${sampleContract.name}</h3>
              <p style="margin: 5px 0;"><strong>Contract #:</strong> ${sampleContract.contractNumber}</p>
              <p style="margin: 5px 0;"><strong>Client:</strong> ${sampleContract.clientName}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Substantial Completion Date:</strong> ${formattedSubstantialDate}</p>
              <p style="margin: 5px 0; color: #c05621;"><strong>Days Until:</strong> 30 days</p>
            </div>
            
            <p style="color: #718096; font-size: 14px;">
              This is an automated reminder from ${sampleContract.companyName}.
            </p>
          </div>
        `,
        "Substantial Completion (30 days)"
      );
      
      // 3. Final Closeout Date Reminder (10 days)
      const closeoutDate = new Date();
      closeoutDate.setDate(closeoutDate.getDate() + 10);
      const formattedCloseoutDate = closeoutDate.toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      });
      
      await sendEmail(
        `Contract Reminder: ${sampleContract.name} - Final Closeout Date in 10 days`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a365d;">Contract Date Reminder</h2>
            <p>This is a reminder about an upcoming contract milestone:</p>
            
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #2d3748;">${sampleContract.name}</h3>
              <p style="margin: 5px 0;"><strong>Contract #:</strong> ${sampleContract.contractNumber}</p>
              <p style="margin: 5px 0;"><strong>Client:</strong> ${sampleContract.clientName}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Final Closeout Date:</strong> ${formattedCloseoutDate}</p>
              <p style="margin: 5px 0; color: #c05621;"><strong>Days Until:</strong> 10 days</p>
            </div>
            
            <p style="color: #718096; font-size: 14px;">
              This is an automated reminder from ${sampleContract.companyName}.
            </p>
          </div>
        `,
        "Final Closeout (10 days)"
      );
      
      // 4. Budget 50% Milestone
      await sendEmail(
        `Budget Alert: ${sampleContract.name} - 50% Budget Used`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d3748;">Budget Milestone Alert</h2>
            <p>A budget milestone has been reached for the following contract:</p>
            
            <div style="background: #c6f6d5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #68d391;">
              <h3 style="margin: 0 0 10px 0; color: #2d3748;">${sampleContract.name}</h3>
              <p style="margin: 5px 0;"><strong>Contract #:</strong> ${sampleContract.contractNumber}</p>
              <p style="margin: 5px 0;"><strong>Client:</strong> ${sampleContract.clientName}</p>
              <hr style="border: none; border-top: 1px solid #68d391; margin: 15px 0;">
              <p style="margin: 5px 0; font-size: 18px;"><strong>Budget Progress:</strong> 50.0%</p>
              <p style="margin: 5px 0;"><strong>Total Budget:</strong> ${formatCurrency(250000)}</p>
              <p style="margin: 5px 0;"><strong>Amount Spent:</strong> ${formatCurrency(125000)}</p>
              <p style="margin: 5px 0;"><strong>Remaining:</strong> ${formatCurrency(125000)}</p>
            </div>
            
            <p style="color: #718096; font-size: 14px;">
              This is an automated budget alert from ${sampleContract.companyName}.
            </p>
          </div>
        `,
        "Budget 50% Milestone"
      );
      
      // 5. Budget 75% Milestone
      await sendEmail(
        `Budget Alert: ${sampleContract.name} - 75% Budget Used`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d3748;">Budget Milestone Alert</h2>
            <p>A budget milestone has been reached for the following contract:</p>
            
            <div style="background: #c6f6d5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #68d391;">
              <h3 style="margin: 0 0 10px 0; color: #2d3748;">${sampleContract.name}</h3>
              <p style="margin: 5px 0;"><strong>Contract #:</strong> ${sampleContract.contractNumber}</p>
              <p style="margin: 5px 0;"><strong>Client:</strong> ${sampleContract.clientName}</p>
              <hr style="border: none; border-top: 1px solid #68d391; margin: 15px 0;">
              <p style="margin: 5px 0; font-size: 18px;"><strong>Budget Progress:</strong> 75.0%</p>
              <p style="margin: 5px 0;"><strong>Total Budget:</strong> ${formatCurrency(250000)}</p>
              <p style="margin: 5px 0;"><strong>Amount Spent:</strong> ${formatCurrency(187500)}</p>
              <p style="margin: 5px 0;"><strong>Remaining:</strong> ${formatCurrency(62500)}</p>
            </div>
            
            <p style="color: #718096; font-size: 14px;">
              This is an automated budget alert from ${sampleContract.companyName}.
            </p>
          </div>
        `,
        "Budget 75% Milestone"
      );
      
      // 6. Budget 90% Milestone (Warning)
      await sendEmail(
        `Budget Alert: ${sampleContract.name} - 90% Budget Used`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #c05621;">Budget Milestone Alert</h2>
            <p>A budget milestone has been reached for the following contract:</p>
            
            <div style="background: #feebc8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f6ad55;">
              <h3 style="margin: 0 0 10px 0; color: #2d3748;">${sampleContract.name}</h3>
              <p style="margin: 5px 0;"><strong>Contract #:</strong> ${sampleContract.contractNumber}</p>
              <p style="margin: 5px 0;"><strong>Client:</strong> ${sampleContract.clientName}</p>
              <hr style="border: none; border-top: 1px solid #f6ad55; margin: 15px 0;">
              <p style="margin: 5px 0; font-size: 18px;"><strong>Budget Progress:</strong> 90.0%</p>
              <p style="margin: 5px 0;"><strong>Total Budget:</strong> ${formatCurrency(250000)}</p>
              <p style="margin: 5px 0;"><strong>Amount Spent:</strong> ${formatCurrency(225000)}</p>
              <p style="margin: 5px 0;"><strong>Remaining:</strong> ${formatCurrency(25000)}</p>
            </div>
            
            <p style="color: #c05621;">
              This contract is approaching its budget limit. Please monitor closely.
            </p>
            
            <p style="color: #718096; font-size: 14px;">
              This is an automated budget alert from ${sampleContract.companyName}.
            </p>
          </div>
        `,
        "Budget 90% Milestone"
      );
      
      // 7. Budget 100% Milestone (Critical)
      await sendEmail(
        `Budget Alert: ${sampleContract.name} - Budget Exceeded`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #c53030;">Budget Milestone Alert</h2>
            <p>A budget milestone has been reached for the following contract:</p>
            
            <div style="background: #fed7d7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #fc8181;">
              <h3 style="margin: 0 0 10px 0; color: #2d3748;">${sampleContract.name}</h3>
              <p style="margin: 5px 0;"><strong>Contract #:</strong> ${sampleContract.contractNumber}</p>
              <p style="margin: 5px 0;"><strong>Client:</strong> ${sampleContract.clientName}</p>
              <hr style="border: none; border-top: 1px solid #fc8181; margin: 15px 0;">
              <p style="margin: 5px 0; font-size: 18px;"><strong>Budget Progress:</strong> 105.2%</p>
              <p style="margin: 5px 0;"><strong>Total Budget:</strong> ${formatCurrency(250000)}</p>
              <p style="margin: 5px 0;"><strong>Amount Spent:</strong> ${formatCurrency(263000)}</p>
              <p style="margin: 5px 0;"><strong>Remaining:</strong> ${formatCurrency(-13000)}</p>
            </div>
            
            <p style="color: #c53030; font-weight: bold;">
              ALERT: This contract has exceeded its budget. Please review and take appropriate action.
            </p>
            
            <p style="color: #718096; font-size: 14px;">
              This is an automated budget alert from ${sampleContract.companyName}.
            </p>
          </div>
        `,
        "Budget 100% (Exceeded)"
      );
      
      res.json({
        success: true,
        message: `Sent ${results.sent.length} test emails to ${emails.join(', ')}`,
        sent: results.sent,
        errors: results.errors,
      });
    } catch (error: any) {
      console.error("Error sending test notifications:", error);
      res.status(500).json({ message: "Failed to send test notifications", error: error.message });
    }
  });

  // ========== CLIENTS ==========
  
  // Get clients for active company
  app.get("/api/clients", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json([]);
      }
      
      // Verify user is a member of the active company
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      if (!isMember) {
        return res.json([]);
      }
      
      const clientList = await storage.getClients(profile.activeCompanyId);
      res.json(clientList);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // Create client
  app.post("/api/clients", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company selected" });
      }
      
      // Only admins can create clients
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can create clients" });
      }
      
      const baseSchema = insertClientSchema.omit({ companyId: true });
      const validationResult = baseSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid client data", 
          errors: validationResult.error.format() 
        });
      }
      
      const clientData = {
        ...validationResult.data,
        companyId: profile.activeCompanyId,
      };
      
      const client = await storage.createClient(clientData);
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ message: "Failed to create client" });
    }
  });

  // Update client
  app.patch("/api/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const client = await storage.getClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, client.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can update clients" });
      }
      
      const updateSchema = insertClientSchema.omit({ companyId: true }).partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid client data", 
          errors: validationResult.error.format() 
        });
      }
      
      const updated = await storage.updateClient(req.params.id, validationResult.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // Delete client
  app.delete("/api/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const client = await storage.getClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, client.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can delete clients" });
      }
      
      await storage.deleteClient(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // ========== PURCHASE ORDERS ==========

  // Get purchase orders for active company
  app.get("/api/purchase-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json([]);
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      if (!isMember) {
        return res.json([]);
      }
      
      const purchaseOrderList = await storage.getPurchaseOrders(profile.activeCompanyId);
      res.json(purchaseOrderList);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  // Get purchase orders by client (admin only - contains billing info)
  app.get("/api/purchase-orders/by-client/:clientId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const client = await storage.getClient(req.params.clientId);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Require admin access for purchase order billing data
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, client.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Admin access required to view purchase orders" });
      }
      
      const purchaseOrderList = await storage.getPurchaseOrdersByClient(req.params.clientId);
      res.json(purchaseOrderList);
    } catch (error) {
      console.error("Error fetching purchase orders by client:", error);
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  // Get single purchase order
  app.get("/api/purchase-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const purchaseOrder = await storage.getPurchaseOrder(req.params.id);
      
      if (!purchaseOrder) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(purchaseOrder.companyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(purchaseOrder);
    } catch (error) {
      console.error("Error fetching purchase order:", error);
      res.status(500).json({ message: "Failed to fetch purchase order" });
    }
  });

  // Create purchase order
  app.post("/api/purchase-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can create purchase orders" });
      }
      
      // Preprocess date fields - convert ISO strings to Date objects
      const { issueDate, expirationDate, ...otherFields } = req.body;
      const poData = {
        ...otherFields,
        companyId: profile.activeCompanyId,
        issueDate: issueDate ? new Date(typeof issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate + 'T12:00:00' : issueDate) : null,
        expirationDate: expirationDate ? new Date(typeof expirationDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expirationDate) ? expirationDate + 'T12:00:00' : expirationDate) : null,
      };
      
      const purchaseOrder = await storage.createPurchaseOrder(poData);
      
      res.status(201).json(purchaseOrder);
    } catch (error) {
      console.error("Error creating purchase order:", error);
      res.status(500).json({ message: "Failed to create purchase order" });
    }
  });

  // Update purchase order
  app.patch("/api/purchase-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const purchaseOrder = await storage.getPurchaseOrder(req.params.id);
      
      if (!purchaseOrder) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, purchaseOrder.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can update purchase orders" });
      }
      
      // Preprocess date fields - convert ISO strings to Date objects
      const { issueDate, expirationDate, ...otherFields } = req.body;
      const updateData: any = { ...otherFields };
      if (issueDate !== undefined) {
        updateData.issueDate = issueDate ? new Date(typeof issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate + 'T12:00:00' : issueDate) : null;
      }
      if (expirationDate !== undefined) {
        updateData.expirationDate = expirationDate ? new Date(typeof expirationDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expirationDate) ? expirationDate + 'T12:00:00' : expirationDate) : null;
      }
      
      const updated = await storage.updatePurchaseOrder(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating purchase order:", error);
      res.status(500).json({ message: "Failed to update purchase order" });
    }
  });

  // Delete purchase order
  app.delete("/api/purchase-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const purchaseOrder = await storage.getPurchaseOrder(req.params.id);
      
      if (!purchaseOrder) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, purchaseOrder.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can delete purchase orders" });
      }
      
      await storage.deletePurchaseOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting purchase order:", error);
      res.status(500).json({ message: "Failed to delete purchase order" });
    }
  });

  // Get purchase order balance (usage tracking)
  app.get("/api/purchase-orders/:id/balance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const purchaseOrder = await storage.getPurchaseOrder(req.params.id);
      
      if (!purchaseOrder) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(purchaseOrder.companyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const balance = await storage.getPurchaseOrderBalance(req.params.id);
      const invoiceList = await storage.getInvoicesByPurchaseOrder(req.params.id);
      
      res.json({
        purchaseOrderId: req.params.id,
        poNumber: purchaseOrder.poNumber,
        ...balance,
        invoiceCount: invoiceList.length,
        utilizationPercentage: balance.totalValue > 0 
          ? Math.round((balance.billedAmount / balance.totalValue) * 100) 
          : 0,
      });
    } catch (error) {
      console.error("Error fetching PO balance:", error);
      res.status(500).json({ message: "Failed to fetch PO balance" });
    }
  });

  // ========== INVOICES ==========

  // Get invoice stats for dashboard
  app.get("/api/invoices/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json({
          total: 0,
          draft: 0,
          sent: 0,
          paid: 0,
          overdue: 0,
          totalAmount: 0,
          paidAmount: 0,
          outstandingAmount: 0
        });
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      if (!isMember) {
        return res.json({
          total: 0,
          draft: 0,
          sent: 0,
          paid: 0,
          overdue: 0,
          totalAmount: 0,
          paidAmount: 0,
          outstandingAmount: 0
        });
      }
      
      const invoiceList = await storage.getInvoices(profile.activeCompanyId);
      
      const stats = {
        total: invoiceList.length,
        draft: invoiceList.filter(i => i.status === 'draft').length,
        sent: invoiceList.filter(i => i.status === 'sent').length,
        paid: invoiceList.filter(i => i.status === 'paid').length,
        overdue: invoiceList.filter(i => i.status === 'overdue').length,
        totalAmount: invoiceList.reduce((sum, i) => sum + parseFloat(i.totalAmount || '0'), 0),
        paidAmount: invoiceList.filter(i => i.status === 'paid').reduce((sum, i) => sum + parseFloat(i.totalAmount || '0'), 0),
        outstandingAmount: invoiceList.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + parseFloat(i.totalAmount || '0'), 0)
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching invoice stats:", error);
      res.status(500).json({ message: "Failed to fetch invoice stats" });
    }
  });

  // Get outstanding invoices (sent + overdue) for active company, grouped by project/contract
  app.get("/api/invoices/outstanding", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);

      if (!profile?.activeCompanyId) {
        return res.json([]);
      }

      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      if (!isMember) {
        return res.json([]);
      }

      const invoiceList = await storage.getInvoices(profile.activeCompanyId);
      const outstanding = invoiceList
        .filter(i => i.status === 'sent' || i.status === 'overdue')
        .sort((a, b) => {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return aDate - bDate;
        })
        .map(i => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          totalAmount: i.totalAmount,
          dueDate: i.dueDate,
          month: i.month,
          year: i.year,
          projectId: i.projectId,
          projectName: i.project?.name || null,
          contractId: i.contractId || null,
          contractName: i.contract?.name || null,
        }));

      res.json(outstanding);
    } catch (error) {
      console.error("Error fetching outstanding invoices:", error);
      res.status(500).json({ message: "Failed to fetch outstanding invoices" });
    }
  });

  // Get invoices for active company
  app.get("/api/invoices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json([]);
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      if (!isMember) {
        return res.json([]);
      }
      
      const invoiceList = await storage.getInvoices(profile.activeCompanyId);
      res.json(invoiceList);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Create invoice
  app.post("/api/invoices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can create invoices" });
      }
      
      const {
        projectId,
        contractId,
        clientId,
        purchaseOrderId,
        month,
        year,
        regularHours,
        overtimeHours,
        premiumHours,
        regularRate,
        overtimeRate,
        premiumRate,
        regularAmount,
        overtimeAmount,
        premiumAmount,
        subtotal,
        totalAmount,
        dueDate,
        notes,
        pdfPath,
        status
      } = req.body;
      
      if (!projectId || !month || !year) {
        return res.status(400).json({ message: "Project, month, and year are required" });
      }
      
      const invoiceNumber = await storage.getNextInvoiceNumber();
      
      const invoice = await storage.createInvoice({
        companyId: profile.activeCompanyId,
        projectId,
        contractId: contractId || undefined,
        clientId: clientId || undefined,
        purchaseOrderId: purchaseOrderId || undefined,
        invoiceNumber,
        month,
        year,
        regularHours: regularHours || "0",
        overtimeHours: overtimeHours || "0",
        premiumHours: premiumHours || "0",
        regularRate: regularRate || undefined,
        overtimeRate: overtimeRate || undefined,
        premiumRate: premiumRate || undefined,
        regularAmount: regularAmount || "0",
        overtimeAmount: overtimeAmount || "0",
        premiumAmount: premiumAmount || "0",
        subtotal: subtotal || "0",
        totalAmount: totalAmount || "0",
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes: notes || undefined,
        pdfPath: pdfPath || undefined,
        status: status || undefined,
      });
      
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  // Get single invoice
  app.get("/api/invoices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(invoice.companyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // Update invoice (status, dates, etc.)
  app.patch("/api/invoices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, invoice.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can update invoices" });
      }
      
      const updated = await storage.updateInvoice(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  // Delete invoice
  app.delete("/api/invoices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, invoice.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can delete invoices" });
      }
      
      await storage.deleteInvoice(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // Send invoice via email
  app.post("/api/invoices/:id/send", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const invoice = await storage.getInvoice(req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, invoice.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can send invoices" });
      }
      
      const { recipientEmail, ccEmails, subject, message } = req.body;
      
      if (!recipientEmail) {
        return res.status(400).json({ message: "Recipient email is required" });
      }
      
      // Get related data for invoice
      const company = await storage.getCompany(invoice.companyId);
      const project = await storage.getProject(invoice.projectId);
      let client = null;
      let purchaseOrder = null;
      let contract = null;
      
      if (invoice.clientId) {
        client = await storage.getClient(invoice.clientId);
      }
      if (!client && project?.clientId) {
        client = await storage.getClient(project.clientId);
      }
      if (invoice.purchaseOrderId) {
        purchaseOrder = await storage.getPurchaseOrder(invoice.purchaseOrderId);
      }
      if (invoice.contractId) {
        contract = await storage.getContract(invoice.contractId);
      }
      if (!client && contract?.clientId) {
        client = await storage.getClient(contract.clientId);
      }
      
      // Generate PDF for attachment
      const invoiceData: InvoiceData = {
        companyName: company?.name || 'Company',
        companyAddress: company?.address || undefined,
        companyPhone: company?.phone || undefined,
        companyEmail: company?.email || undefined,
        clientName: client?.name,
        clientAddress: client?.address || undefined,
        projectName: project?.name || 'Unknown Project',
        projectNumber: project?.projectNumber || undefined,
        purchaseOrderNumber: purchaseOrder?.poNumber || undefined,
        invoiceNumber: `INV-${invoice.invoiceNumber}`,
        invoiceDate: invoice.createdAt || new Date(),
        dueDate: invoice.dueDate || undefined,
        month: invoice.month,
        year: invoice.year,
        regularHours: parseFloat(invoice.regularHours || '0'),
        overtimeHours: parseFloat(invoice.overtimeHours || '0'),
        premiumHours: parseFloat(invoice.premiumHours || '0'),
        regularRate: parseFloat(invoice.regularRate || '0'),
        overtimeRate: parseFloat(invoice.overtimeRate || '0'),
        premiumRate: parseFloat(invoice.premiumRate || '0'),
      };
      
      const pdfBuffer = await generateInvoicePdf(invoiceData);
      
      // Build email HTML
      const monthName = format(new Date(invoice.year, invoice.month - 1), 'MMMM yyyy');
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invoice from ${company?.name || 'Company'}</h2>
          <p>Invoice Number: INV-${invoice.invoiceNumber}</p>
          <p>Project: ${project?.name || 'Unknown Project'}</p>
          <p>Period: ${monthName}</p>
          <p>Total Amount: $${parseFloat(invoice.totalAmount || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          ${purchaseOrder ? `<p>Purchase Order: ${purchaseOrder.poNumber}</p>` : ''}
          ${message ? `<p style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">${message}</p>` : ''}
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />
          <p style="color: #666; font-size: 12px;">Please find the invoice attached to this email.</p>
        </div>
      `;
      
      const { sendEmail } = await import('./replit_integrations/email/client');
      
      const emailRecipients = [recipientEmail];
      if (ccEmails && Array.isArray(ccEmails)) {
        emailRecipients.push(...ccEmails);
      }
      
      await sendEmail({
        to: emailRecipients,
        subject: subject || `Invoice INV-${invoice.invoiceNumber} from ${company?.name || 'Company'}`,
        html: emailHtml,
        attachments: [{
          filename: `Invoice_${invoice.invoiceNumber}_${monthName.replace(' ', '-')}.pdf`,
          content: pdfBuffer,
        }],
      });
      
      // Update invoice status to 'sent'
      await storage.updateInvoice(req.params.id, { status: 'sent' });
      
      res.json({ message: "Invoice sent successfully" });
    } catch (error) {
      console.error("Error sending invoice:", error);
      res.status(500).json({ message: "Failed to send invoice" });
    }
  });

  // ========== PROPOSALS ==========
  
  // Get proposals for active company
  app.get("/api/proposals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company selected" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const proposalList = await storage.getProposals(profile.activeCompanyId);
      res.json(proposalList);
    } catch (error) {
      console.error("Error fetching proposals:", error);
      res.status(500).json({ message: "Failed to fetch proposals" });
    }
  });

  // Get single proposal
  app.get("/api/proposals/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const proposal = await storage.getProposal(req.params.id);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const isMember = await storage.isUserMemberOfCompany(proposal.companyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(proposal);
    } catch (error) {
      console.error("Error fetching proposal:", error);
      res.status(500).json({ message: "Failed to fetch proposal" });
    }
  });

  // Create proposal with options and inspectors
  app.post("/api/proposals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      console.log("[Proposal Create] userId:", userId);
      console.log("[Proposal Create] profile:", { 
        role: profile?.role, 
        activeCompanyId: profile?.activeCompanyId, 
        preferAdminMode: profile?.preferAdminMode 
      });
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company selected" });
      }
      
      const membership = await storage.getCompanyMember(profile.activeCompanyId, userId);
      console.log("[Proposal Create] company membership:", membership);
      
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      console.log("[Proposal Create] isCompAdmin:", isCompAdmin, "isSysAdmin:", isSysAdmin);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can create proposals" });
      }
      
      const { options, ...proposalData } = req.body;
      
      // Generate proposal number
      const proposalNumber = await storage.getNextProposalNumber(profile.activeCompanyId);
      
      const processedData = {
        ...proposalData,
        companyId: profile.activeCompanyId,
        proposalNumber,
        createdById: userId,
        startDate: proposalData.startDate ? new Date(proposalData.startDate) : null,
        endDate: proposalData.endDate ? new Date(proposalData.endDate) : null,
        clientId: proposalData.clientId || null,
        contractId: proposalData.contractId || null,
        projectId: proposalData.projectId || null,
      };
      
      const proposal = await storage.createProposal(processedData);
      
      // Create options and their inspectors
      if (options && Array.isArray(options)) {
        for (let i = 0; i < options.length; i++) {
          const optionData = options[i];
          const option = await storage.createProposalOption({
            proposalId: proposal.id,
            optionNumber: i + 1,
            name: optionData.name,
          });
          
          if (optionData.inspectors && Array.isArray(optionData.inspectors)) {
            for (const inspector of optionData.inspectors) {
              await storage.createProposalOptionInspector({
                optionId: option.id,
                title: inspector.title,
                inspectorName: inspector.inspectorName,
                rate: inspector.rate,
                hours: inspector.hours,
                scheduleType: inspector.scheduleType || "fullTime",
              });
            }
          }
        }
      }
      
      // Send bid notification if proposal has an end date (bid deadline)
      if (proposal.endDate) {
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { sendBidCreatedNotification } = await import('./notification-processor');
          const client = proposal.clientId ? await storage.getClient(proposal.clientId) : null;
          await sendBidCreatedNotification(resend, {
            type: 'proposal',
            name: proposal.projectName,
            number: proposal.proposalNumber,
            clientName: client?.name || proposal.clientName || null,
            bidDueDate: proposal.endDate,
            companyId: profile.activeCompanyId,
          });
        } catch (notifError) {
          console.error("Failed to send proposal bid notification:", notifError);
        }
      }

      const fullProposal = await storage.getProposal(proposal.id);
      res.status(201).json(fullProposal);
    } catch (error) {
      console.error("Error creating proposal:", error);
      res.status(500).json({ message: "Failed to create proposal" });
    }
  });

  // Update proposal
  app.patch("/api/proposals/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const proposal = await storage.getProposal(req.params.id);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, proposal.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can update proposals" });
      }
      
      const { options, ...proposalData } = req.body;
      
      const processedData = {
        ...proposalData,
        startDate: proposalData.startDate ? new Date(proposalData.startDate) : null,
        endDate: proposalData.endDate ? new Date(proposalData.endDate) : null,
        clientId: proposalData.clientId || null,
        contractId: proposalData.contractId || null,
        projectId: proposalData.projectId || null,
      };
      
      const updated = await storage.updateProposal(req.params.id, processedData);
      
      // If options are provided, recreate them
      if (options && Array.isArray(options)) {
        await storage.deleteProposalOptions(req.params.id);
        
        for (let i = 0; i < options.length; i++) {
          const optionData = options[i];
          const option = await storage.createProposalOption({
            proposalId: req.params.id,
            optionNumber: i + 1,
            name: optionData.name,
          });
          
          if (optionData.inspectors && Array.isArray(optionData.inspectors)) {
            for (const inspector of optionData.inspectors) {
              await storage.createProposalOptionInspector({
                optionId: option.id,
                title: inspector.title,
                inspectorName: inspector.inspectorName,
                rate: inspector.rate,
                hours: inspector.hours,
                scheduleType: inspector.scheduleType || "fullTime",
              });
            }
          }
        }
      }
      
      const fullProposal = await storage.getProposal(req.params.id);
      res.json(fullProposal);
    } catch (error) {
      console.error("Error updating proposal:", error);
      res.status(500).json({ message: "Failed to update proposal" });
    }
  });

  // Delete proposal
  app.delete("/api/proposals/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const proposal = await storage.getProposal(req.params.id);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, proposal.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can delete proposals" });
      }
      
      await storage.deleteProposal(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting proposal:", error);
      res.status(500).json({ message: "Failed to delete proposal" });
    }
  });

  // Generate proposal PDF
  app.post("/api/proposals/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const proposal = await storage.getProposal(req.params.id);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, proposal.companyId, profile);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isCompAdmin && !isSysAdmin) {
        return res.status(403).json({ message: "Only admins can generate proposal PDFs" });
      }
      
      const company = await storage.getCompany(proposal.companyId);
      
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const pdfChunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => pdfChunks.push(chunk));
      
      const pdfComplete = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
        doc.on('error', reject);
      });

      const pageWidth = doc.page.width - 100;
      const startX = 50;
      const centerX = doc.page.width / 2;

      // Helper to load images - handles both old /storage/uploads/ and new /objects/ paths
      const loadImageBuffer = async (imagePath: string): Promise<Buffer | null> => {
        try {
          // Try object storage first for /objects/ paths
          if (imagePath.startsWith('/objects/')) {
            return await objectStorage.downloadBuffer(imagePath);
          }
          
          // For /storage/uploads/ paths, try object storage with converted path first
          if (imagePath.startsWith('/storage/uploads/')) {
            try {
              // Try to find in object storage under photos folder
              const filename = imagePath.split('/').pop();
              const objectPath = `/objects/photos/${filename}`;
              return await objectStorage.downloadBuffer(objectPath);
            } catch (objErr) {
              // Fall through to try local path
              console.log('Image not found in object storage, trying local:', imagePath);
            }
          }
          
          // Fall back to local filesystem
          const localPath = path.join(process.cwd(), imagePath.replace(/^\//, ''));
          if (fs.existsSync(localPath)) {
            return fs.readFileSync(localPath);
          }
          
          console.log('Image not found locally either:', imagePath);
        } catch (err) {
          console.error('Error loading image:', imagePath, err);
        }
        return null;
      };

      // ===== PAGE 1: PROPOSAL COVER =====
      
      // Company logo - top left corner
      if (company?.logoPath) {
        try {
          const logoBuffer = await loadImageBuffer(company.logoPath);
          if (logoBuffer) {
            doc.image(logoBuffer, startX, 15, { width: 230, height: 86, fit: [230, 86] });
          }
        } catch (err) {
          console.error('Error adding company logo to proposal:', err);
        }
      }
      
      // Header: "DSA INSPECTORS" right-aligned
      doc.fontSize(10).font('Helvetica').text('DSA INSPECTORS', startX, 48, { width: pageWidth, align: 'right' });
      
      // Title - positioned half inch (36 points) below logo bottom (15 + 76 + 36 = 127)
      doc.fontSize(11).font('Helvetica-Bold').text('PROPOSAL FOR PROJECT INSPECTOR SERVICES', startX, 127, { width: pageWidth, align: 'center' });
      
      // Half inch (36 points) space after title before SCHOOL DISTRICT
      doc.y = 178;
      
      // Proposal details table
      const labelX = startX + 50;
      const valueX = labelX + 150;
      const rowHeight = 24;
      let currentY = doc.y;
      
      const addRow = (label: string, value: string, multiLine = false) => {
        doc.fontSize(10).font('Helvetica-Bold').text(label + ':', labelX, currentY);
        doc.font('Helvetica').text(value || 'N/A', valueX, currentY, { width: pageWidth - (valueX - startX), lineGap: 2 });
        currentY += multiLine ? doc.heightOfString(value || 'N/A', { width: pageWidth - (valueX - startX) }) + 14 : rowHeight;
      };
      
      addRow('SCHOOL DISTRICT', proposal.clientName);
      
      // Collect unique inspector names (deduplicated) and add suffix
      const allInspectorNames = proposal.options?.flatMap(opt => 
        opt.inspectors?.map(ins => ins.inspectorName).filter(Boolean) || []
      ) || [];
      const uniqueInspectorNames = Array.from(new Set(allInspectorNames));
      const inspectorsDisplay = uniqueInspectorNames.length > 0 
        ? uniqueInspectorNames.join(' / ') + ' (or other approved IOR/PE as required)'
        : 'TBD';
      addRow('INSPECTORS', inspectorsDisplay, true); // multiLine for proper spacing
      
      addRow('PROJECT MANAGER', proposal.projectManager || '');
      addRow('PROJECT', proposal.projectName);
      
      // Duration - calculate schedule summary based on per-inspector schedules
      const parseDateStr = (d: any) => {
        if (!d) return null;
        const s = typeof d === 'string' ? d : String(d);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
        return new Date(s);
      };
      const startDateStr = proposal.startDate ? parseDateStr(proposal.startDate)!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
      const endDateStr = proposal.endDate ? parseDateStr(proposal.endDate)!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
      
      // Determine schedule summary from per-inspector schedules
      const allInspectors = proposal.options?.flatMap(opt => opt.inspectors || []) || [];
      const hasFullTime = allInspectors.some(ins => ins.scheduleType !== 'partTime');
      const hasPartTime = allInspectors.some(ins => ins.scheduleType === 'partTime');
      let scheduleTypeLabel = 'Full Time';
      if (hasFullTime && hasPartTime) {
        scheduleTypeLabel = 'Mixed Schedules (see rate table)';
      } else if (hasPartTime) {
        scheduleTypeLabel = 'Part Time';
      }
      
      // Calculate total hours - only show if single option with hours entered
      const optionCount = proposal.options?.length || 0;
      const totalInspectorHours = allInspectors.reduce((sum, ins) => sum + (parseFloat(ins.hours) || 0), 0);
      
      // Only display hours if there's exactly one option AND hours are entered
      // Multiple options = can't know final hours until option is selected
      let durationStr = `${startDateStr} – ${endDateStr}`;
      if (optionCount === 1 && totalInspectorHours > 0) {
        durationStr += `\n${scheduleTypeLabel}, ${totalInspectorHours.toLocaleString()} hours`;
      } else if (optionCount > 1) {
        durationStr += `\n${scheduleTypeLabel} – see rate options below`;
      }
      addRow('DURATION', durationStr, true);
      
      currentY += 10;
      
      // RATE label
      doc.fontSize(10).font('Helvetica-Bold').text('RATE:', labelX, currentY);
      currentY += 20;
      
      // Rate options table - centered on page with cell borders
      const colWidths = [50, 80, 75, 50, 55, 50, 70, 75];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const tableStartX = startX + (pageWidth - tableWidth) / 2;
      const headers = ['Option', 'Title', 'Inspector', 'Schedule', 'Rate', 'Hours', 'Total', 'Grand Total'];
      const tableRowHeight = 24; // Increased from 22pt for better spacing
      const cellPadding = 5; // Increased from 4pt
      const optionSpacing = 8; // Vertical spacing between options
      const textLineGap = 1; // Consistent lineGap for both measurement and rendering
      
      // Helper function to draw cell with borders and text wrapping
      const drawCell = (x: number, y: number, width: number, height: number, text: string, options: { align?: 'left' | 'center' | 'right', font?: string, fontSize?: number, verticalCenter?: boolean } = {}) => {
        const { align = 'center', font = 'Helvetica', fontSize = 9, verticalCenter = true } = options;
        // Draw cell border
        doc.rect(x, y, width, height).stroke();
        // Draw text with padding
        doc.font(font).fontSize(fontSize);
        const textWidth = width - (cellPadding * 2);
        // Use heightOfString with same lineGap as rendering for accurate measurement
        const textHeight = doc.heightOfString(text, { width: textWidth, lineGap: textLineGap });
        // Simple vertical centering: center the text block in the cell
        const textY = verticalCenter ? y + (height - textHeight) / 2 : y + cellPadding;
        doc.text(text, x + cellPadding, textY, { width: textWidth, align, lineGap: textLineGap });
      };
      
      // Helper function to draw merged cell spanning multiple rows with text wrapping
      const drawMergedCell = (x: number, y: number, width: number, height: number, text: string, options: { align?: 'left' | 'center' | 'right', font?: string, fontSize?: number } = {}) => {
        const { align = 'center', font = 'Helvetica-Bold', fontSize = 9 } = options;
        // Draw cell border
        doc.rect(x, y, width, height).stroke();
        // Draw text centered vertically
        doc.font(font).fontSize(fontSize);
        const textWidth = width - (cellPadding * 2);
        // Use heightOfString with same lineGap as rendering for accurate measurement
        const textHeight = doc.heightOfString(text, { width: textWidth, lineGap: textLineGap });
        // Simple vertical centering: center the text block in the cell
        const textY = y + (height - textHeight) / 2;
        doc.text(text, x + cellPadding, textY, { width: textWidth, align, lineGap: textLineGap });
      };
      
      // Table header row
      doc.fontSize(8).font('Helvetica-Bold');
      let colX = tableStartX;
      const headerY = currentY;
      headers.forEach((header, i) => {
        drawCell(colX, headerY, colWidths[i], tableRowHeight, header, { font: 'Helvetica-Bold', fontSize: 8 });
        colX += colWidths[i];
      });
      currentY += tableRowHeight;
      
      // Table rows by option
      proposal.options?.forEach((option, optIndex) => {
        const inspectorCount = option.inspectors?.length || 1;
        const optionBlockHeight = inspectorCount * tableRowHeight;
        
        const optionTotal = option.inspectors?.reduce((sum, ins) => {
          const rate = parseFloat(ins.rate) || 0;
          const hours = parseFloat(ins.hours) || 0;
          return sum + (rate * hours);
        }, 0) || 0;
        
        const optionStartY = currentY;
        
        // Draw merged Option cell (spans all inspectors in this option)
        drawMergedCell(tableStartX, optionStartY, colWidths[0], optionBlockHeight, `Option ${optIndex + 1}`, { font: 'Helvetica-Bold', fontSize: 9 });
        
        // Draw merged Grand Total cell (spans all inspectors in this option)
        const grandTotalX = tableStartX + colWidths.slice(0, 7).reduce((a, b) => a + b, 0);
        drawMergedCell(grandTotalX, optionStartY, colWidths[7], optionBlockHeight, `$ ${optionTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { font: 'Helvetica-Bold', fontSize: 9, align: 'right' });
        
        // Draw individual inspector rows (columns 1-6: Title, Inspector, Schedule, Rate, Hours, Total)
        option.inspectors?.forEach((inspector, insIndex) => {
          const rowY = optionStartY + (insIndex * tableRowHeight);
          colX = tableStartX + colWidths[0]; // Skip Option column (already drawn as merged)
          
          const rate = parseFloat(inspector.rate) || 0;
          const hours = parseFloat(inspector.hours) || 0;
          const total = rate * hours;
          const scheduleLabel = inspector.scheduleType === 'partTime' ? 'PT (4hr)' : 'FT (8hr)';
          
          // Title
          drawCell(colX, rowY, colWidths[1], tableRowHeight, inspector.title || '', { align: 'center' });
          colX += colWidths[1];
          
          // Inspector Name
          drawCell(colX, rowY, colWidths[2], tableRowHeight, inspector.inspectorName || '', { align: 'center' });
          colX += colWidths[2];
          
          // Schedule
          drawCell(colX, rowY, colWidths[3], tableRowHeight, scheduleLabel, { align: 'center' });
          colX += colWidths[3];
          
          // Rate
          drawCell(colX, rowY, colWidths[4], tableRowHeight, `$ ${rate.toFixed(2)}`, { align: 'right' });
          colX += colWidths[4];
          
          // Hours
          drawCell(colX, rowY, colWidths[5], tableRowHeight, hours.toLocaleString(), { align: 'right' });
          colX += colWidths[5];
          
          // Total
          drawCell(colX, rowY, colWidths[6], tableRowHeight, `$ ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { align: 'right' });
        });
        
        currentY += optionBlockHeight + optionSpacing; // Add spacing after each option block
      });
      
      currentY += 15;
      
      // Grand Total summary
      doc.fontSize(10).font('Helvetica-Bold').text('Grand Total:', startX + 50, currentY);
      doc.font('Helvetica').text('(Not to Exceed)', startX + 50, currentY + 12);
      
      let summaryY = currentY;
      proposal.options?.forEach((option, optIndex) => {
        const optionTotal = option.inspectors?.reduce((sum, ins) => {
          const rate = parseFloat(ins.rate) || 0;
          const hours = parseFloat(ins.hours) || 0;
          return sum + (rate * hours);
        }, 0) || 0;
        
        doc.fontSize(10).font('Helvetica').text(
          `Option ${optIndex + 1}: $ ${optionTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          startX + 150, summaryY
        );
        summaryY += 14;
      });
      
      currentY = Math.max(currentY + 30, summaryY + 15);
      
      // Rate escalation note
      if (proposal.rateEscalationNote) {
        doc.fontSize(9).font('Helvetica-Oblique').text(proposal.rateEscalationNote, startX, currentY, { width: pageWidth, align: 'center' });
        currentY += doc.heightOfString(proposal.rateEscalationNote, { width: pageWidth }) + 10;
      }
      
      // ===== TERMS & CONDITIONS (same page, reduced spacing) =====
      currentY += 24; // ~0.33 inch spacing before agreement section (40% reduction from 40pt)
      
      // Agreement title
      doc.fontSize(11).font('Helvetica-Bold').text('PROJECT INSPECTOR AGENCY AGREEMENT AND CONTRACT DUTIES:', startX, currentY, { width: pageWidth, align: 'center' });
      
      // Space after title before terms
      currentY += 36;
      
      // Parse and render terms - compact formatting with smart page breaks
      // Replace placeholder district name with actual client name
      const rawTerms = proposal.terms || '';
      const terms = rawTerms.replace(/Long Beach Unified School District/gi, proposal.clientName || 'Client');
      const termsParagraphs = terms.split(/\n\n+/).filter(p => p.trim());
      
      // Page break margin - leave room for footer
      const pageBreakMargin = 80;
      const pageBottom = doc.page.height - pageBreakMargin;
      
      doc.fontSize(9).font('Helvetica');
      termsParagraphs.forEach((para, index) => {
        const trimmed = para.trim();
        // Check if it starts with a number
        const numMatch = trimmed.match(/^(\d+)\.\s*/);
        
        // Calculate height of this paragraph before rendering
        let paraHeight: number;
        if (numMatch) {
          const text = trimmed.replace(/^\d+\.\s*/, '');
          paraHeight = doc.heightOfString(text, { width: pageWidth - 18, lineGap: 1 }) + 6;
        } else {
          paraHeight = doc.heightOfString(trimmed, { width: pageWidth, lineGap: 1 }) + 6;
        }
        
        // Check if this paragraph will fit on current page
        if (currentY + paraHeight > pageBottom) {
          doc.addPage();
          currentY = 50; // Reset to top of new page with margin
        }
        
        // Render the paragraph
        if (numMatch) {
          const num = numMatch[1];
          const text = trimmed.replace(/^\d+\.\s*/, '');
          doc.font('Helvetica-Bold').text(`${num}.`, startX, currentY);
          doc.font('Helvetica').text(text, startX + 18, currentY, { width: pageWidth - 18, lineGap: 1 });
        } else {
          doc.text(trimmed, startX, currentY, { width: pageWidth, lineGap: 1 });
        }
        currentY = doc.y + 6;
      });
      
      // Signature section - positioned at bottom with enough space
      currentY = Math.max(currentY + 15, doc.page.height - 100);
      
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      // Signature lines first
      doc.moveTo(startX, currentY).lineTo(startX + 180, currentY).stroke();
      doc.moveTo(centerX + 20, currentY).lineTo(centerX + 200, currentY).stroke();
      
      currentY += 5;
      doc.fontSize(8);
      doc.text(`${profile?.firstName || ''} ${profile?.lastName || ''} – ${company?.name || 'KCS'}`, startX, currentY);
      doc.text(`Agent – ${proposal.clientName}`, centerX + 20, currentY);
      
      currentY += 20;
      
      // Date fields below signatures
      doc.fontSize(9).font('Helvetica');
      doc.text(`Dated: ${today}`, startX, currentY);
      doc.text(`Dated: ${today}`, centerX + 20, currentY);
      
      doc.end();
      
      const pdfBuffer = await pdfComplete;
      
      // Save to object storage
      const pdfPath = await objectStorage.uploadBuffer({
        buffer: pdfBuffer,
        filename: `${proposal.id}.pdf`,
        contentType: 'application/pdf',
        folder: 'proposals',
      });
      
      // Update proposal with PDF path
      await storage.updateProposal(proposal.id, { pdfPath });
      
      // Return PDF as download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Proposal-${proposal.proposalNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating proposal PDF:", error);
      res.status(500).json({ message: "Failed to generate proposal PDF" });
    }
  });

  // View proposal PDF (opens in browser)
  app.get("/api/proposals/:id/pdf/view", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const proposal = await storage.getProposal(req.params.id);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, proposal.companyId, profile);
      
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (!proposal.pdfPath) {
        return res.status(404).json({ message: "PDF not found. Please generate it first." });
      }
      
      // Fetch PDF from object storage
      const pdfBuffer = await objectStorage.downloadBuffer(proposal.pdfPath);
      
      if (!pdfBuffer) {
        return res.status(404).json({ message: "PDF file not found in storage" });
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Proposal-${proposal.proposalNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error viewing proposal PDF:", error);
      res.status(500).json({ message: "Failed to view proposal PDF" });
    }
  });

  // Delete proposal PDF
  app.delete("/api/proposals/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const proposal = await storage.getProposal(req.params.id);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, proposal.companyId, profile);
      
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (!proposal.pdfPath) {
        return res.status(400).json({ message: "No PDF to delete" });
      }
      
      // Clear the pdfPath
      await storage.updateProposal(proposal.id, { pdfPath: null });
      
      res.json({ message: "PDF deleted successfully" });
    } catch (error) {
      console.error("Error deleting proposal PDF:", error);
      res.status(500).json({ message: "Failed to delete proposal PDF" });
    }
  });

  // ========== IOR AGREEMENTS ==========
  
  // Get all IOR agreements for active company
  app.get("/api/ior-agreements", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const agreements = await storage.getIorAgreements(profile.activeCompanyId);
      res.json(agreements);
    } catch (error) {
      console.error("Error fetching IOR agreements:", error);
      res.status(500).json({ message: "Failed to fetch IOR agreements" });
    }
  });

  // Get single IOR agreement
  app.get("/api/ior-agreements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agreement = await storage.getIorAgreement(req.params.id);
      if (!agreement) {
        return res.status(404).json({ message: "IOR agreement not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, agreement.companyId, profile);
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      res.json(agreement);
    } catch (error) {
      console.error("Error fetching IOR agreement:", error);
      res.status(500).json({ message: "Failed to fetch IOR agreement" });
    }
  });

  // Create IOR agreement
  app.post("/api/ior-agreements", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }
      
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const agreementNumber = await storage.getNextIorAgreementNumber(profile.activeCompanyId);
      
      const agreementData = {
        projectId: req.body.projectId,
        inspectorId: req.body.inspectorId,
        agreementDate: req.body.agreementDate,
        clientName: req.body.clientName,
        consultantName: req.body.consultantName,
        agentName: req.body.agentName,
        projectLocation: req.body.projectLocation,
        dsaAppNumber: req.body.dsaAppNumber,
        rate: req.body.rate,
        terms: req.body.terms,
        companyId: profile.activeCompanyId,
        agreementNumber,
      };
      
      const agreement = await storage.createIorAgreement(agreementData);
      
      res.status(201).json(agreement);
    } catch (error) {
      console.error("Error creating IOR agreement:", error);
      res.status(500).json({ message: "Failed to create IOR agreement" });
    }
  });

  // Update IOR agreement
  app.patch("/api/ior-agreements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existingAgreement = await storage.getIorAgreement(req.params.id);
      
      if (!existingAgreement) {
        return res.status(404).json({ message: "IOR agreement not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, existingAgreement.companyId, profile);
      
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const updateData: Record<string, any> = {};
      const allowedFields = ['projectId', 'inspectorId', 'agreementDate', 'clientName', 
        'consultantName', 'agentName', 'projectLocation', 'dsaAppNumber', 'rate', 'terms', 'pdfPath'];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      
      const agreement = await storage.updateIorAgreement(req.params.id, updateData);
      res.json(agreement);
    } catch (error) {
      console.error("Error updating IOR agreement:", error);
      res.status(500).json({ message: "Failed to update IOR agreement" });
    }
  });

  // Delete IOR agreement
  app.delete("/api/ior-agreements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const existingAgreement = await storage.getIorAgreement(req.params.id);
      
      if (!existingAgreement) {
        return res.status(404).json({ message: "IOR agreement not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, existingAgreement.companyId, profile);
      
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      await storage.deleteIorAgreement(req.params.id);
      res.json({ message: "IOR agreement deleted" });
    } catch (error) {
      console.error("Error deleting IOR agreement:", error);
      res.status(500).json({ message: "Failed to delete IOR agreement" });
    }
  });

  // Generate IOR Agreement PDF
  app.post("/api/ior-agreements/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agreement = await storage.getIorAgreement(req.params.id);
      
      if (!agreement) {
        return res.status(404).json({ message: "IOR agreement not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const isCompAdmin = await isEffectiveCompanyAdmin(userId, agreement.companyId, profile);
      
      if (!isCompAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const company = await storage.getCompany(agreement.companyId);
      const project = agreement.project;
      
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      
      const chunks: Buffer[] = [];
      const pdfComplete = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });
      
      const pageWidth = doc.page.width - 100;
      const startX = 50;
      const centerX = doc.page.width / 2;
      
      // Helper to load images - handles both old /storage/uploads/ and new /objects/ paths
      const loadImageBuffer = async (imagePath: string): Promise<Buffer | null> => {
        try {
          // Try object storage first for /objects/ paths
          if (imagePath.startsWith('/objects/')) {
            return await objectStorage.downloadBuffer(imagePath);
          }
          
          // For /storage/uploads/ paths, try object storage with converted path first
          if (imagePath.startsWith('/storage/uploads/')) {
            try {
              // Try to find in object storage under photos folder
              const filename = imagePath.split('/').pop();
              const objectPath = `/objects/photos/${filename}`;
              return await objectStorage.downloadBuffer(objectPath);
            } catch (objErr) {
              // Fall through to try local path
              console.log('Image not found in object storage, trying local:', imagePath);
            }
          }
          
          // Fall back to local filesystem
          const localPath = path.join(process.cwd(), imagePath.replace(/^\//, ''));
          if (fs.existsSync(localPath)) {
            return fs.readFileSync(localPath);
          }
          
          console.log('Image not found locally either:', imagePath);
        } catch (err) {
          console.error('Error loading image:', imagePath, err);
        }
        return null;
      };
      
      // ===== PAGE 1: AGREEMENT =====
      
      // Company logo (matching proposal PDF size)
      if (company?.logoPath) {
        try {
          const logoBuffer = await loadImageBuffer(company.logoPath);
          if (logoBuffer) {
            doc.image(logoBuffer, startX, 15, { width: 230, height: 86, fit: [230, 86] });
          }
        } catch (err) {
          console.error('Error adding company logo:', err);
        }
      }
      
      // Title - positioned below logo (15 + 76 + 12 = 103)
      doc.fontSize(12).font('Helvetica-Bold').text('AGREEMENT FOR PROJECT INSPECTOR SERVICES', startX, 103, { width: pageWidth, align: 'center' });
      
      let currentY = 153;
      
      // Agreement date
      const agreementDate = agreement.agreementDate 
        ? new Date(agreement.agreementDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      // Preamble paragraph
      doc.fontSize(10).font('Helvetica');
      const preamble1 = `Whereas, ${company?.name || 'The Company'}, (The Company) has contracted into agreement with ${agreement.clientName || 'The Client'} (The Client) to provide Project Inspector Services, and whereas ${agreement.consultantName || 'Consultant'} is engaged as an Inspection Services Firm (The Consultant) providing inspection services for various clients.`;
      
      doc.text(preamble1, startX, currentY, { width: pageWidth, lineGap: 2, align: 'justify' });
      currentY = doc.y + 15;
      
      const preamble2 = `Now therefore, this agency agreement is made and entered into at Manhattan Beach, California, this ${agreementDate}, by and between ${company?.name || 'The Company'}, and ${agreement.consultantName || 'Consultant'} (${agreement.agentName || 'Agent'}) to provide project Inspector Consulting Services as brokered through ${company?.name || 'The Company'} for ${agreement.clientName || 'The Client'}, or other existing clients of ${company?.name || 'The Company'}.`;
      
      doc.text(preamble2, startX, currentY, { width: pageWidth, lineGap: 2, align: 'justify' });
      currentY = doc.y + 20;
      
      // Section header
      doc.fontSize(11).font('Helvetica-Bold').text('AGENCY AGREEMENT AND CONTRACT DUTIES:', startX, currentY);
      currentY = doc.y + 15;
      
      // Full contract terms as provided
      const contractTerms = [
        `Consultant agrees to provide continuous Project Inspector / quality assurance consulting services of work for compliance with approved contract documents. Consultant duties are as outlined in Title 24 California Building Code, and as required by current IR regulations of the California Division of the State Architect and as listed in the Master Agreement between the District and ${company?.name || 'The Company'}.`,
        'Represent the Client under the guidance of the designee of the District and the Architect of Record and interface in a professional manner with contractors, construction managers, testing labs, District staff, and other licensed professionals involved with the project.',
        'Attend all planning, pre-construction conference, project meetings, or meetings as required by the Client.',
        'Review project manual and specifications for project inspection requirements and project compliance. Review submittals and materials for project compliance. Review installation of all materials for compliance to contract documents. Assist with scheduling of all Special Inspections performed by the Districts contracted Testing Lab as required by the Testing and Inspections Sheet and as outlined in the Project Specifications. Monitor and log all testing for Torque, Epoxy, Pull Tests and other tests required by the contract documents. Provide all close-out documentation in order to facilitate the timely certification of the project, including all Verified Reports, Testing Documentation, Daily Reports and other important project documentation.',
        `The Consultant, ${agreement.consultantName || 'Consultant'} / ${agreement.agentName || 'Agent'}, and the company, ${company?.name || 'The Company'}, shall each defend and hold harmless each other against any losses, liabilities, damages, injuries, claims, costs, or expenses arising out of, or connected with the provisions of this agreement and the contract documents. Consultant shall be responsible for completing the project for the client. If consultant needs to depart for reasons other than health, a change of address, or reasons not under the Consultant's control, Consultant may be responsible to provide a replacement project inspector, acceptable to the Client and ${company?.name || 'KCS'}. All employees and personnel working for the Consultant shall be covered by the same terms of this agreement, and Consultant personnel must be approved by the client prior to performing any services under the terms of this agreement.`,
        `The Agreement shall begin on, or about, ${agreementDate}, and remain in effect continuously until project closeout, unless terminated in writing. The project location and Client for this work is at ${agreement.clientName || 'The Client'} or other locations as required. Pay rate may be different for other projects, and Consultant shall provide in writing a rate for other projects prior to performing services for other projects. The Consultant or his employees shall not be employed, contract, or engage in business or mutually beneficial relationships, either directly or through an agent, with existing clients of ${company?.name || 'KCS'} for a period of two (2) years after the dissolution of any contracts through ${company?.name || 'The Company'}, unless permission is granted prior to such relationships. ${company?.name || 'KCS'} can use the consultant and projects in RFPs concurrent with the on-going work unless specifically specified by consultant.`,
        `Company and Consultant agree that this is an Agency Agreement and Consultant shall maintain all insurance for the benefit of Consultant, including but not limited to any health insurances, worker's compensation, disability insurances, auto insurances, liability insurances or other insurances as deemed necessary by the Client or Company. Consultant and Company shall not hold either party responsible (nor the District or its agents) for any actions other than gross negligence or fraud. Consultant shall hold harmless the Company, ${agreement.clientName || 'The Client'}, or other ${company?.name || 'KCS'} Clients and its agents, from any claims, liens, lawsuits, or actions. Consultant agrees he is an independent contractor, that prevailing wage laws do not apply to for DSA Project Inspectors or administrative personnel, and that Client is responsible for his own DIR, DOJ Live-scan or other registrations as required by the client. Consultant is liable for payment and filing of his own taxes for all consultant personnel and employees and shall hold the company harmless for any withholdings by any government agency.`,
        'Company agrees to pay Consultant the cost of project services billed at the rate as outlined in the addendum, or other compensation as outlined in writing. Consultants shall have his hours approved in writing by a district representative for time worked in support of the project and shall only be paid for hours approved and paid by the client. Consultant shall provide a time sheet which accurately reflects the amount of time allocated to each project performed by all personnel. Consultant may be required to subscribe to Raken for daily reports at a cost of approximately $15.00/month. Consultant shall provide all necessary cell phones, laptop computers, digital cameras, and equipment, and trade books necessary to maintain proper documentation and administrative functions throughout the duration of the project.',
        `Consultant shall provide to the Company and the Client each month all project documentation by the following methods: All documents must be uploaded daily to the ${company?.name || 'Knowland'} Website Portal. Daily reports, semi-monthly reports, digital weekly photograph reports, and other documentation relevant to the project including close out documentation shall also be maintained on site in professional binders with ${company?.name || 'KCS'} covers. Consultant agrees to upload documents to the ${company?.name || 'KCS'} portal on a daily basis including generating the portal monthly report and to maintain all documentation in a professional and workmanlike manner. ${company?.name || 'KCS'} may withhold payment if documentation is not uploaded and current prior to billing periods. All documentation shall be turned over to the District at the end of the project.`,
        `Overtime shall be billed at a standard rate as outlined in the clients contract with ${company?.name || 'KCS'}. Hours billed for services shall include only hours worked in support of the project and only as approved in advance by the District. Consultant rate shall not be modified unless the District agrees to modify the ${company?.name || 'KCS'} agreement. This Agency Agreement is intended to be a contract for full time work or part-time work for the contract duration. Consultant's time sheet shall be verified & approved by the Client prior to submission to the Company. Company shall pay consultant for all hours billed and approved by the District on the company's behalf.`,
        'Terms and conditions for additional or part-time projects shall be negotiated separately and may be different than the terms for this agreement and shall be in writing. All revisions or adjustments shall be made by an Addendum signed by both parties and attached to this agreement. Addendums supersede the body of the original agreement.',
      ];
      
      doc.fontSize(9).font('Helvetica');
      contractTerms.forEach((term, index) => {
        doc.text(`${index + 1}. ${term}`, startX, currentY, { width: pageWidth, lineGap: 1 });
        currentY = doc.y + 8;
        
        if (currentY > doc.page.height - 100) {
          doc.addPage();
          currentY = 50;
        }
      });
      
      // ===== PAGE 2 or continuation: ADDENDUM =====
      if (currentY > doc.page.height - 250) {
        doc.addPage();
        currentY = 50;
      } else {
        currentY += 30;
      }
      
      doc.fontSize(12).font('Helvetica-Bold').text('ADDENDUM', startX, currentY, { width: pageWidth, align: 'center' });
      currentY = doc.y + 25;
      
      // Addendum details
      const addendumFields = [
        { label: 'Consultant:', value: agreement.consultantName || '' },
        { label: 'District:', value: agreement.clientName || '' },
        { label: 'Project:', value: `${project?.name || ''} ${agreement.dsaAppNumber || ''}` },
        { label: 'Rate:', value: agreement.rate ? `$${agreement.rate} p/hr.` : '' },
        { label: 'Terms:', value: agreement.terms || '' },
      ];
      
      doc.fontSize(10);
      addendumFields.forEach(field => {
        doc.font('Helvetica-Bold').text(field.label, startX + 50, currentY, { continued: true });
        doc.font('Helvetica').text(`  ${field.value}`, { width: pageWidth - 150, lineGap: 2 });
        currentY = doc.y + 8;
      });
      
      // Signature section - ensure all elements stay on the same page
      const signatureBlockHeight = 60;
      if (currentY + signatureBlockHeight > doc.page.height - 50) {
        doc.addPage();
        currentY = 50;
      }
      
      currentY += 40;
      
      doc.moveTo(startX, currentY).lineTo(startX + 180, currentY).stroke();
      doc.moveTo(centerX + 30, currentY).lineTo(centerX + 210, currentY).stroke();
      
      currentY += 5;
      doc.fontSize(9).font('Helvetica');
      doc.text(company?.name || 'Company', startX, currentY);
      doc.text(agreement.consultantName || 'Consultant', centerX + 30, currentY);
      
      currentY += 12;
      doc.text(`${profile?.firstName || ''} ${profile?.lastName || ''} – Agent`, startX, currentY);
      doc.text(agreement.agentName || 'Agent', centerX + 30, currentY);
      
      doc.end();
      
      const pdfBuffer = await pdfComplete;
      
      // Save to object storage
      const pdfPath = await objectStorage.uploadBuffer({
        buffer: pdfBuffer,
        filename: `${agreement.id}.pdf`,
        contentType: 'application/pdf',
        folder: 'ior-agreements',
      });
      
      // Update agreement with PDF path
      await storage.updateIorAgreement(agreement.id, { pdfPath });
      
      // Return PDF as download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="IOR-Agreement-${agreement.agreementNumber || agreement.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating IOR agreement PDF:", error);
      res.status(500).json({ message: "Failed to generate IOR agreement PDF" });
    }
  });

  // ========== REPORTS ==========
  app.get("/api/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // If preferAdminMode is false (inspector toggle ON), show only user's own reports
      // filtered by active company
      if (profile?.preferAdminMode === false) {
        const activeCompanyId = profile?.activeCompanyId;
        
        // Get all user's reports
        const allReports = await storage.getReports({ inspectorId: userId });
        
        // If active company is set, filter reports to only show those from:
        // - Projects in the active company
        // - Personal reports (no project or project has no company)
        if (activeCompanyId) {
          const filteredReports = allReports.filter((report: any) => {
            // Personal report (no project)
            if (!report.projectId) return true;
            // Report's project must be in active company or have no company
            const project = report.project;
            if (!project) return true; // Allow if project data not loaded
            return project.companyId === activeCompanyId || project.companyId === null;
          });
          
          // Recalculate stats for filtered reports
          const filteredStats = {
            total: filteredReports.length,
            drafts: filteredReports.filter((r: any) => r.status === 'draft').length,
            submitted: filteredReports.filter((r: any) => r.status === 'submitted').length,
          };
          
          return res.json({ reports: filteredReports, stats: filteredStats });
        }
        
        const stats = await storage.getReportStats({ inspectorId: userId });
        return res.json({ reports: allReports, stats });
      }
      
      // System admins see ALL reports (when in admin mode)
      if (isEffectiveSystemAdmin(profile)) {
        const reports = await storage.getReports({});
        const stats = await storage.getReportStats({});
        return res.json({ reports, stats });
      }
      
      // Get all companies where user is an admin
      const userCompanyMemberships = await storage.getCompaniesForUser(userId);
      const adminCompanyIds = userCompanyMemberships
        .filter(m => m.role === "admin")
        .map(m => m.companyId);
      
      // Get all user IDs that are members of admin's companies (for personal report visibility)
      const companyMemberUserIds = adminCompanyIds.length > 0 
        ? await storage.getMemberUserIdsForCompanies(adminCompanyIds)
        : [];
      
      // Use optimized query with combined inspector/company filter
      // Also include personal reports from company members
      const options = {
        inspectorId: userId,
        companyIds: adminCompanyIds.length > 0 ? adminCompanyIds : undefined,
        personalReportUserIds: companyMemberUserIds.length > 0 ? companyMemberUserIds : undefined,
      };
      
      const reports = await storage.getReports(options);
      const stats = await storage.getReportStats(options);
      
      res.json({ reports, stats });
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Get the latest report for a project (for pre-filling new report form)
  app.get("/api/projects/:projectId/latest-report", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.projectId;
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Check authorization: user must have access to this project
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // System admins can access any project
      const isSystemAdmin = isEffectiveSystemAdmin(profile);
      
      // Company admins can access projects in their company
      const isCompanyAdmin = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      // Project members can access their projects
      const projectMembers = await storage.getProjectMembers(projectId);
      const isMember = projectMembers.some(m => m.userId === userId);
      
      if (!isSystemAdmin && !isCompanyAdmin && !isMember) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const report = await storage.getLatestReportForProject(projectId);
      
      if (!report) {
        return res.status(404).json({ message: "No previous reports found" });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error fetching latest report:", error);
      res.status(500).json({ message: "Failed to fetch latest report" });
    }
  });

  app.get("/api/reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Report owner can always access their own report
      if (report.inspectorId === userId) {
        return res.json(report);
      }
      
      // System admins can access any report (when in admin mode)
      if (isEffectiveSystemAdmin(profile)) {
        return res.json(report);
      }
      
      // Company admins can access reports in their company (when in admin mode)
      if (report.projectId) {
        const project = await storage.getProject(report.projectId);
        if (project?.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile)) {
          return res.json(report);
        }
        
        // Project team members can access reports for their project
        const isMember = await storage.isUserMemberOfProject(report.projectId, userId);
        if (isMember) {
          return res.json(report);
        }
      }
      
      return res.status(403).json({ message: "Access denied" });
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  app.post("/api/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const validated = createReportSchema.parse(req.body);
      
      // If a project is specified, verify user has access to it
      if (validated.projectId) {
        // In inspector mode or as regular inspector, user must be assigned to project
        const isProjectMember = await storage.isUserMemberOfProject(validated.projectId, userId);
        if (!isEffectiveSystemAdmin(profile) && !isProjectMember) {
          // Check if user is effective company admin for this project's company
          const project = await storage.getProject(validated.projectId);
          const hasCompanyAccess = project?.companyId && 
            await isEffectiveCompanyAdmin(userId, project.companyId, profile);
          
          if (!hasCompanyAccess) {
            return res.status(403).json({ message: "You are not assigned to this project" });
          }
        }
      }
      // If no project is specified, this is a personal/unassigned report - always allowed
      
      const report = await storage.createReport({
        ...validated,
        projectId: validated.projectId || null,
        inspectorId: userId,
      });
      
      res.status(201).json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating report:", error);
      res.status(500).json({ message: "Failed to create report" });
    }
  });

  app.patch("/api/reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const existing = await storage.getReport(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      const validated = updateReportSchema.parse(req.body);
      
      // Permission check (respects inspector mode):
      // - System admins can edit any report (when in admin mode)
      // - Company admins can edit any report in their company (when in admin mode)
      // - Inspectors can only edit their own draft reports
      // - Special case: owners can always assign their unassigned reports to a project
      const isOwner = existing.inspectorId === userId;
      const isAssigningToProject = validated.projectId && !existing.projectId;
      
      // Check if user has effective admin powers for this report
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && existing.projectId) {
        const project = await storage.getProject(existing.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      // Determine if user can edit
      if (hasAdminAccess) {
        // Admins (in admin mode) can edit any report
      } else if (isOwner && existing.status === "draft") {
        // Inspectors can only edit their own drafts
      } else if (isOwner && isAssigningToProject) {
        // Owners can assign their unassigned reports to a project (even if submitted)
        // But they can't edit other fields on submitted reports
        const otherKeys = Object.keys(validated).filter(k => k !== "projectId");
        if (otherKeys.length > 0) {
          return res.status(403).json({ message: "You can only assign a project to submitted reports, not edit other fields." });
        }
      } else {
        return res.status(403).json({ message: "Access denied. Only admins can edit submitted reports." });
      }
      
      // If assigning to a new project, verify user has access to that project
      if (validated.projectId && validated.projectId !== existing.projectId) {
        const isProjectMember = await storage.isUserMemberOfProject(validated.projectId, userId);
        if (!isEffectiveSystemAdmin(profile) && !isProjectMember) {
          const project = await storage.getProject(validated.projectId);
          const hasCompanyAccess = project?.companyId && 
            await isEffectiveCompanyAdmin(userId, project.companyId, profile);
          
          if (!hasCompanyAccess) {
            return res.status(403).json({ message: "You don't have access to the selected project" });
          }
        }
      }
      
      // Assign sequential report number when submitting (status changing from draft to submitted)
      const updateData: any = { ...validated };
      if (validated.status === 'submitted' && existing.status === 'draft' && !existing.reportNumber) {
        updateData.reportNumber = await storage.getNextReportNumber();
      }
      
      const report = await storage.updateReport(req.params.id, updateData);
      res.json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating report:", error);
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  app.delete("/api/reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const existing = await storage.getReport(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Permission check (respects inspector mode):
      // - System admins can delete any report (when in admin mode)
      // - Company admins can delete any report in their company (when in admin mode)
      // - Inspectors can delete their own DRAFT reports only
      const isOwner = existing.inspectorId === userId;
      const isDraft = existing.status === "draft";
      
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && existing.projectId) {
        const project = await storage.getProject(existing.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      // Allow deletion if: admin access OR (owner AND draft)
      const canDelete = hasAdminAccess || (isOwner && isDraft);
      
      if (!canDelete) {
        if (isOwner && !isDraft) {
          return res.status(403).json({ message: "You can only delete your own draft reports. Submitted reports can only be deleted by admins." });
        }
        return res.status(403).json({ message: "Access denied. You can only delete your own draft reports." });
      }
      
      await storage.deleteReport(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting report:", error);
      res.status(500).json({ message: "Failed to delete report" });
    }
  });

  // ========== PHOTOS ==========
  app.post("/api/reports/:id/photos", isAuthenticated, photoUpload.array("photos", 20), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Check ownership or admin
      const existing = await storage.getReport(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check permissions (respects inspector mode): admin or owner
      const isOwner = existing.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && existing.projectId) {
        const project = await storage.getProject(existing.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No photos provided" });
      }

      const createdPhotos = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Handle captions - can come as object or array
        let caption = "";
        if (req.body.captions) {
          if (Array.isArray(req.body.captions)) {
            caption = req.body.captions[i] || "";
          } else if (typeof req.body.captions === "object") {
            caption = req.body.captions[i] || req.body.captions[`${i}`] || "";
          } else if (typeof req.body.captions === "string" && i === 0) {
            caption = req.body.captions;
          }
        }
        
        // Upload to object storage instead of local disk
        const ext = path.extname(file.originalname);
        const filename = `${randomUUID()}${ext}`;
        const objectPath = await objectStorage.uploadBuffer({
          buffer: file.buffer,
          filename,
          contentType: file.mimetype,
          folder: "photos",
        });
        
        const photo = await storage.createPhoto({
          reportId: req.params.id,
          filePath: objectPath,
          caption,
        });
        createdPhotos.push(photo);
      }

      // Invalidate cached PDF — photos have changed so any stored PDF is stale
      await storage.updateReport(req.params.id, { pdfPath: null } as any);

      res.status(201).json(createdPhotos);
    } catch (error) {
      console.error("Error uploading photos:", error);
      res.status(500).json({ message: "Failed to upload photos" });
    }
  });

  app.delete("/api/photos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Get the photo to find its report
      const photo = await storage.getPhoto(req.params.id);
      if (!photo) {
        return res.status(404).json({ message: "Photo not found" });
      }
      
      // Check ownership via the report
      const report = await storage.getReport(photo.reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check permissions (respects inspector mode): admin or owner
      const isOwner = report.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && report.projectId) {
        const project = await storage.getProject(report.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deletePhoto(req.params.id);
      // Invalidate cached PDF — photo removed so any stored PDF is stale
      await storage.updateReport(photo.reportId, { pdfPath: null } as any);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting photo:", error);
      res.status(500).json({ message: "Failed to delete photo" });
    }
  });

  // Update photo caption
  app.patch("/api/photos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const photo = await storage.getPhoto(req.params.id);
      if (!photo) {
        return res.status(404).json({ message: "Photo not found" });
      }
      
      // Check ownership via the report
      const report = await storage.getReport(photo.reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check permissions (respects inspector mode): admin or owner
      const isOwner = report.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && report.projectId) {
        const project = await storage.getProject(report.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { caption } = req.body;
      if (typeof caption !== "string") {
        return res.status(400).json({ message: "Caption must be a string" });
      }
      
      const updatedPhoto = await storage.updatePhotoCaption(req.params.id, caption);
      // Invalidate cached PDF — caption appears in photo page of the PDF
      await storage.updateReport(photo.reportId, { pdfPath: null } as any);
      res.json(updatedPhoto);
    } catch (error) {
      console.error("Error updating photo caption:", error);
      res.status(500).json({ message: "Failed to update photo caption" });
    }
  });

  // ========== SIGNATURE ==========
  app.post("/api/reports/:id/signature", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Check ownership or admin
      const existing = await storage.getReport(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check permissions (respects inspector mode): admin or owner
      const isOwner = existing.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && existing.projectId) {
        const project = await storage.getProject(existing.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { signature } = req.body;
      if (!signature || !signature.startsWith("data:image")) {
        return res.status(400).json({ message: "Invalid signature data" });
      }

      // Extract base64 data
      const base64Data = signature.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      // Upload to object storage for persistence
      const filename = `${req.params.id}.png`;
      const signaturePath = await objectStorage.uploadBuffer({
        buffer,
        filename,
        contentType: "image/png",
        folder: "signatures",
      });

      await storage.updateReport(req.params.id, {
        signaturePath,
        signedAt: new Date(),
      });

      res.json({ signaturePath });
    } catch (error) {
      console.error("Error saving signature:", error);
      res.status(500).json({ message: "Failed to save signature" });
    }
  });

  // ========== PDF GENERATION ==========
  app.post("/api/reports/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check permissions (respects inspector mode): admin or owner
      const isOwner = report.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && report.projectId) {
        const project = await storage.getProject(report.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Fetch photos separately — getReport() does not join photos
      const reportPhotos = await storage.getPhotosByReport(req.params.id);
      if (reportPhotos.length > 0) {
        (report as any).photos = reportPhotos;
      }

      // Generate PDF using pdfkit - DSA/Government format
      const filename = `${req.params.id}.pdf`;

      const doc = new PDFDocument({ size: 'LETTER', margin: 36, bufferPages: true });
      
      const pdfChunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => pdfChunks.push(chunk));
      
      const pdfComplete = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
        doc.on('error', reject);
      });

      const PW = 612; // Letter width in points
      const PH = 792; // Letter height in points
      const ML = 36;  // Left margin
      const MR = 36;  // Right margin
      const MT = 36;  // Top margin
      const MB = 36;  // Bottom margin
      const CW = PW - ML - MR; // Content width = 540
      const FOOTER_H = 20;
      const HEADER_H = 54;
      const checkSize = 7;
      const startX = ML;

      // Helper to load images - handles both old /storage/uploads/ and new /objects/ paths
      const loadImageBuffer = async (imagePath: string): Promise<Buffer | null> => {
        try {
          // Try object storage first for /objects/ paths
          if (imagePath.startsWith('/objects/')) {
            return await objectStorage.downloadBuffer(imagePath);
          }
          
          // For /storage/uploads/ paths, try object storage with converted path first
          if (imagePath.startsWith('/storage/uploads/')) {
            try {
              // Try to find in object storage under photos folder
              const filename = imagePath.split('/').pop();
              const objectPath = `/objects/photos/${filename}`;
              return await objectStorage.downloadBuffer(objectPath);
            } catch (objErr) {
              // Fall through to try local path
              console.log('Image not found in object storage, trying local:', imagePath);
            }
          }
          
          // Fall back to local filesystem
          const localPath = path.join(process.cwd(), imagePath.replace(/^\//, ''));
          if (fs.existsSync(localPath)) {
            return fs.readFileSync(localPath);
          }
          
          console.log('Image not found locally either:', imagePath);
        } catch (err) {
          console.error('Error loading image:', imagePath, err);
        }
        return null;
      };

      // Get company and inspector profile info
      let company: any = null;
      if (report.project?.companyId) {
        company = await storage.getCompany(report.project.companyId);
      }
      
      // Get inspector profile for license info
      const inspectorProfile = await storage.getUserProfile(report.inspectorId);

      // ===== HELPERS =====
      const formatTimeDisplay = (time: string | null | undefined): string => {
        if (!time) return '--';
        const [h, m] = time.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return '--';
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
      };

      const drawCell = (x: number, y: number, w: number, h: number, label: string, value: string, labelFontSize = 6, valueFontSize = 8.5) => {
        doc.rect(x, y, w, h).stroke();
        doc.fontSize(labelFontSize).font('Helvetica').fillColor('#555').text(label.toUpperCase(), x + 3, y + 3, { width: w - 6, lineBreak: false });
        doc.fontSize(valueFontSize).font('Helvetica-Bold').fillColor('#000').text(value || '--', x + 3, y + 3 + labelFontSize + 2, { width: w - 6, lineBreak: false, ellipsis: true });
      };

      const drawSectionHeader = (x: number, y: number, w: number, label: string) => {
        doc.rect(x, y, w, 14).fillAndStroke('#1a2e4a', '#1a2e4a');
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff').text(label, x + 4, y + 3.5, { width: w - 8, lineBreak: false });
        doc.fillColor('#000');
      };

      let dateStr = '--';
      if (report.date instanceof Date) {
        const m = String(report.date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(report.date.getUTCDate()).padStart(2, '0');
        const y = String(report.date.getUTCFullYear());
        dateStr = `${m}/${d}/${y}`;
      } else if (typeof report.date === 'string') {
        const match = report.date.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          dateStr = `${match[2]}/${match[3]}/${match[1]}`;
        }
      }

      const companyName = (company?.name || 'FIELD DAILY REPORTS').toUpperCase();
      const contactLine = [company?.address, company?.phone, company?.email].filter(Boolean).join('   |   ');
      const projectName = report.project?.name || report.customProjectName || 'Unassigned Report';
      const projectAddress = report.project?.address || '';
      const inspectorName = report.inspectorName || 'Unknown';
      const clientName = report.project?.client || '';
      const dsaFileNo = report.project?.dsaFileNo || '';
      const projectNumber = report.project?.projectNumber || '';
      const reportNumber = report.reportNumber ? `${report.reportNumber}` : '--';

      const photos = report.photos || [];
      const workActivities = (report.workActivities as WorkActivityRow[]) || [];
      const equipmentRows = (report.equipmentRows as EquipmentRow[] | null) || [];
      const materialRows = (report.materialRows as MaterialRow[] | null) || [];
      const visitors = (report.visitors as VisitorRow[]) || [];

      // ===== PDF REDESIGN — matches reference PDF layout =====

      // ─── Color / dimension constants ────────────────────────────────────
      const NAVY    = '#1a2e4a';
      const ROWCOLS = ['#ffffff', '#e8f4fc'] as const;
      const getRowBg = (i: number) => ROWCOLS[i % 2];

      // ─── Helpers ────────────────────────────────────────────────────────

      /** Navy bar with white bold text */
      const drawSectionHdr = (y: number, label: string) => {
        doc.rect(ML, y, CW, 13).fill(NAVY);
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#fff')
          .text(label, ML + 4, y + 2.5, { lineBreak: false });
        doc.fillColor('#000');
      };

      /** Navy bar with white small-caps column labels */
      const drawColHeaders = (y: number, hdrH: number, cols: Array<{ x: number; w: number; label: string }>) => {
        doc.rect(ML, y, CW, hdrH).fill(NAVY);
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#fff');
        for (const c of cols) {
          doc.text(c.label, c.x + 4, y + (hdrH - 6.5) / 2, { width: c.w - 8, lineBreak: false });
        }
        doc.fillColor('#000');
      };

      /** Small label on top, bold value below */
      const drawInfoCell = (x: number, y: number, w: number, h: number, label: string, value: string) => {
        doc.rect(x, y, w, h).stroke('#cccccc');
        doc.fontSize(6).font('Helvetica').fillColor('#666')
          .text(label.toUpperCase(), x + 4, y + 3, { width: w - 8, lineBreak: false });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(NAVY)
          .text(value || '--', x + 4, y + 12, { width: w - 8, lineBreak: false, ellipsis: true });
        doc.fillColor('#000');
      };

      /** Coloured pill badge for equipment / material status */
      const drawStatusBadge = (x: number, y: number, colW: number, rowH: number, status: string) => {
        const s = (status || '').toUpperCase();
        let bg = '#6b7280';
        if (['ACTIVE', 'DELIVERED', 'COMPLETE', 'APPROVED', 'FINAL'].includes(s)) bg = '#16a34a';
        else if (['STANDBY', 'ORDERED', 'PENDING', 'SUBMITTED'].includes(s)) bg = '#d97706';
        else if (['DELAYED', 'REJECTED', 'FAILED', 'ON HOLD'].includes(s)) bg = '#dc2626';
        const bw = Math.min(colW - 10, 58), bh = 10;
        const bx = x + (colW - bw) / 2, by = y + (rowH - bh) / 2;
        doc.rect(bx, by, bw, bh).fill(bg);
        doc.fontSize(6).font('Helvetica-Bold').fillColor('#fff')
          .text(s || '--', bx, by + 2, { width: bw, align: 'center', lineBreak: false });
        doc.fillColor('#000');
      };

      // ─── Derived values ──────────────────────────────────────────────────
      const knowlandLogoPath = 'attached_assets/trans_logo_1774663108517.png';
      let headerLogoBuffer: Buffer | null = null;
      try {
        const localLogoPath = path.join(process.cwd(), knowlandLogoPath);
        if (fs.existsSync(localLogoPath)) {
          headerLogoBuffer = fs.readFileSync(localLogoPath);
        }
      } catch (err) {
        console.error('Error loading Knowland logo:', err);
      }
      if (!headerLogoBuffer && company?.logoPath) {
        headerLogoBuffer = await loadImageBuffer(company.logoPath);
      }

      // ─── Long-form report date (e.g. "Thursday, February 20, 2025") ─────
      const reportLongDate = (() => {
        let d: Date | null = null;
        if (report.date instanceof Date) d = report.date;
        else if (typeof report.date === 'string') d = new Date((report.date as string) + 'T12:00:00Z');
        if (!d) return dateStr;
        return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      })();

      const typeOfWork: string[] = Array.isArray(report.typeOfWork) ? (report.typeOfWork as string[]) : [];
      const workPerformedText = (report.workPerformed as string) || '';
      const inspectionsText   = (report.inspections   as string) || '';

      let curY = MT;

      // ══════════════════════════════════════════════════════════════════
      // PAGE 1
      // ══════════════════════════════════════════════════════════════════

      // ─── HEADER ──────────────────────────────────────────────────────
      // Logo (left, 60 px tall)
      if (headerLogoBuffer) {
        doc.image(headerLogoBuffer, ML, MT, { fit: [130, 45], valign: 'center', align: 'left' });
      }

      // Centre block: "DAILY REPORT" title + report ID
      const ctrX = ML + 185;
      const ctrW = CW - 185 - 165;
      const rptIdLabel = report.reportNumber ? `DR-${report.reportNumber}` : '--';
      doc.fontSize(18).font('Helvetica-Bold').fillColor(NAVY)
        .text('DAILY REPORT', ctrX, MT + 4, { width: ctrW, align: 'center', lineBreak: false });
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(NAVY)
        .text(rptIdLabel, ctrX, MT + 27, { width: ctrW, align: 'center', lineBreak: false });

      // Right block: company name + address + contact
      const rblkX = PW - MR - 160;
      const orgName = company?.name || 'KNOWLAND CONSTRUCTION SERVICES';
      const orgPhone = (company as any)?.phone || '';
      const orgEmail = (company as any)?.email || '';
      const orgAddr  = (company as any)?.address || '';
      doc.fontSize(9).font('Helvetica-Bold').fillColor(NAVY)
        .text(orgName, rblkX, MT + 4, { width: 160, align: 'right', lineBreak: false });
      if (orgAddr) {
        doc.fontSize(7.5).font('Helvetica').fillColor('#555')
          .text(orgAddr, rblkX, MT + 18, { width: 160, align: 'right', lineBreak: false });
      }
      if (orgPhone || orgEmail) {
        doc.fontSize(7.5).font('Helvetica').fillColor('#555')
          .text([orgPhone, orgEmail].filter(Boolean).join('  •  '), rblkX, MT + 30, { width: 160, align: 'right', lineBreak: false });
      }
      doc.fillColor('#000');

      // Thin navy separator below header
      curY = MT + 65;
      doc.rect(ML, curY, CW, 1).fill(NAVY);
      curY += 4;

      // ─── REPORT DETAILS (wraps project info + report line + inspector row) ─
      drawSectionHdr(curY, 'REPORT DETAILS');
      curY += 13;

      // Project info row
      const piH = 30;
      const piW = [CW * 0.40, CW * 0.18, CW * 0.18, 0];
      piW[3] = CW - piW[0] - piW[1] - piW[2];
      const piX = [ML, ML + piW[0], ML + piW[0] + piW[1], ML + piW[0] + piW[1] + piW[2]];
      drawInfoCell(piX[0], curY, piW[0], piH, 'PROJECT', projectName);
      drawInfoCell(piX[1], curY, piW[1], piH, 'PROJECT NO.', projectNumber);
      drawInfoCell(piX[2], curY, piW[2], piH, 'DSA FILE NO.', dsaFileNo);
      drawInfoCell(piX[3], curY, piW[3], piH, 'REPORT DATE', reportLongDate);
      curY += piH;

      // Report line + status badge
      const rlH = 18;
      doc.rect(ML, curY, CW, rlH).fill('#f1f5f9');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(NAVY)
        .text(`Daily Construction Report — Report #${report.reportNumber || '--'}`, ML + 6, curY + (rlH - 8.5) / 2, { lineBreak: false });
      const stText = (report.status || 'DRAFT').toUpperCase();
      const stColors: Record<string, string> = { SUBMITTED: NAVY, APPROVED: '#16a34a', FINAL: '#16a34a', DRAFT: '#6b7280' };
      const stBg = stColors[stText] || '#6b7280';
      const stW = 60, stH = 12, stX = ML + CW - stW - 6, stY = curY + (rlH - stH) / 2;
      doc.rect(stX, stY, stW, stH).fill(stBg);
      doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#fff')
        .text(stText, stX, stY + 2.5, { width: stW, align: 'center', lineBreak: false });
      doc.fillColor('#000');
      curY += rlH + 4;
      const rdH = 28;
      const rdW = [CW * 0.34, CW * 0.24, CW * 0.21, 0];
      rdW[3] = CW - rdW[0] - rdW[1] - rdW[2];
      const rdX = [ML, ML + rdW[0], ML + rdW[0] + rdW[1], ML + rdW[0] + rdW[1] + rdW[2]];
      const inspTitle = (inspectorProfile as any)?.title || '';
      drawInfoCell(rdX[0], curY, rdW[0], rdH, 'PREPARED BY', inspectorName + (inspTitle ? ', ' + inspTitle : ''));
      drawInfoCell(rdX[1], curY, rdW[1], rdH, 'ORGANIZATION', company?.name || '--');
      drawInfoCell(rdX[2], curY, rdW[2], rdH, 'WORK START', formatTimeDisplay(report.timeIn  as string));
      drawInfoCell(rdX[3], curY, rdW[3], rdH, 'WORK END',   formatTimeDisplay(report.timeOut as string));
      curY += rdH + 8;

      // ─── WEATHER CONDITIONS ───────────────────────────────────────────
      drawSectionHdr(curY, 'WEATHER CONDITIONS');
      curY += 13;
      const wH = 28;
      const wW = [CW * 0.28, CW * 0.28, CW * 0.16, 0];
      wW[3] = CW - wW[0] - wW[1] - wW[2];
      const wX = [ML, ML + wW[0], ML + wW[0] + wW[1], ML + wW[0] + wW[1] + wW[2]];
      drawInfoCell(wX[0], curY, wW[0], wH, 'MORNING (AM)',    (report.weatherAM       as string) || '--');
      drawInfoCell(wX[1], curY, wW[1], wH, 'AFTERNOON (PM)',  (report.weatherPM       as string) || '--');
      drawInfoCell(wX[2], curY, wW[2], wH, 'PRECIPITATION',   (report.precipitation   as string) || '--');
      drawInfoCell(wX[3], curY, wW[3], wH, 'SITE CONDITIONS', (report.siteConditions  as string) || '--');
      curY += wH + 8;

      // ─── TYPE OF WORK ─────────────────────────────────────────────────
      const TOW_LABELS: Record<string, string> = {
        reinf_concrete:  'Reinf. Concrete',
        structural_steel: 'Structural Steel',
        reinf_masonry:   'Reinf. Masonry',
        fire_proofing:   'Fire Proofing',
        shotcrete:       'Shotcrete',
        anchors:         'Anchors',
        other:           'Other',
      };
      const TOW_ORDER = ['reinf_concrete', 'structural_steel', 'reinf_masonry', 'fire_proofing', 'shotcrete', 'anchors', 'other'];
      drawSectionHdr(curY, 'TYPE OF WORK');
      curY += 13;
      const towRowH = 20;
      const towItemW = CW / TOW_ORDER.length;
      // Background row
      doc.rect(ML, curY, CW, towRowH).fillAndStroke('#f8fafc', '#cccccc');
      TOW_ORDER.forEach((key, i) => {
        const checked = typeOfWork.includes(key);
        const ix = ML + i * towItemW;
        const boxSize = 8;
        const boxX = ix + 5;
        const boxY = curY + (towRowH - boxSize) / 2;
        if (checked) {
          // Solid navy filled square
          doc.rect(boxX, boxY, boxSize, boxSize).fill(NAVY);
          // Draw white checkmark as vector path
          doc.save()
            .moveTo(boxX + 1.5, boxY + boxSize * 0.55)
            .lineTo(boxX + boxSize * 0.38, boxY + boxSize - 2)
            .lineTo(boxX + boxSize - 1.5, boxY + 1.5)
            .lineWidth(1.5)
            .strokeColor('#ffffff')
            .stroke()
            .restore();
        } else {
          // Empty outlined square
          doc.rect(boxX, boxY, boxSize, boxSize).fillAndStroke('#ffffff', '#999999');
        }
        // Reset fill color before text
        doc.fillColor(checked ? NAVY : '#555555');
        doc.fontSize(6.5).font(checked ? 'Helvetica-Bold' : 'Helvetica')
          .text(TOW_LABELS[key] || key, ix + 16, curY + (towRowH - 7) / 2, { width: towItemW - 18, lineBreak: false });
      });
      doc.fillColor('#000000');
      curY += towRowH + 8;

      // ─── WORKFORCE ────────────────────────────────────────────────────
      const totalWorkers = workActivities.reduce((s, r) => s + (Number(r.headcount) || 0), 0);
      drawSectionHdr(curY, `WORKFORCE${totalWorkers > 0 ? ` (${totalWorkers} WORKERS ON-SITE)` : ''}`);
      curY += 13;

      const waMinRowH = 16, waHdrH = 12;
      const waW = [CW * 0.24, CW * 0.08, CW * 0.22, 0];
      waW[3] = CW - waW[0] - waW[1] - waW[2];
      const waX = [ML, ML + waW[0], ML + waW[0] + waW[1], ML + waW[0] + waW[1] + waW[2]];
      drawColHeaders(curY, waHdrH, [
        { x: waX[0], w: waW[0], label: 'TRADE' },
        { x: waX[1], w: waW[1], label: 'COUNT' },
        { x: waX[2], w: waW[2], label: 'CONTRACTOR' },
        { x: waX[3], w: waW[3], label: 'WORK DESCRIPTION' },
      ]);
      curY += waHdrH;

      // Allow workforce table to use all available page space before Safety
      const safetyBlockH = 13 + 26 + 26 + 4;
      const waAvailH = PH - MB - FOOTER_H - curY - safetyBlockH - 20;

      // Pre-calculate dynamic row heights (description column wraps; others truncate)
      const waDescW = waW[3] - 8;
      const waRowHeights: number[] = [];
      let waTotalH = 0;
      for (const row of workActivities) {
        const desc = row.workDescription || '';
        const measuredH = desc ? doc.fontSize(8).heightOfString(desc, { width: waDescW }) : 8;
        const rowH = Math.max(waMinRowH, measuredH + 8);
        if (waTotalH + rowH > waAvailH && waRowHeights.length > 0) break;
        waRowHeights.push(rowH);
        waTotalH += rowH;
      }

      workActivities.slice(0, waRowHeights.length).forEach((row, idx) => {
        const rowH = waRowHeights[idx];
        doc.rect(ML, curY, CW, rowH).fill(getRowBg(idx));
        doc.rect(ML, curY, CW, rowH).stroke('#cccccc');
        const ty = curY + (rowH - 8) / 2;
        doc.fontSize(8).font('Helvetica').fillColor(NAVY);
        doc.text(row.trade       || '--', waX[0] + 4, ty, { width: waW[0] - 8, lineBreak: false, ellipsis: true });
        doc.text(String(row.headcount || ''), waX[1] + 4, ty, { width: waW[1] - 8, lineBreak: false });
        doc.text(row.contractor  || '--', waX[2] + 4, ty, { width: waW[2] - 8, lineBreak: false, ellipsis: true });
        // Description wraps to as many lines as needed
        doc.text(row.workDescription || '--', waX[3] + 4, curY + 4, { width: waDescW, lineBreak: true });
        curY += rowH;
      });

      // TOTAL ON-SITE row (navy)
      if (workActivities.length > 0) {
        doc.rect(ML, curY, CW, waMinRowH).fill(NAVY);
        const ty = curY + (waMinRowH - 8) / 2;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
        doc.text('TOTAL ON-SITE', waX[0] + 4, ty, { width: waW[0] - 8, lineBreak: false });
        doc.text(String(totalWorkers), waX[1] + 4, ty, { width: waW[1] - 8, lineBreak: false });
        doc.fillColor('#000');
        curY += waMinRowH;
      }
      curY += 8;

      // ─── WORK PERFORMED & INSPECTIONS ─────────────────────────────────
      // Measure natural heights — no artificial caps
      const measureSection = (text: string) =>
        text?.trim()
          ? Math.max(20, doc.fontSize(8).heightOfString(text, { width: CW - 12 }) + 10)
          : 20;

      const wpNaturalH   = measureSection(workPerformedText);
      const inspNaturalH = measureSection(inspectionsText);

      const PAGE_BOTTOM = PH - MB - FOOTER_H;

      // Compact continuation header for overflow pages
      const drawContHeader = (suffix: string) => {
        const chH = 20;
        doc.rect(ML, curY, CW, chH).fill('#f1f5f9');
        doc.rect(ML, curY, CW, chH).stroke('#cccccc');
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(NAVY)
          .text(
            [company?.name || 'KNOWLAND CONSTRUCTION SERVICES', '—', projectName, rptIdLabel, suffix].join('   '),
            ML + 6, curY + (chH - 7.5) / 2, { width: CW - 12, lineBreak: false, ellipsis: true }
          );
        doc.fillColor('#000');
        curY += chH + 4;
      };

      // Render a text section at its natural height with no clipping.
      // If the full block won't fit on the current page, start a new page first.
      const drawTextSection = (label: string, text: string, contentH: number) => {
        const blockH = 13 + contentH + 8; // header + box + gap
        if (curY + blockH > PAGE_BOTTOM) {
          doc.addPage();
          curY = MT;
          drawContHeader(`— ${label}`);
        }
        drawSectionHdr(curY, label);
        curY += 13;
        const hasText = text && text.trim().length > 0;
        doc.rect(ML, curY, CW, contentH).fill('#fff');
        doc.rect(ML, curY, CW, contentH).stroke('#cccccc');
        doc.fontSize(8).font('Helvetica').fillColor(hasText ? NAVY : '#aaaaaa')
          .text(hasText ? text : '--', ML + 6, curY + 4, { width: CW - 12 });
        curY += contentH + 8;
      };

      drawTextSection('WORK PERFORMED', workPerformedText, wpNaturalH);
      drawTextSection('INSPECTIONS',    inspectionsText,   inspNaturalH);

      // ─── SAFETY ───────────────────────────────────────────────────────
      // If Safety no longer fits on this page, start a fresh page for it
      if (curY + safetyBlockH > PAGE_BOTTOM) {
        doc.addPage();
        curY = MT;
        drawContHeader('— Safety');
      }
      drawSectionHdr(curY, 'SAFETY');
      curY += 13;
      const sfH = 26;
      // Row 1: INCIDENTS | NEAR MISSES | TOOLBOX TALK TOPIC (wide)
      const sfW1 = [CW * 0.16, CW * 0.16, 0];
      sfW1[2] = CW - sfW1[0] - sfW1[1];
      const sfX1 = [ML, ML + sfW1[0], ML + sfW1[0] + sfW1[1]];
      drawInfoCell(sfX1[0], curY, sfW1[0], sfH, 'INCIDENTS',    String(report.safetyIncidents  ?? '0'));
      drawInfoCell(sfX1[1], curY, sfW1[1], sfH, 'NEAR MISSES',  String(report.safetyNearMisses ?? '0'));
      drawInfoCell(sfX1[2], curY, sfW1[2], sfH, 'TOOLBOX TALK TOPIC', (report.toolboxTalkTopic as string) || '--');
      curY += sfH;
      // Row 2: ATTENDEES | SITE SAFETY CONDITIONS
      const sfW2 = [CW * 0.16, 0];
      sfW2[1] = CW - sfW2[0];
      const sfX2 = [ML, ML + sfW2[0]];
      drawInfoCell(sfX2[0], curY, sfW2[0], sfH, 'ATTENDEES',           String(report.safetyAttendees ?? '--'));
      drawInfoCell(sfX2[1], curY, sfW2[1], sfH, 'SITE SAFETY CONDITIONS', (report.safetySiteConditions as string) || '--');
      curY += sfH;
      curY += 12;

      // ─── EQUIPMENT ON SITE ────────────────────────────────────────────
      const eqRowH = 15, eqHdrH = 12;
      const eqW = [CW * 0.37, CW * 0.12, CW * 0.16, 0];
      eqW[3] = CW - eqW[0] - eqW[1] - eqW[2];
      const eqX = [ML, ML + eqW[0], ML + eqW[0] + eqW[1], ML + eqW[0] + eqW[1] + eqW[2]];
      // Page break: need room for section header + column header + at least one row
      if (curY + 13 + eqHdrH + eqRowH > PAGE_BOTTOM) {
        doc.addPage(); curY = MT; drawContHeader('— Equipment');
      }
      drawSectionHdr(curY, 'EQUIPMENT ON SITE');
      curY += 13;
      drawColHeaders(curY, eqHdrH, [
        { x: eqX[0], w: eqW[0], label: 'EQUIPMENT' },
        { x: eqX[1], w: eqW[1], label: 'HOURS' },
        { x: eqX[2], w: eqW[2], label: 'STATUS' },
        { x: eqX[3], w: eqW[3], label: 'USAGE' },
      ]);
      curY += eqHdrH;
      if (equipmentRows.length === 0) {
        if (curY + eqRowH > PAGE_BOTTOM) { doc.addPage(); curY = MT; drawContHeader('— Equipment'); }
        doc.rect(ML, curY, CW, eqRowH).fill('#fff').stroke('#cccccc');
        doc.fontSize(7.5).font('Helvetica').fillColor('#888')
          .text('No equipment recorded.', ML + 6, curY + (eqRowH - 7.5) / 2, { lineBreak: false });
        curY += eqRowH;
      } else {
        let eqColorIdx = 0;
        equipmentRows.forEach((row) => {
          if (curY + eqRowH > PAGE_BOTTOM) {
            doc.addPage(); curY = MT; drawContHeader('— Equipment (cont.)');
            drawColHeaders(curY, eqHdrH, [
              { x: eqX[0], w: eqW[0], label: 'EQUIPMENT' },
              { x: eqX[1], w: eqW[1], label: 'HOURS' },
              { x: eqX[2], w: eqW[2], label: 'STATUS' },
              { x: eqX[3], w: eqW[3], label: 'USAGE' },
            ]);
            curY += eqHdrH;
            eqColorIdx = 0;
          }
          doc.rect(ML, curY, CW, eqRowH).fill(getRowBg(eqColorIdx)).stroke('#cccccc');
          const ty = curY + (eqRowH - 8) / 2;
          doc.fontSize(8).font('Helvetica').fillColor(NAVY);
          doc.text(row.equipment || '--', eqX[0] + 4, ty, { width: eqW[0] - 8, lineBreak: false, ellipsis: true });
          doc.text(row.hours || '--',     eqX[1] + 4, ty, { width: eqW[1] - 8, lineBreak: false });
          drawStatusBadge(eqX[2], curY, eqW[2], eqRowH, row.status || '');
          doc.fontSize(8).font('Helvetica').fillColor(NAVY);
          doc.text(row.usage || '--',     eqX[3] + 4, ty, { width: eqW[3] - 8, lineBreak: false, ellipsis: true });
          curY += eqRowH;
          eqColorIdx++;
        });
      }
      curY += 4;

      // ─── MATERIAL DELIVERIES & ISSUES ─────────────────────────────────
      const mtRowH = 15, mtHdrH = 12;
      const mtW = [CW * 0.32, CW * 0.12, CW * 0.16, 0];
      mtW[3] = CW - mtW[0] - mtW[1] - mtW[2];
      const mtX = [ML, ML + mtW[0], ML + mtW[0] + mtW[1], ML + mtW[0] + mtW[1] + mtW[2]];
      // Page break: need room for section header + column header + at least one row
      if (curY + 13 + mtHdrH + mtRowH > PAGE_BOTTOM) {
        doc.addPage(); curY = MT; drawContHeader('— Materials');
      }
      drawSectionHdr(curY, 'MATERIAL DELIVERIES & ISSUES');
      curY += 13;
      drawColHeaders(curY, mtHdrH, [
        { x: mtX[0], w: mtW[0], label: 'MATERIAL' },
        { x: mtX[1], w: mtW[1], label: 'QTY' },
        { x: mtX[2], w: mtW[2], label: 'STATUS' },
        { x: mtX[3], w: mtW[3], label: 'SUPPLIER / NOTES' },
      ]);
      curY += mtHdrH;
      if (materialRows.length === 0) {
        if (curY + mtRowH > PAGE_BOTTOM) { doc.addPage(); curY = MT; drawContHeader('— Materials'); }
        doc.rect(ML, curY, CW, mtRowH).fill('#fff').stroke('#cccccc');
        doc.fontSize(7.5).font('Helvetica').fillColor('#888')
          .text('No material deliveries recorded.', ML + 6, curY + (mtRowH - 7.5) / 2, { lineBreak: false });
        curY += mtRowH;
      } else {
        let mtColorIdx = 0;
        materialRows.forEach((row) => {
          if (curY + mtRowH > PAGE_BOTTOM) {
            doc.addPage(); curY = MT; drawContHeader('— Materials (cont.)');
            drawColHeaders(curY, mtHdrH, [
              { x: mtX[0], w: mtW[0], label: 'MATERIAL' },
              { x: mtX[1], w: mtW[1], label: 'QTY' },
              { x: mtX[2], w: mtW[2], label: 'STATUS' },
              { x: mtX[3], w: mtW[3], label: 'SUPPLIER / NOTES' },
            ]);
            curY += mtHdrH;
            mtColorIdx = 0;
          }
          doc.rect(ML, curY, CW, mtRowH).fill(getRowBg(mtColorIdx)).stroke('#cccccc');
          const ty = curY + (mtRowH - 8) / 2;
          doc.fontSize(8).font('Helvetica').fillColor(NAVY);
          doc.text(row.material     || '--', mtX[0] + 4, ty, { width: mtW[0] - 8, lineBreak: false, ellipsis: true });
          doc.text(row.quantity     || '--', mtX[1] + 4, ty, { width: mtW[1] - 8, lineBreak: false });
          drawStatusBadge(mtX[2], curY, mtW[2], mtRowH, row.status || '');
          doc.fontSize(8).font('Helvetica').fillColor(NAVY);
          doc.text(row.supplierNotes || '--', mtX[3] + 4, ty, { width: mtW[3] - 8, lineBreak: false, ellipsis: true });
          curY += mtRowH;
          mtColorIdx++;
        });
      }
      curY += 4;

      // ─── VISITORS ─────────────────────────────────────────────────────
      const visLines: string[] = visitors.length > 0
        ? visitors.map(v => {
            let l = v.name;
            if (v.company) l += ` (${v.company})`;
            if (v.notes)   l += ` — ${v.notes}`;
            return l;
          })
        : ['No visitors recorded.'];
      const visH2 = Math.min(50, visLines.length * 13 + 10);
      if (curY + 13 + visH2 + 4 > PAGE_BOTTOM) {
        doc.addPage(); curY = MT; drawContHeader('— Visitors');
      }
      drawSectionHdr(curY, 'VISITORS');
      curY += 13;
      doc.rect(ML, curY, CW, visH2).fill('#fff').stroke('#cccccc');
      doc.fontSize(8).font('Helvetica').fillColor(NAVY)
        .text(visLines.join('\n'), ML + 6, curY + 5, { width: CW - 12, height: visH2 - 8 });
      curY += visH2 + 4;

      // ─── SUPERINTENDENT NOTES & REMARKS ───────────────────────────────
      const notesText2 = (report.notes as string) || '--';
      const notesEstH  = Math.min(90, Math.max(32, notesText2.split('\n').length * 13 + 12));
      if (curY + 13 + notesEstH + 4 > PAGE_BOTTOM) {
        doc.addPage(); curY = MT; drawContHeader('— Notes');
      }
      drawSectionHdr(curY, 'SUPERINTENDENT NOTES & REMARKS');
      curY += 13;
      doc.rect(ML, curY, CW, notesEstH).fill('#fff').stroke('#cccccc');
      doc.fontSize(8).font('Helvetica').fillColor(NAVY)
        .text(notesText2, ML + 6, curY + 5, { width: CW - 12, height: notesEstH - 8 });
      curY += notesEstH + 4;

      // ─── CERTIFICATION & SIGNATURE ────────────────────────────────────
      // certSigH must be tall enough to contain label (y+4), name (y+15),
      // title (y+27), and date (y+42) comfortably — so certBlockH ≥ 90.
      const certBlockH = 90;
      if (curY + certBlockH > PH - MB - FOOTER_H) {
        // Not enough room — start a fresh page rather than clamping into
        // the content above.
        doc.addPage();
        drawContHeader('(continued)');
        curY = MT + 18;
      }
      drawSectionHdr(curY, 'CERTIFICATION & SIGNATURE');
      curY += 13;
      const certBodyH = certBlockH - 13;
      const certColW  = CW / 2;
      const certText2 = 'I certify that this report accurately reflects the work performed, workforce, materials, equipment, and conditions observed on-site for the date indicated above.';
      const certTxtH2 = 22;
      doc.rect(ML, curY, CW, certTxtH2).fill('#f8fafc').stroke('#cccccc');
      doc.fontSize(6.5).font('Helvetica').fillColor('#444')
        .text(certText2, ML + 6, curY + 6, { width: CW - 12, lineBreak: false, ellipsis: true });
      curY += certTxtH2;
      const certSigH = certBodyH - certTxtH2; // 90-13-22 = 55 px
      // Prepared By box — name/title/date on left, signature image on right
      doc.rect(ML, curY, certColW, certSigH).stroke('#cccccc');
      doc.fontSize(6).font('Helvetica').fillColor('#666').text('PREPARED BY', ML + 4, curY + 4, { lineBreak: false });
      const pbTextW = Math.floor(certColW * 0.44);  // left column for text
      const pbSigX  = ML + pbTextW + 4;             // right column for signature
      const pbSigW  = certColW - pbTextW - 8;
      // Text: name (y+15), title (y+27), date (y+42) — all inside 55 px box
      doc.fontSize(9).font('Helvetica-Bold').fillColor(NAVY)
        .text(inspectorName, ML + 4, curY + 15, { width: pbTextW - 6, lineBreak: false, ellipsis: true });
      if ((inspectorProfile as any)?.title) {
        doc.fontSize(7.5).font('Helvetica').fillColor('#555')
          .text((inspectorProfile as any).title, ML + 4, curY + 27, { width: pbTextW - 6, lineBreak: false, ellipsis: true });
      }
      doc.fontSize(7.5).font('Helvetica').fillColor('#555')
        .text(`Date: ${dateStr}`, ML + 4, curY + 42, { width: pbTextW - 6, lineBreak: false });
      // Signature image — right column, vertically centred
      if (report.signaturePath) {
        try {
          const sigBuf2 = await loadImageBuffer(report.signaturePath as string);
          if (sigBuf2) {
            doc.image(sigBuf2, pbSigX, curY + 4, { fit: [pbSigW, certSigH - 8], align: 'center', valign: 'center' });
          }
        } catch (_se) {}
      }
      // Reviewed By box
      const rvX3 = ML + certColW;
      doc.rect(rvX3, curY, certColW, certSigH).stroke('#cccccc');
      doc.fontSize(6).font('Helvetica').fillColor('#666').text('REVIEWED BY', rvX3 + 4, curY + 4, { lineBreak: false });
      doc.moveTo(rvX3 + 8, curY + certSigH - 14).lineTo(rvX3 + certColW - 8, curY + certSigH - 14).stroke('#aaa');
      doc.fontSize(7).font('Helvetica').fillColor('#aaa').text('Signature / Date', rvX3 + 8, curY + certSigH - 9, { lineBreak: false });
      doc.fillColor('#000');

      // ══════════════════════════════════════════════════════════════════
      // PHOTOS PAGE(S) — rendered as actual images after main page
      // ══════════════════════════════════════════════════════════════════
      if (photos.length > 0) {
        const phColCount = 2;
        const phColGap = 10;
        const phImgW = (CW - phColGap * (phColCount - 1)) / phColCount; // ~265
        const phImgH = 185;
        const phCaptionH = 20;
        const phCellH = phImgH + phCaptionH;
        const phRowGap = 10;
        const phHdrH = 16;
        const phContentTop = MT + phHdrH; // Y where photo grid starts on each page
        const phContentBottom = PH - MB - FOOTER_H;
        const phRowsPerPage = Math.floor((phContentBottom - phContentTop) / (phCellH + phRowGap));

        let phPageRow = 0; // row index within the current page
        let isFirstPhotoPage = true;

        const startNewPhotoPage = (label: string) => {
          doc.addPage();
          drawSectionHdr(MT, label);
          phPageRow = 0;
          isFirstPhotoPage = false;
        };

        startNewPhotoPage(`PHOTOS — Report #${report.reportNumber || '--'} (${photos.length} attached)`);

        for (let idx = 0; idx < photos.length; idx++) {
          const col = idx % phColCount;

          // When we start a new row-pair (col 0), check if it fits on the current page
          if (col === 0 && phPageRow >= phRowsPerPage) {
            startNewPhotoPage(`PHOTOS — Report #${report.reportNumber || '--'} (continued)`);
          }

          const cellX = ML + col * (phImgW + phColGap);
          const cellY = phContentTop + phPageRow * (phCellH + phRowGap);

          // Image border box
          doc.rect(cellX, cellY, phImgW, phImgH).lineWidth(0.5).stroke('#cccccc');

          // Load and render image
          const photo = (photos as any[])[idx];
          const imgBuf2 = await loadImageBuffer(photo.filePath || '');
          if (imgBuf2) {
            try {
              doc.image(imgBuf2, cellX, cellY, { fit: [phImgW, phImgH], align: 'center', valign: 'center' });
            } catch (_ie) {
              doc.rect(cellX, cellY, phImgW, phImgH).fill('#f0f0f0');
              doc.fontSize(7).font('Helvetica').fillColor('#999')
                .text('Image unavailable', cellX + 4, cellY + phImgH / 2 - 4, { width: phImgW - 8, align: 'center', lineBreak: false });
            }
          } else {
            doc.rect(cellX, cellY, phImgW, phImgH).fill('#f0f0f0').stroke('#cccccc');
            doc.fontSize(7).font('Helvetica').fillColor('#999')
              .text('Image unavailable', cellX + 4, cellY + phImgH / 2 - 4, { width: phImgW - 8, align: 'center', lineBreak: false });
          }

          // Caption bar
          const photoId2 = `PH-${report.reportNumber || '000'}-${String(idx + 1).padStart(2, '0')}`;
          const captionText2 = photo.caption ? `${photoId2}  •  ${photo.caption}` : photoId2;
          doc.rect(cellX, cellY + phImgH, phImgW, phCaptionH).fill('#f8fafc').stroke('#cccccc');
          doc.fontSize(7).font('Helvetica-Bold').fillColor(NAVY)
            .text(captionText2, cellX + 4, cellY + phImgH + 5, { width: phImgW - 8, lineBreak: false, ellipsis: true });
          doc.fillColor('#000');

          // Advance row counter when we've filled both columns
          if (col === phColCount - 1 || idx === photos.length - 1) {
            phPageRow++;
          }
        }
      }

      // ══════════════════════════════════════════════════════════════════
      // FOOTER — applied to every page via bufferPages
      // ══════════════════════════════════════════════════════════════════
      const range2 = doc.bufferedPageRange();
      const totalPages2 = range2.count;
      const footerLeft2 = [
        report.reportNumber ? `DR-${report.reportNumber}` : '--',
        projectName,
        company?.name || 'KNOWLAND CONSTRUCTION SERVICES',
        'DAILY REPORT',
      ].join('  |  ');
      const generatedBy2 = 'Generated by Knowland Construction Services Field Reporting System';

      for (let pi = 0; pi < totalPages2; pi++) {
        doc.switchToPage(range2.start + pi);
        const footerY3 = PH - MB - FOOTER_H + 2;
        doc.moveTo(ML, footerY3 - 2).lineTo(ML + CW, footerY3 - 2).lineWidth(0.5).stroke('#cccccc');
        doc.fontSize(6.5).font('Helvetica').fillColor('#555')
          .text(footerLeft2, ML, footerY3 + 2, { width: CW - 60, lineBreak: false, ellipsis: true });
        doc.text(`Page ${pi + 1} of ${totalPages2}`, ML, footerY3 + 2, { width: CW, align: 'right', lineBreak: false });
        doc.fontSize(6).font('Helvetica').fillColor('#999')
          .text(generatedBy2, ML, footerY3 + 11, { width: CW, lineBreak: false });
        doc.fillColor('#000');
      }


      doc.end();

      // Wait for PDF generation to complete
      let pdfBuffer = await pdfComplete;

      // Upload PDF to object storage for persistence
      const pdfPath = await objectStorage.uploadBuffer({
        buffer: pdfBuffer,
        filename,
        contentType: "application/pdf",
        folder: "reports",
      });

      await storage.updateReport(req.params.id, { pdfPath });

      res.json({ pdfUrl: pdfPath, message: "PDF generated successfully" });
    } catch (error: any) {
      console.error("[PDF Generation Error]", {
        reportId: req.params.id,
        errorName: error?.name,
        errorMessage: error?.message,
        errorStack: error?.stack?.slice(0, 500),
      });
      res.status(500).json({ message: "Failed to generate PDF: " + (error?.message || "Unknown error") });
    }
  });

  // Delete PDF from report
  app.delete("/api/reports/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);

      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Check permissions (respects inspector mode): admin or owner
      const isOwner = report.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && report.project?.companyId) {
        hasAdminAccess = await isEffectiveCompanyAdmin(userId, report.project.companyId, profile);
      }

      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!report.pdfPath) {
        return res.status(400).json({ message: "No PDF to delete" });
      }

      // Simply clear the pdfPath - object storage files don't need explicit deletion
      await storage.updateReport(req.params.id, { pdfPath: null });

      res.json({ message: "PDF deleted successfully" });
    } catch (error) {
      console.error("Error deleting PDF:", error);
      res.status(500).json({ message: "Failed to delete PDF" });
    }
  });

  // Stream PDF for viewing/downloading (avoids auth issues with direct /objects/ URLs)
  app.get("/api/reports/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);

      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (!report.pdfPath) {
        return res.status(404).json({ message: "No PDF available. Please generate the PDF first." });
      }

      // Check permissions: owner, project member, or company admin
      const isOwner = report.inspectorId === userId;
      let hasAccess = isOwner || isEffectiveSystemAdmin(profile);
      if (!hasAccess && report.projectId) {
        const isMember = await storage.isUserMemberOfProject(report.projectId, userId);
        if (isMember) hasAccess = true;
        if (!hasAccess) {
          const project = await storage.getProject(report.projectId);
          if (project?.companyId) {
            hasAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
          }
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const download = req.query.download === 'true';
      const setDownloadHeaders = () => {
        if (download) {
          const dateVal = typeof report.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(report.date as string) ? (report.date as string) + 'T12:00:00' : report.date;
          const reportDate = report.date instanceof Date ? report.date : new Date(dateVal as string);
          const dateStr = reportDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-');
          const projectName = report.project?.name || 'Report';
          const sanitizedName = projectName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
          res.set('Content-Disposition', `attachment; filename="${sanitizedName}_${dateStr}.pdf"`);
        } else {
          res.set('Content-Disposition', 'inline');
        }
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      };

      // Handle /objects/ paths via object storage
      if (report.pdfPath.startsWith('/objects/')) {
        try {
          const objectFile = await objectStorage.getObjectEntityFile(report.pdfPath);
          setDownloadHeaders();
          return await objectStorage.downloadObject(objectFile, res, 0);
        } catch (err: any) {
          console.error("Error streaming PDF from object storage:", report.pdfPath, err?.message || err);
          if (err?.name === 'ObjectNotFoundError') {
            return res.status(404).json({ message: "PDF file not found in storage. Please regenerate the PDF." });
          }
          return res.status(500).json({ message: "Failed to serve PDF" });
        }
      }

      // Handle legacy /storage/ paths - try object storage first, then local filesystem
      if (report.pdfPath.startsWith('/storage/')) {
        const filename = report.pdfPath.split('/').pop();
        const objectPath = `/objects/reports/${filename}`;
        try {
          const objectFile = await objectStorage.getObjectEntityFile(objectPath);
          setDownloadHeaders();
          return await objectStorage.downloadObject(objectFile, res, 0);
        } catch (objErr) {
          // Fall through to local filesystem
        }
        const localPath = path.join(process.cwd(), report.pdfPath.replace(/^\//, ''));
        if (fs.existsSync(localPath)) {
          setDownloadHeaders();
          res.set('Content-Type', 'application/pdf');
          return fs.createReadStream(localPath).pipe(res);
        }
        return res.status(404).json({ message: "PDF file not found. Please regenerate the PDF." });
      }

      return res.status(404).json({ message: "Invalid PDF path. Please regenerate the PDF." });
    } catch (error) {
      console.error("Error in PDF download endpoint:", error);
      return res.status(500).json({ message: "Failed to download PDF" });
    }
  });

  // Diagnostic endpoint to check PDF status in object storage
  app.get("/api/reports/:id/pdf-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);

      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Check permissions (respects inspector mode): admin or owner
      const isOwner = report.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && report.project?.companyId) {
        hasAdminAccess = await isEffectiveCompanyAdmin(userId, report.project.companyId, profile);
      }

      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }

      const diagnostics: any = {
        reportId: req.params.id,
        pdfPath: report.pdfPath,
        projectName: report.project?.name || report.customProjectName || 'Unknown',
        reportDate: report.date,
        hasStoredPdfPath: !!report.pdfPath,
      };

      if (report.pdfPath) {
        try {
          const exists = await objectStorage.objectExists(report.pdfPath);
          diagnostics.objectStorageExists = exists;
          if (!exists) {
            diagnostics.error = "PDF path exists in database but file not found in object storage";
          }
        } catch (err: any) {
          diagnostics.objectStorageExists = false;
          diagnostics.objectStorageError = err?.message || String(err);
        }
      }

      // Check photos too
      const photos = await storage.getPhotosByReportId(req.params.id);
      diagnostics.photoCount = photos.length;
      
      if (photos.length > 0) {
        const photoStatuses = await Promise.all(
          photos.slice(0, 5).map(async (photo) => {
            try {
              const exists = await objectStorage.objectExists(photo.filePath);
              return { id: photo.id, path: photo.filePath, exists };
            } catch (err: any) {
              return { id: photo.id, path: photo.filePath, exists: false, error: err?.message };
            }
          })
        );
        diagnostics.photoSamples = photoStatuses;
      }

      res.json(diagnostics);
    } catch (error: any) {
      console.error("Error checking PDF status:", error);
      res.status(500).json({ message: "Failed to check PDF status", error: error?.message });
    }
  });

  // ========== MANUAL TIME ENTRIES ==========

  // Get manual time entries for a project/month
  app.get("/api/manual-time-entries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectId, month, year } = req.query;

      if (!projectId || !month || !year) {
        return res.status(400).json({ message: "Project ID, month, and year are required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get entries for the month
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0);
      endDate.setHours(23, 59, 59, 999);

      const entries = await storage.getManualTimeEntries(projectId, userId, startDate, endDate);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching manual time entries:", error);
      res.status(500).json({ message: "Failed to fetch manual time entries" });
    }
  });

  // Bulk upsert manual time entries for a month
  app.post("/api/manual-time-entries/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectId, entries } = req.body;

      if (!projectId || !Array.isArray(entries)) {
        return res.status(400).json({ message: "Project ID and entries array are required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Process each entry - upsert by projectId + inspectorId + date
      const results = [];
      for (const entry of entries) {
        const entryDate = new Date(entry.date);
        
        // Check if entry exists
        const existingEntries = await storage.getManualTimeEntries(projectId, userId, entryDate, entryDate);
        const existing = existingEntries.find(e => 
          new Date(e.date).toDateString() === entryDate.toDateString()
        );

        if (existing) {
          // Update existing entry
          const updated = await storage.updateManualTimeEntry(existing.id, {
            regularHours: entry.regularHours || null,
            otHours: entry.otHours || null,
            notes: entry.notes || null,
            inspectorName: entry.inspectorName || null,
          });
          results.push(updated);
        } else if (entry.regularHours || entry.otHours) {
          // Only create if there are hours to log
          const created = await storage.createManualTimeEntry({
            projectId,
            inspectorId: userId,
            date: entryDate,
            regularHours: entry.regularHours || null,
            otHours: entry.otHours || null,
            notes: entry.notes || null,
            inspectorName: entry.inspectorName || null,
          });
          results.push(created);
        }
      }

      res.json({ success: true, entries: results });
    } catch (error) {
      console.error("Error saving manual time entries:", error);
      res.status(500).json({ message: "Failed to save manual time entries" });
    }
  });

  // Delete a manual time entry
  app.delete("/api/manual-time-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { id } = req.params;

      const entry = await storage.getManualTimeEntry(id);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }

      // Only the owner or admins can delete
      const project = await storage.getProject(entry.projectId);
      const hasCompanyAccess = project?.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (entry.inspectorId !== userId && !isEffectiveSystemAdmin(profile) && !hasCompanyAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteManualTimeEntry(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting manual time entry:", error);
      res.status(500).json({ message: "Failed to delete manual time entry" });
    }
  });

  // ========== BILLING & TIMESHEETS ==========

  // Generate timesheet PDF for a project/month
  app.post("/api/billing/timesheet", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectId, month, year, inspectorId, useManualEntries } = req.body;

      if (!projectId || !month || !year) {
        return res.status(400).json({ message: "Project ID, month, and year are required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access: Admin, company admin, or project member
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get company info
      let company = null;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
      }

      // Get reports for the specified month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      endDate.setHours(23, 59, 59, 999);
      
      // Filter by inspector if specified (for inspector's own timesheet)
      const targetInspectorId = inspectorId || userId;
      
      let timesheetData;
      
      if (useManualEntries) {
        // Use manual time entries instead of daily reports
        const manualEntries = await storage.getManualTimeEntries(projectId, targetInspectorId, startDate, endDate);
        
        // Get inspector profile
        const inspectorProfile = await storage.getUserProfile(targetInspectorId);
        
        // Get contracts for rates
        const contracts = project.companyId ? await storage.getContracts(project.companyId) : [];
        
        // Get project member rates
        const projectMember = await storage.getProjectMember(projectId, targetInspectorId);
        
        // Build timesheet data from manual entries
        timesheetData = aggregateManualEntriesToTimesheetData(
          manualEntries,
          project,
          contracts,
          company,
          inspectorProfile,
          projectMember,
          month,
          year
        );
      } else {
        // Use daily reports (original behavior)
        const allReports = await storage.getReportsForInvoice(projectId, startDate, endDate);
        const reports = allReports.filter(r => !inspectorId || r.inspectorId === targetInspectorId);

        // Get contracts for rates
        const contracts = project.companyId ? await storage.getContracts(project.companyId) : [];
        
        // Get inspector profile
        const inspectorProfile = await storage.getUserProfile(targetInspectorId);
        
        // Build timesheet data
        timesheetData = aggregateReportsToTimesheetData(
          reports,
          [project],
          contracts,
          company,
          inspectorProfile,
          month,
          year
        );
      }

      // Generate PDF
      const pdfBuffer = await generateTimesheetPdf(timesheetData);
      
      const monthName = format(startDate, 'MMMM-yyyy');
      const filename = `Timesheet_${project.name || project.projectNumber}_${monthName}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error("Error generating timesheet:", error);
      res.status(500).json({ message: "Failed to generate timesheet" });
    }
  });

  app.post("/api/billing/multi-project-timesheet", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectIds, month, year } = req.body;

      if (!Array.isArray(projectIds) || projectIds.length === 0 || projectIds.length > 5 || !month || !year) {
        return res.status(400).json({ message: "1-5 project IDs, month, and year are required" });
      }

      const allProjects: any[] = [];
      const allReports: DailyReport[] = [];
      let companyId: string | null = null;

      for (const projectId of projectIds) {
        const project = await storage.getProject(projectId);
        if (!project) continue;
        const isMember = await storage.isUserMemberOfProject(projectId, userId);
        const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isMember) continue;
        allProjects.push(project);
        if (!companyId && project.companyId) companyId = project.companyId;
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        endDate.setHours(23, 59, 59, 999);
        const reports = await storage.getReportsForInvoice(projectId, startDate, endDate);
        const inspectorReports = reports.filter(r => r.inspectorId === userId);
        allReports.push(...inspectorReports);
      }

      if (allProjects.length === 0) {
        return res.status(400).json({ message: "No accessible projects found" });
      }

      const companyIds = new Set(allProjects.map(p => p.companyId).filter(Boolean));
      if (companyIds.size > 1) {
        return res.status(400).json({ message: "All selected projects must belong to the same company" });
      }

      let company = null;
      if (companyId) company = await storage.getCompany(companyId);
      const contracts = companyId ? await storage.getContracts(companyId) : [];
      const inspectorProfile = await storage.getUserProfile(userId);

      const timesheetData = aggregateReportsToTimesheetData(
        allReports, allProjects, contracts, company, inspectorProfile, month, year
      );

      if (company?.logoPath) {
        try {
          timesheetData.companyLogoBuffer = await objectStorage.downloadBuffer(company.logoPath);
        } catch (e) { /* ignore logo errors */ }
      }

      const pdfBuffer = await generateTimesheetPdf(timesheetData);
      const startDate = new Date(year, month - 1, 1);
      const monthName = format(startDate, 'MMMM-yyyy');
      const filename = `Timesheet_MultiProject_${monthName}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating multi-project timesheet:", error);
      res.status(500).json({ message: "Failed to generate multi-project timesheet" });
    }
  });

  app.post("/api/billing/multi-project-combined-reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectIds, month, year } = req.body;

      if (!Array.isArray(projectIds) || projectIds.length === 0 || projectIds.length > 5 || !month || !year) {
        return res.status(400).json({ message: "1-5 project IDs, month, and year are required" });
      }

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      endDate.setHours(23, 59, 59, 999);
      const mergedPdf = await PDFLibDocument.create();
      let foundAny = false;

      for (const projectId of projectIds) {
        const project = await storage.getProject(projectId);
        if (!project) continue;
        const isMember = await storage.isUserMemberOfProject(projectId, userId);
        const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isMember) continue;

        const allReports = await storage.getReportsForInvoice(projectId, startDate, endDate);
        const reports = allReports.filter(r => r.inspectorId === userId && r.pdfPath);

        for (const report of reports) {
          try {
            let pdfBytes: Uint8Array;
            if (report.pdfPath!.startsWith('/objects/')) {
              const buffer = await objectStorage.downloadBuffer(report.pdfPath!);
              pdfBytes = new Uint8Array(buffer);
            } else {
              const localPath = path.join(process.cwd(), report.pdfPath!.replace(/^\//, ''));
              if (fs.existsSync(localPath)) {
                pdfBytes = new Uint8Array(fs.readFileSync(localPath));
              } else continue;
            }
            const pdfDoc = await PDFLibDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
            foundAny = true;
          } catch (err) {
            console.error(`Error adding report ${report.id} to combined PDF:`, err);
          }
        }
      }

      if (!foundAny) {
        return res.status(400).json({ message: "No report PDFs found for the selected projects and period" });
      }

      const mergedPdfBytes = await mergedPdf.save();
      const pdfBuffer = Buffer.from(mergedPdfBytes);
      const monthName = format(startDate, 'MMMM-yyyy');
      const filename = `Combined_Reports_MultiProject_${monthName}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating multi-project combined reports:", error);
      res.status(500).json({ message: "Failed to generate combined reports" });
    }
  });

  app.post("/api/billing/multi-project-inspector-invoice", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectIds, month, year } = req.body;

      if (!Array.isArray(projectIds) || projectIds.length === 0 || projectIds.length > 5 || !month || !year) {
        return res.status(400).json({ message: "1-5 project IDs, month, and year are required" });
      }

      const inspectorProfile = await storage.getUserProfile(userId);
      const inspectorUser = await storage.getUserById(userId);
      const inspectorName = inspectorProfile?.firstName && inspectorProfile?.lastName
        ? `${inspectorProfile.firstName} ${inspectorProfile.lastName}`
        : inspectorUser?.firstName && inspectorUser?.lastName
          ? `${inspectorUser.firstName} ${inspectorUser.lastName}`
          : inspectorUser?.email || 'Inspector';

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      endDate.setHours(23, 59, 59, 999);
      let totalRegularHours = 0;
      let totalOvertimeHours = 0;
      let avgRegularRate = 0;
      let avgOvertimeRate = 0;
      let avgPremiumRate = 0;
      const projectNames: string[] = [];
      const projectNumbers: string[] = [];
      let companyId: string | null = null;
      let rateCount = 0;
      const invoiceCompanyIds = new Set<string>();

      for (const projectId of projectIds) {
        const project = await storage.getProject(projectId);
        if (!project) continue;
        const isMember = await storage.isUserMemberOfProject(projectId, userId);
        if (!isMember) continue;
        if (!companyId && project.companyId) companyId = project.companyId;
        if (project.companyId) invoiceCompanyIds.add(project.companyId);

        projectNames.push(project.name);
        if (project.projectNumber) projectNumbers.push(project.projectNumber);

        const allReports = await storage.getReportsForInvoice(projectId, startDate, endDate);
        const reports = allReports.filter(r => r.inspectorId === userId);

        for (const report of reports) {
          totalRegularHours += parseFloat(report.regularHours || '0') || 0;
          totalOvertimeHours += parseFloat(report.otHours || '0') || 0;
        }

        const projectMember = await storage.getProjectMember(projectId, userId);
        if (projectMember) {
          avgRegularRate += parseFloat(projectMember.regularRate || '0') || 0;
          avgOvertimeRate += parseFloat(projectMember.overtimeRate || '0') || 0;
          avgPremiumRate += parseFloat(projectMember.premiumRate || '0') || 0;
          rateCount++;
        }
      }

      if (projectNames.length === 0) {
        return res.status(400).json({ message: "No accessible projects found" });
      }

      if (invoiceCompanyIds.size > 1) {
        return res.status(400).json({ message: "All selected projects must belong to the same company" });
      }

      if (rateCount > 0) {
        avgRegularRate /= rateCount;
        avgOvertimeRate /= rateCount;
        avgPremiumRate /= rateCount;
      }

      let company = null;
      if (companyId) company = await storage.getCompany(companyId);

      const invoiceNumber = `INS-${userId.slice(-4)}-MULTI-${String(month).padStart(2, '0')}${year}`;

      const invoiceData: InspectorInvoiceData = {
        inspectorName,
        inspectorAddress: inspectorProfile?.contractorAddress || undefined,
        inspectorPhone: inspectorProfile?.contractorPhone || inspectorProfile?.phone || undefined,
        inspectorEmail: inspectorProfile?.contractorEmail || inspectorProfile?.email || inspectorUser?.email || undefined,
        companyName: company?.name || 'Company',
        companyAddress: company?.address || undefined,
        projectName: projectNames.join(' / '),
        projectNumber: projectNumbers.join(' / ') || undefined,
        invoiceNumber,
        invoiceDate: new Date(),
        month,
        year,
        regularHours: totalRegularHours,
        overtimeHours: totalOvertimeHours,
        premiumHours: 0,
        regularRate: avgRegularRate,
        overtimeRate: avgOvertimeRate,
        premiumRate: avgPremiumRate,
      };

      const pdfBuffer = await generateInspectorInvoicePdf(invoiceData);
      const monthName = format(startDate, 'MMMM-yyyy');
      const filename = `Inspector_Invoice_MultiProject_${monthName}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating multi-project inspector invoice:", error);
      res.status(500).json({ message: "Failed to generate inspector invoice" });
    }
  });

  // Test endpoint: Generate blank timesheet PDF for viewing the template
  app.get("/api/billing/test-timesheet", async (req, res) => {
    try {
      const blankData = {
        companyName: "Sample Construction Company",
        inspectorName: "John Doe",
        districtName: "",
        month: 1,
        year: 2026,
        projects: []
      };
      
      const pdfBuffer = await generateTimesheetPdf(blankData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="blank-timesheet.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating test timesheet:", error);
      res.status(500).json({ message: "Failed to generate test timesheet" });
    }
  });

  // Generate invoice PDF for a project/month with rates
  app.post("/api/billing/invoice", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectId, month, year, contractId, purchaseOrderId } = req.body;

      if (!projectId || !month || !year) {
        return res.status(400).json({ message: "Project ID, month, and year are required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Only admins can generate invoices
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess) {
        return res.status(403).json({ message: "Only admins can generate invoices" });
      }

      // Get company info
      let company = null;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
      }

      // Get contract for rates - use provided contractId or find from project linkage
      let contract = null;
      if (contractId) {
        contract = await storage.getContract(contractId);
        // Validate contract belongs to same company
        if (contract && contract.companyId !== project.companyId) {
          return res.status(400).json({ message: "Contract does not belong to the same company as the project" });
        }
      } else {
        // Try to find contract linked to this project
        const allContracts = await storage.getContracts(project.companyId || '');
        contract = allContracts.find((c: any) => c.projects?.some((p: any) => p.id === projectId)) || null;
      }

      // Get client info - try contract first, then project directly
      let client = null;
      if (contract?.clientId) {
        client = await storage.getClient(contract.clientId);
      }
      if (!client && project.clientId) {
        client = await storage.getClient(project.clientId);
      }

      // Get IOR agreements for this project to get inspector hourly rates
      const iorAgreements = await storage.getIorAgreementsByProject(projectId);
      const iorRateMap = new Map<string, string>();
      iorAgreements.forEach((ior: any) => {
        if (ior.inspectorId && ior.rate) {
          iorRateMap.set(ior.inspectorId, ior.rate);
        }
      });

      // Get reports for the specified month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const reports = await storage.getReportsForInvoice(projectId, startDate, endDate);

      // Calculate hours and build report details with inspector names
      let regularHours = 0;
      let overtimeHours = 0;
      const reportDetails: Array<{
        date: Date;
        inspectorName: string;
        regularHours: number;
        overtimeHours: number;
        premiumHours: number;
        hourlyRate?: number;
      }> = [];
      
      for (const report of reports) {
        const regHrs = parseFloat(report.regularHours || '0') || 0;
        const otHrs = parseFloat(report.otHours || '0') || 0;
        regularHours += regHrs;
        overtimeHours += otHrs;
        
        // Get inspector name
        const inspectorProfile = await storage.getUserProfile(report.inspectorId);
        const inspectorUser = await storage.getUserById(report.inspectorId);
        const inspectorName = inspectorProfile?.firstName && inspectorProfile?.lastName
          ? `${inspectorProfile.firstName} ${inspectorProfile.lastName}`
          : inspectorUser?.firstName && inspectorUser?.lastName
            ? `${inspectorUser.firstName} ${inspectorUser.lastName}`
            : inspectorUser?.email || 'Unknown';
        
        // Get hourly rate from IOR agreement
        const iorRate = iorRateMap.get(report.inspectorId);
        const hourlyRate = iorRate ? parseFloat(iorRate) : undefined;
        
        reportDetails.push({
          date: report.date,
          inspectorName,
          regularHours: regHrs,
          overtimeHours: otHrs,
          premiumHours: 0,
          hourlyRate,
        });
      }

      // Get rates from contract
      const regularRate = parseFloat(contract?.regularRate || '0') || 0;
      const overtimeRate = parseFloat(contract?.overtimeRate || '0') || 0;
      const premiumRate = parseFloat(contract?.premiumRate || '0') || 0;

      // Calculate amounts
      const regularAmount = regularHours * regularRate;
      const overtimeAmount = overtimeHours * overtimeRate;
      const premiumAmount = 0; // Premium hours from reports if applicable
      const subtotal = regularAmount + overtimeAmount + premiumAmount;

      // Get purchase order if provided, otherwise try to get from contract
      let purchaseOrder = null;
      const poId = purchaseOrderId || contract?.purchaseOrderId;
      if (poId) {
        purchaseOrder = await storage.getPurchaseOrder(poId);
        // Validate PO belongs to same company
        if (purchaseOrder && purchaseOrder.companyId !== project.companyId) {
          return res.status(400).json({ message: "Purchase order does not belong to the same company as the project" });
        }
      }

      // Get next invoice number and create record
      const invoiceNumber = await storage.getNextInvoiceNumber();
      await storage.createInvoice({
        companyId: project.companyId || '',
        projectId,
        contractId: contract?.id || undefined,
        clientId: contract?.clientId || undefined,
        purchaseOrderId: purchaseOrder?.id || undefined,
        invoiceNumber,
        month,
        year,
        regularHours: regularHours.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        premiumHours: '0',
        regularRate: regularRate.toFixed(2),
        overtimeRate: overtimeRate.toFixed(2),
        premiumRate: premiumRate.toFixed(2),
        regularAmount: regularAmount.toFixed(2),
        overtimeAmount: overtimeAmount.toFixed(2),
        premiumAmount: '0',
        subtotal: subtotal.toFixed(2),
        totalAmount: subtotal.toFixed(2),
      });

      // Generate invoice PDF
      const invoiceData: InvoiceData = {
        companyName: company?.name || 'Company',
        companyAddress: company?.address || undefined,
        companyPhone: company?.phone || undefined,
        companyEmail: company?.email || undefined,
        clientName: client?.name,
        clientAddress: client?.address || undefined,
        clientContactName: client?.contactName || undefined,
        projectName: project.name,
        projectNumber: project.projectNumber || undefined,
        contractNumber: contract?.contractNumber || undefined,
        purchaseOrderNumber: purchaseOrder?.poNumber || undefined,
        purchaseOrderValue: purchaseOrder?.totalAmount ? parseFloat(purchaseOrder.totalAmount) : undefined,
        invoiceNumber: `INV-${invoiceNumber}`,
        invoiceDate: new Date(),
        month,
        year,
        regularHours,
        overtimeHours,
        premiumHours: 0,
        regularRate,
        overtimeRate,
        premiumRate,
        reportDetails,
      };

      const pdfBuffer = await generateInvoicePdf(invoiceData);
      
      const monthName = format(startDate, 'MMMM-yyyy');
      const filename = `Invoice_${invoiceNumber}_${project.name || project.projectNumber}_${monthName}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // Combine monthly reports into single PDF
  app.post("/api/billing/combined-reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectId, month, year, inspectorId } = req.body;

      if (!projectId || !month || !year) {
        return res.status(400).json({ message: "Project ID, month, and year are required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access: Admin, company admin, or project member
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const hasCompanyAccess = project.companyId && await isEffectiveCompanyAdmin(userId, project.companyId, profile);
      
      if (!isEffectiveSystemAdmin(profile) && !hasCompanyAccess && !isProjectMember) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get reports for the specified month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      const targetInspectorId = inspectorId || null;
      const allReports = await storage.getReportsForInvoice(projectId, startDate, endDate);
      const reports = allReports.filter(r => !targetInspectorId || r.inspectorId === targetInspectorId);

      if (reports.length === 0) {
        return res.status(400).json({ message: "No reports found for the specified period" });
      }

      // Check all reports have PDFs
      const reportsWithPdfs = reports.filter(r => r.pdfPath);
      if (reportsWithPdfs.length === 0) {
        return res.status(400).json({ message: "No PDFs available. Please generate individual report PDFs first." });
      }

      // Create merged PDF using pdf-lib
      const mergedPdf = await PDFLibDocument.create();
      
      for (const report of reportsWithPdfs) {
        try {
          let pdfBytes: Uint8Array;
          if (report.pdfPath!.startsWith('/objects/')) {
            const buffer = await objectStorage.downloadBuffer(report.pdfPath!);
            pdfBytes = new Uint8Array(buffer);
          } else {
            const localPath = path.join(process.cwd(), report.pdfPath!.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              pdfBytes = new Uint8Array(fs.readFileSync(localPath));
            } else {
              continue;
            }
          }
          
          const pdfDoc = await PDFLibDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
          console.error(`Error adding report ${report.id} to combined PDF:`, err);
        }
      }

      const mergedPdfBytes = await mergedPdf.save();
      const pdfBuffer = Buffer.from(mergedPdfBytes);
      
      const monthName = format(startDate, 'MMMM-yyyy');
      const filename = `Combined_Reports_${project.name || project.projectNumber}_${monthName}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error("Error generating combined reports PDF:", error);
      res.status(500).json({ message: "Failed to generate combined reports PDF" });
    }
  });

  // Generate inspector invoice PDF - for inspectors to bill their company
  app.post("/api/billing/inspector-invoice", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectId, month, year } = req.body;

      if (!projectId || !month || !year) {
        return res.status(400).json({ message: "Project ID, month, and year are required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Inspectors can only generate their own invoices - must be a project member
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      if (!isProjectMember) {
        return res.status(403).json({ message: "You must be assigned to this project to generate an invoice" });
      }

      // Get the project member record for rates
      const projectMember = await storage.getProjectMember(projectId, userId);
      if (!projectMember) {
        return res.status(404).json({ message: "Project membership not found" });
      }

      // Get company info
      let company = null;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
      }

      // Get inspector's profile for contact info
      const inspectorProfile = await storage.getUserProfile(userId);
      const inspectorUser = await storage.getUserById(userId);
      const inspectorName = inspectorProfile?.firstName && inspectorProfile?.lastName 
        ? `${inspectorProfile.firstName} ${inspectorProfile.lastName}`
        : inspectorUser?.firstName && inspectorUser?.lastName
          ? `${inspectorUser.firstName} ${inspectorUser.lastName}`
          : inspectorUser?.email || 'Inspector';

      // Get reports for the specified month - only this inspector's reports
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const allReports = await storage.getReportsForInvoice(projectId, startDate, endDate);
      const reports = allReports.filter(r => r.inspectorId === userId);

      // Calculate hours
      let regularHours = 0;
      let overtimeHours = 0;
      
      for (const report of reports) {
        regularHours += parseFloat(report.regularHours || '0') || 0;
        overtimeHours += parseFloat(report.otHours || '0') || 0;
      }

      // Get rates from project member record
      const regularRate = parseFloat(projectMember.regularRate || '0') || 0;
      const overtimeRate = parseFloat(projectMember.overtimeRate || '0') || 0;
      const premiumRate = parseFloat(projectMember.premiumRate || '0') || 0;

      // Generate invoice number (INS-USERID-PROJECTID-MMYYYY)
      const invoiceNumber = `INS-${userId.slice(-4)}-${projectId.slice(-4)}-${String(month).padStart(2, '0')}${year}`;

      // Generate inspector invoice PDF
      const invoiceData: InspectorInvoiceData = {
        inspectorName,
        inspectorAddress: inspectorProfile?.contractorAddress || undefined,
        inspectorPhone: inspectorProfile?.contractorPhone || inspectorProfile?.phone || undefined,
        inspectorEmail: inspectorProfile?.contractorEmail || inspectorProfile?.email || inspectorUser?.email || undefined,
        companyName: company?.name || 'Company',
        companyAddress: company?.address || undefined,
        projectName: project.name,
        projectNumber: project.projectNumber || undefined,
        invoiceNumber,
        invoiceDate: new Date(),
        month,
        year,
        regularHours,
        overtimeHours,
        premiumHours: 0,
        regularRate,
        overtimeRate,
        premiumRate,
      };

      const pdfBuffer = await generateInspectorInvoicePdf(invoiceData);
      
      const monthName = format(startDate, 'MMMM-yyyy');
      const filename = `Inspector_Invoice_${inspectorName.replace(/\s+/g, '_')}_${project.name || project.projectNumber}_${monthName}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error("Error generating inspector invoice:", error);
      res.status(500).json({ message: "Failed to generate inspector invoice" });
    }
  });

  // ========== DISTRIBUTION ==========
  app.post("/api/reports/:id/distribute", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const { recipients, message } = req.body;
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ message: "Recipients required" });
      }

      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check permissions (respects inspector mode): admin or owner
      const isOwner = report.inspectorId === userId;
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && report.projectId) {
        const project = await storage.getProject(report.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      if (!hasAdminAccess && !isOwner) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if PDF exists
      if (!report.pdfPath) {
        return res.status(400).json({ message: "Please generate a PDF before distributing the report" });
      }

      // Read PDF file from object storage or local filesystem
      let pdfBuffer: Buffer;
      try {
        if (report.pdfPath.startsWith('/objects/')) {
          pdfBuffer = await objectStorage.downloadBuffer(report.pdfPath);
        } else {
          const localPath = path.join(process.cwd(), report.pdfPath.replace(/^\//, ''));
          if (!fs.existsSync(localPath)) {
            return res.status(400).json({ message: "PDF file not found. Please regenerate the PDF." });
          }
          pdfBuffer = fs.readFileSync(localPath);
        }
      } catch (err) {
        console.error('Error reading PDF:', err);
        return res.status(400).json({ message: "PDF file not found. Please regenerate the PDF." });
      }

      // Get project and company info for email
      const project = report.project;
      const reportDateObj = report.date instanceof Date ? report.date : new Date(report.date);
      const reportDate = reportDateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
      });

      // Create distribution log first
      const log = await storage.createDistributionLog({
        reportId: req.params.id,
        sentTo: recipients.join(", "),
        status: "pending",
      });

      try {
        // Send email using Resend integration
        const { sendEmail } = await import('./replit_integrations/email/client');
        
        const projectDisplayName = project?.name || report.customProjectName || 'Unassigned Report';
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Daily Field Report</h2>
            <p><strong>Project:</strong> ${projectDisplayName}</p>
            <p><strong>Date:</strong> ${reportDate}</p>
            <p><strong>Inspector:</strong> ${report.inspectorName || 'Unknown'}</p>
            ${message ? `<p><strong>Message:</strong></p><p>${message}</p>` : ''}
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
            <p>Please find the attached PDF report for your records.</p>
            <p style="color: #6b7280; font-size: 12px;">This is an automated email from Field Daily Reports.</p>
          </div>
        `;

        const pdfFilename = `Daily_Report_${projectDisplayName.replace(/[^a-zA-Z0-9]/g, '_')}_${report.date}.pdf`;

        const emailResult = await sendEmail({
          to: recipients,
          subject: `Daily Field Report - ${projectDisplayName} - ${reportDate}`,
          html: emailHtml,
          attachments: [{
            filename: pdfFilename,
            content: pdfBuffer
          }]
        });

        // Check for Resend API errors
        if (emailResult.error) {
          console.error("Resend API error:", emailResult.error);
          await storage.updateDistributionLogStatus(log.id, "failed");
          return res.status(500).json({ 
            message: "Failed to send email: " + (emailResult.error.message || "Unknown error"),
            error: emailResult.error
          });
        }

        console.log("Resend API response:", emailResult);

        // Update log to sent
        await storage.updateDistributionLogStatus(log.id, "sent");

        console.log(`Report ${req.params.id} distributed successfully to:`, recipients);
        res.json({ message: "Report sent successfully", log });
      } catch (emailError) {
        console.error("Email sending error:", emailError);
        await storage.updateDistributionLogStatus(log.id, "failed");
        return res.status(500).json({ message: "Failed to send email. Please check email configuration." });
      }
    } catch (error) {
      console.error("Error distributing report:", error);
      res.status(500).json({ message: "Failed to distribute report" });
    }
  });

  // ========== BATCH EXPORT ==========
  app.post("/api/reports/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const { reportIds, email } = req.body;
      if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        return res.status(400).json({ message: "Report IDs required" });
      }
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email address required" });
      }

      // Fetch all reports
      const reports = await Promise.all(
        reportIds.map(id => storage.getReport(id))
      );
      
      // Filter to valid reports and check access for each
      const accessibleReports = [];
      for (const report of reports) {
        if (!report) continue;
        
        // Check permissions: must be owner or admin
        const isOwner = report.inspectorId === userId;
        let hasAdminAccess = isEffectiveSystemAdmin(profile);
        if (!hasAdminAccess && report.project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, report.project.companyId, profile);
        }
        
        if (isOwner || hasAdminAccess) {
          accessibleReports.push(report);
        }
      }
      
      if (accessibleReports.length === 0) {
        return res.status(403).json({ message: "No accessible reports found" });
      }

      // Check that accessible reports have PDFs
      const reportsWithPdfs = accessibleReports.filter(r => r.pdfPath);
      if (reportsWithPdfs.length === 0) {
        return res.status(400).json({ message: "None of the selected reports have PDFs generated" });
      }

      // Load PDF buffers
      const attachments = [];
      for (const report of reportsWithPdfs) {
        try {
          let pdfBuffer: Buffer;
          if (report!.pdfPath!.startsWith('/objects/')) {
            pdfBuffer = await objectStorage.downloadBuffer(report!.pdfPath!);
          } else {
            const localPath = path.join(process.cwd(), report!.pdfPath!.replace(/^\//, ''));
            if (!fs.existsSync(localPath)) continue;
            pdfBuffer = fs.readFileSync(localPath);
          }
          
          const project = report!.project;
          const projectName = project?.name || report!.customProjectName || 'Unassigned';
          const pdfFilename = `Daily_Report_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${report!.date}.pdf`;
          
          attachments.push({
            filename: pdfFilename,
            content: pdfBuffer
          });
        } catch (err) {
          console.error('Error loading PDF for report:', report!.id, err);
        }
      }

      if (attachments.length === 0) {
        return res.status(400).json({ message: "Could not load any PDF files" });
      }

      // Send email with all PDFs attached
      const { sendEmail } = await import('./replit_integrations/email/client');
      
      const dateRange = reportsWithPdfs.length === 1 
        ? new Date(reportsWithPdfs[0]!.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : `${new Date(reportsWithPdfs[reportsWithPdfs.length - 1]!.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(reportsWithPdfs[0]!.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Daily Field Reports Export</h2>
          <p>Please find attached <strong>${attachments.length} daily field report${attachments.length !== 1 ? 's' : ''}</strong>.</p>
          <p><strong>Date Range:</strong> ${dateRange}</p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 12px;">This is an automated email from Field Daily Reports.</p>
        </div>
      `;

      const emailResult = await sendEmail({
        to: [email],
        subject: `Daily Field Reports Export - ${attachments.length} Report${attachments.length !== 1 ? 's' : ''} - ${dateRange}`,
        html: emailHtml,
        attachments
      });

      if (emailResult.error) {
        console.error("Resend API error:", emailResult.error);
        return res.status(500).json({ 
          message: "Failed to send email: " + (emailResult.error.message || "Unknown error")
        });
      }

      console.log(`Exported ${attachments.length} reports to:`, email);
      res.json({ message: `Successfully sent ${attachments.length} report(s) to ${email}` });
    } catch (error) {
      console.error("Error exporting reports:", error);
      res.status(500).json({ message: "Failed to export reports" });
    }
  });

  // ========== ADMIN ROUTES ==========
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const currentUserId = req.user?.claims?.sub;
      
      // Prevent deleting yourself
      if (userId === currentUserId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }
      
      // Check if user exists
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Delete the user and all their related data
      const deleted = await storage.deleteUser(userId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete user" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { role } = req.body;
      const validRoles = ["inspector", "admin", "owner", "system_owner"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Role hierarchy: system_owner > admin > inspector
      // Note: "owner" is legacy and treated as equivalent to "admin"
      const userId = req.user?.claims?.sub;
      const requestingUserProfile = await storage.getUserProfile(userId);
      const requestingIsSystemOwner = requestingUserProfile?.role === "system_owner";
      
      // Only system owners can assign System Admin role
      if (role === "admin" && !requestingIsSystemOwner) {
        return res.status(403).json({ message: "Only System Owners can assign the System Admin role" });
      }
      
      // Cannot assign system_owner role via this endpoint (must be done directly in database)
      if (role === "system_owner") {
        return res.status(403).json({ message: "System Owner role cannot be assigned through this interface" });
      }
      
      // Check if we're modifying a system_owner - nobody can change this via UI
      const targetProfile = await storage.getUserProfile(req.params.id);
      if (targetProfile?.role === "system_owner") {
        return res.status(403).json({ message: "System Owner role cannot be modified" });
      }
      
      // Only system owners can demote a system admin
      if ((targetProfile?.role === "admin" || targetProfile?.role === "owner") && !requestingIsSystemOwner) {
        return res.status(403).json({ message: "Only System Owners can modify System Admin users" });
      }

      const profile = await storage.updateUserRole(req.params.id, role);
      res.json(profile);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Get all projects assigned to a user (for admin)
  app.get("/api/admin/users/:id/projects", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const projectIds = await storage.getProjectsForUser(userId);
      res.json(projectIds);
    } catch (error) {
      console.error("Error fetching user projects:", error);
      res.status(500).json({ message: "Failed to fetch user projects" });
    }
  });

  // Update project assignments for a user (for admin)
  app.put("/api/admin/users/:id/projects", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { projectIds } = req.body;
      
      if (!Array.isArray(projectIds)) {
        return res.status(400).json({ message: "projectIds must be an array" });
      }
      
      // Get current assignments
      const currentProjectIds = await storage.getProjectsForUser(userId);
      
      // Remove from projects no longer assigned
      for (const projectId of currentProjectIds) {
        if (!projectIds.includes(projectId)) {
          await storage.removeProjectMember(projectId, userId);
        }
      }
      
      // Add to new projects
      for (const projectId of projectIds) {
        if (!currentProjectIds.includes(projectId)) {
          await storage.addProjectMember(projectId, userId);
        }
      }
      
      // Return updated list
      const updatedProjectIds = await storage.getProjectsForUser(userId);
      res.json(updatedProjectIds);
    } catch (error) {
      console.error("Error updating user projects:", error);
      res.status(500).json({ message: "Failed to update user projects" });
    }
  });

  // Get all companies for a user with their roles (for admin)
  app.get("/api/admin/users/:id/companies", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const memberships = await storage.getCompaniesForUser(userId);
      res.json(memberships);
    } catch (error) {
      console.error("Error fetching user companies:", error);
      res.status(500).json({ message: "Failed to fetch user companies" });
    }
  });

  // Assign user to a company (for admin)
  app.post("/api/admin/users/:id/companies", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { companyId, role } = req.body;
      
      if (!companyId) {
        return res.status(400).json({ message: "companyId is required" });
      }
      
      // Validate role
      const validRoles = ["inspector", "admin"];
      const memberRole = role && validRoles.includes(role) ? role : "inspector";
      
      // Check if user exists
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if company exists
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      // Check if already a member
      const existingMembership = await storage.getCompanyMember(companyId, userId);
      if (existingMembership) {
        return res.status(409).json({ message: "User is already a member of this company" });
      }
      
      // Add user to company
      const membership = await storage.addCompanyMember(companyId, userId, memberRole);
      res.status(201).json(membership);
    } catch (error) {
      console.error("Error assigning user to company:", error);
      res.status(500).json({ message: "Failed to assign user to company" });
    }
  });

  // Update user's company role or remove from company (for admin)
  app.put("/api/admin/users/:id/companies/:companyId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const companyId = req.params.companyId;
      const { role } = req.body;
      
      // Validate role
      const validRoles = ["inspector", "admin"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'inspector' or 'admin'" });
      }
      
      // Check if membership exists
      const existingMembership = await storage.getCompanyMember(companyId, userId);
      if (!existingMembership) {
        return res.status(404).json({ message: "User is not a member of this company" });
      }
      
      // Update role
      const updatedMembership = await storage.updateCompanyMemberRole(companyId, userId, role);
      res.json(updatedMembership);
    } catch (error) {
      console.error("Error updating user company role:", error);
      res.status(500).json({ message: "Failed to update user company role" });
    }
  });

  // Remove user from a company (for admin)
  app.delete("/api/admin/users/:id/companies/:companyId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const companyId = req.params.companyId;
      
      // Check if membership exists
      const existingMembership = await storage.getCompanyMember(companyId, userId);
      if (!existingMembership) {
        return res.status(404).json({ message: "User is not a member of this company" });
      }
      
      // Remove from company
      await storage.removeCompanyMember(companyId, userId);
      
      // If this was their active company, clear it
      const profile = await storage.getUserProfile(userId);
      if (profile?.activeCompanyId === companyId) {
        await storage.setActiveCompany(userId, null);
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error removing user from company:", error);
      res.status(500).json({ message: "Failed to remove user from company" });
    }
  });

  app.get("/api/admin/settings", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.post("/api/admin/settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) {
        return res.status(400).json({ message: "Key required" });
      }

      const setting = await storage.setSetting(key, value || "");
      res.json(setting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  app.post("/api/admin/logo", isAuthenticated, isAdmin, logoUpload.single("logo"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No logo file provided" });
      }

      // Upload to object storage for persistence
      const logoPath = await objectStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename: "admin-logo.png",
        contentType: req.file.mimetype,
        folder: "logos",
      });
      await storage.setSetting("company_logo", logoPath);

      res.json({ logoPath });
    } catch (error) {
      console.error("Error uploading logo:", error);
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // ========== INVITE ROUTES ==========
  // Role types for invites:
  // - "inspector": Regular inspector role
  // - "admin": System Administrator (can only be invited by System Owner)
  // - "company_admin": Company Administrator (admin within a specific company) - stored as "inspector" profile role + admin company membership
  const createInviteSchema = z.object({
    email: z.string().email("Valid email is required"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.enum(["inspector", "admin", "company_admin"]).default("inspector"),
    companyId: z.string().optional(),
    projectIds: z.array(z.string()).optional().default([]),
    expiresAt: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  });
  
  // Convert invite role to database role (company_admin is stored as inspector in profiles)
  const getProfileRoleFromInviteRole = (inviteRole: string): "inspector" | "admin" => {
    if (inviteRole === "admin") return "admin";
    return "inspector"; // Both "inspector" and "company_admin" become "inspector" in profiles
  };
  
  // Get company member role from invite role
  const getCompanyRoleFromInviteRole = (inviteRole: string): "inspector" | "admin" => {
    if (inviteRole === "company_admin") return "admin";
    return "inspector";
  };

  // Helper to check if user is admin of a specific company
  const isCompanyAdmin = async (userId: string, companyId: string): Promise<boolean> => {
    const member = await storage.getCompanyMember(companyId, userId);
    return member?.role === "admin";
  };

  // Helper to get all companies where user is admin
  const getAdminCompanyIds = async (userId: string): Promise<string[]> => {
    const memberships = await storage.getCompaniesForUser(userId);
    return memberships
      .filter(m => m.role === "admin")
      .map(m => m.companyId);
  };

  app.get("/api/admin/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const allInvites = await storage.getInvites();
      
      // System admins see all invites
      if (isEffectiveSystemAdmin(profile)) {
        return res.json(allInvites);
      }
      
      // Company admins see invites for their companies
      const adminCompanyIds = await getAdminCompanyIds(userId);
      if (adminCompanyIds.length === 0) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const filteredInvites = allInvites.filter(invite => 
        invite.companyId && adminCompanyIds.includes(invite.companyId)
      );
      
      res.json(filteredInvites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  app.post("/api/admin/invites", isAuthenticated, async (req: any, res) => {
    try {
      const result = createInviteSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: result.error.flatten().fieldErrors 
        });
      }

      const { email, firstName, lastName, role, companyId, projectIds, expiresAt } = result.data;
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // System Admin invites can only be created by System Owner or System Admin
      if (role === "admin" && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Forbidden: Only System Owners and System Administrators can invite System Administrators" });
      }
      
      // Company Admin invites require a company to be selected
      if (role === "company_admin" && !companyId) {
        return res.status(400).json({ message: "Company Administrator invites require an organization to be selected" });
      }
      
      // Check authorization: system admin/owner can invite anyone, company admin can only invite to their companies
      if (!isEffectiveSystemAdmin(profile)) {
        if (!companyId) {
          return res.status(400).json({ message: "Company admins must select an organization for the invite" });
        }
        
        const isAdminOfCompany = await isCompanyAdmin(userId, companyId);
        if (!isAdminOfCompany) {
          return res.status(403).json({ message: "Forbidden: You can only invite users to companies you administer" });
        }
        
        // Company admins cannot create System Admin invites (already checked above, but be safe)
        if (role === "admin") {
          return res.status(403).json({ message: "Forbidden: Only System Owners and System Administrators can invite System Administrators" });
        }
      }

      const existingInvite = await storage.getInviteByEmail(email);
      if (existingInvite) {
        return res.status(400).json({ message: "An active invite already exists for this email" });
      }

      const token = randomUUID();
      // Generate a short 8-character alphanumeric invite code using crypto.randomBytes
      // Uses alphanumeric charset (0-9, A-Z) excluding confusing chars (0/O, 1/I/L)
      const INVITE_CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 30 chars, avoids 0/O, 1/I/L
      const generateInviteCode = (): string => {
        const bytes = randomBytes(8); // 64 bits of entropy
        let code = '';
        for (let i = 0; i < 8; i++) {
          code += INVITE_CODE_CHARS[bytes[i] % INVITE_CODE_CHARS.length];
        }
        return code;
      };
      
      // Try to generate a unique invite code with retry on collision
      let inviteCode = generateInviteCode();
      let retries = 0;
      const maxRetries = 5;
      
      while (retries < maxRetries) {
        const existingInvite = await storage.getInviteByCode(inviteCode);
        if (!existingInvite) break;
        inviteCode = generateInviteCode();
        retries++;
      }
      
      if (retries >= maxRetries) {
        return res.status(500).json({ message: "Failed to generate unique invite code" });
      }
      
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 7);

      // Convert empty string companyId to null for database compatibility
      const normalizedCompanyId = companyId && companyId.trim() !== "" ? companyId : null;
      
      // For database storage:
      // - "admin" role = System Administrator (profile.role = "admin")
      // - "company_admin" role = Company Administrator (profile.role = "inspector", company_members.role = "admin")
      // - "inspector" role = Inspector (profile.role = "inspector", company_members.role = "inspector")
      const dbRole = getProfileRoleFromInviteRole(role);
      const isCompanyAdminInvite = role === "company_admin";
      
      const invite = await storage.createInvite({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        role: dbRole,
        isCompanyAdmin: isCompanyAdminInvite,
        companyId: normalizedCompanyId,
        projectIds,
        token,
        inviteCode,
        invitedBy: userId,
        expiresAt: expiresAt || defaultExpiry,
        status: "pending",
      });
      
      // Get display role for email
      const displayRole = role === "admin" ? "System Administrator" 
        : role === "company_admin" ? "Company Administrator" 
        : "Inspector";

      // Send invitation email via Resend
      try {
        const { sendEmail } = await import('./replit_integrations/email/client');
        // Always prefer REPLIT_DOMAINS (production) for invite emails since they go to external users
        const baseUrl = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : 'http://localhost:5000';
        
        const inviteLink = `${baseUrl}/accept-invite/${token}`;
        const company = normalizedCompanyId ? await storage.getCompany(normalizedCompanyId) : null;
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">You've Been Invited to Field Daily Reports</h2>
            <p>You have been invited to join${company ? ` <strong>${company.name}</strong> on` : ''} Field Daily Reports as a <strong>${displayRole}</strong>.</p>
            <p>Click the button below to accept your invitation and create your account:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
            </div>
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Or enter this invite code at <strong>${baseUrl}/join</strong>:</p>
              <p style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1f2937; font-family: monospace;">${inviteCode}</p>
            </div>
            <p style="color: #6b7280; font-size: 12px;">This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #6b7280; font-size: 12px;">Field Daily Reports - Construction inspection reporting made simple.</p>
          </div>
        `;

        await sendEmail({
          to: email,
          subject: `You're invited to join${company ? ` ${company.name} on` : ''} Field Daily Reports`,
          html: emailHtml
        });
        
        console.log(`Invitation email sent to ${email}`);
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
        // Don't fail the invite creation, just log the error
      }

      res.status(201).json(invite);
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  app.delete("/api/admin/invites/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const inviteId = req.params.id;
      
      // Get the invite to check authorization
      const allInvites = await storage.getInvites();
      const invite = allInvites.find(i => i.id === inviteId);
      
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      
      // Check authorization: system admin can delete any, company admin can only delete their company's invites
      if (!isEffectiveSystemAdmin(profile)) {
        if (!invite.companyId) {
          return res.status(403).json({ message: "Forbidden: Only system admins can delete invites without a company" });
        }
        
        const isAdminOfCompany = await isCompanyAdmin(userId, invite.companyId);
        if (!isAdminOfCompany) {
          return res.status(403).json({ message: "Forbidden: You can only delete invites for companies you administer" });
        }
      }
      
      await storage.deleteInvite(inviteId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invite:", error);
      res.status(500).json({ message: "Failed to delete invite" });
    }
  });

  app.get("/api/invites/:token", async (req, res) => {
    try {
      const invite = await storage.getInviteByToken(req.params.token);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ message: "This invite has already been used or expired" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        await storage.updateInviteStatus(invite.id, "expired");
        return res.status(400).json({ message: "This invite has expired" });
      }

      res.json({
        email: invite.email,
        role: invite.isClientPortal ? "client" : invite.role,
        isClientPortal: invite.isClientPortal || false,
        isCompanyAdmin: invite.isCompanyAdmin,
        projectIds: invite.projectIds,
      });
    } catch (error) {
      console.error("Error fetching invite:", error);
      res.status(500).json({ message: "Failed to fetch invite" });
    }
  });

  // Lookup invite by short code (for manual entry)
  app.get("/api/invites/code/:code", async (req, res) => {
    try {
      const code = req.params.code.toUpperCase().trim();
      if (!code || code.length !== 8) {
        return res.status(400).json({ message: "Invalid invite code format" });
      }

      const invite = await storage.getInviteByCode(code);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ message: "This invite has already been used or expired" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        await storage.updateInviteStatus(invite.id, "expired");
        return res.status(400).json({ message: "This invite has expired" });
      }

      // Return only the token so frontend can redirect to accept-invite page
      // Don't expose email/role publicly to prevent PII leakage
      res.json({
        token: invite.token,
      });
    } catch (error) {
      console.error("Error fetching invite by code:", error);
      res.status(500).json({ message: "Failed to fetch invite" });
    }
  });

  app.post("/api/invites/:token/accept", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const invite = await storage.getInviteByToken(req.params.token);
      
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ message: "This invite has already been used or expired" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        await storage.updateInviteStatus(invite.id, "expired");
        return res.status(400).json({ message: "This invite has expired" });
      }

      // Determine profile role (admin for System Admin invites, inspector for all others)
      let profileRole: "inspector" | "admin" = invite.role as "inspector" | "admin";
      
      // Determine company member role
      // - isCompanyAdmin = true → company member role is "admin"
      // - isCompanyAdmin = false → company member role is "inspector"
      let companyMemberRole: "inspector" | "admin" = invite.isCompanyAdmin ? "admin" : "inspector";
      
      if (invite.companyId) {
        const company = await storage.getCompany(invite.companyId);
        // Knowland Construction Services members: profile role always inspector, but keep company admin status
        if (company?.name === KNOWLAND_COMPANY_NAME && profileRole === "admin") {
          profileRole = "inspector";
        }
        await storage.addCompanyMember(invite.companyId, userId, companyMemberRole);
      }

      await storage.createOrUpdateUserProfile({
        userId,
        role: profileRole,
        activeCompanyId: invite.companyId || undefined,
        email: invite.email,
        ...(invite.firstName ? { firstName: invite.firstName } : {}),
        ...(invite.lastName ? { lastName: invite.lastName } : {}),
      });

      const projectIds = (invite.projectIds as string[]) || [];

      // Handle client portal invites differently
      if (invite.isClientPortal) {
        // Create client portal user
        const portalUser = await storage.createClientPortalUser({
          userId,
          companyId: invite.companyId!,
          clientId: invite.clientId || null,
          isActive: true,
        });

        // Grant access to specified projects
        for (const projectId of projectIds) {
          await storage.addClientPortalProjectAccess(portalUser.id, projectId);
        }

        // Create minimal profile if needed
        await storage.createOrUpdateUserProfile({
          userId,
          role: "inspector",
          email: invite.email,
          ...(invite.firstName ? { firstName: invite.firstName } : {}),
          ...(invite.lastName ? { lastName: invite.lastName } : {}),
        });

        await storage.updateInviteStatus(invite.id, "accepted");

        return res.json({
          success: true,
          message: "Client portal access granted",
          companyId: invite.companyId,
          projectsAssigned: projectIds.length,
          role: "Client",
          isClientPortal: true,
          portalUserId: portalUser.id,
        });
      }

      for (const projectId of projectIds) {
        await storage.addProjectMember(projectId, userId);
      }

      await storage.updateInviteStatus(invite.id, "accepted");

      // Determine display role for response
      const displayRole = profileRole === "admin" ? "System Administrator" 
        : invite.isCompanyAdmin ? "Company Administrator" 
        : "Inspector";

      res.json({ 
        success: true, 
        message: "Invite accepted successfully",
        companyId: invite.companyId,
        projectsAssigned: projectIds.length,
        role: displayRole,
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  // ========== COMPANY ROUTES ==========
  const createCompanySchema = z.object({
    name: z.string().min(1, "Company name is required"),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    logoPath: z.string().optional(),
  });

  const updateCompanySchema = createCompanySchema.partial();

  // List all companies (for join request dropdown - authenticated users only)
  app.get("/api/companies", isAuthenticated, async (_req, res) => {
    try {
      const companiesList = await storage.getCompanies();
      // Return minimal info for security (id and name only)
      const publicCompanies = companiesList.map(c => ({ id: c.id, name: c.name }));
      res.json(publicCompanies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  // Get all companies (admin only)
  app.get("/api/admin/companies", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const companiesList = await storage.getCompanies();
      res.json(companiesList);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  // Get single company
  app.get("/api/companies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const company = await storage.getCompany(req.params.id);
      
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      // Check if user is a member of this company
      const isMember = await storage.isUserMemberOfCompany(req.params.id, userId);
      const profile = await storage.getUserProfile(userId);
      
      if (!isMember && profile?.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(company);
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ message: "Failed to fetch company" });
    }
  });

  // Create company (admin only)
  app.post("/api/admin/companies", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validated = createCompanySchema.parse(req.body);
      const userId = req.user?.claims?.sub;
      
      // Check if company with same name already exists
      const existingCompany = await storage.getCompanyByName(validated.name);
      if (existingCompany) {
        return res.status(400).json({ message: "A company with this name already exists" });
      }
      
      // Create the company with the creator's ID
      const company = await storage.createCompany({ ...validated, createdById: userId });
      
      // Auto-add creating admin as a member
      await storage.addCompanyMember(company.id, userId, "admin");
      
      res.status(201).json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Failed to create company" });
    }
  });

  // Update company (admin only)
  app.patch("/api/admin/companies/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Fetch existing company to check ownership
      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      const validated = updateCompanySchema.parse(req.body);
      
      // Only the creator can update name and logo
      const isOwner = existingCompany.createdById === userId;
      if (!isOwner) {
        // Remove name and logoPath from the update if not owner
        delete validated.name;
        delete validated.logoPath;
      }
      
      const company = await storage.updateCompany(companyId, validated);
      res.json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating company:", error);
      res.status(500).json({ message: "Failed to update company" });
    }
  });

  // Upload company logo (company admin only)
  app.post("/api/companies/:id/logo", isAuthenticated, companyLogoUpload.single("logo"), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Check if user is a company admin (respects inspector mode)
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Only company admins can upload logos" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No logo file provided" });
      }
      
      // Upload to object storage for persistence
      const ext = path.extname(req.file.originalname) || '.png';
      const filename = `${companyId}${ext}`;
      const logoPath = await objectStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename,
        contentType: req.file.mimetype,
        folder: "logos",
      });
      
      await storage.updateCompany(companyId, { logoPath });
      res.json({ logoPath });
    } catch (error) {
      console.error("Error uploading company logo:", error);
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // Delete company logo (company admin only)
  app.delete("/api/companies/:id/logo", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Check if user is a company admin (respects inspector mode)
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Only company admins can delete logos" });
      }
      
      // Simply clear the logoPath - object storage files don't need explicit deletion
      await storage.updateCompany(companyId, { logoPath: null });
      
      res.json({ message: "Logo deleted" });
    } catch (error) {
      console.error("Error deleting company logo:", error);
      res.status(500).json({ message: "Failed to delete logo" });
    }
  });

  // Delete company (admin only)
  app.delete("/api/admin/companies/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const companyId = req.params.id;
      
      // Check if company has any projects
      const companyProjects = await storage.getProjectsByCompany(companyId);
      if (companyProjects.length > 0) {
        return res.status(400).json({ 
          message: `Cannot delete company with ${companyProjects.length} existing project(s). Please delete the projects first.` 
        });
      }
      
      // Remove all company members
      const members = await storage.getCompanyMembers(companyId);
      for (const member of members) {
        await storage.removeCompanyMember(companyId, member.userId);
      }
      
      // Clear activeCompanyId for users who have this company selected
      await storage.clearActiveCompanyForCompany(companyId);
      
      await storage.deleteCompany(companyId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ message: "Failed to delete company" });
    }
  });

  // ========== COMPANY MEMBERS ==========
  // Get company members
  app.get("/api/companies/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      const members = await storage.getCompanyMembers(companyId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching company members:", error);
      res.status(500).json({ message: "Failed to fetch company members" });
    }
  });

  // Add company member (system admin or company admin)
  app.post("/api/companies/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const { userId, role } = req.body;
      
      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(currentUserId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(currentUserId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      // Strict role validation - reject invalid roles
      const validRoles = ["inspector", "admin"];
      if (role && !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'inspector' or 'admin'" });
      }
      
      const member = await storage.addCompanyMember(companyId, userId, role || "inspector");
      res.status(201).json(member);
    } catch (error) {
      console.error("Error adding company member:", error);
      res.status(500).json({ message: "Failed to add company member" });
    }
  });

  // Update company member role (system admin or company admin)
  app.patch("/api/companies/:id/members/:userId/role", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const targetUserId = req.params.userId;
      const { role } = req.body;
      
      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(currentUserId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(currentUserId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      // Prevent changing own role
      if (targetUserId === currentUserId) {
        return res.status(400).json({ message: "Cannot change your own role" });
      }
      
      // Strict role validation
      const validRoles = ["inspector", "admin"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'inspector' or 'admin'" });
      }
      
      const updatedMember = await storage.updateCompanyMemberRole(companyId, targetUserId, role);
      if (!updatedMember) {
        return res.status(404).json({ message: "Member not found" });
      }
      res.json(updatedMember);
    } catch (error) {
      console.error("Error updating member role:", error);
      res.status(500).json({ message: "Failed to update member role" });
    }
  });

  app.patch("/api/companies/:id/members/:userId/name", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const targetUserId = req.params.userId;

      const nameSchema = z.object({
        firstName: z.string().max(100).optional(),
        lastName: z.string().max(100).optional(),
      }).refine(data => (data.firstName?.trim() || data.lastName?.trim()), {
        message: "At least one name field is required",
      });

      const parseResult = nameSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Validation failed" });
      }

      const { firstName, lastName } = parseResult.data;

      const profile = await storage.getUserProfile(currentUserId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(currentUserId, companyId, profile);

      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }

      const membership = await storage.getCompanyMember(companyId, targetUserId);
      if (!membership) {
        return res.status(404).json({ message: "User is not a member of this company" });
      }

      const targetProfile = await storage.getUserProfile(targetUserId);
      const updateData: any = { userId: targetUserId };

      if (targetProfile) {
        updateData.firstName = firstName !== undefined ? (firstName.trim() || targetProfile.firstName) : targetProfile.firstName;
        updateData.lastName = lastName !== undefined ? (lastName.trim() || targetProfile.lastName) : targetProfile.lastName;
      } else {
        if (firstName !== undefined) updateData.firstName = firstName.trim() || null;
        if (lastName !== undefined) updateData.lastName = lastName.trim() || null;
      }

      const updated = await storage.createOrUpdateUserProfile(updateData);

      const usersUpdate: any = {};
      if (updateData.firstName) usersUpdate.firstName = updateData.firstName;
      if (updateData.lastName) usersUpdate.lastName = updateData.lastName;
      if (Object.keys(usersUpdate).length > 0) {
        await db.update(users).set(usersUpdate).where(eq(users.id, targetUserId));
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating member name:", error);
      res.status(500).json({ message: "Failed to update member name" });
    }
  });

  // Remove company member (system admin or company admin)
  app.delete("/api/companies/:id/members/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const targetUserId = req.params.userId;
      
      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(currentUserId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(currentUserId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      // Prevent removing self
      if (targetUserId === currentUserId) {
        return res.status(400).json({ message: "Cannot remove yourself from the company" });
      }
      
      await storage.removeCompanyMember(companyId, targetUserId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing company member:", error);
      res.status(500).json({ message: "Failed to remove company member" });
    }
  });

  // Get pending member assignments for a company
  app.get("/api/companies/:id/pending-assignments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      const assignments = await storage.getPendingAssignmentsForCompany(companyId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching pending assignments:", error);
      res.status(500).json({ message: "Failed to fetch pending assignments" });
    }
  });

  // Create a pending member assignment (pre-assign role before user logs in)
  app.post("/api/companies/:id/pending-assignments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const { email, role } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      // Check if assignment already exists
      const existing = await storage.getPendingAssignmentsForCompany(companyId);
      if (existing.some(a => a.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ message: "A pending assignment already exists for this email" });
      }
      
      const assignment = await storage.createPendingAssignment({
        email,
        companyId,
        role: role || "inspector",
        createdById: userId,
      });
      
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating pending assignment:", error);
      res.status(500).json({ message: "Failed to create pending assignment" });
    }
  });

  // Delete a pending member assignment
  app.delete("/api/companies/:id/pending-assignments/:assignmentId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const assignmentId = req.params.assignmentId;
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      await storage.deletePendingAssignment(assignmentId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pending assignment:", error);
      res.status(500).json({ message: "Failed to delete pending assignment" });
    }
  });

  // ========== TEAM INSPECTORS (Non-Active Inspector Profiles) ==========
  // Get all team inspectors for a company
  app.get("/api/companies/:id/team-inspectors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      const isMember = await storage.isUserMemberOfCompany(companyId, userId);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess && !isMember) {
        return res.status(403).json({ message: "Access denied." });
      }
      
      const teamInspectors = await storage.getTeamInspectors(companyId);
      res.json(teamInspectors);
    } catch (error) {
      console.error("Error fetching team inspectors:", error);
      res.status(500).json({ message: "Failed to fetch team inspectors" });
    }
  });

  // Get a single team inspector by ID
  app.get("/api/team-inspectors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const inspectorId = req.params.id;
      
      const inspector = await storage.getTeamInspector(inspectorId);
      if (!inspector) {
        return res.status(404).json({ message: "Team inspector not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, inspector.companyId, profile);
      const isMember = await storage.isUserMemberOfCompany(inspector.companyId, userId);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess && !isMember) {
        return res.status(403).json({ message: "Access denied." });
      }
      
      res.json(inspector);
    } catch (error) {
      console.error("Error fetching team inspector:", error);
      res.status(500).json({ message: "Failed to fetch team inspector" });
    }
  });

  // Create a new team inspector
  app.post("/api/companies/:id/team-inspectors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      const { firstName, lastName, email, phone, title, licenseNumber, licenseState, certifications, projectHistory, notes, resumePath } = req.body;
      
      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }
      
      // Check if email already exists in this company
      if (email) {
        const existing = await storage.getTeamInspectorByEmail(companyId, email);
        if (existing) {
          return res.status(400).json({ message: "A team inspector with this email already exists" });
        }
      }
      
      const inspector = await storage.createTeamInspector({
        companyId,
        firstName,
        lastName,
        email,
        phone,
        title,
        licenseNumber,
        licenseState,
        certifications: certifications || [],
        projectHistory: projectHistory || [],
        notes,
        resumePath,
      });
      
      res.status(201).json(inspector);
    } catch (error) {
      console.error("Error creating team inspector:", error);
      res.status(500).json({ message: "Failed to create team inspector" });
    }
  });

  // Update a team inspector
  app.patch("/api/team-inspectors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const inspectorId = req.params.id;
      
      const inspector = await storage.getTeamInspector(inspectorId);
      if (!inspector) {
        return res.status(404).json({ message: "Team inspector not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, inspector.companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      const { firstName, lastName, email, phone, title, licenseNumber, licenseState, certifications, projectHistory, notes, resumePath } = req.body;
      
      // Check if new email already exists (if changing email)
      if (email && email !== inspector.email) {
        const existing = await storage.getTeamInspectorByEmail(inspector.companyId, email);
        if (existing && existing.id !== inspectorId) {
          return res.status(400).json({ message: "A team inspector with this email already exists" });
        }
      }
      
      const updated = await storage.updateTeamInspector(inspectorId, {
        firstName,
        lastName,
        email,
        phone,
        title,
        licenseNumber,
        licenseState,
        certifications,
        projectHistory,
        notes,
        resumePath,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating team inspector:", error);
      res.status(500).json({ message: "Failed to update team inspector" });
    }
  });

  // Delete a team inspector
  app.delete("/api/team-inspectors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const inspectorId = req.params.id;
      
      const inspector = await storage.getTeamInspector(inspectorId);
      if (!inspector) {
        return res.status(404).json({ message: "Team inspector not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, inspector.companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      await storage.deleteTeamInspector(inspectorId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting team inspector:", error);
      res.status(500).json({ message: "Failed to delete team inspector" });
    }
  });

  // Merge team inspector with existing user account
  app.post("/api/team-inspectors/:id/merge", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const inspectorId = req.params.id;
      const { targetUserId } = req.body;
      
      const inspector = await storage.getTeamInspector(inspectorId);
      if (!inspector) {
        return res.status(404).json({ message: "Team inspector not found" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, inspector.companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      if (!targetUserId) {
        return res.status(400).json({ message: "Target user ID is required" });
      }
      
      const merged = await storage.mergeTeamInspectorWithUser(inspectorId, targetUserId);
      res.json(merged);
    } catch (error) {
      console.error("Error merging team inspector:", error);
      res.status(500).json({ message: "Failed to merge team inspector" });
    }
  });

  // Get company projects (system admin or company admin)
  app.get("/api/companies/:id/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      const projects = await storage.getProjectsByCompany(companyId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching company projects:", error);
      res.status(500).json({ message: "Failed to fetch company projects" });
    }
  });

  // ========== USER COMPANIES ==========
  // Get companies for current user (for company switcher)
  app.get("/api/my-companies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companiesWithMembership = await storage.getCompaniesForUser(userId);
      res.json(companiesWithMembership);
    } catch (error) {
      console.error("Error fetching user companies:", error);
      res.status(500).json({ message: "Failed to fetch user companies" });
    }
  });

  // Create own company (any authenticated user can create their own company)
  app.post("/api/my-companies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { name, address, phone, email } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Company name is required" });
      }

      // Check if company with same name already exists
      const existingCompany = await storage.getCompanyByName(name);
      if (existingCompany) {
        // Check if user already has a pending request
        const existingRequest = await storage.getJoinRequestByUserAndCompany(userId, existingCompany.id);
        // Check if user is already a member
        const isMember = await storage.isUserMemberOfCompany(existingCompany.id, userId);
        
        return res.status(409).json({ 
          message: "A company with this name already exists",
          existingCompany: {
            id: existingCompany.id,
            name: existingCompany.name,
          },
          hasPendingRequest: existingRequest?.status === "pending",
          isAlreadyMember: isMember,
        });
      }

      // Create the company with the creator's ID
      const company = await storage.createCompany({ name, address, phone, email, createdById: userId });
      
      // Add the creator as a member with admin role in the company
      await storage.addCompanyMember(company.id, userId, "admin");
      
      // Set this as their active company
      await storage.setActiveCompany(userId, company.id);
      
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Failed to create company" });
    }
  });

  // Get active company details
  app.get("/api/my-company", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json(null);
      }

      const company = await storage.getCompany(profile.activeCompanyId);
      if (!company) {
        return res.json(null);
      }

      // Check if user is an admin of this company
      const membership = await storage.getCompanyMember(profile.activeCompanyId, userId);
      const isCompanyAdmin = membership?.role === "admin";

      res.json({ ...company, isCompanyAdmin });
    } catch (error) {
      console.error("Error fetching active company:", error);
      res.status(500).json({ message: "Failed to fetch active company" });
    }
  });

  // Update active company (only company admins)
  app.patch("/api/my-company", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company selected" });
      }

      // Check if user is an admin of this company
      const membership = await storage.getCompanyMember(profile.activeCompanyId, userId);
      if (membership?.role !== "admin") {
        return res.status(403).json({ message: "Only company admins can update company information" });
      }

      const { name, address, phone, email, website } = req.body;
      const updated = await storage.updateCompany(profile.activeCompanyId, { name, address, phone, email, website });
      res.json(updated);
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ message: "Failed to update company" });
    }
  });

  // Switch active company
  app.post("/api/switch-company", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { companyId } = req.body;
      
      if (!companyId) {
        return res.status(400).json({ message: "Company ID is required" });
      }

      // Verify user is a member of this company
      const isMember = await storage.isUserMemberOfCompany(companyId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "You are not a member of this company" });
      }

      // Set active company and clear active project (project belongs to old company)
      await storage.setActiveCompany(userId, companyId);
      const profile = await storage.setActiveProject(userId, null);
      res.json(profile);
    } catch (error) {
      console.error("Error switching company:", error);
      res.status(500).json({ message: "Failed to switch company" });
    }
  });

  // ========== JOIN REQUESTS ==========
  // Get user's pending join requests
  app.get("/api/my-join-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const requests = await storage.getJoinRequestsForUser(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching join requests:", error);
      res.status(500).json({ message: "Failed to fetch join requests" });
    }
  });

  // Create join request (optionally with a proposed project)
  app.post("/api/join-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { 
        companyId, 
        message,
        projectId,
        proposedProjectName,
        proposedProjectNumber,
        proposedProjectAddress,
        proposedProjectClient
      } = req.body;
      
      if (!companyId) {
        return res.status(400).json({ message: "Company ID is required" });
      }

      // Check if company exists
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      // Check if user is already a member
      const isMember = await storage.isUserMemberOfCompany(companyId, userId);
      if (isMember) {
        return res.status(400).json({ message: "You are already a member of this company" });
      }

      // Check if user already has a pending request
      const existingRequest = await storage.getJoinRequestByUserAndCompany(userId, companyId);
      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return res.status(400).json({ message: "You already have a pending request for this company" });
        }
        if (existingRequest.status === "rejected") {
          return res.status(400).json({ message: "Your previous request was rejected. Please contact the company admin." });
        }
      }

      const request = await storage.createJoinRequest({ 
        userId, 
        companyId, 
        message,
        projectId: projectId || null,
        proposedProjectName: proposedProjectName || null,
        proposedProjectNumber: proposedProjectNumber || null,
        proposedProjectAddress: proposedProjectAddress || null,
        proposedProjectClient: proposedProjectClient || null
      });
      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating join request:", error);
      res.status(500).json({ message: "Failed to create join request" });
    }
  });

  // Get pending join requests for a company (system admin or company admins)
  app.get("/api/companies/:id/join-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Only admins can view join requests" });
      }

      const requests = await storage.getJoinRequestsForCompany(companyId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching company join requests:", error);
      res.status(500).json({ message: "Failed to fetch join requests" });
    }
  });

  // Approve join request (system admin or company admins)
  // If the request includes a proposed project, optionally create it
  app.post("/api/join-requests/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const requestId = req.params.id;
      const { approveProject = true } = req.body; // Default: also approve the proposed project
      
      const request = await storage.getJoinRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: "Join request not found" });
      }

      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, request.companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Only admins can approve join requests" });
      }

      // Update request status
      await storage.updateJoinRequestStatus(requestId, "approved", userId);
      
      // Add user as a member with inspector role
      await storage.addCompanyMember(request.companyId, request.userId, "inspector");
      
      let createdProjectId: string | null = null;
      
      // If there's a proposed project, create it and assign the user
      if (approveProject && (request as any).proposedProjectName && (request as any).proposedProjectNumber) {
        try {
          // Check if project number is unique
          const existingProject = await storage.getProjectByNumber((request as any).proposedProjectNumber);
          if (!existingProject) {
            const newProject = await storage.createProject({
              companyId: request.companyId,
              name: (request as any).proposedProjectName,
              projectNumber: (request as any).proposedProjectNumber,
              address: (request as any).proposedProjectAddress || undefined,
              client: (request as any).proposedProjectClient || undefined,
            });
            createdProjectId = newProject.id;
            
            // Assign the requesting user to this project
            await storage.addProjectMember(newProject.id, request.userId);
          }
        } catch (projectError) {
          console.error("Error creating proposed project:", projectError);
          // Continue with approval even if project creation fails
        }
      }
      
      // If there's an existing project ID referenced, assign user to it
      if ((request as any).projectId) {
        try {
          await storage.addProjectMember((request as any).projectId, request.userId);
        } catch (assignError) {
          console.error("Error assigning user to project:", assignError);
        }
      }
      
      res.json({ 
        message: "Join request approved", 
        createdProjectId 
      });
    } catch (error) {
      console.error("Error approving join request:", error);
      res.status(500).json({ message: "Failed to approve join request" });
    }
  });

  // Reject join request (system admin or company admins)
  app.post("/api/join-requests/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const requestId = req.params.id;
      
      const request = await storage.getJoinRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: "Join request not found" });
      }

      // Check if user is a company admin OR system admin (respects inspector mode)
      const profile = await storage.getUserProfile(userId);
      const hasSystemAdminAccess = isEffectiveSystemAdmin(profile);
      const hasCompanyAdminAccess = await isEffectiveCompanyAdmin(userId, request.companyId, profile);
      
      if (!hasSystemAdminAccess && !hasCompanyAdminAccess) {
        return res.status(403).json({ message: "Only admins can reject join requests" });
      }

      // Update request status
      await storage.updateJoinRequestStatus(requestId, "rejected", userId);
      
      res.json({ message: "Join request rejected" });
    } catch (error) {
      console.error("Error rejecting join request:", error);
      res.status(500).json({ message: "Failed to reject join request" });
    }
  });

  // ========== USER PROJECTS ==========
  // Get projects for current user (respects admin mode for system admins)
  app.get("/api/my-projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // System admins in admin mode see ALL projects
      if (isEffectiveSystemAdmin(profile)) {
        const allProjects = await storage.getProjects();
        return res.json(allProjects);
      }
      
      // Company admins in admin mode see all projects from their companies + assigned projects
      if (profile?.preferAdminMode !== false) {
        const userCompanyMemberships = await storage.getCompaniesForUser(userId);
        const adminCompanyIds = userCompanyMemberships
          .filter(m => m.role === "admin")
          .map(m => m.companyId);
        
        if (adminCompanyIds.length > 0) {
          const allProjects = await storage.getProjects();
          const assignedProjectIds = await storage.getProjectsForUser(userId);
          const filtered = allProjects.filter(p => 
            (p.companyId && adminCompanyIds.includes(p.companyId)) || 
            assignedProjectIds.includes(p.id)
          );
          return res.json(filtered);
        }
      }
      
      // Regular inspectors (or admins in inspector mode): only assigned projects
      // Filter by active company if one is set
      const projectsList = await storage.getAllProjectsForUser(userId);
      const activeCompanyId = profile?.activeCompanyId;
      
      if (activeCompanyId) {
        // Show projects from active company + personal projects (no company)
        const filtered = projectsList.filter(p => 
          p.companyId === activeCompanyId || p.companyId === null
        );
        return res.json(filtered);
      }
      
      res.json(projectsList);
    } catch (error) {
      console.error("Error fetching user projects:", error);
      res.status(500).json({ message: "Failed to fetch user projects" });
    }
  });

  // Create project for user (must be company admin of active company)
  const createMyProjectSchema = z.object({
    name: z.string().min(1, "Project name is required"),
    projectNumber: z.string().min(1, "Project number is required"),
    client: z.string().optional(),
    address: z.string().optional(),
    distributionEmails: z.array(z.string().email()).optional(),
  });

  app.post("/api/my-projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "You must select a company first" });
      }

      // Check if user is a company admin
      const membership = await storage.getCompanyMember(profile.activeCompanyId, userId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only company admins can create projects" });
      }

      // Validate request body with Zod
      const parseResult = createMyProjectSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = parseResult.error.errors.map(e => e.message).join(", ");
        return res.status(400).json({ message: errorMessage });
      }

      const { name, projectNumber, client, address, distributionEmails } = parseResult.data;

      // Check if project number already exists within this company (company-scoped uniqueness)
      const existingProject = await storage.getProjectByNumberAndCompany(projectNumber.trim(), profile.activeCompanyId);
      if (existingProject) {
        return res.status(409).json({ message: "A project with this number already exists in your company" });
      }

      // Create the project
      const project = await storage.createProject({
        companyId: profile.activeCompanyId,
        name: name.trim(),
        projectNumber: projectNumber.trim(),
        client: client?.trim() || null,
        address: address?.trim() || null,
        distributionEmails: distributionEmails || [],
      });

      // Add the creator as a project member
      await storage.addProjectMember(project.id, userId);
      
      // Set as active project
      await storage.setActiveProject(userId, project.id);
      
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Get active project details
  app.get("/api/my-project", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeProjectId) {
        return res.json(null);
      }

      const project = await storage.getProject(profile.activeProjectId);
      res.json(project || null);
    } catch (error) {
      console.error("Error fetching active project:", error);
      res.status(500).json({ message: "Failed to fetch active project" });
    }
  });

  // Switch active project
  app.post("/api/switch-project", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { projectId } = req.body;
      
      // Allow null to clear active project
      if (projectId === null) {
        const profile = await storage.setActiveProject(userId, null);
        return res.json(profile);
      }

      if (!projectId) {
        return res.status(400).json({ message: "Project ID is required" });
      }

      // Get user profile and project
      const userProfile = await storage.getUserProfile(userId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Ensure project belongs to user's active company
      if (userProfile?.activeCompanyId && project.companyId !== userProfile.activeCompanyId) {
        return res.status(403).json({ message: "Project belongs to a different company" });
      }

      // Verify user has access to this project
      const isMember = await storage.isUserMemberOfProject(projectId, userId);
      
      if (!isMember && userProfile?.role !== "admin") {
        return res.status(403).json({ message: "You don't have access to this project" });
      }

      const profile = await storage.setActiveProject(userId, projectId);
      res.json(profile);
    } catch (error) {
      console.error("Error switching project:", error);
      res.status(500).json({ message: "Failed to switch project" });
    }
  });

  // ========== USER PROFILE (auto-create on first access) ==========
  // Helper to check if email should have admin access
  const getAdminEmails = (): string[] => {
    const adminEmails = process.env.ADMIN_EMAILS || "";
    return adminEmails.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  };

  app.get("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userEmail = req.user?.claims?.email?.toLowerCase();
      let profile = await storage.getUserProfile(userId);
      
      // Check if this email should have admin access
      const adminEmails = getAdminEmails();
      const shouldBeAdmin = userEmail && adminEmails.includes(userEmail);
      
      // Auto-create profile if doesn't exist
      if (!profile) {
        profile = await storage.createOrUpdateUserProfile({
          userId,
          role: shouldBeAdmin ? "admin" : "inspector",
        });
      } else if (shouldBeAdmin && profile.role !== "admin") {
        // Upgrade to admin if email is in admin list but profile isn't admin yet
        profile = await storage.createOrUpdateUserProfile({
          userId,
          role: "admin",
        });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Update user profile
  app.patch("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      // Validate request body with Zod schema
      const parseResult = updateUserProfileSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const data = parseResult.data;
      
      // Normalize empty strings to null
      const normalize = (val: string | null | undefined) => val?.trim() || null;
      
      const profileData: any = {
        userId,
        firstName: normalize(data.firstName),
        lastName: normalize(data.lastName),
        phone: normalize(data.phone),
        title: normalize(data.title),
        licenseNumber: normalize(data.licenseNumber),
        licenseState: normalize(data.licenseState),
        certifications: data.certifications || [],
        bio: data.bio !== undefined ? (data.bio?.trim() || null) : undefined,
        education: data.education || undefined,
        references: data.references || undefined,
        contractorCompanyName: normalize(data.contractorCompanyName),
        contractorAddress: normalize(data.contractorAddress),
        contractorPhone: normalize(data.contractorPhone),
        contractorEmail: normalize(data.contractorEmail),
        jobHistory: data.jobHistory || [],
        availabilityDate: normalize(data.availabilityDate),
      };
      const profile = await storage.createOrUpdateUserProfile(profileData);
      
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Profile photo upload
  app.post("/api/profile/photo", isAuthenticated, photoUpload.single("photo"), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!req.file) {
        return res.status(400).json({ message: "No photo file provided" });
      }
      const ext = path.extname(req.file.originalname) || ".jpg";
      const filename = `${randomUUID()}${ext}`;
      const objectPath = await objectStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename,
        contentType: req.file.mimetype,
        folder: "profile-photos",
      });
      await storage.createOrUpdateUserProfile({
        userId,
        profilePhotoPath: objectPath,
      });
      res.json({ profilePhotoPath: objectPath });
    } catch (error) {
      console.error("Error uploading profile photo:", error);
      res.status(500).json({ message: "Failed to upload profile photo" });
    }
  });

  // Profile photo delete
  app.delete("/api/profile/photo", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      await storage.createOrUpdateUserProfile({
        userId,
        profilePhotoPath: null,
      });
      res.json({ message: "Photo removed" });
    } catch (error) {
      console.error("Error removing profile photo:", error);
      res.status(500).json({ message: "Failed to remove profile photo" });
    }
  });

  // AI-generate professional bio from user profile data
  app.post("/api/profile/generate-bio", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const allProjects = await storage.getAllProjectsForUser(userId);
      const projectNames = allProjects.map(p => p.name).filter(Boolean);

      const certEntries = normalizeCerts(profile.certifications);
      const education = (profile.education as any[]) || [];
      const references = (profile.references as any[]) || [];

      const contextParts: string[] = [];
      const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
      if (fullName) contextParts.push(`Name: ${fullName}`);
      if (profile.title) contextParts.push(`Title: ${profile.title}`);
      if (profile.licenseNumber) contextParts.push(`License: ${profile.licenseNumber}${profile.licenseState ? ` (${profile.licenseState})` : ""}`);
      if (certEntries.length > 0) contextParts.push(`Certifications: ${certEntries.map(c => c.name).join(", ")}`);
      if (education.length > 0) {
        const eduStr = education.map((e: any) => `${e.degree} from ${e.school}${e.status ? ` (${e.status})` : ""}`).join("; ");
        contextParts.push(`Education: ${eduStr}`);
      }
      if (projectNames.length > 0) contextParts.push(`Projects worked on: ${projectNames.slice(0, 15).join(", ")}`);
      if (profile.contractorCompanyName) contextParts.push(`Company: ${profile.contractorCompanyName}`);
      const jobHistory = (profile.jobHistory as any[]) || [];
      if (jobHistory.length > 0) {
        const jobStr = jobHistory.map((j: any) => `${j.title} at ${j.company}${j.startDate ? ` (${j.startDate} - ${j.endDate || "Present"})` : ""}`).join("; ");
        contextParts.push(`Work history: ${jobStr}`);
      }
      if (profile.bio) contextParts.push(`Existing bio (to improve upon): ${profile.bio}`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a professional resume writer specializing in construction inspection and engineering. Write a concise, professional bio/summary paragraph (3-5 sentences) for a construction professional based on the provided information. Focus on their experience, qualifications, and expertise. Write in third person. Do not include any headers or labels - just the paragraph text. Do not make up information not provided."
          },
          {
            role: "user",
            content: contextParts.length > 0
              ? `Write a professional bio based on this information:\n${contextParts.join("\n")}`
              : "Write a brief generic professional bio template for a construction inspector that the user can customize."
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const bio = completion.choices[0]?.message?.content?.trim() || "";
      res.json({ bio });
    } catch (error) {
      console.error("Error generating bio:", error);
      res.status(500).json({ message: "Failed to generate bio" });
    }
  });

  async function extractAndParseResume(file: Express.Multer.File): Promise<any> {
    let textContent = "";

    if (file.mimetype === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const pdfData = await PDFParse(file.buffer);
      textContent = pdfData.text;
    } else if (file.mimetype === "text/plain") {
      textContent = file.buffer.toString("utf-8");
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/msword"
    ) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      textContent = result.value;
    }

    if (!textContent || textContent.trim().length < 20) {
      throw new Error("Could not extract enough text from the uploaded file. Please try a different file format.");
    }

    const truncatedText = textContent.substring(0, 15000);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a resume parser for a construction inspection professional. Extract structured data from the resume text and return a JSON object with these fields:
{
  "firstName": "string or null",
  "lastName": "string or null",
  "title": "string or null - professional title/role",
  "phone": "string or null",
  "email": "string or null",
  "bio": "string or null - a 3-5 sentence professional summary. If the resume has a summary/objective section, use that. Otherwise generate one from the content.",
  "licenseNumber": "string or null",
  "licenseState": "string or null - US state abbreviation",
  "certifications": ["array of certification strings like 'ICC Special Inspector', 'AWS CWI', etc."],
  "education": [{"degree": "string", "school": "string", "status": "string or empty - e.g. 'Completed', 'In Progress'"}],
  "references": [{"name": "string", "title": "string", "organization": "string", "email": "string or empty", "phone": "string or empty"}],
  "jobHistory": [{"title": "string", "company": "string", "client": "string or empty", "projectName": "string or empty", "projectNumber": "string or empty", "projectValue": "string or empty", "startDate": "string or empty - YYYY-MM format", "endDate": "string or empty - YYYY-MM format or 'Present'", "description": "string or empty"}],
  "contractorCompanyName": "string or null - if they mention their own company"
}
Return ONLY valid JSON, no markdown, no explanation. Use null for missing top-level fields and empty strings for missing nested fields. For arrays, return empty array if no items found.`
        },
        {
          role: "user",
          content: `Parse the following resume and extract the structured data:\n\n${truncatedText}`
        }
      ],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content?.trim() || "{}";
    return JSON.parse(content);
  }

  app.post("/api/profile/parse-resume", isAuthenticated, resumeUpload.single("resume"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const parsed = await extractAndParseResume(req.file);
      res.json(parsed);
    } catch (error: any) {
      console.error("Error parsing resume:", error);
      const statusCode = error.message?.includes("Could not extract") ? 400 : 500;
      res.status(statusCode).json({ message: error.message || "Failed to parse resume. Please try again." });
    }
  });

  app.post("/api/admin/users/:userId/parse-resume", isAuthenticated, resumeUpload.single("resume"), async (req: any, res) => {
    try {
      const adminUserId = req.user?.claims?.sub;
      const targetUserId = req.params.userId;

      const adminProfile = await storage.getUserProfile(adminUserId);
      const hasSystemAdmin = isEffectiveSystemAdmin(adminProfile);

      const targetProfile = await storage.getUserProfile(targetUserId);
      if (!targetProfile) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!hasSystemAdmin) {
        const memberships = await storage.getCompaniesForUser(targetUserId);
        const adminMemberships = await storage.getCompaniesForUser(adminUserId);
        const sharedCompanyIds = memberships
          .filter((m: any) => adminMemberships.some((am: any) => am.id === m.id))
          .map((m: any) => m.id);
        let hasAccess = false;
        for (const companyId of sharedCompanyIds) {
          if (await isEffectiveCompanyAdmin(adminUserId, companyId, adminProfile)) {
            hasAccess = true;
            break;
          }
        }
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied. Admin rights required." });
        }
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const parsed = await extractAndParseResume(req.file);
      res.json(parsed);
    } catch (error: any) {
      console.error("Error parsing resume for user:", error);
      const statusCode = error.message?.includes("Could not extract") ? 400 : 500;
      res.status(statusCode).json({ message: error.message || "Failed to parse resume. Please try again." });
    }
  });

  app.post("/api/admin/users/:userId/apply-resume", isAuthenticated, async (req: any, res) => {
    try {
      const adminUserId = req.user?.claims?.sub;
      const targetUserId = req.params.userId;

      const adminProfile = await storage.getUserProfile(adminUserId);
      const hasSystemAdmin = isEffectiveSystemAdmin(adminProfile);

      const targetProfile = await storage.getUserProfile(targetUserId);
      if (!targetProfile) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!hasSystemAdmin) {
        const memberships = await storage.getCompaniesForUser(targetUserId);
        const adminMemberships = await storage.getCompaniesForUser(adminUserId);
        const sharedCompanyIds = memberships
          .filter((m: any) => adminMemberships.some((am: any) => am.id === m.id))
          .map((m: any) => m.id);
        let hasAccess = false;
        for (const companyId of sharedCompanyIds) {
          if (await isEffectiveCompanyAdmin(adminUserId, companyId, adminProfile)) {
            hasAccess = true;
            break;
          }
        }
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied. Admin rights required." });
        }
      }

      const data = req.body;
      const updateData: any = {};
      if (data.firstName) updateData.firstName = data.firstName;
      if (data.lastName) updateData.lastName = data.lastName;
      if (data.title) updateData.title = data.title;
      if (data.phone) updateData.phone = data.phone;
      if (data.bio) updateData.bio = data.bio;
      if (data.licenseNumber) updateData.licenseNumber = data.licenseNumber;
      if (data.licenseState) updateData.licenseState = data.licenseState;
      if (data.contractorCompanyName) updateData.contractorCompanyName = data.contractorCompanyName;
      if (data.certifications) updateData.certifications = data.certifications;
      if (data.education) updateData.education = data.education;
      if (data.references) updateData.references = data.references;
      if (data.jobHistory) updateData.jobHistory = data.jobHistory;

      const updated = await storage.updateUserProfile(targetUserId, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error applying resume data to user:", error);
      res.status(500).json({ message: "Failed to apply resume data" });
    }
  });

  app.post("/api/team-inspectors/:id/parse-resume", isAuthenticated, resumeUpload.single("resume"), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const inspectorId = req.params.id;

      const inspector = await storage.getTeamInspector(inspectorId);
      if (!inspector) {
        return res.status(404).json({ message: "Team inspector not found" });
      }

      const profile = await storage.getUserProfile(userId);
      const hasSystemAdmin = isEffectiveSystemAdmin(profile);
      const hasCompanyAdmin = await isEffectiveCompanyAdmin(userId, inspector.companyId, profile);

      if (!hasSystemAdmin && !hasCompanyAdmin) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const parsed = await extractAndParseResume(req.file);
      res.json(parsed);
    } catch (error: any) {
      console.error("Error parsing resume for team inspector:", error);
      res.status(500).json({ message: error.message || "Failed to parse resume. Please try again." });
    }
  });

  app.post("/api/team-inspectors/:id/apply-resume", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const inspectorId = req.params.id;

      const inspector = await storage.getTeamInspector(inspectorId);
      if (!inspector) {
        return res.status(404).json({ message: "Team inspector not found" });
      }

      const profile = await storage.getUserProfile(userId);
      const hasSystemAdmin = isEffectiveSystemAdmin(profile);
      const hasCompanyAdmin = await isEffectiveCompanyAdmin(userId, inspector.companyId, profile);

      if (!hasSystemAdmin && !hasCompanyAdmin) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }

      const data = req.body;
      const updateData: any = {};
      if (data.firstName) updateData.firstName = data.firstName;
      if (data.lastName) updateData.lastName = data.lastName;
      if (data.title) updateData.title = data.title;
      if (data.phone) updateData.phone = data.phone;
      if (data.email) updateData.email = data.email;
      if (data.licenseNumber) updateData.licenseNumber = data.licenseNumber;
      if (data.licenseState) updateData.licenseState = data.licenseState;
      if (data.certifications !== undefined) updateData.certifications = data.certifications;
      if (data.notes) updateData.notes = data.notes;
      if (data.bio) updateData.bio = data.bio;
      if (data.education) updateData.education = data.education;
      if (data.references) updateData.references = data.references;
      if (data.jobHistory) updateData.jobHistory = data.jobHistory;

      const updated = await storage.updateTeamInspector(inspectorId, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error applying resume data to team inspector:", error);
      res.status(500).json({ message: "Failed to apply resume data" });
    }
  });

  // Generate resume PDF for a team inspector (non-user) - must be before :userId route
  app.get("/api/resume/generate/team/:inspectorId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const inspectorId = req.params.inspectorId;

      const profile = await storage.getUserProfile(userId);
      const isAdmin = profile?.role === "admin" || profile?.role === "owner" || profile?.role === "system_owner";
      if (!isAdmin) {
        return res.status(403).json({ message: "Only admins can generate team member resumes" });
      }

      const inspector = await storage.getTeamInspector(inspectorId);
      if (!inspector) {
        return res.status(404).json({ message: "Team inspector not found" });
      }

      const fakeProfile: any = {
        firstName: inspector.firstName,
        lastName: inspector.lastName,
        email: inspector.email,
        phone: inspector.phone,
        title: inspector.title,
        licenseNumber: inspector.licenseNumber,
        licenseState: inspector.licenseState,
        certifications: inspector.certifications,
        bio: inspector.bio,
        education: inspector.education,
        references: inspector.references,
        profilePhotoPath: inspector.profilePhotoPath,
        jobHistory: inspector.jobHistory,
      };

      let photoBuffer: Buffer | null = null;
      if (inspector.profilePhotoPath) {
        try {
          photoBuffer = await objectStorage.downloadBuffer(inspector.profilePhotoPath);
        } catch (e) {
          // Photo download failed
        }
      }

      const company = inspector.companyId ? await storage.getCompany(inspector.companyId) : null;

      let companyLogoBuffer: Buffer | null = null;
      if (company?.logoPath) {
        try {
          if (company.logoPath.startsWith("/storage/")) {
            const localPath = path.join(process.cwd(), company.logoPath);
            const fs = await import("fs");
            if (fs.existsSync(localPath)) {
              companyLogoBuffer = fs.readFileSync(localPath);
            } else {
              const dlPath = company.logoPath.replace("/storage/", "/objects/");
              companyLogoBuffer = await objectStorage.downloadBuffer(dlPath);
            }
          } else {
            companyLogoBuffer = await objectStorage.downloadBuffer(company.logoPath);
          }
        } catch (e) {
          console.log("Could not load company logo for team resume:", e);
        }
      }

      const pdfBuffer = await generateResumePDF({
        profile: fakeProfile,
        projects: [],
        companies: company ? [company] : [],
        clients: [],
        photoBuffer,
        companyLogoBuffer,
        companyName: company?.name,
        companyWebsite: company?.website || undefined,
      });

      const fullName = `${inspector.firstName || ""}_${inspector.lastName || ""}`.trim().replace(/\s+/g, "_") || "resume";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fullName}_Resume.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating team resume:", error);
      res.status(500).json({ message: "Failed to generate team resume" });
    }
  });

  // Generate resume PDF for a user
  app.get("/api/resume/generate/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const requestingUserId = req.user?.claims?.sub;
      const targetUserId = req.params.userId;

      const requestingProfile = await storage.getUserProfile(requestingUserId);
      const isAdmin = requestingProfile?.role === "admin" || requestingProfile?.role === "owner" || requestingProfile?.role === "system_owner";
      const isSelf = requestingUserId === targetUserId;

      if (!isSelf && !isAdmin) {
        return res.status(403).json({ message: "You can only generate your own resume, or you must be an admin" });
      }

      const profile = await storage.getUserProfile(targetUserId);
      if (!profile) {
        return res.status(404).json({ message: "User profile not found" });
      }

      const isAdminRole = profile.role === "system_owner" || profile.role === "admin" || profile.role === "owner";
      const projects = isAdminRole ? [] : await storage.getAllProjectsForUser(targetUserId);

      const companies: any[] = [];
      if (isAdminRole) {
        const memberships = await storage.getCompaniesForUser(targetUserId);
        for (const m of memberships) {
          if (m.company) companies.push(m.company);
        }
      } else {
        const companyIds = [...new Set(projects.map(p => p.companyId).filter(Boolean))];
        for (const cId of companyIds) {
          if (cId) {
            const company = await storage.getCompany(cId);
            if (company) companies.push(company);
          }
        }
      }

      const clientIds = [...new Set(projects.map(p => (p as any).clientId).filter(Boolean))];
      const clients: any[] = [];
      for (const clId of clientIds) {
        if (clId) {
          const client = await storage.getClient(clId);
          if (client) clients.push(client);
        }
      }

      let photoBuffer: Buffer | null = null;
      if (profile.profilePhotoPath) {
        try {
          photoBuffer = await objectStorage.downloadBuffer(profile.profilePhotoPath);
        } catch (e) {
          // Photo download failed, continue without photo
        }
      }

      let companyName: string | undefined;
      let companyLogoBuffer: Buffer | null = null;
      if (companies.length > 0) {
        companyName = companies[0].name;
        const logoPath = companies[0].logoPath;
        if (logoPath) {
          try {
            if (logoPath.startsWith("/storage/")) {
              const localPath = path.join(process.cwd(), logoPath);
              const fs = await import("fs");
              if (fs.existsSync(localPath)) {
                companyLogoBuffer = fs.readFileSync(localPath);
              } else {
                const dlPath = logoPath.replace("/storage/", "/objects/");
                companyLogoBuffer = await objectStorage.downloadBuffer(dlPath);
              }
            } else {
              companyLogoBuffer = await objectStorage.downloadBuffer(logoPath);
            }
          } catch (e) {
            console.log("Could not load company logo for resume:", e);
          }
        }
      }

      const companyWebsite = companies.length > 0 ? companies[0].website || undefined : undefined;

      const pdfBuffer = await generateResumePDF({
        profile,
        projects,
        companies,
        clients,
        photoBuffer,
        companyLogoBuffer,
        companyName,
        companyWebsite,
      });

      const fullName = `${profile.firstName || ""}_${profile.lastName || ""}`.trim().replace(/\s+/g, "_") || "resume";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fullName}_Resume.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating resume:", error);
      res.status(500).json({ message: "Failed to generate resume" });
    }
  });

  // Complete onboarding
  app.post("/api/complete-onboarding", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.createOrUpdateUserProfile({
        userId,
        hasSeenOnboarding: true,
      });
      res.json(profile);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Update admin mode preference (for system admins)
  app.patch("/api/profile/admin-mode", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { preferAdminMode } = req.body;
      
      if (typeof preferAdminMode !== "boolean") {
        return res.status(400).json({ message: "preferAdminMode must be a boolean" });
      }
      
      const profile = await storage.createOrUpdateUserProfile({
        userId,
        preferAdminMode,
      });
      res.json(profile);
    } catch (error) {
      console.error("Error updating admin mode preference:", error);
      res.status(500).json({ message: "Failed to update admin mode preference" });
    }
  });

  // Update theme preference
  app.patch("/api/profile/theme", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { themePreference } = req.body;
      
      if (!["light", "dark"].includes(themePreference)) {
        return res.status(400).json({ message: "themePreference must be 'light' or 'dark'" });
      }
      
      const profile = await storage.createOrUpdateUserProfile({
        userId,
        themePreference,
      });
      res.json(profile);
    } catch (error) {
      console.error("Error updating theme preference:", error);
      res.status(500).json({ message: "Failed to update theme preference" });
    }
  });

  // ========== VOICE TRANSCRIPTION ==========
  app.post("/api/transcribe", isAuthenticated, async (req: any, res) => {
    try {
      const { audio, format = "webm" } = req.body;
      
      if (!audio) {
        return res.status(400).json({ message: "Audio data is required" });
      }

      const audioBuffer = Buffer.from(audio, "base64");
      const transcript = await speechToText(audioBuffer, format as "wav" | "mp3" | "webm");
      
      res.json({ transcript });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  // AI-powered form field parsing from voice transcript
  app.post("/api/parse-report-voice", isAuthenticated, async (req: any, res) => {
    try {
      const { transcript, targetField } = req.body;
      
      if (!transcript) {
        return res.status(400).json({ message: "Transcript is required" });
      }

      // For simple text fields, formalize the transcript with proper construction terminology
      if (targetField === "raw") {
        const formalizeResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { 
              role: "system", 
              content: `You are a professional construction documentation assistant. Convert voice transcripts into formal, well-written text suitable for official daily construction reports.

Guidelines:
- Use proper grammar, punctuation, and capitalization
- Use formal construction terminology (e.g., "reinforcement" instead of "rebar", "formwork" instead of "forms", "MEP" for mechanical/electrical/plumbing)
- Start sentences with action verbs when appropriate: Completed, Continued, Performed, Installed, Coordinated, Inspected, Observed, Verified
- Use professional phrasing (e.g., "per approved drawings", "in accordance with specifications", "as directed by")
- Maintain the original meaning while improving clarity and professionalism
- Return ONLY the formatted text, no explanations or quotes` 
            },
            { role: "user", content: `Format this voice transcript into professional construction report text:\n\n"${transcript}"` }
          ],
          temperature: 0.3,
        });
        
        const formalizedText = formalizeResponse.choices[0]?.message?.content?.trim() || transcript;
        return res.json({ text: formalizedText });
      }

      // For structured parsing (work activities, visitors, etc.), use AI
      const systemPrompt = `You are a professional construction documentation assistant that converts voice transcripts into formal, industry-standard daily report entries.
You work for construction inspectors creating official field documentation.
Use proper construction terminology, formal language, and professional phrasing.
Capitalize trade names properly (e.g., "Electrical Subcontractor", "Mechanical Contractor", "Plumbing Crew").
Use action verbs like: performed, completed, installed, continued, coordinated, inspected, prepared, executed.
Return ONLY valid JSON, no explanations.`;

      let userPrompt = "";
      
      switch (targetField) {
        case "workActivities":
          userPrompt = `Extract and formalize work activities from this voice transcript into professional construction report entries.

For each activity, provide:
- contractor: Use formal naming (e.g., "Electrical Subcontractor", "ABC Mechanical, Inc.", "General Contractor Crew", "Plumbing Contractor"). Capitalize properly.
- headcount: Number of workers as an integer (default 0 if not specified)
- workDescription: Formal description using professional construction terminology. Start with action verbs like "Completed", "Continued", "Performed", "Installed", "Coordinated". Use proper terminology (e.g., "underground utilities" not "pipes", "formwork" not "forms", "reinforcement" not "rebar").

Examples of formal work descriptions:
- "Completed underground utility rough-in per approved drawings"
- "Continued installation of structural steel connections at grid lines A-C"
- "Performed layout and coordination for MEP systems"
- "Installed CMU block wall at building perimeter"

Return as JSON array: [{"contractor": "Formal Contractor Name", "headcount": 0, "workDescription": "Professional work description"}]

Transcript: "${transcript}"`;
          break;
          
        case "visitors":
          userPrompt = `Extract and formalize visitor information from this voice transcript for a construction daily report.

For each visitor, provide:
- name: Full name with proper capitalization
- company: Formal company/organization name (e.g., "Division of the State Architect", "General Contractor", "Owner's Representative", "City Building Department")
- purpose: Formal purpose using professional language (e.g., "Conducted structural inspection", "Project coordination meeting", "Quality assurance walkthrough", "Progress review and site observation")

Return as JSON array: [{"name": "Full Name", "company": "Formal Company Name", "purpose": "Professional purpose description"}]

Transcript: "${transcript}"`;
          break;
          
        case "weather":
          userPrompt = `Extract weather information from this transcript.
Return as JSON: {"type": "clear|cloudy|rain|wind|heat|cold", "notes": "Temperature and conditions in professional format"}

Transcript: "${transcript}"`;
          break;
          
        default:
          return res.json({ text: transcript });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content || "";
      
      // Try to parse as JSON
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json({ data: parsed });
        }
      } catch {
        // If parsing fails, return the raw text
      }
      
      res.json({ text: content });
    } catch (error) {
      console.error("Error parsing voice transcript:", error);
      res.status(500).json({ message: "Failed to parse voice transcript" });
    }
  });

  // ========== STRIPE SUBSCRIPTION ROUTES ==========
  
  // Get subscription products and prices
  app.get("/api/subscription/products", isAuthenticated, async (req: any, res) => {
    try {
      const { stripeService } = await import("./stripeService");
      const rows = await stripeService.listProductsWithPrices();
      
      // Group prices by product
      const productsMap = new Map<string, any>();
      for (const row of rows) {
        const productId = (row as any).product_id;
        if (!productsMap.has(productId)) {
          productsMap.set(productId, {
            id: productId,
            name: (row as any).product_name,
            description: (row as any).product_description,
            active: (row as any).product_active,
            metadata: (row as any).product_metadata,
            prices: []
          });
        }
        if ((row as any).price_id) {
          productsMap.get(productId).prices.push({
            id: (row as any).price_id,
            unit_amount: (row as any).unit_amount,
            currency: (row as any).currency,
            recurring: (row as any).recurring,
            active: (row as any).price_active,
            metadata: (row as any).price_metadata,
          });
        }
      }
      
      res.json({ products: Array.from(productsMap.values()) });
    } catch (error) {
      console.error("Error fetching subscription products:", error);
      res.status(500).json({ message: "Failed to fetch subscription products" });
    }
  });

  // Get Stripe publishable key
  app.get("/api/subscription/config", isAuthenticated, async (req: any, res) => {
    try {
      const { getStripePublishableKey } = await import("./stripeClient");
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error fetching Stripe config:", error);
      res.status(500).json({ message: "Failed to fetch Stripe config" });
    }
  });

  // Get user's subscription status
  app.get("/api/subscription/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companies = await storage.getCompaniesForUser(userId);
      
      // Check if user is a Knowland Construction Services member (bypass all limits)
      const isKnowland = await isKnowlandMember(userId);
      
      // Check if user has any active company subscriptions
      const activeCompanySubscription = companies.find(c => 
        (c as any).company?.subscriptionStatus === 'active'
      );
      
      // Determine subscription type
      let subscriptionType: 'company' | 'independent' | 'free' = 'free'; // default - independent free tier
      let hasActiveSubscription = false;
      let status = profile?.subscriptionStatus || 'none';
      const FREE_TIER_LIMIT = 5;
      
      // Knowland members bypass all subscription limits
      if (isKnowland) {
        subscriptionType = 'company';
        hasActiveSubscription = true;
        status = 'active';
      } else if (activeCompanySubscription) {
        // User is part of a company with active subscription
        subscriptionType = 'company';
        hasActiveSubscription = true;
        status = 'active';
      } else if (profile?.subscriptionStatus === 'active') {
        // User has personal subscription
        subscriptionType = 'independent';
        hasActiveSubscription = true;
      }
      
      res.json({
        hasActiveSubscription,
        subscriptionType,
        status,
        currentPeriodEnd: null, // Could fetch from Stripe if needed
        monthlyReportCount: profile?.monthlyReportCount || 0,
        reportLimit: hasActiveSubscription ? null : FREE_TIER_LIMIT,
      });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });
  
  // Get subscription prices
  app.get("/api/subscription/prices", isAuthenticated, async (req: any, res) => {
    try {
      // Query from stripe.prices and stripe.products tables
      const results = await db.execute(sql`
        SELECT 
          p.id as price_id,
          p.unit_amount,
          p.currency,
          p.recurring,
          p.active as price_active,
          p.metadata as price_metadata,
          pr.id as product_id,
          pr.name as product_name,
          pr.description as product_description,
          pr.metadata as product_metadata,
          pr.active as product_active
        FROM stripe.prices p
        JOIN stripe.products pr ON p.product = pr.id
        WHERE p.active = true AND pr.active = true
        ORDER BY p.unit_amount ASC
      `);
      
      const prices = results.rows.map((row: any) => ({
        id: row.price_id,
        unit_amount: row.unit_amount,
        currency: row.currency,
        recurring: row.recurring,
        product: {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata,
        }
      }));
      
      res.json(prices);
    } catch (error) {
      console.error("Error fetching subscription prices:", error);
      res.status(500).json({ message: "Failed to fetch subscription prices" });
    }
  });

  // Create checkout session for user subscription
  app.post("/api/subscription/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { priceId, type } = req.body; // type: 'independent_pro' | 'company_user' | 'company'
      
      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required" });
      }
      
      const { stripeService } = await import("./stripeService");
      const profile = await storage.getUserProfile(userId);
      const user = await storage.getUserById(userId);
      
      // Create or get Stripe customer
      let customerId = profile?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          user?.email || '',
          userId,
          `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || undefined
        );
        await storage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        `${baseUrl}/subscription/cancel`,
        { userId, type: type || 'independent_pro' }
      );
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Create checkout session from pricing page (for new company subscriptions)
  app.post("/api/stripe/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { priceId, companyId } = req.body;
      
      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required" });
      }
      
      const { stripeService } = await import("./stripeService");
      const { getUncachableStripeClient } = await import("./stripeClient");
      const profile = await storage.getUserProfile(userId);
      
      let resolvedPriceId = priceId;
      if (priceId.startsWith('price_') && !priceId.startsWith('price_1')) {
        const stripe = await getUncachableStripeClient();
        const prices = await stripe.prices.list({ lookup_keys: [priceId], limit: 1 });
        if (prices.data.length > 0) {
          resolvedPriceId = prices.data[0].id;
        } else {
          return res.status(400).json({ message: `Price with lookup key '${priceId}' not found. Please run the seed script to create Stripe products.` });
        }
      }
      
      let customerId: string | undefined;
      let metadata: Record<string, string> = {};
      
      if (companyId) {
        const company = await storage.getCompany(companyId);
        if (!company) {
          return res.status(404).json({ message: "Company not found" });
        }
        
        const isCompAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
        if (!isCompAdmin && !isEffectiveSystemAdmin(profile)) {
          return res.status(403).json({ message: "Only company admins can manage company subscriptions" });
        }
        
        customerId = company.stripeCustomerId || undefined;
        if (!customerId) {
          const customer = await stripeService.createCustomer(
            company.email || profile?.email || '',
            companyId,
            company.name
          );
          await storage.updateCompany(companyId, { stripeCustomerId: customer.id });
          customerId = customer.id;
        }
        metadata = { companyId, type: 'company' };
      } else {
        customerId = profile?.stripeCustomerId || undefined;
        if (!customerId) {
          const customer = await stripeService.createCustomer(
            profile?.email || '',
            userId,
            `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || 'User'
          );
          await storage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
          customerId = customer.id;
        }
        metadata = { userId, type: 'user' };
      }
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const successUrl = companyId 
        ? `${baseUrl}/company/dashboard?subscription=success`
        : `${baseUrl}/dashboard?subscription=success`;
      const cancelUrl = companyId 
        ? `${baseUrl}/pricing?companyId=${companyId}`
        : `${baseUrl}/pricing`;
      
      const session = await stripeService.createCheckoutSession(
        customerId,
        resolvedPriceId,
        successUrl,
        cancelUrl,
        metadata
      );
      
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: error.message || "Failed to create checkout session" });
    }
  });

  // Create checkout session for company subscription
  app.post("/api/subscription/company-checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { priceId, companyId } = req.body;
      
      if (!priceId || !companyId) {
        return res.status(400).json({ message: "Price ID and Company ID are required" });
      }
      
      // Check if user is admin of this company
      const profile = await storage.getUserProfile(userId);
      const isCompanyAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isCompanyAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can manage company subscriptions" });
      }
      
      const { stripeService } = await import("./stripeService");
      const company = await storage.getCompany(companyId);
      
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      // Create or get Stripe customer for company
      let customerId = company.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          company.email || '',
          companyId,
          company.name
        );
        await storage.updateCompany(companyId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}&company=${companyId}`,
        `${baseUrl}/subscription/cancel`,
        { companyId, type: 'company' }
      );
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating company checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Create customer portal session
  app.post("/api/subscription/portal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { companyId } = req.body;
      
      const { stripeService } = await import("./stripeService");
      let customerId: string | null | undefined;
      
      if (companyId) {
        // Company billing portal
        const profile = await storage.getUserProfile(userId);
        const isCompanyAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
        if (!isCompanyAdmin && !isEffectiveSystemAdmin(profile)) {
          return res.status(403).json({ message: "Only company admins can access billing" });
        }
        const company = await storage.getCompany(companyId);
        customerId = company?.stripeCustomerId;
      } else {
        // User billing portal
        const profile = await storage.getUserProfile(userId);
        customerId = profile?.stripeCustomerId;
      }
      
      if (!customerId) {
        return res.status(400).json({ message: "No billing account found" });
      }
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCustomerPortalSession(
        customerId,
        `${baseUrl}/settings`
      );
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  // Seed demo data endpoint (admin only)
  app.post("/api/admin/seed-demo-data", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company selected" });
      }
      
      // Check if user is company admin
      const isAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can seed demo data" });
      }
      
      const { seedDemoData } = await import("./seed-demo-data");
      const result = await seedDemoData(profile.activeCompanyId, userId);
      
      res.json(result);
    } catch (error) {
      console.error("Error seeding demo data:", error);
      res.status(500).json({ message: "Failed to seed demo data", error: String(error) });
    }
  });

  // ============ MEETINGS ROUTES ============

  // Get meetings for the active company (admin only)
  app.get("/api/meetings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can view meetings" });
      }

      const projectId = req.query.projectId as string | undefined;
      const meetingsList = await storage.getMeetings(profile.activeCompanyId, { projectId });
      res.json(meetingsList);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      res.status(500).json({ message: "Failed to fetch meetings" });
    }
  });

  // Get a single meeting by ID (admin only)
  app.get("/api/meetings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const meeting = await storage.getMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, meeting.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can view meetings" });
      }

      res.json(meeting);
    } catch (error) {
      console.error("Error fetching meeting:", error);
      res.status(500).json({ message: "Failed to fetch meeting" });
    }
  });

  // Create a new meeting (admin only)
  app.post("/api/meetings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ message: "No active company" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, profile.activeCompanyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can create meetings" });
      }

      const meetingTypes = ["progress", "safety", "coordination", "oac", "pre_construction", "other"];
      if (!req.body.meetingType || !meetingTypes.includes(req.body.meetingType)) {
        return res.status(400).json({ message: "Invalid meeting type" });
      }
      if (!req.body.projectId) {
        return res.status(400).json({ message: "Project ID is required" });
      }
      if (!req.body.meetingDate) {
        return res.status(400).json({ message: "Meeting date is required" });
      }

      const meetingNumber = await storage.getNextMeetingNumber(profile.activeCompanyId, req.body.meetingType);

      const allowedFields = [
        "meetingType", "projectId", "meetingDate", "startTime", "endTime",
        "location", "attendees", "absentees", "agenda", "discussionItems",
        "decisions", "notes", "preparedBy", "nextMeetingDate", "meetingStatus",
      ];
      const sanitized: any = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          sanitized[key] = req.body[key];
        }
      }

      const meeting = await storage.createMeeting({
        ...sanitized,
        companyId: profile.activeCompanyId,
        meetingNumber,
        createdBy: userId,
      });

      res.status(201).json(meeting);
    } catch (error) {
      console.error("Error creating meeting:", error);
      res.status(500).json({ message: "Failed to create meeting" });
    }
  });

  // Update a meeting (admin only)
  app.patch("/api/meetings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const meeting = await storage.getMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, meeting.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can edit meetings" });
      }

      const allowedUpdateFields = [
        "meetingType", "projectId", "meetingDate", "startTime", "endTime",
        "location", "attendees", "absentees", "agenda", "discussionItems",
        "decisions", "notes", "preparedBy", "nextMeetingDate", "meetingStatus",
      ];
      const sanitized: any = {};
      for (const key of allowedUpdateFields) {
        if (req.body[key] !== undefined) {
          sanitized[key] = req.body[key];
        }
      }

      const updated = await storage.updateMeeting(req.params.id, sanitized);
      res.json(updated);
    } catch (error) {
      console.error("Error updating meeting:", error);
      res.status(500).json({ message: "Failed to update meeting" });
    }
  });

  // Delete a meeting (admin only)
  app.delete("/api/meetings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const meeting = await storage.getMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, meeting.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can delete meetings" });
      }

      await storage.deleteMeeting(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting meeting:", error);
      res.status(500).json({ message: "Failed to delete meeting" });
    }
  });

  // Upload audio and generate AI transcription/summary for a meeting
  app.post("/api/meetings/:id/audio", isAuthenticated, audioUpload.single("audio"), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const meeting = await storage.getMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, meeting.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can upload audio" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      // Upload audio to object storage
      const audioKey = await objectStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename: `meetings/${meeting.companyId}/${meeting.id}/audio-${Date.now()}${path.extname(req.file.originalname)}`,
        contentType: req.file.mimetype,
        folder: "meetings",
      });

      // Update meeting with audio file key and set status to processing
      await storage.updateMeeting(meeting.id, {
        audioFileKey: audioKey,
        aiGenerationStatus: "processing",
      });

      // Start AI processing in the background
      (async () => {
        try {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI();

          // Transcribe the audio using toFile for Node.js compatibility
          const { toFile } = await import("openai");
          const audioFile = await toFile(req.file.buffer, req.file.originalname, { type: req.file.mimetype });
          const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
          });

          const transcriptionText = transcription.text;

          // Generate AI summary, action items, decisions, and key points
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are a construction meeting minutes assistant. Analyze the meeting transcription and extract structured information. Respond in JSON format with these fields:
- summary: A concise 2-3 paragraph summary of the meeting
- actionItems: A bulleted list of action items with assignees if mentioned
- decisions: A bulleted list of key decisions made
- keyPoints: A bulleted list of key discussion points and takeaways`
              },
              {
                role: "user",
                content: `Meeting Type: ${meeting.meetingType}\nMeeting Date: ${meeting.meetingDate}\n\nTranscription:\n${transcriptionText}`
              }
            ],
            response_format: { type: "json_object" },
          });

          const aiResult = JSON.parse(completion.choices[0]?.message?.content || "{}");

          await storage.updateMeeting(meeting.id, {
            transcription: transcriptionText,
            aiSummary: aiResult.summary || null,
            aiActionItems: aiResult.actionItems || null,
            aiDecisions: aiResult.decisions || null,
            aiKeyPoints: aiResult.keyPoints || null,
            aiGenerationStatus: "completed",
          });
        } catch (aiError) {
          console.error("AI processing error for meeting:", aiError);
          await storage.updateMeeting(meeting.id, {
            aiGenerationStatus: "failed",
          });
        }
      })();

      res.json({ message: "Audio uploaded, AI processing started" });
    } catch (error) {
      console.error("Error uploading meeting audio:", error);
      res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  // Generate meeting minutes PDF
  app.post("/api/meetings/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const meeting = await storage.getMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, meeting.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can generate meeting PDFs" });
      }

      const project = await storage.getProject(meeting.projectId);
      const company = await storage.getCompany(meeting.companyId);

      const loadImageBuffer = async (imagePath: string): Promise<Buffer | null> => {
        try {
          if (imagePath.startsWith('/objects/')) {
            return await objectStorage.downloadBuffer(imagePath);
          }
          if (imagePath.startsWith('/storage/uploads/')) {
            try {
              const filename = imagePath.split('/').pop();
              const objectPath = `/objects/photos/${filename}`;
              return await objectStorage.downloadBuffer(objectPath);
            } catch (objErr) {
              return null;
            }
          }
          return null;
        } catch (err) {
          console.error('Error loading image:', err);
          return null;
        }
      };

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));

      const pdfPromise = new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(buffers)));
      });

      const pageWidth = 512;
      const startX = 50;
      let y = 50;

      // Company logo
      if (company?.logoPath) {
        try {
          const logoBuffer = await loadImageBuffer(company.logoPath);
          if (logoBuffer) {
            doc.image(logoBuffer, startX, y, { width: 230, height: 86, fit: [230, 86] });
            y += 90;
          }
        } catch (err) {
          console.error("Error adding company logo to meeting PDF:", err);
        }
      }

      // Title
      doc.fontSize(16).font("Helvetica-Bold").text("MEETING MINUTES", startX, y, { width: pageWidth, align: "center" });
      y += 30;

      // Meeting info box
      const meetingTypeLabels: Record<string, string> = {
        progress: "Progress Meeting",
        safety: "Safety Meeting",
        coordination: "Coordination Meeting",
        oac: "OAC Meeting",
        pre_construction: "Pre-Construction Meeting",
        other: "Meeting",
      };

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text(`Meeting: ${meetingTypeLabels[meeting.meetingType] || meeting.meetingType}`, startX, y);
      doc.text(`Number: ${meeting.meetingNumber}`, startX + 260, y);
      y += 16;

      doc.font("Helvetica");
      doc.text(`Project: ${project?.name || "N/A"}`, startX, y);
      y += 14;
      doc.text(`Date: ${meeting.meetingDate}`, startX, y);
      doc.text(`Time: ${meeting.startTime || ""} - ${meeting.endTime || ""}`, startX + 260, y);
      y += 14;
      doc.text(`Location: ${meeting.location || "N/A"}`, startX, y);
      y += 14;
      doc.text(`Prepared By: ${meeting.preparedBy || "N/A"}`, startX, y);
      y += 20;

      // Horizontal line
      doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
      y += 10;

      // Helper for sections
      const addSection = (title: string, content: string | null) => {
        if (!content) return;
        if (y > 680) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(11).font("Helvetica-Bold").text(title, startX, y);
        y += 16;
        doc.fontSize(10).font("Helvetica").text(content, startX, y, { width: pageWidth });
        y = doc.y + 12;
      };

      addSection("ATTENDEES", meeting.attendees);
      if (meeting.absentees) addSection("ABSENT", meeting.absentees);
      addSection("AGENDA", meeting.agenda);
      addSection("DISCUSSION", meeting.discussionItems);
      addSection("DECISIONS", meeting.decisions);
      addSection("NOTES", meeting.notes);

      if (meeting.nextMeetingDate) {
        addSection("NEXT MEETING", `Scheduled for: ${meeting.nextMeetingDate}`);
      }

      // AI Generated Content
      if (meeting.aiSummary || meeting.aiActionItems || meeting.aiDecisions || meeting.aiKeyPoints) {
        if (y > 680) {
          doc.addPage();
          y = 50;
        }
        doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
        y += 10;
        doc.fontSize(12).font("Helvetica-Bold").text("AI-GENERATED INSIGHTS", startX, y);
        y += 20;

        addSection("SUMMARY", meeting.aiSummary);
        addSection("ACTION ITEMS", meeting.aiActionItems);
        addSection("KEY DECISIONS", meeting.aiDecisions);
        addSection("KEY POINTS", meeting.aiKeyPoints);
      }

      // Footer
      doc.fontSize(8).font("Helvetica")
        .text(`Generated on ${new Date().toLocaleDateString()}`, startX, 730, { width: pageWidth, align: "center" });

      doc.end();

      const pdfBuffer = await pdfPromise;

      // Save to object storage
      const pdfKey = await objectStorage.uploadBuffer({
        buffer: pdfBuffer,
        filename: `${meeting.id}/minutes-${meeting.meetingNumber}.pdf`,
        contentType: "application/pdf",
        folder: "meetings",
      });
      await storage.updateMeeting(meeting.id, { pdfPath: pdfKey });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Meeting-Minutes-${meeting.meetingNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating meeting PDF:", error);
      res.status(500).json({ message: "Failed to generate meeting PDF" });
    }
  });

  // View meeting PDF
  app.get("/api/meetings/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const meeting = await storage.getMeeting(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, meeting.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only company admins can view meeting PDFs" });
      }

      if (!meeting.pdfPath) {
        return res.status(404).json({ message: "No PDF generated yet" });
      }

      const pdfBuffer = await objectStorage.downloadBuffer(meeting.pdfPath);
      if (!pdfBuffer) {
        return res.status(404).json({ message: "PDF file not found" });
      }

      const isDownload = req.query.download === "true";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${isDownload ? "attachment" : "inline"}; filename="Meeting-Minutes-${meeting.meetingNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error viewing meeting PDF:", error);
      res.status(500).json({ message: "Failed to view meeting PDF" });
    }
  });

  // ========== CLIENT PORTAL ROUTES ==========

  // Check if current user is a client portal user
  app.get("/api/client-portal/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const portalUsers = await storage.getClientPortalUsersByUserId(userId);
      if (portalUsers.length === 0) {
        return res.json({ isClientPortalUser: false, portals: [] });
      }
      res.json({
        isClientPortalUser: true,
        portals: portalUsers.map(pu => ({
          id: pu.id,
          companyId: pu.companyId,
          companyName: (pu as any).company?.name || "Unknown",
          clientName: (pu as any).client?.name || null,
          isActive: pu.isActive,
        })),
      });
    } catch (error) {
      console.error("Error checking client portal status:", error);
      res.status(500).json({ message: "Failed to check portal status" });
    }
  });

  // Convenience: Get client portal projects (auto-detect portal user from session)
  app.get("/api/client-portal/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const portalUsers = await storage.getClientPortalUsersByUserId(userId);
      if (portalUsers.length === 0) {
        return res.status(403).json({ message: "Not a client portal user" });
      }
      const portalUser = portalUsers[0];
      const projectAccess = await storage.getClientPortalProjectAccess(portalUser.id);
      const projectsWithData = await Promise.all(
        projectAccess.map(async (pa) => {
          const project = pa.project || await storage.getProject(pa.projectId);
          if (!project) return null;
          const reports = await storage.getReportsByProject(project.id);
          const submittedReports = reports.filter(r => r.status === "submitted");
          let scheduleProgress = 0;
          if (project.startDate && project.substantialCompletionDate) {
            const start = new Date(project.startDate).getTime();
            const end = new Date(project.substantialCompletionDate).getTime();
            const now = Date.now();
            if (end > start) {
              scheduleProgress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
            }
          }
          return {
            id: project.id,
            name: project.name,
            projectNumber: project.projectNumber,
            address: project.address,
            status: submittedReports.length > 0 ? "active" : "pending",
            startDate: project.startDate,
            substantialCompletionDate: project.substantialCompletionDate,
            scheduleProgress,
            totalReports: submittedReports.length,
            latestReportDate: submittedReports.length > 0
              ? submittedReports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
              : null,
          };
        })
      );
      const company = await storage.getCompany(portalUser.companyId);
      res.json({
        companyName: company?.name || "Unknown",
        companyLogo: company?.logoPath || null,
        projects: projectsWithData.filter(Boolean),
      });
    } catch (error) {
      console.error("Error fetching client portal projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Convenience: Get client portal project dashboard data (auto-detect portal user)
  app.get("/api/client-portal/projects/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const portalUsers = await storage.getClientPortalUsersByUserId(userId);
      if (portalUsers.length === 0) {
        return res.status(403).json({ message: "Not a client portal user" });
      }
      const portalUser = portalUsers[0];
      const projectAccess = await storage.getClientPortalProjectAccess(portalUser.id);
      if (!projectAccess.find(pa => pa.projectId === req.params.projectId)) {
        return res.status(403).json({ message: "No access to this project" });
      }
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const company = await storage.getCompany(portalUser.companyId);
      const allReports = await storage.getReportsByProject(req.params.projectId);
      const reports = allReports
        .filter(r => r.status === "submitted")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const photoPromises = reports.slice(0, 20).map(async r => {
        const photos = await storage.getPhotosByReport(r.id);
        return photos.map(p => ({
          ...p,
          reportDate: r.date,
        }));
      });
      const allPhotos = (await Promise.all(photoPromises)).flat();
      let scheduleProgress = 0;
      if (project.startDate && project.substantialCompletionDate) {
        const start = new Date(project.startDate).getTime();
        const end = new Date(project.substantialCompletionDate).getTime();
        const now = Date.now();
        if (end > start) {
          scheduleProgress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
        }
      }
      const issues: any[] = [];
      const safetyIncidents: any[] = [];
      for (const r of reports) {
        if (r.issues) {
          try {
            const parsed = typeof r.issues === 'string' ? JSON.parse(r.issues) : r.issues;
            if (Array.isArray(parsed)) {
              issues.push(...parsed.map((i: any) => ({ ...i, reportDate: r.date })));
            }
          } catch {}
        }
        if (r.safetyIncidents) {
          try {
            const parsed = typeof r.safetyIncidents === 'string' ? JSON.parse(r.safetyIncidents) : r.safetyIncidents;
            if (Array.isArray(parsed)) {
              safetyIncidents.push(...parsed.map((i: any) => ({ ...i, reportDate: r.date })));
            }
          } catch {}
        }
      }
      const weatherSummary = reports.slice(0, 7).map(r => ({
        date: r.date,
        weather: r.weather,
        temperature: r.temperature,
      }));
      res.json({
        project: {
          id: project.id,
          name: project.name,
          projectNumber: project.projectNumber,
          address: project.address,
          client: project.client,
          startDate: project.startDate,
          substantialCompletionDate: project.substantialCompletionDate,
        },
        company: {
          name: company?.name,
          logoPath: company?.logoPath,
        },
        schedule: {
          progress: scheduleProgress,
          startDate: project.startDate,
          endDate: project.substantialCompletionDate,
        },
        reports: reports.slice(0, 30).map(r => ({
          id: r.id,
          date: r.date,
          reportNumber: r.reportNumber,
          weather: r.weather,
          temperature: r.temperature,
          inspectorName: r.inspectorName,
          status: r.status,
        })),
        totalReports: reports.length,
        photos: allPhotos.slice(0, 24),
        issues: issues.slice(0, 20),
        safetyIncidents: safetyIncidents.slice(0, 20),
        weatherSummary,
      });
    } catch (error) {
      console.error("Error fetching client portal project data:", error);
      res.status(500).json({ message: "Failed to fetch project data" });
    }
  });

  // Get client portal projects (with portal user ID)
  app.get("/api/client-portal/:portalUserId/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const portalUserId = req.params.portalUserId;

      const portalUsers = await storage.getClientPortalUsersByUserId(userId);
      const portalUser = portalUsers.find(pu => pu.id === portalUserId);
      if (!portalUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const projectAccess = await storage.getClientPortalProjectAccess(portalUserId);
      const projectsWithData = await Promise.all(
        projectAccess.map(async (pa) => {
          const project = pa.project || await storage.getProject(pa.projectId);
          if (!project) return null;

          // Get basic stats
          const reports = await storage.getReportsByProject(project.id);
          const submittedReports = reports.filter(r => r.status === "submitted");

          return {
            id: project.id,
            name: project.name,
            projectNumber: project.projectNumber,
            address: project.address,
            startDate: project.startDate,
            substantialCompletionDate: project.substantialCompletionDate,
            totalReports: submittedReports.length,
            latestReportDate: submittedReports.length > 0
              ? submittedReports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
              : null,
          };
        })
      );

      res.json({
        companyName: (portalUser as any).company?.name || "Unknown",
        companyLogo: (portalUser as any).company?.logoPath || null,
        projects: projectsWithData.filter(Boolean),
      });
    } catch (error) {
      console.error("Error fetching client portal projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Get client portal project dashboard data
  app.get("/api/client-portal/:portalUserId/projects/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { portalUserId, projectId } = req.params;

      const portalUsers = await storage.getClientPortalUsersByUserId(userId);
      const portalUser = portalUsers.find(pu => pu.id === portalUserId);
      if (!portalUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const projectAccess = await storage.getClientPortalProjectAccess(portalUserId);
      if (!projectAccess.find(pa => pa.projectId === projectId)) {
        return res.status(403).json({ message: "No access to this project" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const company = await storage.getCompany(portalUser.companyId);

      // Get reports (submitted only)
      const allReports = await storage.getReportsByProject(projectId);
      const reports = allReports
        .filter(r => r.status === "submitted")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Get photos from submitted reports
      const photoPromises = reports.slice(0, 20).map(async r => {
        const photos = await storage.getPhotosByReport(r.id);
        return photos.map(p => ({
          ...p,
          reportDate: r.date,
        }));
      });
      const allPhotos = (await Promise.all(photoPromises)).flat();

      // Calculate schedule progress
      let scheduleProgress = 0;
      if (project.startDate && project.substantialCompletionDate) {
        const start = new Date(project.startDate).getTime();
        const end = new Date(project.substantialCompletionDate).getTime();
        const now = Date.now();
        if (end > start) {
          scheduleProgress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
        }
      }

      // Issues and safety from reports
      const issues: any[] = [];
      const safetyIncidents: any[] = [];
      for (const r of reports) {
        if (r.issues) {
          try {
            const parsed = typeof r.issues === 'string' ? JSON.parse(r.issues) : r.issues;
            if (Array.isArray(parsed)) {
              issues.push(...parsed.map((i: any) => ({ ...i, reportDate: r.date })));
            }
          } catch {}
        }
        if (r.safetyIncidents) {
          try {
            const parsed = typeof r.safetyIncidents === 'string' ? JSON.parse(r.safetyIncidents) : r.safetyIncidents;
            if (Array.isArray(parsed)) {
              safetyIncidents.push(...parsed.map((i: any) => ({ ...i, reportDate: r.date })));
            }
          } catch {}
        }
      }

      // Weather summary from recent reports
      const weatherSummary = reports.slice(0, 7).map(r => ({
        date: r.date,
        weather: r.weather,
        temperature: r.temperature,
      }));

      res.json({
        project: {
          id: project.id,
          name: project.name,
          projectNumber: project.projectNumber,
          address: project.address,
          client: project.client,
          startDate: project.startDate,
          substantialCompletionDate: project.substantialCompletionDate,
        },
        company: {
          name: company?.name,
          logoPath: company?.logoPath,
        },
        schedule: {
          progress: scheduleProgress,
          startDate: project.startDate,
          endDate: project.substantialCompletionDate,
        },
        reports: reports.slice(0, 30).map(r => ({
          id: r.id,
          date: r.date,
          reportNumber: r.reportNumber,
          weather: r.weather,
          temperature: r.temperature,
          inspectorName: r.inspectorName,
          status: r.status,
        })),
        totalReports: reports.length,
        photos: allPhotos.slice(0, 24),
        issues: issues.slice(0, 20),
        safetyIncidents: safetyIncidents.slice(0, 20),
        weatherSummary,
      });
    } catch (error) {
      console.error("Error fetching client portal project data:", error);
      res.status(500).json({ message: "Failed to fetch project data" });
    }
  });

  // Admin: Invite a client to the portal
  app.post("/api/client-portal/invite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { email, firstName, lastName, companyId, clientId, projectIds } = req.body;

      if (!email || !companyId || !projectIds || projectIds.length === 0) {
        return res.status(400).json({ message: "Email, company, and at least one project are required" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Only admins can invite clients" });
      }

      const companyProjects = await storage.getProjectsByCompany(companyId);
      const companyProjectIds = new Set(companyProjects.map(p => p.id));
      const invalidProjects = projectIds.filter((pid: string) => !companyProjectIds.has(pid));
      if (invalidProjects.length > 0) {
        return res.status(400).json({ message: "One or more selected projects do not belong to this company" });
      }

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 8);

      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30);

      const invite = await storage.createInvite({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        role: "inspector",
        isCompanyAdmin: false,
        isClientPortal: true,
        clientId: clientId || null,
        companyId,
        projectIds,
        token,
        inviteCode,
        invitedBy: userId,
        expiresAt: defaultExpiry,
        status: "pending",
      });

      // Send invitation email
      try {
        const { sendEmail } = await import('./replit_integrations/email/client');
        const baseUrl = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : 'http://localhost:5000';

        const inviteLink = `${baseUrl}/accept-invite/${token}`;
        const company = await storage.getCompany(companyId);

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e3a5f;">Client Portal Access</h2>
            <p>You have been invited to view project updates on ${company?.name || 'Field Daily Reports'}'s Client Portal.</p>
            <p>The Client Portal gives you real-time visibility into your project's progress, daily reports, photos, and more.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="background-color: #d4942a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Access Client Portal</a>
            </div>
            <div style="background-color: #f3f4f6; border-radius: 4px; padding: 20px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Or enter this code at <strong>${baseUrl}/join</strong>:</p>
              <p style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1e3a5f; font-family: monospace;">${inviteCode}</p>
            </div>
            <p style="color: #6b7280; font-size: 12px;">This invitation expires in 30 days.</p>
          </div>
        `;

        await sendEmail({
          to: email,
          subject: `${company?.name || 'Field Daily Reports'} - Client Portal Access`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error("Failed to send client portal invite email:", emailError);
      }

      res.status(201).json(invite);
    } catch (error) {
      console.error("Error creating client portal invite:", error);
      res.status(500).json({ message: "Failed to create client portal invite" });
    }
  });

  // Admin: List client portal users for a company
  app.get("/api/client-portal/company/:companyId/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { companyId } = req.params;

      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const portalUsers = await storage.getClientPortalUsersForCompany(companyId);
      res.json(portalUsers);
    } catch (error) {
      console.error("Error fetching client portal users:", error);
      res.status(500).json({ message: "Failed to fetch client portal users" });
    }
  });

  // Admin: Add/remove project access for a client portal user
  app.post("/api/client-portal/:portalUserId/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { portalUserId } = req.params;
      const { projectId } = req.body;

      const portalUsers = await storage.getClientPortalUsersByUserId(userId);
      // Need to verify this is admin action
      const allPortalUsers = await db.query.clientPortalUsers.findFirst({
        where: eq(clientPortalUsers.id, portalUserId),
      });
      if (!allPortalUsers) {
        return res.status(404).json({ message: "Portal user not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, allPortalUsers.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const access = await storage.addClientPortalProjectAccess(portalUserId, projectId);
      res.json(access);
    } catch (error) {
      console.error("Error adding project access:", error);
      res.status(500).json({ message: "Failed to add project access" });
    }
  });

  app.delete("/api/client-portal/:portalUserId/projects/:projectId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { portalUserId, projectId } = req.params;

      const allPortalUsers = await db.query.clientPortalUsers.findFirst({
        where: eq(clientPortalUsers.id, portalUserId),
      });
      if (!allPortalUsers) {
        return res.status(404).json({ message: "Portal user not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, allPortalUsers.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.removeClientPortalProjectAccess(portalUserId, projectId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing project access:", error);
      res.status(500).json({ message: "Failed to remove project access" });
    }
  });

  // Admin: Delete client portal user
  app.delete("/api/client-portal/:portalUserId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { portalUserId } = req.params;

      const portalUser = await db.query.clientPortalUsers.findFirst({
        where: eq(clientPortalUsers.id, portalUserId),
      });
      if (!portalUser) {
        return res.status(404).json({ message: "Portal user not found" });
      }

      const isAdmin = await isEffectiveCompanyAdmin(userId, portalUser.companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.deleteClientPortalUser(portalUserId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting client portal user:", error);
      res.status(500).json({ message: "Failed to delete client portal user" });
    }
  });

  // ============================================================
  // API KEY MANAGEMENT (for Custom GPT Actions integration)
  // ============================================================

  const { createHash } = await import("crypto");

  const hashApiKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

  const generateRawKey = async () => {
    const { randomBytes } = await import("crypto");
    return "fdr_" + randomBytes(20).toString("hex");
  };

  // Middleware for API key auth (used by v1 routes)
  const apiKeyAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers["authorization"] || req.headers["x-api-key"];
    if (!authHeader) return res.status(401).json({ message: "API key required" });
    const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const hash = hashApiKey(rawKey);
    const key = await storage.getApiKeyByHash(hash);
    if (!key) return res.status(401).json({ message: "Invalid or revoked API key" });
    storage.touchApiKey(key.id).catch(() => {});
    req.apiKey = key;
    next();
  };

  // List API keys for a company
  app.get("/api/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { companyId } = req.query as any;
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const keys = await storage.getApiKeysByCompany(companyId);
      res.json(keys);
    } catch (error) {
      console.error("Error listing API keys:", error);
      res.status(500).json({ message: "Failed to list API keys" });
    }
  });

  // Create a new API key
  app.post("/api/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { name, companyId } = req.body;
      if (!name || !companyId) return res.status(400).json({ message: "Name and companyId required" });
      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const rawKey = await generateRawKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.slice(0, 12);
      const key = await storage.createApiKey({ name, keyHash, keyPrefix, companyId, createdByUserId: userId, isActive: true });
      res.json({ ...key, rawKey }); // rawKey only returned once
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  // Revoke an API key
  app.delete("/api/api-keys/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = (req.query.companyId || req.body?.companyId) as string;
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const isAdmin = await isEffectiveCompanyAdmin(userId, companyId, profile);
      if (!isAdmin && !isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const ok = await storage.revokeApiKey(req.params.id, companyId);
      if (!ok) return res.status(404).json({ message: "Key not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking API key:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  // ============================================================
  // V1 PUBLIC READ API (used by Custom GPT Actions)
  // ============================================================

  app.get("/api/v1/projects", apiKeyAuth, async (req: any, res) => {
    try {
      const { companyId } = req.apiKey;
      const projects = await storage.getProjectsByCompany(companyId);
      res.json({ projects });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/v1/projects/:id", apiKeyAuth, async (req: any, res) => {
    try {
      const { companyId } = req.apiKey;
      const project = await storage.getProject(req.params.id);
      if (!project || project.companyId !== companyId) return res.status(404).json({ message: "Project not found" });
      const reports = await storage.getReportsByProject(req.params.id);
      res.json({ project, recentReports: reports.slice(0, 10) });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.get("/api/v1/reports", apiKeyAuth, async (req: any, res) => {
    try {
      const { companyId } = req.apiKey;
      const { projectId, startDate, endDate, limit = "20" } = req.query as any;
      let reports: any[];
      if (projectId) {
        const project = await storage.getProject(projectId);
        if (!project || project.companyId !== companyId) return res.status(404).json({ message: "Project not found" });
        reports = await storage.getReportsByProject(projectId);
      } else {
        const projects = await storage.getProjectsByCompany(companyId);
        const allReports: any[] = [];
        for (const p of projects) {
          const r = await storage.getReportsByProject(p.id);
          allReports.push(...r.map((rep: any) => ({ ...rep, projectName: p.name })));
        }
        reports = allReports.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
      if (startDate) reports = reports.filter((r: any) => new Date(r.date) >= new Date(startDate));
      if (endDate) reports = reports.filter((r: any) => new Date(r.date) <= new Date(endDate));
      reports = reports.slice(0, Math.min(parseInt(limit), 100));
      res.json({ reports, total: reports.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.get("/api/v1/reports/:id", apiKeyAuth, async (req: any, res) => {
    try {
      const { companyId } = req.apiKey;
      const report = await storage.getReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (report.projectId) {
        const project = await storage.getProject(report.projectId);
        if (!project || project.companyId !== companyId) return res.status(403).json({ message: "Access denied" });
      }
      res.json({ report });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // Helper: normalize a contract into the standard GPT-facing shape
  const normalizeContract = async (contract: any): Promise<any> => {
    let assignedToName: string | null = null;
    if (contract.assignedToUserId) {
      const assignedProfile = await storage.getUserProfile(contract.assignedToUserId);
      const fn = assignedProfile?.firstName || "";
      const ln = assignedProfile?.lastName || "";
      assignedToName = `${fn} ${ln}`.trim() || null;
    }
    const primaryProject = contract.projects?.[0];
    return {
      id: contract.id,
      contract_number: contract.contractNumber,
      name: contract.name,
      agency: contract.agency ?? null,
      project_name: primaryProject?.name ?? contract.name,
      service_type: contract.serviceType ?? null,
      status: contract.status,
      proposal_due_date: contract.bidDueDate ?? null,
      question_deadline: contract.questionDeadline ?? null,
      addendum_count: contract.addendumCount ?? 0,
      last_addendum_date: contract.lastAddendumDate ?? null,
      assigned_to: assignedToName,
      sharepoint_folder_url: contract.sharepointFolderUrl ?? null,
      client_name: contract.client?.name ?? null,
      contract_type: contract.contractType,
      original_value: contract.originalValue ?? null,
      current_value: contract.currentValue ?? null,
      bid_release_date: contract.bidReleaseDate ?? null,
      award_date: contract.awardDate ?? null,
      start_date: contract.startDate ?? null,
      substantial_completion_date: contract.substantialCompletionDate ?? null,
      notes: contract.notes ?? null,
      projects: (contract.projects ?? []).map((p: any) => ({ id: p.id, name: p.name, projectNumber: p.projectNumber })),
      created_at: contract.createdAt,
      updated_at: contract.updatedAt,
    };
  };

  app.get("/api/v1/contracts", apiKeyAuth, async (req: any, res) => {
    try {
      const { companyId } = req.apiKey;
      const { status, serviceType, assignedUser, dueDate, dueBefore, dueAfter, limit = "50" } = req.query as any;
      let contracts = await storage.getContracts(companyId);

      // Apply filters
      if (status) {
        const statuses = status.split(",").map((s: string) => s.trim());
        contracts = contracts.filter((c: any) => statuses.includes(c.status));
      }
      if (serviceType) {
        contracts = contracts.filter((c: any) =>
          c.serviceType?.toLowerCase().includes(serviceType.toLowerCase())
        );
      }
      if (assignedUser) {
        contracts = contracts.filter((c: any) => c.assignedToUserId === assignedUser);
      }
      if (dueDate) {
        const d = new Date(dueDate);
        contracts = contracts.filter((c: any) => c.bidDueDate && new Date(c.bidDueDate).toDateString() === d.toDateString());
      }
      if (dueBefore) {
        contracts = contracts.filter((c: any) => c.bidDueDate && new Date(c.bidDueDate) <= new Date(dueBefore));
      }
      if (dueAfter) {
        contracts = contracts.filter((c: any) => c.bidDueDate && new Date(c.bidDueDate) >= new Date(dueAfter));
      }

      contracts = contracts.slice(0, Math.min(parseInt(limit), 200));
      const normalized = await Promise.all(contracts.map(normalizeContract));
      res.json({ contracts: normalized, total: normalized.length });
    } catch (error) {
      console.error("Error fetching v1 contracts:", error);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  app.get("/api/v1/contracts/:id", apiKeyAuth, async (req: any, res) => {
    try {
      const { companyId } = req.apiKey;
      const contract = await storage.getContract(req.params.id);
      if (!contract || contract.companyId !== companyId) return res.status(404).json({ message: "Contract not found" });
      const normalized = await normalizeContract(contract);
      res.json({ contract: normalized });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contract" });
    }
  });

  app.get("/api/v1/summary", apiKeyAuth, async (req: any, res) => {
    try {
      const { companyId } = req.apiKey;
      const projects = await storage.getProjectsByCompany(companyId);
      const contracts = await storage.getContracts(companyId);
      const recentReports: any[] = [];
      for (const p of projects.slice(0, 5)) {
        const r = await storage.getReportsByProject(p.id);
        if (r.length > 0) recentReports.push({ projectName: p.name, latestReport: r[0].date, totalReports: r.length });
      }
      res.json({
        company: { id: companyId },
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status === "active").length,
        totalContracts: contracts.length,
        recentActivity: recentReports,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  // OpenAPI spec for Custom GPT Actions
  app.get("/api/v1/openapi.json", async (req: any, res) => {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const baseUrl = `${protocol}://${host}`;
    const spec = {
      openapi: "3.1.0",
      info: {
        title: "Field Daily Reports API",
        description: "Read-only API to access construction project reports, projects, and contracts. Authenticate with an API key using the Authorization header as 'Bearer <your-api-key>'.",
        version: "1.0.0",
      },
      servers: [{ url: baseUrl }],
      security: [{ ApiKeyAuth: [] }],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "http",
            scheme: "bearer",
            description: "Your API key, obtained from Company Settings → API Keys",
          },
        },
      },
      paths: {
        "/api/v1/summary": {
          get: {
            operationId: "getSummary",
            summary: "Get a high-level summary of company activity",
            description: "Returns total project count, contract count, and recent reporting activity",
            responses: {
              "200": {
                description: "Summary data",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
        "/api/v1/projects": {
          get: {
            operationId: "listProjects",
            summary: "List all projects",
            description: "Returns all projects for the company associated with the API key",
            responses: {
              "200": {
                description: "List of projects",
                content: { "application/json": { schema: { type: "object", properties: { projects: { type: "array" } } } } },
              },
            },
          },
        },
        "/api/v1/projects/{id}": {
          get: {
            operationId: "getProject",
            summary: "Get a specific project with recent reports",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: {
              "200": {
                description: "Project details with recent reports",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
        "/api/v1/reports": {
          get: {
            operationId: "listReports",
            summary: "List daily reports",
            description: "Returns daily reports, optionally filtered by project, date range, or limited in count",
            parameters: [
              { name: "projectId", in: "query", required: false, schema: { type: "string" }, description: "Filter by project ID" },
              { name: "startDate", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Filter reports on or after this date (YYYY-MM-DD)" },
              { name: "endDate", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Filter reports on or before this date (YYYY-MM-DD)" },
              { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20, maximum: 100 }, description: "Max number of reports to return" },
            ],
            responses: {
              "200": {
                description: "List of reports",
                content: { "application/json": { schema: { type: "object", properties: { reports: { type: "array" }, total: { type: "integer" } } } } },
              },
            },
          },
        },
        "/api/v1/reports/{id}": {
          get: {
            operationId: "getReport",
            summary: "Get a specific daily report",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: {
              "200": {
                description: "Report details",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
        "/api/v1/contracts": {
          get: {
            operationId: "listContracts",
            summary: "List contracts with optional filters",
            description: "Returns contracts for the company. Each contract includes normalized fields: agency, project_name, service_type, proposal_due_date, question_deadline, addendum_count, last_addendum_date, status, assigned_to, sharepoint_folder_url.",
            parameters: [
              { name: "status", in: "query", required: false, schema: { type: "string" }, description: "Filter by status (comma-separated). Values: bid_release, bid_received, under_review, awarded, not_awarded, cancelled, in_execution, substantial_completion, final_closeout" },
              { name: "serviceType", in: "query", required: false, schema: { type: "string" }, description: "Filter by service type (partial match)" },
              { name: "assignedUser", in: "query", required: false, schema: { type: "string" }, description: "Filter by assigned user ID" },
              { name: "dueDate", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Filter by exact proposal due date (YYYY-MM-DD)" },
              { name: "dueBefore", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Filter proposals due on or before this date" },
              { name: "dueAfter", in: "query", required: false, schema: { type: "string", format: "date" }, description: "Filter proposals due on or after this date" },
              { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50, maximum: 200 }, description: "Max number of contracts to return" },
            ],
            responses: {
              "200": {
                description: "List of normalized contracts",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        contracts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              contract_number: { type: "string" },
                              name: { type: "string" },
                              agency: { type: "string", nullable: true },
                              project_name: { type: "string" },
                              service_type: { type: "string", nullable: true },
                              status: { type: "string" },
                              proposal_due_date: { type: "string", format: "date-time", nullable: true },
                              question_deadline: { type: "string", format: "date-time", nullable: true },
                              addendum_count: { type: "integer" },
                              last_addendum_date: { type: "string", format: "date-time", nullable: true },
                              assigned_to: { type: "string", nullable: true },
                              sharepoint_folder_url: { type: "string", nullable: true },
                              client_name: { type: "string", nullable: true },
                              notes: { type: "string", nullable: true },
                            },
                          },
                        },
                        total: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/api/v1/contracts/{id}": {
          get: {
            operationId: "getContract",
            summary: "Get a specific contract by ID",
            description: "Returns full normalized contract detail including all fields",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: {
              "200": {
                description: "Contract detail",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
      },
    };
    res.json(spec);
  });

  // ==================== RECRUITING ROUTES ====================

  app.get("/api/recruiting/candidates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      let candidates = await storage.getInspectorCandidates(companyId);

      const { classFilter, county, status, search } = req.query;
      if (classFilter && classFilter !== "all") {
        candidates = candidates.filter((c: any) => {
          if (classFilter === "class1") return c.class1;
          if (classFilter === "class2") return c.class2;
          if (classFilter === "class3") return c.class3;
          return true;
        });
      }
      if (county && county !== "all") {
        candidates = candidates.filter((c: any) => c.county === county);
      }
      if (status && status !== "all") {
        candidates = candidates.filter((c: any) => c.status === status);
      }
      if (search) {
        const q = (search as string).toLowerCase();
        candidates = candidates.filter((c: any) => {
          const name = `${c.firstName} ${c.lastName}`.toLowerCase();
          return name.includes(q) || (c.certNumber || '').toLowerCase().includes(q) || (c.county || '').toLowerCase().includes(q);
        });
      }

      res.json(candidates);
    } catch (error) {
      console.error("Error fetching candidates:", error);
      res.status(500).json({ message: "Failed to fetch candidates" });
    }
  });

  app.get("/api/recruiting/candidates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      const candidate = await storage.getInspectorCandidate(req.params.id);
      if (!candidate || candidate.companyId !== companyId) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error fetching candidate:", error);
      res.status(500).json({ message: "Failed to fetch candidate" });
    }
  });

  app.patch("/api/recruiting/candidates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      const candidate = await storage.getInspectorCandidate(req.params.id);
      if (!candidate || candidate.companyId !== companyId) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      const updateSchema = z.object({
        status: z.enum(["prospect", "contacted", "interested", "not_available", "not_interested", "hired"]).optional(),
        notes: z.string().nullable().optional(),
        lastContactDate: z.string().or(z.date()).transform(val => val ? new Date(val) : null).nullable().optional(),
        availableBy: z.string().or(z.date()).transform(val => val ? new Date(val) : null).nullable().optional(),
        timeBase: z.enum(["full_time", "part_time"]).nullable().optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid update data", errors: parsed.error.errors });
      }
      const updated = await storage.updateInspectorCandidate(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating candidate:", error);
      res.status(500).json({ message: "Failed to update candidate" });
    }
  });

  app.delete("/api/recruiting/candidates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      const candidate = await storage.getInspectorCandidate(req.params.id);
      if (!candidate || candidate.companyId !== companyId) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      await storage.deleteInspectorCandidate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting candidate:", error);
      res.status(500).json({ message: "Failed to delete candidate" });
    }
  });

  app.get("/api/recruiting/candidates/:id/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      const candidate = await storage.getInspectorCandidate(req.params.id);
      if (!candidate || candidate.companyId !== companyId) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      const notes = await storage.getInspectorCandidateNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching candidate notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.post("/api/recruiting/candidates/:id/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      const candidate = await storage.getInspectorCandidate(req.params.id);
      if (!candidate || candidate.companyId !== companyId) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      const { note } = req.body;
      if (!note || typeof note !== 'string' || !note.trim()) {
        return res.status(400).json({ message: "Note text is required" });
      }
      const created = await storage.createInspectorCandidateNote({
        candidateId: req.params.id,
        userId,
        note: note.trim(),
      });
      res.json(created);
    } catch (error) {
      console.error("Error creating candidate note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  app.post("/api/recruiting/import", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      const dsaPages = [
        { url: "https://www.apps2.dgs.ca.gov/DSA/Tracker/InspByCategory.aspx?Id=07", classField: "class1" },
        { url: "https://www.apps2.dgs.ca.gov/DSA/Tracker/InspByCategory.aspx?Id=08", classField: "class2" },
        { url: "https://www.apps2.dgs.ca.gov/DSA/Tracker/InspByCategory.aspx?Id=09", classField: "class3" },
      ];

      const allInspectors = new Map<string, any>();

      for (const page of dsaPages) {
        const response = await fetch(page.url);
        if (!response.ok) {
          console.error(`Failed to fetch DSA page ${page.url}: ${response.status} ${response.statusText}`);
          continue;
        }
        const html = await response.text();

        const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
        for (const row of rows) {
          const nameMatch = row.match(/InspId=(\d+)[^>]*>(.*?)<\/a>/);
          if (!nameMatch) continue;

          const dsaId = nameMatch[1];
          const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map((c: string) => c.replace(/<[^>]+>/g, '').trim());
          const fullName = cells[0] || '';
          const nameParts = fullName.split(',').map((s: string) => s.trim());
          const lastName = nameParts[0] || '';
          const firstName = nameParts[1] || '';

          const existing = allInspectors.get(dsaId);
          if (existing) {
            existing[page.classField] = true;
          } else {
            allInspectors.set(dsaId, {
              dsaInspectorId: dsaId,
              firstName,
              lastName,
              certNumber: cells[1] || null,
              certExpDate: cells[2] || null,
              county: cells[3] || null,
              phone: cells[4] || null,
              class1: page.classField === 'class1',
              class2: page.classField === 'class2',
              class3: page.classField === 'class3',
            });
          }
        }
      }

      let imported = 0;
      let updated = 0;
      for (const inspector of allInspectors.values()) {
        const existing = await storage.getInspectorCandidateByDsaId(companyId, inspector.dsaInspectorId);
        if (existing) {
          updated++;
        } else {
          imported++;
        }
        await storage.upsertInspectorCandidate({
          ...inspector,
          companyId,
          status: existing?.status || "prospect",
        });
      }

      res.json({ success: true, imported, updated, total: allInspectors.size });
    } catch (error) {
      console.error("Error importing DSA inspectors:", error);
      res.status(500).json({ message: "Failed to import DSA inspector list" });
    }
  });

  app.post("/api/recruiting/import-availability", isAuthenticated, availabilityUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId || !(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const data = req.file.buffer as Buffer;
      const MAX_DECOMPRESSED = 50 * 1024 * 1024;
      const MAX_ENTRIES = 100;
      let offset = 0;
      const zipFiles: { name: string; method: number; size: number; start: number }[] = [];
      while (offset < data.length - 4 && zipFiles.length < MAX_ENTRIES) {
        if (data[offset] === 0x50 && data[offset + 1] === 0x4B && data[offset + 2] === 0x03 && data[offset + 3] === 0x04) {
          const fnLen = data.readUInt16LE(offset + 26);
          const extraLen = data.readUInt16LE(offset + 28);
          const compSize = data.readUInt32LE(offset + 18);
          const compMethod = data.readUInt16LE(offset + 8);
          const fn = data.slice(offset + 30, offset + 30 + fnLen).toString();
          const dataStart = offset + 30 + fnLen + extraLen;
          zipFiles.push({ name: fn, method: compMethod, size: compSize, start: dataStart });
          offset = dataStart + compSize;
        } else {
          offset++;
        }
      }

      function extractFile(name: string): string {
        const f = zipFiles.find(x => x.name === name);
        if (!f) return '';
        const compressed = data.slice(f.start, f.start + f.size);
        if (f.method === 8) {
          const result = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_DECOMPRESSED });
          return result.toString();
        }
        return compressed.toString();
      }

      function colLetterToIndex(letters: string): number {
        let idx = 0;
        for (let i = 0; i < letters.length; i++) {
          idx = idx * 26 + (letters.charCodeAt(i) - 64);
        }
        return idx - 1;
      }

      const sharedXml = extractFile('xl/sharedStrings.xml');
      const sharedStrings: string[] = [];
      const siMatches = sharedXml.match(/<si>[\s\S]*?<\/si>/g) || [];
      siMatches.forEach(si => {
        const text = (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t: string) => t.replace(/<[^>]*>/g, '').trim()).join('');
        sharedStrings.push(text);
      });

      function getCellValue(cellXml: string): string {
        const t = cellXml.match(/t="([^"]*)"/);
        const v = cellXml.match(/<v>([\s\S]*?)<\/v>/);
        if (!v) {
          const is = cellXml.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
          return is ? is[1].trim() : '';
        }
        if (t && t[1] === 's') return sharedStrings[parseInt(v[1])] || '';
        return v[1];
      }

      function parseRow(rowXml: string): Map<number, string> {
        const cellMap = new Map<number, string>();
        const cells = rowXml.match(/<c [^>]*>[\s\S]*?<\/c>|<c [^\/]*\/>/g) || [];
        for (const cell of cells) {
          const ref = cell.match(/r="([A-Z]+)\d+"/);
          if (!ref) continue;
          const colIdx = colLetterToIndex(ref[1]);
          cellMap.set(colIdx, getCellValue(cell));
        }
        return cellMap;
      }

      const sheetXml = extractFile('xl/worksheets/sheet1.xml');
      const xmlRows = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];

      let headerColMap: Map<string, number> = new Map();
      const parsedRows: Map<number, string>[] = [];
      for (const row of xmlRows) {
        const cellMap = parseRow(row);
        const values = Array.from(cellMap.values());
        if (values.some(v => v === 'First Name') && values.some(v => v === 'Certification Number')) {
          cellMap.forEach((val, colIdx) => {
            if (val) headerColMap.set(val, colIdx);
          });
          continue;
        }
        if (headerColMap.size > 0 && cellMap.size >= 4) {
          parsedRows.push(cellMap);
        }
      }

      const col = (name: string) => headerColMap.get(name) ?? -1;
      const firstNameCol = col('First Name');
      const lastNameCol = col('Last Name');
      const phoneCol = col('Phone');
      const emailCol = col('Email');
      const timeBaseCol = col('Time Base Available') >= 0 ? col('Time Base Available') : col('Time Base (Full-Time/Part-Time)');
      const availableByCol = col('Available by:') >= 0 ? col('Available by:') : col('Available by');
      const certNumberCol = col('Certification Number');
      const inspectorClassCol = col('Inspector Class');
      const countyStartCol = inspectorClassCol >= 0 ? inspectorClassCol + 1 : -1;

      let updatedCount = 0;
      let createdCount = 0;
      let skippedCount = 0;
      const now = new Date();
      const ninetyDaysFromNow = new Date(now.getTime() + 90 * 86400000);

      for (const cellMap of parsedRows) {
        const firstName = (firstNameCol >= 0 ? cellMap.get(firstNameCol) : '')?.trim() || '';
        const lastName = (lastNameCol >= 0 ? cellMap.get(lastNameCol) : '')?.trim() || '';
        const phone = (phoneCol >= 0 ? cellMap.get(phoneCol) : '')?.trim() || '';
        const email = (emailCol >= 0 ? cellMap.get(emailCol) : '')?.trim() || '';
        const timeBaseRaw = (timeBaseCol >= 0 ? cellMap.get(timeBaseCol) : '')?.trim() || '';
        const availableByRaw = (availableByCol >= 0 ? cellMap.get(availableByCol) : '')?.trim() || '';
        const certNumber = (certNumberCol >= 0 ? cellMap.get(certNumberCol) : '')?.trim() || '';
        const inspectorClass = (inspectorClassCol >= 0 ? cellMap.get(inspectorClassCol) : '')?.trim() || '';

        if (!certNumber || !firstName) {
          skippedCount++;
          continue;
        }

        const timeBase = timeBaseRaw.toLowerCase().includes('full') ? 'full_time' : timeBaseRaw.toLowerCase().includes('part') ? 'part_time' : null;

        let availableBy: Date | null = null;
        if (availableByRaw) {
          const parts = availableByRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (parts) {
            availableBy = new Date(parseInt(parts[3]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
          }
        }

        const counties: string[] = [];
        if (countyStartCol >= 0) {
          headerColMap.forEach((colIdx, headerName) => {
            if (colIdx >= countyStartCol) {
              const val = cellMap.get(colIdx)?.trim();
              if (val) counties.push(headerName);
            }
          });
        }

        const existing = await storage.getInspectorCandidateByCertNumber(companyId, certNumber);

        if (existing) {
          const updateData: Partial<InsertInspectorCandidate> = {
            availableBy,
            timeBase,
            availabilityEmail: email || existing.availabilityEmail,
            availabilityPhone: phone || existing.availabilityPhone,
            availabilityCounties: counties.length > 0 ? counties : existing.availabilityCounties,
          };

          if (availableBy && availableBy <= ninetyDaysFromNow && (existing.status === 'prospect' || existing.status === 'contacted')) {
            updateData.status = 'interested' as const;
            const dateStr = availableBy.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            await storage.createInspectorCandidateNote({
              candidateId: existing.id,
              userId,
              note: `Auto-updated to Interested: inspector reported availability by ${dateStr} on DSA Availability List`,
            });
          }

          await storage.updateInspectorCandidate(existing.id, updateData);
          updatedCount++;
        } else {
          await storage.createInspectorCandidate({
            companyId,
            firstName,
            lastName,
            certNumber,
            phone: phone || null,
            county: counties[0] || null,
            class1: inspectorClass === '1',
            class2: inspectorClass === '2',
            class3: inspectorClass === '3',
            status: 'prospect',
            availableBy,
            timeBase,
            availabilityEmail: email || null,
            availabilityPhone: phone || null,
            availabilityCounties: counties,
          });
          createdCount++;
        }
      }

      res.json({ success: true, updated: updatedCount, created: createdCount, skipped: skippedCount, total: parsedRows.length });
    } catch (error) {
      console.error("Error importing availability list:", error);
      res.status(500).json({ message: "Failed to import availability list" });
    }
  });

  // ── TEMP: One-time account consolidation (Buckman Outlook → Gmail) ──────
  // DELETE THIS ENDPOINT after running once in production.
  app.post("/api/admin/consolidate-buckman-accounts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (!isEffectiveSystemAdmin(profile)) {
        return res.status(403).json({ message: "System admin access required" });
      }

      const OUTLOOK_ID = '55030529'; // tbuckmaninspectionservices@outlook.com (old)
      const GMAIL_ID   = '55631269'; // tebuckman@gmail.com (new primary)

      // 1. Reassign all reports from Outlook → Gmail
      const reportsUpdated = await db
        .update(dailyReportsTable)
        .set({ inspectorId: GMAIL_ID })
        .where(eq(dailyReportsTable.inspectorId, OUTLOOK_ID))
        .returning({ id: dailyReportsTable.id });

      // 2. Check if Gmail already has a company membership
      const existingMembership = await db
        .select()
        .from(companyMembers)
        .where(eq(companyMembers.userId, GMAIL_ID));

      // 3. Get Outlook's company membership and profile
      const [outlookMembership] = await db
        .select()
        .from(companyMembers)
        .where(eq(companyMembers.userId, OUTLOOK_ID));

      const [outlookProfile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, OUTLOOK_ID));

      // 4. Copy membership to Gmail if not already a member
      let membershipResult = 'skipped (already has membership)';
      if (existingMembership.length === 0 && outlookMembership) {
        await db.insert(companyMembers).values({
          userId: GMAIL_ID,
          companyId: outlookMembership.companyId,
          role: outlookMembership.role,
        });
        membershipResult = `added as ${outlookMembership.role} in company ${outlookMembership.companyId}`;
      }

      // 5. Copy profile to Gmail if no profile exists
      const [existingGmailProfile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, GMAIL_ID));

      let profileResult = 'skipped (already has profile)';
      if (!existingGmailProfile && outlookProfile) {
        const { userId: _uid, ...profileData } = outlookProfile;
        await db.insert(userProfiles).values({ ...profileData, userId: GMAIL_ID });
        profileResult = `copied: ${outlookProfile.firstName} ${outlookProfile.lastName}`;
      }

      // 6. Remove Outlook's company membership (it's no longer the active account)
      await db
        .delete(companyMembers)
        .where(eq(companyMembers.userId, OUTLOOK_ID));

      res.json({
        success: true,
        reportsReassigned: reportsUpdated.length,
        membership: membershipResult,
        profile: profileResult,
        note: 'Outlook account membership removed. Delete this endpoint after confirming.'
      });
    } catch (error: any) {
      console.error("Consolidation error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Cert Expiry Tracker ─────────────────────────────────────────────────────
  // GET /api/company/inspector-workload — returns workload data for all company inspectors
  app.get("/api/company/inspector-workload", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      // Current month boundaries (UTC)
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

      // Get all company inspectors (role='inspector')
      // leftJoin ensures inspectors without a profile row are still included
      const memberRows = await db
        .select({
          userId: companyMembers.userId,
          role: companyMembers.role,
          firstName: userProfiles.firstName,
          lastName: userProfiles.lastName,
          title: userProfiles.title,
          email: users.email,
          availabilityDate: userProfiles.availabilityDate,
        })
        .from(companyMembers)
        .leftJoin(userProfiles, eq(userProfiles.userId, companyMembers.userId))
        .innerJoin(users, eq(users.id, companyMembers.userId))
        .where(
          and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.role, "inspector")
          )
        );

      // Get only this company's projects (strict tenant isolation)
      const companyProjects = await storage.getProjectsByCompany(companyId);
      const projectMap = new Map(companyProjects.map(p => [p.id, p]));
      const companyProjectIds = companyProjects.map(p => p.id);

      // Build workload per inspector
      const workload = await Promise.all(memberRows.map(async (member) => {
        const inspectorId = member.userId;
        const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || inspectorId;

        // Step 1: Get assigned projects from project_members (the canonical "active project" list)
        const assignedProjectIds = new Set<string>();
        if (companyProjectIds.length > 0) {
          const pmRows = await db
            .select({ projectId: projectMembers.projectId })
            .from(projectMembers)
            .where(
              and(
                eq(projectMembers.userId, inspectorId),
                inArray(projectMembers.projectId, companyProjectIds)
              )
            );
          for (const pm of pmRows) assignedProjectIds.add(pm.projectId);
        }

        // Step 2: Build hours map from DR + MTE (both sources; cover projects with/without PM record)
        const projectHoursMap = new Map<string, number>();
        if (companyProjectIds.length > 0) {
          const [drRows, mteRows] = await Promise.all([
            db.select({
              projectId: dailyReportsTable.projectId,
              regularHours: dailyReportsTable.regularHours,
              otHours: dailyReportsTable.otHours,
            }).from(dailyReportsTable).where(
              and(
                eq(dailyReportsTable.inspectorId, inspectorId),
                sql`${dailyReportsTable.date} >= ${monthStart}`,
                sql`${dailyReportsTable.date} < ${monthEnd}`,
                inArray(dailyReportsTable.projectId, companyProjectIds)
              )
            ),
            db.select({
              projectId: manualTimeEntries.projectId,
              regularHours: manualTimeEntries.regularHours,
              otHours: manualTimeEntries.otHours,
            }).from(manualTimeEntries).where(
              and(
                eq(manualTimeEntries.inspectorId, inspectorId),
                sql`${manualTimeEntries.date} >= ${monthStart}`,
                sql`${manualTimeEntries.date} < ${monthEnd}`,
                inArray(manualTimeEntries.projectId, companyProjectIds)
              )
            ),
          ]);

          for (const dr of drRows) {
            if (!dr.projectId || !projectMap.has(dr.projectId)) continue;
            projectHoursMap.set(dr.projectId, (projectHoursMap.get(dr.projectId) ?? 0) + parseFloat(dr.regularHours || "0") + parseFloat(dr.otHours || "0"));
          }
          for (const mte of mteRows) {
            if (!mte.projectId || !projectMap.has(mte.projectId)) continue;
            projectHoursMap.set(mte.projectId, (projectHoursMap.get(mte.projectId) ?? 0) + parseFloat(mte.regularHours || "0") + parseFloat(mte.otHours || "0"));
          }
        }

        // Step 3: Merge assigned projects (with 0 hours if no activity) + unassigned but active projects
        const allRelevantProjectIds = new Set([...assignedProjectIds, ...projectHoursMap.keys()]);
        const activeProjects = Array.from(allRelevantProjectIds)
          .map(projectId => {
            const p = projectMap.get(projectId);
            if (!p) return null;
            return {
              projectId,
              projectName: p.name || p.projectNumber || projectId,
              hoursThisMonth: Math.round((projectHoursMap.get(projectId) ?? 0) * 100) / 100,
              isAssigned: assignedProjectIds.has(projectId),
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => b.hoursThisMonth - a.hoursThisMonth);

        const totalHoursThisMonth = Math.round(activeProjects.reduce((sum, ap) => sum + ap.hoursThisMonth, 0) * 100) / 100;

        return {
          inspectorId,
          name,
          title: member.title || null,
          email: member.email || null,
          role: member.role,
          availabilityDate: member.availabilityDate || null,
          activeProjectCount: assignedProjectIds.size,
          totalHoursThisMonth,
          utilizationPct: Math.min(Math.round((totalHoursThisMonth / 160) * 100), 100),
          projects: activeProjects,
        };
      }));

      res.json(workload.sort((a, b) => b.totalHoursThisMonth - a.totalHoursThisMonth));
    } catch (error: any) {
      console.error("Error fetching inspector workload:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/company/inspector-compare?ids=a,b,c — returns comparison data for up to 3 inspectors
  app.get("/api/company/inspector-compare", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      const idsParam = req.query.ids as string || "";
      const rawIds = idsParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);
      if (rawIds.length < 1) return res.status(400).json({ message: "At least one inspector ID required" });

      // Separate team-inspector IDs (prefixed "ti:") from company-member user IDs
      const tiIds = rawIds.filter(id => id.startsWith("ti:")).map(id => id.slice(3));
      const memberIds = rawIds.filter(id => !id.startsWith("ti:"));

      // Validate member IDs belong to this company and are inspector-role
      const members = await storage.getCompanyMembers(companyId);
      const memberMap = new Map(members.map(m => [m.userId, m]));
      for (const mid of memberIds) {
        const m = memberMap.get(mid);
        if (!m) return res.status(403).json({ message: `Inspector ${mid} does not belong to this company` });
        if (m.role !== "inspector") return res.status(400).json({ message: `User ${mid} is not an inspector` });
      }

      // Validate team inspector IDs belong to this company
      for (const tid of tiIds) {
        const ti = await storage.getTeamInspector(tid);
        if (!ti || ti.companyId !== companyId) {
          return res.status(403).json({ message: `Team inspector ${tid} does not belong to this company` });
        }
      }

      // Get company projects
      const companyProjects = await storage.getProjectsByCompany(companyId);
      const activeCompanyProjects = companyProjects.filter(p =>
        !p.finalCloseoutDate || new Date(p.finalCloseoutDate) > new Date()
      );
      const activeProjectIds = activeCompanyProjects.map(p => p.id);
      const allProjectIds = companyProjects.map(p => p.id);

      // Current month boundaries
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

      const results = await Promise.all(rawIds.map(async (rawId) => {
        const isTeamInspector = rawId.startsWith("ti:");
        const entityId = isTeamInspector ? rawId.slice(3) : rawId;

        if (isTeamInspector) {
          // Team Inspector path — no project/hours data (not a system user)
          const ti = await storage.getTeamInspector(entityId);
          if (!ti) return null;
          return {
            id: rawId,
            inspectorId: rawId,
            name: `${ti.firstName} ${ti.lastName}`.trim(),
            title: ti.title || null,
            licenseNumber: ti.licenseNumber || null,
            licenseState: ti.licenseState || null,
            certifications: ti.certifications || [],
            availabilityDate: null,
            activeProjectCount: null as number | null,
            totalHoursThisMonth: null as number | null,
            regularRate: null as string | null,
            overtimeRate: null as string | null,
            premiumRate: null as string | null,
            isTeamInspector: true,
            role: "inspector" as string | null,
          };
        }

        // Company member path
        const inspectorProfile = await storage.getUserProfile(entityId);
        const member = memberMap.get(entityId);
        const firstName = inspectorProfile?.firstName || member?.user?.firstName || null;
        const lastName = inspectorProfile?.lastName || member?.user?.lastName || null;
        const email = member?.user?.email ?? null;
        const name = [firstName, lastName].filter(Boolean).join(" ") || email || entityId;

        let activeProjectCount = 0;
        let projectAssignments: Array<{ projectId: string; regularRate: string | null; overtimeRate: string | null; premiumRate: string | null }> = [];
        if (activeProjectIds.length > 0) {
          const pmRows = await db
            .select({
              projectId: projectMembers.projectId,
              regularRate: projectMembers.regularRate,
              overtimeRate: projectMembers.overtimeRate,
              premiumRate: projectMembers.premiumRate,
            })
            .from(projectMembers)
            .where(and(eq(projectMembers.userId, entityId), inArray(projectMembers.projectId, activeProjectIds)));
          activeProjectCount = pmRows.length;
          projectAssignments = pmRows;
        }

        const regularRate = projectAssignments.find(p => p.regularRate)?.regularRate || null;
        const overtimeRate = projectAssignments.find(p => p.overtimeRate)?.overtimeRate || null;
        const premiumRate = projectAssignments.find(p => p.premiumRate)?.premiumRate || null;

        let totalHoursThisMonth = 0;
        if (allProjectIds.length > 0) {
          const [drRows, mteRows] = await Promise.all([
            db.select({ regularHours: dailyReportsTable.regularHours, otHours: dailyReportsTable.otHours })
              .from(dailyReportsTable)
              .where(and(eq(dailyReportsTable.inspectorId, entityId), sql`${dailyReportsTable.date} >= ${monthStart}`, sql`${dailyReportsTable.date} < ${monthEnd}`, inArray(dailyReportsTable.projectId, allProjectIds))),
            db.select({ regularHours: manualTimeEntries.regularHours, otHours: manualTimeEntries.otHours })
              .from(manualTimeEntries)
              .where(and(eq(manualTimeEntries.inspectorId, entityId), sql`${manualTimeEntries.date} >= ${monthStart}`, sql`${manualTimeEntries.date} < ${monthEnd}`, inArray(manualTimeEntries.projectId, allProjectIds))),
          ]);
          for (const dr of drRows) totalHoursThisMonth += parseFloat(dr.regularHours || "0") + parseFloat(dr.otHours || "0");
          for (const mte of mteRows) totalHoursThisMonth += parseFloat(mte.regularHours || "0") + parseFloat(mte.otHours || "0");
        }

        return {
          id: rawId,
          inspectorId: rawId,
          name,
          title: inspectorProfile?.title || null,
          licenseNumber: inspectorProfile?.licenseNumber || null,
          licenseState: inspectorProfile?.licenseState || null,
          certifications: inspectorProfile?.certifications || [],
          availabilityDate: inspectorProfile?.availabilityDate || null,
          activeProjectCount,
          totalHoursThisMonth: Math.round(totalHoursThisMonth * 100) / 100,
          regularRate,
          overtimeRate,
          premiumRate,
          isTeamInspector: false,
          role: member?.role || null,
        };
      }));

      res.json(results.filter(Boolean));
    } catch (error: any) {
      console.error("Error fetching inspector comparison:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/company/inspector-performance — returns performance scorecard for all company inspectors
  app.get("/api/company/inspector-performance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      const days = Math.min(Math.max(parseInt(req.query.days as string) || 90, 1), 730);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0, 0, 0, 0);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      // Get all company inspectors (leftJoin so inspectors without profile row are included)
      const memberRows = await db
        .select({
          userId: companyMembers.userId,
          role: companyMembers.role,
          firstName: userProfiles.firstName,
          lastName: userProfiles.lastName,
          title: userProfiles.title,
          email: users.email,
        })
        .from(companyMembers)
        .leftJoin(userProfiles, eq(userProfiles.userId, companyMembers.userId))
        .innerJoin(users, eq(users.id, companyMembers.userId))
        .where(
          and(
            eq(companyMembers.companyId, companyId),
            eq(companyMembers.role, "inspector")
          )
        );

      if (memberRows.length === 0) return res.json([]);

      // Get company project IDs for scoping
      const companyProjects = await storage.getProjectsByCompany(companyId);
      const companyProjectIds = companyProjects.map(p => p.id);
      const inspectorIds = memberRows.map(m => m.userId);

      // Aggregate stats per inspector from daily_reports (single grouped query via drizzle)
      const statsRows = companyProjectIds.length > 0 ? await db
        .select({
          inspectorId: dailyReportsTable.inspectorId,
          totalReports: count(),
          totalHours: sql<string>`COALESCE(SUM(CAST(${dailyReportsTable.regularHours} AS NUMERIC) + CAST(COALESCE(${dailyReportsTable.otHours}, '0') AS NUMERIC)), 0)`,
          safetyIncidents: sql<number>`COALESCE(SUM(${dailyReportsTable.safetyIncidents}), 0)::int`,
          safetyNearMisses: sql<number>`COALESCE(SUM(${dailyReportsTable.safetyNearMisses}), 0)::int`,
          safetyFlagCount: sql<number>`COUNT(*) FILTER (WHERE ${dailyReportsTable.safetyFlag} = true)`,
          distinctProjects: countDistinct(dailyReportsTable.projectId),
        })
        .from(dailyReportsTable)
        .where(
          and(
            inArray(dailyReportsTable.inspectorId, inspectorIds),
            inArray(dailyReportsTable.projectId, companyProjectIds),
            sql`${dailyReportsTable.date} >= ${cutoffStr}`
          )
        )
        .groupBy(dailyReportsTable.inspectorId) : [];

      // MTE hours per inspector (same date range) — hours only, no safety data in MTE
      const mteHoursRows = companyProjectIds.length > 0 ? await db
        .select({
          inspectorId: manualTimeEntries.inspectorId,
          mteHours: sql<string>`COALESCE(SUM(CAST(${manualTimeEntries.regularHours} AS NUMERIC) + CAST(COALESCE(${manualTimeEntries.otHours}, '0') AS NUMERIC)), 0)`,
        })
        .from(manualTimeEntries)
        .where(
          and(
            inArray(manualTimeEntries.inspectorId, inspectorIds),
            inArray(manualTimeEntries.projectId, companyProjectIds),
            sql`${manualTimeEntries.date} >= ${cutoffStr}`
          )
        )
        .groupBy(manualTimeEntries.inspectorId) : [];

      const mteHoursMap = new Map<string, number>();
      for (const row of mteHoursRows) {
        mteHoursMap.set(row.inspectorId, parseFloat(row.mteHours));
      }

      // Monthly breakdown: last 6 months, reports per inspector per month
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

      const monthlyRows = companyProjectIds.length > 0 ? await db
        .select({
          inspectorId: dailyReportsTable.inspectorId,
          month: sql<string>`TO_CHAR(${dailyReportsTable.date}::date, 'YYYY-MM')`,
          reportCount: count(),
        })
        .from(dailyReportsTable)
        .where(
          and(
            inArray(dailyReportsTable.inspectorId, inspectorIds),
            inArray(dailyReportsTable.projectId, companyProjectIds),
            sql`${dailyReportsTable.date} >= ${sixMonthsAgoStr}`
          )
        )
        .groupBy(dailyReportsTable.inspectorId, sql`TO_CHAR(${dailyReportsTable.date}::date, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${dailyReportsTable.date}::date, 'YYYY-MM')`) : [];

      // Build stats map
      const statsMap = new Map<string, any>();
      for (const row of statsRows) {
        statsMap.set(row.inspectorId, {
          totalReports: Number(row.totalReports),
          totalHours: parseFloat(row.totalHours as string),
          safetyIncidents: Number(row.safetyIncidents),
          safetyNearMisses: Number(row.safetyNearMisses),
          safetyFlagCount: Number(row.safetyFlagCount),
          distinctProjects: Number(row.distinctProjects),
        });
      }

      // Build monthly map: inspectorId -> [{month, reportCount}]
      const monthlyMap = new Map<string, Array<{month: string; reportCount: number}>>();
      for (const row of monthlyRows) {
        const arr = monthlyMap.get(row.inspectorId) ?? [];
        arr.push({ month: row.month, reportCount: Number(row.reportCount) });
        monthlyMap.set(row.inspectorId, arr);
      }

      // Compute expected working days (Mon-Fri) in the range
      let expectedWorkdays = 0;
      const d = new Date(cutoff);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      while (d <= today) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) expectedWorkdays++;
        d.setDate(d.getDate() + 1);
      }

      const result = memberRows.map(member => {
        const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || member.userId;
        const stats = statsMap.get(member.userId) ?? {
          totalReports: 0, totalHours: 0, safetyIncidents: 0,
          safetyNearMisses: 0, safetyFlagCount: 0, distinctProjects: 0,
        };
        const mteHours = mteHoursMap.get(member.userId) ?? 0;
        const combinedHours = stats.totalHours + mteHours;
        const avgDailyHours = stats.totalReports > 0
          ? Math.round((combinedHours / stats.totalReports) * 100) / 100
          : 0;
        const submissionRate = expectedWorkdays > 0
          ? Math.min(Math.round((stats.totalReports / expectedWorkdays) * 1000) / 10, 100)
          : 0;
        return {
          inspectorId: member.userId,
          name,
          title: member.title || null,
          email: member.email || null,
          totalReports: stats.totalReports,
          totalHours: Math.round(combinedHours * 100) / 100,
          avgDailyHours,
          safetyIncidents: stats.safetyIncidents,
          safetyNearMisses: stats.safetyNearMisses,
          safetyFlagCount: stats.safetyFlagCount,
          distinctProjects: stats.distinctProjects,
          submissionRate,
          reportsByMonth: monthlyMap.get(member.userId) ?? [],
        };
      });

      res.json(result.sort((a, b) => b.totalReports - a.totalReports));
    } catch (error: any) {
      console.error("Error fetching inspector performance:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/cert-expiry  — returns all inspectors with cert expiry info for this company
  app.get("/api/cert-expiry", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      const { users: userRows, teamInspectors: teamRows } = await storage.getAllInspectorsWithCerts();

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const toEntry = (inspector: { id: string; companyId: string; name: string; certifications: any[] }, type: "user" | "team") => {
        if (inspector.companyId !== companyId) return null;
        const certs = normalizeCerts(inspector.certifications).map((cert) => {
          const daysUntilExpiry = cert.expiresAt
            ? Math.ceil((new Date(cert.expiresAt).setHours(0,0,0,0) - now.getTime()) / 86400000)
            : null;
          return { ...cert, daysUntilExpiry };
        });
        return { id: inspector.id, name: inspector.name, type, certifications: certs };
      };

      const entries = [
        ...userRows.map(i => toEntry(i, "user")),
        ...teamRows.map(i => toEntry(i, "team")),
      ].filter(Boolean);

      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Inspector Document Vault Routes ──────────────────────────────────────

  // GET /api/inspector-documents/:inspectorId — list documents for an inspector
  app.get("/api/inspector-documents/:inspectorId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      const { inspectorId } = req.params;
      const docs = await storage.getInspectorDocuments(companyId, inspectorId);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/inspector-documents — upload a document (multipart/form-data)
  app.post("/api/inspector-documents", isAuthenticated, documentUpload.single("file"), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const { inspectorId, documentType } = req.body;
      if (!inspectorId) return res.status(400).json({ message: "inspectorId is required" });
      if (!documentType || !INSPECTOR_DOCUMENT_TYPES.includes(documentType)) {
        return res.status(400).json({ message: "Invalid document type" });
      }

      // Verify the inspector belongs to this company (as a company member or team inspector)
      const members = await storage.getCompanyMembers(companyId);
      const isMember = members.some(m => m.userId === inspectorId);
      if (!isMember) {
        const teamInspectors = await storage.getTeamInspectors(companyId);
        const isTeamInspector = teamInspectors.some(t => t.userId === inspectorId);
        if (!isTeamInspector) {
          return res.status(400).json({ message: "Inspector is not a member of this company" });
        }
      }

      // Upload file to private object storage under inspector-docs/
      const ext = path.extname(req.file.originalname) || "";
      const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const fileUrl = await objectStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename: safeFileName,
        contentType: req.file.mimetype,
        folder: `inspector-docs/${companyId}/${inspectorId}`,
      });

      const doc = await storage.createInspectorDocument({
        companyId,
        inspectorId,
        documentType,
        fileName: req.file.originalname,
        fileUrl,
        uploadedById: userId,
      });

      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/inspector-documents/:id/download — returns a short-lived signed URL
  app.get("/api/inspector-documents/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      const doc = await storage.getInspectorDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.companyId !== companyId) return res.status(403).json({ message: "Access denied" });

      // Issue a 5-minute signed URL — avoid streaming bytes through the API server
      const url = await objectStorage.getSignedDownloadUrl(doc.fileUrl, 300);
      res.json({ url, fileName: doc.fileName });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/inspector-documents/:id — delete a document
  app.delete("/api/inspector-documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      const doc = await storage.getInspectorDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.companyId !== companyId) return res.status(403).json({ message: "Access denied" });

      // Delete DB record first, then remove the file from object storage
      await storage.deleteInspectorDocument(req.params.id);
      try {
        await objectStorage.deleteObject(doc.fileUrl);
      } catch (_err) {
        // Best-effort blob cleanup — DB record already removed
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Outlook Email Import Routes ───────────────────────────────────────────

  // Check if Outlook is connected
  app.get("/api/outlook/status", isAuthenticated, async (req: any, res) => {
    try {
      const { checkOutlookConnection } = await import("./outlook-client");
      const connected = await checkOutlookConnection();
      res.json({ connected });
    } catch (error: any) {
      res.json({ connected: false });
    }
  });

  // List recent emails from Outlook inbox
  app.get("/api/outlook/emails", isAuthenticated, async (req: any, res) => {
    try {
      const { getRecentEmails } = await import("./outlook-client");
      const count = Math.min(parseInt(String(req.query.count || "20")), 50);
      const emails = await getRecentEmails(count);
      res.json(emails);
    } catch (error: any) {
      if (error.message === "OUTLOOK_NOT_CONNECTED") {
        return res.status(401).json({ message: "Outlook not connected", code: "OUTLOOK_NOT_CONNECTED" });
      }
      console.error("Error fetching Outlook emails:", error);
      res.status(500).json({ message: "Failed to fetch emails" });
    }
  });

  // Get full email detail by ID
  app.get("/api/outlook/emails/:emailId", isAuthenticated, async (req: any, res) => {
    try {
      const { getEmailDetail } = await import("./outlook-client");
      const email = await getEmailDetail(req.params.emailId);
      res.json(email);
    } catch (error: any) {
      if (error.message === "OUTLOOK_NOT_CONNECTED") {
        return res.status(401).json({ message: "Outlook not connected", code: "OUTLOOK_NOT_CONNECTED" });
      }
      console.error("Error fetching email detail:", error);
      res.status(500).json({ message: "Failed to fetch email" });
    }
  });

  // Extract contract data from email text using AI
  app.post("/api/outlook/extract-contract", isAuthenticated, async (req: any, res) => {
    try {
      const { emailText, subject, sender } = req.body;
      if (!emailText) {
        return res.status(400).json({ message: "emailText is required" });
      }

      const systemPrompt = `You are an expert at extracting contract information from emails. 
Extract all relevant contract fields from the provided email text and return structured JSON.
If a field is not clearly mentioned, return null for that field.
Do not guess or invent data — only extract what is explicitly mentioned.`;

      const userPrompt = `Extract contract information from this email and return a JSON object with these fields:
- contractNumber: string | null (contract or bid number, RFP number, etc.)
- name: string | null (project or contract name/title)
- description: string | null (brief description of the scope)
- clientName: string | null (client, agency, or organization name — this is not necessarily who sent the email)
- contractType: "lump_sum" | "time_and_materials" | "unit_price" | "cost_plus" | "design_build" | "hourly_rate" | "other" | null
- status: "bid_release" | "bid_received" | "under_review" | "awarded" | "not_awarded" | "cancelled" | "in_execution" | "substantial_completion" | "final_closeout" | null
- originalValue: string | null (budget or contract value as a number string, no currency symbols)
- bidDueDate: string | null (ISO date YYYY-MM-DD format)
- bidReleaseDate: string | null (ISO date YYYY-MM-DD format)
- awardDate: string | null (ISO date YYYY-MM-DD format)
- startDate: string | null (ISO date YYYY-MM-DD format)
- substantialCompletionDate: string | null (ISO date YYYY-MM-DD format)
- finalCloseoutDate: string | null (ISO date YYYY-MM-DD format)
- notes: string | null (any other relevant notes or details)
- agency: string | null (government agency or issuing organization if applicable)
- serviceType: string | null (type of service e.g. "DSA Inspection", "Special Inspection", etc.)
- questionDeadline: string | null (ISO date YYYY-MM-DD format, deadline for questions/RFIs)

Email Subject: ${subject || ""}
From: ${sender || ""}

Email Body:
${emailText.substring(0, 8000)}

Return ONLY a valid JSON object with the fields above. No explanation, no markdown, just JSON.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content || "{}";
      let extracted: Record<string, any> = {};
      try {
        extracted = JSON.parse(content);
      } catch {
        extracted = {};
      }

      res.json({ extracted });
    } catch (error: any) {
      console.error("Error extracting contract from email:", error);
      res.status(500).json({ message: "Failed to extract contract data" });
    }
  });

  // ─── Inspector Broadcast Announcements ──────────────────────────────────────

  // POST /api/announcements — create and send an announcement (admin only)
  app.post("/api/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }

      const recipientFilterSchema = z.discriminatedUnion("type", [
        z.object({ type: z.literal("all") }),
        z.object({ type: z.literal("project"), projectId: z.string().min(1) }),
        z.object({ type: z.literal("dsa_class"), dsaClass: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
      ]);
      const bodyParse = z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        recipientFilter: recipientFilterSchema.optional(),
        sendEmail: z.boolean().optional(),
      }).safeParse(req.body);
      if (!bodyParse.success) {
        return res.status(400).json({ message: "Invalid request", errors: bodyParse.error.flatten() });
      }
      const { title, body, recipientFilter, sendEmail: shouldEmail } = bodyParse.data;
      const filter = recipientFilter ?? ({ type: "all" } as const);

      // Resolve recipient user IDs from filter
      const allMembers = await storage.getCompanyMembers(companyId);
      const inspectorMembers = allMembers.filter(m => m.role === "inspector");

      let recipientIds: string[] = [];
      if (filter.type === "all") {
        recipientIds = inspectorMembers.map(m => m.userId);
      } else if (filter.type === "project" && filter.projectId) {
        // Only inspectors assigned to the given project
        const projectMembersRows = await db
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(eq(projectMembers.projectId, filter.projectId));
        const projectUserIds = new Set(projectMembersRows.map((r: { userId: string }) => r.userId));
        recipientIds = inspectorMembers.filter(m => projectUserIds.has(m.userId)).map(m => m.userId);
      } else if (filter.type === "dsa_class") {
        const dsaClass = filter.dsaClass;
        // Filter inspectors who have DSA Class N certification (check cert names)
        const recipientPromises = inspectorMembers.map(async (m) => {
          const p = await storage.getUserProfile(m.userId);
          const certs = (p?.certifications as Array<{ name: string }> | null) || [];
          const hasClass = certs.some((c: { name: string }) => {
            const name = c.name?.toLowerCase() || "";
            return name.includes(`class ${dsaClass}`) || name.includes(`dsa class ${dsaClass}`) || name.includes(`dsa-class-${dsaClass}`);
          });
          return hasClass ? m.userId : null;
        });
        const resolved = await Promise.all(recipientPromises);
        recipientIds = resolved.filter((id): id is string => id !== null);
      }

      // Create announcement record
      const announcement = await storage.createAnnouncement({
        companyId,
        sentById: userId,
        title: title.trim(),
        body: body.trim(),
        recipientFilter: filter,
        recipientUserIds: recipientIds,
        recipientCount: recipientIds.length,
        emailSent: shouldEmail === true,
      });

      // Optionally send email to each recipient
      if (shouldEmail && recipientIds.length > 0) {
        try {
          // Use already-loaded member data to get emails (user.email from companyMembers join)
          const memberEmailMap = new Map(
            allMembers
              .filter((m) => !!m.user?.email)
              .map((m) => [m.userId, m.user!.email as string])
          );
          const emailList = recipientIds.map(rid => memberEmailMap.get(rid)).filter((e): e is string => !!e);

          if (emailList.length > 0) {
            const company = await storage.getCompany(companyId);
            const senderProfile = await storage.getUserProfile(userId);
            const senderName = [senderProfile?.firstName, senderProfile?.lastName].filter(Boolean).join(" ") || "Your Company Admin";
            await sendEmail({
              to: emailList,
              subject: `[${company?.name || "Company"}] ${title.trim()}`,
              html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#1a2e4a;padding:16px;color:white">
                    <h2 style="margin:0;font-size:18px">${company?.name || "Field Daily Reports"}</h2>
                    <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Company Announcement</p>
                  </div>
                  <div style="padding:24px;background:#fff;border:1px solid #e5e7eb">
                    <h3 style="margin:0 0 12px;color:#1a2e4a">${title.trim()}</h3>
                    <div style="white-space:pre-wrap;color:#374151;line-height:1.6">${body.trim()}</div>
                    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
                    <p style="font-size:12px;color:#9ca3af">Sent by ${senderName} · ${new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</p>
                  </div>
                </div>
              `,
            });
          }
        } catch (emailErr) {
          console.error("Announcement email send error:", emailErr);
          // Don't fail the request if email fails
        }
      }

      res.json(announcement);
    } catch (error: any) {
      console.error("Error creating announcement:", error);
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  // GET /api/announcements — list company announcements (admin)
  app.get("/api/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      if (!companyId) return res.status(403).json({ message: "No active company" });
      if (!(await isEffectiveCompanyAdmin(userId, companyId, profile))) {
        return res.status(403).json({ message: "Company admin access required" });
      }
      const announcements = await storage.getCompanyAnnouncements(companyId);
      res.json(announcements);
    } catch (error: any) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  // GET /api/announcements/feed — announcements visible to current user (inspector)
  app.get("/api/announcements/feed", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      // Get all companies the user belongs to
      const memberships = await storage.getCompaniesForUser(userId);
      const companyIds = memberships.map((m) => m.companyId);
      const announcements = await storage.getInspectorAnnouncements(userId, companyIds);
      // Enrich with read status
      const readStatuses = await Promise.all(
        announcements.map(a => storage.isAnnouncementRead(a.id, userId))
      );
      const enriched = announcements.map((a, i) => ({ ...a, isRead: readStatuses[i] }));
      res.json(enriched);
    } catch (error: any) {
      console.error("Error fetching announcement feed:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  // GET /api/announcements/unread-count — badge count for inspector
  app.get("/api/announcements/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const memberships = await storage.getCompaniesForUser(userId);
      const companyIds = memberships.map((m) => m.companyId);
      const count = await storage.getUnreadAnnouncementCount(userId, companyIds);
      res.json({ count });
    } catch (error: any) {
      console.error("Error fetching unread count:", error);
      res.json({ count: 0 });
    }
  });

  // POST /api/announcements/:id/read — mark as read (only if announcement is visible to caller)
  app.post("/api/announcements/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      // Verify the announcement is visible to this user (membership + recipient inclusion)
      const memberships = await storage.getCompaniesForUser(userId);
      const companyIds = memberships.map((m) => m.companyId);
      const visibleAnnouncements = await storage.getInspectorAnnouncements(userId, companyIds);
      const isVisible = visibleAnnouncements.some((a) => a.id === req.params.id);
      if (!isVisible) {
        return res.status(403).json({ message: "Announcement not accessible" });
      }
      await storage.markAnnouncementRead(req.params.id, userId);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error marking announcement read:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  return httpServer;
}
