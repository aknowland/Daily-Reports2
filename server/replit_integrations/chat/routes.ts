import type { Express, Request, Response } from "express";
import OpenAI, { toFile } from "openai";
import { chatStorage } from "./storage";
import { storage } from "../../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Helper to get user info from request
const getUserInfo = (req: any) => {
  const userId = req.user?.claims?.sub;
  return { userId };
};

// Helper to check if user is company admin or higher
const isCompanyAdminOrHigher = async (userId: string, companyId: string) => {
  const profile = await storage.getUserProfile(userId);
  if (!profile) return false;
  
  // System Owner or System Admin - always has access
  if (profile.role === "system_owner" || profile.role === "admin" || profile.role === "owner") {
    return true;
  }
  
  // Check company membership role
  const membership = await storage.getCompanyMember(companyId, userId);
  return membership?.role === "admin";
};

// Gather company context for AI
const getCompanyContext = async (companyId: string) => {
  try {
    const company = await storage.getCompany(companyId);
    if (!company) return "";
    
    // Get company data for context
    const [projects, clients, members, reports] = await Promise.all([
      storage.getProjectsByCompany(companyId),
      storage.getClients(companyId),
      storage.getCompanyMembers(companyId),
      storage.getReports({ companyId }),
    ]);
    
    // Build context summary
    const projectsSummary = projects.slice(0, 20).map((p: any) => 
      `- ${p.name} (${p.status || 'active'})`
    ).join('\n');
    
    const clientsSummary = clients.slice(0, 10).map((c: any) => 
      `- ${c.name}`
    ).join('\n');
    
    const teamSummary = members.slice(0, 15).map((m: any) => 
      `- ${m.user?.firstName || ''} ${m.user?.lastName || ''} (${m.role})`
    ).join('\n');
    
    // Recent reports summary
    const recentReports = reports.slice(0, 10);
    const reportsSummary = recentReports.map((r: any) => 
      `- ${r.date ? new Date(r.date).toLocaleDateString() : 'N/A'}: ${r.project?.name || 'Unknown Project'}`
    ).join('\n');
    
    return `
You are an AI assistant for "${company.name}". You help company administrators with questions about their company data and operations.

COMPANY INFORMATION:
- Name: ${company.name}
- Email: ${company.email || 'Not set'}
- Phone: ${company.phone || 'Not set'}
- Address: ${company.address || 'Not set'}

PROJECTS (${projects.length} total):
${projectsSummary || 'No projects yet'}

CLIENTS (${clients.length} total):
${clientsSummary || 'No clients yet'}

TEAM MEMBERS (${members.length} total):
${teamSummary || 'No team members yet'}

RECENT DAILY REPORTS (${reports.length} total):
${reportsSummary || 'No reports yet'}

GUIDELINES:
- Answer questions about the company's projects, clients, team, and reports
- Be helpful and professional
- If asked about data you don't have, explain what information is available
- You can help with common administrative tasks and provide guidance
- Do not make up data that isn't provided above
`.trim();
  } catch (error) {
    console.error("Error getting company context:", error);
    return "You are an AI assistant helping with company administration.";
  }
};

export function registerChatRoutes(app: Express): void {
  // Get all conversations for user/company
  app.get("/api/ai-chat/conversations", async (req: any, res: Response) => {
    try {
      const { userId } = getUserInfo(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      
      if (!companyId) {
        return res.status(400).json({ error: "No active company selected" });
      }
      
      // Check access
      const hasAccess = await isCompanyAdminOrHigher(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Company Admin access required" });
      }
      
      const conversations = await chatStorage.getAllConversations(userId, companyId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/ai-chat/conversations/:id", async (req: any, res: Response) => {
    try {
      const { userId } = getUserInfo(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      
      if (!companyId) {
        return res.status(400).json({ error: "No active company selected" });
      }
      
      const hasAccess = await isCompanyAdminOrHigher(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Company Admin access required" });
      }
      
      const id = req.params.id;
      const conversation = await chatStorage.getConversation(id, userId, companyId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/ai-chat/conversations", async (req: any, res: Response) => {
    try {
      const { userId } = getUserInfo(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      
      if (!companyId) {
        return res.status(400).json({ error: "No active company selected" });
      }
      
      const hasAccess = await isCompanyAdminOrHigher(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Company Admin access required" });
      }
      
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat", userId, companyId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/ai-chat/conversations/:id", async (req: any, res: Response) => {
    try {
      const { userId } = getUserInfo(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      
      if (!companyId) {
        return res.status(400).json({ error: "No active company selected" });
      }
      
      const hasAccess = await isCompanyAdminOrHigher(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Company Admin access required" });
      }
      
      const id = req.params.id;
      await chatStorage.deleteConversation(id, userId, companyId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/ai-chat/conversations/:id/messages", async (req: any, res: Response) => {
    try {
      const { userId } = getUserInfo(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const profile = await storage.getUserProfile(userId);
      const companyId = profile?.activeCompanyId;
      
      if (!companyId) {
        return res.status(400).json({ error: "No active company selected" });
      }
      
      const hasAccess = await isCompanyAdminOrHigher(userId, companyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Company Admin access required" });
      }
      
      const conversationId = req.params.id;
      const { content } = req.body;
      
      // Verify conversation ownership
      const conversation = await chatStorage.getConversation(conversationId, userId, companyId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      
      // Get company context
      const systemContext = await getCompanyContext(companyId);
      
      const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemContext },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  // Transcribe audio to text
  app.post("/api/ai-chat/transcribe", async (req: Request, res: Response) => {
    try {
      const { userId } = getUserInfo(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const profile = await storage.getUserProfile(userId);
      if (!profile?.activeCompanyId) {
        return res.status(400).json({ error: "No active company" });
      }

      // Check authorization
      const hasAccess = await isCompanyAdminOrHigher(userId, profile.activeCompanyId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { audio, format = "webm" } = req.body;
      if (!audio) {
        return res.status(400).json({ error: "Audio data (base64) is required" });
      }

      const audioBuffer = Buffer.from(audio, "base64");
      const file = await toFile(audioBuffer, `audio.${format}`);
      
      const response = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });

      res.json({ text: response.text });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });
}
