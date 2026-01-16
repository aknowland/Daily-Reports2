import { users, type User, type UpsertUser } from "@shared/models/auth";
import { userProfiles, companyMembers, projectMembers, invites, joinRequests, companies, dailyReports } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // First check if user exists by id
    if (userData.id) {
      const [existingById] = await db
        .select()
        .from(users)
        .where(eq(users.id, userData.id));
      
      if (existingById) {
        // User with this id exists, update that record
        const [user] = await db
          .update(users)
          .set({
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userData.id))
          .returning();
        return user;
      }
    }

    // Check if user exists by email (for migration from different auth providers)
    if (userData.email) {
      const [existingByEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email));
      
      if (existingByEmail) {
        // User with this email exists but different id - update their id to the new one
        // This handles the case where a user logs in with a new auth provider
        const oldId = existingByEmail.id;
        const newId = userData.id;
        
        // Update all related tables first (before updating user id)
        if (oldId && newId && oldId !== newId) {
          await db.update(userProfiles).set({ userId: newId }).where(eq(userProfiles.userId, oldId));
          await db.update(companyMembers).set({ userId: newId }).where(eq(companyMembers.userId, oldId));
          await db.update(projectMembers).set({ userId: newId }).where(eq(projectMembers.userId, oldId));
          await db.update(invites).set({ invitedBy: newId }).where(eq(invites.invitedBy, oldId));
          await db.update(joinRequests).set({ userId: newId }).where(eq(joinRequests.userId, oldId));
          await db.update(joinRequests).set({ reviewedBy: newId }).where(eq(joinRequests.reviewedBy, oldId));
          await db.update(companies).set({ createdById: newId }).where(eq(companies.createdById, oldId));
          await db.update(dailyReports).set({ inspectorId: newId }).where(eq(dailyReports.inspectorId, oldId));
        }
        
        const [user] = await db
          .update(users)
          .set({
            id: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.email, userData.email))
          .returning();
        return user;
      }
    }

    // Insert new user
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
