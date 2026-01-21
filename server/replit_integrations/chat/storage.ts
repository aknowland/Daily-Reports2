import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: string, userId: string, companyId: string): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(userId: string, companyId: string): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string, userId: string, companyId: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: string, userId: string, companyId: string): Promise<void>;
  getMessagesByConversation(conversationId: string): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: string, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: string, userId: string, companyId: string) {
    const [conversation] = await db.select().from(conversations).where(
      and(
        eq(conversations.id, id),
        eq(conversations.userId, userId),
        eq(conversations.companyId, companyId)
      )
    );
    return conversation;
  },

  async getAllConversations(userId: string, companyId: string) {
    return db.select().from(conversations)
      .where(and(eq(conversations.userId, userId), eq(conversations.companyId, companyId)))
      .orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string, userId: string, companyId: string) {
    const [conversation] = await db.insert(conversations).values({ title, userId, companyId }).returning();
    return conversation;
  },

  async deleteConversation(id: string, userId: string, companyId: string) {
    // First verify the conversation belongs to this user/company
    const conv = await this.getConversation(id, userId, companyId);
    if (conv) {
      await db.delete(messages).where(eq(messages.conversationId, id));
      await db.delete(conversations).where(eq(conversations.id, id));
    }
  },

  async getMessagesByConversation(conversationId: string) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async createMessage(conversationId: string, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },
};
