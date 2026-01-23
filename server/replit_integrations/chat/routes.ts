import type { Express, Request, Response } from "express";
import OpenAI, { toFile } from "openai";
import { chatStorage } from "./storage";
import { storage } from "../../storage";
import { isAuthenticated } from "../auth";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// OpenAI function definitions for AI actions
const aiTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_proposal",
      description: "Create a new proposal for inspection services. Use this when the user asks to create, generate, or draft a proposal.",
      parameters: {
        type: "object",
        properties: {
          clientName: {
            type: "string",
            description: "The name of the client company",
          },
          projectName: {
            type: "string", 
            description: "The name of the project",
          },
          projectManager: {
            type: "string",
            description: "The project manager's name (optional)",
          },
          startDate: {
            type: "string",
            description: "Project start date in YYYY-MM-DD format (optional)",
          },
          endDate: {
            type: "string",
            description: "Project end date in YYYY-MM-DD format (optional)",
          },
          totalHours: {
            type: "string",
            description: "Estimated total hours for the project (optional)",
          },
          terms: {
            type: "string",
            description: "Special terms or notes for the proposal (optional)",
          },
          inspectorTitle: {
            type: "string",
            description: "Title/role of the inspector (e.g., 'Special Inspector', 'Senior Inspector')",
          },
          inspectorName: {
            type: "string",
            description: "Name of the assigned inspector (optional)",
          },
          hourlyRate: {
            type: "string",
            description: "Hourly rate for the inspector (e.g., '125' for $125/hour)",
          },
          estimatedHours: {
            type: "string",
            description: "Estimated hours for this inspector's work",
          },
        },
        required: ["clientName", "projectName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_proposals",
      description: "List all proposals for the company. Use when the user asks to see, view, or list proposals.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "List all clients for the company. Use when the user asks about clients or needs to select a client.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "List all projects for the company. Use when the user asks about projects.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// Execute AI function calls
async function executeFunction(
  functionName: string,
  args: any,
  companyId: string,
  userId: string
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (functionName) {
      case "create_proposal": {
        const proposalNumber = await storage.getNextProposalNumber(companyId);
        
        const proposalData = {
          companyId,
          clientName: args.clientName,
          projectName: args.projectName,
          projectManager: args.projectManager || null,
          proposalNumber,
          startDate: args.startDate ? new Date(args.startDate) : null,
          endDate: args.endDate ? new Date(args.endDate) : null,
          totalHours: args.totalHours || null,
          terms: args.terms || null,
          status: "draft" as const,
          createdById: userId,
        };
        
        const proposal = await storage.createProposal(proposalData);
        
        // Create a default option with inspector if rate info provided
        if (args.hourlyRate || args.inspectorTitle) {
          const option = await storage.createProposalOption({
            proposalId: proposal.id,
            optionNumber: 1,
            name: "Standard Option",
          });
          
          await storage.createProposalOptionInspector({
            optionId: option.id,
            title: args.inspectorTitle || "Inspector",
            inspectorName: args.inspectorName || null,
            rate: args.hourlyRate || "0",
            hours: args.estimatedHours || args.totalHours || "0",
            scheduleType: args.scheduleType || "fullTime",
          });
        }
        
        return {
          success: true,
          message: `Created proposal #${proposalNumber} for "${args.projectName}" (${args.clientName}). You can view and edit it in the Proposals section.`,
          data: { proposalId: proposal.id, proposalNumber },
        };
      }
      
      case "list_proposals": {
        const proposals = await storage.getProposals(companyId);
        const summary = proposals.slice(0, 10).map((p: any) => 
          `- #${p.proposalNumber}: ${p.projectName} (${p.clientName}) - ${p.status}`
        ).join('\n');
        return {
          success: true,
          message: proposals.length > 0 
            ? `Found ${proposals.length} proposals:\n${summary}${proposals.length > 10 ? '\n... and more' : ''}`
            : "No proposals found. Would you like me to create one?",
          data: { count: proposals.length },
        };
      }
      
      case "list_clients": {
        const clients = await storage.getClients(companyId);
        const summary = clients.slice(0, 15).map((c: any) => `- ${c.name}`).join('\n');
        return {
          success: true,
          message: clients.length > 0
            ? `Found ${clients.length} clients:\n${summary}${clients.length > 15 ? '\n... and more' : ''}`
            : "No clients found yet.",
          data: { count: clients.length },
        };
      }
      
      case "list_projects": {
        const projects = await storage.getProjectsByCompany(companyId);
        const summary = projects.slice(0, 15).map((p: any) => 
          `- ${p.name} (${p.status || 'active'})`
        ).join('\n');
        return {
          success: true,
          message: projects.length > 0
            ? `Found ${projects.length} projects:\n${summary}${projects.length > 15 ? '\n... and more' : ''}`
            : "No projects found yet.",
          data: { count: projects.length },
        };
      }
      
      default:
        return { success: false, message: `Unknown function: ${functionName}` };
    }
  } catch (error: any) {
    console.error(`Error executing function ${functionName}:`, error);
    return { success: false, message: `Failed to execute action: ${error.message}` };
  }
}

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

CAPABILITIES:
You can perform the following ACTIONS when asked:
- Create proposals for inspection services
- List proposals, clients, and projects

GUIDELINES:
- Answer questions about the company's projects, clients, team, and reports
- Be helpful and professional
- When the user asks you to create or generate something (like a proposal), use the appropriate function to do it
- If asked about data you don't have, explain what information is available
- Do not make up data that isn't provided above
- After performing an action, briefly confirm what was done
`.trim();
  } catch (error) {
    console.error("Error getting company context:", error);
    return "You are an AI assistant helping with company administration.";
  }
};

export function registerChatRoutes(app: Express): void {
  // Get all conversations for user/company
  app.get("/api/ai-chat/conversations", isAuthenticated, async (req: any, res: Response) => {
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
  app.get("/api/ai-chat/conversations/:id", isAuthenticated, async (req: any, res: Response) => {
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
  app.post("/api/ai-chat/conversations", isAuthenticated, async (req: any, res: Response) => {
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
  app.delete("/api/ai-chat/conversations/:id", isAuthenticated, async (req: any, res: Response) => {
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

  // Send message and get AI response (with function calling support)
  app.post("/api/ai-chat/conversations/:id/messages", isAuthenticated, async (req: any, res: Response) => {
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
      
      let chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
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

      // First call: Check if AI wants to use tools (non-streaming)
      const initialResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        tools: aiTools,
        tool_choice: "auto",
        max_completion_tokens: 2048,
      });

      const assistantMessage = initialResponse.choices[0]?.message;
      let fullResponse = "";

      // Check if there are tool calls to execute
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Execute each tool call
        const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];
        
        for (const toolCall of assistantMessage.tool_calls) {
          const tc = toolCall as { id: string; type: string; function: { name: string; arguments: string } };
          const functionName = tc.function.name;
          const args = JSON.parse(tc.function.arguments);
          
          // Send status update to client
          res.write(`data: ${JSON.stringify({ action: `Executing: ${functionName}...` })}\n\n`);
          
          const result = await executeFunction(functionName, args, companyId, userId);
          
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        // Add assistant message with tool calls and tool results to context
        chatMessages.push({
          role: "assistant",
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls,
        });
        chatMessages.push(...toolResults);

        // Get final response after tool execution (streaming)
        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: chatMessages,
          stream: true,
          max_completion_tokens: 2048,
        });

        for await (const chunk of stream) {
          const chunkContent = chunk.choices[0]?.delta?.content || "";
          if (chunkContent) {
            fullResponse += chunkContent;
            res.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
          }
        }
      } else {
        // No tool calls - stream the regular response
        if (assistantMessage?.content) {
          fullResponse = assistantMessage.content;
          // Send content in chunks to simulate streaming
          const words = fullResponse.split(' ');
          for (let i = 0; i < words.length; i += 3) {
            const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            await new Promise(resolve => setTimeout(resolve, 20)); // Small delay for smooth streaming
          }
        }
      }

      // Save assistant message
      if (fullResponse) {
        await chatStorage.createMessage(conversationId, "assistant", fullResponse);
      }

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
  app.post("/api/ai-chat/transcribe", isAuthenticated, async (req: Request, res: Response) => {
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
