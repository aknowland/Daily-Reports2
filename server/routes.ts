import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { sql } from "drizzle-orm";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { insertProjectSchema, insertDailyReportSchema, updateUserProfileSchema, WorkActivityRow, VisitorRow, insertContractSchema, insertClientSchema } from "@shared/schema";
import { ObjectStorageService, registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID, randomBytes } from "crypto";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDocument } from "pdf-lib";
import { format } from "date-fns";
import { speechToText, openai } from "./replit_integrations/audio/client";
import { generateTimesheetPdf, aggregateReportsToTimesheetData, generateInvoicePdf, InvoiceData, generateInspectorInvoicePdf, InspectorInvoiceData } from "./billing-pdf";
import { registerChatRoutes } from "./replit_integrations/chat";

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

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  projectNumber: z.string().min(1, "Project number is required"),
  companyId: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  client: z.string().optional(),
  address: z.string().optional(),
  distributionEmails: z.array(z.string().email()).optional().default([]),
  defaultFolderPath: z.string().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const createReportSchema = z.object({
  projectId: z.string().min(1).nullable().optional(), // Optional to allow personal reports without a project
  date: z.string().or(z.date()).transform(val => new Date(val)),
  weatherType: z.enum(["clear", "cloudy", "rain", "wind", "heat", "cold"]).optional(),
  weatherNotes: z.string().optional(),
  typeOfWork: z.array(z.string()).optional().default([]),
  workPerformed: z.string().optional(),
  trades: z.array(z.object({ trade: z.string(), headcount: z.number() })).optional().default([]),
  manpower: z.array(z.object({ description: z.string(), count: z.number() })).optional().default([]),
  workActivities: z.array(z.object({ 
    contractor: z.string(), 
    headcount: z.number(), 
    workDescription: z.string() 
  })).optional().default([]),
  visitors: z.array(z.object({ name: z.string(), company: z.string(), notes: z.string().optional() })).optional().default([]),
  equipment: z.string().optional(),
  inspections: z.string().optional(),
  materialsDelivered: z.string().optional(),
  issuesFlag: z.boolean().optional(),
  issuesDetails: z.string().optional(),
  safetyFlag: z.boolean().optional(),
  safetyDetails: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "submitted"]).optional(),
  // Time tracking fields
  timeIn: z.string().optional(),
  lunchStart: z.string().optional(),
  lunchEnd: z.string().optional(),
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
        } catch (err) {
          return next();
        }
      }

      // Helper to check if user can access a report's files
      const canAccessReportFile = async (report: any): Promise<boolean> => {
        if (report.inspectorId === userId) return true;
        if (report.projectId) {
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
            const objectFile = await objectStorage.getObjectEntityFile(objectPath);
            return await objectStorage.downloadObject(objectFile, res);
          }
        }
      } else if (folder === 'signatures' || folder === 'reports') {
        // Signature and PDF files are named with report ID
        const reportId = filename?.replace(/\.(png|pdf)$/, '');
        if (reportId) {
          const report = await storage.getReport(reportId);
          if (report && await canAccessReportFile(report)) {
            const objectFile = await objectStorage.getObjectEntityFile(objectPath);
            // Disable caching for PDFs to ensure latest version is served
            const isPdf = filename?.endsWith('.pdf');
            return await objectStorage.downloadObject(objectFile, res, isPdf ? 0 : 3600);
          }
        }
      } else if (folder === 'logos') {
        // Company logos - allow access for authenticated users who are members of the company
        const companies = await storage.getCompanies();
        const owningCompany = companies.find(c => c.logoPath === objectPath);
        
        if (owningCompany) {
          const isMember = await storage.isUserMemberOfCompany(owningCompany.id, userId);
          if (isMember) {
            const objectFile = await objectStorage.getObjectEntityFile(objectPath);
            return await objectStorage.downloadObject(objectFile, res);
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
      
      if (!fs.existsSync(filePath)) {
        return next();
      }

      // System admins can access all files (when in admin mode)
      if (isEffectiveSystemAdmin(profile)) {
        return res.sendFile(filePath);
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
            return res.sendFile(filePath);
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

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { companyId, ...projectData } = req.body;
      
      // If companyId is provided, check if user is a member of that company (any role) or system admin
      if (companyId) {
        const isSystemAdmin = isEffectiveSystemAdmin(profile);
        const isMember = await storage.isUserMemberOfCompany(companyId, userId);
        
        if (!isSystemAdmin && !isMember) {
          return res.status(403).json({ message: "You must be a member of this company to create projects for it" });
        }
      }
      
      const validated = createProjectSchema.parse({ ...projectData, companyId: companyId || null });
      const project = await storage.createProject(validated);
      
      // Automatically assign the creator to the project
      if (userId && project.id) {
        await storage.addProjectMember(project.id, userId);
      }
      
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating project:", error);
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
          doc.image(logoBuffer, startX, headerY, { width: 178, height: 67, fit: [178, 67] });
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
      
      // Project info section
      doc.fontSize(10).font('Helvetica-Bold').text('PROJECT:', startX);
      doc.fontSize(10).font('Helvetica').text(`${project.name} (${project.projectNumber || 'N/A'})`, startX);
      if (project.client) doc.text(`Client: ${project.client}`);
      if (project.address) doc.text(`Address: ${project.address}`);
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

  // ========== CONTRACTS ==========
  const contractStatusLabels: Record<string, string> = {
    bid_release: "Bid Release",
    bid_received: "Bid Received",
    under_review: "Under Review",
    awarded: "Awarded",
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
    other: "Other"
  };

  // Get contracts for active company
  app.get("/api/contracts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile?.activeCompanyId) {
        return res.json([]);
      }
      
      // Check user has access to this company
      const isMember = await storage.isUserMemberOfCompany(profile.activeCompanyId, userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isMember && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied" });
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
      
      // Filter to active contracts only (awarded, in_progress, active)
      const contracts = allContracts.filter(c => 
        c.status === 'awarded' || c.status === 'in_progress' || c.status === 'active'
      );
      
      // Calculate schedule and budget progress for each contract
      const dashboardData = await Promise.all(contracts.map(async (contract) => {
        // Calculate schedule progress
        let scheduleProgress = 0;
        let daysRemaining: number | null = null;
        let daysOverdue: number | null = null;
        let scheduleStatus: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete' = 'not_started';
        
        if (contract.startDate && contract.substantialCompletionDate) {
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
            scheduleStatus = 'not_started';
            daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          } else if (now > endDate) {
            scheduleProgress = 100;
            daysOverdue = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
            scheduleStatus = contract.status === 'substantial_completion' || contract.status === 'final_closeout' 
              ? 'complete' 
              : 'overdue';
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
        
        return {
          id: contract.id,
          name: contract.name,
          contractNumber: contract.contractNumber,
          status: contract.status,
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

  // Get single contract
  app.get("/api/contracts/:id", isAuthenticated, async (req: any, res) => {
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
      
      res.json(contract);
    } catch (error) {
      console.error("Error fetching contract:", error);
      res.status(500).json({ message: "Failed to fetch contract" });
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
      const isMember = await storage.isUserMemberOfCompany(contract.companyId, userId);
      const isSysAdmin = isEffectiveSystemAdmin(profile);
      
      if (!isMember && !isSysAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Calculate schedule progress
      const now = new Date();
      let scheduleProgress = 0;
      let daysRemaining: number | null = null;
      let daysOverdue: number | null = null;
      let scheduleStatus: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete' = 'not_started';
      
      if (contract.startDate && contract.substantialCompletionDate) {
        const startDate = new Date(contract.startDate);
        const endDate = new Date(contract.substantialCompletionDate);
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        
        if (now < startDate) {
          scheduleProgress = 0;
          scheduleStatus = 'not_started';
          daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        } else if (now > endDate) {
          scheduleProgress = 100;
          daysOverdue = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = contract.status === 'substantial_completion' || contract.status === 'final_closeout' 
            ? 'complete' 
            : 'overdue';
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
      
      // Get contract rate options for client billing rates
      const contractRateOptions = await storage.getContractOptions(req.params.id);
      
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
          hours: {
            regular: budgetSummary.regularHours,
            overtime: budgetSummary.overtimeHours,
            premium: budgetSummary.premiumHours,
            total: budgetSummary.totalHours,
          },
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
        projects: contractProjects.map(p => ({
          id: p.id,
          name: p.name,
          projectNumber: p.projectNumber,
        })),
      });
    } catch (error) {
      console.error("Error fetching contract dashboard:", error);
      res.status(500).json({ message: "Failed to fetch contract dashboard" });
    }
  });

  // Helper to preprocess contract data - converts date strings to Date objects
  const preprocessContractData = (data: any) => {
    const dateFields = ['bidReleaseDate', 'bidDueDate', 'awardDate', 'startDate', 'substantialCompletionDate', 'finalCloseoutDate'];
    const processed = { ...data };
    
    for (const field of dateFields) {
      if (processed[field] !== undefined) {
        if (processed[field] === '' || processed[field] === null) {
          processed[field] = null;
        } else if (typeof processed[field] === 'string') {
          processed[field] = new Date(processed[field]);
        }
      }
    }
    
    // Convert empty clientId to null
    if (processed.clientId === '' || processed.clientId === 'none') {
      processed.clientId = null;
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
      
      // Return contract with options
      const fullContract = await storage.getContract(contract.id);
      res.status(201).json(fullContract);
    } catch (error) {
      console.error("Error creating contract:", error);
      res.status(500).json({ message: "Failed to create contract" });
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

  // ========== PROPOSALS ==========
  
  // Get proposals for active company
  app.get("/api/proposals", isAuthenticated, async (req: any, res) => {
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
      
      // Convert date strings to Date objects and handle nullable fields
      const processedData = {
        ...proposalData,
        companyId: profile.activeCompanyId,
        proposalNumber,
        createdById: userId,
        startDate: proposalData.startDate ? new Date(proposalData.startDate) : null,
        endDate: proposalData.endDate ? new Date(proposalData.endDate) : null,
        clientId: proposalData.clientId || null, // Convert empty string to null
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
      
      // Convert date strings to Date objects and handle nullable fields
      const processedData = {
        ...proposalData,
        startDate: proposalData.startDate ? new Date(proposalData.startDate) : null,
        endDate: proposalData.endDate ? new Date(proposalData.endDate) : null,
        clientId: proposalData.clientId || null, // Convert empty string to null
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

      // Helper to load images
      const loadImageBuffer = async (imagePath: string): Promise<Buffer | null> => {
        try {
          if (imagePath.startsWith('/objects/')) {
            return await objectStorage.downloadBuffer(imagePath);
          } else {
            const localPath = path.join(process.cwd(), imagePath.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              return fs.readFileSync(localPath);
            }
          }
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
            doc.image(logoBuffer, startX, 15, { width: 178, height: 67, fit: [178, 67] });
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
        currentY += multiLine ? doc.heightOfString(value || 'N/A', { width: pageWidth - (valueX - startX) }) + 8 : rowHeight;
      };
      
      addRow('SCHOOL DISTRICT', proposal.clientName);
      addRow('INSPECTORS', proposal.options?.map(opt => 
        opt.inspectors?.map(ins => ins.inspectorName).filter(Boolean).join(' / ')
      ).filter(Boolean).join(' / ') || 'TBD');
      addRow('PROJECT MANAGER', proposal.projectManager || '');
      addRow('PROJECT', proposal.projectName);
      
      // Duration - calculate schedule summary based on per-inspector schedules
      const startDateStr = proposal.startDate ? new Date(proposal.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
      const endDateStr = proposal.endDate ? new Date(proposal.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
      
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
      const tableRowHeight = 22;
      const cellPadding = 4;
      const optionSpacing = 8; // Vertical spacing between options
      
      // Helper function to draw cell with borders and text wrapping
      const drawCell = (x: number, y: number, width: number, height: number, text: string, options: { align?: 'left' | 'center' | 'right', font?: string, fontSize?: number, verticalCenter?: boolean } = {}) => {
        const { align = 'center', font = 'Helvetica', fontSize = 9, verticalCenter = true } = options;
        // Draw cell border
        doc.rect(x, y, width, height).stroke();
        // Draw text with padding and wrapping
        doc.font(font).fontSize(fontSize);
        const textWidth = width - (cellPadding * 2);
        const textHeight = doc.heightOfString(text, { width: textWidth });
        const textY = verticalCenter ? y + (height - textHeight) / 2 : y + cellPadding;
        doc.text(text, x + cellPadding, textY, { width: textWidth, align, lineGap: 1 });
      };
      
      // Helper function to draw merged cell spanning multiple rows with text wrapping
      const drawMergedCell = (x: number, y: number, width: number, height: number, text: string, options: { align?: 'left' | 'center' | 'right', font?: string, fontSize?: number } = {}) => {
        const { align = 'center', font = 'Helvetica-Bold', fontSize = 9 } = options;
        // Draw cell border
        doc.rect(x, y, width, height).stroke();
        // Draw text centered vertically with wrapping
        doc.font(font).fontSize(fontSize);
        const textWidth = width - (cellPadding * 2);
        const textHeight = doc.heightOfString(text, { width: textWidth });
        const textY = y + (height - textHeight) / 2;
        doc.text(text, x + cellPadding, textY, { width: textWidth, align, lineGap: 1 });
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
      }
      
      // ===== PAGE 2: TERMS & CONDITIONS =====
      doc.addPage();
      
      // Header
      doc.fontSize(10).font('Helvetica').text('DSA INSPECTORS', startX, 30, { width: pageWidth, align: 'right' });
      // Half inch (36 points) space after DSA INSPECTORS
      doc.fontSize(11).font('Helvetica-Bold').text('PROJECT INSPECTOR AGENCY AGREEMENT AND CONTRACT DUTIES:', startX, 76, { width: pageWidth, align: 'center' });
      
      // Half inch (36 points) space after title before terms
      currentY = 126;
      
      // Parse and render terms - compact formatting to fit on one page
      // Replace placeholder district name with actual client name
      const rawTerms = proposal.terms || '';
      const terms = rawTerms.replace(/Long Beach Unified School District/gi, proposal.clientName || 'Client');
      const termsParagraphs = terms.split(/\n\n+/).filter(p => p.trim());
      
      doc.fontSize(9).font('Helvetica');
      termsParagraphs.forEach((para, index) => {
        const trimmed = para.trim();
        // Check if it starts with a number
        const numMatch = trimmed.match(/^(\d+)\.\s*/);
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
      
      // Helper to load images
      const loadImageBuffer = async (imagePath: string): Promise<Buffer | null> => {
        try {
          if (imagePath.startsWith('/objects/')) {
            return await objectStorage.downloadBuffer(imagePath);
          } else {
            const localPath = path.join(process.cwd(), imagePath.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              return fs.readFileSync(localPath);
            }
          }
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
            doc.image(logoBuffer, startX, 15, { width: 178, height: 67, fit: [178, 67] });
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
      
      // Check free tier report limit
      const FREE_TIER_LIMIT = 5;
      const companies = await storage.getCompaniesForUser(userId);
      const hasActiveCompanySubscription = companies.some(c => 
        (c as any).company?.subscriptionStatus === 'active'
      );
      const hasActiveUserSubscription = profile?.subscriptionStatus === 'active';
      
      // Knowland Construction Services members bypass all subscription limits
      const isKnowland = await isKnowlandMember(userId);
      
      // Track if we need to increment free tier count after creation
      let shouldIncrementCount = false;
      
      if (!isKnowland && !hasActiveCompanySubscription && !hasActiveUserSubscription) {
        // User is on free tier - check report count
        let currentCount = profile?.monthlyReportCount || 0;
        
        // Reset count if we're in a new month
        const resetAt = profile?.reportCountResetAt;
        const now = new Date();
        const needsReset = !resetAt || new Date(resetAt).getMonth() !== now.getMonth() || 
                           new Date(resetAt).getFullYear() !== now.getFullYear();
        
        if (needsReset) {
          // Reset the count for new month
          await storage.resetReportCount(userId);
          currentCount = 0;
        }
        
        if (currentCount >= FREE_TIER_LIMIT) {
          return res.status(403).json({ 
            message: "Free tier limit reached",
            error: "REPORT_LIMIT_EXCEEDED",
            currentCount,
            limit: FREE_TIER_LIMIT,
          });
        }
        
        shouldIncrementCount = true;
      }
      
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
      
      // Increment report count for free tier users
      if (shouldIncrementCount) {
        await storage.incrementReportCount(userId);
      }
      
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

      // Generate PDF using pdfkit - Koury Engineering format
      const filename = `${req.params.id}.pdf`;

      const doc = new PDFDocument({ margin: 25, bufferPages: true });
      
      const pdfChunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => pdfChunks.push(chunk));
      
      const pdfComplete = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
        doc.on('error', reject);
      });

      const pageWidth = doc.page.width - 50;
      const startX = 25;
      const checkSize = 7;

      // Helper to load images
      const loadImageBuffer = async (imagePath: string): Promise<Buffer | null> => {
        try {
          if (imagePath.startsWith('/objects/')) {
            return await objectStorage.downloadBuffer(imagePath);
          } else {
            const localPath = path.join(process.cwd(), imagePath.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
              return fs.readFileSync(localPath);
            }
          }
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

      // ===== HEADER - Logo left, Company name right =====
      if (company?.logoPath) {
        try {
          const logoBuffer = await loadImageBuffer(company.logoPath);
          if (logoBuffer) {
            doc.image(logoBuffer, startX, 8, { width: 178, height: 67, fit: [178, 67] });
          }
        } catch (err) {
          console.error('Error adding company logo:', err);
        }
      }

      // Company name and contact - upper right
      const companyName = (company?.name || 'FIELD DAILY REPORTS').toUpperCase();
      doc.fontSize(11).font('Helvetica-Bold').text(companyName, 280, 12, { width: 290, align: 'right' });
      const contactLine = [company?.address, company?.phone, company?.email].filter(Boolean).join('  |  ');
      if (contactLine) {
        doc.fontSize(7.5).font('Helvetica').text(contactLine, 280, 26, { width: 290, align: 'right' });
      }

      // Form grid boxes - right side
      const gridX = 380;
      const gridTop = 72;
      const reportDate = new Date(report.date);
      const dateStr = reportDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
      // Time cell shows when report was submitted (signedAt); if not signed, show "--"
      const timeStr = report.signedAt 
        ? new Date(report.signedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '--';
      
      doc.strokeColor('#000').lineWidth(0.5);

      // Row 1: Project #, Report No., Status
      doc.rect(gridX, gridTop, 60, 18).stroke();
      doc.fontSize(7).font('Helvetica').text('Project #', gridX + 2, gridTop + 2);
      doc.fontSize(9).font('Helvetica-Bold').text(report.project?.projectNumber || 'N/A', gridX + 2, gridTop + 9);

      doc.rect(gridX + 60, gridTop, 50, 18).stroke();
      doc.fontSize(7).font('Helvetica').text('Report No.', gridX + 62, gridTop + 2);
      doc.fontSize(9).font('Helvetica-Bold').text(report.reportNumber ? String(report.reportNumber) : '--', gridX + 62, gridTop + 9);

      doc.rect(gridX + 110, gridTop, 55, 18).stroke();
      doc.fontSize(7).font('Helvetica').text('Status', gridX + 112, gridTop + 2);
      doc.fontSize(9).font('Helvetica-Bold').text((report.status || 'draft').toUpperCase(), gridX + 112, gridTop + 9);

      // Row 2: DSA File No., Date, Time
      doc.rect(gridX, gridTop + 18, 60, 18).stroke();
      doc.fontSize(7).font('Helvetica').text('DSA File No.', gridX + 2, gridTop + 20);
      doc.fontSize(9).font('Helvetica-Bold').text('--', gridX + 2, gridTop + 27);

      doc.rect(gridX + 60, gridTop + 18, 50, 18).stroke();
      doc.fontSize(7).font('Helvetica').text('Date', gridX + 62, gridTop + 20);
      doc.fontSize(9).font('Helvetica-Bold').text(dateStr, gridX + 62, gridTop + 27);

      doc.rect(gridX + 110, gridTop + 18, 55, 18).stroke();
      doc.fontSize(7).font('Helvetica').text('Time', gridX + 112, gridTop + 20);
      doc.fontSize(9).font('Helvetica-Bold').text(timeStr, gridX + 112, gridTop + 27);

      // Title - aligned with the 2x3 grid cells
      doc.fontSize(14).font('Helvetica-Bold').text('DAILY FIELD REPORT', startX, gridTop + 10);

      // Weather row with drawn icon
      doc.y = gridTop + 44;
      const weatherType = (report.weatherType || 'clear').toLowerCase();
      const weatherText = `${report.weatherNotes || ''}`.trim();
      const weatherLabel = (report.weatherType || 'Clear').charAt(0).toUpperCase() + (report.weatherType || 'clear').slice(1);
      
      const weatherY = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').text('WEATHER:', startX, weatherY);
      
      // Draw weather icon based on type - aligned with text baseline
      const iconX = startX + 55;
      const iconY = weatherY + 4;
      const iconSize = 6;
      
      if (weatherType === 'clear' || weatherType === 'sunny' || weatherType === 'hot') {
        // Sun icon - circle with rays
        doc.circle(iconX, iconY, iconSize - 1).fill('#f59e0b');
        doc.lineWidth(0.5).strokeColor('#f59e0b');
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const x1 = iconX + Math.cos(angle) * (iconSize + 1);
          const y1 = iconY + Math.sin(angle) * (iconSize + 1);
          const x2 = iconX + Math.cos(angle) * (iconSize + 3);
          const y2 = iconY + Math.sin(angle) * (iconSize + 3);
          doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
        }
        doc.strokeColor('#000');
      } else if (weatherType === 'cloudy' || weatherType === 'overcast') {
        // Cloud icon - overlapping circles
        doc.circle(iconX - 2, iconY, 3).fill('#9ca3af');
        doc.circle(iconX + 2, iconY - 1, 3.5).fill('#9ca3af');
        doc.circle(iconX + 5, iconY, 2.5).fill('#9ca3af');
      } else if (weatherType === 'partly-cloudy') {
        // Sun behind cloud
        doc.circle(iconX - 3, iconY - 2, 3).fill('#f59e0b');
        doc.circle(iconX, iconY + 1, 2.5).fill('#9ca3af');
        doc.circle(iconX + 3, iconY, 3).fill('#9ca3af');
      } else if (weatherType === 'rainy' || weatherType === 'rain') {
        // Cloud with rain drops
        doc.circle(iconX - 2, iconY - 2, 2.5).fill('#6b7280');
        doc.circle(iconX + 2, iconY - 2, 3).fill('#6b7280');
        doc.lineWidth(0.8).strokeColor('#3b82f6');
        doc.moveTo(iconX - 2, iconY + 2).lineTo(iconX - 3, iconY + 5).stroke();
        doc.moveTo(iconX + 2, iconY + 2).lineTo(iconX + 1, iconY + 5).stroke();
        doc.strokeColor('#000');
      } else if (weatherType === 'stormy') {
        // Cloud with lightning
        doc.circle(iconX - 2, iconY - 2, 2.5).fill('#4b5563');
        doc.circle(iconX + 2, iconY - 2, 3).fill('#4b5563');
        doc.moveTo(iconX, iconY + 1).lineTo(iconX - 2, iconY + 4).lineTo(iconX + 1, iconY + 4).lineTo(iconX - 1, iconY + 7).fill('#fbbf24');
      } else if (weatherType === 'snowy' || weatherType === 'snow' || weatherType === 'cold') {
        // Snowflake - star pattern
        doc.lineWidth(0.8).strokeColor('#3b82f6');
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          doc.moveTo(iconX, iconY).lineTo(iconX + Math.cos(angle) * 5, iconY + Math.sin(angle) * 5).stroke();
        }
        doc.strokeColor('#000');
      } else if (weatherType === 'windy') {
        // Wind lines
        doc.lineWidth(0.8).strokeColor('#6b7280');
        doc.moveTo(iconX - 4, iconY - 2).quadraticCurveTo(iconX, iconY - 3, iconX + 5, iconY - 2).stroke();
        doc.moveTo(iconX - 4, iconY + 1).quadraticCurveTo(iconX + 2, iconY, iconX + 6, iconY + 1).stroke();
        doc.moveTo(iconX - 3, iconY + 4).quadraticCurveTo(iconX, iconY + 3, iconX + 4, iconY + 4).stroke();
        doc.strokeColor('#000');
      } else if (weatherType === 'foggy' || weatherType === 'fog') {
        // Fog lines
        doc.lineWidth(1).strokeColor('#9ca3af');
        doc.moveTo(iconX - 5, iconY - 2).lineTo(iconX + 5, iconY - 2).stroke();
        doc.moveTo(iconX - 4, iconY + 1).lineTo(iconX + 6, iconY + 1).stroke();
        doc.moveTo(iconX - 5, iconY + 4).lineTo(iconX + 5, iconY + 4).stroke();
        doc.strokeColor('#000');
      } else {
        // Default: simple sun
        doc.circle(iconX, iconY, iconSize - 1).fill('#f59e0b');
      }
      
      // Reset all colors and line width back to defaults
      doc.fillColor('#000').strokeColor('#000').lineWidth(1);
      doc.fontSize(8).font('Helvetica').text(`${weatherLabel}${weatherText ? ' - ' + weatherText : ''}`, startX + 70, weatherY);

      // ===== TYPE OF WORK - Checkboxes =====
      doc.y += 16;
      const typeY = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').text('TYPE OF WORK', startX, typeY);
      
      // Mapping from form values to PDF labels
      const inspectionTypeMapping: { value: string; label: string }[] = [
        { value: 'reinf_concrete', label: 'Reinf. Concrete' },
        { value: 'structural_steel', label: 'Structural Steel' },
        { value: 'reinf_masonry', label: 'Reinf. Masonry' },
        { value: 'fire_proofing', label: 'Fire Proofing' },
        { value: 'shotcrete', label: 'Shotcrete' },
        { value: 'anchors', label: 'Anchors' },
        { value: 'other', label: 'Other' },
      ];
      const selectedTypes = (report.typeOfWork as string[]) || [];
      let typeX = startX + 95;
      inspectionTypeMapping.forEach((typeItem) => {
        const isChecked = selectedTypes.includes(typeItem.value);
        doc.rect(typeX, typeY - 1, checkSize, checkSize).stroke();
        if (isChecked) {
          // Draw checkmark inside the checkbox
          doc.lineWidth(1.2);
          doc.moveTo(typeX + 2, typeY + 2).lineTo(typeX + 4, typeY + 5).lineTo(typeX + 7, typeY - 1).stroke();
          doc.lineWidth(1);
        }
        doc.fontSize(7).font('Helvetica').text(typeItem.label, typeX + 9, typeY);
        typeX += 68;
      });

      // ===== PROJECT INFO SECTION =====
      doc.y = typeY + 18;
      const projY = doc.y;
      const col1W = pageWidth * 0.55;
      const col2W = pageWidth * 0.45;

      const projectName = report.project?.name || report.customProjectName || 'Unassigned Report';
      const projectAddress = report.project?.address || 'N/A';
      const inspectorName = report.inspectorName || 'Unknown';
      const clientName = report.project?.client || 'N/A';

      // Project Name row
      doc.rect(startX, projY, 75, 18).fillAndStroke('#000', '#000');
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text('Project Name', startX + 3, projY + 5);
      doc.fillColor('#000');
      doc.rect(startX + 75, projY, col1W - 75, 18).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text(projectName, startX + 78, projY + 5, { width: col1W - 85 });

      doc.rect(startX + col1W, projY, 55, 18).fillAndStroke('#000', '#000');
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text('Inspector', startX + col1W + 3, projY + 5);
      doc.fillColor('#000');
      doc.rect(startX + col1W + 55, projY, col2W - 55, 18).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text(inspectorName, startX + col1W + 58, projY + 5, { width: col2W - 65 });

      // Project Address row
      doc.rect(startX, projY + 18, 75, 18).fillAndStroke('#000', '#000');
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text('Project Address', startX + 3, projY + 23);
      doc.fillColor('#000');
      doc.rect(startX + 75, projY + 18, col1W - 75, 18).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text(projectAddress, startX + 78, projY + 23, { width: col1W - 85 });

      doc.rect(startX + col1W, projY + 18, 55, 18).fillAndStroke('#000', '#000');
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text('Client', startX + col1W + 3, projY + 23);
      doc.fillColor('#000');
      doc.rect(startX + col1W + 55, projY + 18, col2W - 55, 18).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text(clientName, startX + col1W + 58, projY + 23, { width: col2W - 65 });

      // ===== WORK ACTIVITIES TABLE =====
      doc.y = projY + 42;
      doc.fontSize(9).font('Helvetica-Bold').text('WORK ACTIVITIES', startX, doc.y);
      doc.y += 14;

      const waY = doc.y;
      const waCols = [130, 50, pageWidth - 180];
      
      // Header row
      doc.rect(startX, waY, waCols[0], 16).fillAndStroke('#e0e0e0', '#000');
      doc.rect(startX + waCols[0], waY, waCols[1], 16).fillAndStroke('#e0e0e0', '#000');
      doc.rect(startX + waCols[0] + waCols[1], waY, waCols[2], 16).fillAndStroke('#e0e0e0', '#000');
      doc.fillColor('#000').fontSize(8).font('Helvetica-Bold');
      doc.text('CONTRACTOR / TRADE', startX + 3, waY + 4);
      doc.text('COUNT', startX + waCols[0] + 3, waY + 4);
      doc.text('WORK DESCRIPTION', startX + waCols[0] + waCols[1] + 3, waY + 4);

      const workActivities = (report.workActivities as WorkActivityRow[]) || [];
      let currentWaY = waY + 16;
      const maxDisplayRows = 6; // Maximum rows to display to prevent page overflow
      const rowCount = Math.min(Math.max(workActivities.length, 2), maxDisplayRows);
      const minRowHeight = 16;
      const maxRowHeight = 32; // Limit row height to prevent overflow
      
      for (let i = 0; i < rowCount; i++) {
        const activity = workActivities[i];
        
        // Calculate row height based on content, with maximum limit
        let rowHeight = minRowHeight;
        if (activity) {
          doc.fontSize(8).font('Helvetica');
          const contractorHeight = doc.heightOfString(activity.contractor || '', { width: waCols[0] - 6 });
          const descHeight = doc.heightOfString(activity.workDescription || '', { width: waCols[2] - 6 });
          rowHeight = Math.min(maxRowHeight, Math.max(minRowHeight, contractorHeight + 8, descHeight + 8));
        }
        
        doc.rect(startX, currentWaY, waCols[0], rowHeight).stroke();
        doc.rect(startX + waCols[0], currentWaY, waCols[1], rowHeight).stroke();
        doc.rect(startX + waCols[0] + waCols[1], currentWaY, waCols[2], rowHeight).stroke();
        if (activity) {
          doc.fontSize(8).font('Helvetica');
          doc.text(activity.contractor || '', startX + 3, currentWaY + 4, { width: waCols[0] - 6, height: rowHeight - 6, ellipsis: true });
          doc.text(String(activity.headcount || ''), startX + waCols[0] + 18, currentWaY + 4);
          doc.text(activity.workDescription || '', startX + waCols[0] + waCols[1] + 3, currentWaY + 4, { width: waCols[2] - 6, height: rowHeight - 6, ellipsis: true });
        }
        currentWaY += rowHeight;
      }

      // ===== DAILY SUMMARY =====
      doc.y = currentWaY + 8;
      doc.fontSize(9).font('Helvetica-Bold').text('DAILY SUMMARY', startX, doc.y);
      doc.y += 14;

      const sumY = doc.y;
      const summaryParts: string[] = [];
      if (report.inspections) summaryParts.push(report.inspections);
      if (report.workPerformed) summaryParts.push(report.workPerformed);
      if (report.notes) summaryParts.push(report.notes);
      const summaryText = summaryParts.join('\n\n') || 'No inspection details recorded.';
      
      // Calculate dynamic height based on content, with maximum limit
      doc.fontSize(9).font('Helvetica');
      const summaryTextHeight = doc.heightOfString(summaryText, { width: pageWidth - 8 });
      const maxSumH = 80; // Maximum height to prevent overflow
      const sumH = Math.min(maxSumH, Math.max(50, summaryTextHeight + 12));
      doc.rect(startX, sumY, pageWidth, sumH).stroke();
      
      doc.text(summaryText, startX + 4, sumY + 4, { width: pageWidth - 8, height: sumH - 8, ellipsis: true });

      // ===== QC CHECKLIST ROW =====
      doc.y = sumY + sumH + 8;
      const qcY = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').text('QC CHECKLIST:', startX, qcY);
      
      const qcItems = ['FSA-5', 'On Time', 'File # Checked', 'Plan Reviewed', 'Specs Reviewed', 'Prev Reports', 'Tests per Spec'];
      let qcX = startX + 75;
      qcItems.forEach((item) => {
        doc.rect(qcX, qcY - 1, checkSize, checkSize).stroke();
        doc.fontSize(7).font('Helvetica').text(item, qcX + 9, qcY);
        qcX += 60;
      });

      // ===== EQUIPMENT & MATERIALS =====
      doc.y = qcY + 16;
      const maxEqMatH = 24; // Maximum height for equipment/materials text
      
      if (report.equipment || report.materialsDelivered) {
        const eqMatY = doc.y;
        const halfWidth = (pageWidth - 8) / 2;
        
        // Equipment section
        doc.fontSize(8).font('Helvetica-Bold').text('EQUIPMENT:', startX, eqMatY);
        const equipmentText = report.equipment || 'None';
        doc.fontSize(8).font('Helvetica');
        const equipH = Math.min(maxEqMatH, doc.heightOfString(equipmentText, { width: halfWidth - 60 }));
        doc.text(equipmentText, startX + 60, eqMatY, { width: halfWidth - 60, height: equipH, ellipsis: true });
        
        // Materials section
        doc.fontSize(8).font('Helvetica-Bold').text('MATERIALS:', startX + halfWidth + 4, eqMatY);
        const materialsText = report.materialsDelivered || 'None';
        doc.fontSize(8).font('Helvetica');
        const matH = Math.min(maxEqMatH, doc.heightOfString(materialsText, { width: halfWidth - 60 }));
        doc.text(materialsText, startX + halfWidth + 64, eqMatY, { width: halfWidth - 60, height: matH, ellipsis: true });
        
        doc.y = eqMatY + Math.max(equipH, matH, 12) + 8;
      }

      // ===== FLAGS ROW: Issues / Safety =====
      const flagY = doc.y;

      doc.fontSize(8).font('Helvetica-Bold').text('ISSUES/DELAYS:', startX, flagY);
      doc.rect(startX + 70, flagY - 1, checkSize, checkSize).stroke();
      if (report.issuesFlag) doc.rect(startX + 71, flagY, 5, 5).fill('#000');
      doc.fontSize(7).font('Helvetica').text('Yes', startX + 79, flagY);
      doc.rect(startX + 98, flagY - 1, checkSize, checkSize).stroke();
      if (!report.issuesFlag) doc.rect(startX + 99, flagY, 5, 5).fill('#000');
      doc.text('No', startX + 107, flagY);

      doc.fontSize(8).font('Helvetica-Bold').text('SAFETY INCIDENTS:', startX + 135, flagY);
      doc.rect(startX + 215, flagY - 1, checkSize, checkSize).stroke();
      if (report.safetyFlag) doc.rect(startX + 216, flagY, 5, 5).fill('#000');
      doc.fontSize(7).font('Helvetica').text('Yes', startX + 224, flagY);
      doc.rect(startX + 245, flagY - 1, checkSize, checkSize).stroke();
      if (!report.safetyFlag) doc.rect(startX + 246, flagY, 5, 5).fill('#000');
      doc.text('No', startX + 254, flagY);

      doc.y = flagY + 12;
      const maxDetailsH = 20; // Maximum height for issues/safety details
      
      // Show issues details if flagged
      if (report.issuesFlag && report.issuesDetails) {
        const issueDetailsY = doc.y;
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#333');
        const issueDetailsH = Math.min(maxDetailsH, doc.heightOfString(report.issuesDetails, { width: pageWidth - 10 }));
        doc.text(`Issues: ${report.issuesDetails}`, startX + 5, issueDetailsY, { width: pageWidth - 10, height: issueDetailsH, ellipsis: true });
        doc.fillColor('#000');
        doc.y = issueDetailsY + issueDetailsH + 4;
      }
      
      // Show safety details if flagged
      if (report.safetyFlag && report.safetyDetails) {
        const safetyDetailsY = doc.y;
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#333');
        const safetyDetailsH = Math.min(maxDetailsH, doc.heightOfString(report.safetyDetails, { width: pageWidth - 10 }));
        doc.text(`Safety: ${report.safetyDetails}`, startX + 5, safetyDetailsY, { width: pageWidth - 10, height: safetyDetailsH, ellipsis: true });
        doc.fillColor('#000');
        doc.y = safetyDetailsY + safetyDetailsH + 4;
      }

      // ===== VISITORS SECTION =====
      doc.y += 4;
      const visitorsY = doc.y;
      const visitors = (report.visitors as VisitorRow[]) || [];
      const visitorsText = visitors.length > 0 
        ? visitors.map(v => {
            let text = v.name;
            if (v.company) text += ` (${v.company})`;
            if (v.notes) text += ` - ${v.notes}`;
            return text;
          }).join('; ')
        : 'None';
      doc.fontSize(8).font('Helvetica-Bold').text('VISITORS:', startX, visitorsY);
      doc.fontSize(8).font('Helvetica');
      const maxVisitorsH = 20; // Maximum height for visitors text
      const visitorsH = Math.min(maxVisitorsH, doc.heightOfString(visitorsText, { width: pageWidth - 55 }));
      doc.text(visitorsText, startX + 50, visitorsY, { width: pageWidth - 55, height: visitorsH, ellipsis: true });
      doc.y = visitorsY + Math.max(visitorsH, 10) + 8;

      // ===== PHOTOS ATTACHED =====
      const photos = report.photos || [];
      doc.fontSize(8).font('Helvetica-Bold').text('PHOTOS ATTACHED:', startX, doc.y, { lineBreak: false });
      doc.font('Helvetica').text(`${photos.length} photo(s) - See attached sheet`, startX + 95, doc.y, { lineBreak: false });

      // ===== SIGNATURE SECTION =====
      // DEBUG: Log Y position and page info before signature
      const preSignaturePages = doc.bufferedPageRange().count;
      console.log(`PDF Debug: Before signature - doc.y=${doc.y.toFixed(0)}, page.height=${doc.page.height.toFixed(0)}, pages=${preSignaturePages}`);
      
      // Ensure signature fits on page 1 by clamping Y position
      const maxSignatureStartY = doc.page.height - 130; // Leave room for signature + footer
      doc.y = Math.min(doc.y + 20, maxSignatureStartY);
      const sigY = doc.y;

      doc.fontSize(7).font('Helvetica').text('SIGNATURE OF INSPECTOR', startX, sigY, { lineBreak: false });
      
      if (report.signaturePath) {
        const sigBuffer = await loadImageBuffer(report.signaturePath);
        if (sigBuffer) {
          try {
            doc.image(sigBuffer, startX, sigY + 8, { width: 140, height: 35, fit: [140, 35] });
          } catch (err) {
            console.error('Error adding signature:', err);
          }
        }
      }
      
      doc.moveTo(startX, sigY + 48).lineTo(startX + 200, sigY + 48).stroke();

      doc.fontSize(7).text('INSPECTOR NAME', startX, sigY + 52, { lineBreak: false });
      doc.font('Helvetica-Bold').text(inspectorName, startX + 75, sigY + 52, { lineBreak: false });
      
      doc.fontSize(7).font('Helvetica').text('LICENSE NO.', startX, sigY + 64, { lineBreak: false });
      doc.font('Helvetica-Bold').text(inspectorProfile?.licenseNumber || 'N/A', startX + 60, sigY + 64, { lineBreak: false });

      // Time tracking boxes - right side
      const timeX = 320;
      
      // Format time from 24h HH:MM to 12h format
      const formatTimeDisplay = (time: string | null | undefined): string => {
        if (!time) return '--';
        const [h, m] = time.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return '--';
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
      };
      
      const timeInStr = formatTimeDisplay(report.timeIn);
      const timeOutStr = formatTimeDisplay(report.timeOut);
      const regHrsStr = report.regularHours || '--';
      const otHrsStr = report.otHours || '--';
      
      doc.rect(timeX, sigY, 45, 28).stroke();
      doc.fontSize(7).font('Helvetica').text('TIME IN', timeX + 2, sigY + 2, { lineBreak: false });
      doc.fontSize(9).font('Helvetica-Bold').text(timeInStr, timeX + 2, sigY + 12, { lineBreak: false });

      doc.rect(timeX + 45, sigY, 45, 28).stroke();
      doc.fontSize(7).font('Helvetica').text('TIME OUT', timeX + 47, sigY + 2, { lineBreak: false });
      doc.fontSize(9).font('Helvetica-Bold').text(timeOutStr, timeX + 47, sigY + 12, { lineBreak: false });

      doc.rect(timeX + 90, sigY, 40, 28).stroke();
      doc.fontSize(7).font('Helvetica').text('REG HRS', timeX + 92, sigY + 2, { lineBreak: false });
      doc.fontSize(10).font('Helvetica-Bold').text(regHrsStr, timeX + 102, sigY + 12, { lineBreak: false });

      doc.rect(timeX + 130, sigY, 40, 28).stroke();
      doc.fontSize(7).font('Helvetica').text('OT HRS', timeX + 132, sigY + 2, { lineBreak: false });
      doc.fontSize(10).font('Helvetica-Bold').text(otHrsStr, timeX + 142, sigY + 12, { lineBreak: false });

      // Approval line
      doc.fontSize(7).font('Helvetica').text('Approved By: ______________________________________', timeX, sigY + 36, { lineBreak: false });

      // ===== PHOTOS ON PAGE 2 =====
      // DEBUG: Log page count after signature section
      const postSignaturePages = doc.bufferedPageRange().count;
      console.log(`PDF Debug: After signature section - pages=${postSignaturePages}`);
      
      if (photos.length > 0) {
        const photoGap = 12;
        const photoWidth = (pageWidth - photoGap) / 2;
        const photoHeight = 160;
        const captionHeight = 18;
        const rowHeight = photoHeight + captionHeight + 8;
        const headerHeight = 55; // Space for header on each photo page
        
        // Helper to add photo page header
        const addPhotoPageHeader = () => {
          doc.fontSize(12).font('Helvetica-Bold').text('PHOTO DOCUMENTATION', startX, 25, { lineBreak: false });
          doc.fontSize(9).font('Helvetica').text(`${projectName} - ${dateStr}`, startX, 42, { lineBreak: false });
        };
        
        // Start first photo page
        doc.addPage();
        console.log(`PDF Debug: Added page 2 for photos, now pages=${doc.bufferedPageRange().count}`);
        addPhotoPageHeader();
        
        let currentPhotoY = headerHeight;
        let currentPhotoX = startX;
        
        for (let i = 0; i < photos.length; i++) {
          // Check if we need a new page BEFORE starting a new row (not mid-row)
          // Only check when starting a new row (left column position)
          if (currentPhotoX === startX && currentPhotoY + rowHeight > doc.page.height - 35) {
            doc.addPage();
            console.log(`PDF Debug: Added additional page for photos, now pages=${doc.bufferedPageRange().count}`);
            addPhotoPageHeader();
            currentPhotoY = headerHeight;
          }
          
          const photo = photos[i];
          const photoBuffer = await loadImageBuffer(photo.filePath);
          
          if (photoBuffer) {
            try {
              doc.strokeColor('#ccc').lineWidth(0.5)
                .rect(currentPhotoX, currentPhotoY, photoWidth, photoHeight).stroke();
              doc.strokeColor('#000');
              
              doc.image(photoBuffer, currentPhotoX + 2, currentPhotoY + 2, {
                width: photoWidth - 4,
                height: photoHeight - 4,
                fit: [photoWidth - 4, photoHeight - 4],
                align: 'center',
                valign: 'center'
              });
              
              if (photo.caption) {
                doc.fontSize(8).font('Helvetica-Oblique').fillColor('#333')
                  .text(photo.caption, currentPhotoX, currentPhotoY + photoHeight + 2, {
                    width: photoWidth,
                    height: captionHeight,
                    align: 'center',
                    ellipsis: true,
                    lineBreak: false
                  });
                doc.fillColor('#000');
              }
            } catch (err) {
              console.error('Error adding photo to PDF:', err);
            }
          }
          
          // Move to next position in grid (2 photos per row)
          if (currentPhotoX === startX) {
            currentPhotoX = startX + photoWidth + photoGap;
          } else {
            currentPhotoX = startX;
            currentPhotoY += rowHeight;
          }
        }
      }

      // ===== FOOTER ON ALL PAGES =====
      const range = doc.bufferedPageRange();
      const totalPages = range.count;
      
      // DEBUG: Log page count
      console.log(`PDF Generation Debug: Total pages = ${totalPages} (page 1 = report, remaining = photos)`);
      
      
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
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
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

  // ========== BILLING & TIMESHEETS ==========

  // Generate timesheet PDF for a project/month
  app.post("/api/billing/timesheet", isAuthenticated, async (req: any, res) => {
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

      // Get company info
      let company = null;
      if (project.companyId) {
        company = await storage.getCompany(project.companyId);
      }

      // Get reports for the specified month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      // Filter by inspector if specified (for inspector's own timesheet)
      const targetInspectorId = inspectorId || userId;
      const allReports = await storage.getReportsForInvoice(projectId, startDate, endDate);
      const reports = allReports.filter(r => !inspectorId || r.inspectorId === targetInspectorId);

      // Get contracts for rates
      const contracts = project.companyId ? await storage.getContracts(project.companyId) : [];
      
      // Get inspector profile
      const inspectorProfile = await storage.getUserProfile(targetInspectorId);
      
      // Build timesheet data
      const timesheetData = aggregateReportsToTimesheetData(
        reports,
        [project],
        contracts,
        company,
        inspectorProfile,
        month,
        year
      );

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

  // Generate invoice PDF for a project/month with rates
  app.post("/api/billing/invoice", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      const { projectId, month, year, contractId } = req.body;

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

      // Get contract for rates
      let contract = null;
      if (contractId) {
        contract = await storage.getContract(contractId);
      }

      // Get client info
      let client = null;
      if (contract?.clientId) {
        client = await storage.getClient(contract.clientId);
      }

      // Get reports for the specified month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const reports = await storage.getReportsForInvoice(projectId, startDate, endDate);

      // Calculate hours
      let regularHours = 0;
      let overtimeHours = 0;
      
      for (const report of reports) {
        regularHours += parseFloat(report.regularHours || '0') || 0;
        overtimeHours += parseFloat(report.otHours || '0') || 0;
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

      // Get next invoice number and create record
      const invoiceNumber = await storage.getNextInvoiceNumber();
      await storage.createInvoice({
        companyId: project.companyId || '',
        projectId,
        contractId: contractId || undefined,
        clientId: contract?.clientId || undefined,
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
        projectName: project.name,
        projectNumber: project.projectNumber || undefined,
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
      const reportDate = new Date(report.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
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

      const { email, role, companyId, projectIds, expiresAt } = result.data;
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
        role: invite.role,
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
      });

      const projectIds = (invite.projectIds as string[]) || [];
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

      const { name, address, phone, email } = req.body;
      const updated = await storage.updateCompany(profile.activeCompanyId, { name, address, phone, email });
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

  // Create join request
  app.post("/api/join-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { companyId, message } = req.body;
      
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

      const request = await storage.createJoinRequest({ userId, companyId, message });
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
  app.post("/api/join-requests/:id/approve", isAuthenticated, async (req: any, res) => {
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
        return res.status(403).json({ message: "Only admins can approve join requests" });
      }

      // Update request status
      await storage.updateJoinRequestStatus(requestId, "approved", userId);
      
      // Add user as a member with inspector role
      await storage.addCompanyMember(request.companyId, request.userId, "inspector");
      
      res.json({ message: "Join request approved" });
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
      
      const profile = await storage.createOrUpdateUserProfile({
        userId,
        firstName: normalize(data.firstName),
        lastName: normalize(data.lastName),
        phone: normalize(data.phone),
        title: normalize(data.title),
        licenseNumber: normalize(data.licenseNumber),
        licenseState: normalize(data.licenseState),
        certifications: data.certifications || [],
        contractorCompanyName: normalize(data.contractorCompanyName),
        contractorAddress: normalize(data.contractorAddress),
        contractorPhone: normalize(data.contractorPhone),
        contractorEmail: normalize(data.contractorEmail),
      });
      
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
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

  return httpServer;
}
