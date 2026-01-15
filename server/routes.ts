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

// Ensure upload directories exist
const UPLOAD_DIR = path.join(process.cwd(), "storage");
const PHOTOS_DIR = path.join(UPLOAD_DIR, "uploads");
const SIGNATURES_DIR = path.join(UPLOAD_DIR, "signatures");
const REPORTS_DIR = path.join(UPLOAD_DIR, "reports");
const ASSETS_DIR = path.join(process.cwd(), "public", "assets");

[PHOTOS_DIR, SIGNATURES_DIR, REPORTS_DIR, ASSETS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Role-based authorization middleware
const isAdmin: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profile = await storage.getUserProfile(userId);
    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
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

// Multer config for logo
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

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  projectNumber: z.string().min(1, "Project number is required"),
  companyId: z.string().optional(),
  client: z.string().optional(),
  address: z.string().optional(),
  distributionEmails: z.array(z.string().email()).optional().default([]),
  defaultFolderPath: z.string().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const createReportSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
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

      // Admins can access all files
      if (profile?.role === "admin") {
        return res.sendFile(filePath);
      }

      // Check ownership based on file type
      const pathParts = req.path.split('/');
      
      if (pathParts[1] === 'uploads') {
        // Photo files - check if user owns the report that contains this photo
        const filename = pathParts[2];
        const photoPath = `/storage/uploads/${filename}`;
        const photo = await storage.getPhotoByPath(photoPath);
        if (photo) {
          const report = await storage.getReport(photo.reportId);
          if (report && report.inspectorId === userId) {
            return res.sendFile(filePath);
          }
        }
      } else if (pathParts[1] === 'signatures' || pathParts[1] === 'reports') {
        // Signature and PDF files are named with report ID
        const filename = pathParts[2];
        const reportId = filename?.replace(/\.(png|pdf)$/, '');
        if (reportId) {
          const report = await storage.getReport(reportId);
          if (report && report.inspectorId === userId) {
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
      
      let projectsList = await storage.getProjects();
      
      // Non-admin users only see their assigned projects
      if (profile?.role !== "admin") {
        const assignedProjectIds = await storage.getProjectsForUser(userId);
        projectsList = projectsList.filter(p => assignedProjectIds.includes(p.id));
      }
      
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
      
      // Non-admin users can only view projects they're assigned to
      if (profile?.role !== "admin") {
        const isProjectMember = await storage.isUserMemberOfProject(req.params.id, userId);
        if (!isProjectMember) {
          return res.status(403).json({ message: "Access denied" });
        }
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
      const { companyId, ...projectData } = req.body;
      
      // If companyId is provided, check if user is admin of that company or global admin
      if (companyId) {
        const membership = await storage.getCompanyMember(companyId, userId);
        const profile = await storage.getUserProfile(userId);
        const isGlobalAdmin = profile?.role === "admin";
        
        if (!isGlobalAdmin && (!membership || membership.role !== "admin")) {
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
      const { companyId: newCompanyId, ...otherUpdates } = req.body;
      
      // Get the project to check ownership
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check authorization: global admin, company admin, or project member
      const profile = await storage.getUserProfile(userId);
      const isGlobalAdmin = profile?.role === "admin";
      const isProjectMember = await storage.isUserMemberOfProject(projectId, userId);
      
      let canEdit = isGlobalAdmin || isProjectMember;
      
      // If project belongs to a company, check if user is company admin
      if (existingProject.companyId) {
        const membership = await storage.getCompanyMember(existingProject.companyId, userId);
        if (membership?.role === "admin") {
          canEdit = true;
        }
      }
      
      if (!canEdit) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Handle companyId assignment separately with extra authorization
      let updateData = { ...otherUpdates };
      if (newCompanyId !== undefined) {
        // If assigning to a new company, user must be admin of that company
        if (newCompanyId) {
          const targetMembership = await storage.getCompanyMember(newCompanyId, userId);
          if (!isGlobalAdmin && (!targetMembership || targetMembership.role !== "admin")) {
            return res.status(403).json({ message: "You must be an admin of the target company to assign projects" });
          }
        }
        // Also check user can remove from current company (if it has one)
        if (existingProject.companyId && newCompanyId !== existingProject.companyId) {
          const currentMembership = await storage.getCompanyMember(existingProject.companyId, userId);
          if (!isGlobalAdmin && (!currentMembership || currentMembership.role !== "admin")) {
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

  app.delete("/api/projects/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const projectId = req.params.id;
      
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
  app.get("/api/projects/:id/members", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const members = await storage.getProjectMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  app.post("/api/projects/:id/members", isAuthenticated, isAdmin, async (req, res) => {
    try {
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

  app.delete("/api/projects/:id/members/:userId", isAuthenticated, isAdmin, async (req, res) => {
    try {
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
      const activeCompanyId = profile?.activeCompanyId || undefined;
      
      // Build filter options - always filter by active company if set
      // Admins see all reports in the company, inspectors see only their own
      const options = {
        inspectorId: profile?.role === "admin" ? undefined : userId,
        companyId: activeCompanyId,
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
      
      // Check if user can access this report
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      if (profile?.role !== "admin" && report.inspectorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(report);
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
      
      // Verify user has access to the project (admin or assigned member)
      if (profile?.role !== "admin") {
        const isProjectMember = await storage.isUserMemberOfProject(validated.projectId, userId);
        if (!isProjectMember) {
          return res.status(403).json({ message: "You are not assigned to this project" });
        }
      }
      
      const report = await storage.createReport({
        ...validated,
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
      
      // Permission check:
      // - System admins can edit any report
      // - Company admins can edit any report in their company
      // - Inspectors can only edit their own draft reports
      const isSystemAdmin = profile?.role === "admin";
      const isOwner = existing.inspectorId === userId;
      
      // Check if user is a company admin for the report's project
      let isCompanyAdmin = false;
      if (existing.projectId) {
        const project = await storage.getProject(existing.projectId);
        if (project?.companyId) {
          const membership = await storage.getCompanyMember(project.companyId, userId);
          isCompanyAdmin = membership?.role === "admin";
        }
      }
      
      // Determine if user can edit
      if (isSystemAdmin || isCompanyAdmin) {
        // Admins can edit any report
      } else if (isOwner && existing.status === "draft") {
        // Inspectors can only edit their own drafts
      } else {
        return res.status(403).json({ message: "Access denied. Only admins can edit submitted reports." });
      }
      
      const validated = updateReportSchema.parse(req.body);
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
      
      // Permission check:
      // - System admins can delete any report
      // - Company admins can delete any report in their company
      // - Inspectors cannot delete reports
      const isSystemAdmin = profile?.role === "admin";
      
      // Check if user is a company admin for the report's project
      let isCompanyAdmin = false;
      if (existing.projectId) {
        const project = await storage.getProject(existing.projectId);
        if (project?.companyId) {
          const membership = await storage.getCompanyMember(project.companyId, userId);
          isCompanyAdmin = membership?.role === "admin";
        }
      }
      
      if (!isSystemAdmin && !isCompanyAdmin) {
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
      if (profile?.role !== "admin" && existing.inspectorId !== userId) {
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
      
      if (profile?.role !== "admin" && report.inspectorId !== userId) {
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
      
      if (profile?.role !== "admin" && report.inspectorId !== userId) {
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
      if (profile?.role !== "admin" && existing.inspectorId !== userId) {
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
      if (profile?.role !== "admin" && report.inspectorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Generate PDF using pdfkit
      const filename = `${req.params.id}.pdf`;
      const filePath = path.join(REPORTS_DIR, filename);
      const pdfPath = `/storage/reports/${filename}`;

      const doc = new PDFDocument({ margin: 50 });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('Daily Field Report', { align: 'center' });
      doc.moveDown(0.5);

      // Project info
      doc.fontSize(14).font('Helvetica-Bold').text(report.project?.name || 'Unknown Project');
      doc.fontSize(10).font('Helvetica').text(`Project #: ${report.project?.projectNumber || 'N/A'}`);
      if (report.project?.client) {
        doc.text(`Client: ${report.project.client}`);
      }
      if (report.project?.address) {
        doc.text(`Location: ${report.project.address}`);
      }
      doc.moveDown();

      // Report details
      doc.fontSize(12).font('Helvetica-Bold').text('Report Details');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Date: ${new Date(report.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
      doc.text(`Inspector: ${report.inspectorName || 'Unknown'}`);
      doc.text(`Weather: ${report.weatherType || 'Not specified'}${report.weatherNotes ? ` - ${report.weatherNotes}` : ''}`);
      doc.text(`Status: ${report.status || 'draft'}`);
      doc.moveDown();

      // Work Activities
      const workActivities = (report.workActivities as WorkActivityRow[]) || [];
      if (workActivities.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Work Activities');
        doc.fontSize(10).font('Helvetica');
        workActivities.forEach((activity, index) => {
          doc.text(`${index + 1}. ${activity.contractor} (${activity.headcount} workers)`);
          doc.text(`   ${activity.workDescription}`, { indent: 20 });
        });
        doc.moveDown();
      }

      // Visitors
      const visitors = (report.visitors as VisitorRow[]) || [];
      if (visitors.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Visitors');
        doc.fontSize(10).font('Helvetica');
        visitors.forEach((visitor) => {
          doc.text(`• ${visitor.name} (${visitor.company})${visitor.notes ? ` - ${visitor.notes}` : ''}`);
        });
        doc.moveDown();
      }

      // Issues/Safety
      if (report.issuesFlag) {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('orange').text('Issues/Delays');
        doc.fontSize(10).font('Helvetica').fillColor('black').text(report.issuesDetails || 'No details provided');
        doc.moveDown();
      }

      if (report.safetyFlag) {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('red').text('Safety Incidents');
        doc.fontSize(10).font('Helvetica').fillColor('black').text(report.safetyDetails || 'No details provided');
        doc.moveDown();
      }

      // Inspections
      if (report.inspections) {
        doc.fontSize(12).font('Helvetica-Bold').text('Inspections');
        doc.fontSize(10).font('Helvetica').text(report.inspections);
        doc.moveDown();
      }

      // Additional Notes
      if (report.workPerformed) {
        doc.fontSize(12).font('Helvetica-Bold').text('Additional Notes');
        doc.fontSize(10).font('Helvetica').text(report.workPerformed);
        doc.moveDown();
      }

      // Equipment
      if (report.equipment) {
        doc.fontSize(12).font('Helvetica-Bold').text('Equipment');
        doc.fontSize(10).font('Helvetica').text(report.equipment);
        doc.moveDown();
      }

      // Materials Delivered
      if (report.materialsDelivered) {
        doc.fontSize(12).font('Helvetica-Bold').text('Materials Delivered');
        doc.fontSize(10).font('Helvetica').text(report.materialsDelivered);
        doc.moveDown();
      }

      // Photos - 2 columns layout
      const photos = report.photos || [];
      if (photos.length > 0) {
        doc.addPage();
        doc.fontSize(12).font('Helvetica-Bold').text('Photos');
        doc.moveDown(0.5);
        
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const photoWidth = (pageWidth - 20) / 2; // 20px gap between photos
        const startX = doc.page.margins.left;
        let currentY = doc.y;
        
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const photoPath = path.join(process.cwd(), photo.filePath.replace(/^\//, ''));
          const isLeftColumn = i % 2 === 0;
          const xPos = isLeftColumn ? startX : startX + photoWidth + 20;
          
          if (fs.existsSync(photoPath)) {
            try {
              // Check if we need a new page (leave room for photo + caption)
              if (isLeftColumn && currentY > doc.page.height - 250) {
                doc.addPage();
                currentY = doc.page.margins.top;
              }
              
              doc.image(photoPath, xPos, currentY, { width: photoWidth, height: 150, fit: [photoWidth, 150] });
              
              // Caption - truncate to prevent overflow
              if (photo.caption) {
                doc.fontSize(8).font('Helvetica-Oblique');
                const truncatedCaption = photo.caption.length > 60 
                  ? photo.caption.substring(0, 60) + '...' 
                  : photo.caption;
                doc.text(truncatedCaption, xPos, currentY + 155, { width: photoWidth, lineBreak: false });
              }
              
              // Move to next row after right column
              if (!isLeftColumn || i === photos.length - 1) {
                currentY += 175;
                doc.y = currentY;
              }
            } catch (err) {
              console.error('Error adding photo to PDF:', err);
            }
          }
        }
      }

      // Signature
      if (report.signaturePath) {
        doc.fontSize(12).font('Helvetica-Bold').text('Signature');
        const sigPath = path.join(process.cwd(), report.signaturePath.replace(/^\//, ''));
        if (fs.existsSync(sigPath)) {
          doc.image(sigPath, { width: 150 });
        }
        if (report.signedAt) {
          doc.fontSize(8).font('Helvetica').text(`Signed: ${new Date(report.signedAt).toLocaleString()}`);
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica').fillColor('gray')
        .text(`Generated on ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();

      // Wait for write to complete
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      await storage.updateReport(req.params.id, { pdfPath });

      res.json({ pdfUrl: pdfPath, message: "PDF generated successfully" });
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // ========== DISTRIBUTION ==========
  app.post("/api/reports/:id/distribute", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const profile = await storage.getUserProfile(userId);
      
      const { recipients } = req.body;
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ message: "Recipients required" });
      }

      const report = await storage.getReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      if (profile?.role !== "admin" && report.inspectorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Create distribution log
      const log = await storage.createDistributionLog({
        reportId: req.params.id,
        sentTo: recipients.join(", "),
        status: "pending",
      });

      console.log(`Distribution requested for report ${req.params.id} to:`, recipients);

      res.json({ message: "Distribution queued", log });
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

      res.json({ success: true, message: "Invite accepted successfully" });
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
  // Get projects for current user (filtered by active company)
  app.get("/api/my-projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      // Get ALL projects the user is a member of (regardless of company)
      const projectsList = await storage.getAllProjectsForUser(userId);
      res.json(projectsList);
    } catch (error) {
      console.error("Error fetching user projects:", error);
      res.status(500).json({ message: "Failed to fetch user projects" });
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
      
      // Check membership or admin
      const isMember = await storage.isUserMemberOfCompany(req.params.id, userId);
      if (!isMember && profile?.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const projectsList = await storage.getProjectsByCompany(req.params.id);
      
      // For non-admin, filter to only assigned projects
      if (profile?.role !== "admin") {
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
  app.get("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      let profile = await storage.getUserProfile(userId);
      
      // Auto-create profile if doesn't exist
      if (!profile) {
        profile = await storage.createOrUpdateUserProfile({
          userId,
          role: "inspector", // Default role
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

  return httpServer;
}
