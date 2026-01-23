import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";

// Helper to check if email should have admin access
const getAdminEmails = (): string[] => {
  const adminEmails = process.env.ADMIN_EMAILS || "";
  return adminEmails.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
};

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get current user's profile (including role)
  app.get("/api/auth/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email?.toLowerCase();
      let profile = await storage.getUserProfile(userId);
      
      // Check if this email should have admin access
      const adminEmails = getAdminEmails();
      const shouldBeAdmin = userEmail && adminEmails.includes(userEmail);
      
      if (!profile) {
        // Auto-create profile with appropriate role
        profile = await storage.createOrUpdateUserProfile({
          userId,
          role: shouldBeAdmin ? "admin" : "inspector",
          email: userEmail,
        });
      } else if (shouldBeAdmin && profile.role !== "admin") {
        // Upgrade to admin if email is in admin list but profile isn't admin yet
        profile = await storage.createOrUpdateUserProfile({
          userId,
          role: "admin",
        });
      }
      
      // Check for pending member assignments and apply them
      if (userEmail) {
        const pendingAssignments = await storage.getPendingAssignmentsForEmail(userEmail);
        for (const assignment of pendingAssignments) {
          // Check if already a member of this company
          const isMember = await storage.isUserMemberOfCompany(assignment.companyId, userId);
          if (!isMember) {
            // Add user to company with assigned role
            await storage.addCompanyMember(assignment.companyId, userId, assignment.role as "inspector" | "admin");
            console.log(`[Auth] Applied pending assignment: ${userEmail} -> company ${assignment.companyId} as ${assignment.role}`);
            
            // Set active company if user doesn't have one
            if (!profile.activeCompanyId) {
              profile = await storage.setActiveCompany(userId, assignment.companyId) || profile;
            }
          }
          // Remove the pending assignment
          await storage.deletePendingAssignment(assignment.id);
        }
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });
}
