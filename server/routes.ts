import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { insertProjectSchema, insertDailyReportSchema, updateUserProfileSchema, WorkActivityRow, VisitorRow } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { speechToText, openai } from "./replit_integrations/audio/client";

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

// Helper to check if user is effectively acting as system admin
// Returns true only if user has admin role AND has admin mode enabled (not in inspector mode)
const isEffectiveSystemAdmin = (profile: any): boolean => {
  return profile?.role === "admin" && profile?.preferAdminMode !== false;
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

// Multer config for photos
const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTOS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Multer config for app logo (admin settings)
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ASSETS_DIR),
  filename: (_req, _file, cb) => cb(null, "logo.png"),
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Multer config for company logos
const companyLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGOS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const companyLogoUpload = multer({
  storage: companyLogoStorage,
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

  // Serve static files from storage (authenticated access with ownership check)
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
      
      // If companyId is provided, check if user is effective admin of that company or system admin (respects inspector mode)
      if (companyId) {
        const hasAdminAccess = isEffectiveSystemAdmin(profile) || 
          await isEffectiveCompanyAdmin(userId, companyId, profile);
        
        if (!hasAdminAccess) {
          return res.status(403).json({ message: "You must be a company admin to create projects for this company" });
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
      
      // Check authorization (respects inspector mode): effective system admin, effective company admin, or project member
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      const effectiveSysAdmin = isEffectiveSystemAdmin(profile);
      let effectiveCompAdmin = false;
      if (existingProject.companyId) {
        effectiveCompAdmin = await isEffectiveCompanyAdmin(userId, existingProject.companyId, profile);
      }
      
      const canEdit = effectiveSysAdmin || effectiveCompAdmin || isProjectMember;
      
      if (!canEdit) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Handle companyId assignment separately with extra authorization (respects inspector mode)
      let updateData = { ...otherUpdates };
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
      const member = await storage.addProjectMember(req.params.id, validated.userId);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error adding project member:", error);
      res.status(500).json({ message: "Failed to add project member" });
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

  // ========== REPORTS ==========
  app.get("/api/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // If preferAdminMode is false (inspector toggle ON), show only user's own reports
      if (profile?.preferAdminMode === false) {
        const reports = await storage.getReports({ inspectorId: userId });
        const stats = await storage.getReportStats({ inspectorId: userId });
        return res.json({ reports, stats });
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
      
      // Use optimized query with combined inspector/company filter
      const options = {
        inspectorId: userId,
        companyIds: adminCompanyIds.length > 0 ? adminCompanyIds : undefined,
      };
      
      const reports = await storage.getReports(options);
      const stats = await storage.getReportStats(options);
      
      res.json({ reports, stats });
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
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
      
      const report = await storage.updateReport(req.params.id, validated);
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
      // - Inspectors cannot delete reports
      let hasAdminAccess = isEffectiveSystemAdmin(profile);
      if (!hasAdminAccess && existing.projectId) {
        const project = await storage.getProject(existing.projectId);
        if (project?.companyId) {
          hasAdminAccess = await isEffectiveCompanyAdmin(userId, project.companyId, profile);
        }
      }
      
      if (!hasAdminAccess) {
        return res.status(403).json({ message: "Access denied. Only admins can delete reports." });
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
        
        const photo = await storage.createPhoto({
          reportId: req.params.id,
          filePath: `/storage/uploads/${file.filename}`,
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

      // Ensure signature directory exists
      if (!fs.existsSync(SIGNATURES_DIR)) {
        fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
      }

      // Extract base64 data
      const base64Data = signature.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      const filename = `${req.params.id}.png`;
      const filePath = path.join(SIGNATURES_DIR, filename);
      fs.writeFileSync(filePath, buffer);

      const signaturePath = `/storage/signatures/${filename}`;
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

      // Generate PDF using pdfkit
      const filename = `${req.params.id}.pdf`;
      const filePath = path.join(REPORTS_DIR, filename);
      const pdfPath = `/storage/reports/${filename}`;

      // Disable automatic page creation to enforce strict 2-page limit
      const doc = new PDFDocument({ margin: 36, bufferPages: true, autoFirstPage: true });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftColWidth = 100;
      const rightColWidth = pageWidth - leftColWidth;
      const startX = doc.page.margins.left;
      const pageBottom = doc.page.height - doc.page.margins.bottom - 25;
      
      // PDF color scheme
      const PRIMARY_BLUE = '#1e40af';
      const PRIMARY_BLUE_BORDER = '#1e3a8a';
      
      // STRICT 2-page limit enforcement
      let currentPage = 1;
      const MAX_PAGES = 2;
      let pageLimitReached = false;
      
      // Helper: check if we can add content, set flag if limit reached
      const canAddContent = (heightNeeded: number): boolean => {
        if (pageLimitReached) return false;
        if (doc.y + heightNeeded <= pageBottom) return true;
        if (currentPage < MAX_PAGES) return true;
        pageLimitReached = true;
        return false;
      };
      
      // Helper: try to get space for content, returns false if page limit reached
      const ensureSpace = (heightNeeded: number): boolean => {
        if (pageLimitReached) return false;
        if (doc.y + heightNeeded <= pageBottom) return true;
        if (currentPage >= MAX_PAGES) {
          pageLimitReached = true;
          return false;
        }
        doc.addPage();
        currentPage++;
        return true;
      };
      
      // Helper function to draw a compact table row - returns false if skipped
      const drawTableRow = (label: string, value: string, options?: { bold?: boolean }): boolean => {
        if (pageLimitReached) return false;
        
        const textVal = (value || 'N/A').substring(0, 500); // Truncate long text
        doc.fontSize(8);
        const rowHeight = Math.max(13, Math.min(doc.heightOfString(textVal, { width: rightColWidth - 8 }) + 3, 60)); // Max row height
        
        if (!ensureSpace(rowHeight)) return false;
        
        const rowY = doc.y;
        doc.rect(startX, rowY, leftColWidth, rowHeight).stroke();
        doc.rect(startX + leftColWidth, rowY, rightColWidth, rowHeight).stroke();
        
        doc.fontSize(8).font('Helvetica-Bold').text(label, startX + 4, rowY + 2, { width: leftColWidth - 8, lineBreak: false });
        doc.fontSize(8).font(options?.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(textVal, startX + leftColWidth + 4, rowY + 2, { width: rightColWidth - 8, height: rowHeight - 4, ellipsis: true });
        
        doc.y = rowY + rowHeight;
        return true;
      };

      // Helper function to draw compact section header
      const drawSectionHeader = (title: string): boolean => {
        if (pageLimitReached) return false;
        
        if (!ensureSpace(30)) return false;
        
        if (doc.y > doc.page.margins.top + 10) {
          doc.moveDown(0.3);
        }
        
        const headerY = doc.y;
        doc.rect(startX, headerY, pageWidth, 14).fillAndStroke(PRIMARY_BLUE, PRIMARY_BLUE_BORDER);
        doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
          .text(title, startX + 5, headerY + 3, { width: pageWidth - 10, lineBreak: false });
        doc.y = headerY + 14;
        doc.fillColor('#000');
        return true;
      };

      // Compact header with logo and contact info
      const logoSize = 80; // Much smaller logo
      let hasLogo = false;
      const logoTopY = 8;
      let logoEndY = logoTopY;
      let company: any = null;
      
      // Get company info
      if (report.project?.companyId) {
        company = await storage.getCompany(report.project.companyId);
        
        if (company?.logoPath) {
          const logoFilePath = path.join(process.cwd(), company.logoPath.replace(/^\//, ''));
          if (fs.existsSync(logoFilePath)) {
            try {
              doc.image(logoFilePath, startX, logoTopY, {
                width: logoSize,
                height: logoSize,
                fit: [logoSize, logoSize]
              });
              hasLogo = true;
              logoEndY = logoTopY + logoSize;
            } catch (err) {
              console.error('Error adding company logo to PDF:', err);
            }
          }
        }
        
        // Compact contact info on the right - use lineBreak: false to prevent auto-pagination
        const contactX = startX + pageWidth - 180;
        let contactY = logoTopY;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
        if (company?.name) {
          doc.text(company.name.substring(0, 40), contactX, contactY, { width: 180, align: 'right', lineBreak: false });
          contactY += 11;
        }
        doc.font('Helvetica').fontSize(8);
        if (company?.address) {
          doc.text(company.address.substring(0, 50), contactX, contactY, { width: 180, align: 'right', lineBreak: false });
          contactY += 10;
        }
        if (company?.phone) {
          doc.text(company.phone.substring(0, 25), contactX, contactY, { width: 180, align: 'right', lineBreak: false });
          contactY += 10;
        }
        if (company?.email) {
          doc.text(company.email.substring(0, 40), contactX, contactY, { width: 180, align: 'right', lineBreak: false });
        }
      }
      
      // Title - compact, positioned beside logo, no line breaks
      const titleY = hasLogo ? logoTopY + 10 : doc.page.margins.top;
      const titleX = hasLogo ? startX + logoSize + 15 : startX;
      const titleWidth = hasLogo ? pageWidth - logoSize - 200 : pageWidth;
      doc.fontSize(14).font('Helvetica-Bold').text('DAILY FIELD REPORT', titleX, titleY, { width: titleWidth, lineBreak: false });
      doc.fontSize(8).font('Helvetica').text(new Date(report.date).toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      }), titleX, titleY + 16, { width: titleWidth, lineBreak: false });
      
      // Start content after header
      doc.y = Math.max(logoEndY, titleY + 30) + 5;

      // Project Information Section
      drawSectionHeader('PROJECT INFORMATION');
      drawTableRow('Project Name', report.project?.name || report.customProjectName || 'Unassigned Report', { bold: true });
      drawTableRow('Project Number', report.project?.projectNumber || 'N/A');
      if (report.project?.client) {
        drawTableRow('Client', report.project.client);
      }
      if (report.project?.address) {
        drawTableRow('Location', report.project.address);
      }

      // Report Details Section
      drawSectionHeader('REPORT DETAILS');
      drawTableRow('Inspector', report.inspectorName || 'Unknown');
      drawTableRow('Weather', `${report.weatherType || 'Not specified'}${report.weatherNotes ? ` - ${report.weatherNotes}` : ''}`);
      drawTableRow('Status', (report.status || 'draft').toUpperCase());

      // Work Activities Section - compact 3-column table
      const workActivities = (report.workActivities as WorkActivityRow[]) || [];
      if (!pageLimitReached && workActivities.length > 0 && canAddContent(40)) {
        if (drawSectionHeader('WORK ACTIVITIES')) {
          const activityColWidths = [130, 50, pageWidth - 130 - 50];
          
          const drawActivityTableHeader = (): boolean => {
            if (pageLimitReached) return false;
            const hdrY = doc.y;
            const headerBg = '#e5e7eb';
            doc.rect(startX, hdrY, activityColWidths[0], 12).fillAndStroke(headerBg, '#000');
            doc.rect(startX + activityColWidths[0], hdrY, activityColWidths[1], 12).fillAndStroke(headerBg, '#000');
            doc.rect(startX + activityColWidths[0] + activityColWidths[1], hdrY, activityColWidths[2], 12).fillAndStroke(headerBg, '#000');
            
            doc.fillColor('#000').fontSize(7).font('Helvetica-Bold');
            doc.text('Contractor/Trade', startX + 3, hdrY + 3, { width: activityColWidths[0] - 6, lineBreak: false });
            doc.text('Crew', startX + activityColWidths[0] + 3, hdrY + 3, { width: activityColWidths[1] - 6, lineBreak: false });
            doc.text('Work Activities', startX + activityColWidths[0] + activityColWidths[1] + 3, hdrY + 3, { width: activityColWidths[2] - 6, lineBreak: false });
            doc.y = hdrY + 12;
            return true;
          };
          
          drawActivityTableHeader();
          
          for (const activity of workActivities) {
            if (pageLimitReached) break;
            
            doc.fontSize(7);
            const descText = (activity.workDescription || '').substring(0, 200); // Truncate
            const descHeight = doc.heightOfString(descText, { width: activityColWidths[2] - 6 });
            const rowHeight = Math.max(11, Math.min(descHeight + 4, 40)); // Max height 40
            
            if (!ensureSpace(rowHeight)) break;
            
            const rowY = doc.y;
            doc.rect(startX, rowY, activityColWidths[0], rowHeight).stroke();
            doc.rect(startX + activityColWidths[0], rowY, activityColWidths[1], rowHeight).stroke();
            doc.rect(startX + activityColWidths[0] + activityColWidths[1], rowY, activityColWidths[2], rowHeight).stroke();
            
            doc.fontSize(7).font('Helvetica');
            doc.text((activity.contractor || '').substring(0, 30), startX + 3, rowY + 2, { width: activityColWidths[0] - 6, height: rowHeight - 4, ellipsis: true });
            doc.text(String(activity.headcount || 0), startX + activityColWidths[0] + 3, rowY + 2, { width: activityColWidths[1] - 6, lineBreak: false });
            doc.text(descText, startX + activityColWidths[0] + activityColWidths[1] + 3, rowY + 2, { width: activityColWidths[2] - 6, height: rowHeight - 4, ellipsis: true });
            doc.y = rowY + rowHeight;
          }
        }
      }

      // Visitors Section
      const visitors = (report.visitors as VisitorRow[]) || [];
      if (!pageLimitReached && visitors.length > 0 && canAddContent(30)) {
        if (drawSectionHeader('VISITORS')) {
          for (const visitor of visitors) {
            if (pageLimitReached) break;
            drawTableRow(visitor.name || 'Unknown', `${visitor.company || ''}${visitor.notes ? ` - ${visitor.notes}` : ''}`);
          }
        }
      }

      // Materials Delivered
      if (!pageLimitReached && report.materialsDelivered && canAddContent(30)) {
        if (drawSectionHeader('MATERIALS DELIVERED')) {
          drawTableRow('Items', report.materialsDelivered);
        }
      }

      // Issues/Safety Section
      if (!pageLimitReached && (report.issuesFlag || report.safetyFlag) && canAddContent(30)) {
        if (drawSectionHeader('ISSUES & SAFETY')) {
          if (!pageLimitReached && report.issuesFlag) {
            drawTableRow('Issues/Delays', report.issuesDetails || 'No details provided');
          }
          if (!pageLimitReached && report.safetyFlag) {
            drawTableRow('Safety Incident', report.safetyDetails || 'No details provided');
          }
        }
      }

      // Inspections
      if (!pageLimitReached && report.inspections && canAddContent(30)) {
        if (drawSectionHeader('INSPECTIONS')) {
          drawTableRow('Details', report.inspections);
        }
      }

      // Additional Notes
      if (!pageLimitReached && report.workPerformed && canAddContent(30)) {
        if (drawSectionHeader('ADDITIONAL NOTES')) {
          drawTableRow('Notes', report.workPerformed);
        }
      }

      // Equipment
      if (!pageLimitReached && report.equipment && canAddContent(30)) {
        if (drawSectionHeader('EQUIPMENT')) {
          drawTableRow('On Site', report.equipment);
        }
      }

      // Photos - max 4 photos, only if space available
      const photos = report.photos || [];
      const maxPhotos = Math.min(photos.length, 4);
      if (!pageLimitReached && maxPhotos > 0 && canAddContent(80)) {
        const photoHeight = 75;
        const photoPadding = 3;
        const photoGap = 8;
        const captionHeight = 10;
        
        if (drawSectionHeader(`PHOTOS${photos.length > 4 ? ` (${maxPhotos} of ${photos.length})` : ''}`)) {
          const photoWidth = (pageWidth - photoGap) / 2;
          let currentY = doc.y;
          
          for (let i = 0; i < maxPhotos; i += 2) {
            if (pageLimitReached) break;
            
            const neededHeight = photoHeight + captionHeight + 4;
            if (!ensureSpace(neededHeight)) break;
            currentY = doc.y;
            
            // Left photo
            const leftPhoto = photos[i];
            const leftPhotoPath = path.join(process.cwd(), leftPhoto.filePath.replace(/^\//, ''));
            if (fs.existsSync(leftPhotoPath)) {
              try {
                doc.lineWidth(0.5).strokeColor('#374151').rect(startX, currentY, photoWidth, photoHeight).stroke();
                doc.strokeColor('#000');
                doc.image(leftPhotoPath, startX + photoPadding, currentY + photoPadding, { 
                  width: photoWidth - (photoPadding * 2), height: photoHeight - (photoPadding * 2),
                  fit: [photoWidth - (photoPadding * 2), photoHeight - (photoPadding * 2)], align: 'center', valign: 'center'
                });
                if (leftPhoto.caption) {
                  doc.fontSize(6).font('Helvetica-Oblique').fillColor('#4b5563')
                    .text(leftPhoto.caption.substring(0, 35), startX, currentY + photoHeight + 1, { width: photoWidth, align: 'center', lineBreak: false });
                  doc.fillColor('#000');
                }
              } catch (err) { console.error('Error adding photo:', err); }
            }
            
            // Right photo
            if (i + 1 < maxPhotos) {
              const rightPhoto = photos[i + 1];
              const rightPhotoPath = path.join(process.cwd(), rightPhoto.filePath.replace(/^\//, ''));
              const rightX = startX + photoWidth + photoGap;
              if (fs.existsSync(rightPhotoPath)) {
                try {
                  doc.lineWidth(0.5).strokeColor('#374151').rect(rightX, currentY, photoWidth, photoHeight).stroke();
                  doc.strokeColor('#000');
                  doc.image(rightPhotoPath, rightX + photoPadding, currentY + photoPadding, { 
                    width: photoWidth - (photoPadding * 2), height: photoHeight - (photoPadding * 2),
                    fit: [photoWidth - (photoPadding * 2), photoHeight - (photoPadding * 2)], align: 'center', valign: 'center'
                  });
                  if (rightPhoto.caption) {
                    doc.fontSize(6).font('Helvetica-Oblique').fillColor('#4b5563')
                      .text(rightPhoto.caption.substring(0, 35), rightX, currentY + photoHeight + 1, { width: photoWidth, align: 'center', lineBreak: false });
                    doc.fillColor('#000');
                  }
                } catch (err) { console.error('Error adding photo:', err); }
              }
            }
            
            currentY += photoHeight + captionHeight + 3;
            doc.y = currentY;
          }
        }
      }

      // Signature Section - compact, only if space available
      if (!pageLimitReached && report.signaturePath && canAddContent(50)) {
        if (drawSectionHeader('SIGNATURE')) {
          const sigPath = path.join(process.cwd(), report.signaturePath.replace(/^\//, ''));
          if (fs.existsSync(sigPath)) {
            const sigBoxY = doc.y;
            const sigBoxHeight = 40;
            doc.lineWidth(0.5).strokeColor('#374151').rect(startX, sigBoxY, 120, sigBoxHeight).stroke();
            doc.strokeColor('#000');
            
            doc.image(sigPath, startX + 2, sigBoxY + 2, { width: 116, height: sigBoxHeight - 4, fit: [116, sigBoxHeight - 4] });
            
            // Name/date on the right, inline with signature
            doc.fontSize(7).font('Helvetica').fillColor('#374151');
            doc.text(`${report.inspectorName || 'Inspector'}`, startX + 130, sigBoxY + 6, { lineBreak: false });
            doc.text(`${new Date(report.date).toLocaleDateString('en-US')}`, startX + 130, sigBoxY + 17, { lineBreak: false });
            if (report.signedAt) {
              doc.fontSize(6).text(`Signed: ${new Date(report.signedAt).toLocaleString('en-US')}`, startX + 130, sigBoxY + 28, { lineBreak: false });
            }
            doc.fillColor('#000');
            
            doc.y = sigBoxY + sigBoxHeight;
          }
        }
      }

      // Professional Disclaimer - only add if there's enough space on current page
      const disclaimerHeight = 40;
      if (!pageLimitReached && doc.y + disclaimerHeight < pageBottom) {
        doc.moveDown(0.5);
        doc.fontSize(6).font('Helvetica-Oblique').fillColor('#6b7280')
          .text(
            'This report documents field observations on the date indicated. Work not observed does not imply acceptance. Confidential document for authorized recipients only.',
            startX, doc.y, 
            { width: pageWidth, align: 'justify', lineBreak: true }
          );
        doc.fillColor('#000');
      }

      // Add page numbers - strictly limit to MAX_PAGES
      const range = doc.bufferedPageRange();
      const actualPages = Math.min(range.count, MAX_PAGES);
      const generatedDate = new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      
      // Only add footers to pages we want to keep (MAX_PAGES)
      for (let i = 0; i < actualPages; i++) {
        doc.switchToPage(i);
        
        // Footer with page number and generation date
        const footerY = doc.page.height - 30;
        doc.fontSize(8).font('Helvetica').fillColor('#6b7280');
        
        // Left: Generated date
        doc.text(`Generated: ${generatedDate}`, startX, footerY, { 
          width: pageWidth / 2, 
          align: 'left',
          lineBreak: false
        });
        
        // Right: Page number - always show "of MAX_PAGES" to indicate limit
        doc.text(`Page ${i + 1} of ${actualPages}`, startX + pageWidth / 2, footerY, { 
          width: pageWidth / 2, 
          align: 'right',
          lineBreak: false
        });
        
        doc.fillColor('#000');
      }
      
      doc.end();

      // Wait for write to complete
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // If we have more pages than MAX_PAGES, trim excess pages using pdf-lib
      if (range.count > MAX_PAGES) {
        console.log(`PDF has ${range.count} pages, trimming to ${MAX_PAGES}`);
        const { PDFDocument } = await import('pdf-lib');
        
        // Read the generated PDF
        const pdfBytes = fs.readFileSync(filePath);
        const srcDoc = await PDFDocument.load(pdfBytes);
        
        // Create a new PDF with only MAX_PAGES
        const newDoc = await PDFDocument.create();
        const pagesToCopy = await newDoc.copyPages(srcDoc, Array.from({ length: MAX_PAGES }, (_, i) => i));
        pagesToCopy.forEach(page => newDoc.addPage(page));
        
        // Save the trimmed PDF
        const trimmedBytes = await newDoc.save();
        fs.writeFileSync(filePath, trimmedBytes);
        console.log(`PDF trimmed to ${MAX_PAGES} pages successfully`);
      }

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

      // Delete the file
      const filePath = path.join(process.cwd(), report.pdfPath.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Update the report
      await storage.updateReport(req.params.id, { pdfPath: null });

      res.json({ message: "PDF deleted successfully" });
    } catch (error) {
      console.error("Error deleting PDF:", error);
      res.status(500).json({ message: "Failed to delete PDF" });
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

      // Read PDF file
      const pdfPath = path.join(process.cwd(), report.pdfPath.replace(/^\//, ''));
      if (!fs.existsSync(pdfPath)) {
        return res.status(400).json({ message: "PDF file not found. Please regenerate the PDF." });
      }
      const pdfBuffer = fs.readFileSync(pdfPath);

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

  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !["inspector", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
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

  app.post("/api/admin/logo", isAuthenticated, isAdmin, logoUpload.single("logo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No logo file provided" });
      }

      const logoPath = "/assets/logo.png";
      await storage.setSetting("company_logo", logoPath);

      res.json({ logoPath });
    } catch (error) {
      console.error("Error uploading logo:", error);
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // ========== INVITE ROUTES ==========
  const createInviteSchema = z.object({
    email: z.string().email("Valid email is required"),
    role: z.enum(["inspector", "admin"]).default("inspector"),
    companyId: z.string().optional(),
    projectIds: z.array(z.string()).optional().default([]),
    expiresAt: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  });

  app.get("/api/admin/invites", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const invites = await storage.getInvites();
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  app.post("/api/admin/invites", isAuthenticated, isAdmin, async (req: any, res) => {
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

      const existingInvite = await storage.getInviteByEmail(email);
      if (existingInvite) {
        return res.status(400).json({ message: "An active invite already exists for this email" });
      }

      const token = randomUUID();
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 7);

      const invite = await storage.createInvite({
        email,
        role,
        companyId,
        projectIds,
        token,
        invitedBy: userId,
        expiresAt: expiresAt || defaultExpiry,
        status: "pending",
      });

      // Send invitation email via Resend
      try {
        const { sendEmail } = await import('./replit_integrations/email/client');
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : 'http://localhost:5000';
        
        const inviteLink = `${baseUrl}/accept-invite/${token}`;
        const company = companyId ? await storage.getCompany(companyId) : null;
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">You've Been Invited to Field Daily Reports</h2>
            <p>You have been invited to join${company ? ` <strong>${company.name}</strong> on` : ''} Field Daily Reports as a${role === 'admin' ? 'n' : ''} <strong>${role}</strong>.</p>
            <p>Click the button below to accept your invitation and create your account:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
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

  app.delete("/api/admin/invites/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteInvite(req.params.id);
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

      // Add user to company if companyId is set on invite
      if (invite.companyId) {
        await storage.addCompanyMember(invite.companyId, userId, invite.role as "inspector" | "admin");
      }

      await storage.createOrUpdateUserProfile({
        userId,
        role: invite.role as "inspector" | "admin",
        activeCompanyId: invite.companyId || undefined,
        email: invite.email,
      });

      const projectIds = (invite.projectIds as string[]) || [];
      for (const projectId of projectIds) {
        await storage.addProjectMember(projectId, userId);
      }

      await storage.updateInviteStatus(invite.id, "accepted");

      res.json({ 
        success: true, 
        message: "Invite accepted successfully",
        companyId: invite.companyId,
        projectsAssigned: projectIds.length,
        role: invite.role,
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
      
      // Check if user is a company admin
      const membership = await storage.getCompanyMember(companyId, userId);
      const profile = await storage.getUserProfile(userId);
      const isGlobalAdmin = profile?.role === "admin";
      
      if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
        // Delete uploaded file if unauthorized
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(403).json({ message: "Only company admins can upload logos" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No logo file provided" });
      }
      
      const logoPath = `/storage/logos/${req.file.filename}`;
      
      // Delete old logo if exists
      const existingCompany = await storage.getCompany(companyId);
      if (existingCompany?.logoPath) {
        const oldLogoPath = path.join(process.cwd(), existingCompany.logoPath.replace(/^\//, ''));
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
      
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
      
      // Check if user is a company admin
      const membership = await storage.getCompanyMember(companyId, userId);
      const profile = await storage.getUserProfile(userId);
      const isGlobalAdmin = profile?.role === "admin";
      
      if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
        return res.status(403).json({ message: "Only company admins can delete logos" });
      }
      
      const company = await storage.getCompany(companyId);
      if (company?.logoPath) {
        const logoPath = path.join(process.cwd(), company.logoPath.replace(/^\//, ''));
        if (fs.existsSync(logoPath)) {
          fs.unlinkSync(logoPath);
        }
        await storage.updateCompany(companyId, { logoPath: null });
      }
      
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
      
      // Check if user is a company admin OR global admin
      const membership = await storage.getCompanyMember(companyId, userId);
      const profile = await storage.getUserProfile(userId);
      const isGlobalAdmin = profile?.role === "admin";
      
      if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
        return res.status(403).json({ message: "Access denied. Admin rights required." });
      }
      
      const members = await storage.getCompanyMembers(companyId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching company members:", error);
      res.status(500).json({ message: "Failed to fetch company members" });
    }
  });

  // Add company member (global admin or company admin)
  app.post("/api/companies/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const { userId, role } = req.body;
      
      // Check if user is a company admin OR global admin
      const membership = await storage.getCompanyMember(companyId, currentUserId);
      const profile = await storage.getUserProfile(currentUserId);
      const isGlobalAdmin = profile?.role === "admin";
      
      if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
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

  // Update company member role (global admin or company admin)
  app.patch("/api/companies/:id/members/:userId/role", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const targetUserId = req.params.userId;
      const { role } = req.body;
      
      // Check if user is a company admin OR global admin
      const membership = await storage.getCompanyMember(companyId, currentUserId);
      const profile = await storage.getUserProfile(currentUserId);
      const isGlobalAdmin = profile?.role === "admin";
      
      if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
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

  // Remove company member (global admin or company admin)
  app.delete("/api/companies/:id/members/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user?.claims?.sub;
      const companyId = req.params.id;
      const targetUserId = req.params.userId;
      
      // Check if user is a company admin OR global admin
      const membership = await storage.getCompanyMember(companyId, currentUserId);
      const profile = await storage.getUserProfile(currentUserId);
      const isGlobalAdmin = profile?.role === "admin";
      
      if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
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

  // Get company projects (global admin or company admin)
  app.get("/api/companies/:id/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Check if user is a company admin OR global admin
      const membership = await storage.getCompanyMember(companyId, userId);
      const profile = await storage.getUserProfile(userId);
      const isGlobalAdmin = profile?.role === "admin";
      
      if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
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

  // Get pending join requests for a company (company admins only)
  app.get("/api/companies/:id/join-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const companyId = req.params.id;
      
      // Check if user is a company admin
      const membership = await storage.getCompanyMember(companyId, userId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only company admins can view join requests" });
      }

      const requests = await storage.getJoinRequestsForCompany(companyId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching company join requests:", error);
      res.status(500).json({ message: "Failed to fetch join requests" });
    }
  });

  // Approve join request (company admins only)
  app.post("/api/join-requests/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const requestId = req.params.id;
      
      const request = await storage.getJoinRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: "Join request not found" });
      }

      // Check if user is a company admin
      const membership = await storage.getCompanyMember(request.companyId, userId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only company admins can approve join requests" });
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

  // Reject join request (company admins only)
  app.post("/api/join-requests/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const requestId = req.params.id;
      
      const request = await storage.getJoinRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: "Join request not found" });
      }

      // Check if user is a company admin
      const membership = await storage.getCompanyMember(request.companyId, userId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only company admins can reject join requests" });
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
      const projectsList = await storage.getAllProjectsForUser(userId);
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

  // Get projects for a specific company
  app.get("/api/companies/:id/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      // Check membership or admin (unless in inspector mode)
      const isMember = await storage.isUserMemberOfCompany(req.params.id, userId);
      if (!isMember && (profile?.role !== "admin" || profile?.preferAdminMode === false)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const projectsList = await storage.getProjectsByCompany(req.params.id);
      
      // For non-admin OR when in inspector mode, filter to only assigned projects
      if (profile?.role !== "admin" || profile?.preferAdminMode === false) {
        const assignedProjectIds = await storage.getProjectsForUser(userId);
        const filtered = projectsList.filter(p => assignedProjectIds.includes(p.id));
        return res.json(filtered);
      }
      
      res.json(projectsList);
    } catch (error) {
      console.error("Error fetching company projects:", error);
      res.status(500).json({ message: "Failed to fetch company projects" });
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

  return httpServer;
}
